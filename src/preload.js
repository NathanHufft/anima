// Secure bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anima', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  setMouseIgnore: (ignore) => ipcRenderer.send('mouse:setIgnore', ignore),
  setGhost: (on) => ipcRenderer.send('ghost:set', on),
  onGhostChanged: (cb) => ipcRenderer.on('ghost:changed', (_e, on) => cb(on)),
  onOpenSettings: (cb) => ipcRenderer.on('ui:open-settings', () => cb()),

  resizeWindow: (width, height) => ipcRenderer.send('window:resize', { width, height }),
  minimize: () => ipcRenderer.send('app:minimize'),
  quit: () => ipcRenderer.send('app:quit'),

  // agent tools (run in the main process to avoid browser CORS)
  searchWeb: (query) => ipcRenderer.invoke('tools:searchWeb', query),
  fetchPage: (url) => ipcRenderer.invoke('tools:fetchPage', url)
});
