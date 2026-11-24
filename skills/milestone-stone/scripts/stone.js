#!/usr/bin/env node
// Milestone Stone skill helper. No dependencies, Node only.
//
//   node stone.js path              print the state file path
//   node stone.js show              validate the file and print a short summary
//   node stone.js cat               print the file as is
//   node stone.js apply <new.json>  validate new.json, set updatedAt/updatedBy
//                                   and write it atomically to the state file
//
// Set MILESTONE_STONE_FILE to use a different file.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = process.env.MILESTONE_STONE_FILE
    || path.join(os.homedir(), '.milestone-stone', 'milestones.json');
const STATUSES = ['pending', 'active', 'paused', 'done'];

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }

function validate(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return 'root is not an object';
    if (!Array.isArray(s.milestones) || !s.milestones.length) return 'milestones is empty or not an array';
    let open = 0;
    for (const [i, m] of s.milestones.entries()) {
        if (!m || typeof m.id !== 'string' || !/^M\d+$/.test(m.id)) return `milestones[${i}].id must look like "M<number>"`;
        if (typeof m.title !== 'string') return `${m.id}.title is missing`;
        if (!STATUSES.includes(m.status)) return `${m.id}.status is invalid: ${m.status}`;
        if (!Array.isArray(m.items)) return `${m.id}.items is not an array`;
        for (const [j, it] of m.items.entries()) {
            if (!it || typeof it.text !== 'string' || typeof it.done !== 'boolean') return `${m.id}.items[${j}] must be { text, done }`;
        }
        if (m.status === 'done' && !m.doneAt) return `${m.id} is sealed but has no doneAt`;
        if (m.status === 'active' || m.status === 'paused') open++;
    }
    if (open > 1) return 'more than one milestone is active/paused';
    if (s.current !== undefined && (!Number.isInteger(s.current) || s.current < 0 || s.current > s.milestones.length)) return 'current is out of range';
    const ids = s.milestones.map(m => m.id);
    if (new Set(ids).size !== ids.length) return 'duplicate milestone id';
    return null;
}

function readJson(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { fail(`could not read ${file}`); }
    try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) { fail(`${file} is not valid JSON: ${e.message}`); }
}

function atomicWrite(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    for (let i = 0; i < 5; i++) {
        try { fs.renameSync(tmp, file); return; }
        catch (e) {
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1));
        }
    }
    fs.writeFileSync(file, text, 'utf8');
    try { fs.unlinkSync(tmp); } catch { }
}

function summary(s) {
    const lines = [`Project: ${s.project || '(untitled)'}   file: ${FILE}`];
    s.milestones.forEach((m, i) => {
        const n = m.items.filter(x => x.done).length;
        const mark = i === s.current ? '▶' : ' ';
        lines.push(`${mark} ${m.id} [${m.status}] ${m.title} (${n}/${m.items.length})`);
        if (i === s.current) m.items.forEach(x => lines.push(`     ${x.done ? '+' : '·'} ${x.text}`));
    });
    if (s.current >= s.milestones.length) lines.push('All stones are sealed.');
    return lines.join('\n');
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'path') console.log(FILE);
else if (cmd === 'cat') process.stdout.write(fs.readFileSync(FILE, 'utf8'));
else if (cmd === 'show') {
    const s = readJson(FILE); const err = validate(s);
    if (err) fail('does not match schema: ' + err);
    console.log(summary(s));
} else if (cmd === 'apply') {
    if (!arg) fail('usage: node stone.js apply <new.json>');
    const s = readJson(arg); const err = validate(s);
    if (err) fail('not written, does not match schema: ' + err);
    s.schemaVersion = s.schemaVersion || 1;
    s.updatedAt = new Date().toISOString();
    s.updatedBy = 'skill';
    atomicWrite(FILE, JSON.stringify(s, null, 2) + '\n');
    console.log('Written.\n' + summary(s));
} else {
    fail('commands: path | show | cat | apply <new.json>');
}