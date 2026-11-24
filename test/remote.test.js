// Run with node --test: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../store');
const { loadConfig, createGithubPoller, contentsUrl } = require('../remote');

const TEMPLATE = path.join(__dirname, '..', 'milestones.json');
const CONFIG = { repo: 'me/notes', path: 'milestones.json', branch: 'main', intervalMinutes: 5, token: '' };

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'stone-remote-')); }

function remoteText(project) {
    const s = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
    s.project = project;
    return JSON.stringify(s, null, 2);
}

// A fake GitHub: answers with the given file, honours If-None-Match,
// and can be told to fail.
function fakeGithub() {
    const gh = { text: remoteText('Remote 1'), etag: '"v1"', fail: null, status: 200, requests: [] };
    gh.fetch = async (url, { headers }) => {
        gh.requests.push({ url, headers });
        if (gh.fail) throw new Error(gh.fail);
        const h = new Map([['etag', gh.etag]]);
        const res = { status: gh.status, ok: gh.status < 300, headers: { get: k => h.get(k.toLowerCase()) ?? null }, text: async () => gh.text };
        if (gh.status === 200 && headers['If-None-Match'] === gh.etag) { res.status = 304; res.ok = false; }
        return res;
    };
    gh.change = (project, etag) => { gh.text = remoteText(project); gh.etag = etag; };
    return gh;
}

function setup(config = CONFIG) {
    const dir = tmpDir();
    const dataFile = path.join(dir, 'milestones.json');
    const store = createStore({ dataFile, templateFile: TEMPLATE, log: () => { } });
    store.init();
    const gh = fakeGithub();
    const logs = [];
    const poller = createGithubPoller({ config, dataFile, fetch: gh.fetch, log: m => logs.push(m) });
    return { dir, dataFile, store, gh, poller, logs };
}

test('no config file or local source means local mode', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'config.json');
    assert.strictEqual(loadConfig(file), null);
    fs.writeFileSync(file, JSON.stringify({ source: 'local' }));
    assert.strictEqual(loadConfig(file), null);
});

test('config gets defaults, token can come from the environment', () => {
    const file = path.join(tmpDir(), 'config.json');
    fs.writeFileSync(file, '﻿' + JSON.stringify({ source: 'github', github: { repo: 'me/notes', intervalMinutes: 0.1 } }));
    const cfg = loadConfig(file, { MILESTONE_STONE_GITHUB_TOKEN: 'abc' });
    assert.strictEqual(cfg.path, 'milestones.json');
    assert.strictEqual(cfg.branch, 'main');
    assert.strictEqual(cfg.intervalMinutes, 1);
    assert.strictEqual(cfg.token, 'abc');
    fs.writeFileSync(file, JSON.stringify({ source: 'github', github: { repo: 'not a repo' } }));
    assert.throws(() => loadConfig(file, {}), /owner\/name/);
});

test('contents URL encodes the path and branch', () => {
    const url = contentsUrl({ repo: 'me/notes', path: 'stone data/milestones.json', branch: 'feat/x' });
    assert.strictEqual(url, 'https://api.github.com/repos/me/notes/contents/stone%20data/milestones.json?ref=feat%2Fx');
});

test('a new remote file is written locally and picked up by the store', async () => {
    const { store, poller, gh } = setup();
    assert.strictEqual(await poller.pollOnce(), 'updated');
    assert.strictEqual(store.checkExternalChange(), true);
    assert.strictEqual(store.read().project, 'Remote 1');
    assert.strictEqual(gh.requests[0].headers.Authorization, undefined);
});

test('unchanged remote file costs a 304 and leaves the local file alone', async () => {
    const { store, poller, gh } = setup();
    await poller.pollOnce();
    store.checkExternalChange();
    const s = store.read();
    s.milestones[0].items[0].done = true;
    store.write(s);
    assert.strictEqual(await poller.pollOnce(), 'unchanged');
    assert.strictEqual(gh.requests[1].headers['If-None-Match'], '"v1"');
    assert.strictEqual(store.read().milestones[0].items[0].done, true);
});

test('a changed remote file brings new content but keeps local ticks', async () => {
    const { store, poller, gh, logs } = setup();
    await poller.pollOnce();
    store.checkExternalChange();
    const s = store.read();
    s.milestones[0].items[0].done = true;
    store.write(s);
    gh.change('Remote 2', '"v2"');      // e.g. Claude committed a new plan text
    assert.strictEqual(await poller.pollOnce(), 'updated');
    assert.strictEqual(store.checkExternalChange(), true);
    assert.strictEqual(store.read().project, 'Remote 2');
    assert.strictEqual(store.read().milestones[0].items[0].done, true);
    assert.ok(logs.some(m => m.includes('kept 1 local tick')));
});

test('restarting the widget does not lose local ticks', async () => {
    const { dataFile, store, poller } = setup();
    await poller.pollOnce();
    store.checkExternalChange();
    const s = store.read();
    s.milestones[0].items[1].done = true;
    store.write(s);
    const gh2 = fakeGithub();          // same remote file, fresh poller = restart
    const poller2 = createGithubPoller({ config: CONFIG, dataFile, fetch: gh2.fetch, log: () => { } });
    await poller2.pollOnce();
    assert.strictEqual(JSON.parse(fs.readFileSync(dataFile, 'utf8')).milestones[0].items[1].done, true);
});

test('ticks done in the repository also arrive', async () => {
    const { store, poller, gh } = setup();
    await poller.pollOnce();
    const s = JSON.parse(gh.text);
    s.milestones[0].items[2].done = true;   // e.g. the skill ticked it with a commit
    gh.text = JSON.stringify(s, null, 2); gh.etag = '"v2"';
    assert.strictEqual(await poller.pollOnce(), 'updated');
    store.checkExternalChange();
    assert.strictEqual(store.read().milestones[0].items[2].done, true);
});

test('network error keeps the last state and backs off', async () => {
    const { dataFile, poller, gh, logs } = setup();
    await poller.pollOnce();
    const before = fs.readFileSync(dataFile, 'utf8');
    gh.fail = 'getaddrinfo ENOTFOUND api.github.com';
    assert.strictEqual(await poller.pollOnce(), 'error');
    assert.strictEqual(await poller.pollOnce(), 'error');
    assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), before);
    assert.strictEqual(poller.nextDelay(), 4 * 5 * 60000);
    assert.ok(logs.some(m => m.includes('ENOTFOUND')));
    gh.fail = null;
    await poller.pollOnce();
    assert.strictEqual(poller.nextDelay(), 5 * 60000);
});

test('backoff stops growing at 30 minutes', async () => {
    const { poller, gh } = setup();
    gh.fail = 'offline';
    for (let i = 0; i < 6; i++) await poller.pollOnce();
    assert.strictEqual(poller.nextDelay(), 30 * 60000);
});

test('a broken file on GitHub is not written', async () => {
    const { dataFile, poller, gh, logs } = setup();
    const before = fs.readFileSync(dataFile, 'utf8');
    gh.text = '{ "milestones": [ ';
    assert.strictEqual(await poller.pollOnce(), 'invalid');
    gh.text = JSON.stringify({ milestones: [] });
    gh.etag = '"v2"';
    assert.strictEqual(await poller.pollOnce(), 'invalid');
    assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), before);
    assert.strictEqual(logs.length, 2);
});

test('404 is reported with a hint and the file is kept', async () => {
    const { dataFile, poller, gh, logs } = setup();
    const before = fs.readFileSync(dataFile, 'utf8');
    gh.status = 404;
    assert.strictEqual(await poller.pollOnce(), 'error');
    assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), before);
    assert.ok(logs[0].includes('private repo needs a token'));
});

test('token is sent as a bearer header', async () => {
    const { poller, gh } = setup({ ...CONFIG, token: 'secret' });
    await poller.pollOnce();
    assert.strictEqual(gh.requests[0].headers.Authorization, 'Bearer secret');
});