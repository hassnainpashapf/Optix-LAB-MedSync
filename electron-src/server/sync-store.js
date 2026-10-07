/* LabPOS sync layer — wraps a storage adapter (db-pg / db-sqlite) so that every row carries
   sync metadata and deletes leave tombstones. Shared by the cloud API and the desktop's embedded
   server (which syncs with the cloud).

   Row metadata (set by the server, never trusted from clients):
     _o  origin  — who created the row ('cloud' for rows made on the web, 'd-xxxx' for a desktop)
     _c  created — ms timestamp of creation  (_o + _c identify a record: same id + different (_o,_c) = id collision)
     _u  updated — ms timestamp of the last user edit (last-write-wins across devices)
     _s  stored  — strictly increasing local sequence, the pull cursor ("rows changed since")
   Legacy rows (created before sync existed) simply have none of these. */
'use strict';

const DEL = '_del'; /* tombstone table: id = '<table>|<rowId>' */
const LEGACY_ORIGIN = 'cloud';

function wrapStore(raw, origin, tables) {
  let lastS = 0;
  const nowS = () => (lastS = Math.max(lastS + 1, Date.now()));
  const s = Object.create(raw);
  s.origin = origin;
  s.raw = raw;
  s.hooks = { onWrite: null };
  const fire = () => { try { if (s.hooks.onWrite) s.hooks.onWrite(); } catch (e) { /* never break a write */ } };
  const key = (t, id) => t + '|' + id;

  async function clearTomb(t, id) {
    if (await raw.get(DEL, key(t, id))) await raw.del(DEL, key(t, id));
  }

  /* normal write path (user edits): stamps ownership + timestamps, ignoring client-sent meta */
  s.put = async function (t, row) {
    if (!row || row.id == null) throw new Error('row.id required');
    const id = String(row.id);
    const ex = (t === DEL) ? null : await raw.get(t, id);
    const r = Object.assign({}, row);
    delete r._o; delete r._c; delete r._p;
    if (ex) { if (ex._o !== undefined) r._o = ex._o; if (ex._c !== undefined) r._c = ex._c; }
    else { r._o = origin; r._c = Date.now(); }
    r._u = Date.now();
    r._s = nowS();
    if (!ex) await clearTomb(t, id);
    const out = await raw.put(t, r);
    fire();
    return out;
  };
  s.patch = async function (t, id, p) {
    const cur = (await raw.get(t, String(id))) || { id };
    return s.put(t, Object.assign({}, cur, p, { id }));
  };
  s.del = async function (t, id) {
    await raw.put(DEL, { id: key(t, id), t, rid: String(id), _u: Date.now(), _s: nowS() });
    await raw.del(t, String(id));
    fire();
  };

  /* sync apply path: keeps the sender's metadata, only (re)stamps the local cursor */
  s.putSync = async function (t, row) {
    await clearTomb(t, String(row.id));
    return raw.put(t, Object.assign({}, row, { _s: nowS() }));
  };
  s.delSync = async function (t, id, u) {
    await raw.put(DEL, { id: key(t, id), t, rid: String(id), _u: u, _s: nowS() });
    await raw.del(t, String(id));
  };
  /* write without touching metadata (e.g. caching a password hash after an online login) */
  s.putQuiet = (t, row) => raw.put(t, row);
  s.tomb = (t, id) => raw.get(DEL, key(t, id));
  s.tombstones = () => raw.all(DEL);
  s.currentS = () => lastS;
  s.nextS = nowS;

  /* backup restore / reseed: new data replaces everything, so rows that disappeared get tombstones */
  s.restore = async function (d) {
    const before = {}, skipT = raw.noDump || []; /* server-managed tables (audit trail) are not part of a restore: no tombstones for them */
    for (const t of tables) { if (t !== 'settings' && skipT.indexOf(t) < 0) before[t] = (await raw.all(t)).map(r => String(r.id)); }
    const oldTombs = await raw.all(DEL);
    const body = Object.assign({}, d);
    const stamp = (r) => Object.assign({}, r, { _u: Date.now(), _s: nowS() });
    for (const t of tables) {
      if (t === 'settings') { if (body.settings) body.settings = stamp(body.settings); }
      else if (Array.isArray(body[t])) body[t] = body[t].map(stamp);
    }
    await raw.restore(body);
    for (const tb of oldTombs) await raw.put(DEL, tb);
    for (const t of tables) {
      if (t === 'settings' || skipT.indexOf(t) >= 0) continue;
      const keep = new Set((body[t] || []).map(r => String(r.id)));
      for (const id of before[t]) {
        if (!keep.has(id)) await raw.put(DEL, { id: key(t, id), t, rid: id, _u: Date.now(), _s: nowS() });
      }
    }
    fire();
  };
  s.seed = (seedObj) => s.restore(seedObj);

  /* everything stored after `since` (for pull), excluding keys in `skip` */
  s.changesSince = async function (since, skip) {
    skip = skip || new Set();
    const rows = [], deletes = [];
    for (const t of tables) {
      for (const r of await raw.all(t)) {
        if ((+r._s || 0) > since && !skip.has(key(t, r.id))) rows.push({ t, row: r });
      }
    }
    for (const tb of await raw.all(DEL)) {
      if ((+tb._s || 0) > since && !skip.has(tb.id)) deletes.push({ t: tb.t, id: tb.rid, _u: tb._u, _s: tb._s });
    }
    return { rows, deletes };
  };

  /* next free id with the same prefix/width as `oldId` (e.g. P-0007 -> P-0012) */
  s.nextFreeId = async function (t, oldId, taken) {
    const m = /^(.*?)(\d+)$/.exec(String(oldId));
    const prefix = m ? m[1] : String(oldId) + '-';
    const width = m ? m[2].length : 4;
    let max = 0;
    for (const r of await raw.all(t)) {
      const mm = /(\d+)$/.exec(String(r.id));
      if (mm) max = Math.max(max, parseInt(mm[1], 10));
    }
    for (const id of (taken || [])) { const mm = /(\d+)$/.exec(String(id)); if (mm) max = Math.max(max, parseInt(mm[1], 10)); }
    const n = String(max + 1);
    return prefix + (n.length >= width ? n : '0'.repeat(width - n.length) + n);
  };

  return s;
}

/* same id but a different (origin, created) pair = two different records that happen to share a number */
function sameRecord(a, b) {
  return (a._o || LEGACY_ORIGIN) === (b._o || LEGACY_ORIGIN) && (+a._c || 0) === (+b._c || 0);
}

module.exports = { wrapStore, sameRecord, DEL, LEGACY_ORIGIN };
