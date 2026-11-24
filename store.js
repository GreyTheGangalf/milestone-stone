// Milestone Taşı — durum dosyasını güvenle okuyan ve yazan katman.
// Electron'a bağımlı değil; böylece `node --test` ile denenebilir.
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const STATUSES = ['pending', 'active', 'paused', 'done'];

// Dosyanın şemaya kabaca uyup uymadığını kontrol eder.
// Hata varsa açıklayıcı bir metin döner, yoksa null.
function validate(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'kök bir nesne değil';
  if (!Array.isArray(state.milestones) || state.milestones.length === 0) return 'milestones boş ya da dizi değil';
  for (const [i, m] of state.milestones.entries()) {
    if (!m || typeof m !== 'object') return `milestones[${i}] nesne değil`;
    if (typeof m.id !== 'string' || !m.id) return `milestones[${i}].id eksik`;
    if (!STATUSES.includes(m.status)) return `milestones[${i}].status geçersiz: ${m.status}`;
    if (!Array.isArray(m.items)) return `milestones[${i}].items dizi değil`;
    for (const [j, it] of m.items.entries()) {
      if (!it || typeof it.text !== 'string') return `milestones[${i}].items[${j}].text eksik`;
    }
  }
  if (state.current !== undefined && !Number.isInteger(state.current)) return 'current tam sayı değil';
  return null;
}

// Eksik ama zararsız alanları tamamlar; arayüz bunlara güveniyor.
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
  // Not Defteri gibi editörlerin eklediği BOM'u at
  const state = JSON.parse(text.replace(/^﻿/, ''));
  const err = validate(state);
  if (err) throw new Error('şemaya uymuyor: ' + err);
  return normalize(state);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Önce geçici dosyaya yaz, sonra adını değiştir. Okuyan taraf hiçbir zaman
// yarım dosya görmez. Windows'ta dosya o an başka bir süreçte (antivirüs,
// editör) açıksa rename EPERM/EBUSY verebilir; birkaç kez dener, olmazsa
// doğrudan yazar.
function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch {} throw e; }
      sleepSync(40 * (attempt + 1));
    }
  }
  fs.writeFileSync(file, text, 'utf8');
  try { fs.unlinkSync(tmp); } catch {}
}

function createStore({ dataFile, templateFile, log = console.warn }) {
  const backupFile = dataFile + '.bak';
  let lastGood = null;       // son geçerli durum (nesne)
  let lastText = null;       // diskte en son gördüğümüz ya da yazdığımız metin

  function readFileText(file) {
    try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
  }

  function keepAside(text) {
    // Bozuk dosyayı silmeden kenara koy ki elle kurtarılabilsin
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(`${dataFile}.bozuk-${stamp}`, text, 'utf8');
    } catch {}
  }

  // İlk açılış: dosya yoksa şablonu kopyala; bozuksa yedekten, o da yoksa
  // şablondan başla. Hiçbir durumda istisna fırlatmaz.
  function init() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const text = readFileText(dataFile);
    if (text !== null) {
      try {
        lastGood = parse(text); lastText = text;
        fs.writeFileSync(backupFile, text, 'utf8');
        return lastGood;
      } catch (e) {
        log(`[milestone-stone] ${dataFile} okunamadı (${e.message}); kenara alınıp yedekten açılıyor.`);
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
      } catch (e) { log(`[milestone-stone] ${src} de okunamadı: ${e.message}`); }
    }
    throw new Error('Ne durum dosyası ne yedek ne de şablon okunabildi.');
  }

  // Diskteki güncel durumu döndürür. Dosya o an bozuk ya da yarımsa
  // son geçerli durumu döndürür, uygulama çökmez.
  function read() {
    const text = readFileText(dataFile);
    if (text === null || text === lastText) return lastGood;
    try {
      lastGood = parse(text); lastText = text;
      return lastGood;
    } catch (e) {
      log(`[milestone-stone] okunamadı, son geçerli durum kullanılıyor: ${e.message}`);
      return lastGood;
    }
  }

  function write(state) {
    const err = validate(state);
    if (err) throw new Error('Kaydedilmedi, şemaya uymuyor: ' + err);
    state.updatedAt = new Date().toISOString();
    state.updatedBy = 'widget';
    const text = JSON.stringify(normalize(state), null, 2);
    atomicWrite(dataFile, text);
    lastGood = state; lastText = text;
    try { fs.writeFileSync(backupFile, text, 'utf8'); } catch {}
  }

  // Dosya değişti mi, değiştiyse kendi yazdığımız şey mi? Zamanlamaya değil
  // içeriğe bakar: widget'ın kendi yazdığı metin dışarıdan değişiklik sayılmaz,
  // 1,5 sn içinde gelen gerçek bir dış değişiklik de kaçırılmaz.
  // Yeni ve geçerli bir dış değişiklik varsa true döner.
  function checkExternalChange() {
    const text = readFileText(dataFile);
    if (text === null || text === lastText) return false;
    try {
      lastGood = parse(text); lastText = text;
      try { fs.writeFileSync(backupFile, text, 'utf8'); } catch {}
      return true;
    } catch {
      // Yarım yazılmış olabilir; bir sonraki yoklamada tekrar bakılır.
      return false;
    }
  }

  return { init, read, write, checkExternalChange, get backupFile() { return backupFile; } };
}

module.exports = { createStore, validate, normalize, parse, atomicWrite, SCHEMA_VERSION };
