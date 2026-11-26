const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stoneAPI', {
  load: () => ipcRenderer.invoke('load'),
  save: (state) => ipcRenderer.invoke('save', state),
  stats: () => ipcRenderer.invoke('stats'),
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  cardOpen: (open) => ipcRenderer.send('card-open', open),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  onExternalChange: (cb) => ipcRenderer.on('external-change', cb),
  onStatsChanged: (cb) => ipcRenderer.on('stats-changed', cb),
  // Size of the closed stone and whether sealing plays a sound.
  onView: (cb) => ipcRenderer.on('view', (_e, view) => cb(view)),
  // A completion notification was clicked: open the stone on its plan.
  onOpenCard: (cb) => ipcRenderer.on('open-card', cb),
  // "Try the sealing moment" in the tray menu.
  onPlaySeal: (cb) => ipcRenderer.on('play-seal', cb)
});