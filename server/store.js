/* LabPOS storage — SQLite via node:sqlite (zero native deps).
   Document-style: every row stored as JSON in kv(t, id, data). */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const TABLES = ['settings', 'users', 'patients', 'tests', 'doctors', 'invoices', 'payments', 'expenses', 'results', 'wa_log', 'appointments'];

function openStore(dbPath) {
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

  return {
    isEmpty() { return qCount.get().c === 0; },
    all(t) { return qAll.all(t).map(r => parse(r.data)).filter(Boolean); },
    get(t, id) { const r = qGet.get(t, id); return r ? parse(r.data) : null; },
    put(t, row) {
      if (!row || row.id == null) throw new Error('row.id required');
      qPut.run(t, String(row.id), JSON.stringify(row));
      return row;
    },
    patch(t, id, p) {
      const cur = this.get(t, id) || { id };
      const next = Object.assign({}, cur, p, { id });
      return this.put(t, next);
    },
    del(t, id) { qDel.run(t, id); },
    getSeq() { const r = qMetaGet.get('seq'); return r ? parse(r.v) : {}; },
    setSeq(s) { qMetaPut.run('seq', JSON.stringify(s || {})); },
    dump() {
      const out = { seq: this.getSeq() };
      for (const t of TABLES) {
        if (t === 'settings') { out.settings = this.get('settings', 'main') || null; }
        else out[t] = this.all(t);
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
    restore(d) {
      if (!d || typeof d !== 'object') throw new Error('bad dump');
      db.exec('DELETE FROM kv; DELETE FROM meta;');
      const putAll = db.prepare('INSERT INTO kv (t, id, data) VALUES (?, ?, ?)');
      const rows = [];
      for (const t of TABLES) {
        if (t === 'settings') { if (d.settings && d.settings.id) rows.push({ t, id: String(d.settings.id), data: JSON.stringify(d.settings) }); }
        else if (Array.isArray(d[t])) for (const row of d[t]) if (row && row.id != null) rows.push({ t, id: String(row.id), data: JSON.stringify(row) });
      }
      for (const r of rows) putAll.run(r.t, r.id, r.data);
      if (d.seq) this.setSeq(d.seq);
    },
    seed(seedObj) { this.restore(seedObj); },
    close() { db.close(); },
  };
}

module.exports = { openStore, TABLES };
