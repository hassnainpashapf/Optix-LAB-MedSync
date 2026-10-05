/* LabPOS API server — Express + SQLite. Also serves the frontend statically.
   Used by the Electron desktop app (embedded) and optionally standalone. */
'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const { openStore, TABLES } = require('./store');

function start(opts) {
  opts = opts || {};
  const port = opts.port || 3765;
  const dbPath = opts.dbPath || path.join(__dirname, 'labpos.db');
  const wwwRoot = opts.wwwRoot || path.join(__dirname, '..');

  const store = openStore(dbPath);
  if (store.isEmpty()) {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      store.seed(seed);
      console.log('[labpos] seeded fresh database');
    } catch (e) { console.log('[labpos] seed skipped:', e.message); }
  }

  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.disable('x-powered-by');

  const okTable = (t) => TABLES.includes(t);

  /* ---- data API ---- */
  app.get('/api/dump', (req, res) => res.json(store.dump()));
  app.get('/api/tables', (req, res) => res.json(TABLES));
  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  /* ---- version / release manifest (additive; used by the desktop auto-updater).
     Cloud builds serve ../cloud/releases.json; otherwise report the local version. */
  app.get('/api/version', (req, res) => {
    let rel = null;
    try { rel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloud', 'releases.json'), 'utf8')); }
    catch (e) { /* no cloud manifest — fall through to local version */ }
    if (rel && rel.latest) {
      return res.json({
        latest: String(rel.latest),
        minRequired: String(rel.minRequired || rel.latest),
        bundleUrl: rel.bundleUrl || null,
        changelog: rel.changelog || '',
        sha256: rel.sha256 || null,
      });
    }
    let v = '1.0.0';
    const candidates = [
      path.join(__dirname, '..', 'electron-src', 'version.json'),
      path.join(__dirname, 'version.json'),
      path.join(__dirname, '..', 'version.json'),
    ];
    for (const p of candidates) {
      try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j && j.version) { v = String(j.version); break; } }
      catch (e) { /* try next */ }
    }
    res.json({ latest: v, minRequired: v, bundleUrl: null, changelog: '' });
  });
  /* frontend config: tells db.js where the API lives (must precede /:table routes) */
  app.get('/api-config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`window.LABPOS_API=${JSON.stringify(`http://127.0.0.1:${port}`)};`);
  });
  app.get('/api/:table', (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    res.json(store.all(req.params.table));
  });
  app.post('/api/:table', (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    try { res.json(store.put(req.params.table, req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put('/api/:table/:id', (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    res.json(store.patch(req.params.table, req.params.id, req.body || {}));
  });
  app.delete('/api/:table/:id', (req, res) => {
    if (!okTable(req.params.table)) return res.status(404).json({ error: 'unknown table' });
    store.del(req.params.table, req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = store.all('users').find(x => x.username === username && x.active !== false);
    if (!u || u.password !== password) return res.status(401).json({ error: 'Invalid username or password' });
    res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role } });
  });
  app.post('/api/restore', (req, res) => {
    try { store.restore(req.body); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/admin/reseed', (req, res) => {
    try {
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      store.seed(seed);
      res.json(store.dump());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  /* ---- static frontend ---- */
  app.use(express.static(wwwRoot, { index: 'index.html' }));

  return new Promise((resolve, reject) => {
    const srv = app.listen(port, '127.0.0.1', () => {
      console.log(`[labpos] API + app on http://127.0.0.1:${port} (db: ${dbPath})`);
      resolve({ port, server: srv, store });
    });
    srv.on('error', reject);
  });
}

if (require.main === module) {
  start({ port: process.env.PORT ? +process.env.PORT : 3765 }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { start };
