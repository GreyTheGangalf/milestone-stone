// Milestone Taşı — Windows masaüstü widget'ı (Electron)
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./store');

// Durum dosyası sabit bir yerde durur ki skill de okuyup yazabilsin:
// %USERPROFILE%\.milestone-stone\milestones.json
const DATA_DIR = path.join(os.homedir(), '.milestone-stone');
const DATA_FILE = path.join(DATA_DIR, 'milestones.json');

const store = createStore({
  dataFile: DATA_FILE,
  templateFile: path.join(__dirname, 'milestones.json')
});

let win;

function createWindow() {
  const settings = store.init().settings || {};
  const W = 340, H = 500, M = 8;
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    width: W, height: H,
    x: x + width - W - M, y: y + height - H - M,
    transparent: true, frame: false, resizable: false,
    skipTaskbar: true, hasShadow: false, focusable: true,
    alwaysOnTop: settings.alwaysOnTop !== false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');

  // Dosya dışarıdan (ör. skill tarafından) değişirse taşı güncelle.
  // Widget'ın kendi yazdığı içerik ve yarım/bozuk dosyalar store tarafından elenir.
  fs.watchFile(DATA_FILE, { interval: 1000 }, () => {
    if (store.checkExternalChange()) notifyExternalChange();
  });
}

function notifyExternalChange() {
  if (win && !win.isDestroyed()) win.webContents.send('external-change');
}

ipcMain.handle('load', () => store.read());
ipcMain.handle('save', (_e, state) => {
  // Skill dosyayı yazdı ama widget bunu henüz yüklemediyse, eski durumla
  // üzerine yazıp skill'in değişikliğini silme: önce taşı yenile.
  if (store.checkExternalChange()) { notifyExternalChange(); return { ok: false, reason: 'conflict' }; }
  try { store.write(state); return { ok: true }; }
  catch (e) { console.warn('[milestone-stone]', e.message); return { ok: false, reason: e.message }; }
});
ipcMain.on('set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('quit', () => app.quit());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
