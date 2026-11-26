// Milestone Stone — Windows desktop widget (Electron)
const { app, BrowserWindow, ipcMain, screen, net, powerMonitor, Tray, Menu, Notification, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./store');
const { loadConfig, createGithubPoller } = require('./remote');
const { SIZES, SCALE_STEP, clampScale, sizeName, loadPrefs, savePrefs } = require('./prefs');
const { findNewlyCompleted, completionMessage, progressSummary } = require('./notify');
const { localDay, addDay, loadActivity, saveActivity, madeProgress, summary } = require('./stats');

// The state file lives in a fixed place so the skill can read and write it too:
// %USERPROFILE%\.milestone-stone\milestones.json
const DATA_DIR = path.join(os.homedir(), '.milestone-stone');
const DATA_FILE = path.join(DATA_DIR, 'milestones.json');
// Optional: %USERPROFILE%\.milestone-stone\config.json switches to GitHub mode.
// Without it the widget works on the local file only. See config.example.json.
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// Preferences of this computer (size, position, always on top, notifications, sound).
const PREFS_FILE = path.join(DATA_DIR, 'prefs.json');
// Days with progress, for the streak.
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');

const ICON_DIR = path.join(__dirname, 'assets');
const TRAY_ICON = path.join(ICON_DIR, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const NOTIFY_ICON = path.join(ICON_DIR, 'icon.png');

// Window size for the open plan at 100%. The page is zoomed by the same factor.
const BASE_W = 340, BASE_H = 500, MARGIN = 8;
// Size of the closed stone at 100%, from the bottom right corner of the window
// (12 px margin + the stone at 27% of 300 x 450). Used to keep it on screen.
const STONE_W = 12 + 300 * 0.27, STONE_H = 12 + 450 * 0.27;
const CLOSED_SCALE = 0.27;

// The sealing sound plays without a click when the skill seals a stone.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const store = createStore({
  dataFile: DATA_FILE,
  templateFile: path.join(__dirname, 'milestones.json')
});

let win = null;
let tray = null;
let poller = null;
let prefs = null;
let activity = { days: [] };
let lastSeen = null;               // copy of the state we last showed, to spot new completions and ticks
let hidden = false;                // hidden to the tray for this run only
let drag = null;                   // window position when a drag started
let cardOpen = false;
let boundsBeforeOpen = null;       // where the window was before the open plan was moved on screen
let restoreTimer = null;
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
  activity = loadActivity(ACTIVITY_FILE);
  lastSeen = snapshot(store.init());

  createWindow();
  createTray();
  startGithubSource();

  // Right after Windows starts, the screen size and the taskbar may not be
  // settled yet, so the corner moves. Place the stone again when the screen
  // changes, and a few times during the first half minute.
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, placeWindow);
  for (const ms of [2000, 8000, 30000]) setTimeout(placeWindow, ms);
  powerMonitor.on('resume', placeWindow);
  powerMonitor.on('unlock-screen', placeWindow);

  // Refresh the stone when the file changes from outside (e.g. the skill).
  // The store filters out the widget's own writes and half-written/corrupt files.
  fs.watchFile(DATA_FILE, { interval: 1000 }, () => {
    if (store.checkExternalChange()) externalChange();
  });
}

function createWindow() {
  win = new BrowserWindow({
    ...windowBounds(),
    show: false,
    transparent: true, frame: false, resizable: false,
    skipTaskbar: true, hasShadow: false, focusable: true,
    alwaysOnTop: prefs.alwaysOnTop,
    icon: NOTIFY_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => { win.webContents.setZoomFactor(openScale()); sendView(); });
  // The stone always shows when the app starts, even if it was hidden last time.
  win.once('ready-to-show', () => { placeWindow(); win.showInactive(); });

  // Ctrl + mouse wheel over the stone: fine size adjustment.
  win.webContents.on('zoom-changed', (_e, direction) => {
    setScale(prefs.scale + (direction === 'in' ? SCALE_STEP : -SCALE_STEP));
  });

  // Keep the stone if the window is closed some other way (e.g. Alt+F4): hide it to the tray.
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); hideStone(); }
  });
}

// --- Size and position ------------------------------------------------------
// The open plan never gets smaller than 100%, so its text stays readable even
// when the stone itself is small. The window is sized for the open plan; the
// closed stone is shrunk inside the page (see sendView).
function openScale() { return Math.max(1, prefs.scale); }

function sendView() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('view', { closedScale: CLOSED_SCALE * prefs.scale / openScale(), sound: prefs.sound });
}

// The window's bottom right corner is anchored to the bottom right corner of
// the primary screen's work area (the screen without the taskbar), moved by
// the saved position. Anchoring to the corner keeps the stone in the same
// place when the screen size or the taskbar changes.
function windowBounds() {
  const s = openScale();
  const width = Math.round(BASE_W * s), height = Math.round(BASE_H * s);
  const wa = screen.getPrimaryDisplay().workArea;
  const off = prefs.position || { right: MARGIN, bottom: MARGIN };
  return keepStoneOnScreen({ x: wa.x + wa.width - width - off.right, y: wa.y + wa.height - height - off.bottom, width, height });
}

// The window is mostly transparent; only the closed stone in its bottom right
// corner has to stay inside the work area of the screen it is on.
function keepStoneOnScreen(b) {
  const wa = screen.getDisplayMatching(b).workArea;
  const sw = Math.round(STONE_W * prefs.scale), sh = Math.round(STONE_H * prefs.scale);
  const right = Math.min(Math.max(b.x + b.width, wa.x + sw), wa.x + wa.width);
  const bottom = Math.min(Math.max(b.y + b.height, wa.y + sh), wa.y + wa.height);
  return { ...b, x: right - b.width, y: bottom - b.height };
}

// The whole window inside the work area, for the open plan.
function keepWindowOnScreen(b) {
  const wa = screen.getDisplayMatching(b).workArea;
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
  return { ...b, x, y };
}

function placeWindow() {
  if (!win || win.isDestroyed() || drag || cardOpen) return;
  win.setBounds(windowBounds());
}

// Saves where the window is now, as distances from the primary screen's corner.
function rememberPosition(b) {
  const wa = screen.getPrimaryDisplay().workArea;
  prefs.position = { right: wa.x + wa.width - (b.x + b.width), bottom: wa.y + wa.height - (b.y + b.height) };
  updatePrefs();
}

function resetPosition() {
  prefs.position = null;
  updatePrefs();
  placeWindow();
}

function setScale(value) {
  const scale = clampScale(value);
  if (scale === prefs.scale) return;
  prefs.scale = scale;
  if (win && !win.isDestroyed()) {
    if (!cardOpen) win.setBounds(windowBounds());
    win.webContents.setZoomFactor(openScale());
    sendView();
  }
  updatePrefs();
}

// Opening the plan near the top or left edge would push it off screen: move
// the window in for as long as the plan is open, then put it back.
function setCardOpen(open) {
  if (!win || win.isDestroyed()) return;
  clearTimeout(restoreTimer);
  if (open) {
    cardOpen = true;
    const b = win.getBounds();
    const inside = keepWindowOnScreen(b);
    if (inside.x !== b.x || inside.y !== b.y) {
      if (!boundsBeforeOpen) boundsBeforeOpen = b;
      win.setBounds(inside);
    }
  } else {
    // Wait for the closing animation before moving back.
    restoreTimer = setTimeout(() => {
      cardOpen = false;
      if (boundsBeforeOpen) { boundsBeforeOpen = null; placeWindow(); }
    }, 700);
  }
}

function updatePrefs() {
  try { savePrefs(PREFS_FILE, prefs); }
  catch (e) { console.warn(`[milestone-stone] could not save ${PREFS_FILE}: ${e.message}`); }
  updateTrayMenu();
}

function showStone() {
  if (!win || win.isDestroyed()) return;
  hidden = false;
  win.show();
  win.moveTop();   // bring it to the front once, even when it is not "always on top"
  updateTrayMenu();
}

function hideStone() {
  if (!win || win.isDestroyed()) return;
  hidden = true;
  win.hide();
  updateTrayMenu();
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
  const current = sizeName(prefs.scale);
  const sizeItem = (name, label) => ({
    label: `${label} (%${Math.round(SIZES[name] * 100)})`, type: 'radio', checked: current === name,
    click: () => setScale(SIZES[name])
  });
  const sizeMenu = [sizeItem('small', 'Küçük'), sizeItem('medium', 'Orta'), sizeItem('large', 'Büyük')];
  if (!current) sizeMenu.push({ label: `Özel (%${Math.round(prefs.scale * 100)})`, type: 'radio', checked: true, enabled: false });
  sizeMenu.push({ type: 'separator' }, { label: 'İnce ayar: taşın üstünde Ctrl + fare tekerleği', enabled: false });

  const template = [
    { label: hidden ? 'Taşı göster' : 'Taşı gizle', click: () => (hidden ? showStone() : hideStone()) },
    { label: 'Boyut', submenu: sizeMenu },
    { label: 'Köşeye geri al', enabled: !!prefs.position, click: resetPosition },
    { label: 'Her zaman üstte tut', type: 'checkbox', checked: prefs.alwaysOnTop, click: (i) => setAlwaysOnTop(i.checked) },
    { label: 'Windows açılınca başlat', type: 'checkbox', checked: opensAtLogin(), click: (i) => setOpenAtLogin(i.checked) },
    { type: 'separator' },
    {
      label: 'Tamamlanınca bildirim gönder', type: 'checkbox', checked: prefs.notifications,
      click: (i) => { prefs.notifications = i.checked; updatePrefs(); }
    },
    {
      label: 'Mühürlerken ses çal', type: 'checkbox', checked: prefs.sound,
      click: (i) => { prefs.sound = i.checked; updatePrefs(); sendView(); }
    },
    {
      label: 'Dene', submenu: [
        { label: 'Bildirim', click: () => showCompletion(sampleMilestone(), true) },
        { label: 'Mühürleme anı', click: () => { showStone(); notifyRenderer('play-seal'); } }
      ]
    }
  ];
  if (poller) template.push({ label: "GitHub'dan şimdi çek", click: () => poller.pollNow() });
  template.push({ type: 'separator' }, { label: 'Taşı kapat', click: quit });

  tray.setContextMenu(Menu.buildFromTemplate(template));
  const state = store.read();
  const { streak } = summary(state, activity);
  tray.setToolTip(progressSummary(state) + (streak > 1 ? ` · ${streak} gündür ilerliyor` : ''));
}

function quit() {
  app.isQuitting = true;
  app.quit();
}

// --- Streak -------------------------------------------------------------------
// A day counts for the streak when at least one more item is done than before,
// whether the tick came from the stone, the skill or GitHub.
function recordProgress(prev, next) {
  if (!madeProgress(prev, next)) return;
  const today = localDay();
  if (activity.days.includes(today)) return;
  activity = addDay(activity, today);
  try { saveActivity(ACTIVITY_FILE, activity); }
  catch (e) { console.warn(`[milestone-stone] could not save ${ACTIVITY_FILE}: ${e.message}`); }
}

function stateChanged(state) {
  recordProgress(lastSeen, state);
  lastSeen = snapshot(state);
  notifyRenderer('stats-changed');
  updateTrayMenu();
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
  stateChanged(state);
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

function notifyRenderer(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

ipcMain.handle('load', () => store.read());
ipcMain.handle('stats', () => summary(store.read(), activity));
ipcMain.handle('save', (_e, state) => {
  // If the skill wrote the file and the widget has not loaded it yet, do not
  // overwrite the skill's change with stale state: refresh the stone first.
  if (store.checkExternalChange()) { externalChange(); return { ok: false, reason: 'conflict' }; }
  try {
    store.write(state);
    stateChanged(state);
    return { ok: true };
  }
  catch (e) { console.warn('[milestone-stone]', e.message); return { ok: false, reason: e.message }; }
});
ipcMain.on('set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('card-open', (_e, open) => setCardOpen(!!open));

// Dragging the closed stone. The page sends how far the mouse moved since the
// drag started, in screen coordinates; the window follows. setBounds with the
// fixed size keeps the window from growing on screens with different scaling.
ipcMain.on('drag-start', () => {
  if (!win || win.isDestroyed() || cardOpen) return;
  drag = win.getBounds();
});
ipcMain.on('drag-move', (_e, dx, dy) => {
  if (!drag || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  win.setBounds({ ...drag, x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) });
});
ipcMain.on('drag-end', () => {
  if (!drag) return;
  const b = keepStoneOnScreen({ ...win.getBounds(), width: drag.width, height: drag.height });
  drag = null;
  win.setBounds(b);
  rememberPosition(b);
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
