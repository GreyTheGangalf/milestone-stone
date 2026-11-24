// Milestone Stone — optional GitHub source.
// Pulls milestones.json from a GitHub repository every few minutes and writes
// it over the local state file. The rest of the widget (store.js, the file
// watcher, the UI) works exactly as in local mode.
// Has no Electron dependency, so it can be tested with `node --test`.
const fs = require('fs');
const { parse, atomicWrite } = require('./store');

// Keeps the ticks made on this computer: an item that is done locally stays
// done, even if the repository copy does not have it ticked yet.
// Items are matched by milestone id and item text. Returns the merged state
// and how many ticks were kept.
function keepLocalTicks(remote, local) {
    let kept = 0;
    if (!local || !Array.isArray(local.milestones)) return { state: remote, kept };
    const doneLocally = new Set();
    for (const m of local.milestones) {
        for (const it of m.items || []) if (it && it.done) doneLocally.add(`${m.id}\u0000${it.text}`);
    }
    for (const m of remote.milestones) {
        for (const it of m.items) {
            if (!it.done && doneLocally.has(`${m.id}\u0000${it.text}`)) { it.done = true; it.touched = true; kept++; }
        }
    }
    return { state: remote, kept };
}

const DEFAULTS = { path: 'milestones.json', branch: 'main', intervalMinutes: 5, token: '' };
const MIN_INTERVAL_MINUTES = 1;
const MAX_BACKOFF_MINUTES = 30;
const TIMEOUT_MS = 15000;

// Reads config.json. Returns null when the widget should stay in local mode
// (no config file, or "source" is not "github"). Throws on a broken config so
// the user can see why GitHub mode did not start.
// The token can also come from the MILESTONE_STONE_GITHUB_TOKEN env variable.
function loadConfig(file, env = process.env) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
    const cfg = JSON.parse(text.replace(/^﻿/, ''));
    if (!cfg || cfg.source !== 'github') return null;

    const gh = { ...DEFAULTS, ...(cfg.github || {}) };
    if (typeof gh.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(gh.repo)) {
        throw new Error('github.repo must look like "owner/name"');
    }
    if (typeof gh.path !== 'string' || !gh.path.trim()) throw new Error('github.path is empty');
    if (typeof gh.branch !== 'string' || !gh.branch.trim()) throw new Error('github.branch is empty');
    gh.path = gh.path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    gh.branch = gh.branch.trim();
    const minutes = Number(gh.intervalMinutes);
    gh.intervalMinutes = Number.isFinite(minutes) ? Math.max(MIN_INTERVAL_MINUTES, minutes) : DEFAULTS.intervalMinutes;
    gh.token = env.MILESTONE_STONE_GITHUB_TOKEN || (typeof gh.token === 'string' ? gh.token.trim() : '');
    return gh;
}

function contentsUrl(gh) {
    const filePath = gh.path.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${gh.repo}/contents/${filePath}?ref=${encodeURIComponent(gh.branch)}`;
}

function describeHttpError(res, gh) {
    const s = res.status;
    if (s === 401) return 'GitHub answered 401: the token is wrong or expired';
    if (s === 404) return `GitHub answered 404: check repo "${gh.repo}", path "${gh.path}" and branch "${gh.branch}"`
        + (gh.token ? '' : ' (a private repo needs a token)');
    if (s === 403 || s === 429) return `GitHub answered ${s}: rate limit or missing permission`;
    return `GitHub answered ${s}`;
}

// Polls the file on GitHub.
// - Uses the contents API with ETag, so an unchanged file costs a 304 and no download.
// - Touches the local file only when the remote file has changed since the last
//   poll (or once at startup).
// - Never removes a tick made on this computer: new milestones, items and texts
//   come from the repository, ticks are merged (see keepLocalTicks).
// - Never writes content that does not match the schema.
// - On network or HTTP errors the local file is left alone (the stone keeps the
//   last valid state) and the next try is pushed back, up to 30 minutes.
function createGithubPoller({ config, dataFile, fetch = globalThis.fetch, log = console.warn, onUpdate = () => { }, now = Date.now }) {
    const url = contentsUrl(config);
    let etag = null;
    let lastRemoteText = null;
    let failures = 0;
    let waitUntil = 0;         // set when GitHub says the rate limit is used up
    let timer = null;
    let running = null;
    let stopped = true;

    function readLocal() {
        try { return fs.readFileSync(dataFile, 'utf8'); } catch { return null; }
    }

    function failed(message) {
        failures++;
        log(`[milestone-stone] GitHub pull failed, keeping the last state: ${message}`);
        return 'error';
    }

    // One poll. Resolves to 'updated', 'unchanged', 'invalid' or 'error'.
    async function pollOnce() {
        const headers = {
            Accept: 'application/vnd.github.raw+json',
            'User-Agent': 'milestone-stone',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (etag) headers['If-None-Match'] = etag;
        if (config.token) headers.Authorization = `Bearer ${config.token}`;

        let res;
        try { res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
        catch (e) { return failed(`network error: ${e.message}`); }

        if (res.headers.get('x-ratelimit-remaining') === '0') {
            const reset = Number(res.headers.get('x-ratelimit-reset'));
            if (reset) waitUntil = reset * 1000;
        }
        if (res.status === 304) { failures = 0; return 'unchanged'; }
        if (!res.ok) return failed(describeHttpError(res, config));

        let text;
        try { text = await res.text(); }
        catch (e) { return failed(`download cut off: ${e.message}`); }
        failures = 0;
        etag = res.headers.get('etag');   // a broken file is not downloaded again until it changes

        let remote;
        try { remote = parse(text); }
        catch (e) {
            log(`[milestone-stone] the file on GitHub was not applied, ${e.message}`);
            return 'invalid';
        }
        if (text === lastRemoteText) return 'unchanged';
        lastRemoteText = text;

        const localText = readLocal();
        let local = null;
        try { if (localText !== null) local = parse(localText); } catch { }
        const { state, kept } = keepLocalTicks(remote, local);
        const merged = kept ? JSON.stringify(state, null, 2) : text;
        if (localText === merged) return 'unchanged';
        if (kept) log(`[milestone-stone] kept ${kept} local tick(s) that the GitHub copy does not have yet`);
        atomicWrite(dataFile, merged);
        onUpdate();
        return 'updated';
    }

    function nextDelay() {
        const base = config.intervalMinutes * 60000;
        let delay = failures ? Math.min(base * 2 ** failures, Math.max(base, MAX_BACKOFF_MINUTES * 60000)) : base;
        if (waitUntil > now()) delay = Math.max(delay, waitUntil - now() + 1000);
        return delay;
    }

    async function tick() {
        timer = null;
        if (!running) running = pollOnce().catch(e => failed(e.message)).finally(() => { running = null; });
        await running;
        if (!stopped && !timer) timer = setTimeout(tick, nextDelay());
    }

    return {
        pollOnce,
        nextDelay,
        start() { if (!stopped) return; stopped = false; tick(); },
        // Poll right away (e.g. after the computer wakes from sleep).
        pollNow() { if (stopped) return; clearTimeout(timer); timer = null; tick(); },
        stop() { stopped = true; clearTimeout(timer); timer = null; }
    };
}

module.exports = { loadConfig, createGithubPoller, contentsUrl, keepLocalTicks };