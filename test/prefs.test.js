// Run with node --test: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SIZES, MIN_SCALE, MAX_SCALE, DEFAULTS, clampScale, sizeName, loadPrefs, savePrefs } = require('../prefs');

function tmpFile() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stone-prefs-')), 'prefs.json');
}

test('missing prefs file gives the defaults', () => {
    assert.deepStrictEqual(loadPrefs(tmpFile()), DEFAULTS);
});

test('broken prefs file gives the defaults and does not throw', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ "scale": ');
    const logs = [];
    assert.deepStrictEqual(loadPrefs(file, m => logs.push(m)), DEFAULTS);
    assert.strictEqual(logs.length, 1);
});

test('scale is kept inside the allowed range', () => {
    assert.strictEqual(clampScale(10), MAX_SCALE);
    assert.strictEqual(clampScale(0.1), MIN_SCALE);
    assert.strictEqual(clampScale('abc'), DEFAULTS.scale);
    assert.strictEqual(clampScale(1.0500000001), 1.05);
});

test('presets are recognised, other scales are custom', () => {
    assert.strictEqual(sizeName(SIZES.small), 'small');
    assert.strictEqual(sizeName(SIZES.large), 'large');
    assert.strictEqual(sizeName(1.15), null);
});

test('save and load round trip, wrong types fall back, unknown keys stay', () => {
    const file = tmpFile();
    savePrefs(file, { scale: 1.3, alwaysOnTop: true, hidden: 'yes', future: 42 });
    const p = loadPrefs(file);
    assert.strictEqual(p.scale, 1.3);
    assert.strictEqual(p.alwaysOnTop, true);
    assert.strictEqual(p.hidden, false);
    assert.strictEqual(p.notifications, true);
    assert.strictEqual(p.future, 42);
});

test('a prefs file with a BOM is read', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '﻿{"scale": 0.75}');
    assert.strictEqual(loadPrefs(file).scale, 0.75);
});