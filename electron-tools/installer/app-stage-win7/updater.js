/* LabPOS auto-updater — main-process module.
 *
 * Keeps the local Windows app in sync with the cloud server:
 *   - on start (and every N hours) it POSTs a heartbeat to
 *     <cloudUrl>/api/labs/heartbeat and GETs <cloudUrl>/api/version
 *   - if a newer release exists (or the superadmin forced a targetVersion
 *     for this lab), the bundle zip is downloaded, verified and staged
 *   - the staged files are swapped in on the NEXT app restart, with a
 *     backup kept and automatic rollback if the new version fails to boot
 *
 * Update surface is the FRONTEND ONLY (index.html + assets/). The SQLite
 * database file in userData is never touched, moved or deleted.
 *
 * No code signing is assumed; integrity is checked via zip magic bytes,
 * minimum size, expected file layout, and an optional sha256 from the
 * release manifest. Extraction uses PowerShell Expand-Archive on Windows.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');

let electron = null;
try { electron = require('electron'); } catch (e) { electron = null; }

/* ---------- paths (env overrides exist for testing) ---------- */
function appRoot() {
  if (process.env.LABPOS_APP_ROOT) return process.env.LABPOS_APP_ROOT;
  return electron ? electron.app.getAppPath() : process.cwd();
}
function userDataDir() {
  if (process.env.LABPOS_USER_DATA) return process.env.LABPOS_USER_DATA;
  return electron ? electron.app.getPath('userData') : path.join(os.tmpdir(), 'labpos-updater-test');
}
function updatesDir() { return path.join(userDataDir(), 'updates'); }

/* Files a release bundle is allowed to replace. The DB (*.db) lives in
   userData and is NEVER part of an update. */
const UPDATABLE = ['index.html', 'assets'];
/* Files every valid bundle must contain (checked after extraction). */
const BUNDLE_MUST_HAVE = ['index.html', path.join('assets', 'js', 'app.js')];

/* ---------- small utils ---------- */
function log(...args) { console.log('[updater]', ...args); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return null; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function ensureDirs() { fs.mkdirSync(updatesDir(), { recursive: true }); }

function cmpVer(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function normChangelog(c) {
  if (Array.isArray(c)) return c.join('\n');
  return c || '';
}

/* The installed app (app.asar) is read-only, so frontend updates are written to an OVERLAY folder in userData:
     <userData>/frontend/v-<version>/{index.html,assets}   +   <userData>/frontend/current.json = { version }
   The embedded server serves the overlay when it is newer than the bundled UI, else the bundled files. */
function overlayDir() { return path.join(userDataDir(), 'frontend'); }
function overlayPointer() { return readJson(path.join(overlayDir(), 'current.json')); }
function overlayPath(version) { return path.join(overlayDir(), 'v-' + version); }
function overlayValid(version) {
  return !!version && BUNDLE_MUST_HAVE.every((f) => fs.existsSync(path.join(overlayPath(version), f)));
}
function bundledVersion() {
  const v = readJson(path.join(appRoot(), 'version.json'));
  if (v && v.version) return String(v.version);
  const p = readJson(path.join(appRoot(), 'package.json'));
  if (p && p.version) return String(p.version);
  return '1.0.0';
}
/* folder the local server should serve the web UI from */
function frontendRoot() {
  const ptr = overlayPointer();
  if (ptr && ptr.version && cmpVer(ptr.version, bundledVersion()) > 0 && overlayValid(String(ptr.version))) {
    return overlayPath(String(ptr.version));
  }
  return appRoot();
}
function currentVersion() {
  const ptr = overlayPointer();
  if (ptr && ptr.version && cmpVer(ptr.version, bundledVersion()) > 0 && overlayValid(String(ptr.version))) return String(ptr.version);
  return bundledVersion();
}

function getConfig() {
  const file = readJson(path.join(appRoot(), 'cloud.json')) || {};
  return {
    cloudUrl: String(process.env.LABPOS_CLOUD_URL || file.cloudUrl || '').replace(/\/+$/, ''),
    labId: process.env.LABPOS_LAB_ID || file.labId || '',
    labName: process.env.LABPOS_LAB_NAME || file.labName || 'LabPOS Lab',
    checkIntervalHours: Math.max(1, parseInt(file.checkIntervalHours, 10) || 6),
  };
}

/* Stable per-machine lab id, persisted in userData (never wiped by updates). */
function getDeviceId() {
  const f = path.join(userDataDir(), 'device.json');
  const d = readJson(f);
  if (d && d.labId) return d.labId;
  const id = getConfig().labId || ('lab-' + crypto.randomUUID());
  try { writeJson(f, { labId: id }); } catch (e) { /* non-fatal */ }
  return id;
}

/* ---------- http helpers (no extra deps) ---------- */
function fetchJson(url, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const doReq = (u, redirects) => {
      const lib = u.startsWith('https:') ? https : http;
      const req = lib.request(u, {
        method: opts.method || 'GET',
        timeout: opts.timeout || 15000,
        headers: Object.assign({ 'Content-Type': 'application/json', 'User-Agent': 'LabPOS-Updater' }, opts.headers || {}),
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return doReq(new URL(res.headers.location, u).toString(), redirects - 1);
        }
        let body = '';
        res.on('data', (c) => {
          body += c;
          if (body.length > 5 * 1024 * 1024) { req.destroy(); reject(new Error('response too large')); }
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP ' + res.statusCode));
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('bad JSON: ' + e.message)); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (opts.body !== undefined) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
      req.end();
    };
    doReq(url, 5);
  });
}

function downloadFile(url, dest, timeoutMs) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const doGet = (u, redirects) => {
      const lib = u.startsWith('https:') ? https : http;
      const req = lib.get(u, { timeout: timeoutMs || 180000, headers: { 'User-Agent': 'LabPOS-Updater' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return doGet(new URL(res.headers.location, u).toString(), redirects - 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('download HTTP ' + res.statusCode)); }
        const out = fs.createWriteStream(tmp);
        let failed = false;
        const fail = (e) => { if (!failed) { failed = true; try { fs.unlinkSync(tmp); } catch (_) {} reject(e); } };
        res.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => out.close(() => { if (!failed) { fs.renameSync(tmp, dest); resolve(); } }));
        res.pipe(out);
      });
      req.on('timeout', () => req.destroy(new Error('download timeout')));
      req.on('error', reject);
    };
    try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch (e) {}
    doGet(url, 5);
  });
}

/* ---------- bundle verification (unsigned-friendly) ---------- */
function verifyBundle(zipPath, sha256) {
  const st = fs.statSync(zipPath);
  if (!st.isFile() || st.size < 10240) throw new Error('bundle too small (' + st.size + ' bytes)');
  const fd = fs.openSync(zipPath, 'r');
  const magic = Buffer.alloc(4);
  fs.readSync(fd, magic, 0, 4, 0);
  fs.closeSync(fd);
  if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) {
    throw new Error('not a zip file (bad magic bytes)');
  }
  if (sha256) {
    const sum = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
    if (sum.toLowerCase() !== String(sha256).toLowerCase()) throw new Error('sha256 mismatch');
  }
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    const ps = 'Expand-Archive -LiteralPath ' + q(zipPath) + ' -DestinationPath ' + q(destDir) + ' -Force';
    const r = spawnSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('Expand-Archive failed: ' + String(r.stderr || r.stdout || r.error || '').slice(0, 300));
  } else {
    const r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('unzip failed: ' + String(r.stderr || r.error || '').slice(0, 300));
  }
}

/* ---------- staging ---------- */
function stagedDir(version) { return path.join(updatesDir(), 'v-' + version); }
function isStaged(version) {
  const r = readJson(path.join(stagedDir(version), 'ready.json'));
  return !!(r && r.version === version);
}
function newestStaged() {
  ensureDirs();
  let best = null;
  for (const name of fs.readdirSync(updatesDir())) {
    if (!name.startsWith('v-')) continue;
    const r = readJson(path.join(updatesDir(), name, 'ready.json'));
    if (r && r.version && (!best || cmpVer(r.version, best.version) > 0)) {
      best = { version: String(r.version), dir: path.join(updatesDir(), name) };
    }
  }
  return best;
}

async function downloadAndStage(version, bundleUrl, sha256) {
  const dir = stagedDir(version);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, 'bundle.zip');
  await downloadFile(bundleUrl, zipPath);
  verifyBundle(zipPath, sha256);
  const staged = path.join(dir, 'staged');
  extractZip(zipPath, staged);
  for (const must of BUNDLE_MUST_HAVE) {
    if (!fs.existsSync(path.join(staged, must))) {
      throw new Error('bundle missing required file: ' + must);
    }
  }
  writeJson(path.join(dir, 'ready.json'), { version: String(version), at: new Date().toISOString() });
}

/* ---------- health marker + backup + rollback ---------- */
function healthFile() { return path.join(updatesDir(), 'pending-health.json'); }
function readHealth() { return readJson(healthFile()); }
function writeHealth(h) { ensureDirs(); writeJson(healthFile(), h); }
function clearHealth() { try { fs.unlinkSync(healthFile()); } catch (e) {} }
function hasUnhealthyPending() {
  const h = readHealth();
  return !!(h && h.booted === false && !h.rollbackFailed);
}
function markHealthy() {
  const h = readHealth();
  if (h && h.booted === false) {
    writeHealth(Object.assign({}, h, { booted: true, healthyAt: new Date().toISOString() }));
    log('v' + h.version + ' booted OK — update confirmed healthy');
  }
}

function backupCurrent(cur) { /* nothing to copy: rollback just switches the overlay pointer back (see rollback) */ }

function rollback() {
  const h = readHealth();
  try {
    if (h && h.prevVersion && h.prevVersion !== h.version && overlayValid(String(h.prevVersion))) {
      writeJson(path.join(overlayDir(), 'current.json'), { version: String(h.prevVersion) });
      log('rolled back to overlay v' + h.prevVersion);
    } else {
      fs.rmSync(path.join(overlayDir(), 'current.json'), { force: true }); /* back to the UI bundled in the installer */
      log('rolled back to the bundled UI v' + bundledVersion());
    }
    return true;
  } catch (e) {
    log('rollback error: ' + e.message);
    writeHealth(Object.assign({}, h || {}, { rollbackFailed: true }));
    return false;
  }
}

/* Swap a staged update into the app. Called once at startup, BEFORE the
   local server starts. Never touches the database. */
function applyPendingUpdate() {
  ensureDirs();
  const health = readHealth();

  /* Crash recovery: the last update never reported a healthy boot. */
  if (health && health.booted === false && !health.rollbackFailed) {
    log('previous update v' + health.version + ' did not boot — rolling back to v' + health.prevVersion);
    const ok = rollback();
    clearHealth();
    return { rolledBack: ok };
  }
  if (health && health.rollbackFailed) {
    log('previous rollback failed — needs manual attention, continuing with current files');
    clearHealth();
  }

  const cur = currentVersion();
  const staged = newestStaged();
  if (!staged) return { none: true, current: cur };
  if (cmpVer(staged.version, cur) <= 0) {
    log('staged v' + staged.version + ' is not newer than current v' + cur + ' — skipping');
    return { none: true, current: cur };
  }

  try {
    const dst = overlayPath(staged.version);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of UPDATABLE) {
      const src = path.join(staged.dir, 'staged', entry);
      if (!fs.existsSync(src)) { log('staged bundle missing ' + entry + ' — skipping it'); continue; }
      fs.cpSync(src, path.join(dst, entry), { recursive: true });
    }
    if (!overlayValid(staged.version)) throw new Error('staged files incomplete');
    writeJson(path.join(overlayDir(), 'current.json'), { version: staged.version });
    writeHealth({ version: staged.version, prevVersion: cur, booted: false, at: new Date().toISOString() });
    fs.rmSync(staged.dir, { recursive: true, force: true });
    /* keep only the active and the previous overlay */
    for (const n of fs.readdirSync(overlayDir())) {
      if (n.startsWith('v-') && n !== 'v-' + staged.version && n !== 'v-' + cur) fs.rmSync(path.join(overlayDir(), n), { recursive: true, force: true });
    }
    log('update v' + staged.version + ' applied (was v' + cur + ') — health will be verified on boot');
    return { applied: staged.version, previous: cur };
  } catch (e) {
    log('apply failed: ' + e.message + ' — rolling back immediately');
    rollback();
    clearHealth();
    return { failed: e.message };
  }
}

/* ---------- update check (heartbeat + version manifest) ---------- */
async function checkForUpdates() {
  const cfg = getConfig();
  if (!cfg.cloudUrl) { log('cloudUrl not configured — auto-update disabled'); return { disabled: true }; }
  const cur = currentVersion();

  let hb = null;
  try {
    hb = await fetchJson(cfg.cloudUrl + '/api/labs/heartbeat', {
      method: 'POST',
      timeout: 15000,
      body: {
        labId: getDeviceId(),
        name: cfg.labName,
        version: cur,
        platform: process.platform,
        arch: process.arch,
        app: 'labpos-desktop',
      },
    });
  } catch (e) { log('heartbeat failed: ' + e.message + ' (falling back to /api/version)'); }

  let rel = null;
  try { rel = await fetchJson(cfg.cloudUrl + '/api/version', { timeout: 15000 }); }
  catch (e) { log('version check failed: ' + e.message); }

  if ((!hb || hb.ok === false) && !rel) return { unreachable: true, current: cur };

  /* Forced target from the superadmin dashboard wins; otherwise follow latest. */
  const target = (hb && hb.targetVersion) || (rel && rel.latest) || null;
  if (!target || cmpVer(target, cur) <= 0) return { upToDate: true, current: cur };

  const forced = !!((hb && hb.targetVersion && cmpVer(hb.targetVersion, cur) > 0) ||
                   (rel && rel.minRequired && cmpVer(rel.minRequired, cur) > 0));

  if (isStaged(target)) {
    log('v' + target + ' already downloaded — restart to apply');
    return { downloaded: true, version: target, changelog: normChangelog(rel && rel.changelog), forced };
  }

  const bundleUrl = (rel && rel.bundleUrl) || (cfg.cloudUrl + '/releases/labpos-' + target + '.zip');
  log('downloading v' + target + ' from ' + bundleUrl);
  await downloadAndStage(target, bundleUrl, rel && rel.sha256);
  log('v' + target + ' downloaded and verified — restart to apply');
  return { downloaded: true, version: target, changelog: normChangelog(rel && rel.changelog), forced };
}

/* ---------- wiring into the Electron app ---------- */
let checkTimer = null;

function startUpdateChecks(win) {
  const cfg = getConfig();
  if (!cfg.cloudUrl) return;
  const run = () => {
    checkForUpdates()
      .then((r) => {
        if (r && r.downloaded && win && !win.isDestroyed()) {
          win.webContents.send('labpos:update-available', {
            version: r.version,
            changelog: r.changelog || '',
            forced: !!r.forced,
          });
        }
      })
      .catch((e) => log('background check failed: ' + e.message));
  };
  setTimeout(run, 20000); /* first check shortly after start; never blocks boot */
  checkTimer = setInterval(run, cfg.checkIntervalHours * 3600 * 1000);
  if (checkTimer.unref) checkTimer.unref();
}

function wireWindow(win) {
  win.webContents.on('did-finish-load', () => { markHealthy(); });
  win.webContents.on('did-fail-load', () => {
    if (!hasUnhealthyPending()) return;
    log('frontend failed to load after update — rolling back and relaunching');
    const ok = rollback();
    clearHealth();
    /* Only auto-relaunch when the rollback actually restored files;
       otherwise stay on the broken page instead of looping. */
    if (ok && electron) { electron.app.relaunch(); electron.app.quit(); }
  });
}

module.exports = {
  applyPendingUpdate,
  frontendRoot,
  checkForUpdates,
  startUpdateChecks,
  wireWindow,
  markHealthy,
  hasUnhealthyPending,
  rollback,
  verifyBundle,
  currentVersion,
  cmpVer,
  getConfig,
  getDeviceId,
};
