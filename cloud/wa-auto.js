/* Automatic WhatsApp messages — each one is a tick box in Settings -> WhatsApp (settings.whatsapp.*) and does nothing until it is ticked:
     autoReceipt        a receipt to the patient a minute or two after an invoice is made
     autoDueReminder    a polite balance reminder, once a week on the day the lab picks, to patients who still owe money
     autoOwnerSummary   a daily summary to the owner's number at the hour the lab picks
     autoFeedback       a thank-you + feedback / Google review request about a day after the report is ready
     autoRetest         "time to repeat your test" for tests that have "Remind to repeat after (days)" set
   They run on the server (where the lab's linked WhatsApp number lives), look at the lab's own data only, go out through the same sending line
   as everything else (one message a minute by default), and remember what they already sent so nothing is sent twice. */
'use strict';

const DAY = 86400000;
const TZ = process.env.LAB_TZ || 'Asia/Karachi';
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function local(d, tz) { /* the date / hour / weekday as the lab sees them */
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' });
  const p = {}; f.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return { ymd: p.year + '-' + p.month + '-' + p.day, hour: +p.hour % 24, dow: WD[p.weekday] };
}
const rs = (n) => 'Rs ' + Math.round(+n || 0).toLocaleString('en-US');
const dlabel = (d) => { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }); } catch (e) { return ''; } };
const phoneOf = (p) => String((p && (p.whatsapp || p.phone)) || '').trim();
const waNum = (p) => { let d = String(p || '').replace(/\D/g, ''); while (d.indexOf('00') === 0) d = d.slice(2); if (d.charAt(0) === '0') d = '92' + d.slice(1); return d; };
const clean = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t*_~`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function create({ saas, raw, waGw, log }) {
  const say = log || (() => {});
  let running = false, timer = null;

  async function stateOf(labId) { return (await raw.getMeta('wajobs:' + labId)) || {}; }
  async function saveState(labId, S) {
    const cut = Date.now() - 150 * DAY;
    for (const k of ['receipt', 'due', 'feedback', 'fbPat', 'retest']) { const m = S[k] || {}; for (const id of Object.keys(m)) { const at = typeof m[id] === 'object' ? m[id].at : m[id]; if (at < cut) delete m[id]; } S[k] = m; }
    await raw.setMeta('wajobs:' + labId, S);
  }

  /* one lab, one pass over the five jobs. `now` can be given by tests. */
  async function runLab(lab, now, only) {
    const st = saas.storeFor(lab), set = (await st.get('settings', 'main')) || {}, W = set.whatsapp || {};
    const on = (k) => W[k] === true && (!only || only === k);
    if (!on('autoReceipt') && !on('autoDueReminder') && !on('autoOwnerSummary') && !on('autoFeedback') && !on('autoRetest')) return { sent: 0 };
    const gw = waGw.status(lab.id); if (gw.state !== 'open') return { sent: 0, skipped: 'whatsapp not connected' };
    const eff = saas.effStatus(lab); if (eff === 'suspended') return { sent: 0 };
    const labName = clean(set.labName || lab.name || 'Lab', 60), labPhone = clean(set.phone, 30);
    const S = await stateOf(lab.id), lt = local(now, TZ), nowMs = now.getTime();
    let sent = 0, budget = +process.env.WA_AUTO_BUDGET || 30;
    const need = async (kind, fn) => { /* load the tables only when a job needs them */ return fn(); };
    const send = async (to, text, kind) => {
      if (budget <= 0) return false;
      try { waGw.sendText(lab.id, waNum(to), text, kind); sent++; budget--; return true; }
      catch (e) { if (/limit|not linked|waiting/i.test(e.message)) budget = 0; return false; }
    };
    const patients = {}, pats = async () => { if (!Object.keys(patients).length) (await st.all('patients')).forEach((p) => { patients[p.id] = p; }); return patients; };

    /* 1) receipts */
    if (on('autoReceipt')) {
      S.receipt = S.receipt || {}; await pats();
      for (const inv of await st.all('invoices')) {
        const age = nowMs - new Date(inv.createdAt || 0).getTime();
        if (!(age > 90000 && age < 6 * 3600000) || S.receipt[inv.id] || !(+inv.total > 0)) continue;
        if (inv.panelId) { S.receipt[inv.id] = nowMs; continue; } /* a company's bill: nothing for the patient to pay or be reminded about */
        const p = patients[inv.patientId], to = phoneOf(p); if (!to) { S.receipt[inv.id] = nowMs; continue; }
        const items = (inv.items || []).map((x) => x.name || x.code).filter(Boolean).join(', '), due = +inv.due || 0;
        const txt = '*' + labName + '*\n\nAssalam-o-Alaikum ' + clean(p.name, 60) + ',\n\nThank you for visiting us. Here is your receipt:\n\n*Invoice:* ' + clean(inv.no || inv.id, 30) + ' (' + dlabel(inv.createdAt) + ')\n*Tests:* ' + clean(items, 300) +
          '\n*Total:* ' + rs(inv.total) + '\n*Paid:* ' + rs(inv.paid) + (due > 0.009 ? '\n*Balance:* ' + rs(due) : '\n*Status:* Paid in full') + '\n\nYour report will be sent to you here on WhatsApp as soon as it is ready.' + (labPhone ? '\n\n' + labName + ' | ' + labPhone : '');
        if (await send(to, txt, 'receipt')) S.receipt[inv.id] = nowMs;
      }
    }

    /* 2) weekly balance reminders: on the chosen weekday around 11 am, at most 4 per invoice, a week apart */
    if (on('autoDueReminder') && lt.dow === (+W.dueReminderDay >= 0 && +W.dueReminderDay <= 6 ? +W.dueReminderDay : 1) && lt.hour >= 11 && lt.hour < 17 && S.dueDay !== lt.ymd) {
      S.due = S.due || {}; await pats(); let finished = true;
      for (const inv of await st.all('invoices')) {
        const due = +inv.due || 0, age = nowMs - new Date(inv.createdAt || 0).getTime(); if (!(due > 0.009) || age < 3 * DAY) continue;
        const rec = S.due[inv.id] || { n: 0, at: 0 }; if (rec.n >= 4 || nowMs - rec.at < 6 * DAY) continue;
        const p = patients[inv.patientId], to = phoneOf(p); if (!to) continue;
        const txt = '*' + labName + '*\n\nAssalam-o-Alaikum ' + clean(p.name, 60) + ',\n\nThis is a gentle reminder that a balance of *' + rs(due) + '* is pending for invoice ' + clean(inv.no || inv.id, 30) + ' (' + dlabel(inv.createdAt) + ').\nKindly clear it at your earliest convenience. If you have already paid, please ignore this message.\n\nThank you for your cooperation.' + (labPhone ? '\n' + labPhone : '');
        if (await send(to, txt, 'due-reminder')) S.due[inv.id] = { n: rec.n + 1, at: nowMs }; else if (budget <= 0) { finished = false; break; }
      }
      if (finished) S.dueDay = lt.ymd;
    }

    /* 3) daily summary for the owner */
    if (on('autoOwnerSummary') && lt.hour >= (W.ownerSummaryHour >= 0 && W.ownerSummaryHour <= 23 ? +W.ownerSummaryHour : 21) && S.summary !== lt.ymd) {
      const to = W.ownerNumber || W.labNumber || gw.number; if (to && (await sendSummary(lab, st, set, labName, lt, to, now, true))) { S.summary = lt.ymd; sent++; }
    }

    /* 4) feedback / Google review, about a day after the report */
    if (on('autoFeedback')) {
      S.feedback = S.feedback || {}; S.fbPat = S.fbPat || {}; await pats();
      const rbyInv = {}; (await st.all('results')).forEach((r) => { (rbyInv[r.invoiceId] = rbyInv[r.invoiceId] || []).push(r); });
      for (const inv of await st.all('invoices')) {
        const rs_ = rbyInv[inv.id]; if (!rs_ || !rs_.length || rs_.some((r) => r.status !== 'ready') || (+inv.due || 0) > 0.009 || S.feedback[inv.id]) continue;
        const last = Math.max.apply(null, rs_.map((r) => new Date(r.reportedAt || 0).getTime())), age = nowMs - last; if (!(age > 20 * 3600000 && age < 48 * 3600000)) continue;
        const p = patients[inv.patientId], to = phoneOf(p); if (!to) continue; if (S.fbPat[p.id] && nowMs - S.fbPat[p.id] < 30 * DAY) { S.feedback[inv.id] = nowMs; continue; }
        const link = /^https:\/\/[^\s]{6,300}$/.test(String(W.googleReviewUrl || '').trim()) ? W.googleReviewUrl.trim() : '';
        const txt = '*' + labName + '*\n\nAssalam-o-Alaikum ' + clean(p.name, 60) + ',\n\nThank you for choosing ' + labName + '. We hope you were happy with our service.\n\n' + (link ? 'If you have a minute, please tell us how we did:\n' + link + '\n\n' : '') + 'You can also reply to this message with any suggestion or complaint; we read every one.';
        if (await send(to, txt, 'feedback')) { S.feedback[inv.id] = nowMs; S.fbPat[p.id] = nowMs; }
      }
    }

    /* 5) "time to repeat your test": tests with Remind to repeat after (days), 3 days before it is due, up to 2 weeks late */
    if (on('autoRetest')) {
      S.retest = S.retest || {}; await pats();
      const tests = {}; (await st.all('tests')).forEach((t) => { if (+t.retestDays > 0) tests[t.id] = t; });
      if (Object.keys(tests).length) {
        const invs = {}; (await st.all('invoices')).forEach((i) => { invs[i.id] = i; });
        const rows = (await st.all('results')).filter((r) => r.status === 'ready' && tests[r.testId] && invs[r.invoiceId] && r.reportedAt);
        const latest = {}; rows.forEach((r) => { const k = invs[r.invoiceId].patientId + '|' + r.testId, t = new Date(r.reportedAt).getTime(); if (!(latest[k] >= t)) latest[k] = t; });
        for (const r of rows) {
          const inv = invs[r.invoiceId], k = inv.patientId + '|' + r.testId, t = new Date(r.reportedAt).getTime(), key = k + '|' + t;
          if (latest[k] > t || S.retest[key]) continue;                         /* he already repeated it */
          const dueAt = t + tests[r.testId].retestDays * DAY; if (nowMs < dueAt - 3 * DAY || nowMs > dueAt + 14 * DAY) continue;
          const p = patients[inv.patientId], to = phoneOf(p); if (!to) continue;
          const months = tests[r.testId].retestDays >= 60 ? Math.round(tests[r.testId].retestDays / 30) + ' months' : tests[r.testId].retestDays + ' days';
          const txt = '*' + labName + '*\n\nAssalam-o-Alaikum ' + clean(p.name, 60) + ',\n\nIt has been about ' + months + ' since your *' + clean(tests[r.testId].name, 80) + '* at ' + labName + '. A repeat test is usually advised at this interval to keep track of your health; please follow your doctor\'s advice.\n\nYou are welcome to visit us anytime.' + (labPhone ? '\n' + labPhone : '');
          if (await send(to, txt, 'retest')) S.retest[key] = nowMs;
        }
      }
    }
    await saveState(lab.id, S);
    return { sent };
  }

  /* the owner's daily summary */
  async function sendSummary(lab, st, set, labName, lt, to, now, urgent) {
    const ymdOf = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d) : local(new Date(d || 0), TZ).ymd), today = lt.ymd;
    const invs = await st.all('invoices'), pays = await st.all('payments'), exps = await st.all('expenses'), pats = await st.all('patients'), results = await st.all('results');
    const todays = invs.filter((i) => ymdOf(i.createdAt) === today), billed = todays.reduce((a, i) => a + (+i.total || 0), 0);
    const collected = pays.filter((p) => p.status !== 'void' && ymdOf(p.date || p.createdAt) === today).reduce((a, p) => a + (+p.amount || 0), 0);
    const spent = exps.filter((e) => ymdOf(e.date || e.createdAt) === today).reduce((a, e) => a + (+e.amount || 0), 0);
    const outstanding = invs.reduce((a, i) => a + Math.max(0, +i.due || 0), 0);
    let corp = 0; try { for (const pn of await st.all('panels')) { const b = (+pn.openingBalance || 0) + invs.filter((i) => i.panelId === pn.id).reduce((a, i) => a + (+i.total || 0), 0) - (pn.receipts || []).reduce((a, r) => a + (+r.amount || 0), 0); if (b > 0) corp += b; } } catch (e) { /* no panels table yet */ }
    const newPats = pats.filter((p) => ymdOf(p.createdAt) === today).length;
    const byInv = {}; results.forEach((r) => { (byInv[r.invoiceId] = byInv[r.invoiceId] || []).push(r); });
    const pending = invs.filter((i) => (byInv[i.id] || []).some((r) => r.status !== 'ready') || !(byInv[i.id] || []).length).length;
    const cnt = {}; todays.forEach((i) => (i.items || []).forEach((x) => { const n = clean(x.name || x.code, 40); if (n) cnt[n] = (cnt[n] || 0) + 1; }));
    const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3).map((n) => n + ' (' + cnt[n] + ')').join(', ');
    const patientsToday = {}; todays.forEach((i) => { patientsToday[i.patientId] = 1; });
    const txt = '*' + labName + ' — daily summary*\n' + dlabel(now) + '\n\n*Patients:* ' + Object.keys(patientsToday).length + (newPats ? ' (' + newPats + ' new)' : '') + '\n*Invoices:* ' + todays.length + '   *Billed:* ' + rs(billed) +
      '\n*Collected today:* ' + rs(collected) + (spent ? '\n*Expenses today:* ' + rs(spent) : '') + '\n*Total outstanding dues:* ' + rs(outstanding) + (corp > 0 ? '\n*Company accounts to collect:* ' + rs(corp) : '') + '\n*Reports still pending:* ' + pending + (top ? '\n\n*Top tests today:* ' + top : '');
    try { if (urgent) await waGw.sendUrgent(lab.id, waNum(to), txt, 'owner-summary'); else waGw.sendText(lab.id, waNum(to), txt, 'owner-summary'); return true; } catch (e) { return false; }
  }

  async function runAll(now, only) {
    if (running) return; running = true; let sent = 0;
    try { for (const lab of (await saas.loadLabs(true)).values()) { try { sent += (await runLab(lab, now || new Date(), only)).sent || 0; } catch (e) { say('auto messages (lab ' + lab.id + '): ' + String((e && e.message) || e).slice(0, 120)); } } }
    finally { running = false; }
    return sent;
  }
  function start() {
    if (timer) return; const every = +process.env.WA_AUTO_INTERVAL_MS || 120000;
    timer = setInterval(() => { runAll().catch(() => {}); }, every); setTimeout(() => runAll().catch(() => {}), +process.env.WA_AUTO_FIRST_MS || 45000);
  }
  /* "send me today's summary now" button + tests */
  async function summaryNow(lab) {
    const st = saas.storeFor(lab), set = (await st.get('settings', 'main')) || {}, W = set.whatsapp || {}, gw = waGw.status(lab.id);
    if (gw.state !== 'open') throw new Error('Link your WhatsApp number first.');
    const to = W.ownerNumber || W.labNumber || gw.number; const now = new Date();
    if (!(await sendSummary(lab, st, set, clean(set.labName || lab.name || 'Lab', 60), local(now, TZ), to, now, true))) throw new Error('Could not send the summary.');
    return true;
  }
  return { start, runAll, runLab, summaryNow, local };
}
module.exports = { create, local };
