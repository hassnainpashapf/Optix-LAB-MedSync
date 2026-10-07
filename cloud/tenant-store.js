/* LabPOS multi-tenant storage — gives every lab (tenant) its own isolated view of ONE shared kv database.
   A tenant's rows live under the table names `<prefix><table>` (e.g. `l3f9a1c2e/patients`); the original single-lab
   data keeps the empty prefix, so an existing deployment becomes tenant "main" with no migration.
   The returned object has the same interface as db-pg / db-sqlite, so wrapStore() (sync-store.js) and every
   route work on a tenant unchanged. Unlike the raw adapters, restore() only ever touches THIS tenant's rows. */
'use strict';

/* the audit trail is append-only server-side data: it never goes into the client dump and survives a backup restore / reseed */
const NO_DUMP = ['audit'];

function scopeStore(raw, prefix, TABLES) {
  prefix = prefix || '';
  const P = (t) => prefix + t;
  const parseSeqKey = 'seq';
  const s = {
    prefix,
    noDump: NO_DUMP,
    async isEmpty() { for (const t of TABLES) if ((await raw.all(P(t))).length) return false; return true; },
    all: (t) => raw.all(P(t)),
    get: (t, id) => raw.get(P(t), String(id)),
    put: (t, row) => raw.put(P(t), row),
    async patch(t, id, p) {
      const cur = (await s.get(t, id)) || { id };
      return s.put(t, Object.assign({}, cur, p, { id }));
    },
    del: (t, id) => raw.del(P(t), String(id)),
    getMeta: (k) => raw.getMeta(prefix + k),
    setMeta: (k, v) => raw.setMeta(prefix + k, v),
    async getSeq() { return (await s.getMeta(parseSeqKey)) || {}; },
    async setSeq(v) { return s.setMeta(parseSeqKey, v || {}); },
    async dump() {
      const out = { seq: await s.getSeq() };
      for (const t of TABLES) {
        if (NO_DUMP.indexOf(t) >= 0) continue;
        if (t === 'settings') out.settings = await s.get('settings', 'main');
        else out[t] = await s.all(t);
      }
      /* normalize seq from existing ids so client-generated ids never collide after restart */
      for (const t of TABLES) {
        if (t === 'settings' || NO_DUMP.indexOf(t) >= 0) continue;
        let max = out.seq[t] || 0;
        for (const row of (out[t] || [])) {
          const m = String(row.id || '').match(/(\d+)$/);
          if (m) max = Math.max(max, parseInt(m[1], 10));
        }
        out.seq[t] = max;
      }
      return out;
    },
    /* wipe + reload THIS tenant only (backup restore / reseed) — never the other labs, never the global meta */
    async clear() {
      for (const t of TABLES.concat(['_del'])) if (NO_DUMP.indexOf(t) < 0) for (const r of await raw.all(P(t))) await raw.del(P(t), String(r.id));
      await s.setMeta(parseSeqKey, {});
    },
    /* restore = validate + prepare everything FIRST, snapshot the current data, then wipe and load; if loading fails halfway the
       snapshot is put back, so a failed restore never leaves a half-empty lab */
    async restore(d) {
      if (!d || typeof d !== 'object') throw new Error('bad dump');
      const rows = [];
      for (const t of TABLES) {
        if (NO_DUMP.indexOf(t) >= 0) continue;
        if (t === 'settings') { if (d.settings && d.settings.id) rows.push([t, d.settings]); }
        else if (d[t] != null && !Array.isArray(d[t])) throw new Error('bad dump: ' + t + ' must be a list');
        else if (Array.isArray(d[t])) for (const row of d[t]) if (row && row.id != null) rows.push([t, row]);
      }
      const snap = await s.dump();
      try {
        await s.clear();
        for (const [t, row] of rows) await raw.put(P(t), row);
        if (d.seq) await s.setSeq(d.seq);
      } catch (e) {
        try {
          await s.clear();
          for (const t of TABLES) {
            if (NO_DUMP.indexOf(t) >= 0) continue;
            if (t === 'settings') { if (snap.settings) await raw.put(P(t), snap.settings); }
            else for (const row of (snap[t] || [])) await raw.put(P(t), row);
          }
          if (snap.seq) await s.setSeq(snap.seq);
        } catch (e2) { /* nothing more can be done; the original error is reported */ }
        throw e;
      }
    },
    seed: (o) => s.restore(o),
    async close() { /* the shared connection is owned by the server */ },
  };
  return s;
}

module.exports = { scopeStore };
