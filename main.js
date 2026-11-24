// Milestone Stone — Windows desktop widget (Electron)
const { app, BrowserWindow, ipcMain, screen, net, powerMonitor, Tray, Menu, Notification, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./store');
const { loadConfig, createGithubPoller } = require('./remote');
const { SIZES, SCALE_STEP, clampScale, sizeName, loadPrefs, savePrefs } = require('./prefs');
const { findNewlyCompleted, completionMessage, progressSummary } = require('./notify');

// The state file lives in a fixed place so the skill can read and write it too:
// %USERPROFILE%\.milestone-stone\milestones.json
const DATA_DIR = path.join(os.homedir(), '.milestone-stone');
const DATA_FILE = path.join(DATA_DIR, 'milestones.json');
// Optional: %USERPROFILE%\.milestone-stone\config.json switches to GitHub mode.
// Without it the widget works on the local file only. See config.example.json.
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// Window preferences of this computer (size, always on top, hidden, notifications).
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json');

const ICON_DIR = path.join(__dirname, 'assets');
const TRAY_ICON = path.join(ICON_DIR, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const NOTIFY_ICON = path.join(ICON_DIR, 'icon.png');

// Window size at 100%. The page is zoomed by the same factor, so the stone
// keeps its proportions at every size.
const BASE_W = 340, BASE_H = 500, MARGIN = 8;

const store = createStore({
  dataFile: DATA_FILE,
  templateFile: path.join(__dirname, 'milestones.json')
});

let win = null;
let tray = null;
let poller = null;
let prefs = null;
let lastSeen = null;               // copy of the state we last showed, to spot new completions
const liveNotifications = new Set(); // keeps notifications alive so their click handler works

// Only one stone at a time. Starting it again (for example by hand after it
// started with Windows) shows the running stone instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showStone);
  app.whenReady().then(start);
}

function snapshot(state) {
  return state ? JSON.parse(JSON.stringify(state)) : null;
}

function start() {
  // Windows shows notifications only for an app with an AppUserModelID.
  // While developing (npm start) the app is electron.exe itself.
  app.setAppUserModelId(app.isPackaged ? 'com.greythegangalf.milestone-stone' : process.execPath);
  // No default menu: its Ctrl + / Ctrl - shortcuts would zoom the page
  // without resizing the window.
  Menu.setApplicationMenu(null);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  prefs = loadPrefs(PREFS_FILE);
  lastSeen = snapshot(store.init());

  createWindow();
  createTray();
  startGithubSource();

  // Refresh the stone when the file changes from outside (e.g. the skill).
  // The store filters out the widget's own writes and half-written/corrupt files.
  fs.watchFile(DATA_FILE, { interval: 1000 }, () => {
    if (store.checkExternalChange()) externalChange();
  });
}

function createWindow() {
  const b = windowBounds(prefs.scale);
  win = new BrowserWindow({
    ...b,
    show: false,
    transparent: true, frame: false, resizable: false,
    skipTaskbar: true, hasShadow: false, focusable: true,
    alwaysOnTop: prefs.alwaysOnTop,
    icon: NOTIFY_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(prefs.scale));
  win.once('ready-to-show', () => { if (!prefs.hidden) win.showInactive(); });

  // Ctrl + mouse wheel over the stone: fine size adjustment.
  win.webContents.on('zoom-changed', (_e, direction) => {
    setScale(prefs.scale + (direction === 'in' ? SCALE_STEP : -SCALE_STEP));
  });

  // Keep the stone if the window is closed some other way (e.g. Alt+F4): hide it to the tray.
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); hideStone(); }
  });
}

// The window sits in the bottom right corner of the primary screen.
function windowBounds(scale) {
  const width = Math.round(BASE_W * scale), height = Math.round(BASE_H * scale);
  const { x, y, width: aw, height: ah } = screen.getPrimaryDisplay().workArea;
  return { x: x + aw - width - MARGIN, y: y + ah - height - MARGIN, width, height };
}

function setScale(value) {
  const scale = clampScale(value);
  if (scale === prefs.scale) return;
  prefs.scale = scale;
  if (win && !win.isDestroyed()) {
    win.setBounds(windowBounds(scale));
    win.webContents.setZoomFactor(scale);
  }
  updatePrefs();
}

function updatePrefs() {
  try { savePrefs(PREFS_FILE, prefs); }
  catch (e) { console.warn(`[milestone-stone] could not save ${PREFS_FILE}: ${e.message}`); }
  updateTrayMenu();
}

function showStone() {
  if (!win || win.isDestroyed()) return;
  win.show();
  win.moveTop();   // bring it to the front once, even when it is not "always on top"
  if (prefs.hidden) { prefs.hidden = false; updatePrefs(); }
}

function hideStone() {
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (!prefs.hidden) { prefs.hidden = true; updatePrefs(); }
}

function setAlwaysOnTop(on) {
  prefs.alwaysOnTop = on;
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(on);
  updatePrefs();
}

// --- Start with Windows ------------------------------------------------------
// While developing, Windows has to start electron.exe with this folder as the
// app; the packaged .exe needs no arguments.
function loginItemOptions() {
  return app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(app.getAppPath())] };
}
function opensAtLogin() {
  try { return app.getLoginItemSettings(loginItemOptions()).openAtLogin; } catch { return false; }
}
function setOpenAtLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...loginItemOptions() });
  updateTrayMenu();
}

// --- Tray (the hidden icons next to the clock) ---------------------------------
// Windows shows an empty slot when the tray image cannot be read, so fall back
// to the PNG (scaled to tray size) if the .ico is missing or unreadable.
function trayImage() {
  let img = nativeImage.createFromPath(TRAY_ICON);
  if (img.isEmpty()) {
    console.warn(`[milestone-stone] could not read tray icon ${TRAY_ICON}, using ${NOTIFY_ICON}`);
    img = nativeImage.createFromPath(NOTIFY_ICON);
    if (!img.isEmpty()) img = img.resize({ width: 16, height: 16, quality: 'best' });
  }
  if (img.isEmpty()) console.warn(`[milestone-stone] no tray icon found in ${ICON_DIR}`);
  return img;
}

function createTray() {
  tray = new Tray(trayImage());
  // Left click always brings the stone to the front (it may be behind windows).
  // Hiding is in the menu and on the stone itself.
  tray.on('click', showStone);
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = !prefs.hidden;
  const current = sizeName(prefs.scale);
  const sizeItem = (name, label) => ({
    label: `${label} (%${Math.round(SIZES[name] * 100)})`, type: 'radio', checked: current === name,
    click: () => setScale(SIZES[name])
  });
  const sizeMenu = [sizeItem('small', 'Küçük'), sizeItem('medium', 'Orta'), sizeItem('large', 'Büyük')];
  if (!current) sizeMenu.push({ label: `Özel (%${Math.round(prefs.scale * 100)})`, type: 'radio', checked: true, enabled: false });
  sizeMenu.push({ type: 'separator' }, { label: 'İnce ayar: taşın üstünde Ctrl + fare tekerleği', enabled: false });

  const template = [
    { label: visible ? 'Taşı gizle' : 'Taşı göster', click: () => (visible ? hideStone() : showStone()) },
    { label: 'Boyut', submenu: sizeMenu },
    { label: 'Her zaman üstte tut', type: 'checkbox', checked: prefs.alwaysOnTop, click: (i) => setAlwaysOnTop(i.checked) },
    { label: 'Windows açılınca başlat', type: 'checkbox', checked: opensAtLogin(), click: (i) => setOpenAtLogin(i.checked) },
    { type: 'separator' },
    {
      label: 'Tamamlanınca bildirim gönder', type: 'checkbox', checked: prefs.notifications,
      click: (i) => { prefs.notifications = i.checked; updatePrefs(); }
    },
    { label: 'Bildirimi dene', click: () => showCompletion(sampleMilestone(), true) }
  ];
  if (poller) template.push({ label: "GitHub'dan şimdi çek", click: () => poller.pollNow() });
  template.push({ type: 'separator' }, { label: 'Taşı kapat', click: quit });

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(progressSummary(store.read()));
}

function quit() {
  app.isQuitting = true;
  app.quit();
}

// --- Completion notifications ----------------------------------------------
// Called whenever the state file changed from outside (the skill, a hand edit,
// or a pull from GitHub). Ticks made on the stone itself do not notify: the
// user is looking at the stone then and the seal button shows up anyway.
function externalChange() {
  notifyRenderer('external-change');
  const state = store.read();
  if (prefs.notifications) {
    for (const m of findNewlyCompleted(lastSeen, state)) showCompletion(m);
  }
  lastSeen = snapshot(state);
  updateTrayMenu();
}

function sampleMilestone() {
  const state = store.read();
  return (state && state.milestones[state.current]) || { id: 'M0', title: '' };
}

function showCompletion(m, force = false) {
  if (!Notification.isSupported()) { console.warn('[milestone-stone] notifications are not supported here'); return; }
  if (!force && !prefs.notifications) return;
  const { title, body } = completionMessage(m);
  const n = new Notification({ title, body, icon: NOTIFY_ICON, silent: false });
  liveNotifications.add(n);
  const release = () => liveNotifications.delete(n);
  n.on('click', () => { showStone(); notifyRenderer('open-card'); release(); });
  n.on('close', release);
  n.on('failed', (_e, err) => { console.warn(`[milestone-stone] notification failed: ${err}`); release(); });
  n.show();
}

// GitHub mode: pull the file from a repository every few minutes and write it
// over the local file. The local file stays the cache, so on a network error
// or offline start the stone shows the last state it had.
// A private repository needs a token in config.json (see README).
function startGithubSource() {
  let config;
  try { config = loadConfig(CONFIG_FILE); }
  catch (e) { console.warn(`[milestone-stone] ${CONFIG_FILE} ignored, staying in local mode: ${e.message}`); return; }
  if (!config) return;

  poller = createGithubPoller({
    config,
    dataFile: DATA_FILE,
    fetch: net.fetch,   // Chromium's network stack: follows the Windows proxy settings
    onUpdate: () => { if (store.checkExternalChange()) externalChange(); }
  });
  poller.start();
  powerMonitor.on('resume', () => poller.pollNow());
  updateTrayMenu();
  console.log(`[milestone-stone] GitHub mode: ${config.repo}/${config.path} (${config.branch}), every ${config.intervalMinutes} min`
    + (config.token ? ', with token' : ''));
}

function notifyRenderer(channel) {
  if (win && !win.isDestroyed()) win.webContents.send(channel);
}

ipcMain.handle('load', () => store.read());
ipcMain.handle('save', (_e, state) => {
  // If the skill wrote the file and the widget has not loaded it yet, do not
  // overwrite the skill's change with stale state: refresh the stone first.
  if (store.checkExternalChange()) { externalChange(); return { ok: false, reason: 'conflict' }; }
  try {
    store.write(state);
    lastSeen = snapshot(state);
    updateTrayMenu();
    return { ok: true };
  }
  catch (e) { console.warn('[milestone-stone]', e.message); return { ok: false, reason: e.message }; }
});
ipcMain.on('set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('hide', hideStone);
ipcMain.on('quit', quit);

// The tray keeps the app running while the stone is hidden.
app.on('window-all-closed', () => { });
app.on('before-quit', () => {
  app.isQuitting = true;
  if (poller) poller.stop();
  fs.unwatchFile(DATA_FILE);
});
