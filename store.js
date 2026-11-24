// Milestone Stone — reads and writes the state file safely.
// Has no Electron dependency, so it can be tested with `node --test`.
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const STATUSES = ['pending', 'active', 'paused', 'done'];

// Checks that the state roughly matches the schema.
// Returns an error message, or null when the state is valid.
function validate(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return 'root is not an object';
    if (!Array.isArray(state.milestones) || state.milestones.length === 0) return 'milestones is empty or not an array';
    for (const [i, m] of state.milestones.entries()) {
        if (!m || typeof m !== 'object') return `milestones[${i}] is not an object`;
        if (typeof m.id !== 'string' || !m.id) return `milestones[${i}].id is missing`;
        if (!STATUSES.includes(m.status)) return `milestones[${i}].status is invalid: ${m.status}`;
        if (!Array.isArray(m.items)) return `milestones[${i}].items is not an array`;
        for (const [j, it] of m.items.entries()) {
            if (!it || typeof it.text !== 'string') return `milestones[${i}].items[${j}].text is missing`;
        }
    }
    if (state.current !== undefined && !Number.isInteger(state.current)) return 'current is not an integer';
    return null;
}

// Fills in missing but harmless fields that the UI relies on.
function normalize(state) {
    state.schemaVersion = state.schemaVersion || SCHEMA_VERSION;
    state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    if (!Number.isInteger(state.current) || state.current < 0) state.current = 0;
    if (state.current > state.milestones.length) state.current = state.milestones.length;
    for (const m of state.milestones) {
        if (m.title === undefined) m.title = '';
        if (m.lastProgress === undefined) m.lastProgress = null;
        if (m.startedAt === undefined) m.startedAt = null;
        if (m.doneAt === undefined) m.doneAt = null;
        if (m.retro === undefined) m.retro = '';
        for (const it of m.items) it.done = !!it.done;
    }
    return state;
}

function parse(text) {
    // Strip the BOM that editors like Notepad may add
    const state = JSON.parse(text.replace(/^﻿/, ''));
    const err = validate(state);
    if (err) throw new Error('does not match schema: ' + err);
    return normalize(state);
}

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Write to a temp file first, then rename it over the target, so a reader
// never sees a half-written file. On Windows the rename can fail with
// EPERM/EBUSY while another process (antivirus, an editor) holds the file;
// retry a few times, then fall back to a direct write.
function atomicWrite(file, text) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    for (let attempt = 0; attempt < 5; attempt++) {
        try { fs.renameSync(tmp, file); return; }
        catch (e) {
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch { } throw e; }
            sleepSync(40 * (attempt + 1));
        }
    }
    fs.writeFileSync(file, text, 'utf8');
    try { fs.unlinkSync(tmp); } catch { }
}

function createStore({ dataFile, templateFile, log = console.warn }) {
    const backupFile = dataFile + '.bak';
    let lastGood = null;       // last valid state (object)
    let lastText = null;       // the text we last saw on disk or wrote ourselves

    function readFileText(file) {
        try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
    }

    function keepAside(text) {
        // Keep the corrupt file instead of deleting it, so it can be recovered by hand
        try {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            fs.writeFileSync(`${dataFile}.corrupt-${stamp}`, text, 'utf8');
        } catch { }
    }

    // Startup: if the file is missing, copy the template. If it is corrupt,
    // start from the backup, or from the template when there is no backup.
    function init() {
        fs.mkdirSync(path.dirname(dataFile), { recursive: true });
        const text = readFileText(dataFile);
        if (text !== null) {
            try {
                lastGood = parse(text); lastText = text;
                fs.writeFileSync(backupFile, text, 'utf8');
                return lastGood;
            } catch (e) {
                log(`[milestone-stone] could not read ${dataFile} (${e.message}); moved it aside, opening from backup.`);
                keepAside(text);
            }
        }
        for (const src of [backupFile, templateFile]) {
            const t = readFileText(src);
            if (t === null) continue;
            try {
                lastGood = parse(t);
                lastText = JSON.stringify(lastGood, null, 2);
                atomicWrite(dataFile, lastText);
                return lastGood;
            } catch (e) { log(`[milestone-stone] could not read ${src} either: ${e.message}`); }
        }
        throw new Error('Could not read the state file, its backup or the template.');
    }

    // Returns the current state on disk. If the file is corrupt or half-written
    // right now, returns the last valid state instead of crashing.
    function read() {
        const text = readFileText(dataFile);
        if (text === null || text === lastText) return lastGood;
        try {
            lastGood = parse(text); lastText = text;
            return lastGood;
        } catch (e) {
            log(`[milestone-stone] read failed, using last valid state: ${e.message}`);
            return lastGood;
        }
    }

    function write(state) {
        const err = validate(state);
        if (err) throw new Error('Not saved, does not match schema: ' + err);
        state.updatedAt = new Date().toISOString();
        state.updatedBy = 'widget';
        const text = JSON.stringify(normalize(state), null, 2);
        atomicWrite(dataFile, text);
        lastGood = state; lastText = text;
        try { fs.writeFileSync(backupFile, text, 'utf8'); } catch { }
    }

    // Did the file change, and if so, was it us? Compares content instead of
    // timing: text the widget wrote itself is not an external change, and a real
    // external change right after our own write is not missed.
    // Returns true when there is a new, valid external change.
    function checkExternalChange() {
        const text = readFileText(dataFile);
        if (text === null || text === lastText) return false;
        try {
            lastGood = parse(text); lastText = text;
            try { fs.writeFileSync(backupFile, text, 'utf8'); } catch { }
            return true;
        } catch {
            // May be half-written; check again on the next poll.
            return false;
        }
    }

    return { init, read, write, checkExternalChange };
}

module.exports = { createStore, validate, normalize, parse, atomicWrite, SCHEMA_VERSION };