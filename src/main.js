// ============================================================================
//  Anima — main process
//  Creates a frameless, transparent, always-on-top window that floats on the
//  desktop like a companion. Handles the system tray, "ghost mode" click-
//  through, and secure on-disk storage of settings + API keys.
// ============================================================================

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, safeStorage, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

let win = null;
let settingsWin = null;
let tray = null;
let ghost = false; // click-through enabled

// ---------------------------------------------------------------------------
// Config persistence (API keys encrypted at rest when the OS supports it)
// ---------------------------------------------------------------------------
const SECRET_FIELDS = ['anthropicKey', 'openaiKey', 'grokKey', 'elevenLabsKey', 'azureSpeechKey', 'azureApiKey'];

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8'));
    for (const f of SECRET_FIELDS) {
      if (raw[f] && raw[f].__enc && safeStorage.isEncryptionAvailable()) {
        try { raw[f] = safeStorage.decryptString(Buffer.from(raw[f].__enc, 'base64')); }
        catch { raw[f] = ''; }
      } else if (raw[f] && raw[f].__enc) {
        raw[f] = ''; // can't decrypt on this machine
      }
    }
    return raw;
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  const out = { ...cfg };
  for (const f of SECRET_FIELDS) {
    const v = out[f];
    if (v && safeStorage.isEncryptionAvailable()) {
      out[f] = { __enc: safeStorage.encryptString(v).toString('base64') };
    }
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(out, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const w = 440, h = 660;

  win = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + workArea.height - h - 24,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    fullscreenable: false,
    icon: path.join(__dirname, 'assets', 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open external links (e.g. VRoid Studio) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// Settings window — a normal, detached window so you can test expressions and
// gestures live while still watching the companion. It talks to the companion
// window through the main process (see the `companion:command` relay below).
// ---------------------------------------------------------------------------
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const w = 460, h = 760;
  settingsWin = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + 24,
    y: workArea.y + Math.max(0, Math.round((workArea.height - h) / 2)),
    title: 'Anima settings',
    frame: true,
    transparent: false,
    backgroundColor: '#0d0b1a',
    resizable: true,
    minimizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets', 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------------------------------------------------------------------------
// Ghost mode (click-through). When on, the transparent areas let clicks pass
// to whatever is behind the companion; the renderer re-enables interaction
// when the cursor is over the avatar or a panel.
// ---------------------------------------------------------------------------
function setGhost(on) {
  ghost = on;
  if (!win) return;
  if (on) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
  win.webContents.send('ghost:changed', on);
  buildTray();
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function buildTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'))
    .resize({ width: 18, height: 18 });
  if (!tray) tray = new Tray(img);
  tray.setToolTip('Anima — desktop companion');

  const menu = Menu.buildFromTemplate([
    { label: 'Show / Focus', click: () => { win.show(); win.focus(); } },
    { label: 'Hide', click: () => win.hide() },
    { type: 'separator' },
    { label: 'Ghost mode (click-through)', type: 'checkbox', checked: ghost, click: (i) => setGhost(i.checked) },
    { label: 'Open settings', click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit Anima', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.removeAllListeners('click');
  tray.on('click', () => { win.isVisible() ? win.focus() : win.show(); });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('config:get', () => readConfig());
ipcMain.handle('config:set', (_e, cfg) => { writeConfig(cfg); return true; });
ipcMain.on('mouse:setIgnore', (_e, ignore) => {
  if (win && ghost) win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('app:quit', () => { app.isQuiting = true; app.quit(); });
ipcMain.on('app:minimize', () => win && win.hide());
ipcMain.on('ghost:set', (_e, on) => setGhost(on));
ipcMain.on('window:resize', (_e, { width, height }) => {
  if (win) win.setSize(Math.round(width), Math.round(height), false);
});

// Detached settings window + companion command relay.
ipcMain.on('settings:open', () => openSettingsWindow());
ipcMain.on('settings:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close(); });
ipcMain.on('companion:command', (_e, cmd) => {
  if (win && !win.isDestroyed()) win.webContents.send('companion:command', cmd);
});
ipcMain.on('config:broadcast', () => {
  if (win && !win.isDestroyed()) win.webContents.send('config:changed');
});

// ---------------------------------------------------------------------------
// Agent tools (Tier 3 — web). Run here in Node so there's no browser CORS,
// and so the renderer never makes arbitrary cross-origin requests itself.
// ---------------------------------------------------------------------------
function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function toolSearchWeb(query) {
  if (!query) return 'No query provided.';
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await res.text();
    const results = [];
    const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = linkRe.exec(html)) && results.length < 5) {
      let url = m[1];
      const uddg = url.match(/[?&]uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      results.push({ url, title: stripTags(m[2]), snippet: '' });
    }
    const snipRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let s, i = 0;
    while ((s = snipRe.exec(html)) && i < results.length) { results[i].snippet = stripTags(s[1]); i++; }
    if (!results.length) return 'No results found.';
    return results.map((r, idx) =>
      `${idx + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
  } catch (e) {
    return 'Search failed: ' + e.message;
  }
}

async function toolFetchPage(url) {
  if (!/^https?:\/\//i.test(url || '')) return 'Invalid URL (must start with http/https).';
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return text.slice(0, 3000) || '(no readable text found)';
  } catch (e) {
    return 'Fetch failed: ' + e.message;
  }
}

ipcMain.handle('tools:searchWeb', (_e, q) => toolSearchWeb(q));
ipcMain.handle('tools:fetchPage', (_e, u) => toolFetchPage(u));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  buildTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', (e) => { /* keep running in tray */ });
