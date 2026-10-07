/* WhatsApp gateway — every lab links ITS OWN WhatsApp number by scanning a QR code (like WhatsApp Web), and the server then sends that lab's
   messages (report links, portal sign-in codes) from that number. One session per lab, kept in memory; the login (creds + keys) is stored in
   the database, so it survives restarts and deploys and is included in the normal backups.

   This uses WhatsApp's Web protocol through the open-source Baileys library. It is NOT the official WhatsApp Business API: use a dedicated
   number, send only to your own patients, and keep the volume low — WhatsApp can block numbers that look like spam.

   WA_GATEWAY=0          switch the gateway off (the settings page then says so)
   WA_GATEWAY_FAKE=1     tests: no WhatsApp at all; shows a fake QR, "pairs" after a moment and writes messages to WA_GATEWAY_FAKE_LOG
   WA_GATEWAY_DAILY=300  messages per lab per day;  WA_GATEWAY_MAX=60  sessions kept running at the same time */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

function create({ raw, log }) {
  const FAKE = process.env.WA_GATEWAY_FAKE === '1';
  const ENABLED = process.env.WA_GATEWAY !== '0';
  const DAILY = +process.env.WA_GATEWAY_DAILY || 300, MAX = +process.env.WA_GATEWAY_MAX || 60;
  const sessions = new Map();            /* labId -> session */
  let B = null, pino = null;             /* Baileys, loaded on first use (it is an ES module) */
  const say = log || (() => {});

  async function lib() {
    if (B) return B;
    B = await import('@whiskeysockets/baileys'); pino = (await import('pino')).default;
    return B;
  }

  /* ---- login storage in the database (same idea as Baileys' file store, but one meta row per file) ---- */
  async function dbAuth(labId) {
    const b = await lib(), pre = 'wa:' + labId + ':';
    const idxKey = pre + 'idx'; let idx = new Set((await raw.getMeta(idxKey)) || []), idxT = null;
    const flush = () => { clearTimeout(idxT); idxT = setTimeout(() => raw.setMeta(idxKey, Array.from(idx)).catch(() => {}), 3000); };
    const put = async (name, val) => { await raw.setMeta(pre + name, JSON.parse(JSON.stringify(val, b.BufferJSON.replacer))); if (!idx.has(name)) { idx.add(name); flush(); } };
    const get = async (name) => { const v = await raw.getMeta(pre + name); return v ? JSON.parse(JSON.stringify(v), b.BufferJSON.reviver) : null; };
    const del = async (name) => { await raw.setMeta(pre + name, null); if (idx.delete(name)) flush(); };
    const creds = (await get('creds')) || b.initAuthCreds();
    return {
      state: { creds, keys: {
        get: async (type, ids) => { const out = {}; await Promise.all(ids.map(async (id) => { let v = await get(type + '-' + id); if (type === 'app-state-sync-key' && v) v = b.proto.Message.AppStateSyncKeyData.fromObject(v); out[id] = v; })); return out; },
        set: async (data) => { const jobs = []; for (const cat of Object.keys(data)) for (const id of Object.keys(data[cat])) { const v = data[cat][id]; jobs.push(v ? put(cat + '-' + id, v) : del(cat + '-' + id)); } await Promise.all(jobs); },
      } },
      saveCreds: () => put('creds', creds),
      registered: () => !!(creds.me && creds.me.id), /* a QR-paired login has "me"; the library only sets "registered" for the phone-number code flow */
      wipe: async () => { for (const n of Array.from(idx)) await raw.setMeta(pre + n, null); await raw.setMeta(idxKey, null); idx = new Set(); },
    };
  }
  async function hasLogin(labId) { try { const c = await raw.getMeta('wa:' + labId + ':creds'); return !!(c && c.me && c.me.id); } catch (e) { return false; } }

  function fresh(labId) { return { labId, state: 'idle', qr: '', number: '', err: '', sock: null, auth: null, stop: false, tries: 0, gapSec: 60, nextAt: 0, urgentAt: 0, outbox: [], history: [], timer: null, busy: false, boxT: null, day: '', sent: 0, at: Date.now() }; }
  const jidOf = (to) => { let d = String(to || '').replace(/\D/g, ''); while (d.indexOf('00') === 0) d = d.slice(2); if (d.charAt(0) === '0') d = '92' + d.slice(1); return d.length >= 10 && d.length <= 15 ? d + '@s.whatsapp.net' : ''; };

  /* ---- start / reconnect ---- */
  async function start(labId, opts) {
    if (!ENABLED) throw new Error('The WhatsApp gateway is switched off on this server.');
    let S = sessions.get(labId);
    if (S && (S.state === 'open' || S.state === 'qr' || S.state === 'connecting')) return S;
    if (!S) { if (sessions.size >= MAX) throw new Error('This server is at its limit of linked WhatsApp numbers. Please contact support.'); S = fresh(labId); sessions.set(labId, S); try { S.outbox = ((await raw.getMeta('wa:' + labId + ':box')) || []).filter((j) => j && j.to && j.text); if (S.outbox.length) schedule(S); } catch (e) { S.outbox = []; } }
    S.stop = false; S.err = ''; S.state = 'connecting'; S.qr = '';
    if (opts && opts.fresh && !FAKE) { /* the person pressed "Link": drop any half-finished earlier attempt so a clean QR is made */
      try { const old = await dbAuth(labId); if (!old.registered()) await old.wipe(); } catch (e) { /* nothing stored */ }
      S.auth = null; S.tries = 0;
    }
    if (FAKE) { /* tests: a QR for a moment, then "linked" */
      S.state = 'qr'; S.qr = 'FAKE-QR-' + crypto.randomBytes(6).toString('hex');
      setTimeout(() => { if (S.state === 'qr' && !S.stop) { S.state = 'open'; S.qr = ''; S.number = process.env.WA_GATEWAY_FAKE_NUMBER || ('92300' + String(1000000 + sessions.size)); } }, +process.env.WA_GATEWAY_FAKE_MS || 1200);
      return S;
    }
    try {
      const b = await lib(); S.auth = S.auth || await dbAuth(labId);
      let version; try { version = (await b.fetchLatestBaileysVersion()).version; } catch (e) { version = undefined; }
      const sock = b.default({ version, auth: S.auth.state, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['Optix Medical Science', 'Chrome', '1.0'], markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false });
      S.sock = sock;
      sock.ev.on('creds.update', () => S.auth.saveCreds().catch(() => {}));
      /* WhatsApp's "login complete" message: show CONNECTED right away (the library waits for one more reply that can be slow) */
      try { sock.ws.on('CB:success', () => { if (S.sock !== sock) return; const me = S.auth && S.auth.state.creds.me; S.state = 'open'; S.qr = ''; S.err = ''; S.tries = 0; S.number = String((me && me.id) || '').split(':')[0].split('@')[0]; say('whatsapp linked for lab ' + labId + ' (' + S.number + ')'); }); } catch (e) { /* the normal event below still works */ }
      sock.ev.on('connection.update', (u) => {
        if (S.sock !== sock) return;
        if (u.qr) { S.qr = u.qr; S.state = 'qr'; }
        if (u.isNewLogin) { S.state = 'connecting'; S.qr = ''; say('whatsapp (lab ' + labId + ') QR scanned, finishing the link…'); }
        if (u.connection === 'open') { S.state = 'open'; S.qr = ''; S.err = ''; S.tries = 0; S.number = String((sock.user && sock.user.id) || '').split(':')[0].split('@')[0]; say('whatsapp linked for lab ' + labId + ' (' + S.number + ')'); }
        if (u.connection === 'close') {
          const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output ? u.lastDisconnect.error.output.statusCode : 0;
          say('whatsapp (lab ' + labId + ') connection closed, code ' + code + ', state was ' + S.state);
          S.sock = null; S.number = S.state === 'open' ? S.number : '';
          if (S.stop) { S.state = 'idle'; return; }
          if (code === b.DisconnectReason.loggedOut || code === 401) { S.state = 'loggedout'; S.err = 'This number was unlinked from the phone.'; S.auth.wipe().catch(() => {}); S.auth = null; return; }
          /* right after the QR is scanned WhatsApp ends this connection on purpose ("restart required", 515): open a new one with the same login */
          if (code === b.DisconnectReason.restartRequired || code === 515) { S.state = 'connecting'; S.tries = 0; setTimeout(() => { if (!S.stop && sessions.get(labId) === S) { S.state = 'idle'; start(labId).catch(() => {}); } }, 300); return; }
          if (!S.auth.registered() && (code === b.DisconnectReason.timedOut || code === 408)) { S.state = 'idle'; S.qr = ''; S.err = 'The QR code expired. Press the button to get a new one.'; return; }
          S.state = 'connecting'; S.tries++;
          if (S.tries > 12) { S.state = 'idle'; S.err = 'Could not reconnect to WhatsApp. Press the button to link again.'; return; }
          setTimeout(() => { if (!S.stop && sessions.get(labId) === S) { S.state = 'idle'; start(labId).catch(() => {}); } }, Math.min(60000, 2000 * S.tries * S.tries));
        }
      });
    } catch (e) { S.state = 'idle'; S.err = String((e && e.message) || e).slice(0, 160); say('whatsapp start failed: ' + S.err); }
    return S;
  }

  function status(labId) {
    const S = sessions.get(labId);
    if (!ENABLED) return { enabled: false, state: 'off' };
    if (!S) return { enabled: true, state: 'idle', qr: '', number: '', err: '' };
    return { enabled: true, state: S.state, qr: S.state === 'qr' ? S.qr : '', number: S.state === 'open' ? S.number : '', err: S.err || '', waiting: S.outbox.length };
  }

  async function logout(labId) {
    const S = sessions.get(labId);
    if (S) {
      S.stop = true; clearTimeout(S.timer); S.timer = null; S.outbox = [];
      try { await raw.setMeta('wa:' + labId + ':box', null); } catch (e) { /* ignore */ }
      try { if (S.sock) await S.sock.logout(); } catch (e) { /* already unlinked */ }
      try { if (S.sock) S.sock.end(undefined); } catch (e) { /* ignore */ }
      try { if (S.auth) await S.auth.wipe(); } catch (e) { /* ignore */ }
      sessions.delete(labId);
    }
    if (!FAKE) { try { const a = await dbAuth(labId); await a.wipe(); } catch (e) { /* nothing stored */ } }
  }

  /* ---- sending ----
     Normal messages (reports, balance notes, statements) go through a queue: one message, then a pause (the lab's "sending speed", 60 seconds
     by default, with a little random variation), so a bulk send looks like a person and the number is not blocked. The first message goes at once
     when the line is quiet. Sign-in codes and critical alerts skip the queue (they are one-offs and must arrive now), but keep a few seconds apart. */
  const gapMs = (S) => (process.env.WA_GATEWAY_GAP_MS ? +process.env.WA_GATEWAY_GAP_MS : Math.max(10, Math.min(600, S.gapSec || 60)) * 1000);
  const jitter = (ms) => Math.round(ms * (0.85 + Math.random() * 0.4));
  function setGap(labId, sec) { const S = sessions.get(labId); if (S) S.gapSec = Math.max(10, Math.min(600, +sec || 60)); }
  function ready(labId) {
    const S = sessions.get(labId); if (!S || S.state !== 'open') throw new Error('WhatsApp is not linked for this lab. Link the number in Settings → WhatsApp.');
    const day = new Date().toISOString().slice(0, 10); if (S.day !== day) { S.day = day; S.sent = 0; }
    return S;
  }
  async function exists(S, jid) { try { const r = await S.sock.onWhatsApp(jid); if (r && r[0] && r[0].exists === false) throw new Error('This number is not on WhatsApp.'); } catch (e) { if (/not on WhatsApp/.test(e.message)) throw e; } }
  async function rawSend(S, job) {
    const jid = jidOf(job.to); if (!jid) throw new Error('That phone number does not look right.');
    if (FAKE) {
      if (process.env.WA_GATEWAY_FAKE_LOG) fs.appendFileSync(process.env.WA_GATEWAY_FAKE_LOG, JSON.stringify(job.buffer ? { lab: S.labId, from: S.number, to: jid.split('@')[0], doc: String(job.fileName), bytes: job.buffer.length, caption: String(job.caption || '').slice(0, 500), at: Date.now() } : { lab: S.labId, from: S.number, to: jid.split('@')[0], text: String(job.text).slice(0, 2000), kind: job.kind || 'normal', at: Date.now() }) + '\n');
      return;
    }
    await exists(S, jid);
    if (job.buffer) await S.sock.sendMessage(jid, { document: job.buffer, mimetype: 'application/pdf', fileName: String(job.fileName || 'report.pdf').slice(0, 100), caption: String(job.caption || '').slice(0, 1000) });
    else await S.sock.sendMessage(jid, { text: String(job.text).slice(0, 4000) });
  }
  const note = (S, job, ok, err) => { S.history.unshift({ id: job.id, to: String(job.to).replace(/\d(?=\d{4})/g, '•'), kind: job.kind || 'normal', ok, error: err || '', at: Date.now() }); if (S.history.length > 60) S.history.length = 60; };
  function persist(S) { /* text messages survive a restart; documents (in memory) do not */
    clearTimeout(S.boxT); S.boxT = setTimeout(() => raw.setMeta('wa:' + S.labId + ':box', S.outbox.filter((j) => !j.buffer).map((j) => ({ id: j.id, to: j.to, text: j.text, kind: j.kind, at: j.at }))).catch(() => {}), 500);
  }
  function schedule(S) {
    if (S.timer || S.busy || !S.outbox.length) return;
    S.timer = setTimeout(() => { S.timer = null; pump(S).catch(() => {}); }, Math.max(0, S.nextAt - Date.now()));
  }
  async function pump(S) {
    const job = S.outbox[0]; if (!job || S.busy) return;
    if (S.state !== 'open') { /* not connected right now: keep the message and try again shortly (up to 2 hours) */
      if (Date.now() - job.at > 2 * 3600000) { S.outbox.shift(); note(S, job, false, 'WhatsApp was not connected for too long.'); persist(S); }
      S.timer = setTimeout(() => { S.timer = null; pump(S).catch(() => {}); }, 15000); return;
    }
    S.busy = true;
    try { await rawSend(S, job); S.sent++; note(S, job, true); S.nextAt = Date.now() + jitter(gapMs(S)); }
    catch (e) { note(S, job, false, String((e && e.message) || e).slice(0, 160)); S.nextAt = Date.now() + 5000; }
    finally { S.outbox.shift(); S.busy = false; persist(S); schedule(S); }
  }
  /* put a message in the queue; answers at once with how long it will wait */
  function enqueue(labId, item) {
    const S = ready(labId), DAY = DAILY;
    if (S.sent + S.outbox.length >= DAY) throw new Error('Today\'s WhatsApp limit (' + DAY + ' messages) is reached. It resets tomorrow.');
    if (S.outbox.length >= 500) throw new Error('Too many messages are waiting to be sent. Please try again later.');
    if (!jidOf(item.to)) throw new Error('That phone number does not look right.');
    const job = Object.assign({ id: crypto.randomBytes(5).toString('hex'), at: Date.now() }, item), ahead = S.outbox.length;
    const wait = Math.max(0, S.nextAt - Date.now());
    S.outbox.push(job); persist(S); schedule(S);
    return { id: job.id, queued: true, ahead, etaSec: Math.round((wait + ahead * gapMs(S)) / 1000), gapSec: Math.round(gapMs(S) / 1000) };
  }
  /* one-offs that must arrive now (sign-in codes, critical alerts): sent straight away, a few seconds apart */
  async function sendUrgent(labId, to, text, kind) {
    const S = ready(labId); if (!jidOf(to)) throw new Error('That phone number does not look right.');
    const spacing = FAKE ? 0 : 4000, at = Math.max(Date.now(), S.urgentAt); S.urgentAt = at + spacing;
    const wait = at - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await rawSend(S, { to, text, kind: kind || 'urgent' }); S.sent++; return true;
  }
  const sendText = (labId, to, text, kind) => enqueue(labId, { to, text, kind: kind || 'report' });
  const sendDocument = (labId, to, buffer, fileName, caption) => enqueue(labId, { to, buffer, fileName, caption, kind: 'document' });
  function outbox(labId) {
    const S = sessions.get(labId); if (!S) return { waiting: 0, nextInSec: 0, gapSec: 60, recent: [] };
    return { waiting: S.outbox.length, nextInSec: S.outbox.length ? Math.max(0, Math.round((S.nextAt - Date.now()) / 1000)) : 0, gapSec: Math.round(gapMs(S) / 1000), recent: S.history.slice(0, 15) };
  }

  /* after a restart, bring back every lab that had linked a number (one every 2 seconds, so the server stays calm) */
  async function boot(labIds) {
    if (!ENABLED || FAKE) return;
    let n = 0; for (const id of labIds) { if (await hasLogin(id)) { setTimeout(() => start(id).catch(() => {}), 2000 * (++n)); } }
    if (n) say('restoring ' + n + ' linked WhatsApp number(s)');
  }
  return { enabled: ENABLED, fake: FAKE, start, status, logout, sendText, sendDocument, sendUrgent, outbox, setGap, boot, hasLogin };
}
module.exports = { create };
