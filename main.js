// Milestone Stone — Windows desktop widget (Electron)
const { app, BrowserWindow, ipcMain, screen, net, powerMonitor } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./store');
const { loadConfig, createGithubPoller } = require('./remote');

// The state file lives in a fixed place so the skill can read and write it too:
// %USERPROFILE%\.milestone-stone\milestones.json
const DATA_DIR = path.join(os.homedir(), '.milestone-stone');
const DATA_FILE = path.join(DATA_DIR, 'milestones.json');
// Optional: %USERPROFILE%\.milestone-stone\config.json switches to GitHub mode.
// Without it the widget works on the local file only. See config.example.json.
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const store = createStore({
  dataFile: DATA_FILE,
  templateFile: path.join(__dirname, 'milestones.json')
});

let win;
let poller = null;

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

  // Refresh the stone when the file changes from outside (e.g. the skill).
  // The store filters out the widget's own writes and half-written/corrupt files.
  fs.watchFile(DATA_FILE, { interval: 1000 }, () => {
    if (store.checkExternalChange()) notifyExternalChange();
  });

  startGithubSource();
}

// GitHub mode: pull the file from a repository every few minutes and write it
// over the local file. The local file stays the cache, so on a network error
// or offline start the stone shows the last state it had.
function startGithubSource() {
  let config;
  try { config = loadConfig(CONFIG_FILE); }
  catch (e) { console.warn(`[milestone-stone] ${CONFIG_FILE} ignored, staying in local mode: ${e.message}`); return; }
  if (!config) return;

  poller = createGithubPoller({
    config,
    dataFile: DATA_FILE,
    fetch: net.fetch,   // Chromium's network stack: follows the Windows proxy settings
    onUpdate: () => { if (store.checkExternalChange()) notifyExternalChange(); }
  });
  poller.start();
  powerMonitor.on('resume', () => poller.pollNow());
  console.log(`[milestone-stone] GitHub mode: ${config.repo}/${config.path} (${config.branch}), every ${config.intervalMinutes} min`);
}

function notifyExternalChange() {
  if (win && !win.isDestroyed()) win.webContents.send('external-change');
}

ipcMain.handle('load', () => store.read());
ipcMain.handle('save', (_e, state) => {
  // If the skill wrote the file and the widget has not loaded it yet, do not
  // overwrite the skill's change with stale state: refresh the stone first.
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
app.on('before-quit', () => { if (poller) poller.stop(); });