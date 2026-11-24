// Run with node --test: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createStore, validate } = require('../store');

const TEMPLATE = path.join(__dirname, '..', 'milestones.json');
const STONE = path.join(__dirname, '..', 'skills', 'milestone-stone', 'scripts', 'stone.js');

function tmpStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stone-'));
    const dataFile = path.join(dir, 'milestones.json');
    const store = createStore({ dataFile, templateFile: TEMPLATE, log: () => { } });
    return { dir, dataFile, store };
}

test('example file matches the schema', () => {
    const s = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
    assert.strictEqual(validate(s), null);
    assert.strictEqual(s.schemaVersion, 1);
    for (const m of s.milestones) assert.ok('startedAt' in m);
});

test('starts from the template when the file is missing', () => {
    const { dataFile, store } = tmpStore();
    const s = store.init();
    assert.strictEqual(s.milestones[0].id, 'M0');
    assert.ok(fs.existsSync(dataFile));
});

test('returns last valid state while the file is corrupt, picks up the fixed file', () => {
    const { dataFile, store } = tmpStore();
    store.init();
    fs.writeFileSync(dataFile, '{ "milestones": [ { "id": "M0", ');   // half-written
    assert.strictEqual(store.read().milestones.length, 8);
    assert.strictEqual(store.checkExternalChange(), false);
    const s = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
    s.project = 'Changed';
    fs.writeFileSync(dataFile, JSON.stringify(s));
    assert.strictEqual(store.checkExternalChange(), true);
    assert.strictEqual(store.read().project, 'Changed');
});

test('corrupt file at startup is moved aside and backup is used', () => {
    const { dir, dataFile, store } = tmpStore();
    const s = store.init();
    s.project = 'FromBackup';
    store.write(s);
    fs.writeFileSync(dataFile, 'broken{');
    const store2 = createStore({ dataFile, templateFile: TEMPLATE, log: () => { } });
    assert.strictEqual(store2.init().project, 'FromBackup');
    assert.ok(fs.readdirSync(dir).some(f => f.includes('.corrupt-')));
    assert.strictEqual(JSON.parse(fs.readFileSync(dataFile, 'utf8')).project, 'FromBackup');
});

test('state that does not match the schema is not written', () => {
    const { store } = tmpStore();
    store.init();
    assert.throws(() => store.write({ milestones: [] }));
});

test('own write is not an external change, a skill write right after it is', () => {
    const { dataFile, store } = tmpStore();
    const s = store.init();
    s.milestones[0].items[0].done = true;
    store.write(s);
    assert.strictEqual(store.checkExternalChange(), false);
    execFileSync(process.execPath, [STONE, 'apply', dataFile], { env: { ...process.env, MILESTONE_STONE_FILE: dataFile } });
    assert.strictEqual(store.checkExternalChange(), true);
    assert.strictEqual(store.read().updatedBy, 'skill');
});

test('reads a file saved with a BOM', () => {
    const { dataFile, store } = tmpStore();
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, '\uFEFF' + fs.readFileSync(TEMPLATE, 'utf8'));
    assert.strictEqual(store.init().milestones[0].id, 'M0');
});

test('stone.js refuses to write an invalid file', () => {
    const { dir, dataFile, store } = tmpStore();
    store.init();
    const before = fs.readFileSync(dataFile, 'utf8');
    const bad = path.join(dir, 'bad.json');
    const s = JSON.parse(before);
    s.milestones[1].status = 'active';     // two active milestones
    fs.writeFileSync(bad, JSON.stringify(s));
    assert.throws(() => execFileSync(process.execPath, [STONE, 'apply', bad], { env: { ...process.env, MILESTONE_STONE_FILE: dataFile }, stdio: 'pipe' }));
    assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), before);
});