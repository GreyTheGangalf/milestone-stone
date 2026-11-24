// Milestone Taşı — Windows masaüstü widget'ı (Electron)
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Durum dosyası sabit bir yerde durur ki ileride skill de okuyup yazabilsin:
// %USERPROFILE%\.milestone-stone\milestones.json
const DATA_DIR = path.join(os.homedir(), '.milestone-stone');
const DATA_FILE = path.join(DATA_DIR, 'milestones.json');

function ensureData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'milestones.json'), DATA_FILE);
  }
}
function readState() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }

let win;
let lastWrite = 0;

function createWindow() {
  ensureData();
  const settings = readState().settings || {};
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

  // Dosya dışarıdan (ör. skill tarafından) değişirse taşı güncelle
  fs.watchFile(DATA_FILE, { interval: 1000 }, () => {
    if (Date.now() - lastWrite > 1500 && win && !win.isDestroyed()) win.webContents.send('external-change');
  });
}

ipcMain.handle('load', () => readState());
ipcMain.handle('save', (_e, state) => {
  lastWrite = Date.now();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
});
ipcMain.on('set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('quit', () => app.quit());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
