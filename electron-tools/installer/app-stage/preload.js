/* LabPOS preload — minimal by design.
   The renderer talks to the embedded API over HTTP; no Node access needed.
   Additionally exposes a tiny auto-updater bridge (banner only). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('labposUpdater', {
  onUpdateAvailable: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('labpos:update-available', (_event, info) => { try { cb(info); } catch (e) {} });
  },
  restartToApply: () => ipcRenderer.send('labpos:restart-apply'),
});

function showUpdateBanner(info) {
  if (document.getElementById('labpos-update-banner')) return; /* already shown */
  const bar = document.createElement('div');
  bar.id = 'labpos-update-banner';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;max-width:360px;' +
    'background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid #0d9488;border-radius:12px;' +
    'box-shadow:0 12px 32px rgba(15,30,46,.18);padding:14px 16px;color:#0f172a;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:800;font-size:14px;margin-bottom:4px;';
  title.textContent = 'Update ' + (info.version || '') + ' ready' + (info.forced ? ' (required)' : '');
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:12.5px;color:#64748b;margin-bottom:10px;';
  sub.textContent = (info.changelog || 'A new version was downloaded in the background.').slice(0, 160);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;';
  const restart = document.createElement('button');
  restart.textContent = 'Restart to apply';
  restart.style.cssText = 'flex:1;background:#0d9488;color:#fff;border:none;border-radius:8px;' +
    'padding:9px 12px;font-weight:700;cursor:pointer;font-size:13px;';
  restart.onclick = () => ipcRenderer.send('labpos:restart-apply');
  const later = document.createElement('button');
  later.textContent = 'Later';
  later.style.cssText = 'background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:8px;' +
    'padding:9px 12px;font-weight:600;cursor:pointer;font-size:13px;';
  later.onclick = () => bar.remove();
  row.appendChild(restart);
  row.appendChild(later);
  bar.appendChild(title);
  bar.appendChild(sub);
  bar.appendChild(row);
  document.body.appendChild(bar);
}

window.addEventListener('DOMContentLoaded', () => {
  if (!document.title || document.title === '') document.title = 'LabPOS — Diagnostic Lab';
  ipcRenderer.on('labpos:update-available', (_event, info) => showUpdateBanner(info || {}));
});
