/* SMS sender worker — drains the sms_outbox table through an SMSLink gateway
   (beingniloy/smslink: self-hosted PHP/MySQL server + Android app; the app sends
   through the lab's SIM card).

   Gateway API contract (Bearer token):
     POST {gatewayUrl}/api/v1/send   { to, message, sim_slot (1|2), device_id:"auto" }
       -> { ok:true, msg_id }   (sim_slot is 1-indexed; our settings simSlot is 0-indexed)
     GET  {gatewayUrl}/api/v1/status?msg_id=...
       -> { ok:true, status: "delivered"|"sent"|"queued"|"failed", ... }

   Every pass, per lab with SMS enabled: refresh delivery states of recently sent
   rows, then send up to 10 pending rows (3 attempts max, gentle pacing).
   Started from server.js like wa-auto.js. Runs on cloud and desktop alike. */
'use strict';

const httpFetch = require('./http-fetch');

function create({ saas, log }) {
  const say = log || (() => {});
  let timer = null, running = false;

  async function gwPost(cfg, path, body) {
    const url = cfg.gatewayUrl.replace(/\/+$/, '') + path;
    const r = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body),
      timeout: 25000,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error((j && (j.error || j.message)) || ('gateway HTTP ' + r.status));
    return j;
  }

  async function gwGet(cfg, path) {
    const url = cfg.gatewayUrl.replace(/\/+$/, '') + path;
    const r = await httpFetch(url, { headers: { 'Authorization': 'Bearer ' + cfg.apiKey }, timeout: 25000 });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error((j && (j.error || j.message)) || ('gateway HTTP ' + r.status));
    return j;
  }

  async function sendOne(st, row, cfg) {
    const simSlot = (cfg.simSlot === 1 ? 2 : 1); /* settings 0/1 -> API 1/2 */
    const j = await gwPost(cfg, '/api/v1/send', { to: row.to, message: row.text, sim_slot: simSlot, device_id: 'auto' });
    if (!j.msg_id) throw new Error('gateway did not return a message id');
    await st.patch('sms_outbox', row.id, { status: 'sent', sentAt: new Date().toISOString(), gatewayId: String(j.msg_id), error: '' });
  }

  async function pollStatus(st, row, cfg) {
    if (!row.gatewayId) return;
    const j = await gwGet(cfg, '/api/v1/status?msg_id=' + encodeURIComponent(row.gatewayId));
    const s = String(j.status || '').toLowerCase();
    if (s === 'delivered') await st.patch('sms_outbox', row.id, { status: 'delivered', deliveredAt: new Date().toISOString() });
    else if (s === 'failed' || s === 'error' || s === 'rejected') await st.patch('sms_outbox', row.id, { status: 'failed', error: String(j.error || 'delivery failed').slice(0, 200) });
    /* queued/sent -> leave for the next pass */
  }

  async function runLab(lab) {
    const st = saas.storeFor(lab);
    let set = {};
    try { set = (await st.get('settings', 'main')) || {}; } catch (e) { /* no settings yet */ }
    const cfg = Object.assign({ enabled: false, gatewayUrl: '', apiKey: '', simSlot: 0 }, set.sms || {});
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return { sent: 0, skipped: true };
    let rows = [];
    try { rows = await st.all('sms_outbox'); } catch (e) { return { sent: 0 }; }
    const now = Date.now();
    const pending = rows.filter((r) => r && r.status === 'pending' && (r.attempts || 0) < 3);
    const checkable = rows.filter((r) => r && r.status === 'sent' && r.gatewayId &&
      now - new Date(r.sentAt || r.ts || 0).getTime() < 24 * 3600 * 1000);
    let sent = 0;
    for (const r of checkable.slice(0, 20)) { try { await pollStatus(st, r, cfg); } catch (e) { /* next pass */ } }
    for (const r of pending.slice(0, 10)) {
      try {
        await st.patch('sms_outbox', r.id, { status: 'sending' });
        await sendOne(st, r, cfg);
        sent++;
      } catch (e) {
        const attempts = (r.attempts || 0) + 1;
        await st.patch('sms_outbox', r.id, {
          status: attempts >= 3 ? 'failed' : 'pending',
          attempts, error: String((e && e.message) || e).slice(0, 200),
        });
        say('sms-sender: send failed for ' + r.id + ': ' + String((e && e.message) || e).slice(0, 120));
      }
      await new Promise((res) => setTimeout(res, 4000)); /* gentle pacing between sends */
    }
    return { sent };
  }

  async function runAll() {
    if (running) return;
    running = true;
    try {
      const labs = await saas.loadLabs(true);
      for (const lab of labs.values()) {
        try { await runLab(lab); } catch (e) { say('sms-sender lab ' + lab.id + ': ' + e.message); }
      }
    } catch (e) { say('sms-sender: ' + e.message); }
    running = false;
  }

  return {
    start() {
      if (timer) return;
      const every = +process.env.SMS_SENDER_MS || 45000;
      timer = setInterval(() => { runAll().catch(() => {}); }, every);
      setTimeout(() => { runAll().catch(() => {}); }, 15000);
      say('sms-sender started (every ' + Math.round(every / 1000) + 's)');
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
    status() { return { running: !!timer }; },
    runAll,
  };
}

module.exports = { create };
