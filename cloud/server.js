/* LabPOS cloud API — VPS deployment (Express + Postgres/SQLite).
   Same REST contract as the local embedded server, plus cloud endpoints:
   health, version/release channel, and the lab registry (heartbeat +
   superadmin-guarded fleet view / targeted rollouts). */
'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');

const VERSION = require('./package.json').version;
const PORT = +(process.env.PORT || 4000);
const BIND = process.env.BIND_HOST || '0.0.0.0';
const ADAPTER = (process.env.DB_ADAPTER || 'pg').toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL || '';
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'labpos-cloud.db');
const SUPERADMIN_KEY = process.env.SUPERADMIN_KEY || '';
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
const LAB_NAME = process.env.LAB_NAME || '';
const RELEASE_BUNDLE_URL = process.env.RELEASE_BUNDLE_URL || '';
const WWW_ROOT = process.env.WWW_ROOT || '';

function readReleases() {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'releases.json'), 'utf8'));
    return {
      latest: r.latest || VERSION,
      minRequired: r.minRequired || VERSION,
      bundleUrl: RELEASE_BUNDLE_URL || r.bundleUrl || '',
      changelog: Array.isArray(r.changelog) ? r.changelog : [],
    };
  } catch (e) {
    return { latest: VERSION, minRequired: VERSION, bundleUrl: RELEASE_BUNDLE_URL, changelog: [] };
  }
}

function requireSuperadmin(req, res, next) {
  if (!SUPERADMIN_KEY) return res.status(500).json({ error: 'SUPERADMIN_KEY not configured on server' });
  const provided = req.get('X-Superadmin-Key') || '';
  /* Accept either the legacy static key or the username/password derived token
     sent by the console ('up:' + sha256('username:password')). The expected
     derived token is stored server-side as SUPERADMIN_LOGIN_TOKEN. */
  const loginToken = (process.env.SUPERADMIN_LOGIN_TOKEN || '').trim();
  if (provided === SUPERADMIN_KEY || (loginToken && provided === loginToken)) return next();
  return res.status(403).json({ error: 'forbidden' });
}

async function main() {
  const mod = ADAPTER === 'pg' ? require('./db-pg') : require('./db-sqlite');
  const { TABLES } = mod;
  const store = await mod.openStore(ADAPTER === 'pg' ? DATABASE_URL : SQLITE_PATH);
  console.log(`[labpos-cloud] storage adapter: ${ADAPTER}`);

  if (await store.isEmpty()) {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      await store.seed(seed);
      console.log('[labpos-cloud] seeded fresh database');
    } catch (e) { console.log('[labpos-cloud] seed skipped:', e.message); }
  }
  /* optional operator branding stamped onto the seeded settings row */
  if (LAB_NAME) {
    try {
      const s = (await store.get('settings', 'main')) || { id: 'main' };
      if (s.labName !== LAB_NAME) {
        await store.put('settings', Object.assign({}, s, { id: 'main', labName: LAB_NAME }));
        console.log('[labpos-cloud] LAB_NAME applied:', LAB_NAME);
      }
    } catch (e) { console.log('[labpos-cloud] LAB_NAME skipped:', e.message); }
  }

  const app = express();
  app.set('trust proxy', true); /* correct req.protocol behind Nginx Proxy Manager */
  app.use(express.json({ limit: '25mb' }));
  app.disable('x-powered-by');

  const okTable = (t) => TABLES.includes(t);

  /* ---- data API (byte-compatible with the local server contract) ---- */
  app.get('/api/dump', async (req, res) => res.json(await store.dump()));
  app.get('/api/tables', (req, res) => res.json(TABLES));
  app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, time: new Date().toISOString() }));
  /* frontend config: tells db.js where the API lives (must precede /:table routes) */
  app.get('/api-config.js', (req, res) => {
    const base = PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
    res.type('application/javascript');
    res.send(`window.LABPOS_API=${JSON.stringify(base)};`);
  });
  /* ---- release channel (polled by the desktop updater + superadmin) ----
     NOTE: specific /api/* routes must be registered BEFORE /api/:table */
  app.get('/api/version', (req, res) => res.json(readReleases()));

  /* ---- lab registry ---- */
  async function getLabs() { return (await store.getMeta('labs')) || {}; }
  app.post('/api/labs/heartbeat', async (req, res) => {
    const { labId, name, version, platform } = req.body || {};
    if (!labId || typeof labId !== 'string') return res.status(400).json({ error: 'labId required' });
    const labs = await getLabs();
    const prev = labs[labId] || {};
    labs[labId] = {
      name: name || prev.name || labId,
      version: version || prev.version || '',
      platform: platform || prev.platform || '',
      targetVersion: prev.targetVersion || null,
      lastSeen: new Date().toISOString(),
    };
    await store.setMeta('labs', labs);
    res.json({ ok: true, targetVersion: labs[labId].targetVersion });
  });
  app.get('/api/labs', requireSuperadmin, async (req, res) => {
    const labs = await getLabs();
    const list = Object.keys(labs).map(id => Object.assign({ labId: id }, labs[id]));
    list.sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
    res.json(list);
  });
  app.post('/api/labs/:id/target', requireSuperadmin, async (req, res) => {
    const id = req.params.id;
    const { version } = req.body || {};
    if (!version || typeof version !== 'string') return res.status(400).json({ error: 'version required' });
    const labs = await getLabs();
    if (!labs[id]) return res.status(404).json({ error: 'unknown lab' });
    labs[id].targetVersion = version;
    await store.setMeta('labs', labs);
    res.json({ ok: true, labId: id, targetVersion: version });
  });

  app.post('/api/restore', async (req, res) => {
    try { await store.restore(req.body); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/:table', async (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    res.json(await store.all(req.params.table));
  });
  app.post('/api/:table', async (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    try { res.json(await store.put(req.params.table, req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put('/api/:table/:id', async (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    res.json(await store.patch(req.params.table, req.params.id, req.body || {}));
  });
  app.delete('/api/:table/:id', async (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    await store.del(req.params.table, req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    const users = await store.all('users');
    const u = users.find(x => x.username === username && x.active !== false);
    if (!u || u.password !== password) return res.status(401).json({ error: 'Invalid username or password' });
    res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role } });
  });
  app.post('/api/admin/reseed', async (req, res) => {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      await store.seed(seed);
      res.json(await store.dump());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ---- installer / update bundles (dashboard "Download App" button) ----
     Drop files like Optix-LAB-MedSync-Setup-1.0.0.exe into ./releases/ on the VPS;
     they are served at <api>/releases/<file>. Set the URL in the app at
     Settings -> Lab Profile -> "Desktop App Download URL". */
  const RELEASES_DIR = path.join(__dirname, 'releases');
  if (!fs.existsSync(RELEASES_DIR)) fs.mkdirSync(RELEASES_DIR, { recursive: true });
  app.use('/releases', express.static(RELEASES_DIR, { dotfiles: 'deny' }));
  console.log('[labpos-cloud] serving installer bundles from', RELEASES_DIR);

  /* ---- landing / optional static frontend ---- */
  if (WWW_ROOT && fs.existsSync(WWW_ROOT)) {
    app.use(express.static(WWW_ROOT, { index: 'index.html' }));
    console.log('[labpos-cloud] serving static frontend from', WWW_ROOT);
  } else {
    app.get('/', (req, res) => res.json({ service: 'labpos-cloud-api', version: VERSION, health: '/api/health', docs: 'API.md' }));
  }

  return new Promise((resolve, reject) => {
    const srv = app.listen(PORT, BIND, () => {
      console.log(`[labpos-cloud] API on http://${BIND}:${PORT} (adapter: ${ADAPTER})`);
      resolve({ srv, store });
    });
    srv.on('error', reject);
  });
}

if (require.main === module) {
  main().catch(e => { console.error('[labpos-cloud] fatal:', e.message); process.exit(1); });
}

module.exports = { main };
