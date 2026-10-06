/* LabPOS cloud API — VPS deployment (Express + Postgres/SQLite).
   Same REST contract as the local embedded server, plus cloud endpoints:
   health, version/release channel, and the lab registry (heartbeat +
   superadmin-guarded fleet view / targeted rollouts). */
'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { wrapStore, sameRecord, DEL } = require('./sync-store');
const { scopeStore } = require('./tenant-store');
const saasMod = require('./saas');

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
/* Desktop mode: this process is the Electron app's embedded server. It keeps its own local database
   (works offline) and syncs with the cloud API at DESKTOP_CLOUD_URL when online. */
const DESKTOP_CLOUD_URL = (process.env.DESKTOP_CLOUD_URL || '').replace(/\/+$/, '');
const DESKTOP = !!DESKTOP_CLOUD_URL;
const DATA_DIR = process.env.DATA_DIR || __dirname; /* report PDFs / installers live here (userData on desktop) */
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
      sha256: r.sha256 || null,
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
  const rawStore = await mod.openStore(ADAPTER === 'pg' ? DATABASE_URL : SQLITE_PATH);
  console.log(`[labpos-cloud] storage adapter: ${ADAPTER}${DESKTOP ? ' (desktop, syncing to ' + DESKTOP_CLOUD_URL + ')' : ''}`);
  /* every record carries sync metadata (_o/_c/_u/_s) and deletes leave tombstones */
  let deviceId = 'cloud';
  if (DESKTOP) {
    deviceId = await rawStore.getMeta('device');
    if (!deviceId) { deviceId = 'd-' + crypto.randomBytes(5).toString('hex'); await rawStore.setMeta('device', deviceId); }
  }
  /* the original single-lab data is tenant "main" (empty prefix): same rows, same sync metadata, nothing to migrate */
  const store = wrapStore(scopeStore(rawStore, '', TABLES), deviceId, TABLES);

  if (!DESKTOP && await store.isEmpty()) {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      await store.seed(seed);
      console.log('[labpos-cloud] seeded fresh database');
    } catch (e) { console.log('[labpos-cloud] seed skipped:', e.message); }
  }
  /* optional operator branding stamped onto the seeded settings row */
  if (LAB_NAME && !DESKTOP) {
    try {
      const s = (await store.get('settings', 'main')) || { id: 'main' };
      if (s.labName !== LAB_NAME) {
        await store.put('settings', Object.assign({}, s, { id: 'main', labName: LAB_NAME }));
        console.log('[labpos-cloud] LAB_NAME applied:', LAB_NAME);
      }
    } catch (e) { console.log('[labpos-cloud] LAB_NAME skipped:', e.message); }
  }

  /* report footer signatories: give a fresh/old database the default doctors once (editable in Settings afterwards) */
  if (!DESKTOP) try {
    const st = (await store.get('settings', 'main')) || null;
    if (st && (!Array.isArray(st.signatories) || !st.signatories.length)) {
      await store.put('settings', Object.assign({}, st, { id: 'main', signatories: [
        { name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist' },
        { name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP', title: '' },
        { name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist' },
        { name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Lab Technologist' }] }));
      console.log('[labpos-cloud] default report signatories applied');
    }
  } catch (e) { console.log('[labpos-cloud] signatories skipped:', e.message); }

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
      if (pw && !isHashed(pw)) await store.putQuiet('users', Object.assign({}, u, { password: hashPassword(pw) }));
      else if (pw !== u.password) await store.putQuiet('users', Object.assign({}, u, { password: pw }));
    }
  } catch (e) { console.log('[labpos-cloud] password migration skipped:', e.message); }

  /* default report parameters / normal ranges: shared by the boot migration (main lab) and by new SaaS labs.
     Lab-edited tests are never touched: only empty parameter lists and parameters without a range get filled. */
  let DEFAULT_PARAMS = {};
  try { DEFAULT_PARAMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'default-params.json'), 'utf8')); } catch (e) { DEFAULT_PARAMS = {}; }
  const RANGE_RULES = [
    { n: /^(h(a)?emoglobin|hb)\b/i, u: /g\/dl/i, m: '13.5 - 17.5', f: '12.0 - 15.5', c: '11.5 - 15.5' },
    { n: /^(pcv|hct|h(a)?ematocrit)\b/i, u: /%/, m: '40 - 54', f: '36 - 48', c: '35 - 45' },
    { n: /^(total )?rbc/i, u: /(10|x10).*(12|6)|\/l|ul|µl/i, m: '4.5 - 5.9', f: '4.1 - 5.1', c: '4.0 - 5.2' },
    { n: /^esr\b/i, u: /mm/i, m: '0 - 15', f: '0 - 20', c: '0 - 10' },
    { n: /^(serum )?creatinine/i, u: /mg\/dl/i, m: '0.7 - 1.3', f: '0.6 - 1.1', c: '0.3 - 0.7' },
    { n: /^uric acid/i, u: /mg\/dl/i, m: '3.4 - 7.0', f: '2.4 - 6.0', c: '2.0 - 5.5' },
    { n: /^ferritin/i, u: /ng\/ml/i, m: '24 - 336', f: '11 - 307', c: '7 - 140' },
    { n: /^(serum )?iron\b/i, u: /(u|µ)g\/dl/i, m: '65 - 175', f: '50 - 170', c: '50 - 120' },
    { n: /^alkaline phosphatase|^alp\b/i, u: /u\/l/i, c: '150 - 420' },
  ];
  /* returns { test, params: bool, ranges: bool } — `test` is the same object when nothing changed */
  function withDefaults(t) {
    let out = t, params = false, ranges = false;
    if ((!Array.isArray(out.params) || !out.params.length) && DEFAULT_PARAMS[out.code] && !out.isPackage) { out = Object.assign({}, out, { params: DEFAULT_PARAMS[out.code] }); params = true; }
    if (Array.isArray(out.params) && !out.isPackage) {
      let changed = false;
      const np = out.params.map((p) => {
        if (p.refMale || p.refFemale || p.refChild) return p;
        const hit = RANGE_RULES.find((x) => x.n.test(String(p.name || '').trim()) && x.u.test(String(p.unit || '')));
        if (!hit) return p;
        changed = true;
        const q = Object.assign({}, p);
        if (hit.m) q.refMale = hit.m;
        if (hit.f) q.refFemale = hit.f;
        if (hit.c) q.refChild = hit.c;
        return q;
      });
      if (changed) { out = Object.assign({}, out, { params: np }); ranges = true; }
    }
    return { test: out, params, ranges };
  }
  const defaultsFor = (tests) => tests.map((t) => withDefaults(t).test);
  if (!DESKTOP) try {
    let n1 = 0, n2 = 0;
    for (const t of await store.all('tests')) {
      const r = withDefaults(t);
      if (r.test !== t) { await store.put('tests', r.test); if (r.params) n1++; if (r.ranges) n2++; }
    }
    if (n1) console.log('[labpos-cloud] default normal ranges added to', n1, 'tests');
    if (n2) console.log('[labpos-cloud] male/female/child reference ranges added to', n2, 'tests');
  } catch (e) { console.log('[labpos-cloud] default ranges skipped:', e.message); }

  /* one-time: rows written before sync existed have no _s cursor, so desktops would never pull them */
  try {
    let n = 0;
    for (const t of TABLES) {
      for (const r of await rawStore.all(t)) {
        if (r._s === undefined) { await rawStore.put(t, Object.assign({}, r, { _s: store.nextS() })); n++; }
      }
    }
    if (n) console.log('[labpos-cloud] sync: stamped', n, 'existing rows');
  } catch (e) { console.log('[labpos-cloud] sync migration skipped:', e.message); }

  /* ---- SaaS: lab registry + per-lab isolated stores (cloud only; the desktop app is a single local lab) ---- */
  let saas = null;
  if (!DESKTOP) {
    saas = saasMod.create({ raw: rawStore, TABLES, hashPassword, defaultsFor });
    await saas.bootstrap(store);
  }

  const REPORT_PDFS_DIR = path.join(DATA_DIR, 'report-pdfs');
  if (!fs.existsSync(REPORT_PDFS_DIR)) fs.mkdirSync(REPORT_PDFS_DIR, { recursive: true });
  const desktop = DESKTOP ? require('./desktop-sync').create({
    store, TABLES, cloudUrl: DESKTOP_CLOUD_URL, deviceId, reportDir: REPORT_PDFS_DIR,
    hashPassword, verifyPassword, isHashed,
  }) : null;

  const app = express();
  app.set('trust proxy', true); /* correct req.protocol behind Nginx Proxy Manager */
  app.use(express.json({ limit: '25mb' }));
  /* CORS (manual, no extra deps): the static frontend and phone QR scanners
     fetch /api/* and /r/* cross-origin */
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (CORS_ORIGINS.length) {
      if (origin && (CORS_ORIGINS.includes(origin) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) { /* + the desktop app's embedded page */ res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    } else res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Superadmin-Key, X-Confirm-Slug, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.disable('x-powered-by');
  /* gzip JSON API responses (the full dump with thousands of tests is ~2 MB) */
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || !/\bgzip\b/.test(req.get('Accept-Encoding') || '')) return next();
    const orig = res.json.bind(res);
    res.json = (obj) => {
      const buf = Buffer.from(JSON.stringify(obj));
      if (buf.length < 1500) return orig(obj);
      zlib.gzip(buf, (e, z) => {
        if (e) return orig(obj);
        res.set({ 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
        res.type('json').send(z);
      });
      return res;
    };
    next();
  });

  const okTable = (t) => TABLES.includes(t);

  /* ---- data API (byte-compatible with the local server contract) ---- */
  app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, time: new Date().toISOString() }));
  /* frontend config: tells db.js where the API lives (must precede /:table routes) */
  const sendApiConfig = (req, res) => {
    const base = DESKTOP ? `${req.protocol}://${req.get('host')}` : (PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`);
    res.type('application/javascript');
    res.set('Cache-Control', 'no-store');
    res.send(`window.LABPOS_API=${JSON.stringify(base)};`);
  };
  app.get('/api-config.js', sendApiConfig);
  app.get('/assets/js/api-config.js', sendApiConfig); /* the web index.html loads this path */
  /* ---- release channel (polled by the desktop updater + superadmin) ----
     NOTE: specific /api/* routes must be registered BEFORE /api/:table */
  /* newest Android app = highest Optix-LAB-MedSync-<a.b.c>.apk in the releases folder (drop a new APK there, no config needed);
     versionCode = a*100 + b*10 + c (2.0.2 -> 202), matching the APK's own versionCode */
  function latestApk(req) {
    try {
      let best = null;
      for (const f of fs.readdirSync(path.join(DATA_DIR, 'releases'))) {
        const m = /^Optix-LAB-MedSync-(\d+)\.(\d+)\.(\d+)\.apk$/.exec(f);
        if (!m) continue;
        const code = (+m[1]) * 100 + (+m[2]) * 10 + (+m[3]);
        if (!best || code > best.versionCode) best = { version: `${m[1]}.${m[2]}.${m[3]}`, versionCode: code, file: f };
      }
      if (!best) return null;
      const base = PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
      return { version: best.version, versionCode: best.versionCode, url: base + '/releases/' + best.file };
    } catch (e) { return null; }
  }
  app.get('/api/version', (req, res) => { const r = readReleases(); const apk = latestApk(req); if (apk) r.apk = apk; res.json(r); });

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
    let st = (await store.get('settings', 'main')) || {};
    if (saas && typeof req.query.lab === 'string' && req.query.lab) { const l = await saas.findBySlug(req.query.lab); st = l ? ((await saas.storeFor(l).get('settings', 'main')) || {}) : {}; }
    res.json({ labName: st.labName || '', tagline: st.tagline || '', logo: st.logo || '' });
  });
  const fails = new Map(); /* ip|username -> {n, until} */
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'username and password required' });
    const labSlug = typeof (req.body || {}).lab === 'string' ? req.body.lab.trim().toLowerCase() : '';
    const fk = req.ip + '|' + labSlug + '|' + username.toLowerCase();
    const f = fails.get(fk);
    if (f && f.n >= 8 && f.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    if (DESKTOP) { /* cloud-authoritative while online, cached local hash when offline (see desktop-sync.js) */
      const r = await desktop.authenticate(username, password, labSlug);
      if (!r.user) {
        if (r.status === 401) fails.set(fk, { n: ((f && f.until > Date.now()) ? f.n : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
        return res.status(r.status || 401).json({ error: r.error || 'Invalid username or password' });
      }
      fails.delete(fk);
      await auditLog(req, 'login', 'auth', r.user.id, { store, actor: r.user, label: username });
      const dtoken = signToken(SESSION_SECRET, { uid: r.user.id, role: r.user.role, exp: Date.now() + TOKEN_TTL_MS });
      return res.json({ ok: true, user: r.user, token: dtoken, offline: !!r.offline });
    }
    /* which lab? the Lab ID typed on the sign-in page; empty = the default lab (the original single-lab deployment) */
    const lab = labSlug ? await saas.findBySlug(labSlug) : await saas.getLab('main');
    const bad = () => {
      if (lab) auditLog(req, 'login_failed', 'auth', username, { store: saas.storeFor(lab), actor: {}, username, label: username });
      const n = ((f && f.until > Date.now()) ? f.n : 0) + 1;
      fails.set(fk, { n, until: Date.now() + 15 * 60 * 1000 });
      return res.status(401).json({ error: labSlug && !lab ? 'Lab ID not found. Check the Lab ID and try again.' : 'Invalid username or password' });
    };
    if (!lab) return bad();
    const lstore = saas.storeFor(lab);
    const u = (await lstore.all('users')).find(x => x.username === username && x.active !== false);
    if (!u || !verifyPassword(password, u.password)) return bad();
    if (saas.effStatus(lab) === 'suspended') return res.status(403).json({ error: 'This lab account is suspended. Please contact support.', code: 'SUSPENDED' });
    fails.delete(fk);
    if (!isHashed(u.password)) await lstore.put('users', Object.assign({}, u, { password: hashPassword(password) }));
    const user = { id: u.id, name: u.name, role: u.role };
    await auditLog(req, 'login', 'auth', u.id, { store: lstore, actor: user, label: u.username });
    const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, lab: lab.id, exp: Date.now() + TOKEN_TTL_MS });
    res.json({ ok: true, user, token, lab: await saas.view(lab) });
  });

  /* ---- audit trail: who created / changed / deleted what, and when. Written server-side only (clients cannot POST to
     /api/audit); passwords, logos and other binary fields are never stored. Kept 365 days per lab. ---- */
  const AUDIT_SKIP = ['audit', 'wa_log', 'report_schedules', 'samples'];
  const AUDIT_HIDE = /^(password|logo|photo|signature|stamp|image|img|dataUri|token)$/i;
  const auditVal = (k, v) => {
    if (AUDIT_HIDE.test(k)) return '•••';
    if (v == null) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    if (v.indexOf('data:') === 0) return '[file]';
    return v.length > 140 ? v.slice(0, 137) + '…' : v;
  };
  function auditDiff(before, after, max) {
    const out = [], b = before || {}, a = after || {};
    new Set(Object.keys(b).concat(Object.keys(a))).forEach((k) => {
      if (k.charAt(0) === '_' || k === 'id') return;
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out.push({ f: k, from: auditVal(k, b[k]), to: auditVal(k, a[k]) });
    });
    return out.slice(0, max || 30);
  }
  function auditLabel(t, r) {
    r = r || {};
    if (t === 'results') return (r.invoiceId || '') + ' · ' + (r.testName || r.testId || r.id);
    if (t === 'payments') return 'Rs ' + (r.amount != null ? r.amount : '') + (r.invoiceId ? ' on ' + r.invoiceId : '');
    if (t === 'expenses') return (r.title || r.category || r.id) + (r.amount != null ? ' · Rs ' + r.amount : '');
    return String(r.no || r.name || r.title || r.username || r.id || '');
  }
  async function auditLog(req, action, table, rowId, o) {
    try {
      if (AUDIT_SKIP.indexOf(table) >= 0) return;
      o = o || {};
      const u = o.actor || req.user || {};
      await (o.store || req.store).put('audit', {
        id: 'A-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), ts: new Date().toISOString(),
        uid: u.id || '', user: u.name || o.username || '', role: u.role || '', ip: req.ip || '',
        action, table, rowId: String(rowId == null ? '' : rowId), label: o.label || '', changes: o.changes || [], note: o.note || '',
      });
    } catch (e) { /* the audit trail must never break a real write */ }
  }
  async function pruneAudit(st) {
    try {
      const cut = new Date(Date.now() - 365 * 86400000).toISOString();
      for (const r of await st.all('audit')) if (r.ts && r.ts < cut) await st.raw.del('audit', String(r.id));
    } catch (e) { /* retention is best effort */ }
  }
  setTimeout(() => { pruneAudit(store); }, 30000).unref();
  setInterval(async () => {
    await pruneAudit(store);
    if (saas) for (const l of (await saas.loadLabs()).values()) if (l.id !== 'main') await pruneAudit(saas.storeFor(l));
  }, 86400000).unref();

  /* ---- auth gate: everything registered below needs a valid token ---- */
  app.use('/api', async (req, res, next) => {
    req.store = store; req.lab = null;
    const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    const t = m && readToken(SESSION_SECRET, m[1]);
    if (t) {
      let lab = null, ts = store;
      if (saas) { lab = await saas.getLab(t.lab || 'main'); ts = lab ? saas.storeFor(lab) : null; } /* tokens issued before SaaS belong to the default lab */
      const u = ts && await ts.get('users', t.uid); /* re-check: deleted/disabled users lose access immediately */
      if (u && u.active !== false) { req.user = { id: u.id, role: u.role, name: u.name }; req.store = ts; req.lab = lab; }
    }
    if (req.user && saas && req.lab) {
      const st = saas.effStatus(req.lab);
      if (st === 'suspended') return res.status(403).json({ error: 'This lab account is suspended. Please contact support.', code: 'SUSPENDED' });
      /* expired subscription = read-only: everything stays visible/printable, nothing new can be saved until it is renewed */
      if (st === 'expired' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/saas/') && !req.path.startsWith('/auth/'))
        return res.status(402).json({ error: 'Your subscription has expired — renew your plan to continue saving data.', code: 'EXPIRED' });
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
    const store = req.store;
    const { current, next: nw } = req.body || {};
    if (typeof nw !== 'string' || nw.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
    const u = await store.get('users', req.user.id);
    if (!u || !verifyPassword(String(current || ''), u.password)) return res.status(400).json({ error: 'Current password is incorrect' });
    await store.put('users', Object.assign({}, u, { password: hashPassword(nw) }));
    res.json({ ok: true });
  });
  /* =====================================================================================================
     SaaS API — signup, plans, subscription, payments, and the operator (superadmin) console.
     ===================================================================================================== */
  if (saas) {
    const signups = new Map(); /* ip -> [timestamps] (5 signups / hour / IP) */
    const clean = (o, keys) => { const r = {}; keys.forEach(k => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
    const payView = (p) => clean(p, ['id', 'labId', 'labName', 'labSlug', 'plan', 'period', 'amount', 'method', 'reference', 'note', 'status', 'createdAt', 'decidedAt', 'decisionNote']);
    const publicPay = async () => {
      const st = await saas.getSettings();
      return { trialDays: st.trialDays, payInstructions: st.payInstructions, payMethods: st.payMethods, supportPhone: st.supportPhone, supportEmail: st.supportEmail, supportWhatsapp: st.supportWhatsapp };
    };

    /* ---- public: plans + payment info, Lab ID availability, signup ---- */
    app.get('/api/saas/plans', async (req, res) => {
      const plans = await saas.getPlans();
      const out = {};
      Object.keys(plans).forEach(k => { out[k] = clean(plans[k], ['name', 'monthly', 'yearly', 'users', 'invoicesPerMonth', 'desc']); });
      res.json({ plans: out, info: await publicPay() });
    });
    app.get('/api/saas/check-slug', async (req, res) => {
      const slug = saas.slugify(req.query.slug || '');
      if (!saas.SLUG_RE.test(slug)) return res.json({ slug, available: false, reason: 'Use 3-30 letters or numbers' });
      const taken = saas.RESERVED.indexOf(slug) >= 0 || !!(await saas.findBySlug(slug));
      res.json({ slug, available: !taken, reason: taken ? 'Already taken' : '' });
    });
    app.post('/api/saas/signup', async (req, res) => {
      try {
        const now = Date.now(), hits = (signups.get(req.ip) || []).filter(x => x > now - 3600000);
        if (hits.length >= (+process.env.SAAS_SIGNUPS_PER_HOUR || 5)) return res.status(429).json({ error: 'Too many sign-ups from this network. Please try again later.' });
        const lab = await saas.createLab(req.body || {});
        hits.push(now); signups.set(req.ip, hits);
        const u = (await saas.storeFor(lab).all('users'))[0];
        const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, lab: lab.id, exp: Date.now() + TOKEN_TTL_MS });
        console.log('[labpos-cloud] saas: new lab signed up:', lab.slug, '<' + lab.ownerEmail + '>');
        res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role }, token, lab: await saas.view(lab) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });

    /* ---- signed-in lab: my subscription ---- */
    app.get('/api/saas/me', needUser, async (req, res) => {
      const lab = req.lab || await saas.getLab('main');
      const pays = (await rawStore.all(saas.PAY_T)).filter(p => p.labId === lab.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const plans = await saas.getPlans(); const pl = {};
      Object.keys(plans).forEach(k => { pl[k] = clean(plans[k], ['name', 'monthly', 'yearly', 'users', 'invoicesPerMonth', 'desc']); });
      const v = await saas.view(lab, true); delete v.history;
      res.json({ lab: v, plans: pl, info: await publicPay(), payments: pays.slice(0, 20).map(payView) });
    });
    app.post('/api/saas/pay-request', needAdmin, async (req, res) => {
      try {
        const lab = req.lab || await saas.getLab('main'); const b = req.body || {};
        const plans = await saas.getPlans();
        if (!plans[b.plan] || b.plan === 'trial' || b.plan === 'enterprise') return res.status(400).json({ error: 'Choose Starter or Professional (for Enterprise, contact us)' });
        const period = b.period === 'yearly' ? 'yearly' : 'monthly';
        const reference = String(b.reference || '').trim().slice(0, 80);
        if (reference.length < 3) return res.status(400).json({ error: 'Enter the transaction ID / payment reference' });
        const pend = (await rawStore.all(saas.PAY_T)).filter(p => p.labId === lab.id && p.status === 'pending');
        if (pend.length >= 3) return res.status(400).json({ error: 'You already have pending payments waiting for approval' });
        const p = { id: 'P' + crypto.randomBytes(5).toString('hex'), labId: lab.id, labName: lab.name, labSlug: lab.slug, plan: b.plan, period,
          amount: +b.amount || (period === 'yearly' ? plans[b.plan].yearly : plans[b.plan].monthly), method: String(b.method || '').slice(0, 40), reference,
          note: String(b.note || '').slice(0, 300), status: 'pending', createdAt: new Date().toISOString(), by: req.user.name };
        await rawStore.put(saas.PAY_T, p);
        console.log('[labpos-cloud] saas: payment request from', lab.slug, p.plan, p.period, p.reference);
        res.json({ ok: true, payment: payView(p) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });

    /* ---- operator console (X-Superadmin-Key) ---- */
    app.get('/api/saas/labs', requireSuperadmin, async (req, res) => {
      const out = [];
      for (const l of (await saas.loadLabs(true)).values()) out.push(await saas.view(l, true));
      out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const pays = await rawStore.all(saas.PAY_T);
      res.json({ labs: out, pendingPayments: pays.filter(p => p.status === 'pending').length });
    });
    app.get('/api/saas/stats', requireSuperadmin, async (req, res) => {
      const plans = await saas.getPlans(), c = { trial: 0, active: 0, expired: 0, suspended: 0 }; let mrr = 0, users = 0, invoices = 0;
      for (const l of (await saas.loadLabs(true)).values()) {
        const s = saas.effStatus(l); c[s] = (c[s] || 0) + 1;
        if (s === 'active' && plans[l.plan]) mrr += plans[l.plan].monthly || 0;
        const u = await saas.usageOf(l); users += u.users; invoices += u.invoicesThisMonth;
      }
      const pays = await rawStore.all(saas.PAY_T), now = new Date();
      const revenue = pays.filter(p => p.status === 'approved' && new Date(p.decidedAt).getMonth() === now.getMonth() && new Date(p.decidedAt).getFullYear() === now.getFullYear()).reduce((a, p) => a + (+p.amount || 0), 0);
      res.json({ labs: c, total: c.trial + c.active + c.expired + c.suspended, mrr, revenueThisMonth: revenue, users, invoicesThisMonth: invoices, pendingPayments: pays.filter(p => p.status === 'pending').length });
    });
    app.post('/api/saas/labs', requireSuperadmin, async (req, res) => { /* operator creates a lab by hand */
      try { const lab = await saas.createLab(req.body || {}, 'operator'); res.json({ ok: true, lab: await saas.view(lab, true) }); }
      catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.put('/api/saas/labs/:id', requireSuperadmin, async (req, res) => {
      const lab = await saas.getLab(req.params.id); if (!lab) return res.status(404).json({ error: 'unknown lab' });
      const b = req.body || {}, plans = await saas.getPlans(), notes = [];
      if (b.plan !== undefined) { if (!plans[b.plan]) return res.status(400).json({ error: 'unknown plan' }); if (b.plan !== lab.plan) notes.push('Plan → ' + plans[b.plan].name); lab.plan = b.plan; }
      if (b.status !== undefined) { if (['active', 'suspended'].indexOf(b.status) < 0) return res.status(400).json({ error: 'status must be active or suspended' }); if (b.status !== lab.status) notes.push(b.status === 'suspended' ? 'Suspended' : 'Re-activated'); lab.status = b.status; }
      ['trialEndsAt', 'paidUntil'].forEach(k => { if (b[k] !== undefined) { lab[k] = b[k] ? new Date(b[k]).toISOString() : null; notes.push(k + ' → ' + (lab[k] ? lab[k].slice(0, 10) : 'none')); } });
      ['limitUsers', 'limitInvoices'].forEach(k => { if (b[k] !== undefined) lab[k] = (b[k] === '' || b[k] === null) ? null : Math.max(0, +b[k] || 0); });
      ['name', 'notes', 'ownerName', 'ownerEmail', 'phone'].forEach(k => { if (typeof b[k] === 'string') lab[k] = b[k].slice(0, 300); });
      if (notes.length) await saas.addHistory(lab, notes.join('; '), 'operator');
      await saas.saveLab(lab);
      res.json({ ok: true, lab: await saas.view(lab, true) });
    });
    app.post('/api/saas/labs/:id/extend', requireSuperadmin, async (req, res) => {
      const lab = await saas.getLab(req.params.id); if (!lab) return res.status(404).json({ error: 'unknown lab' });
      const days = Math.max(1, Math.min(3650, +(req.body || {}).days || 0)); if (!days) return res.status(400).json({ error: 'days required' });
      const key = lab.plan === 'trial' ? 'trialEndsAt' : 'paidUntil';
      const base = Math.max(Date.now(), lab[key] ? Date.parse(lab[key]) : 0);
      lab[key] = new Date(base + days * saas.DAY).toISOString();
      await saas.addHistory(lab, 'Extended by ' + days + ' days', 'operator'); await saas.saveLab(lab);
      res.json({ ok: true, lab: await saas.view(lab, true) });
    });
    app.post('/api/saas/labs/:id/reset-admin', requireSuperadmin, async (req, res) => {
      const lab = await saas.getLab(req.params.id); if (!lab) return res.status(404).json({ error: 'unknown lab' });
      const pw = String((req.body || {}).password || ''); if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const st = saas.storeFor(lab), admin = (await st.all('users')).find(u => u.role === 'admin' && u.active !== false);
      if (!admin) return res.status(404).json({ error: 'no admin user in this lab' });
      await st.put('users', Object.assign({}, admin, { password: hashPassword(pw) }));
      await saas.addHistory(lab, 'Admin password reset (' + admin.username + ')', 'operator'); await saas.saveLab(lab);
      res.json({ ok: true, username: admin.username });
    });
    app.delete('/api/saas/labs/:id', requireSuperadmin, async (req, res) => {
      const lab = await saas.getLab(req.params.id); if (!lab) return res.status(404).json({ error: 'unknown lab' });
      if (lab.id === 'main') return res.status(400).json({ error: 'The default lab cannot be deleted' });
      if ((req.get('X-Confirm-Slug') || '') !== lab.slug) return res.status(400).json({ error: 'Send header X-Confirm-Slug: ' + lab.slug + ' to confirm' });
      await saas.storeFor(lab).clear();
      await rawStore.del(saas.LABS_T, lab.id); (await saas.loadLabs()).delete(lab.id);
      for (const p of await rawStore.all(saas.PAY_T)) if (p.labId === lab.id) await rawStore.del(saas.PAY_T, p.id);
      console.log('[labpos-cloud] saas: lab deleted:', lab.slug);
      res.json({ ok: true });
    });
    app.get('/api/saas/payments', requireSuperadmin, async (req, res) => {
      let rows = await rawStore.all(saas.PAY_T);
      if (req.query.status) rows = rows.filter(p => p.status === req.query.status);
      rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      res.json(rows);
    });
    app.post('/api/saas/payments/:id/:action', requireSuperadmin, async (req, res) => {
      const p = await rawStore.get(saas.PAY_T, req.params.id); if (!p) return res.status(404).json({ error: 'unknown payment' });
      if (p.status !== 'pending') return res.status(400).json({ error: 'Already ' + p.status });
      const act = req.params.action; if (act !== 'approve' && act !== 'reject') return res.status(400).json({ error: 'approve or reject' });
      const lab = await saas.getLab(p.labId); if (!lab) return res.status(404).json({ error: 'lab no longer exists' });
      p.status = act === 'approve' ? 'approved' : 'rejected'; p.decidedAt = new Date().toISOString(); p.decisionNote = String((req.body || {}).note || '').slice(0, 200);
      if (act === 'approve') {
        lab.plan = p.plan; lab.status = 'active'; lab.paidUntil = saas.addPeriod(lab, p.period); lab.trialEndsAt = lab.trialEndsAt;
        await saas.addHistory(lab, 'Payment approved: ' + p.plan + ' ' + p.period + ' (Rs ' + p.amount + ', ref ' + p.reference + ') → paid until ' + lab.paidUntil.slice(0, 10), 'operator');
        await saas.saveLab(lab);
      }
      await rawStore.put(saas.PAY_T, p);
      res.json({ ok: true, payment: p, lab: await saas.view(lab, true) });
    });
    app.get('/api/saas/settings', requireSuperadmin, async (req, res) => res.json({ settings: await saas.getSettings(), plans: await saas.getPlans() }));
    app.put('/api/saas/settings', requireSuperadmin, async (req, res) => {
      const b = req.body || {};
      if (b.settings && typeof b.settings === 'object') {
        const cur = await saas.getSettings(), s = b.settings;
        const next = Object.assign({}, cur, clean(s, ['trialDays', 'supportPhone', 'supportEmail', 'supportWhatsapp', 'payInstructions']));
        if (Array.isArray(s.payMethods)) next.payMethods = s.payMethods.slice(0, 8).map(m => clean(m, ['name', 'account', 'title']));
        next.trialDays = Math.max(1, Math.min(90, +next.trialDays || 14));
        await rawStore.setMeta('saas_settings', next);
      }
      if (b.plans && typeof b.plans === 'object') {
        const cur = (await rawStore.getMeta('saas_plans')) || {};
        Object.keys(saas.DEFAULT_PLANS).forEach(k => { if (b.plans[k]) cur[k] = Object.assign({}, cur[k] || {}, clean(b.plans[k], ['name', 'monthly', 'yearly', 'users', 'invoicesPerMonth', 'desc'])); });
        await rawStore.setMeta('saas_plans', cur);
      }
      res.json({ ok: true, settings: await saas.getSettings(), plans: await saas.getPlans() });
    });

    /* ---- plan limits on the generic write routes (users per lab, invoices per month) ---- */
    app.use('/api', async (req, res, next) => {
      try {
        if (req.method !== 'POST' || !req.user || !req.lab) return next();
        const isUsers = req.path === '/users', isInv = req.path === '/invoices' || req.path === '/bulk/invoices';
        if (!isUsers && !isInv) return next();
        const lim = await saas.limitsOf(req.lab), use = await saas.usageOf(req.lab);
        const planName = ((await saas.getPlans())[req.lab.plan] || {}).name || req.lab.plan;
        if (isUsers && lim.users && use.users >= lim.users) return res.status(402).json({ error: 'Your ' + planName + ' plan allows ' + lim.users + ' users. Upgrade the plan to add more.', code: 'LIMIT_USERS' });
        if (isInv && lim.invoicesPerMonth && use.invoicesThisMonth >= lim.invoicesPerMonth) return res.status(402).json({ error: 'Monthly invoice limit (' + lim.invoicesPerMonth + ') of the ' + planName + ' plan reached. Upgrade the plan to continue billing.', code: 'LIMIT_INVOICES' });
        next();
      } catch (e) { next(); }
    });
  }

  /* ---- two-way sync with desktop apps (cloud side) ---- */
  const pwStrip = (t, row) => { if (t !== 'users') return row; const c = Object.assign({}, row); delete c.password; return c; };
  if (!DESKTOP) {
    /* which of these records collide with a DIFFERENT cloud record of the same number? -> new free ids */
    app.post('/api/sync/check', needUser, async (req, res) => {
    const store = req.store;
      const out = [], taken = {};
      for (const x of (req.body && req.body.rows) || []) {
        if (!x || !okTable(x.t) || x.id == null || x.t === 'settings') continue;
        const ex = await store.get(x.t, String(x.id));
        if (ex && !sameRecord(ex, x)) {
          taken[x.t] = taken[x.t] || [];
          const newId = await store.nextFreeId(x.t, String(x.id), taken[x.t]);
          taken[x.t].push(newId);
          out.push({ t: x.t, id: x.id, newId });
        }
      }
      res.json({ conflicts: out });
    });
    app.post('/api/sync', needUser, async (req, res) => {
    const store = req.store;
      try {
        const body = req.body || {}, since = +body.since || 0, admin = req.user.role === 'admin';
        const applied = new Set(), skipped = [], maxU = Date.now() + 5 * 60 * 1000;
        for (const x of body.rows || []) {
          if (!x || !okTable(x.t) || !x.row || x.row.id == null) continue;
          const t = x.t, id = String(x.row.id);
          if ((t === 'users' || t === 'settings') && !admin) { skipped.push({ t, id, _u: x.row._u }); continue; }
          const u = Math.min(+x.row._u || 0, maxU);
          const ex = await store.get(t, id);
          if (ex && !sameRecord(ex, x.row)) continue; /* different record under the same number: the client must renumber first */
          if (ex && (+ex._u || 0) >= u) continue;
          const tomb = await store.tomb(t, id);
          if (tomb && (+tomb._u || 0) >= u) continue;
          const r = Object.assign({}, x.row, { _u: u });
          if (t === 'users') {
            if (isHashed(r.password)) { /* admin-created user/password change */ }
            else r.password = ex ? ex.password : PW_PREFIX + '!';
          }
          await store.putSync(t, r);
          applied.add(t + '|' + id);
        }
        for (const d of body.deletes || []) {
          if (!d || !okTable(d.t) || d.id == null) continue;
          if ((d.t === 'users' || d.t === 'settings') && !admin) continue;
          const u = Math.min(+d._u || 0, maxU), ex = await store.get(d.t, String(d.id));
          if (ex && (+ex._u || 0) > u) continue;
          await store.delSync(d.t, String(d.id), u);
          applied.add(d.t + '|' + d.id);
        }
        const ch = await store.changesSince(since, applied);
        let cursor = since;
        for (const x of ch.rows) cursor = Math.max(cursor, +x.row._s || 0);
        for (const d of ch.deletes) cursor = Math.max(cursor, +d._s || 0);
        res.json({ cursor, rows: ch.rows.map(x => ({ t: x.t, row: pwStrip(x.t, x.row) })), deletes: ch.deletes, skipped });
      } catch (e) { console.error('[labpos-cloud] sync failed:', e); res.status(500).json({ error: 'sync failed' }); }
    });
  }
  app.get('/api/sync/status', needUser, async (req, res) => res.json(DESKTOP ? await desktop.getStatus() : { desktop: false }));
  app.post('/api/sync/now', needUser, async (req, res) => res.json(DESKTOP ? await desktop.cycle() : { desktop: false }));

  app.get('/api/dump', needUser, async (req, res) => res.json(sanitizeDump(await req.store.dump())));
  app.get('/api/tables', needUser, (req, res) => res.json(TABLES));

  /* ---- report PDF hosting (QR printed on lab reports -> /r/<key>) ----
     The web app uploads the generated report PDF here; scanning the QR on a
     printed report opens this URL on the patient's phone with a download
     option. NOTE: registered BEFORE the generic /api/:table routes. */
  const REPORT_KEY_RE = /^[A-Za-z0-9_-]{4,64}$/;
  const REPORT_PDF_MAX_BYTES = 15 * 1024 * 1024;
  const PDF_DATA_PREFIX = 'data:application/pdf;base64,';
  app.post('/api/report-pdfs', needUser, async (req, res) => {
    const store = req.store;
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
      /* one lab can never overwrite another lab's PDF: each key remembers its owner (files from before SaaS belong to the default lab) */
      const fpdf = path.join(REPORT_PDFS_DIR, key + '.pdf'), fown = path.join(REPORT_PDFS_DIR, key + '.owner'), me = req.lab ? req.lab.id : 'main';
      if (fs.existsSync(fpdf) && (fs.existsSync(fown) ? fs.readFileSync(fown, 'utf8').trim() : 'main') !== me) return res.status(409).json({ error: 'key already in use' });
      fs.writeFileSync(fpdf, buf);
      if (!DESKTOP) fs.writeFileSync(fown, me);
      if (DESKTOP) desktop.onPdfSaved(key); /* uploaded to the cloud as soon as a session is available */
      res.json({ ok: true, key, url: (DESKTOP ? DESKTOP_CLOUD_URL : (PUBLIC_API_URL || (req.protocol + '://' + req.get('host')))) + '/r/' + key });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  /* QR target: a phone-friendly, app-like viewer (sharp pinch-zoom, share/download). Scripts and the desktop
     updater ask for the raw PDF with ?raw=1 or without an HTML Accept header. */
  let viewerHtml = null;
  try { viewerHtml = fs.readFileSync(path.join(__dirname, 'report-viewer.html'), 'utf8'); } catch (e) { viewerHtml = null; }
  app.get('/r/:key', async (req, res) => {
    const store = req.store;
    const key = req.params.key || '';
    if (!REPORT_KEY_RE.test(key)) return res.status(400).json({ error: 'invalid key' });
    const file = path.join(REPORT_PDFS_DIR, key + '.pdf');
    if (!fs.existsSync(file) && !(DESKTOP && await desktop.fetchPdf(key))) return res.status(404).json({ error: 'not found' });
    if (viewerHtml && !req.query.raw && /text\/html/.test(req.get('Accept') || '')) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.type('html').send(viewerHtml);
    }
    if (req.query.dl) res.setHeader('Content-Disposition', 'attachment; filename="lab-report-' + key + '.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    if (!req.query.dl) res.setHeader('Content-Disposition', 'inline; filename="lab-report-' + key + '.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    fs.createReadStream(file).pipe(res);
  });

  /* restore/seed only touch the calling lab's own rows (tenant-store.js), never the shared registry / signing secret / device list */
  async function keepMeta(fn) { await fn(); }
  app.post('/api/restore', needAdmin, async (req, res) => {
    const store = req.store;
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
      await auditLog(req, 'restore', 'system', '', { label: 'Data restored from a backup file' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/admin/reseed', needAdminOrSuper, async (req, res) => {
    const store = req.store;
    if (DESKTOP) return res.status(403).json({ error: 'Not available on the desktop app' });
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      (seed.users || []).forEach(u => { if (u.password && !isHashed(u.password)) u.password = hashPassword(u.password); });
      await keepMeta(() => store.seed(seed));
      await auditLog(req, 'reseed', 'system', '', { label: 'Data reset to the demo data set' });
      res.json(sanitizeDump(await store.dump()));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ---- generic table CRUD (authenticated; users/settings are admin-managed) ---- */
  const tableGuard = (req, res, next) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    if (req.params.table === 'audit') return res.status(403).json({ error: 'audit log is read-only (use GET /api/audit)' });
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
  app.get('/api/audit', needAdmin, async (req, res) => {
    const q = req.query || {}, lim = Math.max(1, Math.min(+q.limit || 100, 5000)), off = Math.max(0, +q.offset || 0);
    let rows = await req.store.all('audit');
    const users = {}, tables = {};
    rows.forEach((r) => { if (r.uid || r.user) users[r.uid || r.user] = r.user || r.uid; if (r.table) tables[r.table] = 1; });
    const from = q.from ? new Date(q.from + 'T00:00:00').toISOString() : '', to = q.to ? new Date(q.to + 'T23:59:59.999').toISOString() : '';
    const needle = String(q.q || '').toLowerCase();
    rows = rows.filter((r) => (!from || r.ts >= from) && (!to || r.ts <= to) && (!q.user || r.uid === q.user || r.user === q.user) && (!q.table || r.table === q.table) && (!q.action || r.action === q.action) &&
      (!needle || (r.label + ' ' + r.user + ' ' + r.rowId + ' ' + (r.changes || []).map((c) => c.f + ' ' + c.from + ' ' + c.to).join(' ')).toLowerCase().indexOf(needle) >= 0));
    rows.sort((a, b) => (a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0)));
    const stats = { total: rows.length };
    res.json({ total: rows.length, rows: rows.slice(off, off + lim).map((r) => { const c = Object.assign({}, r); delete c._o; delete c._c; delete c._u; delete c._s; return c; }), users, tables: Object.keys(tables).sort(), stats });
  });
  /* batched upsert (imports / bulk price updates). users + settings keep their dedicated, guarded routes */
  app.post('/api/bulk/:table', tableGuard, async (req, res) => {
    const store = req.store;
    const t = req.params.table;
    if (t === 'users' || t === 'settings') return res.status(400).json({ error: 'not allowed for ' + t });
    const rows = req.body && req.body.rows;
    if (!Array.isArray(rows) || rows.length > 2000) return res.status(400).json({ error: 'rows[] required (max 2000)' });
    try {
      let n = 0;
      for (const r of rows) { if (r && r.id != null) { await store.put(t, r); n++; } }
      if (n && ['tests', 'invoices', 'patients', 'doctors', 'expenses', 'payments', 'results'].indexOf(t) >= 0) await auditLog(req, 'bulk', t, '', { label: n + ' ' + t + ' saved in one batch' });
      res.json({ ok: true, saved: n });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/:table', tableGuard, async (req, res) => {
    const store = req.store;
    const rows = await store.all(req.params.table);
    res.json(req.params.table === 'users' ? rows.map(stripUser) : rows);
  });
  app.post('/api/:table', tableGuard, async (req, res) => {
    const store = req.store;
    try {
      const t = req.params.table;
      const body = t === 'users' ? await prepUserBody(req, null) : req.body;
      if (body && body.id != null && t !== 'settings' && await store.get(t, String(body.id))) return res.status(409).json({ error: 'id already exists', id: body.id });
      const out = await store.put(t, body);
      await auditLog(req, 'create', t, out.id, { label: auditLabel(t, out), changes: auditDiff({}, out, 12) });
      res.json(t === 'users' ? stripUser(out) : out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put('/api/:table/:id', tableGuard, async (req, res) => {
    const store = req.store;
    try {
      const t = req.params.table;
      const body = t === 'users' ? await prepUserBody(req, true) : (req.body || {});
      const before = await store.get(t, req.params.id);
      const out = await store.patch(t, req.params.id, body);
      const ch = auditDiff(before, out);
      if (ch.length) await auditLog(req, before ? 'update' : 'create', t, req.params.id, { label: auditLabel(t, out), changes: ch });
      res.json(t === 'users' ? stripUser(out) : out);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/:table/:id', tableGuard, async (req, res) => {
    const store = req.store;
    if (req.params.table === 'users' && req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    const gone = await store.get(req.params.table, req.params.id);
    await store.del(req.params.table, req.params.id);
    await auditLog(req, 'delete', req.params.table, req.params.id, { label: auditLabel(req.params.table, gone || { id: req.params.id }), changes: auditDiff(gone, {}, 14) });
    res.json({ ok: true });
  });

  /* ---- installer / update bundles (dashboard "Download App" button) ----
     Drop files like Optix-LAB-MedSync-Setup-1.0.0.exe into ./releases/ on the VPS;
     they are served at <api>/releases/<file>. Set the URL in the app at
     Settings -> Lab Profile -> "Desktop App Download URL". */
  const RELEASES_DIR = path.join(DATA_DIR, 'releases');
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
      if (DESKTOP) desktop.start();
      resolve({ srv, store });
    });
    srv.on('error', reject);
  });
}

if (require.main === module) {
  main().catch(e => { console.error('[labpos-cloud] fatal:', e.message); process.exit(1); });
}

module.exports = { main };
