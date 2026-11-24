#!/usr/bin/env node
// Milestone Taşı skill yardımcısı. Bağımlılık yok, yalnızca Node.
//
//   node stone.js path              durum dosyasının yolunu yazar
//   node stone.js show              dosyayı doğrulayıp kısa özet yazar
//   node stone.js cat               dosyayı olduğu gibi yazar
//   node stone.js apply <yeni.json> yeni.json'u doğrular, updatedAt/updatedBy
//                                   ekler ve durum dosyasına atomik yazar
//
// MILESTONE_STONE_FILE ortam değişkeni verilirse o dosya kullanılır.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = process.env.MILESTONE_STONE_FILE
  || path.join(os.homedir(), '.milestone-stone', 'milestones.json');
const STATUSES = ['pending', 'active', 'paused', 'done'];

function fail(msg) { console.error('HATA: ' + msg); process.exit(1); }

function validate(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 'kök bir nesne değil';
  if (!Array.isArray(s.milestones) || !s.milestones.length) return 'milestones boş ya da dizi değil';
  let open = 0;
  for (const [i, m] of s.milestones.entries()) {
    if (!m || typeof m.id !== 'string' || !/^M\d+$/.test(m.id)) return `milestones[${i}].id "M<sayı>" olmalı`;
    if (typeof m.title !== 'string') return `${m.id}.title eksik`;
    if (!STATUSES.includes(m.status)) return `${m.id}.status geçersiz: ${m.status}`;
    if (!Array.isArray(m.items)) return `${m.id}.items dizi değil`;
    for (const [j, it] of m.items.entries()) {
      if (!it || typeof it.text !== 'string' || typeof it.done !== 'boolean') return `${m.id}.items[${j}] { text, done } olmalı`;
    }
    if (m.status === 'done' && !m.doneAt) return `${m.id} mühürlü ama doneAt yok`;
    if (m.status === 'active' || m.status === 'paused') open++;
  }
  if (open > 1) return 'aynı anda birden fazla active/paused milestone var';
  if (s.current !== undefined && (!Number.isInteger(s.current) || s.current < 0 || s.current > s.milestones.length)) return 'current aralık dışında';
  const ids = s.milestones.map(m => m.id);
  if (new Set(ids).size !== ids.length) return 'aynı id birden fazla kez geçiyor';
  return null;
}

function readJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { fail(`${file} okunamadı`); }
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) { fail(`${file} geçerli JSON değil: ${e.message}`); }
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
  try { fs.unlinkSync(tmp); } catch {}
}

function summary(s) {
  const lines = [`Proje: ${s.project || '(adsız)'}   dosya: ${FILE}`];
  s.milestones.forEach((m, i) => {
    const n = m.items.filter(x => x.done).length;
    const mark = i === s.current ? '▶' : ' ';
    lines.push(`${mark} ${m.id} [${m.status}] ${m.title} (${n}/${m.items.length})`);
    if (i === s.current) m.items.forEach(x => lines.push(`     ${x.done ? '+' : '·'} ${x.text}`));
  });
  if (s.current >= s.milestones.length) lines.push('Bütün taşlar mühürlendi.');
  return lines.join('\n');
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'path') console.log(FILE);
else if (cmd === 'cat') process.stdout.write(fs.readFileSync(FILE, 'utf8'));
else if (cmd === 'show') {
  const s = readJson(FILE); const err = validate(s);
  if (err) fail('şemaya uymuyor: ' + err);
  console.log(summary(s));
} else if (cmd === 'apply') {
  if (!arg) fail('kullanım: node stone.js apply <yeni.json>');
  const s = readJson(arg); const err = validate(s);
  if (err) fail('yazılmadı, şemaya uymuyor: ' + err);
  s.schemaVersion = s.schemaVersion || 1;
  s.updatedAt = new Date().toISOString();
  s.updatedBy = 'skill';
  atomicWrite(FILE, JSON.stringify(s, null, 2) + '\n');
  console.log('Yazıldı.\n' + summary(s));
} else {
  fail('komut: path | show | cat | apply <yeni.json>');
}
