// node --test ile çalışır: npm test
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
  const store = createStore({ dataFile, templateFile: TEMPLATE, log: () => {} });
  return { dir, dataFile, store };
}

test('örnek dosya şemaya uyuyor', () => {
  const s = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  assert.strictEqual(validate(s), null);
  assert.strictEqual(s.schemaVersion, 1);
  for (const m of s.milestones) assert.ok('startedAt' in m);
});

test('dosya yoksa şablondan başlar', () => {
  const { dataFile, store } = tmpStore();
  const s = store.init();
  assert.strictEqual(s.milestones[0].id, 'M0');
  assert.ok(fs.existsSync(dataFile));
});

test('çalışırken dosya bozulursa son geçerli durum döner, düzelince yeni durum gelir', () => {
  const { dataFile, store } = tmpStore();
  store.init();
  fs.writeFileSync(dataFile, '{ "milestones": [ { "id": "M0", ');   // yarım yazım
  assert.strictEqual(store.read().milestones.length, 8);
  assert.strictEqual(store.checkExternalChange(), false);
  const s = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  s.project = 'Değişti';
  fs.writeFileSync(dataFile, JSON.stringify(s));
  assert.strictEqual(store.checkExternalChange(), true);
  assert.strictEqual(store.read().project, 'Değişti');
});

test('açılışta bozuk dosya kenara alınır, yedekten devam edilir', () => {
  const { dir, dataFile, store } = tmpStore();
  const s = store.init();
  s.project = 'Yedekteki';
  store.write(s);
  fs.writeFileSync(dataFile, 'bozuk{');
  const store2 = createStore({ dataFile, templateFile: TEMPLATE, log: () => {} });
  assert.strictEqual(store2.init().project, 'Yedekteki');
  assert.ok(fs.readdirSync(dir).some(f => f.includes('.bozuk-')));
  assert.strictEqual(JSON.parse(fs.readFileSync(dataFile, 'utf8')).project, 'Yedekteki');
});

test('şemaya uymayan durum yazılmaz', () => {
  const { store } = tmpStore();
  store.init();
  assert.throws(() => store.write({ milestones: [] }));
});

test("widget'ın kendi yazdığı dış değişiklik sayılmaz, hemen ardından gelen skill yazımı sayılır", () => {
  const { dataFile, store } = tmpStore();
  const s = store.init();
  s.milestones[0].items[0].done = true;
  store.write(s);
  assert.strictEqual(store.checkExternalChange(), false);
  execFileSync(process.execPath, [STONE, 'apply', dataFile], { env: { ...process.env, MILESTONE_STONE_FILE: dataFile } });
  assert.strictEqual(store.checkExternalChange(), true);
  assert.strictEqual(store.read().updatedBy, 'skill');
});

test('BOM ile kaydedilmiş dosya okunur', () => {
  const { dataFile, store } = tmpStore();
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, '﻿' + fs.readFileSync(TEMPLATE, 'utf8'));
  assert.strictEqual(store.init().milestones[0].id, 'M0');
});

test('stone.js geçersiz dosyayı yazmaz', () => {
  const { dir, dataFile, store } = tmpStore();
  store.init();
  const before = fs.readFileSync(dataFile, 'utf8');
  const bad = path.join(dir, 'kotu.json');
  const s = JSON.parse(before);
  s.milestones[1].status = 'active';     // iki aktif milestone
  fs.writeFileSync(bad, JSON.stringify(s));
  assert.throws(() => execFileSync(process.execPath, [STONE, 'apply', bad], { env: { ...process.env, MILESTONE_STONE_FILE: dataFile }, stdio: 'pipe' }));
  assert.strictEqual(fs.readFileSync(dataFile, 'utf8'), before);
});
