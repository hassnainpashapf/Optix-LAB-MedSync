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
/* a stray rejected promise (for example inside the WhatsApp library) must never take the whole server down */
process.on('unhandledRejection', (e) => { console.error('[labpos-cloud] unhandled rejection:', String((e && (e.message || e.stack)) || e).slice(0, 300)); });
const mailer = require('./mailer'); /* nodemailer itself is only loaded when a mail is actually sent */

const VERSION = require('./package.json').version;
const PORT = +(process.env.PORT || 4000);
const BIND = process.env.BIND_HOST || '0.0.0.0';
const ADAPTER = (process.env.DB_ADAPTER || 'pg').toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL || '';
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'labpos-cloud.db');
const SUPERADMIN_KEY = process.env.SUPERADMIN_KEY || '';
const DAY_MS = 86400000;
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

/* compare secrets by hash so timing never reveals how much of a guess was right */
function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const saFails = new Map(); /* ip -> {n, until}: wrong superadmin keys */
function requireSuperadmin(req, res, next) {
  if (!SUPERADMIN_KEY) return res.status(500).json({ error: 'SUPERADMIN_KEY not configured on server' });
  const provided = req.get('X-Superadmin-Key') || '';
  const sf = saFails.get(req.ip);
  if (sf && sf.n >= 20 && sf.until > Date.now()) return res.status(429).json({ error: 'Too many attempts' });
  /* Accept either the legacy static key or the username/password derived token
     sent by the console ('up:' + sha256('username:password')). The expected
     derived token is stored server-side as SUPERADMIN_LOGIN_TOKEN. */
  const loginToken = (process.env.SUPERADMIN_LOGIN_TOKEN || '').trim();
  if (safeEq(provided, SUPERADMIN_KEY) || (loginToken && safeEq(provided, loginToken))) return next();
  const now = Date.now(), cur = (sf && sf.until > now) ? sf : { n: 0, until: now + 15 * 60 * 1000 };
  cur.n++; saFails.set(req.ip, cur); if (saFails.size > 20000) saFails.clear();
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
    if ((!Array.isArray(out.params) || !out.params.length) && DEFAULT_PARAMS[out.code] && !out.isPackage) { out = Object.assign({}, out, { params: DEFAULT_PARAMS[out.code] }); params = true; }
    if (out.code === 'TYPHI') {
      let typhiDirty = false, patch = {};
      if (!/typhoid/i.test(out.name || '')) { patch.name = 'Typhoid (IgG-IgM) / Typhidot'; typhiDirty = true; }
      if (!Array.isArray(out.aliases) || !out.aliases.length) { patch.aliases = ['Typhoid', 'Typhoid (IgG-IgM)', 'Typhidot', 'Typhoid Rapid', 'Typhi']; typhiDirty = true; }
      if (Array.isArray(out.params) && out.params.length === 2 && (out.params[0].name === 'IgG' || out.params[0].name === 'IgM')) { patch.params = DEFAULT_PARAMS['TYPHI']; typhiDirty = true; }
      if (typhiDirty) { out = Object.assign({}, out, patch); params = true; }
    }
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

  /* email sender saved from the superadmin console (SMTP password stored encrypted with a key derived from the session secret) */
  const MAIL_META = 'saas_mail';
  const mailKey = () => crypto.createHash('sha256').update('labpos-mail|' + SESSION_SECRET).digest();
  const encPw = (pw) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', mailKey(), iv), ct = Buffer.concat([c.update(String(pw), 'utf8'), c.final()]); return 'v1:' + iv.toString('hex') + ':' + c.getAuthTag().toString('hex') + ':' + ct.toString('hex'); };
  const decPw = (e) => { try { const [v, iv, tag, ct] = String(e).split(':'); if (v !== 'v1') return ''; const d = crypto.createDecipheriv('aes-256-gcm', mailKey(), Buffer.from(iv, 'hex')); d.setAuthTag(Buffer.from(tag, 'hex')); return Buffer.concat([d.update(Buffer.from(ct, 'hex')), d.final()]).toString('utf8'); } catch (e2) { return ''; } };
  async function loadMailConfig() {
    try { const m = await rawStore.getMeta(MAIL_META); mailer.setConfig(m && m.host ? { host: m.host, port: m.port, secure: m.secure, user: m.user, from: m.from, pass: m.pass ? decPw(m.pass) : '' } : null); } catch (e) { /* env settings stay in effect */ }
  }
  if (!DESKTOP) await loadMailConfig();

  const REPORT_PDFS_DIR = path.join(DATA_DIR, 'report-pdfs');
  if (!fs.existsSync(REPORT_PDFS_DIR)) fs.mkdirSync(REPORT_PDFS_DIR, { recursive: true });
  const desktop = DESKTOP ? require('./desktop-sync').create({
    store, TABLES, cloudUrl: DESKTOP_CLOUD_URL, deviceId, reportDir: REPORT_PDFS_DIR,
    hashPassword, verifyPassword, isHashed,
  }) : null;

  const app = express();
  /* correct req.protocol / req.ip behind Nginx Proxy Manager: trust exactly the proxy hop(s) (TRUST_PROXY, default 1), never a client-supplied X-Forwarded-For */
  app.set('trust proxy', process.env.TRUST_PROXY ? (isNaN(+process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : +process.env.TRUST_PROXY) : 1);
  app.use(express.json({ limit: '25mb' }));
  /* CORS (manual, no extra deps): the static frontend and phone QR scanners
     fetch /api/* and /r/* cross-origin */
  const CORS_ALWAYS = ['https://optix-lab-medsync.pages.dev', 'https://labpos-api.150.230.52.29.sslip.io'];
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (CORS_ORIGINS.length) {
      if (origin && (CORS_ORIGINS.includes(origin) || CORS_ALWAYS.includes(origin) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) { /* + the desktop app's embedded page */ res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
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
  /* AI chatbot proxy (public: website visitors are anonymous, before the auth gate) */
  app.use('/api/chat', require('./chat'));
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
    if (!labId || typeof labId !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(labId)) return res.status(400).json({ error: 'labId required (letters, numbers, _ . : -; max 64)' });
    const labs = await getLabs();
    if (!labs[labId] && Object.keys(labs).length >= 5000) return res.status(429).json({ error: 'registry full' });
    const prev = labs[labId] || {};
    const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
    labs[labId] = {
      name: cut(name, 80) || prev.name || labId,
      version: cut(version, 24) || prev.version || '',
      platform: cut(platform, 40) || prev.platform || '',
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
    res.json({ labName: st.labName || '', tagline: st.tagline || '', logo: st.logo || '' });
  });
  /* ---- brute-force / abuse limiters (bounded, self-cleaning; keyed on the real client IP — see trust proxy above) ---- */
  const fails = new Map();      /* ip|lab|username -> {n, until}: wrong passwords */
  const ipFails = new Map();    /* ip -> {n, until}: any failed sign-in from this address */
  const auditFails = new Map(); /* ip|lab -> {n, until}: failed-login rows already written to a lab's audit trail */
  const signupHits = new Map(); /* ip -> {n, until}: sign-ups */
  const userFails = new Map();  /* lab|username -> {n, until}: independent of the client IP, so rotating addresses cannot dodge it */
  const forgotIp = new Map(), forgotKey = new Map(), resetIp = new Map();
  const LIMIT_MAPS = [fails, ipFails, auditFails, signupHits, saFails, userFails, forgotIp, forgotKey, resetIp];
  function bump(map, key, windowMs) {
    const now = Date.now();
    let e = map.get(key);
    if (!e || e.until <= now) e = { n: 0, until: now + windowMs };
    e.n++; map.set(key, e);
    if (map.size > 50000) { for (const [k, v] of map) if (v.until <= now) map.delete(k); if (map.size > 50000) map.clear(); }
    return e;
  }
  const hot = (map, key, max) => { const e = map.get(key); return !!(e && e.until > Date.now() && e.n >= max); };
  setInterval(() => { const now = Date.now(); for (const m of LIMIT_MAPS) for (const [k, v] of m) if (v.until <= now) m.delete(k); }, 600000).unref();
  const DUMMY_HASH = hashPassword('not-a-real-password'); /* unknown user / lab costs the same scrypt time as a wrong password */
  /* a token stops working when the user's password changes, or the account is disabled (stolen-token revocation) */
  const pvOf = (u) => crypto.createHash('sha256').update(String(u.password || '') + '|' + (u.active === false ? '0' : '1')).digest('hex').slice(0, 12);
  const BAD_LOGIN = 'Invalid Lab ID, username or password';
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'username and password required' });
    const labSlug = typeof (req.body || {}).lab === 'string' ? req.body.lab.trim().toLowerCase() : '';
    if (username.length > 64 || password.length > 256 || labSlug.length > 40) return res.status(400).json({ error: BAD_LOGIN });
    /* login rate-limiting removed per operator request (2026-10-08): wrong passwords now always return 401,
       failed attempts are still written to the audit trail in bad() below */
    if (DESKTOP) { /* cloud-authoritative while online, cached local hash when offline (see desktop-sync.js) */
      const r = await desktop.authenticate(username, password, labSlug);
      if (!r.user) {
        return res.status(r.status || 401).json({ error: r.error || 'Invalid username or password' });
      }
      await auditLog(req, 'login', 'auth', r.user.id, { store, actor: r.user, label: username });
      const dtoken = signToken(SESSION_SECRET, { uid: r.user.id, role: r.user.role, exp: Date.now() + TOKEN_TTL_MS });
      return res.json({ ok: true, user: r.user, token: dtoken, offline: !!r.offline });
    }
    /* which lab? the Lab ID typed on the sign-in page; empty = the default lab (the original single-lab deployment) */
    const lab = labSlug ? await saas.findBySlug(labSlug) : await saas.getLab('main');
    const bad = () => {
      /* failed attempts show up in the lab's audit trail, but at most a handful per address per lab (no flooding a victim's log) */
      if (lab && !hot(auditFails, req.ip + '|' + lab.id, 5) && !hot(auditFails, 'lab|' + lab.id, 20)) { bump(auditFails, req.ip + '|' + lab.id, 15 * 60 * 1000); bump(auditFails, 'lab|' + lab.id, 15 * 60 * 1000); auditLog(req, 'login_failed', 'auth', username, { store: saas.storeFor(lab), actor: {}, username, label: username }); }
      return res.status(401).json({ error: BAD_LOGIN });
    };
    if (!lab) { verifyPassword(password, DUMMY_HASH); return bad(); }
    const lstore = saas.storeFor(lab);
    const u = (await lstore.all('users')).find(x => x.username === username && x.active !== false);
    if (!u) { verifyPassword(password, DUMMY_HASH); return bad(); }
    if (!verifyPassword(password, u.password)) return bad();
    if (saas.effStatus(lab) === 'suspended') return res.status(403).json({ error: 'This lab account is suspended. Please contact support.', code: 'SUSPENDED' });
    if (!isHashed(u.password)) await lstore.put('users', Object.assign({}, u, { password: hashPassword(password) }));
    const fresh = (await lstore.get('users', u.id)) || u;
    const user = { id: u.id, name: u.name, role: u.role, roleId: u.roleId || undefined };
    await auditLog(req, 'login', 'auth', u.id, { store: lstore, actor: user, label: u.username });
    const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, lab: lab.id, pv: pvOf(fresh), exp: Date.now() + TOKEN_TTL_MS });
    res.json({ ok: true, user, token, lab: await saas.view(lab) });
  });

  /* ---- audit trail: who created / changed / deleted what, and when. Written server-side only (clients cannot POST to
     /api/audit); passwords, logos and other binary fields are never stored. Kept 365 days per lab. ---- */
  const AUDIT_SKIP = ['audit', 'wa_log', 'sms_outbox', 'report_schedules', 'samples'];
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
        uid: String(u.id || '').slice(0, 64), user: String(u.name || o.username || '').slice(0, 64), role: u.role || '', ip: String(req.ip || '').slice(0, 64),
        action, table, rowId: String(rowId == null ? '' : rowId).slice(0, 64), label: String(o.label || '').slice(0, 140), changes: o.changes || [], note: String(o.note || '').slice(0, 200),
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

  /* ---- plan limits (users per lab, invoices per month): enforced on EVERY write path that can create such a row
     (POST, PUT-as-create, bulk, desktop sync, restore), and serialized per lab so parallel requests cannot both fit ---- */
  const labLocks = new Map();
  async function withLock(key, fn) {
    const prev = labLocks.get(key) || Promise.resolve();
    let rel; const mine = new Promise((r) => { rel = r; });
    const chain = prev.then(() => mine);
    labLocks.set(key, chain);
    await prev;
    try { return await fn(); } finally { rel(); if (labLocks.get(key) === chain) labLocks.delete(key); }
  }
  const ymOf = (t) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };
  async function limitErr(req, table, rows) {
    if (!saas || !req.lab || (table !== 'users' && table !== 'invoices')) return null;
    const lim = await saas.limitsOf(req.lab), cap = table === 'users' ? lim.users : lim.invoicesPerMonth;
    if (!cap) return null;
    const nowYm = ymOf(Date.now()); let add = 0;
    for (const r of rows) {
      if (!r || r.id == null || await req.store.get(table, String(r.id))) continue;
      if (table === 'users') { if (r.active !== false && r.role !== 'doctor') add++; } else if (ymOf(+r._c || Date.now()) === nowYm) add++;
    }
    if (!add) return null;
    const use = await saas.usageOf(req.lab), planName = ((await saas.getPlans())[req.lab.plan] || {}).name || req.lab.plan;
    if (table === 'users' && use.users + add > cap) return { error: 'Your ' + planName + ' plan allows ' + cap + ' users. Upgrade the plan to add more.', code: 'LIMIT_USERS' };
    if (table === 'invoices' && use.invoicesThisMonth + add > cap) return { error: 'Monthly invoice limit (' + cap + ') of the ' + planName + ' plan reached. Upgrade the plan to continue billing.', code: 'LIMIT_INVOICES' };
    return null;
  }
  const lockKey = (req) => (req.lab ? req.lab.id : 'main');

  /* ---- auth gate: everything registered below needs a valid token ---- */
  app.use('/api', async (req, res, next) => {
    req.store = store; req.lab = null;
    const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    const t = m && readToken(SESSION_SECRET, m[1]);
    if (t) {
      let lab = null, ts = store;
      if (saas) { lab = await saas.getLab(t.lab || 'main'); ts = lab ? saas.storeFor(lab) : null; } /* tokens issued before SaaS belong to the default lab */
      const u = ts && await ts.get('users', t.uid); /* re-check: deleted/disabled users lose access immediately */
      if (u && u.active !== false && (!t.pv || t.pv === pvOf(u))) { req.user = { id: u.id, role: u.role, name: u.name }; req.store = ts; req.lab = lab; }

    }
    /* custom roles (made in Settings -> Users & Roles): the pages a role ticks decide what its users may change; this is enforced here, not just hidden in the app */
    if (req.user && req.user.role === 'custom') {
      const set = (await req.store.get('settings', 'main')) || {}, u = await req.store.get('users', req.user.id) || {};
      const def = (Array.isArray(set.customRoles) ? set.customRoles : []).find((r) => r && r.id === u.roleId);
      req.user.perms = def && Array.isArray(def.pages) ? def.pages : [];
      const any = (list) => list.some((k) => req.user.perms.indexOf(k) >= 0);
      const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const WR = { patients: ['patients', 'invoices'], invoices: ['invoices', 'dues', 'patients', 'finance'], payments: ['invoices', 'dues', 'patients', 'finance'], results: ['results', 'invoices'], samples: ['samples', 'results', 'invoices', 'patients'],
        tests: ['tests'], doctors: ['doctors'], expenses: ['expenses', 'finance'], closings: ['finance'], stock_items: ['stock', 'results'], stock_moves: ['stock', 'results'], panels: ['panels'], ref_labs: ['outsourced'], outsourced: ['outsourced', 'results', 'invoices', 'patients'],
        wa_log: ['whatsapp', 'results', 'invoices', 'dues', 'patients', 'doctors'], sms_outbox: ['sms', 'whatsapp', 'results', 'invoices', 'dues', 'patients', 'doctors'], email_log: ['email', 'results', 'invoices', 'doctors'], report_templates: ['results', 'reports'], report_schedules: ['results', 'reports'] };
      let deny = false;
      const tm = /^\/([a-z_]+)(\/|$)/.exec(req.path);
      if (write && tm && req.path.indexOf('/auth/') !== 0 && WR[tm[1]] !== undefined) deny = !any(WR[tm[1]]);
      else if (write && /^\/(wa\/send|wa\/send-doc)/.test(req.path)) deny = !any(['whatsapp', 'results', 'invoices', 'dues', 'patients', 'doctors']);
      else if (write && /^\/(sms\/(queue|retry))/.test(req.path)) deny = !any(['whatsapp', 'results', 'invoices', 'dues', 'patients', 'doctors']);
      else if (write && /^\/share\/(email|slack)/.test(req.path)) deny = !any(['email', 'results', 'invoices', 'doctors']);
      if (deny) return res.status(403).json({ error: 'Your role does not allow this. Ask the lab admin.', code: 'ROLE_DENIED' });
    }
    /* a doctor's login is sandboxed on the server: it may only read its own dashboard (and change its own password) — never the lab's tables */
    if (req.user && req.user.role === 'doctor' && !((req.method === 'GET' && req.path === '/doctor/me') || (req.method === 'POST' && req.path === '/auth/change-password')))
      return res.status(403).json({ error: 'This doctor login can only open the doctor dashboard.', code: 'DOCTOR_ONLY' });
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
  const superKey = (req) => { const k = req.get('X-Superadmin-Key') || ''; return !!SUPERADMIN_KEY && (safeEq(k, SUPERADMIN_KEY) || (!!process.env.SUPERADMIN_LOGIN_TOKEN && safeEq(k, process.env.SUPERADMIN_LOGIN_TOKEN.trim()))); };
  const needAdminOrSuper = (req, res, next) => (req.user && req.user.role === 'admin') || superKey(req) ? next() : res.status(req.user ? 403 : 401).json({ error: 'admin only' });

  /* ---- forgot / reset password by email (cloud labs). The answer to "forgot" is ALWAYS the same, so nobody can use it to find out
     which Lab IDs, usernames or emails exist. The emailed token is random, stored only as a hash, valid RESET_TTL_MINUTES, single use. ---- */
  const RESET_T = '_saas_reset';
  const RESET_TTL_MS = (+process.env.RESET_TTL_MINUTES || 30) * 60000;
  const APP_URL = (process.env.PUBLIC_APP_URL || 'https://optix-lab-medsync.pages.dev').replace(/\/+$/, '');
  const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!DESKTOP) {
    app.get('/api/auth/mail-status', (req, res) => res.json({ mail: mailer.configured() }));
    app.post('/api/auth/forgot', async (req, res) => {
      const same = { ok: true, message: 'If an account with these details exists and has an email address, we have sent a reset link. Check your inbox (and spam).' };
      try {
        const b = req.body || {}, labSlug = typeof b.lab === 'string' ? b.lab.trim().toLowerCase() : '', ident = typeof b.identifier === 'string' ? b.identifier.trim().toLowerCase() : '';
        if (!ident || ident.length > 120 || labSlug.length > 40) return res.status(400).json({ error: 'Enter your username or email' });
        if (!mailer.configured()) return res.status(503).json({ error: 'Password reset by email is not set up on this server yet. Ask your lab admin to reset it from Settings → Users, or contact support.' });
        if (bump(forgotIp, req.ip, 3600000).n > 10) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        if (bump(forgotKey, labSlug + '|' + ident, 3600000).n > 3) return res.json(same); /* silently stop mailing the same account */
        const lab = labSlug ? await saas.findBySlug(labSlug) : await saas.getLab('main');
        if (!lab || saas.effStatus(lab) === 'suspended') return res.json(same);
        const st = saas.storeFor(lab), u = (await st.all('users')).find((x) => x.active !== false && (String(x.username).toLowerCase() === ident || String(x.email || '').toLowerCase() === ident));
        if (!u || !EMAIL_OK.test(String(u.email || ''))) return res.json(same);
        const token = crypto.randomBytes(32).toString('base64url');
        const now = Date.now();
        for (const r of await rawStore.all(RESET_T)) if (r.exp < now - 86400000 || (r.userId === u.id && r.labId === lab.id)) await rawStore.del(RESET_T, r.id); /* old / replaced tokens */
        await rawStore.put(RESET_T, { id: sha(token), labId: lab.id, userId: u.id, exp: now + RESET_TTL_MS, used: false });
        const settings = (await st.get('settings', 'main')) || {};
        const link = APP_URL + '/app/#/reset?lab=' + encodeURIComponent(lab.slug) + '&token=' + encodeURIComponent(token);
        const mail = mailer.resetEmail({ labName: settings.labName || lab.name, name: u.name, link, minutes: Math.round(RESET_TTL_MS / 60000) });
        mailer.send({ to: u.email, subject: mail.subject, text: mail.text, html: mail.html }).catch((e) => console.error('[labpos-cloud] reset email failed:', e.message));
        await auditLog(req, 'update', 'auth', u.id, { store: st, actor: {}, username: u.username, label: u.username, note: 'Password reset email requested' });
        res.json(same);
      } catch (e) { console.error('[labpos-cloud] forgot failed:', e.message); res.json(same); }
    });
    app.post('/api/auth/reset', async (req, res) => {
      try {
        const { token, password } = req.body || {};
        if (typeof token !== 'string' || token.length < 20 || token.length > 100) return res.status(400).json({ error: 'This reset link is not valid.' });
        if (typeof password !== 'string' || password.length < 6 || password.length > 256) return res.status(400).json({ error: 'Password must be 6-256 characters' });
        if (bump(resetIp, req.ip, 3600000).n > 20) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        const id = sha(token), rec = await rawStore.get(RESET_T, id);
        const bad = () => res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
        if (!rec || rec.used || rec.exp < Date.now()) return bad();
        const lab = await saas.getLab(rec.labId); if (!lab || saas.effStatus(lab) === 'suspended') return bad();
        const st = saas.storeFor(lab);
        const done = await withLock(lab.id, async () => {
          const fresh = await rawStore.get(RESET_T, id); if (!fresh || fresh.used) return null; /* two clicks at once: only one wins */
          const u = await st.get('users', rec.userId); if (!u || u.active === false) return null;
          fresh.used = true; await rawStore.put(RESET_T, fresh);
          await st.put('users', Object.assign({}, u, { password: hashPassword(password) }));
          for (const r of await rawStore.all(RESET_T)) if (r.userId === u.id && r.labId === lab.id && r.id !== id) await rawStore.del(RESET_T, r.id);
          await auditLog(req, 'update', 'users', u.id, { store: st, actor: { id: u.id, name: u.name, role: u.role, roleId: u.roleId || undefined }, label: u.name || u.username, changes: [{ f: 'password', from: '•••', to: '•••' }], note: 'Password reset with an emailed link' });
          return u;
        });
        if (!done) return bad();
        const settings = (await st.get('settings', 'main')) || {};
        if (mailer.configured() && EMAIL_OK.test(String(done.email || ''))) { const m = mailer.changedEmail({ labName: settings.labName || lab.name, name: done.name }); mailer.send({ to: done.email, subject: m.subject, text: m.text, html: m.html }).catch(() => {}); }
        res.json({ ok: true, lab: lab.slug, username: done.username });
      } catch (e) { console.error('[labpos-cloud] reset failed:', e.message); res.status(500).json({ error: 'Could not reset the password. Please try again.' }); }
    });
  }

  app.post('/api/auth/change-password', needUser, async (req, res) => {
    const store = req.store;
    const { current, next: nw } = req.body || {};
    if (typeof nw !== 'string' || nw.length < 4 || nw.length > 256) return res.status(400).json({ error: 'New password must be 4-256 characters' });
    /* same per-lab lock as every other user write: the profile page saves the profile and the password at the same moment, and without
       the lock the profile write could land second and put the OLD password hash back (lost update) */
    await withLock(lockKey(req), async () => {
      const u = await store.get('users', req.user.id);
      if (!u || !verifyPassword(String(current || ''), u.password)) return res.status(400).json({ error: 'Current password is incorrect' });
      await store.put('users', Object.assign({}, u, { password: hashPassword(nw) }));
      await auditLog(req, 'update', 'users', u.id, { label: u.name || u.username, changes: [{ f: 'password', from: '•••', to: '•••' }] });
      /* the old token is tied to the old password (pv): hand back a fresh one so this session keeps working, every other session ends */
      const fresh = await store.get('users', req.user.id);
      res.json({ ok: true, token: signToken(SESSION_SECRET, { uid: fresh.id, role: fresh.role, lab: req.lab ? req.lab.id : undefined, pv: pvOf(fresh), exp: Date.now() + TOKEN_TTL_MS }) });
    });
  });
  /* =====================================================================================================
     SaaS API — signup, plans, subscription, payments, and the operator (superadmin) console.
     ===================================================================================================== */
  if (saas) {
    const clean = (o, keys) => { const r = {}; keys.forEach(k => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
    const payView = (p) => clean(p, ['id', 'labId', 'labName', 'labSlug', 'plan', 'period', 'amount', 'method', 'reference', 'note', 'status', 'createdAt', 'decidedAt', 'decisionNote', 'gateway', 'online']);
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
        /* the attempt is counted BEFORE the slow work, so parallel requests cannot slip past the limit */
        if (bump(signupHits, req.ip, 3600000).n > (+process.env.SAAS_SIGNUPS_PER_HOUR || 5)) return res.status(429).json({ error: 'Too many sign-ups from this network. Please try again later.' });
        const lab = await saas.createLab(req.body || {});
        const u = (await saas.storeFor(lab).all('users'))[0];
        const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, lab: lab.id, pv: pvOf(u), exp: Date.now() + TOKEN_TTL_MS });
        console.log('[labpos-cloud] saas: new lab signed up:', lab.slug, '<' + lab.ownerEmail + '>');
        res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role, roleId: u.roleId || undefined }, token, lab: await saas.view(lab) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });

    /* ---- "Continue with Google": a Google ID token is verified with Google (tokeninfo) and must be issued for OUR client id,
       unexpired, with a verified email. The client id is set in the superadmin console (or GOOGLE_CLIENT_ID). Google never sees the lab's data. ---- */
    const GOOGLE_META = 'saas_google';
    const GOOGLE_INFO = process.env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo';
    const GCLIENT_RE = /^[0-9A-Za-z._-]{6,200}\.apps\.googleusercontent\.com$/;
    let googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    async function loadGoogle() { try { const m = await rawStore.getMeta(GOOGLE_META); googleClientId = (m && m.clientId) || process.env.GOOGLE_CLIENT_ID || ''; } catch (e) { /* keep env value */ } }
    await loadGoogle();
    async function verifyGoogle(credential) {
      if (!googleClientId) throw Object.assign(new Error('Google sign-in is not set up yet.'), { status: 503 });
      if (typeof credential !== 'string' || credential.length < 10 || credential.length > 6000) throw new Error('Google sign-in failed. Please try again.');
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
      let j = null, ok = false;
      try { const r = await fetch(GOOGLE_INFO + '?id_token=' + encodeURIComponent(credential), { signal: ac.signal }); ok = r.ok; j = await r.json().catch(() => null); }
      catch (e) { throw Object.assign(new Error('Could not reach Google. Please try again.'), { status: 502 }); }
      finally { clearTimeout(to); }
      if (!ok || !j || j.aud !== googleClientId || ['accounts.google.com', 'https://accounts.google.com'].indexOf(j.iss) < 0 || !(+j.exp * 1000 > Date.now())
        || !(j.email_verified === true || j.email_verified === 'true') || !EMAIL_OK.test(String(j.email || ''))) throw new Error('Google could not verify this sign-in. Please try again.');
      const email = String(j.email).toLowerCase();
      return { email, name: String(j.name || j.given_name || email.split('@')[0]).slice(0, 100), sub: String(j.sub || '') };
    }
    const googleView = async () => ({ configured: !!googleClientId, clientId: googleClientId, source: (await rawStore.getMeta(GOOGLE_META)) ? 'saved' : (process.env.GOOGLE_CLIENT_ID ? 'env' : 'none') });
    app.get('/api/auth/google-config', (req, res) => res.json({ clientId: googleClientId || '' }));
    app.get('/api/saas/google', requireSuperadmin, async (req, res) => res.json(await googleView()));
    app.put('/api/saas/google', requireSuperadmin, async (req, res) => {
      const b = req.body || {};
      if (b.clear) { await rawStore.setMeta(GOOGLE_META, null); await loadGoogle(); return res.json(await googleView()); }
      const id = String(b.clientId || '').trim();
      if (!GCLIENT_RE.test(id)) return res.status(400).json({ error: 'That does not look like a Google Client ID. It ends with .apps.googleusercontent.com' });
      await rawStore.setMeta(GOOGLE_META, { clientId: id }); await loadGoogle();
      res.json(await googleView());
    });
    /* start a free trial with a Google account: the lab name + Lab ID come from the form, the owner name + email from Google.
       The username defaults to the part of the email before @; the password is the typed one, or random (set one later via "Forgot password?"). */
    app.post('/api/saas/google-signup', async (req, res) => {
      try {
        if (bump(signupHits, req.ip, 3600000).n > (+process.env.SAAS_SIGNUPS_PER_HOUR || 5)) return res.status(429).json({ error: 'Too many sign-ups from this network. Please try again later.' });
        const b = req.body || {}, g = await verifyGoogle(b.credential);
        const local = g.email.split('@')[0];
        let username = String(b.username || '').trim() || local.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 30);
        if (username.length < 3) username = 'admin';
        const password = String(b.password || '') || crypto.randomBytes(18).toString('base64url');
        /* nothing has to be typed: the lab name comes from the Google name, the Lab ID from the email (made unique if taken) */
        const labName = String(b.labName || '').trim() || (g.name + "'s Lab").slice(0, 100);
        const typedSlug = saas.slugify(String(b.slug || ''));
        let lab = null, lastErr = null;
        if (typedSlug) lab = await saas.createLab({ labName, slug: typedSlug, phone: b.phone, ownerName: g.name, email: g.email, username, password }, 'google');
        else {
          let base = saas.slugify(local) || 'lab'; if (base.length < 3) base = (base + '-lab').slice(0, 30);
          for (let i = 0; i < 8 && !lab; i++) {
            const slug = i === 0 ? base : (base.slice(0, 24) + '-' + (i < 4 ? i + 1 : crypto.randomBytes(2).toString('hex'))).slice(0, 30);
            try { lab = await saas.createLab({ labName, slug, phone: b.phone, ownerName: g.name, email: g.email, username, password }, 'google'); }
            catch (e) { lastErr = e; if (!/already taken/i.test(e.message)) throw e; }
          }
          if (!lab) throw lastErr || new Error('Could not pick a free Lab ID. Please type one and try again.');
        }
        const u = (await saas.storeFor(lab).all('users'))[0];
        const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, lab: lab.id, pv: pvOf(u), exp: Date.now() + TOKEN_TTL_MS });
        console.log('[labpos-cloud] saas: new lab signed up with Google:', lab.slug, '<' + lab.ownerEmail + '>');
        res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role, roleId: u.roleId || undefined }, token, lab: await saas.view(lab), google: { username, passwordSet: !!String(b.password || '') } });
      } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
    });
    /* sign in with Google: with a Lab ID typed, any active user of that lab whose profile email is this Google email; without one,
       only the lab(s) this email OWNS (the signup email, which only the operator can change) */
    app.post('/api/saas/google-login', async (req, res) => {
      const b = req.body || {}, labSlug = typeof b.lab === 'string' ? b.lab.trim().toLowerCase() : '';
      const NOPE = 'No lab is linked to this Google account yet. Type your Lab ID above and make sure this Gmail is saved in your profile (Profile -> Email), or use "Start your 14-day free trial" to create a new lab.';
      try {
        if (hot(ipFails, req.ip, 60)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
        if (labSlug.length > 40) return res.status(400).json({ error: NOPE });
        const g = await verifyGoogle(b.credential);
        let cands = [];
        if (labSlug) {
          const lab = await saas.findBySlug(labSlug);
          if (lab) { const us = (await saas.storeFor(lab).all('users')).filter(x => x.active !== false && String(x.email || '').toLowerCase() === g.email); us.sort((a, c) => (c.role === 'admin') - (a.role === 'admin')); if (us[0]) cands.push({ lab, u: us[0] }); }
        } else {
          /* the original (default) lab is run by the operator themself, so a user there with this email counts even without a typed Lab ID */
          const mainLab = await saas.getLab('main');
          if (mainLab) {
            const mu = (await saas.storeFor(mainLab).all('users')).filter(x => x.active !== false && String(x.email || '').toLowerCase() === g.email);
            mu.sort((a, c) => (c.role === 'admin') - (a.role === 'admin'));
            if (mu[0]) cands.push({ lab: mainLab, u: mu[0] });
          }
          for (const lab of (await saas.loadLabs(true)).values()) {
            if (lab.id === 'main') continue;
            if (String(lab.ownerEmail || '').toLowerCase() !== g.email) continue;
            const us = (await saas.storeFor(lab).all('users')).filter(x => x.active !== false && x.role === 'admin' && (String(x.email || '').toLowerCase() === g.email || x.id === 'U-01'));
            if (us[0]) cands.push({ lab, u: us.find(x => String(x.email || '').toLowerCase() === g.email) || us[0] });
          }
        }
        if (!cands.length) { bump(ipFails, req.ip, 15 * 60 * 1000); return res.status(401).json({ error: NOPE, code: 'NO_LAB', email: g.email }); }
        if (cands.length > 1) return res.status(409).json({ error: 'This Google account owns more than one lab. Type the Lab ID above, then try again.' });
        const { lab, u } = cands[0];
        if (saas.effStatus(lab) === 'suspended') return res.status(403).json({ error: 'This lab account is suspended. Please contact support.', code: 'SUSPENDED' });
        const lstore = saas.storeFor(lab), user = { id: u.id, name: u.name, role: u.role, roleId: u.roleId || undefined };
        await auditLog(req, 'login', 'auth', u.id, { store: lstore, actor: user, label: u.username + ' (Google)' });
        const token = signToken(SESSION_SECRET, { uid: u.id, role: u.role, lab: lab.id, pv: pvOf(u), exp: Date.now() + TOKEN_TTL_MS });
        res.json({ ok: true, user, token, lab: await saas.view(lab) });
      } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
    });

    /* ---- signed-in lab: my subscription ---- */
    app.get('/api/saas/me', needUser, async (req, res) => {
      const lab = req.lab || await saas.getLab('main');
      const pays = (await rawStore.all(saas.PAY_T)).filter(p => p.labId === lab.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const plans = await saas.getPlans(); const pl = {};
      Object.keys(plans).forEach(k => { pl[k] = clean(plans[k], ['name', 'monthly', 'yearly', 'users', 'invoicesPerMonth', 'desc']); });
      const v = await saas.view(lab, true); delete v.history;
      res.json({ lab: v, plans: pl, info: await publicPay(), online: gwReady(await gwLoad()), payments: pays.slice(0, 20).map(payView) });
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
      await saas.purgeLab(lab); /* every table, tombstone and audit row of this lab */
      try { /* its report PDFs (and owner marks) too: the public /r/<key> links stop working */
        for (const f of fs.readdirSync(REPORT_PDFS_DIR)) {
          if (!/\.owner$/.test(f)) continue;
          const o = fs.readFileSync(path.join(REPORT_PDFS_DIR, f), 'utf8').trim();
          if (o === lab.id) { fs.rmSync(path.join(REPORT_PDFS_DIR, f), { force: true }); fs.rmSync(path.join(REPORT_PDFS_DIR, f.replace(/\.owner$/, '.pdf')), { force: true }); }
        }
      } catch (e) { /* best effort */ }
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
    const payBusy = new Set();
    app.post('/api/saas/payments/:id/:action', requireSuperadmin, async (req, res) => {
      const pid = req.params.id;
      if (payBusy.has(pid)) return res.status(409).json({ error: 'This payment is being processed' });
      payBusy.add(pid);
      try { return await decidePayment(req, res); } finally { payBusy.delete(pid); }
    });
    async function decidePayment(req, res) {
      const p = await rawStore.get(saas.PAY_T, req.params.id); if (!p) return res.status(404).json({ error: 'unknown payment' });
      if (p.status !== 'pending' && p.status !== 'awaiting') return res.status(400).json({ error: 'Already ' + p.status });
      const act = req.params.action; if (act !== 'approve' && act !== 'reject') return res.status(400).json({ error: 'approve or reject' });
      const lab = await saas.getLab(p.labId); if (!lab) return res.status(404).json({ error: 'lab no longer exists' });
      await settlePayment(p, lab, act === 'approve', String((req.body || {}).note || '').slice(0, 200), 'operator');
      res.json({ ok: true, payment: p, lab: await saas.view(lab, true) });
    }
    /* one place that approves / rejects a payment and extends the subscription (operator click or a verified online payment) */
    async function settlePayment(p, lab, approve, note, by) {
      p.status = approve ? 'approved' : 'rejected'; p.decidedAt = new Date().toISOString(); p.decisionNote = note;
      await rawStore.put(saas.PAY_T, p); /* the decision is persisted first, so a repeat can never extend the subscription twice */
      if (approve) {
        lab.plan = p.plan; lab.status = 'active'; lab.paidUntil = saas.addPeriod(lab, p.period);
        await saas.addHistory(lab, (p.online ? 'Online payment received (' + p.gateway + ')' : 'Payment approved') + ': ' + p.plan + ' ' + p.period + ' (Rs ' + p.amount + ', ref ' + p.reference + ') → paid until ' + lab.paidUntil.slice(0, 10), by);
        await saas.saveLab(lab);
      }
    }
    /* ---- online payments (JazzCash / Easypaisa). The operator connects a merchant account in the superadmin console; a lab then pays by card / wallet and
       the subscription is extended the moment the gateway confirms (verified signature / verified IPN). The manual flow above keeps working beside it. ---- */
    const paygw = require('./paygw');
    const GW_META = 'saas_paygw', GW_SIM = process.env.PAY_SIMULATOR === '1';
    const apiBase = (req) => PUBLIC_API_URL || (req.protocol + '://' + req.get('host'));
    const gwLoad = async () => {
      const m = (await rawStore.getMeta(GW_META)) || {}, jc = m.jazzcash || {}, ep = m.easypaisa || {};
      return {
        jazzcash: { enabled: !!jc.enabled, mode: jc.mode === 'live' ? 'live' : 'sandbox', merchantId: jc.merchantId || '', password: jc.password ? decPw(jc.password) : '', salt: jc.salt ? decPw(jc.salt) : '' },
        easypaisa: { enabled: !!ep.enabled, mode: ep.mode === 'live' ? 'live' : 'sandbox', storeId: ep.storeId || '', hashKey: ep.hashKey ? decPw(ep.hashKey) : '' },
      };
    };
    const gwReady = (c) => ({ jazzcash: !!(c.jazzcash.enabled && c.jazzcash.merchantId && c.jazzcash.password && c.jazzcash.salt), easypaisa: !!(c.easypaisa.enabled && c.easypaisa.storeId && c.easypaisa.hashKey), simulator: GW_SIM });
    app.get('/api/saas/paygw', requireSuperadmin, async (req, res) => {
      const c = await gwLoad();
      res.json({ jazzcash: { enabled: c.jazzcash.enabled, mode: c.jazzcash.mode, merchantId: c.jazzcash.merchantId, passwordSet: !!c.jazzcash.password, saltSet: !!c.jazzcash.salt },
        easypaisa: { enabled: c.easypaisa.enabled, mode: c.easypaisa.mode, storeId: c.easypaisa.storeId, hashKeySet: !!c.easypaisa.hashKey },
        ready: gwReady(c), simulator: GW_SIM, urls: { jazzcashReturn: apiBase(req) + '/api/saas/pay-return/jazzcash', easypaisaIpn: apiBase(req) + '/api/saas/pay-ipn/easypaisa' } });
    });
    app.put('/api/saas/paygw', requireSuperadmin, async (req, res) => {
      try {
        const b = req.body || {}, old = (await rawStore.getMeta(GW_META)) || {}, jb = b.jazzcash || {}, eb = b.easypaisa || {}, ID = /^[A-Za-z0-9_.-]{3,60}$/;
        const sec = (v, keep) => { v = String(v == null ? '' : v); if (!v) return keep || ''; if (v.length > 120) throw new Error('A secret is too long'); return encPw(v); };
        const next = { jazzcash: Object.assign({}, old.jazzcash), easypaisa: Object.assign({}, old.easypaisa) };
        if (b.jazzcash) {
          const id = String(jb.merchantId == null ? (old.jazzcash || {}).merchantId || '' : jb.merchantId).trim(); if (id && !ID.test(id)) throw new Error('JazzCash Merchant ID looks wrong');
          next.jazzcash = { enabled: !!jb.enabled, mode: jb.mode === 'live' ? 'live' : 'sandbox', merchantId: id, password: sec(jb.password, (old.jazzcash || {}).password), salt: sec(jb.salt, (old.jazzcash || {}).salt) };
        }
        if (b.easypaisa) {
          const id = String(eb.storeId == null ? (old.easypaisa || {}).storeId || '' : eb.storeId).trim(); if (id && !ID.test(id)) throw new Error('Easypaisa Store ID looks wrong');
          next.easypaisa = { enabled: !!eb.enabled, mode: eb.mode === 'live' ? 'live' : 'sandbox', storeId: id, hashKey: sec(eb.hashKey, (old.easypaisa || {}).hashKey) };
        }
        await rawStore.setMeta(GW_META, next);
        console.log('[labpos-cloud] saas: online payment settings updated (jazzcash ' + (next.jazzcash.enabled ? next.jazzcash.mode : 'off') + ', easypaisa ' + (next.easypaisa.enabled ? next.easypaisa.mode : 'off') + ')');
        const c = await gwLoad(); res.json({ ok: true, ready: gwReady(c) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    /* what the lab's Subscription page may offer */
    app.get('/api/saas/pay-options', needUser, async (req, res) => res.json(gwReady(await gwLoad())));
    const appBack = (res, what) => res.redirect(302, APP_URL + '/app/#/subscription?pay=' + what);
    /* a verified "paid" report for a payment request: extend the subscription exactly once */
    async function onlinePaid(txnRef, gateway, amount) {
      const p = (await rawStore.all(saas.PAY_T)).find((x) => x.online && x.txnRef === txnRef && x.gateway === gateway);
      if (!p) return { ok: false, why: 'unknown payment' };
      if (Math.abs((+amount || 0) - (+p.amount || 0)) > 0.009) { console.log('[labpos-cloud] saas: online payment ' + txnRef + ' amount mismatch (' + amount + ' vs ' + p.amount + ') - left for the operator'); return { ok: false, why: 'amount mismatch' }; }
      if (payBusy.has(p.id)) return { ok: false, why: 'busy' };
      payBusy.add(p.id);
      try {
        const cur = await rawStore.get(saas.PAY_T, p.id);
        if (cur.status === 'approved') return { ok: true, already: true };
        if (cur.status !== 'awaiting' && cur.status !== 'pending' && cur.status !== 'failed') return { ok: false, why: 'already ' + cur.status };
        const lab = await saas.getLab(cur.labId); if (!lab) return { ok: false, why: 'lab gone' };
        await settlePayment(cur, lab, true, 'Paid online (' + gateway + ')', gateway);
        return { ok: true };
      } finally { payBusy.delete(p.id); }
    }
    app.post('/api/saas/pay-online', needAdmin, async (req, res) => {
      try {
        const lab = req.lab || await saas.getLab('main'), b = req.body || {}, plans = await saas.getPlans();
        if (!plans[b.plan] || b.plan === 'trial' || b.plan === 'enterprise') return res.status(400).json({ error: 'Choose Starter or Professional (for Enterprise, contact us)' });
        const period = b.period === 'yearly' ? 'yearly' : 'monthly', gateway = String(b.gateway || ''), cfg = await gwLoad(), ready = gwReady(cfg);
        if (['jazzcash', 'easypaisa', 'simulator'].indexOf(gateway) < 0 || !ready[gateway]) return res.status(400).json({ error: 'This payment method is not available right now' });
        const amount = period === 'yearly' ? +plans[b.plan].yearly : +plans[b.plan].monthly;
        if (!(amount > 0)) return res.status(400).json({ error: 'This plan has no price set' });
        const recent = (await rawStore.all(saas.PAY_T)).filter((x) => x.labId === lab.id && x.online && x.status === 'awaiting' && Date.now() - Date.parse(x.createdAt) < DAY_MS);
        if (recent.length >= 5) return res.status(429).json({ error: 'Too many unfinished online payments today. Finish one, or pay manually.' });
        const txnRef = 'T' + Date.now() + crypto.randomBytes(3).toString('hex');
        const p = { id: 'P' + crypto.randomBytes(5).toString('hex'), labId: lab.id, labName: lab.name, labSlug: lab.slug, plan: b.plan, period, amount, method: { jazzcash: 'JazzCash (online)', easypaisa: 'Easypaisa (online)', simulator: 'Test payment' }[gateway],
          gateway, online: true, txnRef, reference: txnRef, note: '', status: 'awaiting', createdAt: new Date().toISOString(), by: req.user.name };
        await rawStore.put(saas.PAY_T, p);
        const o = { txnRef, amount, billRef: lab.slug, description: plans[b.plan].name + ' ' + period, email: lab.ownerEmail };
        const checkout = gateway === 'jazzcash' ? paygw.jcCheckout(cfg.jazzcash, Object.assign(o, { returnUrl: apiBase(req) + '/api/saas/pay-return/jazzcash' }))
          : gateway === 'easypaisa' ? paygw.epCheckout(cfg.easypaisa, Object.assign(o, { returnUrl: apiBase(req) + '/api/saas/pay-return/easypaisa' }))
          : { method: 'GET', url: apiBase(req) + '/api/saas/pay-sim/' + p.id, fields: null };
        console.log('[labpos-cloud] saas: online payment started', lab.slug, gateway, p.plan, p.period, txnRef);
        res.json({ ok: true, checkout, payment: payView(p) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    /* JazzCash posts the customer's browser back here with a signed result */
    app.post('/api/saas/pay-return/jazzcash', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
      try {
        const cfg = (await gwLoad()).jazzcash, v = paygw.jcVerify(cfg, req.body || {});
        if (!v.ok) { console.log('[labpos-cloud] saas: JazzCash return rejected (' + v.why + ')'); return appBack(res, 'invalid'); }
        if (v.paid) { const r = await onlinePaid(v.txnRef, 'jazzcash', v.amount); return appBack(res, r.ok ? 'ok' : 'wait'); }
        const p = (await rawStore.all(saas.PAY_T)).find((x) => x.online && x.txnRef === v.txnRef && x.gateway === 'jazzcash');
        if (p && p.status === 'awaiting') { p.status = 'failed'; p.decidedAt = new Date().toISOString(); p.decisionNote = String(v.message || 'Payment not completed').slice(0, 200); await rawStore.put(saas.PAY_T, p); }
        return appBack(res, 'failed');
      } catch (e) { console.log('[labpos-cloud] saas: JazzCash return error', String(e && e.message || e).slice(0, 120)); return appBack(res, 'wait'); }
    });
    /* Easypaisa: first the customer's browser comes back with an auth token which is handed back to Easypay to finish; the real confirmation is the IPN below */
    app.get('/api/saas/pay-return/easypaisa', async (req, res) => {
      const t = String(req.query.auth_token || '');
      if (!t) return appBack(res, 'wait');
      try { return res.redirect(302, paygw.epConfirmUrl((await gwLoad()).easypaisa, t, apiBase(req) + '/api/saas/pay-final/easypaisa')); } catch (e) { return appBack(res, 'wait'); }
    });
    app.get('/api/saas/pay-final/easypaisa', (req, res) => appBack(res, 'wait'));
    const epIpn = async (req, res) => {
      try {
        const url = String((req.query && req.query.url) || (req.body && req.body.url) || '');
        if (!paygw.epIpnUrlOk(url)) return res.status(400).send('bad url');
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 10000);
        let j; try { const r = await fetch(url, { signal: ac.signal }); j = await r.json(); } finally { clearTimeout(tm); }
        const t = paygw.epReadTxn(j);
        if (t.ok && t.paid && t.txnRef) await onlinePaid(t.txnRef, 'easypaisa', t.amount);
        res.send('OK');
      } catch (e) { console.log('[labpos-cloud] saas: Easypaisa IPN error', String(e && e.message || e).slice(0, 120)); res.status(500).send('error'); }
    };
    app.get('/api/saas/pay-ipn/easypaisa', epIpn);
    app.post('/api/saas/pay-ipn/easypaisa', express.urlencoded({ extended: false, limit: '64kb' }), epIpn);
    /* test-only "bank": a page with a Pay and a Cancel button, so the whole flow can be tried without real money. Exists only when PAY_SIMULATOR=1. */
    if (GW_SIM) {
      app.get('/api/saas/pay-sim/:id', async (req, res) => {
        const p = await rawStore.get(saas.PAY_T, req.params.id); if (!p || p.gateway !== 'simulator') return res.status(404).send('unknown');
        res.type('html').send('<!doctype html><meta charset="utf-8"><title>Test payment</title><body style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center"><h2>Test payment page</h2><p>Rs ' + (+p.amount) + ' for ' + String(p.plan).replace(/[^a-z]/g, '') + ' (' + String(p.period).replace(/[^a-z]/g, '') + ')</p>' +
          '<form method="post" action="/api/saas/pay-sim/' + encodeURIComponent(p.id) + '/pay" style="display:inline"><button style="padding:12px 24px;font-size:16px">Pay</button></form> <form method="post" action="/api/saas/pay-sim/' + encodeURIComponent(p.id) + '/cancel" style="display:inline"><button style="padding:12px 24px;font-size:16px">Cancel</button></form></body>');
      });
      app.post('/api/saas/pay-sim/:id/:act', async (req, res) => {
        const p = await rawStore.get(saas.PAY_T, req.params.id); if (!p || p.gateway !== 'simulator') return res.status(404).send('unknown');
        if (req.params.act === 'pay') { const r = await onlinePaid(p.txnRef, 'simulator', p.amount); return appBack(res, r.ok ? 'ok' : 'wait'); }
        if (p.status === 'awaiting') { p.status = 'failed'; p.decidedAt = new Date().toISOString(); p.decisionNote = 'Cancelled'; await rawStore.put(saas.PAY_T, p); }
        return appBack(res, 'failed');
      });
    }
    /* ---- email sender (SMTP) for password-reset mails: configured here instead of editing server files ---- */
    const mailView = async () => { const m = (await rawStore.getMeta(MAIL_META)) || null, cur = mailer.current(); return { configured: mailer.configured(), source: cur ? cur.source : 'none', host: (m && m.host) || (cur && cur.host) || '', port: (m && m.port) || (cur && cur.port) || 587, secure: cur ? !!cur.secure : !!(m && m.secure), user: (m && m.user) || (cur && cur.user) || '', from: (m && m.from) || (cur && cur.from) || '', passSet: !!((m && m.pass) || (cur && cur.pass)) }; };
    app.get('/api/saas/mail', requireSuperadmin, async (req, res) => res.json(await mailView()));
    app.put('/api/saas/mail', requireSuperadmin, async (req, res) => {
      try {
        const b = req.body || {};
        if (b.clear) { await rawStore.setMeta(MAIL_META, null); mailer.setConfig(null); return res.json(await mailView()); }
        const host = String(b.host || '').trim(), user = String(b.user || '').trim(), from = String(b.from || '').trim(), port = +b.port;
        if (!host || host.length > 200 || /\s/.test(host)) return res.status(400).json({ error: 'Enter the SMTP server address (for example smtp.gmail.com)' });
        if (!(port >= 1 && port <= 65535)) return res.status(400).json({ error: 'Port must be between 1 and 65535 (usually 587 or 465)' });
        if (user.length > 200 || from.length > 300) return res.status(400).json({ error: 'Username or From address is too long' });
        const old = (await rawStore.getMeta(MAIL_META)) || {};
        let pass = old.pass || '';
        if (typeof b.pass === 'string' && b.pass !== '') { if (b.pass.length > 300) return res.status(400).json({ error: 'Password is too long' }); pass = encPw(b.pass.replace(/\s+/g, '')); } /* app passwords are shown with spaces: strip them */
        await rawStore.setMeta(MAIL_META, { host, port, secure: mailer.tlsFor(port, !!b.secure), user, from, pass });
        await loadMailConfig();
        res.json(await mailView());
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.post('/api/saas/mail/test', requireSuperadmin, async (req, res) => {
      const to = String((req.body || {}).to || '').trim();
      if (!EMAIL_OK.test(to)) return res.status(400).json({ error: 'Enter an email address to send the test to' });
      if (!mailer.configured()) return res.status(400).json({ error: 'Save the email settings first' });
      try {
        await mailer.send({ to, subject: 'Optix Medical Sync — test email', text: 'This is a test email from your Optix Medical Sync server. If you can read it, password-reset emails will be delivered.', html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#131845"><h2>Test email</h2><p>This is a test email from your <b>Optix Medical Sync</b> server. If you can read it, password-reset emails will be delivered.</p></div>' });
        res.json({ ok: true });
      } catch (e) { console.error('[labpos-cloud] mail test failed:', String((e && e.message) || e).slice(0, 200)); res.status(400).json({ error: mailer.friendlyError(e) }); }
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
    app.post('/api/sync', needUser, async (req, res) => { await withLock(lockKey(req), () => syncOnce(req, res)); });
    async function syncOnce(req, res) {
      const store = req.store;
      try {
        const body = req.body || {}, since = +body.since || 0, admin = req.user.role === 'admin';
        /* plan limits apply to desktop sync too: the whole batch is refused (data stays safe on the PC) rather than silently exceeding the plan */
        for (const tb of ['users', 'invoices']) {
          const incoming = (body.rows || []).filter((x) => x && x.t === tb && x.row && x.row.id != null && !(tb === 'users' && !admin)).map((x) => x.row);
          if (incoming.length) { const e = await limitErr(req, tb, incoming); if (e) return res.status(402).json(e); }
        }
        const applied = new Set(), skipped = [], maxU = Date.now() + 5 * 60 * 1000;
        for (const x of body.rows || []) {
          if (!x || !okTable(x.t) || !x.row || x.row.id == null) continue;
          const t = x.t, id = String(x.row.id);
          if ((t === 'users' || t === 'settings') && !admin) { skipped.push({ t, id, _u: x.row._u }); continue; }
          /* the audit trail is append-only: only an admin's PC may add entries (create-if-absent), nobody can overwrite them */
          if (t === 'audit' && (!admin || await store.get('audit', id))) continue;
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
          if (!d || !okTable(d.t) || d.id == null || d.t === 'audit') continue; /* audit entries can never be deleted through sync */
          if ((d.t === 'users' || d.t === 'settings') && !admin) continue;
          const u = Math.min(+d._u || 0, maxU), ex = await store.get(d.t, String(d.id));
          if (ex && (+ex._u || 0) > u) continue;
          await store.delSync(d.t, String(d.id), u);
          applied.add(d.t + '|' + d.id);
        }
        const ch = await store.changesSince(since, applied);
        if (!admin) { ch.rows = ch.rows.filter((x) => x.t !== 'audit'); ch.deletes = ch.deletes.filter((d) => d.t !== 'audit'); } /* only admins may read the audit trail */
        let cursor = since;
        for (const x of ch.rows) cursor = Math.max(cursor, +x.row._s || 0);
        for (const d of ch.deletes) cursor = Math.max(cursor, +d._s || 0);
        res.json({ cursor, rows: ch.rows.map(x => ({ t: x.t, row: pwStrip(x.t, x.row) })), deletes: ch.deletes, skipped });
      } catch (e) { console.error('[labpos-cloud] sync failed:', e); res.status(500).json({ error: 'sync failed' }); }
    }
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
      if (buf.slice(0, 4).toString('latin1') !== '%PDF') return res.status(400).json({ error: 'not a PDF file' });
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
  /* ---- send a finished report by email or to a Slack channel (cloud labs). Email goes out through the one mailbox set up in the superadmin console,
     but shows the LAB's name as the sender and replies go to the lab. The wording is fixed (no free text), recipients are limited per minute / per day
     per lab, and every send is written to the lab's audit log. Slack uses the lab's own incoming-webhook URL, stored encrypted. ---- */
  if (!DESKTOP) {
    const shareUser = new Map(), shareLab = new Map(), sharePair = new Map(), slackHits = new Map();
    const EMAILS_PER_DAY = +process.env.EMAIL_REPORTS_PER_DAY || 40;
    const SLACK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_\/-]{10,200}$/;
    const clean1 = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t<>"`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
    const maskEmail = (e) => String(e).replace(/^(.).*(@.*)$/, '$1***$2');
    const linkOf = (req, key) => (PUBLIC_API_URL || (req.protocol + '://' + req.get('host'))) + '/r/' + key;
    function ownPdf(req, key) {
      if (!REPORT_KEY_RE.test(String(key || ''))) return null;
      const f = path.join(REPORT_PDFS_DIR, key + '.pdf'), o = path.join(REPORT_PDFS_DIR, key + '.owner'), me = req.lab ? req.lab.id : 'main';
      if (!fs.existsSync(f) || (fs.existsSync(o) ? fs.readFileSync(o, 'utf8').trim() : 'main') !== me) return null;
      return f;
    }
    app.get('/api/share/status', needUser, async (req, res) => {
      const m = (await req.store.getMeta('slack')) || {};
      res.json({ email: mailer.configured(), perDay: EMAILS_PER_DAY, slack: !!m.webhook, slackAuto: !!(m.webhook && m.auto), slackTail: m.webhook ? decPw(m.webhook).slice(-4) : '' });
    });
    app.post('/api/share/email', needUser, async (req, res) => {
      try {
        if (!mailer.configured()) return res.status(503).json({ error: 'Email sending is not set up on this server yet. Ask the system owner to set it up.' });
        const b = req.body || {}, to = String(b.to || '').trim(), lid = req.lab ? req.lab.id : 'main';
        if (!EMAIL_OK.test(to) || to.length > 120 || /[,;\s]/.test(to)) return res.status(400).json({ error: 'Enter one valid email address' });
        const f = ownPdf(req, b.key); if (!f) return res.status(404).json({ error: 'The report PDF was not found. Open the report again and retry.' });
        if (bump(shareUser, req.user.id + '|' + lid, 60000).n > 6) return res.status(429).json({ error: 'Too many emails in a minute. Please wait a moment.' });
        if (hot(sharePair, lid + '|' + to.toLowerCase() + '|' + b.key, 1)) return res.status(429).json({ error: 'This report was just emailed to this address.' });
        if (bump(shareLab, lid, 86400000).n > EMAILS_PER_DAY) return res.status(429).json({ error: 'Your lab reached today\'s limit of ' + EMAILS_PER_DAY + ' report emails. It resets in 24 hours.' });
        bump(sharePair, lid + '|' + to.toLowerCase() + '|' + b.key, 120000);
        const buf = fs.readFileSync(f); if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'The report PDF is too large to email. Send the link on WhatsApp instead.' });
        const st = (await req.store.get('settings', 'main')) || {}, labName = clean1(st.labName || (req.lab && req.lab.name) || 'Your lab', 80);
        const kind = b.kind === 'doctor' ? 'doctor' : 'patient', name = clean1(b.name, 60), invNo = clean1(b.invoiceNo, 30);
        const mail = mailer.reportEmail({ labName, name, kind, link: linkOf(req, b.key), invNo, labPhone: clean1(st.phone, 40), labEmail: EMAIL_OK.test(String(st.email || '')) ? clean1(st.email, 80) : '', note: clean1(st.emailNote, 200) });
        await mailer.send(Object.assign({ to, fromName: labName + ' (via Optix Medical Sync)', replyTo: EMAIL_OK.test(String(st.email || '')) ? String(st.email).trim() : undefined,
          attachments: [{ filename: 'Lab-Report-' + (invNo.replace(/[^A-Za-z0-9_-]/g, '') || 'report') + '.pdf', content: buf, contentType: 'application/pdf' }] }, mail));
        await auditLog(req, 'email-report', 'report', b.key, { label: kind + ' ' + maskEmail(to) + (invNo ? ' (' + invNo + ')' : '') });
        res.json({ ok: true });
      } catch (e) { console.error('[labpos-cloud] report email failed:', String((e && e.message) || e).slice(0, 200)); res.status(502).json({ error: mailer.friendlyError(e) }); }
    });

    app.post('/api/backup/email', needAdmin, async (req, res) => {
      try {
        const b = req.body || {}, to = String(b.email || '').trim();
        if (!EMAIL_OK.test(to) || to.length > 120 || /[,;\s]/.test(to)) {
          return res.status(400).json({ error: 'Valid email address darj karein.' });
        }
        if (!mailer.configured()) {
          return res.json({ ok: false, mailNotConfigured: true, error: 'Server mail is not configured yet.' });
        }
        const dump = sanitizeDump(await req.store.dump());
        const jsonStr = JSON.stringify(dump, null, 2);
        const buf = Buffer.from(jsonStr, 'utf8');
        const st = (await req.store.get('settings', 'main')) || {};
        const labName = clean1(st.labName || (req.lab && req.lab.name) || 'Optix Medical Sync', 80);
        const dateStr = new Date().toISOString().slice(0, 10);
        const fname = 'optix-lab-backup-' + (labName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'lab') + '-' + dateStr + '.json';

        await mailer.send({
          to,
          fromName: labName + ' Backup',
          subject: `[Optix LAB MedSync] System Database Backup - ${dateStr}`,
          text: `Assalam-o-Alaikum,\n\nYour Optix LAB MedSync database backup (${fname}) is attached to this email.\n\nLab: ${labName}\nDate: ${new Date().toLocaleString()}\nSize: ${(buf.length / 1024).toFixed(1)} KB\n\nYou can keep this safe in your Google Drive or restore it from Settings -> Backup.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <h2 style="color:#0f172a;margin:0 0 12px 0">Optix LAB MedSync — Database Backup</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6">Your latest lab database backup has been generated successfully and is attached to this email.</p>
            <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:14px 18px;margin:18px 0;border-radius:6px">
              <p style="margin:4px 0;color:#1e293b"><strong>Lab Name:</strong> ${labName}</p>
              <p style="margin:4px 0;color:#1e293b"><strong>Backup File:</strong> <code>${fname}</code></p>
              <p style="margin:4px 0;color:#1e293b"><strong>Size:</strong> ${(buf.length / 1024).toFixed(1)} KB</p>
              <p style="margin:4px 0;color:#1e293b"><strong>Generated At:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <p style="color:#64748b;font-size:13px;line-height:1.5">You can keep this backup file safe in your Google Drive. In case of any system emergency or migration, you can restore your entire data from <strong>Settings &rarr; Backup</strong> in Optix LAB MedSync.</p>
          </div>`,
          attachments: [{
            filename: fname,
            content: buf,
            contentType: 'application/json'
          }]
        });
        await auditLog(req, 'backup-email', 'system', '', { label: `Backup sent to ${maskEmail(to)}` });
        res.json({ ok: true, emailed: true, filename: fname, size: buf.length });
      } catch (e) {
        console.error('[labpos-cloud] backup email failed:', String((e && e.message) || e).slice(0, 200));
        res.status(502).json({ error: mailer.friendlyError(e) });
      }
    });

    async function slackPost(url, text) {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
      try {
        const r = await fetch(process.env.SLACK_TEST_URL || url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: ac.signal }); /* SLACK_TEST_URL: tests only */
        if (!r.ok) { const t = (await r.text().catch(() => '')).slice(0, 60); throw new Error(/no_service|invalid_token|403|404/.test(t + r.status) ? 'Slack did not accept this webhook URL. Create a new one in Slack and save it again.' : 'Slack error: ' + (t || r.status)); }
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'Could not reach Slack. Please try again.' : e.message); }
      finally { clearTimeout(to); }
    }
    const slackEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    app.put('/api/share/slack', needAdmin, async (req, res) => {
      try {
        const b = req.body || {}, old = (await req.store.getMeta('slack')) || {};
        if (b.clear) { await req.store.setMeta('slack', null); return res.json({ ok: true, slack: false }); }
        let webhook = old.webhook || '';
        if (typeof b.webhook === 'string' && b.webhook.trim()) {
          const u = b.webhook.trim(); if (!SLACK_RE.test(u)) return res.status(400).json({ error: 'That is not a Slack webhook URL. It starts with https://hooks.slack.com/services/' });
          webhook = encPw(u);
        }
        if (!webhook) return res.status(400).json({ error: 'Paste the Slack webhook URL first' });
        await req.store.setMeta('slack', { webhook, auto: b.auto !== undefined ? !!b.auto : !!old.auto });
        res.json({ ok: true, slack: true, slackAuto: b.auto !== undefined ? !!b.auto : !!old.auto, slackTail: decPw(webhook).slice(-4) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.post('/api/share/slack/test', needAdmin, async (req, res) => {
      try {
        const m = (await req.store.getMeta('slack')) || {}; if (!m.webhook) return res.status(400).json({ error: 'Save the webhook URL first' });
        const st = (await req.store.get('settings', 'main')) || {};
        await slackPost(decPw(m.webhook), '✅ Test message from Optix Medical Sync — ' + slackEsc(clean1(st.labName || 'your lab', 60)) + '. Report notifications will appear here.');
        res.json({ ok: true });
      } catch (e) { res.status(502).json({ error: e.message }); }
    });
    app.post('/api/share/slack', needUser, async (req, res) => {
      try {
        const m = (await req.store.getMeta('slack')) || {}, b = req.body || {}, lid = req.lab ? req.lab.id : 'main';
        if (!m.webhook) return res.status(400).json({ error: 'Slack is not set up. Add the webhook URL in Tools → Email → Settings.' });
        if (!ownPdf(req, b.key)) return res.status(404).json({ error: 'The report PDF was not found. Open the report again and retry.' });
        if (bump(slackHits, lid, 3600000).n > 200) return res.status(429).json({ error: 'Too many Slack messages this hour.' });
        const st = (await req.store.get('settings', 'main')) || {};
        const line = (b.event === 'ready' ? '📄 *Report ready*' : '📄 *Lab report*') + ' — ' + slackEsc(clean1(b.name, 60) || 'patient') + (b.invoiceNo ? ' · ' + slackEsc(clean1(b.invoiceNo, 30)) : '') +
          (b.tests ? '\n' + slackEsc(clean1(b.tests, 160)) : '') + '\n<' + linkOf(req, b.key) + '|Open report PDF>  ·  ' + slackEsc(clean1(st.labName || '', 60));
        await slackPost(decPw(m.webhook), line);
        await auditLog(req, 'slack-report', 'report', b.key, { label: (b.event === 'ready' ? 'auto ' : '') + (clean1(b.invoiceNo, 30) || '') });
        res.json({ ok: true });
      } catch (e) { res.status(502).json({ error: e.message }); }
    });
  }

  /* ---- Patient & doctor portal: a person types their mobile number, gets a 6-digit code on WhatsApp (the LAB's own WhatsApp API) or by email,
     and sees only their own reports (patient) or the reports of the patients they referred plus their commission (doctor).
     Codes are random, stored hashed, valid 10 minutes, 5 tries, and every step is rate limited; "request code" always answers the same
     whether or not the number exists. The portal token is a different type of token that the normal API ignores. ---- */
  if (!DESKTOP) {
    const dns = require('dns').promises, net = require('net');
    const waGw = require('./wa-gateway').create({ raw: rawStore, log: (m) => console.log('[labpos-cloud]', m) });
    const PSECRET = SESSION_SECRET + ':portal', OTP_TTL = 10 * 60000, PTOKEN_TTL = 30 * 60000;
    const prReq = new Map(), prVer = new Map(), prPhone = new Map(), prLab = new Map();
    const linkOf = (req, key) => (PUBLIC_API_URL || (req.protocol + '://' + req.get('host'))) + '/r/' + key;
    const pkey = (p) => String(p || '').replace(/\D/g, '').slice(-10);
    const pwa = (p) => { let d = String(p || '').replace(/\D/g, ''); while (d.indexOf('00') === 0) d = d.slice(2); if (d.charAt(0) === '0') d = '92' + d.slice(1); return d; };
    const isPrivateIp = (a) => {
      if (net.isIPv6(a)) return /^(::1?|fe80|fc|fd|::ffff:(10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168))/i.test(a);
      const o = a.split('.').map(Number); return o[0] === 10 || o[0] === 127 || o[0] === 0 || (o[0] === 169 && o[1] === 254) || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 100 && o[1] >= 64 && o[1] <= 127);
    };
    async function assertPublicUrl(u) {
      if (process.env.PORTAL_ALLOW_PRIVATE === '1') return;
      const url = new URL(u); if (url.protocol !== 'https:') throw new Error('The WhatsApp API address must start with https://');
      const addrs = await dns.lookup(url.hostname, { all: true }); if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) throw new Error('That WhatsApp API address is not allowed.');
    }
    async function waServerSend(cfg, to, text) {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
      try {
        let r;
        if (cfg.provider === 'custom' && cfg.baseUrl) { await assertPublicUrl(cfg.baseUrl); r = await fetch(cfg.baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, text, token: cfg.token }), signal: ac.signal }); }
        else r = await fetch('https://api.ultramsg.com/' + encodeURIComponent(cfg.instanceId) + '/messages/chat', { method: 'POST', body: new URLSearchParams({ token: cfg.token, to, body: text }), signal: ac.signal });
        if (!r.ok) throw new Error('WhatsApp provider answered ' + r.status);
      } finally { clearTimeout(t); }
    }
    const waOk = (w) => !!(w && ((w.provider === 'gateway' && w.gatewayNumber) || (w.provider === 'custom' && w.baseUrl && w.token) || (w.provider !== 'custom' && w.provider !== 'gateway' && w.instanceId && w.token)));
    async function portalCtx(slug) {
      slug = String(slug || '').trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
      const lab = await saas.findBySlug(slug); if (!lab || saas.effStatus(lab) === 'suspended') return null;
      const st = saas.storeFor(lab), set = (await st.get('settings', 'main')) || {}; if (!set.portalOn) return null;
      return { lab, st, set };
    }
    async function whoIs(st, k) {
      const pats = (await st.all('patients')).filter((p) => pkey(p.phone) === k || pkey(p.whatsapp) === k);
      const docs = (await st.all('doctors')).filter((d) => pkey(d.phone) === k || pkey(d.whatsapp) === k);
      return { pats, docs };
    }
    const otpKey = (lab, k) => 'portal_otp:' + crypto.createHash('sha256').update(lab.id + '|' + k).digest('hex').slice(0, 32);
    const otpHash = (lab, k, code) => crypto.createHash('sha256').update(PSECRET + '|' + lab.id + '|' + k + '|' + code).digest('hex');

    async function portalBuild(req, lab, st, set, w) {
      const invs = await st.all('invoices'), results = await st.all('results'), patById = {}; (await st.all('patients')).forEach((p) => { patById[p.id] = p; });
        const byInv = {}; results.forEach((r) => { (byInv[r.invoiceId] = byInv[r.invoiceId] || []).push(r); });
        const reportOf = (inv, forDoctor) => {
          const rs = byInv[inv.id] || [], items = Array.isArray(inv.items) ? inv.items : [], done = rs.length > 0 && items.every((it) => rs.some((r) => r.testId === it.testId && r.status === 'ready') || rs.some((r) => r.status === 'ready' && it.isPackage));
          const ready = rs.length > 0 && rs.every((r) => r.status === 'ready') && done, due = +inv.due || 0;
          const key = inv.reportPdfKey, havePdf = !!key && REPORT_KEY_RE.test(String(key)) && fs.existsSync(path.join(REPORT_PDFS_DIR, key + '.pdf'));
          return { no: inv.no || inv.id, date: inv.createdAt, patient: (patById[inv.patientId] || {}).name || '', tests: items.map((x) => x.name || x.code || '').filter(Boolean).join(', ').slice(0, 200),
            status: ready ? ((due > 0.009 && !forDoctor) ? 'locked' : (havePdf ? 'ready' : 'preparing')) : 'pending', due: due > 0.009 ? Math.round(due) : 0, total: forDoctor ? Math.round(+inv.total || 0) : undefined,
            link: ready && havePdf && (due <= 0.009 || forDoctor) ? linkOf(req, key) : '' };
        };
        const out = { ok: true, lab: { name: set.labName || lab.name }, patient: null, doctor: null };
        if (w.pats.length) {
          const ids = {}; w.pats.forEach((p) => { ids[p.id] = 1; });
          out.patient = { names: w.pats.map((p) => p.name), reports: invs.filter((i) => ids[i.patientId]).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200).map((i) => reportOf(i, false)) };
        }
        if (w.docs.length) {
          const dids = {}; w.docs.forEach((d) => { dids[d.id] = d; });
          const tById = {}; (await st.all('tests')).forEach((t) => { tById[t.id] = t; });
          const commissionOf = (inv, doc, tests) => {   /* same rules as the app: test rule > category rule > default % */
            const total = +inv.total || 0, base = +doc.commissionPct || 0, rules = Array.isArray(doc.commissionRules) ? doc.commissionRules : [];
            if (!rules.length) return total * base / 100;
            const byT = {}, byC = {}; rules.forEach((r) => { const v = +r.pct; if (isNaN(v) || !r.key) return; if (r.type === 'category') byC[String(r.key).toLowerCase()] = v; else byT[r.key] = v; });
            let sum = 0, comm = 0;
            (inv.items || []).forEach((it) => { const pr = +it.price || 0, c = String((tests[it.testId] || {}).category || '').toLowerCase(); const rate = byT[it.testId] != null ? byT[it.testId] : (byC[c] != null ? byC[c] : base); sum += pr; comm += pr * rate / 100; });
            return sum > 0 ? comm * (total / sum) : total * base / 100;
          };
          const mine = invs.filter((i) => dids[i.doctorId]).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
          const mk = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); };
          const months = {}; mine.forEach((i) => { const k = mk(i.createdAt); if (!k) return; const m = months[k] = months[k] || { month: k, referrals: 0, billed: 0, commission: 0, paid: 0 }; m.referrals++; m.billed += +i.total || 0; m.commission += commissionOf(i, dids[i.doctorId], tById); });
          w.docs.forEach((d) => (d.commissionPaid || []).forEach((x) => { const k = mk(x.date); if (k && months[k]) months[k].paid += +x.amount || 0; }));
          out.doctor = { names: w.docs.map((d) => d.name), months: Object.keys(months).sort().reverse().slice(0, 12).map((k) => { const m = months[k]; return { month: k, referrals: m.referrals, billed: Math.round(m.billed), commission: Math.round(m.commission), paid: Math.round(m.paid), due: Math.max(0, Math.round(m.commission - m.paid)) }; }),
            reports: mine.slice(0, 200).map((i) => reportOf(i, true)) };
        }
        return out;
    }
    app.get('/api/portal/info', async (req, res) => {
      const c = await portalCtx(req.query.lab);
      if (!c) return res.json({ enabled: false });
      res.json({ enabled: true, labName: c.set.labName || c.lab.name, tagline: c.set.tagline || '', logo: c.set.logo || '', whatsapp: waOk(c.set.whatsapp), email: mailer.configured() });
    });
    app.post('/api/portal/request', async (req, res) => {
      const SAME = { ok: true, message: 'If this number is registered with the lab, a 6-digit code is on its way (WhatsApp, or email if WhatsApp is not available). It is valid for 10 minutes.' };
      try {
        const b = req.body || {}, k = pkey(b.phone);
        if (!/^\d{10}$/.test(k)) return res.status(400).json({ error: 'Enter a valid mobile number (for example 0300 1234567)' });
        if (bump(prReq, req.ip, 3600000).n > 12) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        const c = await portalCtx(b.lab); if (!c) return res.json(SAME);
        res.json(SAME); /* answer first, send afterwards: the timing must not reveal whether the number exists */
        if (bump(prPhone, c.lab.id + '|' + k, 3600000).n > 3 || bump(prLab, c.lab.id, 86400000).n > (+process.env.PORTAL_OTPS_PER_DAY || 200)) return;
        const w = await whoIs(c.st, k); if (!w.pats.length && !w.docs.length) return;
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await rawStore.setMeta(otpKey(c.lab, k), { h: otpHash(c.lab, k, code), exp: Date.now() + OTP_TTL, tries: 0 });
        /* the link puts the number and code in the part after # — that part never reaches any server (or a WhatsApp link preview) — and opens the portal already signed in */
        const lname = String(c.set.labName || c.lab.name || 'Lab').slice(0, 60), plink = APP_URL + '/app/#/portal/' + c.lab.slug + '?p=' + k + '&c=' + code;
        const msg = '*' + lname + '*\n\nYour report access code is *' + code + '*.\nIt is valid for 10 minutes. Please do not share this code with anyone.\n\nOr tap to open your reports:\n' + plink;
        const people = w.pats.concat(w.docs), em = people.map((x) => String(x.email || '').trim()).find((e) => EMAIL_OK.test(e));
        let sent = false;
        if (waOk(c.set.whatsapp)) { try { if (c.set.whatsapp.provider === 'gateway') await waGw.sendUrgent(c.lab.id, pwa(b.phone), msg, 'portal-code'); else await waServerSend(c.set.whatsapp, pwa(b.phone), msg); sent = true; } catch (e) { console.error('[labpos-cloud] portal code (whatsapp) failed:', String(e.message || e).slice(0, 120)); } }
        if (!sent && em && mailer.configured()) { try { await mailer.send(Object.assign({ to: em, fromName: lname + ' (via Optix Medical Sync)' }, mailer.portalCodeEmail({ labName: lname, code, link: plink }))); sent = true; } catch (e) { console.error('[labpos-cloud] portal code (email) failed:', String(e.message || e).slice(0, 120)); } }
        if (!sent) await rawStore.setMeta(otpKey(c.lab, k), null);
      } catch (e) { if (!res.headersSent) res.json(SAME); }
    });
    app.post('/api/portal/verify', async (req, res) => {
      const BAD = { error: 'That code is wrong or has expired. Request a new one.' };
      try {
        if (bump(prVer, req.ip, 3600000).n > 40) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        const b = req.body || {}, k = pkey(b.phone), code = String(b.code || '').trim();
        const c = await portalCtx(b.lab); if (!c || !/^\d{10}$/.test(k) || !/^\d{6}$/.test(code)) return res.status(401).json(BAD);
        const rec = await rawStore.getMeta(otpKey(c.lab, k));
        if (!rec || rec.exp < Date.now()) return res.status(401).json(BAD);
        rec.tries = (rec.tries || 0) + 1;
        if (rec.tries > 5) { await rawStore.setMeta(otpKey(c.lab, k), null); return res.status(401).json(BAD); }
        const want = Buffer.from(rec.h, 'hex'), got = Buffer.from(otpHash(c.lab, k, code), 'hex');
        if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) { await rawStore.setMeta(otpKey(c.lab, k), rec); return res.status(401).json(BAD); }
        await rawStore.setMeta(otpKey(c.lab, k), null); /* one use */
        const w = await whoIs(c.st, k);
        const keep = b.remember === true, ttl = keep ? 30 * 86400000 : PTOKEN_TTL; /* "keep me signed in on this phone": 30 days, only if the person ticked it */
        res.json({ ok: true, token: signToken(PSECRET, { lab: c.lab.id, ph: k, exp: Date.now() + ttl }), expiresInMin: Math.round(ttl / 60000), days: keep ? 30 : 0, patient: w.pats.length > 0, doctor: w.docs.length > 0 });
      } catch (e) { res.status(401).json(BAD); }
    });
    app.get('/api/portal/data', async (req, res) => {
      try {
        const m = /^Bearer (.+)$/.exec(req.get('Authorization') || ''), t = m && readToken(PSECRET, m[1]);
        if (!t || !t.lab || !/^\d{10}$/.test(String(t.ph))) return res.status(401).json({ error: 'Your session expired. Please sign in again.', code: 'EXPIRED' });
        const lab = await saas.getLab(t.lab); if (!lab || saas.effStatus(lab) === 'suspended') return res.status(401).json({ error: 'Your session expired. Please sign in again.', code: 'EXPIRED' });
        const st = saas.storeFor(lab), set = (await st.get('settings', 'main')) || {}; if (!set.portalOn) return res.status(403).json({ error: 'The portal is switched off for this lab.' });
        res.json(await portalBuild(req, lab, st, set, await whoIs(st, t.ph)));
      } catch (e) { res.status(500).json({ error: 'Could not load your reports. Please try again.' }); }
    });

    /* ---- a doctor who has a login (Settings -> Users & Roles): the same data as the portal, without any code step ---- */
    app.get('/api/doctor/me', needUser, async (req, res) => {
      try {
        if (req.user.role !== 'doctor') return res.status(403).json({ error: 'This page is for doctor logins.' });
        const u = await req.store.get('users', req.user.id), doc = u && u.doctorId ? await req.store.get('doctors', String(u.doctorId)) : null;
        if (!doc) return res.status(404).json({ error: 'This login is not linked to a doctor. Ask the lab admin.' });
        const lab = req.lab || await saas.getLab('main'), set = (await req.store.get('settings', 'main')) || {};
        res.json(await portalBuild(req, lab, req.store, set, { pats: [], docs: [doc] }));
      } catch (e) { res.status(500).json({ error: 'Could not load your dashboard. Please try again.' }); }
    });

    /* ---- the lab's own WhatsApp number, linked with a QR code (see wa-gateway.js) ---- */
    const waUser = new Map();
    const labOf = (req) => (req.lab ? req.lab.id : 'main');
    /* the lab's chosen "sending speed" (seconds between queued messages, 10-600, default 60) */
    const applyGap = async (req) => { try { const st = (await req.store.get('settings', 'main')) || {}; waGw.setGap(labOf(req), st.whatsapp && st.whatsapp.gapSeconds); } catch (e) { /* default */ } };
    app.get('/api/wa/status', needUser, async (req, res) => { await applyGap(req); res.json(waGw.status(labOf(req))); });
    app.get('/api/wa/outbox', needUser, async (req, res) => { await applyGap(req); res.json(waGw.outbox(labOf(req))); });
    app.post('/api/wa/connect', needAdmin, async (req, res) => {
      try { await waGw.start(labOf(req), { fresh: true }); res.json(waGw.status(labOf(req))); } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.post('/api/wa/disconnect', needAdmin, async (req, res) => {
      try { await waGw.logout(labOf(req)); await auditLog(req, 'whatsapp-unlink', 'settings', 'whatsapp', { label: 'WhatsApp number unlinked' }); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.post('/api/wa/send', needUser, async (req, res) => {
      try {
        if (bump(waUser, req.user.id, 60000).n > 20) return res.status(429).json({ error: 'Too many WhatsApp messages in a minute. Please wait a moment.' });
        const b = req.body || {}; if (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 4000) return res.status(400).json({ error: 'The message is empty or too long' });
        await applyGap(req);
        if (b.kind === 'critical') { await waGw.sendUrgent(labOf(req), b.to, b.text, 'critical'); return res.json({ ok: true, queued: false }); } /* critical alerts must not wait in line */
        res.json(Object.assign({ ok: true }, waGw.sendText(labOf(req), b.to, b.text, 'report')));
      } catch (e) { res.status(/limit|not linked|not on WhatsApp|look right|waiting/.test(e.message) ? 400 : 502).json({ error: e.message }); }
    });
    app.post('/api/wa/send-doc', needUser, async (req, res) => {
      try {
        if (bump(waUser, req.user.id, 60000).n > 20) return res.status(429).json({ error: 'Too many WhatsApp messages in a minute. Please wait a moment.' });
        const b = req.body || {}, key = String(b.key || '');
        const f = REPORT_KEY_RE.test(key) ? path.join(REPORT_PDFS_DIR, key + '.pdf') : '', o = path.join(REPORT_PDFS_DIR, key + '.owner'), me = labOf(req);
        if (!f || !fs.existsSync(f) || (fs.existsSync(o) ? fs.readFileSync(o, 'utf8').trim() : 'main') !== me) return res.status(404).json({ error: 'The report PDF was not found' });
        const buf = fs.readFileSync(f); if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'The report PDF is too large to send on WhatsApp' });
        await applyGap(req); res.json(Object.assign({ ok: true }, waGw.sendDocument(me, b.to, buf, b.fileName || 'Lab-Report.pdf', b.caption || '')));
      } catch (e) { res.status(/limit|not linked|not on WhatsApp|look right|waiting/.test(e.message) ? 400 : 502).json({ error: e.message }); }
    });
    /* the five automatic messages (tick boxes in Settings -> WhatsApp), see wa-auto.js */
    const waAuto = require('./wa-auto').create({ saas, raw: rawStore, waGw, log: (m) => console.log('[labpos-cloud]', m) });
    waAuto.start();
    app.post('/api/wa/auto/test', needAdmin, async (req, res) => {
      try { await waAuto.summaryNow(req.lab || await saas.getLab('main')); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
    });
    if (process.env.WA_AUTO_TEST === '1') app.post('/api/wa/auto/run', needAdmin, async (req, res) => { /* tests only: run the jobs now (optionally "as of" a given time) */
      const b = req.body || {}; res.json({ sent: (await waAuto.runAll(b.now ? new Date(b.now) : new Date(), b.only)) || 0 });
    });
    /* bring back every lab that had linked a number before this restart */
    setTimeout(async () => { try { const ids = []; for (const l of (await saas.loadLabs(true)).values()) ids.push(l.id); await waGw.boot(ids); } catch (e) { /* the gateway is optional */ } }, 5000);
  }


  /* ---- SMS via SIM: server-side outbox. The lab's own Android app (com.optix.labmedsync,
     on the phone that holds the SIM) polls /api/sms/pending about every minute, sends each
     message with Android's SmsManager, and reports the result to /api/sms/report.
     No third-party gateway, no API keys, no tunnels. ---- */
  const smsUser = new Map(); /* per-user rate-limit buckets */
  const smsNorm = (num) => { let d = String(num || '').replace(/\D/g, ''); while (d.indexOf('00') === 0) d = d.slice(2); if (d.charAt(0) === '0') d = '92' + d.slice(1); return d; };
  const smsLabCfg = async (store) => {
    try { const s = await store.get('settings', 'main') || {}; return Object.assign({ enabled: false, simNumber: '' }, s.sms || {}); }
    catch (e) { return {}; }
  };
  const smsRowId = () => 'SMS' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  /* phone-gateway state (kv row, like wa_log: not a generic table) */
  const smsGwGet = async (store) => { try { return (await store.get('sms_gw', 'state')) || {}; } catch (e) { return {}; } };
  const smsGwSet = async (store, p) => {
    try { const cur = (await store.get('sms_gw', 'state')) || {}; await store.put('sms_gw', Object.assign({}, cur, p, { id: 'state' })); }
    catch (e) { /* state is best-effort */ }
  };

  /* queue one SMS for delivery through the lab's SIM */
  app.post('/api/sms/queue', needUser, async (req, res) => {
    try {
      if (bump(smsUser, req.user.id, 60000).n > 30) return res.status(429).json({ error: 'Too many SMS queued in a minute. Please wait a moment.' });
      const b = req.body || {};
      const to = smsNorm(b.to);
      if (!to || to.length < 10) return res.status(400).json({ error: 'The phone number does not look right' });
      const text = String(b.text || '').trim();
      if (!text || text.length > 1000) return res.status(400).json({ error: 'The message is empty or too long' });
      const kind = ['report', 'due', 'critical', 'test'].indexOf(b.kind) >= 0 ? b.kind : 'report';
      const toRole = b.toRole === 'doctor' ? 'doctor' : 'patient';
      const store = req.store;
      /* idempotency: never queue the same report/due SMS twice for an invoice */
      if ((kind === 'report' || kind === 'due') && b.invoiceId) {
        const dup = (await store.all('sms_outbox')).some((r) => r && r.kind === kind && String(r.invoiceId) === String(b.invoiceId) && r.toRole === toRole &&
          ['pending', 'sending', 'sent', 'delivered'].indexOf(r.status) >= 0);
        if (dup) return res.json({ ok: true, duplicate: true });
      }
      const row = { id: smsRowId(), to, text, kind, invoiceId: b.invoiceId || null, invoiceNo: String(b.invoiceNo || ''),
        toName: String(b.toName || ''), toRole, status: 'pending', attempts: 0, error: '',
        ts: new Date().toISOString(), sentAt: '', deliveredAt: '', gatewayId: '' };
      await store.put('sms_outbox', row);
      res.json({ ok: true, id: row.id });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /* re-queue failed messages (one id, or all=true) */
  app.post('/api/sms/retry', needUser, async (req, res) => {
    try {
      const b = req.body || {}, store = req.store;
      let n = 0;
      if (b.id) {
        const r = await store.get('sms_outbox', String(b.id));
        if (r && r.status === 'failed') { await store.patch('sms_outbox', r.id, { status: 'pending', attempts: 0, error: '' }); n = 1; }
      } else if (b.all) {
        const rows = await store.all('sms_outbox');
        for (const r of rows) if (r && r.status === 'failed') { await store.patch('sms_outbox', r.id, { status: 'pending', attempts: 0, error: '' }); n++; }
      }
      res.json({ ok: true, requeued: n });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /* recent outbox rows for the SMS log UIs */
  app.get('/api/sms/log', needUser, async (req, res) => {
    try {
      const q = req.query || {};
      let rows = await req.store.all('sms_outbox');
      if (q.invoiceId) rows = rows.filter((r) => String(r.invoiceId) === String(q.invoiceId));
      if (q.status) rows = rows.filter((r) => r.status === q.status);
      rows.sort((a, b) => (a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0)));
      const lim = Math.max(1, Math.min(+q.limit || 200, 1000));
      res.json({ ok: true, rows: rows.slice(0, lim) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /* gateway + queue health for the settings page */
  app.get('/api/sms/status', needUser, async (req, res) => {
    try {
      const cfg = await smsLabCfg(req.store);
      const rows = await req.store.all('sms_outbox');
      const pending = rows.filter((r) => r && (r.status === 'pending' || r.status === 'sending')).length;
      const failed = rows.filter((r) => r && r.status === 'failed').length;
      const gw = await smsGwGet(req.store);
      res.json({ ok: true, enabled: !!cfg.enabled, simNumber: cfg.simNumber || '', pending, failed,
        lastPoll: gw.lastPoll || '', lastSentAt: gw.lastSentAt || '', sentCount: gw.sentCount || 0 });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /* phone poll: the lab's Android app calls this ~every minute with its lab login
     token. Claims up to 20 pending rows (marked 'sending' so a second device will
     not double-send; stale claims older than 10 minutes are released). */
  app.get('/api/sms/pending', needUser, async (req, res) => {
    try {
      const store = req.store, now = Date.now(), out = [];
      const rows = await store.all('sms_outbox');
      for (const r of rows) {
        if (r && r.status === 'sending' && now - new Date(r.claimedAt || 0).getTime() > 10 * 60 * 1000)
          await store.patch('sms_outbox', r.id, { status: 'pending', claimedAt: '' });
      }
      const fresh = (await store.all('sms_outbox')).filter((r) => r && r.status === 'pending').slice(0, 20);
      const ts = new Date().toISOString();
      for (const r of fresh) {
        /* re-read before claiming: a concurrent poll may have claimed it first */
        const cur = await store.get('sms_outbox', r.id);
        if (!cur || cur.status !== 'pending') continue;
        await store.patch('sms_outbox', r.id, { status: 'sending', claimedAt: ts });
        out.push({ id: r.id, to: r.to, text: r.text });
      }
      await smsGwSet(store, { lastPoll: ts });
      res.json({ ok: true, rows: out });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  /* phone report: the app POSTs { id, status: sent|delivered|failed, error? }
     after trying each message. */
  app.post('/api/sms/report', needUser, async (req, res) => {
    try {
      const b = req.body || {}, store = req.store;
      const row = b.id ? await store.get('sms_outbox', String(b.id)) : null;
      if (!row) return res.status(404).json({ error: 'unknown message' });
      const st = String(b.status || '').toLowerCase(), now = new Date().toISOString(), patch = {};
      /* idempotent: never move a row backwards out of a terminal state */
      if (row.status === 'delivered') return res.json({ ok: true });
      if (st === 'delivered') { patch.status = 'delivered'; patch.deliveredAt = now; }
      else if (st === 'sent') {
        if (row.status === 'sent') return res.json({ ok: true }); /* already counted */
        patch.status = 'sent'; patch.sentAt = now;
      }
      else if (st === 'failed') { patch.status = 'failed'; patch.error = String(b.error || 'send failed').slice(0, 200); }
      else return res.status(400).json({ error: 'bad status' });
      await store.patch('sms_outbox', row.id, patch);
      if (st === 'sent' || st === 'delivered') {
        const gw = await smsGwGet(store);
        await smsGwSet(store, { lastSentAt: now, sentCount: (gw.sentCount || 0) + 1 });
      }
      res.json({ ok: true });
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
      if (!body.settings || typeof body.settings !== 'object' || !Array.isArray(body.users) || !body.users.some((u) => u && u.role === 'admin' && u.active !== false)) {
        return res.status(400).json({ error: 'Invalid backup: it must contain the lab settings and at least one active admin user' });
      }
      /* a restore cannot be used to get past the plan limits */
      if (saas && req.lab) {
        const lim = await saas.limitsOf(req.lab), nowYm = ymOf(Date.now());
        const nUsers = body.users.filter((u) => u && u.active !== false).length, nInv = (Array.isArray(body.invoices) ? body.invoices : []).filter((i) => i && ymOf(i._c || i.createdAt || 0) === nowYm).length;
        if (lim.users && nUsers > lim.users) return res.status(402).json({ error: 'This backup has ' + nUsers + ' active users; your plan allows ' + lim.users + '.', code: 'LIMIT_USERS' });
        if (lim.invoicesPerMonth && nInv > lim.invoicesPerMonth) return res.status(402).json({ error: 'This backup has ' + nInv + ' invoices this month; your plan allows ' + lim.invoicesPerMonth + '.', code: 'LIMIT_INVOICES' });
      }
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
    if (saas && req.lab && req.lab.id !== 'main' && !superKey(req)) return res.status(403).json({ error: 'Reset is not available for cloud labs — restore a backup instead' });
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      seed.users = await store.all('users'); /* keep the lab's own accounts + passwords: the shipped demo logins (admin123 …) are never reinstalled */
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
    if (req.user.role !== 'admin') { delete b.role; delete b.active; delete b.username; } /* staff cannot rename themselves into someone else's login */
    if (typeof b.username === 'string') {
      b.username = b.username.trim();
      if (b.username.length < 2 || b.username.length > 64) throw new Error('Username must be 2-64 characters');
      const dup = (await req.store.all('users')).some((u) => u.id !== (b.id != null ? String(b.id) : req.params.id) && String(u.username).toLowerCase() === b.username.toLowerCase());
      if (dup) throw new Error('This username is already taken');
    }
    if (req.user.role !== 'admin') { delete b.doctorId; delete b.roleId; }
    else {
      const ROLES = ['admin', 'reception', 'technician', 'doctor', 'custom'];
      if (b.role !== undefined && ROLES.indexOf(b.role) < 0) throw new Error('Unknown role');
      const before = existing ? ((await req.store.get('users', String(req.params.id))) || {}) : {};
      const role = b.role !== undefined ? b.role : before.role;
      if (role === 'doctor') {
        const did = b.doctorId !== undefined ? b.doctorId : before.doctorId;
        if (!did || !(await req.store.get('doctors', String(did)))) throw new Error('Choose the doctor this login belongs to');
        b.doctorId = String(did);
      } else if (b.role !== undefined || b.doctorId !== undefined) b.doctorId = null;
      if (role === 'custom') {
        const rid = b.roleId !== undefined ? b.roleId : before.roleId, set = (await req.store.get('settings', 'main')) || {};
        if (!rid || !(Array.isArray(set.customRoles) ? set.customRoles : []).some((r) => r && r.id === rid)) throw new Error('Choose one of your custom roles');
        b.roleId = String(rid);
      } else if (b.role !== undefined || b.roleId !== undefined) b.roleId = null;
    }
    if (typeof b.password === 'string' && b.password.length > 256) throw new Error('Password is too long');
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
      (!needle || (r.label + ' ' + r.user + ' ' + r.rowId + ' ' + (r.note || '') + ' ' + (r.changes || []).map((c) => c.f + ' ' + c.from + ' ' + c.to).join(' ')).toLowerCase().indexOf(needle) >= 0));
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
      if (t === 'invoices') { const e = await withLock(lockKey(req), () => limitErr(req, t, rows)); if (e) return res.status(402).json(e); }
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
      const create = async () => {
        if (body && body.id != null && t !== 'settings' && await store.get(t, String(body.id))) return res.status(409).json({ error: 'id already exists', id: body.id });
        const e = await limitErr(req, t, [body]); if (e) return res.status(402).json(e);
        const out = await store.put(t, body);
        await auditLog(req, 'create', t, out.id, { label: auditLabel(t, out), changes: auditDiff({}, out, 12) });
        res.json(t === 'users' ? stripUser(out) : out);
      };
      if (t === 'users' || t === 'invoices') await withLock(lockKey(req), create); else await create();
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put('/api/:table/:id', tableGuard, async (req, res) => {
    const store = req.store;
    try {
      const t = req.params.table;
      const body = t === 'users' ? await prepUserBody(req, true) : (req.body || {});
      const update = async () => {
        const before = await store.get(t, req.params.id);
        if (!before) { const e = await limitErr(req, t, [Object.assign({}, body, { id: req.params.id })]); if (e) return res.status(402).json(e); }
        const out = await store.patch(t, req.params.id, body);
        const ch = auditDiff(before, out);
        if (ch.length) await auditLog(req, before ? 'update' : 'create', t, req.params.id, { label: auditLabel(t, out), changes: ch });
        res.json(t === 'users' ? stripUser(out) : out);
      };
      if (t === 'users' || t === 'invoices') await withLock(lockKey(req), update); else await update();
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
  /* the web app is also served from this server (/app/): a second address that keeps working when Cloudflare Pages cannot be reached from some networks.
     The files (index.html + assets/) are copied to <releases>/webapp; HTML is never cached so a new release shows up at once. */
  app.use('/app', express.static(path.join(RELEASES_DIR, 'webapp'), { dotfiles: 'deny', index: 'index.html', setHeaders: (res, f) => { res.setHeader('Cache-Control', /\.html$/.test(f) ? 'no-cache' : 'public, max-age=3600'); } }));
  /* the superadmin console is served here too (/superadmin/): same reason as /app/ above — reachable when pages.dev is filtered.
     Its files (index.html + assets/) are copied to <releases>/superadmin; HTML is never cached. */
  app.use('/superadmin', express.static(path.join(RELEASES_DIR, 'superadmin'), { dotfiles: 'deny', index: 'index.html', setHeaders: (res, f) => { res.setHeader('Cache-Control', /\.html$/.test(f) ? 'no-cache' : 'public, max-age=3600'); } }));

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
