const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stoneAPI', {
  load: () => ipcRenderer.invoke('load'),
  save: (state) => ipcRenderer.invoke('save', state),
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  onExternalChange: (cb) => ipcRenderer.on('external-change', cb),
  // A completion notification was clicked: open the stone on its plan.
  onOpenCard: (cb) => ipcRenderer.on('open-card', cb)
});