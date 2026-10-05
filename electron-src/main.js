/* LabPOS Desktop — Electron main process.
   Starts the embedded API+SQLite server, then opens the app window. */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const updater = require('./updater');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let win = null;

async function boot() {
  updater.applyPendingUpdate(); /* swap in any staged update BEFORE the server starts */
  const { start } = require('./server/index.js');
  const dbPath = path.join(app.getPath('userData'), 'labpos.db');

  let started = null;
  let lastErr = null;
  for (let p = 3765; p < 3785; p++) {
    try { started = await start({ port: p, dbPath, wwwRoot: __dirname }); break; }
    catch (e) { lastErr = e; }
  }
  if (!started) {
    console.error('[labpos] could not start local server:', lastErr && lastErr.message);
    app.quit();
    return;
  }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#f6f8fb',
    title: 'LabPOS — Diagnostic Lab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); /* keep prints in-app */
  await win.loadURL(`http://127.0.0.1:${started.port}/index.html`);
  updater.wireWindow(win);        /* health marker + auto-rollback on failed boot */
  updater.startUpdateChecks(win); /* heartbeat + version poll, non-blocking */
  win.on('closed', () => { win = null; });
}

app.whenReady().then(boot);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });

/* Auto-updater: user clicked "Restart to apply" on the update banner. */
ipcMain.on('labpos:restart-apply', () => { app.relaunch(); app.quit(); });
