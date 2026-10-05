/* LabPOS cloud storage — SQLite via node:sqlite (zero native deps).
   Document-style: every row stored as JSON in kv(t, id, data).
   Interface matches db-pg.js exactly; all methods are async so the server
   can await both adapters uniformly. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const TABLES = ['settings', 'users', 'patients', 'tests', 'doctors', 'invoices', 'payments', 'expenses', 'results'];

async function openStore(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS kv (t TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (t, id));
           CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);

  const qAll = db.prepare('SELECT data FROM kv WHERE t = ?');
  const qGet = db.prepare('SELECT data FROM kv WHERE t = ? AND id = ?');
  const qPut = db.prepare('INSERT INTO kv (t, id, data) VALUES (?, ?, ?) ON CONFLICT(t, id) DO UPDATE SET data = excluded.data');
  const qDel = db.prepare('DELETE FROM kv WHERE t = ? AND id = ?');
  const qCount = db.prepare('SELECT COUNT(*) AS c FROM kv');
  const qMetaGet = db.prepare('SELECT v FROM meta WHERE k = ?');
  const qMetaPut = db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');

  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  const store = {
    async isEmpty() { return qCount.get().c === 0; },
    async all(t) { return qAll.all(t).map(r => parse(r.data)).filter(Boolean); },
    async get(t, id) { const r = qGet.get(t, id); return r ? parse(r.data) : null; },
    async put(t, row) {
      if (!row || row.id == null) throw new Error('row.id required');
      qPut.run(t, String(row.id), JSON.stringify(row));
      return row;
    },
    async patch(t, id, p) {
      const cur = await this.get(t, id) || { id };
      const next = Object.assign({}, cur, p, { id });
      return this.put(t, next);
    },
    async del(t, id) { qDel.run(t, id); },
    async getSeq() { const r = qMetaGet.get('seq'); return r ? parse(r.v) : {}; },
    async setSeq(s) { qMetaPut.run('seq', JSON.stringify(s || {})); },
    async getMeta(k) { const r = qMetaGet.get(k); return r ? parse(r.v) : null; },
    async setMeta(k, v) { qMetaPut.run(k, JSON.stringify(v === undefined ? null : v)); },
    async dump() {
      const out = { seq: await this.getSeq() };
      for (const t of TABLES) {
        if (t === 'settings') { out.settings = await this.get('settings', 'main'); }
        else out[t] = await this.all(t);
      }
      /* normalize seq from existing ids so client-generated ids never collide after restart */
      for (const t of TABLES) {
        if (t === 'settings') continue;
        let max = out.seq[t] || 0;
        for (const row of (out[t] || [])) {
          const m = String(row.id || '').match(/(\d+)$/);
          if (m) max = Math.max(max, parseInt(m[1], 10));
        }
        out.seq[t] = max;
      }
      return out;
    },
    async restore(d) {
      if (!d || typeof d !== 'object') throw new Error('bad dump');
      db.exec('DELETE FROM kv; DELETE FROM meta;');
      const putAll = db.prepare('INSERT INTO kv (t, id, data) VALUES (?, ?, ?)');
      const rows = [];
      for (const t of TABLES) {
        if (t === 'settings') { if (d.settings && d.settings.id) rows.push({ t, id: String(d.settings.id), data: JSON.stringify(d.settings) }); }
        else if (Array.isArray(d[t])) for (const row of d[t]) if (row && row.id != null) rows.push({ t, id: String(row.id), data: JSON.stringify(row) });
      }
      for (const r of rows) putAll.run(r.t, r.id, r.data);
      if (d.seq) await this.setSeq(d.seq);
    },
    async seed(seedObj) { return this.restore(seedObj); },
    async close() { db.close(); },
  };
  return store;
}

module.exports = { openStore, TABLES };
