/* Optix LAB MedSync Desktop — Electron main process.
   Starts the embedded API+SQLite server, then opens the app window. */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let win = null;

async function boot() {
  updater.applyPendingUpdate(); /* swap in any staged update BEFORE the server starts */
  const userData = app.getPath('userData');
  const cfg = updater.getConfig ? updater.getConfig() : {};
  const cloudUrl = String(cfg.cloudUrl || '').replace(/\/+$/, '');
  /* The embedded server is the cloud server running locally on SQLite: the app works fully offline and,
     when cloud.json has a cloudUrl, syncs with the cloud (see server/desktop-sync.js). */
  Object.assign(process.env, {
    DB_ADAPTER: 'sqlite',
    SQLITE_PATH: path.join(userData, 'labpos-sync.db'),
    DATA_DIR: userData,
    BIND_HOST: '127.0.0.1',
    WWW_ROOT: (updater.frontendRoot && updater.frontendRoot()) || __dirname, /* newest UI: downloaded update (userData overlay) or the one bundled in the installer */
    DESKTOP_CLOUD_URL: cloudUrl,
    SUPERADMIN_KEY: '',
  });
  let started = null;
  let lastErr = null;
  const serverPath = require.resolve('./server/server.js');
  for (let p = 3765; p < 3785; p++) {
    process.env.PORT = String(p);
    delete require.cache[serverPath]; /* server.js reads its config at load time */
    try { started = await require('./server/server.js').main(); started.port = p; break; }
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
    title: 'Optix LAB MedSync',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) { try { require('electron').shell.openExternal(url); } catch (e) {} }
    return { action: 'deny' }; /* keep prints and in-app navigation inside */
  });
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
