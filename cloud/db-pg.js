/* LabPOS cloud storage — Postgres via node-postgres (pg).
   Document-style: every row stored as JSONB in kv(t, id, data).
   Interface matches db-sqlite.js exactly; all methods are async.

   Connection: pass a connection string to openStore(), or leave it empty
   and let pg read the standard env vars PGHOST/PGPORT/PGUSER/PGPASSWORD/
   PGDATABASE (this is what docker-compose.yml sets up). */
'use strict';
const { Pool } = require('pg');

const TABLES = ['settings', 'users', 'patients', 'tests', 'doctors', 'invoices', 'payments', 'expenses', 'results', 'wa_log', 'report_templates', 'report_schedules', 'samples', 'closings', 'audit', 'stock_items', 'stock_moves', 'email_log'];

async function openStore(connectionString) {
  const pool = new Pool(connectionString ? { connectionString } : {});

  /* fail fast with a clear message if the database is unreachable */
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    await pool.end().catch(() => {});
    throw new Error('postgres unreachable: ' + e.message);
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS kv (
      t TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      PRIMARY KEY (t, id)
    )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    )`);

  /* pg returns JSONB columns already parsed; TEXT meta values need parsing */
  function parseMeta(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  const store = {
    async isEmpty() {
      const r = await pool.query('SELECT COUNT(*)::int AS c FROM kv');
      return r.rows[0].c === 0;
    },
    async all(t) {
      const r = await pool.query('SELECT data FROM kv WHERE t = $1', [t]);
      return r.rows.map(x => x.data).filter(Boolean);
    },
    async get(t, id) {
      const r = await pool.query('SELECT data FROM kv WHERE t = $1 AND id = $2', [t, String(id)]);
      return r.rows.length ? r.rows[0].data : null;
    },
    async put(t, row) {
      if (!row || row.id == null) throw new Error('row.id required');
      await pool.query(
        `INSERT INTO kv (t, id, data) VALUES ($1, $2, $3)
         ON CONFLICT (t, id) DO UPDATE SET data = EXCLUDED.data`,
        [t, String(row.id), JSON.stringify(row)]
      );
      return row;
    },
    async patch(t, id, p) {
      const cur = await this.get(t, id) || { id };
      const next = Object.assign({}, cur, p, { id });
      return this.put(t, next);
    },
    async del(t, id) {
      await pool.query('DELETE FROM kv WHERE t = $1 AND id = $2', [t, String(id)]);
    },
    async getSeq() {
      const r = await pool.query('SELECT v FROM meta WHERE k = $1', ['seq']);
      return r.rows.length ? parseMeta(r.rows[0].v) : {};
    },
    async setSeq(s) {
      await pool.query(
        `INSERT INTO meta (k, v) VALUES ('seq', $1)
         ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
        [JSON.stringify(s || {})]
      );
    },
    async getMeta(k) {
      const r = await pool.query('SELECT v FROM meta WHERE k = $1', [k]);
      return r.rows.length ? parseMeta(r.rows[0].v) : null;
    },
    async setMeta(k, v) {
      await pool.query(
        `INSERT INTO meta (k, v) VALUES ($1, $2)
         ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
        [k, JSON.stringify(v === undefined ? null : v)]
      );
    },
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM kv');
        await client.query('DELETE FROM meta');
        const rows = [];
        for (const t of TABLES) {
          if (t === 'settings') {
            if (d.settings && d.settings.id) rows.push([t, String(d.settings.id), JSON.stringify(d.settings)]);
          } else if (Array.isArray(d[t])) {
            for (const row of d[t]) {
              if (row && row.id != null) rows.push([t, String(row.id), JSON.stringify(row)]);
            }
          }
        }
        for (const r of rows) {
          await client.query('INSERT INTO kv (t, id, data) VALUES ($1, $2, $3)', r);
        }
        if (d.seq) {
          await client.query(
            `INSERT INTO meta (k, v) VALUES ('seq', $1)
             ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
            [JSON.stringify(d.seq)]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async seed(seedObj) { return this.restore(seedObj); },
    async close() { await pool.end(); },
  };
  return store;
}

module.exports = { openStore, TABLES };
