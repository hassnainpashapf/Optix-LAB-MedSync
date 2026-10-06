/* LabPOS cloud API — VPS deployment (Express + Postgres/SQLite).
   Same REST contract as the local embedded server, plus cloud endpoints:
   health, version/release channel, and the lab registry (heartbeat +
   superadmin-guarded fleet view / targeted rollouts). */
'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
const TOKEN_TTL_MS = (+process.env.TOKEN_TTL_HOURS || 12) * 3600 * 1000;

/* ---- password hashing (scrypt) + stateless signed session tokens ---- */
const PW_PREFIX = 'scrypt$';
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return PW_PREFIX + salt.toString('hex') + '$' + h.toString('hex');
}
function isHashed(v) { return typeof v === 'string' && v.startsWith(PW_PREFIX); }
function verifyPassword(pw, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  if (!isHashed(stored)) { /* legacy plaintext row (upgraded on next successful login) */
    const a = Buffer.from(String(pw)), b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const parts = stored.split('$'); /* scrypt$salt$hash */
  if (parts.length !== 3 || !/^[0-9a-f]+$/.test(parts[1]) || !/^[0-9a-f]+$/.test(parts[2])) return false;
  const want = Buffer.from(parts[2], 'hex');
  const got = crypto.scryptSync(String(pw), Buffer.from(parts[1], 'hex'), want.length);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function signToken(secret, payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}
function readToken(secret, token) {
  if (typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  let got; try { got = Buffer.from(token.slice(i + 1), 'base64url'); } catch (e) { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}

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

  /* ---- auth bootstrap: signing secret, hash legacy plaintext passwords ---- */
  let SESSION_SECRET = process.env.SESSION_SECRET || '';
  if (!SESSION_SECRET) {
    SESSION_SECRET = await store.getMeta('session_secret');
    if (!SESSION_SECRET) { SESSION_SECRET = crypto.randomBytes(48).toString('hex'); await store.setMeta('session_secret', SESSION_SECRET); }
  }
  try {
    const adminPw = process.env.ADMIN_PASSWORD || '';
    for (const u of await store.all('users')) {
      let pw = u.password;
      if (adminPw && u.username === 'admin' && verifyPassword('admin123', pw)) pw = adminPw; /* replace the shipped default */
      if (pw && !isHashed(pw)) await store.put('users', Object.assign({}, u, { password: hashPassword(pw) }));
      else if (pw !== u.password) await store.put('users', Object.assign({}, u, { password: pw }));
    }
  } catch (e) { console.log('[labpos-cloud] password migration skipped:', e.message); }

  const app = express();
  app.set('trust proxy', true); /* correct req.protocol behind Nginx Proxy Manager */
  app.use(express.json({ limit: '25mb' }));
  /* CORS (manual, no extra deps): the static frontend and phone QR scanners
     fetch /api/* and /r/* cross-origin */
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (CORS_ORIGINS.length) {
      if (origin && CORS_ORIGINS.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    } else res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Superadmin-Key, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.disable('x-powered-by');

  const okTable = (t) => TABLES.includes(t);

  /* ---- data API (byte-compatible with the local server contract) ---- */
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


  /* ---- public info + login (the only unauthenticated data-ish endpoints) ---- */
  const stripUser = (u) => { if (!u) return u; const c = Object.assign({}, u); delete c.password; return c; };
  const sanitizeDump = (d) => Object.assign({}, d, { users: (d.users || []).map(stripUser) });
  app.get('/api/public-info', async (req, res) => {
    const st = (await store.get('settings', 'main')) || {};
    res.json({ labName: st.labName || '', tagline: st.tagline || '', logo: st.logo || '' });
  });
  const fails = new Map(); /* ip|username -> {n, until} */
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'username and password required' });
    const fk = req.ip + '|' + username.toLowerCase();
    const f = fails.get(fk);
    if (f && f.n >= 8 && f.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    const u = (await store.all('users')).find(x => x.username === username && x.active !== false);
    if (!u || !verifyPassword(password, u.password)) {
      const n = ((f && f.until > Date.now()) ? f.n : 0) + 1;
      fails.set(fk, { n, until: Date.now() + 15 * 60 * 1000 });
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    fails.delete(fk);
    if (!isHashed(u.password)) await store.put('users', Object.assign({}, u, { password: hashPassword(password) }));
    const user = { id: u.id, name: u.name, role: u.role };
    const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, exp: Date.now() + TOKEN_TTL_MS });
    res.json({ ok: true, user, token });
  });

  /* ---- auth gate: everything registered below needs a valid token ---- */
  app.use('/api', async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    const t = m && readToken(SESSION_SECRET, m[1]);
    if (t) {
      const u = await store.get('users', t.uid); /* re-check: deleted/disabled users lose access immediately */
      if (u && u.active !== false) req.user = { id: u.id, role: u.role, name: u.name };
    }
    next();
  });
  const needUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'auth required' });
  const needAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth required' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
    next();
  };
  const superKey = (req) => { const k = req.get('X-Superadmin-Key') || ''; return !!SUPERADMIN_KEY && (k === SUPERADMIN_KEY || (!!process.env.SUPERADMIN_LOGIN_TOKEN && k === process.env.SUPERADMIN_LOGIN_TOKEN.trim())); };
  const needAdminOrSuper = (req, res, next) => (req.user && req.user.role === 'admin') || superKey(req) ? next() : res.status(req.user ? 403 : 401).json({ error: 'admin only' });

  app.post('/api/auth/change-password', needUser, async (req, res) => {
    const { current, next: nw } = req.body || {};
    if (typeof nw !== 'string' || nw.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
    const u = await store.get('users', req.user.id);
    if (!u || !verifyPassword(String(current || ''), u.password)) return res.status(400).json({ error: 'Current password is incorrect' });
    await store.put('users', Object.assign({}, u, { password: hashPassword(nw) }));
    res.json({ ok: true });
  });
  app.get('/api/dump', needUser, async (req, res) => res.json(sanitizeDump(await store.dump())));
  app.get('/api/tables', needUser, (req, res) => res.json(TABLES));

  /* ---- report PDF hosting (QR printed on lab reports -> /r/<key>) ----
     The web app uploads the generated report PDF here; scanning the QR on a
     printed report opens this URL on the patient's phone with a download
     option. NOTE: registered BEFORE the generic /api/:table routes. */
  const REPORT_PDFS_DIR = path.join(__dirname, 'report-pdfs');
  if (!fs.existsSync(REPORT_PDFS_DIR)) fs.mkdirSync(REPORT_PDFS_DIR, { recursive: true });
  const REPORT_KEY_RE = /^[A-Za-z0-9_-]{4,64}$/;
  const REPORT_PDF_MAX_BYTES = 15 * 1024 * 1024;
  const PDF_DATA_PREFIX = 'data:application/pdf;base64,';
  app.post('/api/report-pdfs', needUser, async (req, res) => {
    try {
      const { key, pdfBase64 } = req.body || {};
      if (!key || !REPORT_KEY_RE.test(key)) return res.status(400).json({ error: 'key must match /^[A-Za-z0-9_-]{4,64}$/' });
      if (typeof pdfBase64 !== 'string' || !pdfBase64.length) return res.status(400).json({ error: 'pdfBase64 required' });
      let b64 = pdfBase64;
      if (b64.startsWith(PDF_DATA_PREFIX)) b64 = b64.slice(PDF_DATA_PREFIX.length);
      let buf;
      try { buf = Buffer.from(b64, 'base64'); }
      catch (e) { return res.status(400).json({ error: 'invalid base64 payload' }); }
      if (!buf.length) return res.status(400).json({ error: 'empty pdf' });
      if (buf.length > REPORT_PDF_MAX_BYTES) return res.status(400).json({ error: 'pdf too large (max 15MB)' });
      /* key is regex-validated (no slashes/dots), so the join cannot escape REPORT_PDFS_DIR */
      fs.writeFileSync(path.join(REPORT_PDFS_DIR, key + '.pdf'), buf);
      res.json({ ok: true, key, url: (PUBLIC_API_URL || (req.protocol + '://' + req.get('host'))) + '/r/' + key });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/r/:key', (req, res) => {
    const key = req.params.key || '';
    if (!REPORT_KEY_RE.test(key)) return res.status(400).json({ error: 'invalid key' });
    const file = path.join(REPORT_PDFS_DIR, key + '.pdf');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="lab-report-' + key + '.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    fs.createReadStream(file).pipe(res);
  });

  /* restore/seed wipe the meta table: carry the lab registry + signing secret across */
  async function keepMeta(fn) {
    const labs = await store.getMeta('labs');
    await fn();
    await store.setMeta('session_secret', SESSION_SECRET);
    if (labs) await store.setMeta('labs', labs);
  }
  app.post('/api/restore', needAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      /* backups exported from the app carry no passwords: keep the existing hash for known users */
      const old = {}; (await store.all('users')).forEach(u => { old[u.id] = u.password; });
      body.users = (Array.isArray(body.users) ? body.users : []).map(u => {
        const c = Object.assign({}, u);
        if (c.password && !isHashed(c.password)) c.password = hashPassword(c.password);
        else if (!c.password) c.password = old[c.id] || (PW_PREFIX + '!'); /* '!' = unusable until an admin resets it */
        return c;
      });
      await keepMeta(() => store.restore(body));
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/admin/reseed', needAdminOrSuper, async (req, res) => {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      (seed.users || []).forEach(u => { if (u.password && !isHashed(u.password)) u.password = hashPassword(u.password); });
      await keepMeta(() => store.seed(seed));
      res.json(sanitizeDump(await store.dump()));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ---- generic table CRUD (authenticated; users/settings are admin-managed) ---- */
  const tableGuard = (req, res, next) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    if (!req.user) return res.status(401).json({ error: 'auth required' });
    const t = req.params.table, admin = req.user.role === 'admin';
    if (t === 'settings' && req.method !== 'GET' && !admin) return res.status(403).json({ error: 'admin only' });
    if (t === 'users' && req.method !== 'GET' && !admin) {
      /* staff may only edit their own profile (never role/active) */
      if (req.method !== 'PUT' || req.params.id !== req.user.id) return res.status(403).json({ error: 'admin only' });
    }
    next();
  };
  async function prepUserBody(req, existing) {
    const b = Object.assign({}, req.body || {});
    if (req.user.role !== 'admin') { delete b.role; delete b.active; }
    if (typeof b.password === 'string' && b.password) {
      if (b.password.length < 4 && !isHashed(b.password)) throw new Error('Password must be at least 4 characters');
      if (!isHashed(b.password)) b.password = hashPassword(b.password);
    } else { delete b.password; if (!existing) throw new Error('Password required for a new user'); }
    return b;
  }
  app.get('/api/:table', tableGuard, async (req, res) => {
    const rows = await store.all(req.params.table);
    res.json(req.params.table === 'users' ? rows.map(stripUser) : rows);
  });
  app.post('/api/:table', tableGuard, async (req, res) => {
    try {
      const t = req.params.table;
      const body = t === 'users' ? await prepUserBody(req, null) : req.body;
      if (body && body.id != null && t !== 'settings' && await store.get(t, String(body.id))) return res.status(409).json({ error: 'id already exists', id: body.id });
      const out = await store.put(t, body);
      res.json(t === 'users' ? stripUser(out) : out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put('/api/:table/:id', tableGuard, async (req, res) => {
    try {
      const t = req.params.table;
      const body = t === 'users' ? await prepUserBody(req, true) : (req.body || {});
      const out = await store.patch(t, req.params.id, body);
      res.json(t === 'users' ? stripUser(out) : out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/:table/:id', tableGuard, async (req, res) => {
    if (req.params.table === 'users' && req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    await store.del(req.params.table, req.params.id);
    res.json({ ok: true });
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
