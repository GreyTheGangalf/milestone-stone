const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stoneAPI', {
  load: () => ipcRenderer.invoke('load'),
  save: (state) => ipcRenderer.invoke('save', state),
  setIgnore: (ignore) => ipcRenderer.send('set-ignore', ignore),
  quit: () => ipcRenderer.send('quit'),
  onExternalChange: (cb) => ipcRenderer.on('external-change', cb)
});
