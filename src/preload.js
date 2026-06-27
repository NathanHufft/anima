// Secure bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anima', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  setMouseIgnore: (ignore) => ipcRenderer.send('mouse:setIgnore', ignore),
  setGhost: (on) => ipcRenderer.send('ghost:set', on),
  onGhostChanged: (cb) => ipcRenderer.on('ghost:changed', (_e, on) => cb(on)),

  // detached settings window
  openSettings: () => ipcRenderer.send('settings:open'),
  closeSettings: () => ipcRenderer.send('settings:close'),

  // settings → companion live commands (expression/gesture/loadVRM/testVoice)
  sendCommand: (cmd) => ipcRenderer.send('companion:command', cmd),
  onCommand: (cb) => ipcRenderer.on('companion:command', (_e, cmd) => cb(cmd)),

  // settings → companion: re-apply config after a save
  broadcastConfig: () => ipcRenderer.send('config:broadcast'),
  onConfigChanged: (cb) => ipcRenderer.on('config:changed', () => cb()),

  resizeWindow: (width, height) => ipcRenderer.send('window:resize', { width, height }),
  minimize: () => ipcRenderer.send('app:minimize'),
  quit: () => ipcRenderer.send('app:quit'),

  // agent tools (run in the main process to avoid browser CORS)
  searchWeb: (query) => ipcRenderer.invoke('tools:searchWeb', query),
  fetchPage: (url) => ipcRenderer.invoke('tools:fetchPage', url),

  // agent tools (Tier 4 — system: files / apps / shell / timers)
  fsWorkspace: () => ipcRenderer.invoke('fs:workspace'),
  fsOpenWorkspace: () => ipcRenderer.invoke('fs:openWorkspace'),
  fsList: (p) => ipcRenderer.invoke('fs:list', p),
  fsRead: (p) => ipcRenderer.invoke('fs:read', p),
  fsWrite: (p, content) => ipcRenderer.invoke('fs:write', { path: p, content }),
  fsTrash: (p) => ipcRenderer.invoke('fs:trash', p),
  openPath: (t) => ipcRenderer.invoke('os:openPath', t),
  runCommand: (c) => ipcRenderer.invoke('os:run', c),
  setTimer: (seconds, label) => ipcRenderer.invoke('os:timer', { seconds, label }),
  onTimer: (cb) => ipcRenderer.on('companion:timer', (_e, d) => cb(d))
});
