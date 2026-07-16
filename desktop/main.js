'use strict';
/**
 * NEXUS Desktop — Electron main process.
 * Boots the NEXUS backend (using Electron's bundled Node, so the user needs
 * nothing installed) in safe mock mode, then opens the founder cockpit in a
 * native window. Backend is killed cleanly on quit.
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const cp = require('child_process');

let backend = null;
let win = null;
let tray = null;
let BACKEND_PORT = 41420;

const BACKEND_DIR = () =>
  app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, 'backend');

function findFreePort(start) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(start, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(findFreePort(start + 1)));
  });
}

function startBackend() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  // Run server.js as plain Node via Electron's bundled runtime.
  backend = cp.fork(path.join(BACKEND_DIR(), 'server.js'), [], {
    cwd: BACKEND_DIR(),
    env: Object.assign({}, process.env, {
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(BACKEND_PORT),
      NODE_ENV: process.env.NEXUS_ENV || 'development', // safe mock mode by default
      DATA_DIR: dataDir,
      STORE_DRIVER: 'file',
      PAYMENTS_PROVIDER: process.env.PAYMENTS_PROVIDER || 'mock',
      RATE_LIMIT: 'off',
    }),
    silent: false,
  });
  backend.on('exit', (code) => {
    if (code && code !== 0 && win) {
      dialog.showErrorBox('NEXUS backend stopped', 'The engine exited unexpectedly (code ' + code + '). Restart the app.');
    }
  });
}

function waitForHealth(cb, tries) {
  tries = tries || 0;
  http
    .get({ host: '127.0.0.1', port: BACKEND_PORT, path: '/health', timeout: 1500 }, (res) => {
      if (res.statusCode === 200) { res.resume(); return cb(); }
      res.resume(); retry();
    })
    .on('error', retry)
    .on('timeout', retry);
  function retry() {
    if (tries > 60) return cb(new Error('backend did not start'));
    setTimeout(() => waitForHealth(cb, tries + 1), 500);
  }
}

function engineCall(action, cb) {
  http.get({ host: '127.0.0.1', port: BACKEND_PORT, path: '/api/engine/' + action, timeout: 4000 }, (res) => {
    let d = ''; res.on('data', (c) => (d += c));
    res.on('end', () => { let j = {}; try { j = JSON.parse(d); } catch (e) {} cb && cb(j); });
  }).on('error', () => cb && cb(null)).on('timeout', () => cb && cb(null));
}

function refreshTray() {
  if (!tray) return;
  engineCall('status', (s) => {
    const paused = s && s.paused === true;
    const menu = Menu.buildFromTemplate([
      { label: paused ? '● Engine: PAUSED' : '● Engine: RUNNING', enabled: false },
      { type: 'separator' },
      { label: 'Open cockpit', click: () => { if (!win) createWindow(); else { win.show(); win.focus(); } } },
      paused
        ? { label: '▶ Resume engine', click: () => engineCall('resume', () => { refreshTray(); if (win) win.reload(); }) }
        : { label: '⏸ Pause engine', click: () => engineCall('pause', () => { refreshTray(); if (win) win.reload(); }) },
      { type: 'separator' },
      { label: 'Stop NEXUS & quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip('NEXUS — ' + (paused ? 'paused' : 'running'));
  });
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 18, height: 18 });
    tray = new Tray(img);
    tray.on('click', () => { if (!win) createWindow(); else { win.show(); win.focus(); } });
    refreshTray();
  } catch (e) { /* tray optional on some Linux setups */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#211C33',
    title: 'NEXUS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'splash.html'));
  win.once('ready-to-show', () => win.show());

  waitForHealth((err) => {
    if (err) {
      dialog.showErrorBox('NEXUS could not start', String(err.message || err));
      return;
    }
    // Open the founder cockpit directly.
    win.loadURL('http://127.0.0.1:' + BACKEND_PORT + '/#founder');
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

function killBackend() { if (backend && !backend.killed) { try { backend.kill(); } catch (e) {} backend = null; } }

function restartBackend() {
  killBackend();
  setTimeout(() => {
    startBackend();
    waitForHealth((err) => { if (!err && win) win.loadURL('http://127.0.0.1:' + BACKEND_PORT + '/#founder'); });
  }, 600);
}

function buildMenu() {
  const template = [
    { label: 'NEXUS', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Engine', submenu: [
      { label: 'Stop engine', accelerator: 'CmdOrCtrl+.', click: () => { killBackend(); if (win) win.loadFile(path.join(__dirname, 'stopped.html')); } },
      { label: 'Start / restart engine', accelerator: 'CmdOrCtrl+Shift+R', click: () => restartBackend() },
    ] },
    { label: 'View', submenu: [
      { label: 'Cockpit', accelerator: 'CmdOrCtrl+1', click: () => win && win.loadURL('http://127.0.0.1:' + BACKEND_PORT + '/#founder') },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
      { type: 'separator' },
      { role: 'toggleDevTools' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Open in browser', click: () => shell.openExternal('http://127.0.0.1:' + BACKEND_PORT) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Single instance only.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(async () => {
    BACKEND_PORT = await findFreePort(41420);
    startBackend();
    buildMenu();
    createWindow();
    createTray();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('before-quit', killBackend);
app.on('window-all-closed', () => { killBackend(); if (process.platform !== 'darwin') app.quit(); });
process.on('exit', killBackend);
