/* LabPOS desktop sync agent — runs inside the Electron app's embedded server (DESKTOP_CLOUD_URL set).

   The desktop keeps its OWN complete database and works with no internet. Whenever it is online and a
   cloud session exists, it syncs both ways with the cloud API:
     - push: every record edited/created/deleted locally since the last successful push
     - pull: everything the cloud (web users, other PCs) changed since the last pull
   Conflicts: last write wins per record (by edit time). Two devices that created different records with
   the same number (e.g. both made P-0007 offline) are detected up-front and the later device renumbers
   its record (and everything that refers to it) before pushing, so nothing is overwritten.
   Passwords never travel: each PC caches a hash of a user's password after an online sign-in, which is
   what makes offline sign-in possible. A fresh install (or a reinstall after a crash) signs in online
   once and pulls the whole database + report PDFs back from the cloud. */
'use strict';
const fs = require('fs');
const path = require('path');
const { sameRecord, DEL } = require('./sync-store');
const httpFetch = require('./http-fetch'); /* works on Node 16 (Windows 7/8 builds) as well as modern Node */

/* fields that point at another record: [table, field, targetTable] ('items[].testId' handled separately) */
const REFS = [
  ['invoices', 'patientId', 'patients'], ['invoices', 'doctorId', 'doctors'],
  ['payments', 'invoiceId', 'invoices'],
  ['results', 'invoiceId', 'invoices'], ['results', 'testId', 'tests'],
  ['patients', 'doctorId', 'doctors'], ['patients', 'panelId', 'panels'], ['invoices', 'panelId', 'panels'],
  ['samples', 'invoiceId', 'invoices'], ['samples', 'patientId', 'patients'], ['samples', 'recollectOf', 'samples'], ['samples', 'recollectId', 'samples'],
  ['stock_moves', 'itemId', 'stock_items'],
];

function create(ctx) {
  const { store, TABLES, cloudUrl, deviceId, reportDir, hashPassword, verifyPassword, isHashed } = ctx;
  const raw = store.raw;
  let token = '', tokenExp = 0, tokenRole = '';
  let running = false, timer = null, debounce = null;
  const status = { online: false, lastSync: null, lastError: '', pending: 0, syncing: false };

  function setToken(t) {
    token = t || '';
    try { const p = JSON.parse(Buffer.from(String(t).split('.')[0], 'base64url').toString('utf8')); tokenExp = +p.exp || 0; tokenRole = p.role || ''; }
    catch (e) { tokenExp = 0; tokenRole = ''; }
  }
  const tokenOk = () => !!token && tokenExp > Date.now() + 30000;

  async function cfetch(p, opts, timeoutMs) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token && !opts.noAuth) headers.Authorization = 'Bearer ' + token;
    return httpFetch(cloudUrl + p, { method: opts.method, headers, body: opts.body, timeout: timeoutMs || 15000 });
  }

  async function getState() { return (await raw.getMeta('sync')) || { since: 0, pushedU: 0 }; }
  async function setState(st) { await raw.setMeta('sync', st); }

  async function collectDirty(st) {
    const rows = [], deletes = [];
    /* _p === _u marks a row exactly as pulled from the cloud: not a local change, never pushed back */
    for (const t of TABLES) for (const r of await raw.all(t)) if ((+r._u || 0) > st.pushedU && !(r._p !== undefined && r._p === r._u)) rows.push({ t, row: r });
    for (const tb of await raw.all(DEL)) if ((+tb._u || 0) > st.pushedU) deletes.push({ t: tb.t, id: tb.rid, _u: tb._u });
    return { rows, deletes };
  }

  /* renumber a locally-created record that collides with a different cloud record of the same number */
  async function renumber(t, oldId, newId) {
    const row = await raw.get(t, oldId);
    if (!row) return;
    const now = Date.now();
    const moved = Object.assign({}, row, { id: newId, _u: now });
    if (t === 'invoices' && moved.no === oldId) moved.no = newId;
    await raw.put(t, moved);
    await raw.del(t, oldId); /* no tombstone: the old number belongs to somebody else's record */
    for (const [rt, field, target] of REFS) {
      if (target !== t) continue;
      for (const r of await raw.all(rt)) {
        if (r[field] === oldId) await raw.put(rt, Object.assign({}, r, { [field]: newId, _u: now }));
      }
    }
    if (t === 'invoices') { /* sample tubes carry the invoice number in their barcode */
      for (const sm of await raw.all('samples')) {
        if (sm.invoiceId === newId && (sm.invoiceNo === oldId || String(sm.barcode || '').indexOf(oldId) === 0)) {
          await raw.put('samples', Object.assign({}, sm, { _u: now, invoiceNo: newId, barcode: String(sm.barcode || '').replace(oldId, newId) }));
        }
      }
    }
    if (t === 'tests') {
      for (const inv of await raw.all('invoices')) {
        if (Array.isArray(inv.items) && inv.items.some(it => it && it.testId === oldId)) {
          await raw.put('invoices', Object.assign({}, inv, { _u: now, items: inv.items.map(it => (it && it.testId === oldId) ? Object.assign({}, it, { testId: newId }) : it) }));
        }
      }
    }
  }

  async function applyPulled(res) {
    let n = 0;
    for (const { t, row } of res.rows || []) {
      if (!TABLES.includes(t) || !row || row.id == null) continue;
      const id = String(row.id);
      const local = await raw.get(t, id);
      if (local && (+local._u || 0) >= (+row._u || 0)) continue;
      const tomb = await store.tomb(t, id);
      if (tomb && (+tomb._u || 0) >= (+row._u || 0)) continue;
      const r = Object.assign({}, row, { _p: row._u });
      if (t === 'users') { if (local && local.password) r.password = local.password; else delete r.password; }
      await raw.put(t, r);
      if (tomb) await raw.del(DEL, t + '|' + id);
      n++;
    }
    for (const d of res.deletes || []) {
      const local = await raw.get(d.t, String(d.id));
      if (local && (+local._u || 0) > (+d._u || 0)) continue; /* edited after the delete: keep */
      if (local) { await raw.del(d.t, String(d.id)); n++; }
      await raw.put(DEL, { id: d.t + '|' + d.id, t: d.t, rid: String(d.id), _u: d._u, _s: d._s || Date.now() });
    }
    return n;
  }

  async function cycle() {
    if (running) return { skipped: 'busy' };
    if (!tokenOk()) { status.lastError = token ? 'Cloud session expired — sign in again to resume syncing' : ''; return { skipped: 'no-session' }; }
    running = true; status.syncing = true;
    try {
      let st = await getState();
      let dirty = await collectDirty(st);
      /* 1) id-collision preflight for records this device created */
      const mine = dirty.rows.filter(x => x.row._o === deviceId && x.t !== 'settings')
        .map(x => ({ t: x.t, id: x.row.id, _o: x.row._o, _c: x.row._c }));
      if (mine.length) {
        const cr = await cfetch('/api/sync/check', { method: 'POST', body: JSON.stringify({ rows: mine }) }, 30000);
        if (cr.status === 402) { let m = ''; try { m = (await cr.json()).error || ''; } catch (e) { /* ignore */ } throw new Error(m || 'Subscription expired — renew your plan to resume cloud sync (your data is safe on this PC)'); }
        if (cr.status === 403) throw new Error('This lab account is suspended — contact support');
        if (!cr.ok) throw new Error('check ' + cr.status);
        const { conflicts } = await cr.json();
        if (conflicts && conflicts.length) {
          for (const c of conflicts) await renumber(c.t, String(c.id), String(c.newId));
          dirty = await collectDirty(st);
        }
      }
      /* 2) push + pull in one round trip */
      const resp = await cfetch('/api/sync', { method: 'POST', body: JSON.stringify({ since: st.since, rows: dirty.rows, deletes: dirty.deletes }) }, 120000);
      if (resp.status === 401) { token = ''; throw new Error('Cloud session expired — sign in again to resume syncing'); }
      if (resp.status === 402) { let m = ''; try { m = (await resp.json()).error || ''; } catch (e) { /* ignore */ } throw new Error((m || 'Subscription expired — renew your plan to resume cloud sync') + ' (your data is safe on this PC)'); }
      if (resp.status === 403) throw new Error('This lab account is suspended — contact support');
      if (!resp.ok) throw new Error('sync ' + resp.status);
      const res = await resp.json();
      const pulled = await applyPulled(res);
      let pushedU = st.pushedU;
      for (const x of dirty.rows) pushedU = Math.max(pushedU, +x.row._u || 0);
      for (const x of dirty.deletes) pushedU = Math.max(pushedU, +x._u || 0);
      if (res.skipped && res.skipped.length) pushedU = Math.min(pushedU, Math.min.apply(null, res.skipped.map(x => +x._u || 0)) - 1);
      st = { since: Math.max(st.since, (+res.cursor || 0) - 3000), pushedU, lastOk: new Date().toISOString() };
      await setState(st);
      status.online = true; status.lastSync = st.lastOk; status.lastError = '';
      status.pending = (await collectDirty(st)).rows.length;
      await uploadPdfs().catch(() => {});
      await restorePdfs().catch(() => {});
      return { pushed: dirty.rows.length + dirty.deletes.length, pulled };
    } catch (e) {
      status.online = !(e && (e.name === 'TimeoutError' || /fetch failed|ECONN|ENOTFOUND|network/i.test(String(e.message || e) + String(e.cause || ''))));
      status.lastError = String((e && e.message) || e);
      return { error: status.lastError };
    } finally { running = false; status.syncing = false; }
  }

  /* ---- report PDFs: stored locally, uploaded to the cloud, restored from the cloud after a reinstall ---- */
  const pdfFile = (key) => path.join(reportDir, key + '.pdf');
  async function pendingPdfs() { return (await raw.getMeta('pdf_pending')) || []; }
  async function onPdfSaved(key) {
    const q = await pendingPdfs();
    if (!q.includes(key)) { q.push(key); await raw.setMeta('pdf_pending', q); }
    uploadPdfs().catch(() => {});
  }
  async function uploadPdfs() {
    if (!tokenOk()) return;
    const q = await pendingPdfs(), left = [];
    for (const key of q) {
      try {
        const buf = fs.readFileSync(pdfFile(key));
        const r = await cfetch('/api/report-pdfs', { method: 'POST', body: JSON.stringify({ key, pdfBase64: buf.toString('base64') }) }, 60000);
        if (!r.ok && r.status !== 400) left.push(key);
      } catch (e) { if (e.code !== 'ENOENT') left.push(key); }
    }
    if (left.length !== q.length) await raw.setMeta('pdf_pending', left);
  }
  async function fetchPdf(key) {
    try {
      const r = await httpFetch(cloudUrl + '/r/' + encodeURIComponent(key) + '?raw=1', { timeout: 20000 });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(pdfFile(key), buf);
      return pdfFile(key);
    } catch (e) { return null; }
  }
  async function restorePdfs() {
    let n = 0;
    for (const inv of await raw.all('invoices')) {
      const key = inv.reportPdfKey;
      if (!key || !/^[A-Za-z0-9_-]{4,64}$/.test(key) || fs.existsSync(pdfFile(key))) continue;
      await fetchPdf(key);
      if (++n >= 40) break; /* a batch per cycle; the rest on following cycles */
    }
  }

  /* ---- sign-in: the cloud is authoritative while online; local hash is used offline ---- */
  async function authenticate(username, password, labSlug) {
    const users = await raw.all('users');
    let local = users.find(u => u.username === username && u.active !== false);
    let cloud = null, denied = false, offline = false;
    /* this PC belongs to ONE lab (the first one it signed in to); the Lab ID can be left empty afterwards */
    const bound = await raw.getMeta('lab');
    const want = labSlug || (bound && bound.slug) || '';
    if (bound && labSlug && labSlug !== bound.slug) return { status: 403, error: 'This PC is registered to "' + (bound.name || bound.slug) + '" (Lab ID: ' + bound.slug + '). Use that Lab ID, or install the app on another PC.' };
    try {
      const r = await cfetch('/api/auth/login', { method: 'POST', noAuth: true, body: JSON.stringify({ username, password, lab: want }) }, 8000);
      if (r.status === 200) cloud = await r.json();
      else if (r.status === 401 || r.status === 400) { denied = true; try { const j = await r.json(); if (j && /Lab ID/.test(j.error || '')) return { status: 401, error: j.error }; } catch (e) {} }
      else if (r.status === 403) { let m = 'This lab account is suspended. Please contact support.'; try { const j = await r.json(); if (j && j.error) m = j.error; } catch (e) {} return { status: 403, error: m }; }
      else if (r.status === 429) return { status: 429, error: 'Too many attempts. Try again in a few minutes.' };
      else offline = true;
    } catch (e) { offline = true; }
    if (cloud && cloud.lab) {
      const stx = await getState();
      if (bound && bound.id !== cloud.lab.id) return { status: 403, error: 'This PC is registered to "' + (bound.name || bound.slug) + '". Use its Lab ID.' };
      if (!bound) {
        /* an install from before multi-lab only ever synced with the default lab */
        if (stx.since && cloud.lab.id !== 'main') return { status: 403, error: 'This PC already holds another lab\'s data. Install the app on a different PC for "' + cloud.lab.name + '".' };
        await raw.setMeta('lab', { id: cloud.lab.id, slug: cloud.lab.slug, name: cloud.lab.name });
      }
    }

    if (cloud) {
      setToken(cloud.token);
      status.online = true;
      const st = await getState();
      if (!local || !st.since) {
        await cycle();
        local = (await raw.all('users')).find(u => u.username === username && u.active !== false) || null;
        if (!(await getState()).since) { /* the first download of the lab's data did not finish: do not sign in to an empty database */
          if (!bound) await raw.setMeta('lab', null);
          return { status: 503, error: status.lastError || 'Could not download your lab data. Check the internet connection and try again.' };
        }
      }
      if (!local) local = { id: cloud.user.id, name: cloud.user.name, username, role: cloud.user.role, active: true };
      await raw.put('users', Object.assign({}, local, { password: hashPassword(password) })); /* offline verifier, no sync stamp */
      if (st.since) cycle().catch(() => {});
      return { user: { id: local.id, name: cloud.user.name || local.name, role: cloud.user.role || local.role } };
    }
    if (denied) {
      /* a user created on this PC that has not reached the cloud yet can still sign in locally */
      const st = await getState();
      if (local && local._o === deviceId && (+local._u || 0) > st.pushedU && isHashed(local.password) && verifyPassword(password, local.password)) {
        return { user: { id: local.id, name: local.name, role: local.role } };
      }
      return { status: 401, error: 'Invalid username or password' };
    }
    /* offline */
    if (local && isHashed(local.password)) {
      if (verifyPassword(password, local.password)) return { user: { id: local.id, name: local.name, role: local.role }, offline: true };
      return { status: 401, error: 'Invalid username or password' };
    }
    return { status: 401, error: local
      ? 'Offline: sign in once while online on this PC to enable offline sign-in.'
      : 'First sign-in on this PC needs an internet connection (your data is downloaded from the cloud).' };
  }

  function start() {
    timer = setInterval(() => { cycle(); }, 30000);
    if (timer.unref) timer.unref();
    store.hooks.onWrite = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { cycle(); }, 4000);
    };
  }
  async function getStatus() {
    const st = await getState();
    status.pending = (await collectDirty(st)).rows.length;
    return Object.assign({ desktop: true, hasSession: tokenOk(), device: deviceId }, status);
  }

  return { setToken, tokenOk, cycle, authenticate, onPdfSaved, fetchPdf, pdfFile, start, getStatus };
}

module.exports = { create };
