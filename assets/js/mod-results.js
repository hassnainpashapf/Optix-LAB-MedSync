/* ============================================================
   Optix Medical Sync — Lab Results module
   Route: #/results
   - Pending results grouped by invoice, per-test result entry
   - Ready results grouped by invoice, printable lab reports
   ============================================================ */
(function () {
  'use strict';

  var tab = 'pending';   // 'pending' | 'ready'
  var query = '';

  /* ---------- helpers ---------- */

  function sessionUser() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (!s) return 'system';
      var u = s.userId ? DB.get('users', s.userId) : null;
      return (u && u.username) || s.name || 'system';
    } catch (e) { return 'system'; }
  }

  function invOf(id) { return DB.get('invoices', id) || null; }
  function patOf(pid) { return DB.get('patients', pid) || {}; }

  /* patient-case number for patient-facing report outputs ('P # 03 - 08/10');
     falls back to the old invoice-number behavior when the invoice is missing */
  function rptCaseText(inv) {
    if (!inv || (!inv.id && !inv.no)) return (inv && (inv.no || inv.id)) || '';
    try {
      if (typeof App !== 'undefined' && App.visitNos) { var vn = App.visitNos(inv); if (vn && vn.caseText) return vn.caseText; }
    } catch (e) {}
    return inv.no || inv.id || '';
  }

  function waPhone(p) {
    return App.normWa(p); /* shared helper (app.js) */
  }

  /* ---------- WhatsApp API (send report PDF) ---------- */

  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;vertical-align:-2px"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.13a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.54-3.7 8.22-8.24 8.22zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.38-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29z"/></svg>';

  var PRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';

  function waCfg() {
    try {
      var s = DB.get('settings', 'main') || {};
      return s.whatsapp || {};
    } catch (e) { return {}; }
  }
  function waReady(cfg) {
    return !!(cfg && ((cfg.provider === 'gateway' && cfg.gatewayNumber) || (cfg.instanceId && cfg.token)));
  }
  function waSummaryText(inv, pat) {
    var s = DB.get('settings', 'main') || {};
    return (s.labName || 'Lab') + '\nAssalam-o-Alaikum ' + (pat.name || '') + ',\n' +
      'Your lab report is ready.\nPatient No: ' + rptCaseText(inv) + ' (' + App.d(inv.createdAt) + ')\n' +
      'Please collect it from the lab or reply here. Shukriya!';
  }
  /* ---------- manual send buttons (finalized report view) ----------
     Strict API send: no wa.me fallback. Reuses the same send helper
     (waSendText), phone normalization (waPhone) and log writer
     (waLogWaSend) as the auto-send flow. */

  function waHistTs(ts) {
    var t = new Date(ts);
    if (isNaN(t.getTime())) return '';
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(t.getDate()) + '-' + MON[t.getMonth()] + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }

  /* compact "WhatsApp sent" history for one invoice, e.g.
     "✓ Sent to patient 06-Oct 14:20" / "✓ Sent to Dr. Ahmed Khan 06-Oct 14:20" */
  function waHistoryHtml(invoiceId) {
    var logs = [];
    try {
      logs = (DB.all('wa_log') || []).filter(function (e) {
        return e && e.kind === 'report' && e.invoiceId === invoiceId;
      });
    } catch (e) { logs = []; }
    if (!logs.length) return '';
    logs.sort(function (a, b) { return a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0); });
    var rows = logs.slice(0, 4).map(function (e) {
      var who = e.toRole === 'doctor' ? (e.toName || 'doctor') : 'patient';
      var mark = e.status === 'sent' ? '✓' : '✗';
      var verb = e.status === 'sent' ? 'Sent to' : 'Failed to';
      return '<div style="padding:2px 0">' + mark + ' ' + verb + ' ' + App.esc(who) +
        ' <span class="muted">' + App.esc(waHistTs(e.ts)) + '</span></div>';
    }).join('');
    if (logs.length > 4) rows += '<div class="muted">+' + (logs.length - 4) + ' more</div>';
    return '<div style="font-size:12.5px;color:var(--ink,#1f2937);background:var(--soft,#f8fafc);' +
      'border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-bottom:4px">' + rows + '</div>';
  }

  /* refresh the history indicator inside the open report modal */
  function waRefreshHistory(invoiceId) {
    var box = document.getElementById('rvWaHist');
    if (box) box.innerHTML = waHistoryHtml(invoiceId);
  }

  function waGoSettings() {
    App.nav('#/settings');
    setTimeout(function () { if (App.openWaSettingsTab) App.openWaSettingsTab(); }, 80);
  }

  /* Manual send of a finalized report to the patient or the referring doctor.
     toRole: 'patient' | 'doctor'. Every attempt is recorded in wa_log. */
  function waManualSend(invoiceId, toRole) {
    var inv = invOf(invoiceId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    var cfg = waCfg();
    if (!waReady(cfg)) {
      App.toast('WhatsApp API is not configured', 'err');
      App.confirm('WhatsApp sending is not set up yet. Open Settings to configure it now?').then(function (ok) {
        if (ok) waGoSettings();
      });
      return;
    }
    var pat = patOf(inv.patientId);
    var doc = toRole === 'doctor' ? (inv.doctorId ? DB.get('doctors', inv.doctorId) : null) : null;
    if (toRole === 'doctor' && !doc) { App.toast('No referring doctor on this invoice', 'err'); return; }
    var target = toRole === 'doctor' ? doc : pat;
    var to = waPhone(target.whatsapp || target.phone); /* dedicated WhatsApp no., else phone */
    if (!to) {
      App.toast(toRole === 'doctor' ? 'No WhatsApp number on file' : 'No WhatsApp number on patient record', 'err');
      return;
    }
    var rows = joinedRows('ready').filter(function (r) { return r.invoice.id === invoiceId; });
    var testNames = [];
    rows.forEach(function (r) {
      var nm = (r.item && r.item.name) || (r.test && r.test.name) || '';
      if (nm && testNames.indexOf(nm) < 0) testNames.push(nm);
    });
    function doSend(link) {
      var msg = toRole === 'doctor'
        ? waDoctorMessage(inv, doc, pat, testNames, link)
        : waPatientMessage(inv, pat, testNames, link);
      var whoName = toRole === 'doctor' ? (doc.name || 'doctor') : (pat.name || 'patient');
      App.toast('Sending report to ' + whoName + '…', 'info');
      waSendText(cfg, to, msg, function (err, info) {
        waLogWaSend({
          invoiceId: invoiceId, to: to,
          toName: toRole === 'doctor' ? (doc.name || '') : (pat.name || ''),
          toRole: toRole, status: err ? 'failed' : 'sent',
          error: err ? String(err.message || err).slice(0, 200) : ''
        });
        if (err) App.toast('WhatsApp send failed: ' + String(err.message || err).slice(0, 120), 'err');
        else App.toast('Report ' + (info && info.queued ? 'queued for ' : 'sent to ') + whoName + ' on WhatsApp' + waWhen(info));
        waRefreshHistory(invoiceId);
      });
    }
    waReportLink(invoiceId, true).then(doSend); /* a staff member pressed Send: give a real public link even if a balance is pending */
  }

  // POST the PDF document to the configured provider. done(err)
  function waSendDocument(cfg, to, filename, dataUri, caption, done) {
    var url, body, headers = {};
    if (cfg.provider === 'custom' && cfg.baseUrl) {
      url = cfg.baseUrl;
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ to: to, filename: filename, document: dataUri, caption: caption, token: cfg.token });
    } else {
      // Ultramsg-compatible
      url = 'https://api.ultramsg.com/' + encodeURIComponent(cfg.instanceId) + '/messages/document';
      var fd = new FormData();
      fd.append('token', cfg.token);
      fd.append('to', to);
      fd.append('filename', filename);
      fd.append('document', dataUri);
      fd.append('caption', caption || '');
      body = fd;
    }
    var timer = setTimeout(function () { done(new Error('Request timed out')); done = function () {}; }, 45000);
    fetch(url, { method: 'POST', headers: headers, body: body })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          return { status: r.status, json: j, text: t };
        });
      })
      .then(function (res) {
        clearTimeout(timer);
        var j = res.json || {};
        var ok = res.status >= 200 && res.status < 300 &&
          (j.sent === true || j.sent === 'true' || j.status === 'sent' || j.success === true || res.status === 200);
        if (ok) done(null);
        else done(new Error((j.message || j.error || res.text || ('HTTP ' + res.status)).toString().slice(0, 140)));
      })
      .catch(function (e) { clearTimeout(timer); done(e); });
  }

  /* ---------- Auto-send report on ready ---------- */

  // TEXT message send (Ultramsg /messages/chat or custom provider). done(err)
  /* "queued" answer of the lab's own number: reports leave one by one (default one a minute) so the number is not blocked */
  function waWhen(info) {
    if (!info || !info.queued || !(info.etaSec > 10)) return '';
    var m = Math.max(1, Math.round(info.etaSec / 60)); return ' — queued, it goes out in about ' + m + ' min (one message a minute keeps your number safe)';
  }
  function waSendText(cfg, to, text, done, opts) {
    if (cfg.provider === 'gateway') { /* the lab's own linked WhatsApp number: the server sends it */
      DB.waGw('POST', 'send', { to: to, text: text, kind: opts && opts.kind }).then(function (r) { done(null, r); }, function (e) { done(e); });
      return;
    }
    var url, body, headers = {};
    if (cfg.provider === 'custom' && cfg.baseUrl) {
      url = cfg.baseUrl;
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ to: to, text: text, token: cfg.token });
    } else {
      // Ultramsg-compatible
      url = 'https://api.ultramsg.com/' + encodeURIComponent(cfg.instanceId) + '/messages/chat';
      var fd = new FormData();
      fd.append('token', cfg.token);
      fd.append('to', to);
      fd.append('body', text);
      body = fd;
    }
    var timer = setTimeout(function () { done(new Error('Request timed out')); done = function () {}; }, 45000);
    fetch(url, { method: 'POST', headers: headers, body: body })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          return { status: r.status, json: j, text: t };
        });
      })
      .then(function (res) {
        clearTimeout(timer);
        var j = res.json || {};
        var ok = res.status >= 200 && res.status < 300 &&
          (j.sent === true || j.sent === 'true' || j.status === 'sent' || j.success === true || res.status === 200);
        if (ok) done(null);
        else done(new Error((j.message || j.error || res.text || ('HTTP ' + res.status)).toString().slice(0, 140)));
      })
      .catch(function (e) { clearTimeout(timer); done(e); });
  }

  function waLogWaSend(entry) {
    try {
      DB.insert('wa_log', {
        kind: entry.kind || 'report',
        invoiceId: entry.invoiceId || null,
        to: entry.to || null,
        toName: entry.toName || '',
        toRole: entry.toRole === 'doctor' ? 'doctor' : 'patient',
        status: entry.status === 'sent' ? 'sent' : 'failed',
        error: entry.error || '',
        ts: new Date().toISOString()
      });
    } catch (e) {}
  }

  function waAlreadySent(invoiceId, toRole) {
    try {
      return DB.all('wa_log').some(function (e) {
        return e.kind === 'report' && e.invoiceId === invoiceId && e.toRole === toRole && e.status === 'sent';
      });
    } catch (e) { return false; }
  }

  /* ---------- message templates ----------
     Editable in WhatsApp Center (settings.whatsapp.tplPatient / tplDoctor / tplDue). Placeholders:
     {lab} {patient} {doctor} {invoice} {date} {tests} {total} {due} {link} {linkline}
     {linkline} = "View / download: <link>" when a report link exists, otherwise "Please collect your report from the lab." */
  var WA_TPL = {
    tplPatient: '*{lab}*\n\nAssalam-o-Alaikum {patient},\n\nYour laboratory report is ready.\n\n*Invoice:* {invoice} ({date})\n*Tests:* {tests}\n\n{linkline}\n\nThank you for choosing {lab}.',
    tplDoctor: '*{lab}*\n\nAssalam-o-Alaikum {doctor},\n\nThe laboratory report of your patient *{patient}* is ready.\n\n*Invoice:* {invoice} ({date})\n*Tests:* {tests}\n\n{linkline}\n\nWith regards,\n{lab}',
    tplDue: '*{lab}*\n\nAssalam-o-Alaikum {patient},\n\nYour laboratory report (invoice {invoice}) is ready.\nAn outstanding balance of *{due}* is pending. Please clear it at the lab and your report will be sent to you here automatically.\n\nThank you for your cooperation.'
  };

  function waRenderTpl(tpl, v) {
    v = v || {};
    var lineText = v.link ? 'Report (PDF): ' + v.link : 'Please collect your report from the lab.';
    var vars = { lab: v.lab || 'Lab', patient: v.patient || '', doctor: v.doctor || '', invoice: v.invoice || '', date: v.date || '', tests: v.tests || '', total: v.total || '', due: v.due || '', link: v.link || '', linkline: lineText };
    var out = String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m; });
    return out.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
  }
  function waTplText(name) { var c = waCfg(); return (c && c[name] && String(c[name]).replace(/\s/g, '')) ? c[name] : WA_TPL[name]; }
  function waVars(inv, pat, doc, testNames, link) {
    var s = DB.get('settings', 'main') || {};
    return { lab: s.labName || 'Lab', patient: pat.name || '', doctor: (doc && doc.name) || '', invoice: inv.no || inv.id, date: App.d(inv.createdAt), tests: (testNames || []).join(', '), total: App.money(inv.total), due: App.money(inv.due), link: link || '' };
  }
  function waAlreadyNoted(invoiceId) {
    try { return DB.all('wa_log').some(function (e) { return e.kind === 'due' && e.invoiceId === invoiceId && e.status === 'sent'; }); } catch (e) { return false; }
  }
  function waPatientMessage(inv, pat, testNames, link) { return waRenderTpl(waTplText('tplPatient'), waVars(inv, pat, null, testNames, link)); }
  function waDoctorMessage(inv, doc, pat, testNames, link) { return waRenderTpl(waTplText('tplDoctor'), waVars(inv, pat, doc, testNames, link)); }
  function waDueMessage(inv, pat, testNames) { return waRenderTpl(waTplText('tplDue'), waVars(inv, pat, null, testNames, '')); }

  function waTestNames(invoiceId) {
    var names = [];
    joinedRows('ready').filter(function (r) { return r.invoice.id === invoiceId; }).forEach(function (r) {
      var nm = (r.item && r.item.name) || (r.test && r.test.name) || '';
      if (nm && names.indexOf(nm) < 0) names.push(nm);
    });
    return names;
  }
  /* is every result of this invoice finished? */
  function waAllReady(invoiceId) {
    var all = DB.all('results').filter(function (r) { return r.invoiceId === invoiceId; });
    return all.length > 0 && !all.some(function (r) { return r.status !== 'ready'; });
  }
  /* report link for the message: only a real, public PDF link (uploaded to the cloud). Unpaid invoices have no link
     unless the lab chose "send anyway" (force). Never a login-gated app link — patients and doctors cannot open those. */
  function waReportLink(invoiceId, force) {
    try { return getReportPdfUrl(invoiceId, !!force).then(function (u) { return u || ''; }, function () { return ''; }); }
    catch (e) { return Promise.resolve(''); }
  }

  function waSendToPatient(invoiceId, inv, pat, testNames, link, cfg, kind) {
    var name = pat.name || '';
    var isNote = kind === 'due';
    if (!isNote && waAlreadySent(invoiceId, 'patient')) return;
    if (isNote && waAlreadyNoted(invoiceId)) return;
    var to = waPhone(pat.whatsapp || pat.phone);
    if (!to) {
      waLogWaSend({ invoiceId: invoiceId, to: null, toName: name, toRole: 'patient', status: 'failed', error: 'no WhatsApp number on patient record', kind: isNote ? 'due' : 'report' });
      App.toast('Auto-send skipped — no WhatsApp number for ' + (name || 'patient'), 'err');
      return;
    }
    var msg = isNote ? waDueMessage(inv, pat, testNames) : waPatientMessage(inv, pat, testNames, link);
    waSendText(cfg, to, msg, function (err, info) {
      waLogWaSend({
        invoiceId: invoiceId, to: to, toName: name, toRole: 'patient', kind: isNote ? 'due' : 'report',
        status: err ? 'failed' : 'sent',
        error: err ? String(err.message || err).slice(0, 200) : ''
      });
      if (err) App.toast('WhatsApp auto-send failed for ' + (name || 'patient'), 'err');
      else App.toast((isNote ? 'Balance reminder ' : 'Report ') + (info && info.queued ? 'queued on WhatsApp for ' : 'auto-sent on WhatsApp to ') + (name || 'patient') + waWhen(info));
    });
  }

  function waSendToDoctor(invoiceId, inv, pat, testNames, link, cfg) {
    var doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
    if (!doc) return;
    var name = doc.name || '';
    if (waAlreadySent(invoiceId, 'doctor')) return;
    var to = waPhone(doc.whatsapp || doc.phone);
    if (!to) {
      waLogWaSend({ invoiceId: invoiceId, to: null, toName: name, toRole: 'doctor', status: 'failed', error: 'no WhatsApp number on doctor record' });
      App.toast('Auto-send skipped — no WhatsApp number for ' + (name || 'doctor'), 'err');
      return;
    }
    var msg = waDoctorMessage(inv, doc, pat, testNames, link);
    waSendText(cfg, to, msg, function (err, info) {
      waLogWaSend({
        invoiceId: invoiceId, to: to, toName: name, toRole: 'doctor',
        status: err ? 'failed' : 'sent',
        error: err ? String(err.message || err).slice(0, 200) : ''
      });
      if (err) App.toast('WhatsApp auto-send failed for ' + (name || 'doctor'), 'err');
      else App.toast('Report ' + (info && info.queued ? 'queued on WhatsApp for ' : 'auto-sent on WhatsApp to ') + (name || 'doctor') + waWhen(info));
    });
  }

  /* Sends for one invoice once its WHOLE report is ready.
     Unpaid / part-paid invoice, by the lab's rule (WhatsApp Center): "note" (default) = tell the patient the report is ready and what
     balance is pending, and send the report itself automatically the moment it is fully paid; "hold" = send nothing until paid;
     "send" = send the report right away anyway. */
  function waTryAutoSendOne(invoiceId, cfg, autoPat, autoDoc) {
    var inv = invOf(invoiceId);
    if (!inv) return;
    if (!waAllReady(invoiceId)) return;
    var testNames = waTestNames(invoiceId);
    if (!testNames.length) return;
    var pat = patOf(inv.patientId);
    var owes = (+inv.due || 0) > 0.009;
    var rule = cfg.dueRule || 'note';
    if (owes && rule !== 'send') {
      if (rule === 'note' && autoPat) { try { waSendToPatient(invoiceId, inv, pat, testNames, '', cfg, 'due'); } catch (e) {} }
      return; /* the report goes out when the balance is paid (App.waOnPaid) */
    }
    waReportLink(invoiceId, owes).then(function (link) {
      try { if (autoPat) waSendToPatient(invoiceId, inv, pat, testNames, link, cfg); } catch (e) {}
      try { if (autoDoc && inv.doctorId) waSendToDoctor(invoiceId, inv, pat, testNames, link, cfg); } catch (e) {}
    });
  }
  /* called when a payment is recorded: if that completes the payment of a finished report that was waiting, send it now */
  App.waOnPaid = function (invoiceId) {
    try {
      var inv = invOf(invoiceId);
      try { if (inv && (+inv.due || 0) <= 0.009 && waAllReady(invoiceId)) emailAutoReady([invoiceId]); } catch (e) {}
      if (!inv || (+inv.due || 0) > 0.009 || !waReady(waCfg()) || !waAllReady(invoiceId)) return;
      if (waAlreadySent(invoiceId, 'patient') && (!inv.doctorId || waAlreadySent(invoiceId, 'doctor'))) return;
      waAutoSendReady([invoiceId]);
    } catch (e) {}
  };

  /* ---------- critical values ----------
     A numeric result is CRITICAL when it is far outside the patient's reference range (> 25% of the range width beyond
     either limit, see abnormalSeverity). Saving such a result raises an immediate alert: a red pop-up for the technician,
     a WhatsApp to the referring doctor and to the lab's own number (Settings > WhatsApp > "critical alerts", default ON),
     and a "Critical results" card on every dashboard until someone acknowledges it. */
  function criticalOf(row, vals) {
    var out = [];
    try {
      var params = (row.test && Array.isArray(row.test.params)) ? row.test.params : [];
      var pat = row.patient || patOf(row.invoice && row.invoice.patientId);
      params.forEach(function (p) {
        var v = vals[p.name];
        if (v == null || v === '') return;
        var ref = refFor(p, pat);
        var sev = abnormalSeverity(String(v), ref);
        if (sev && sev.severity === 'critical') out.push({ name: p.name, value: String(v), unit: p.unit || '', dir: sev.dir, ref: ref });
      });
    } catch (e) {}
    return out;
  }
  function criticalMessage(inv, pat, crits, testName) {
    var s = DB.get('settings', 'main') || {};
    var lines = crits.map(function (c) {
      return '• ' + c.name + ': ' + c.value + (c.unit ? ' ' + c.unit : '') + (c.dir === 'high' ? ' ↑ HIGH' : ' ↓ LOW') + (c.ref ? '  (normal ' + c.ref + ')' : '');
    });
    return '🚨 *CRITICAL RESULT*\n*' + (s.labName || 'Lab') + '*\n\n*Patient:* ' + (pat.name || '—') +
      (pat.age ? ' (' + pat.age + ' yrs' + (pat.gender ? ', ' + pat.gender : '') + ')' : '') + '\n*Invoice:* ' + (inv.no || inv.id) +
      (testName ? '\n*Test:* ' + testName : '') + '\n\n' + lines.join('\n') + '\n\nPlease review and take action immediately.';
  }
  function criticalNotify(items) { /* items: [{row, crits}] */
    if (!items || !items.length) return;
    var cfg = waCfg();
    var canWa = waReady(cfg) && cfg.autoCritical !== false;
    var sent = [];
    items.forEach(function (it) {
      var inv = it.row.invoice, pat = it.row.patient || patOf(inv.patientId), doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
      var msg = criticalMessage(inv, pat, it.crits, testName(it.row));
      var targets = [];
      if (doc && waPhone(doc.whatsapp || doc.phone)) targets.push({ to: waPhone(doc.whatsapp || doc.phone), name: doc.name || 'doctor', role: 'doctor' });
      if (cfg.labNumber && waPhone(cfg.labNumber)) targets.push({ to: waPhone(cfg.labNumber), name: 'Lab', role: 'lab' });
      it.targets = targets.map(function (t) { return t.name; });
      if (!canWa) return;
      targets.forEach(function (t) {
        waSendText(cfg, t.to, msg, function (err) {
          try { DB.insert('wa_log', { kind: 'critical', invoiceId: inv.id, to: t.to, toName: t.name, toRole: t.role, status: err ? 'failed' : 'sent', error: err ? String(err.message || err).slice(0, 200) : '', ts: new Date().toISOString() }); } catch (e) {}
          if (err) App.toast('Critical alert WhatsApp failed for ' + t.name, 'err');
        }, { kind: 'critical' });
        sent.push(t.name);
      });
    });
    var body = items.map(function (it) {
      var inv = it.row.invoice, pat = it.row.patient || patOf(inv.patientId);
      return '<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:12px;padding:12px 14px;margin-bottom:10px">' +
        '<div style="font-weight:800;color:#991b1b">' + App.esc(pat.name || '—') + ' <span style="font-weight:600;color:#7f1d1d">· ' + App.esc(inv.no || inv.id) + ' · ' + App.esc(testName(it.row)) + '</span></div>' +
        it.crits.map(function (c) {
          return '<div style="margin-top:6px;font-size:15px"><b>' + App.esc(c.name) + '</b>: <span style="color:#b91c1c;font-weight:800">' + (c.dir === 'high' ? '&uarr; ' : '&darr; ') +
            App.esc(c.value) + ' ' + App.esc(c.unit) + '</span> <span class="muted" style="font-size:12.5px">(normal ' + App.esc(c.ref || '—') + ')</span></div>';
        }).join('') + '</div>';
    }).join('');
    var tgt = []; items.forEach(function (it) { (it.targets || []).forEach(function (n) { if (tgt.indexOf(n) < 0) tgt.push(n); }); });
    var note = canWa
      ? (tgt.length ? 'WhatsApp alert sent to: <b>' + tgt.map(App.esc).join(', ') + '</b>.' : 'No doctor / lab WhatsApp number on file — please inform the doctor directly.')
      : 'WhatsApp is not configured or critical alerts are off — please inform the doctor directly.';
    App.modal('🚨 Critical value' + (items.length > 1 ? 's' : ''),
      body + '<p style="margin:6px 0 0;font-size:13px">' + note + '</p>' +
      '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-primary" id="critOk">Noted</button></div>',
      { onOpen: function (ov, close) { ov.querySelector('#critOk').addEventListener('click', close); } });
  }
  /* shared with WhatsApp Center (mod-whatsapp.js) */
  App.wa = { cfg: waCfg, ready: waReady, phone: waPhone, send: waSendText, log: waLogWaSend, manual: waManualSend, alreadySent: waAlreadySent, alreadyNoted: waAlreadyNoted,
    tpl: WA_TPL, tplText: waTplText, render: waRenderTpl, vars: waVars, allReady: waAllReady, testNames: waTestNames, autoOne: waTryAutoSendOne,
    patientMsg: waPatientMessage, doctorMsg: waDoctorMessage, dueMsg: waDueMessage };
  App.criticalList = function () {
    try { return DB.all('results').filter(function (r) { return r.critical && r.critical.length && !r.criticalAck; }); } catch (e) { return []; }
  };

  /* Trigger: call after result saves. Sends only for invoices whose report is
     now fully ready. Never throws — the result-save flow must not break. */
  /* ---------- email + Slack sharing (cloud labs; the server does the sending, see /api/share/*) ---------- */
  var _shareSt = null, _shareAt = 0;
  function shareOn() { return !!(window.DB && DB.share && DB.isCloud && DB.isCloud()) && !(window.labposDesktop && window.labposDesktop.isDesktop); }
  function shareStatus(force) {
    if (!shareOn()) return Promise.resolve({ email: false, slack: false, slackAuto: false });
    if (!force && _shareSt && Date.now() - _shareAt < 60000) return Promise.resolve(_shareSt);
    return DB.share('GET', 'status').then(function (j) { _shareSt = j; _shareAt = Date.now(); return j; }, function () { return { email: true, unknown: true, slack: false, slackAuto: false }; });
  }
  App.shareStatus = shareStatus;
  App.mail = { send: function (id, role, to, auto) { return mailSend(id, role, to, auto); }, ask: function (id, role) { emailReport(id, role); }, status: shareStatus, on: shareOn,
    ready: function () { return joinedRowsReadyInvoices(); } };
  function joinedRowsReadyInvoices() {
    var seen = {}, out = [];
    DB.all('results').forEach(function (r) { if (r.invoiceId && !seen[r.invoiceId]) { seen[r.invoiceId] = 1; var inv = invOf(r.invoiceId); if (inv && waAllReady(r.invoiceId)) out.push(inv); } });
    out.sort(function (a, b) { return String(b.createdAt) < String(a.createdAt) ? -1 : 1; });
    return out.slice(0, 300);
  }
  /* the PDF engine is loaded on demand: make sure it is there before building the report PDF that email / Slack send */
  function pdfUrlFor(invoiceId) {
    return Promise.resolve(App.ensureJsPDF ? App.ensureJsPDF() : true).then(function () { return getReportPdfUrl(invoiceId, true); });
  }
  function keyOfUrl(u) { var m = /\/r\/([A-Za-z0-9_-]+)/.exec(String(u || '')); return m ? m[1] : ''; }
  function slackNames(invoiceId) {
    var n = []; joinedRows('ready').filter(function (r) { return r.invoice.id === invoiceId; }).forEach(function (r) { var t = testName(r); if (t && n.indexOf(t) < 0) n.push(t); });
    return n.join(', ');
  }
  /* one place that emails a finished report and writes it to the Email log (used by the report window, the Email page and auto-send) */
  function mailLog(e) {
    try {
      DB.insert('email_log', { invoiceId: e.invoiceId || null, to: e.to || '', toName: e.toName || '', toRole: e.toRole === 'doctor' ? 'doctor' : 'patient', kind: 'report',
        status: e.status === 'sent' ? 'sent' : 'failed', error: String(e.error || '').slice(0, 200), auto: !!e.auto, ts: new Date().toISOString() });
    } catch (x) {}
  }
  function mailSend(invoiceId, role, to, auto) {
    var inv = invOf(invoiceId); if (!inv) return Promise.reject(new Error('Invoice not found'));
    var pat = patOf(inv.patientId) || {}, doc = (role === 'doctor' && inv.doctorId) ? DB.get('doctors', inv.doctorId) : null, who = role === 'doctor' ? ((doc && doc.name) || 'Doctor') : (pat.name || 'Patient');
    return pdfUrlFor(invoiceId).then(function (url) {
      var key = keyOfUrl(url); if (!key) throw new Error('Could not prepare the report PDF');
      return DB.share('POST', 'email', { key: key, to: to, kind: role, name: who, invoiceNo: inv.no || inv.id });
    }).then(function () {
      mailLog({ invoiceId: invoiceId, to: to, toName: who, toRole: role, status: 'sent', auto: auto });
      var u = {}; u[role === 'doctor' ? 'emailedDocAt' : 'emailedAt'] = new Date().toISOString(); try { DB.update('invoices', invoiceId, u); } catch (x) {}
      return true;
    }, function (e) { mailLog({ invoiceId: invoiceId, to: to, toName: who, toRole: role, status: 'failed', error: (e && e.message) || 'error', auto: auto }); throw e; });
  }
  /* auto-email the finished report (Settings -> Email & Slack, or the tick boxes in the report window): once per invoice,
     only when the patient / doctor has an email address, and (like WhatsApp) not while a balance is unpaid unless the lab chose "send anyway" */
  function emailAutoReady(ids) {
    if (!shareOn()) return;
    var cfgS = {}; try { cfgS = DB.get('settings', 'main') || {}; } catch (e) {}
    if (!cfgS.emailAuto && !cfgS.emailAutoDoctor) return;
    var dueRule = cfgS.emailDueRule === 'send' ? 'send' : 'hold';
    shareStatus().then(function (st) {
      if (!st.email) return;
      ids.forEach(function (id) {
        try {
          var inv = invOf(id); if (!inv || !waAllReady(id)) return;
          if ((+inv.due || 0) > 0.009 && dueRule !== 'send') return; /* goes out once the balance is paid (App.waOnPaid) */
          var pat = patOf(inv.patientId) || {}, doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null, EM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
          var jobs = [];
          if (cfgS.emailAuto && !inv.emailedAt && EM.test(String(pat.email || '').trim())) jobs.push({ flag: 'emailedAt', to: pat.email.trim(), kind: 'patient', name: pat.name });
          if (cfgS.emailAutoDoctor && !inv.emailedDocAt && doc && EM.test(String(doc.email || '').trim())) jobs.push({ flag: 'emailedDocAt', to: doc.email.trim(), kind: 'doctor', name: doc.name });
          if (!jobs.length) return;
          var stamp = {}; jobs.forEach(function (j) { stamp[j.flag] = new Date().toISOString(); });
          DB.update('invoices', id, stamp);
          jobs.forEach(function (j) {
            mailSend(id, j.kind, j.to, true)
              .then(function () { App.toast('Report emailed to ' + (j.kind === 'doctor' ? 'Dr. ' : '') + (j.name || j.to)); })
              .catch(function (e) { var u = {}; u[j.flag] = null; try { DB.update('invoices', id, u); } catch (x) {} App.toast('Auto email to ' + (j.name || j.to) + ' failed: ' + ((e && e.message) || 'error'), 'err'); });
          });
        } catch (e) {}
      });
    });
  }
  /* auto-post to Slack the moment every test of an invoice is ready (once per invoice) */
  function slackAutoReady(ids) {
    if (!shareOn()) return;
    shareStatus().then(function (st) {
      if (!st.slackAuto) return;
      ids.forEach(function (id) {
        try {
          var inv = invOf(id); if (!inv || inv.slackNotifiedAt || !waAllReady(id)) return;
          DB.update('invoices', id, { slackNotifiedAt: new Date().toISOString() });
          pdfUrlFor(id).then(function (url) {
            var key = keyOfUrl(url); if (!key) return;
            DB.share('POST', 'slack', { key: key, event: 'ready', name: (patOf(inv.patientId) || {}).name, invoiceNo: inv.no || inv.id, tests: slackNames(id) }).catch(function () {});
          });
        } catch (e) {}
      });
    });
  }
  function slackSend(invoiceId) {
    var inv = invOf(invoiceId); if (!inv) return;
    App.toast('Sending to Slack…', 'info');
    pdfUrlFor(invoiceId).then(function (url) {
      var key = keyOfUrl(url); if (!key) { App.toast('Could not prepare the report PDF', 'err'); return; }
      return DB.share('POST', 'slack', { key: key, event: 'manual', name: (patOf(inv.patientId) || {}).name, invoiceNo: inv.no || inv.id, tests: slackNames(invoiceId) })
        .then(function () { App.toast('Report posted to Slack'); });
    }).catch(function (e) { App.toast((e && e.message) || 'Slack failed', 'err'); });
  }
  function emailReport(invoiceId, role) {
    var inv = invOf(invoiceId); if (!inv) { App.toast('Invoice not found', 'err'); return; }
    var pat = patOf(inv.patientId) || {}, doc = (role === 'doctor' && inv.doctorId) ? DB.get('doctors', inv.doctorId) : null;
    if (role === 'doctor' && !doc) { App.toast('No referring doctor on this invoice', 'err'); return; }
    var target = role === 'doctor' ? doc : pat, who = target.name || (role === 'doctor' ? 'doctor' : 'patient'), cur = String(target.email || '').trim();
    App.modal('Email report to ' + App.esc(who),
      '<p class="muted" style="margin:0 0 12px">The report PDF is attached to the email, with a link to open it on a phone.</p>' +
      '<label class="label" for="emTo">Email address</label><input class="input" id="emTo" type="email" maxlength="120" placeholder="name@example.com" value="' + App.esc(cur) + '">' +
      '<label class="check" style="margin-top:10px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="emSave"' + (cur ? '' : ' checked') + '> Save this address on the ' + (role === 'doctor' ? 'doctor' : 'patient') + '\'s record</label>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="emCancel">Cancel</button><button class="btn btn-primary" id="emSend">Send email</button></div>',
      { onOpen: function (ov, close) {
          var to = ov.querySelector('#emTo'); setTimeout(function () { to.focus(); to.select(); }, 50);
          ov.querySelector('#emCancel').addEventListener('click', close);
          function go() {
            var addr = to.value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) { App.toast('Enter a valid email address', 'err'); return; }
            var save = ov.querySelector('#emSave').checked && addr !== cur;
            close(); App.toast('Sending email to ' + who + '…', 'info');
            mailSend(invoiceId, role, addr, false).then(function () {
              App.toast('Report emailed to ' + addr);
              if (save) { try { DB.update(role === 'doctor' ? 'doctors' : 'patients', target.id, { email: addr }); } catch (e) {} }
            }).catch(function (e) { App.toast((e && e.message) || 'Email failed', 'err'); });
          }
          ov.querySelector('#emSend').addEventListener('click', go);
          to.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        } });
  }

  /* the patient / doctor portal shows a report only once its PDF exists: build it the moment a report is finished, and again when it is edited */
  function portalAutoPrepare(ids) {
    try {
      var st = DB.get('settings', 'main') || {}; if (!st.portalOn || !shareOn()) return;
      var chain = Promise.resolve();
      ids.forEach(function (id) { chain = chain.then(function () { var inv = invOf(id); if (inv && waAllReady(id)) return pdfUrlFor(id).catch(function () {}); }); });
    } catch (e) {}
  }
  App.preparePortalReports = function (onProgress) {
    if (!shareOn()) return Promise.reject(new Error('Open this lab in the browser (cloud) to prepare reports'));
    var todo = joinedRowsReadyInvoices().filter(function (i) { return !i.reportPdfKey; }), done = 0, n = 0;
    return todo.reduce(function (p, inv) {
      return p.then(function () { return pdfUrlFor(inv.id).then(function (u) { if (u) n++; }, function () {}).then(function () { done++; if (onProgress) onProgress(done, todo.length); }); });
    }, Promise.resolve()).then(function () { return n; });
  };
  function waAutoSendReady(invoiceIds) {
    try {
      var _ids = (invoiceIds || []).filter(function (id, i, a) { return id && a.indexOf(id) === i; });
      portalAutoPrepare(_ids); slackAutoReady(_ids); emailAutoReady(_ids);
    } catch (e) {}
    try {
      var ids = [];
      (invoiceIds || []).forEach(function (id) { if (id && ids.indexOf(id) < 0) ids.push(id); });
      if (!ids.length) return;
      var cfg = waCfg();
      var autoPat = cfg.autoPatient !== false;  /* default ON */
      var autoDoc = cfg.autoDoctor === true;    /* default OFF */
      if (!autoPat && !autoDoc) return;
      if (!waReady(cfg)) { App.toast('WhatsApp API not configured — auto-send skipped', 'err'); return; }
      ids.forEach(function (invoiceId) {
        try { waTryAutoSendOne(invoiceId, cfg, autoPat, autoDoc); } catch (e) {}
      });
    } catch (e) {}
  }

  /* shareReportWhatsApp: superseded by waManualSend() (strict API send with
     wa_log recording). Kept as a thin alias for any external callers. */
  function shareReportWhatsApp(invoiceId) { waManualSend(invoiceId, 'patient'); }
  function deleteResult(resId) {
    var r = DB.get('results', resId);
    if (!r) return;
    App.confirm('Delete this report permanently? This cannot be undone.').then(function (ok) {
      if (!ok) return;
      DB.remove('results', resId);
      App.toast('Report deleted');
      render();
    });
  }

  // Join results with invoices/items. Returns array of:
  // {res, invoice, patient, item, test}  (res may be null = not yet created)
  function joinedRows(status) {
    var out = [];
    var seen = {};
    var results = DB.all('results');
    /* one result per invoice + test: a "ready" one beats a "pending" one, and among equals the newest wins.
       (Duplicates used to pile up when a saved test still showed as pending and was entered again.) */
    function stamp(r) { return String(r.reportedAt || '') + '|' + String(r._u || r._c || ''); }
    function better(a, b) {
      if ((a.status === 'ready') !== (b.status === 'ready')) return a.status === 'ready';
      return stamp(a) > stamp(b);
    }
    var best = {};
    results.forEach(function (r) {
      var inv = invOf(r.invoiceId);
      if (!inv || !Array.isArray(inv.items)) return;
      var item = inv.items.filter(function (it) { return it.testId === r.testId; })[0];
      if (!item) return; // orphan result, skip
      var key = r.invoiceId + '|' + r.testId;
      seen[key] = true;   /* any result (pending or ready) means this test is no longer a "new" pending item */
      if (!best[key] || better(r, best[key].res)) best[key] = { res: r, inv: inv, item: item };
    });
    Object.keys(best).forEach(function (key) {
      var b = best[key];
      if (b.res.status !== status) return;
      out.push({ res: b.res, invoice: b.inv, patient: patOf(b.inv.patientId), item: b.item, test: DB.get('tests', b.res.testId) });
    });
    // Synthesize pending rows for invoice items that have no result row at all yet
    if (status === 'pending') {
      DB.all('invoices').forEach(function (inv) {
        if (!Array.isArray(inv.items)) return;
        inv.items.forEach(function (item) {
          var key = inv.id + '|' + item.testId;
          if (!seen[key]) {
            out.push({ res: null, invoice: inv, patient: patOf(inv.patientId), item: item, test: DB.get('tests', item.testId) });
          }
        });
      });
    }
    return out;
  }

  function groupByInvoice(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) {
      var id = r.invoice.id;
      if (!map[id]) { map[id] = { invoice: r.invoice, patient: r.patient, rows: [] }; order.push(id); }
      map[id].rows.push(r);
    });
    // newest invoices first
    order.sort(function (a, b) {
      var da = map[a].invoice.createdAt || '', db = map[b].invoice.createdAt || '';
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    return order.map(function (id) { return map[id]; });
  }

  function groupByPatient(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) {
      var pid = (r.patient && r.patient.id) || r.invoice.patientId || 'unknown';
      if (!map[pid]) { map[pid] = { patient: r.patient, rows: [] }; order.push(pid); }
      map[pid].rows.push(r);
    });
    // most recent activity first
    order.sort(function (a, b) {
      var da = '', db = '';
      map[a].rows.forEach(function (r) { if (r.invoice.createdAt > da) da = r.invoice.createdAt; });
      map[b].rows.forEach(function (r) { if (r.invoice.createdAt > db) db = r.invoice.createdAt; });
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    return order.map(function (pid) { return map[pid]; });
  }

  function testName(row) {
    return row.item.name || (row.test && row.test.name) || 'Test';
  }
  function testCode(row) {
    return row.item.code || (row.test && row.test.code) || '';
  }

  /* ---------- entry modal ---------- */

  /* Bulk entry: all pending tests for a patient in one form, then print */
  function openBulkEntry(patient, rows) {
    if (!rows.length) return;
    /* Settings -> "Require sample to be collected before result entry": leave out tests whose sample is not collected */
    if (window.Samples && Samples.requireCollected()) {
      var _smpAll = Samples.all();
      var _okRows = rows.filter(function (r) { return !Samples.blockedReason(r.invoice.id, r.res ? r.res.testId : r.item.testId, _smpAll); });
      if (!_okRows.length) {
        App.toast(Samples.blockedReason(rows[0].invoice.id, rows[0].res ? rows[0].res.testId : rows[0].item.testId, _smpAll) || 'Collect the sample first', 'err');
        return;
      }
      if (_okRows.length < rows.length) App.toast((rows.length - _okRows.length) + ' test(s) skipped: sample not collected yet', 'info');
      rows = _okRows;
    }
    var invNos = {};
    rows.forEach(function (r) { invNos[r.invoice.no || r.invoice.id] = true; });
    var invList = Object.keys(invNos).join(', ');

    var sectionsHtml = rows.map(function (row, ti) {
      var test = row.test;
      var params = (test && Array.isArray(test.params)) ? test.params : [];
      var existing = (row.res && row.res.values) || {};
      var tTitle = App.esc(testName(row)) + (testCode(row) ? ' <span class="muted">(' + App.esc(testCode(row)) + ')</span>' : '');
      var fieldsHtml;
      if (params.length) {
        var prowHtml = params.map(function (p, pi) {
          var v = existing[p.name] != null ? String(existing[p.name]) : '';
          var isNum = p.type === 'number';
          return '<tr>' +
            '<td><strong>' + App.esc(p.name) + '</strong></td>' +
            '<td>' + resultField(p, v, 'data-bt="' + ti + '" data-bpi="' + pi + '"') + '</td>' +
            '<td class="muted">' + App.esc(p.unit || '') + '</td>' +
            '<td class="muted">' + App.esc(refFor(p, patient)) + '</td></tr>';
        }).join('');
        fieldsHtml =
          '<table class="table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead>' +
          '<tbody>' + prowHtml + '</tbody></table>' +
          '<div style="margin-top:10px"><label class="label">Remarks (optional)</label>' +
          '<input class="input" data-brem="' + ti + '" value="' + App.esc(existing['Remarks'] || '') + '" placeholder="e.g. Sample hemolyzed, repeat advised"></div>';
      } else {
        var ft = existing['Result'] != null ? String(existing['Result']) : '';
        fieldsHtml =
          '<div><label class="label">Result</label>' +
          '<input class="input" data-bfree="' + ti + '" placeholder="Type the result value..." value="' + App.esc(ft) + '"></div>';
      }
      return '<div class="card" style="margin-bottom:14px"><div class="card-h"><div><strong>' + tTitle + '</strong></div>' +
        '<span class="muted">' + App.esc(row.invoice.no || row.invoice.id) + '</span></div>' +
        '<div class="card-b">' + fieldsHtml + '</div></div>';
    }).join('');

    var sub = App.esc(patient.name || '—') +
      (patient.age ? ' <span class="muted">(' + App.esc(String(patient.age)) + (patient.gender ? '/' + App.esc(patient.gender) : '') + ')</span>' : '') +
      ' <span class="muted">• ' + App.esc(invList) + ' • ' + rows.length + ' test(s)</span>';

    // payment section: if any invoice has a due, offer to collect it now
    var _invSeen = {}, _totalDue = 0;
    rows.forEach(function (r) {
      var iid = r.invoice.id;
      if (!_invSeen[iid]) { _invSeen[iid] = true; _totalDue += (+r.invoice.due || 0); }
    });
    var payHtml = '';
    if (_totalDue > 0) {
      payHtml = '<div class="card" style="margin-bottom:14px;border:1.5px solid var(--amber)">' +
        '<div class="card-b"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><strong style="font-size:15px">Payment Due: ' + App.money(_totalDue) + '</strong>' +
        '<div class="muted" style="font-size:12px">Mark as paid now to activate the QR code on the report. Otherwise it stays in Dues.</div></div>' +
        '<label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer;font-size:14px">' +
        '<input type="checkbox" id="bresPaid" style="width:20px;height:20px;accent-color:var(--green)"> Mark as Paid</label>' +
        '</div></div></div>';
    }

    App.modal('Enter Results — ' + App.esc(patient.name || 'Patient'),
      '<p class="muted" style="margin-bottom:14px">' + sub + '</p>' + sectionsHtml + payHtml +
      '<div class="actions" style="margin-top:16px;position:sticky;bottom:0;background:#fff;padding-top:12px;border-top:1px solid var(--line)">' +
      '<button class="btn btn-ghost" id="bresCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="bresSave">Save All Results</button></div>',
      { wide: true, onOpen: function (ov, close) {
          document.getElementById('bresCancel').addEventListener('click', close);
          document.getElementById('bresSave').addEventListener('click', function () {
            var saved = 0, skipped = 0, _waIds = [], _crit = [];
            rows.forEach(function (row, ti) {
              var test = row.test;
              var params = (test && Array.isArray(test.params)) ? test.params : [];
              var vals = {};
              var anyVal = false;
              if (params.length) {
                for (var pi = 0; pi < params.length; pi++) {
                  var inp = ov.querySelector('[data-bt="' + ti + '"][data-bpi="' + pi + '"]');
                  var v = inp ? inp.value.trim() : '';
                  vals[params[pi].name] = v;
                  if (v) anyVal = true;
                }
                var rem = ov.querySelector('[data-brem="' + ti + '"]');
                if (rem && rem.value.trim()) vals['Remarks'] = rem.value.trim();
              } else {
                var ta = ov.querySelector('[data-bfree="' + ti + '"]');
                var t = ta ? ta.value.trim() : '';
                if (t) { vals = { Result: t }; anyVal = true; }
              }
              if (!anyVal) { skipped++; return; }
              var patch = {
                values: vals,
                status: 'ready',
                reportedAt: new Date().toISOString(),
                reportedBy: sessionUser()
              };
              var bcrit = criticalOf(row, vals);
              patch.critical = bcrit.length ? bcrit : null;
              if (bcrit.length) { patch.criticalAck = null; _crit.push({ row: row, crits: bcrit }); }
              try { if (App.stockConsume) App.stockConsume(row.invoice.id, row.res ? row.res.testId : row.item.testId); } catch (e) {}
              if (row.res) DB.update('results', row.res.id, patch);
              else DB.insert('results', { invoiceId: row.invoice.id, testId: row.item.testId, values: vals, status: 'ready', reportedAt: patch.reportedAt, reportedBy: patch.reportedBy, critical: patch.critical, criticalAck: patch.criticalAck || null });
              saved++;
              if (_waIds.indexOf(row.invoice.id) < 0) _waIds.push(row.invoice.id);
            });
            // payment: if "Mark as Paid" checked, collect full due on each invoice
            var payBox = ov.querySelector('#bresPaid');
            var paidMsg = '';
            if (payBox && payBox.checked) {
              var pSeen = {}, pTotal = 0;
              rows.forEach(function (r) {
                var iid = r.invoice.id;
                if (pSeen[iid]) return;
                pSeen[iid] = true;
                var inv = null;
                try { inv = DB.get('invoices', iid); } catch (e) {}
                if (!inv) return;
                var due = Math.round((+inv.due || 0) * 100) / 100;
                if (due > 0) {
                  try {
                    DB.insert('payments', {
                      invoiceId: iid, amount: due, method: 'Cash',
                      date: new Date().toISOString(),
                      note: 'Collected at result entry', createdBy: sessionUser()
                    });
                  } catch (e) {}
                  var newPaid = Math.round(((+inv.paid || 0) + due) * 100) / 100;
                  try { DB.update('invoices', iid, { paid: newPaid, due: 0, status: 'paid' }); } catch (e) {}
                  pTotal += due;
                }
              });
              if (pTotal > 0) paidMsg = ' • ' + App.money(pTotal) + ' collected — QR code activated';
            }
            try { if (window.Samples && saved) Samples.onResultsSaved(_waIds); } catch (e) {}
            close();
            if (!saved) { App.toast('Enter at least one result value', 'err'); return; }
            App.toast(saved + ' result(s) saved — marked ready' + (skipped ? ' (' + skipped + ' skipped — empty)' : '') + paidMsg);
            render();
            // offer print: open the Ready Reports page so the user can print
            App.nav('#/results/ready');
            // auto-send reports that just became fully ready
            if (_crit.length) criticalNotify(_crit);
            waAutoSendReady(_waIds);
          });
        }
      });
  }

  function openEntry(row, onSaved) {
    if (window.Samples && Samples.requireCollected()) {
      var _why = Samples.blockedReason(row.invoice.id, row.res ? row.res.testId : row.item.testId);
      if (_why) { App.toast(_why, 'err'); return; }
    }
    var test = row.test;
    var inv = row.invoice;
    var pat = row.patient;
    var params = (test && Array.isArray(test.params)) ? test.params : [];
    var existing = (row.res && row.res.values) || {};
    var resId = row.res ? row.res.id : null;

    // Trend-graph support (assets/js/graph-config.js, loaded in parallel by Worker 1).
    // Guarded so the modal works exactly as before when that file is absent.
    var graphCfg = null;
    if (window.App && App.graphFor && App.renderGraphSvg) {
      try { graphCfg = App.graphFor(test) || null; } catch (gerr) { graphCfg = null; }
    }

    var body;
    if (params.length) {
      var rowsHtml = params.map(function (p, i) {
        var v = existing[p.name] != null ? String(existing[p.name]) : '';
        var isNum = p.type === 'number';
        return '<tr>' +
          '<td><strong>' + App.esc(p.name) + '</strong></td>' +
          '<td><div style="display:flex;align-items:center;gap:6px">' +
            resultField(p, v, 'data-pi="' + i + '"') +
            '<span class="res-abn-badge" data-pi="' + i + '" style="font-size:18px;font-weight:900;min-width:18px;line-height:1"></span>' +
          '</div></td>' +
          '<td class="muted">' + App.esc(p.unit || '') + '</td>' +
          '<td class="muted">' + App.esc(refFor(p, pat)) + '</td></tr>';
      }).join('');
      body =
        '<table class="table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table>' +
        (graphCfg ? '<div id="resGraphWrap" style="margin-top:14px"><div class="label" style="font-weight:700;margin-bottom:6px">Trend Graph</div><div id="resGraph"></div></div>' : '') +
        '<div class="form-grid" style="margin-top:12px"><div>' +
        '<label class="label">Remarks (optional)</label>' +
        '<input class="input" id="resRemarks" value="' + App.esc(existing['Remarks'] || '') + '" placeholder="e.g. Sample hemolyzed, repeat advised">' +
        '</div></div>';
    } else {
      var ft = existing['Result'] != null ? String(existing['Result']) : '';
      body =
        '<div class="form-grid"><div>' +
        '<label class="label">Result</label>' +
        '<input class="input" id="resFree" placeholder="Type the result value..." value="' + App.esc(ft) + '">' +
        '</div></div>';
    }

    var sub = pat.name ? (App.esc(pat.name) + ' • ' + App.esc(inv.no)) : App.esc(inv.no);
    var close = App.modal('Enter Result — ' + App.esc(testName(row)) + (testCode(row) ? ' (' + App.esc(testCode(row)) + ')' : ''),
      '<p class="muted" style="margin-bottom:14px">' + sub + '</p>' + body +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="resCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="resSave">Save Result</button></div>',
      { onOpen: function (ov, close) {
          document.getElementById('resCancel').addEventListener('click', close);
          document.getElementById('resSave').addEventListener('click', function () {
            saveResult(row, params, close, onSaved);
          });
          // Live abnormal high (red up arrow) & low (blue down arrow) indicators
          function updateAbnormalFields() {
            var inputs = ov.querySelectorAll('[data-pi]');
            inputs.forEach(function (inp) {
              if (inp.classList.contains('res-abn-badge')) return;
              var pi = parseInt(inp.getAttribute('data-pi'), 10);
              if (isNaN(pi) || !params[pi]) return;
              var p = params[pi];
              var pref = refFor(p, pat);
              var val = inp.value;
              var sev = abnormalSeverity(val, pref);
              var badge = ov.querySelector('.res-abn-badge[data-pi="' + pi + '"]');
              if (sev && sev.dir === 'high') {
                inp.style.borderColor = '#dc2626';
                inp.style.color = '#dc2626';
                inp.style.fontWeight = '700';
                inp.style.backgroundColor = '#fef2f2';
                if (badge) badge.innerHTML = '<span style="color:#dc2626" title="High (Above Normal Range)">↑</span>';
              } else if (sev && sev.dir === 'low') {
                inp.style.borderColor = '#2563eb';
                inp.style.color = '#2563eb';
                inp.style.fontWeight = '700';
                inp.style.backgroundColor = '#eff6ff';
                if (badge) badge.innerHTML = '<span style="color:#2563eb" title="Low (Below Normal Range)">↓</span>';
              } else {
                inp.style.borderColor = '';
                inp.style.color = '';
                inp.style.fontWeight = '';
                inp.style.backgroundColor = '';
                if (badge) badge.innerHTML = '';
              }
            });
          }
          ov.addEventListener('input', updateAbnormalFields);
          ov.addEventListener('change', updateAbnormalFields);
          updateAbnormalFields();

          // Live trend graph: re-render on every param input, scoped to this modal's overlay.
          function renderGraph() {
            if (!graphCfg) return;
            var wrap = document.getElementById('resGraphWrap');
            var holder = document.getElementById('resGraph');
            if (!wrap || !holder) return;
            var valsByName = {};
            var inputs = ov.querySelectorAll('input[data-pi]');
            for (var i = 0; i < inputs.length; i++) {
              var pi = parseInt(inputs[i].getAttribute('data-pi'), 10);
              if (!isNaN(pi) && params[pi]) valsByName[params[pi].name] = inputs[i].value;
            }
            var svg = '';
            try { svg = App.renderGraphSvg(graphCfg, valsByName); } catch (gerr2) { svg = ''; }
            holder.innerHTML = svg;
            wrap.style.display = svg ? '' : 'none';
          }
          if (graphCfg) {
            var gInputs = ov.querySelectorAll('input[data-pi]');
            for (var gi = 0; gi < gInputs.length; gi++) {
              gInputs[gi].addEventListener('input', renderGraph);
            }
            renderGraph();
          }
        }
      });
  }

  function saveResult(row, params, close, onSaved) {
    var vals = {};
    if (params.length) {
      var anyVal = false;
      for (var i = 0; i < params.length; i++) {
        var inp = document.querySelector('[data-pi="' + i + '"]');
        var v = inp ? inp.value.trim() : '';
        vals[params[i].name] = v;
        if (v) anyVal = true;
      }
      var rem = document.getElementById('resRemarks');
      if (rem && rem.value.trim()) vals['Remarks'] = rem.value.trim();
      if (!anyVal) { App.toast('Enter at least one result value', 'err'); return; }
    } else {
      var ta = document.getElementById('resFree');
      var t = ta ? ta.value.trim() : '';
      if (!t) { App.toast('Enter the result', 'err'); return; }
      vals = { Result: t };
    }
    var patch = {
      values: vals,
      status: 'ready',
      reportedAt: new Date().toISOString(),
      reportedBy: sessionUser()
    };
    var crit = criticalOf(row, vals);
    patch.critical = crit.length ? crit : null;
    if (crit.length) patch.criticalAck = null;
    try { if (App.stockConsume) App.stockConsume(row.invoice.id, row.res ? row.res.testId : row.item.testId); } catch (e) {}
    if (row.res) DB.update('results', row.res.id, patch);
    else DB.insert('results', { invoiceId: row.invoice.id, testId: row.item.testId, values: vals, status: 'ready', reportedAt: patch.reportedAt, reportedBy: patch.reportedBy, critical: patch.critical, criticalAck: patch.criticalAck || null });
    try { if (window.Samples) Samples.onResultsSaved([row.invoice.id]); } catch (e) {}
    close();
    App.toast('Result saved — marked ready');
    if (crit.length) criticalNotify([{ row: row, crits: crit }]);
    // auto-send if this invoice's report just became fully ready
    waAutoSendReady([row.invoice.id]);
    if (typeof onSaved === 'function') onSaved();
    else render();
  }

  /* ---------- print report ---------- */

  // Shared structured report data (used by HTML print, preview modal, and PDF builder)
  /* ============================================================
     Lab report redesign (Chughtai-style) — integrated helpers
     Sources: ~/workspace/report-redesign/ workers 2,4,5,6,7,8,9,11,12.

     Font sizes below are written in em relative to the .rpt-page root.
     reportHtml() sets that root's px size from s.reportFontSize
     ('small' | 'medium' | 'large') via RPT.setScale(), so the whole
     report scales from one rule. Layout px (gaps, borders, images)
     deliberately does NOT scale.
     ============================================================ */

  /* ---------- worker 7/20: report style constants ---------- */
  var RPT = {

    /* COLORS — sampled from the reference */
    navy:      '#1b1b6e',  // lab name, tagline, logo ink (deep reference blue)
    ink:       '#111',     // primary body text / headings
    black:     '#000',     // patient grid labels+values, footer rule, barcode text
    grey:      '#777',     // secondary / muted text
    lightGrey: '#A9A9A9',  // hairline rules, dividers
    barGrey:   '#b5b5b5',  // TEST|NORMAL VALUE|UNIT header bar + RESULT box header
    line:      '#333',     // RESULT box border, thin dark rules
    tableLine: '#000',     // table header-bar outer border
    white:     '#ffffff',
    red:       '#c0392b',  // logo droplet accent
    powered:   '#999',     // "Powered by System Optix" footer line

    /* FONT SIZES — base scale (px at reportFontSize = 'medium') */
    base:  12,
    h1:    26,     // lab name in header
    h2:    15,     // test name heading (e.g. "Serum Electrolytes")
    h3:    13,
    small: 10.5,
    tiny:  9,

    fs: {
      /* header */
      labName:       26,
      labTagline:    14,
      labSlogan:      9,
      patientNoLbl:  12,
      patientNoVal:  12,
      logoSize:      54,

      /* patient info grid */
      patLabel:      12,
      patValue:      12,
      patLabelW:    230,

      /* sections */
      testName:      15,
      deptTitle:     14,
      subsection:    12.5,
      noteLbl:       11,
      noteBody:      11,

      /* test table */
      tableHead:     11,
      tableCell:     11.5,
      tableResult:   11.5,
      refRange:      10.5,
      resultBoxTtl:  11,
      resultBoxMeta:  9,

      /* footer */
      verNote:       12,
      sigName:       12,
      sigQual:       10,
      sigTitle:      10,
      addrLine:      12.5,
      poweredBy:     11
    },

    /* FONT FAMILIES — serif for the lab brand only; body inherits the
       lab's configured sans font (s.font) from the app / print shell. */
    serif: "Georgia,'Times New Roman',serif",
    sans:  "Arial,Helvetica,sans-serif",

    w: {
      normal: 400,
      bold:   700
    },

    sp: {
      headGap:        16,
      headPadBottom:  12,
      headMargin:     10,
      qrSize:        110,
      gridColGap:     40,
      gridRowPad:      2.5,
      gridMargin:      '2px 0 6px',
      gridRuleMargin:  '6px 0 4px',
      testNameMargin: '18px 0 6px',
      deptMargin:     '22px 0 10px',
      deptPad:        '7px 10px',
      subMargin:      '20px 0 8px',
      noteMargin:     '8px 0 2px',
      tableHeadPad:   '7px 10px',
      tableCellPad:   '6px 10px',
      verNoteMargin:  '22px 0 4px',
      footRuleMargin: '6px 0',
      sigMargin:      '10px 0 6px',
      sigGap:          8,
      addrMargin:     '10px 0 0',
      poweredMargin:  '14px 0 0'
    },

    bd: {
      hairline:  '1px solid #000',
      thin:      '1px solid #000',
      resultBox: '1.5px solid #333',
      rule:      '2.5px solid #000',
      sigLine:   '1px solid #000'
    },

    lh: {
      body:  1.5,
      table: 1.4,
      addr:  1.9
    },

    track: {
      caps:  '0.6px',
      wide:  '2px'
    },

    /* reportFontSize setting -> scale multiplier */
    fontScale: { small: 0.9, medium: 1, large: 1.12 },

    _scale: 1,

    /* select the active multiplier: RPT.setScale('large') */
    setScale: function (setting) {
      this._scale = this.fontScale[setting] || 1;
      return this._scale;
    },

    /* scale one px value: RPT.size(12) -> 13.4 at 'large' */
    size: function (n) {
      return Math.round(n * this._scale * 10) / 10;
    },

    /* scaled copy of the whole fs map for the given setting */
    sizes: function (setting) {
      var k = (setting && this.fontScale[setting]) ? setting : 'medium';
      var m = this.fontScale[k], out = {}, key;
      for (key in this.fs) {
        if (Object.prototype.hasOwnProperty.call(this.fs, key)) {
          out[key] = Math.round(this.fs[key] * m * 10) / 10;
        }
      }
      return out;
    },

    /* one-liner for inline styles: RPT.px('font-size', 12) -> "font-size:12px" */
    px: function (prop, n) {
      return prop + ':' + this.size(n) + 'px';
    }
  };

  /* ---------- worker 12/20: print stylesheet ----------
     reportHtml() injects this inside a <style> tag at the top of its
     output; rules are scoped to .rpt-page / @media print. */
  var RPT_PRINT_CSS = `
/* =====================================================================
   Optix Medical Sync — Lab Report Print Stylesheet  (Worker 12/20)
   ---------------------------------------------------------------------
   Target: Chughtai-style A4 lab report (see reference image).
   The integrator injects this into the print document opened by
   App.print(title, html, {noHeader:true}), wrapping the report HTML
   in <div class="rpt-page"> … </div>. Report body itself is inline-
   styled; these rules govern the page box, print-only behavior,
   page-break control, exact background printing, and font smoothing.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. PAGE BOX — A4 portrait, ~12mm margins
   --------------------------------------------------------------------- */
@page {
  size: A4 portrait;
  margin: 12mm;
}

/* ---------------------------------------------------------------------
   2. PRINT BASE
   --------------------------------------------------------------------- */
@media print {

  /* Hard reset of any screen padding the app's print template applies. */
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
  }

  /* Footer (doctors, address, NOTE, powered-by) sits at the very bottom of the page:
     the report fills one A4 sheet (297mm - 2x12mm page margin - 2x28px body padding) and the footer is pushed down. */
  .rpt-page { display: flex; flex-direction: column; min-height: 244mm; }
  .rpt-page .rpt-footer { margin-top: auto !important; }

  /* Never leak screen chrome into the printout. */
  .noprint,
  button, .btn,
  .actions, .toolbar {
    display: none !important;
  }

  /* Hide the browser's auto header/footer URL bar if the app sets
     @page margin boxes — kept zero-size defensively. */
  @page {
    margin: 12mm;
  }

  /* Keep everything monochrome-black like the reference report. */
  a {
    color: #000 !important;
    text-decoration: none !important;
  }

  /* Long values wrap instead of overflowing the page edge. */
  * {
    overflow-wrap: break-word;
  }
}

/* ---------------------------------------------------------------------
   3. REPORT CONTAINER
   --------------------------------------------------------------------- */
.rpt-page {
  /* 210mm A4 − 2×12mm page margin ≈ 186mm of printable width */
  max-width: 186mm;
  width: 100%;
  margin: 0 auto;
  color: #000;
  background: #fff;
  font-size: 12.5px;
  line-height: 1.55;
  /* Everything below inherits from here unless overridden. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  /* Keep shaded header bars when printing from Chrome/Edge. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* On screen preview (the "live print preview" panel) keep the page
   readable at any viewport width; print media ignores this. */
@media screen {
  .rpt-page {
    max-width: 800px;
  }
  /* The report is designed as an A4 sheet (210 x 297 mm, 12mm margin): shown that way in the viewer and print preview.
     Scoped so the Lab Profile sample preview (which draws its own sheet) is not double-framed. */
  .report-preview .rpt-page,
  body > .rpt-page {
    box-sizing: border-box;
    width: 210mm;
    max-width: none;
    min-height: 297mm;
    padding: 12mm;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 8px 30px rgba(0,0,0,.28);
    display: flex;
    flex-direction: column;
  }
  .report-preview .rpt-page .rpt-footer,
  body > .rpt-page .rpt-footer { margin-top: auto; }
  @media (max-width: 840px) {
    .report-preview .rpt-page { width: 100%; min-height: 0; padding: 14px; }
  }
}

/* ---------------------------------------------------------------------
   4. PAGE-BREAK CONTROL
   --------------------------------------------------------------------- */

/* Test sections: never split a section's table across a page boundary
   when it fits on one page; never leave a section heading orphaned
   at the bottom of a page. (The integrator wraps each h3+table pair
   in .rpt-section; these rules also cover the raw sibling markup.) */
.rpt-page .rpt-section,
.rpt-page table.table {
  break-inside: avoid;
  page-break-inside: avoid;
}
.rpt-page h3 {
  break-after: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  page-break-inside: avoid;
}
/* If a section's table is genuinely longer than a page, at least keep
   each data row intact. */
.rpt-page table tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
/* Keep the note attached to the row it belongs to. */
.rpt-page .rpt-note {
  break-before: avoid;
  page-break-before: avoid;
}

/* RESULT box (barcode + reported-at stamp): never break across pages,
   never dangle away from its section. */
.rpt-page .rpt-resultbox {
  break-inside: avoid;
  page-break-inside: avoid;
  break-before: avoid;
  page-break-before: avoid;
  float: right;
  margin: 0 0 6px 12px;
}

/* Patient info grid and report header: keep together. */
.rpt-page .rpt-head,
.rpt-page .rpt-patient {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Footer: keep the verification note, signatory row and address block
   together on the same page; never orphan the footer from the body —
   force it onto the next page if it cannot fit with its lead content. */
.rpt-page .rpt-footer {
  break-inside: avoid;
  page-break-inside: avoid;
  break-before: auto;
}
.rpt-page .rpt-footnote {
  orphans: 3;
  widows: 3;
}
/* Signatory row: one block, never split between columns or pages. */
.rpt-page .rpt-sigs {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* "Powered by System Optix" line always sits with the address block. */
.rpt-page .rpt-powered {
  break-before: avoid;
  page-break-before: avoid;
}

/* ---------------------------------------------------------------------
   5. BACKGROUNDS MUST PRINT (exact color reproduction)
   --------------------------------------------------------------------- */

/* Grey header bars on TEST | NORMAL VALUE | UNIT | RESULT tables. */
.rpt-page,
.rpt-page thead th,
.rpt-page .rpt-greybar {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rpt-page thead th {
  background: #cfcfcf;
}
.rpt-page .rpt-greybar {
  background: #d9d9d9;
}

/* ---------------------------------------------------------------------
   6. TYPOGRAPHY FOR PRINT (matches the reference: plain black serif-less)
   --------------------------------------------------------------------- */
.rpt-page h1, .rpt-page h2, .rpt-page h3 {
  color: #000;
  font-weight: 700;
  line-height: 1.3;
}
.rpt-page .rpt-sec-title {
  font-size: 14.5px;
  font-weight: 700;
  margin: 16px 0 6px;
  color: #000;
}

/* Patient info: label bold, value regular — like the reference grid. */
.rpt-page .rpt-patient {
  font-size: 12.5px;
}
.rpt-page .rpt-patient .k {
  font-weight: 700;
}

/* Test tables: full width, thin dark rules, generous cell padding. */
.rpt-page table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 4px;
}
.rpt-page th,
.rpt-page td {
  border: 1px solid #000;
  padding: 6px 8px;
  font-size: 12px;
  text-align: left;
  vertical-align: top;
  color: #000;
}
/* The letterhead + patient block sit in a <thead>: when a report runs over several pages it is printed again at the top of each page. */
.rpt-page table.rpt-wrap { width: 100%; border-collapse: collapse; margin: 0; flex: none; }
.rpt-page table.rpt-wrap > thead > tr > td,
.rpt-page table.rpt-wrap > tbody > tr > td { border: 0; padding: 0; font-size: inherit; vertical-align: top; }
.rpt-page table.rpt-wrap > thead { display: table-header-group; }
.rpt-page table.rpt-wrap > tbody > tr { break-inside: auto; page-break-inside: auto; }
.rpt-page thead th {
  font-weight: 700;
  font-size: 11.5px;
  letter-spacing: 0.4px;
}
.rpt-page td strong,
.rpt-page .rpt-result {
  font-weight: 700;
}

/* "Note:" blocks under a test. */
.rpt-page .rpt-note {
  font-size: 11.5px;
  margin: 6px 0 10px;
}
.rpt-page .rpt-note b,
.rpt-page .rpt-note strong {
  font-size: 12px;
}

/* ---------------------------------------------------------------------
   7. HEADER — lab block left, Patient No / Case # / QR right
   --------------------------------------------------------------------- */
.rpt-page .rpt-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 10px;
  margin-bottom: 8px;
  border-bottom: 2px solid #000;
}
.rpt-page .rpt-brand {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}
.rpt-page .rpt-logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
  flex: none;
}
.rpt-page .rpt-labname {
  margin: 0;
  font-size: 21px;
  color: #000;
  letter-spacing: 0.3px;
}
.rpt-page .rpt-tagline,
.rpt-page .rpt-addr {
  font-size: 11px;
  color: #000;
}
.rpt-page .rpt-ids {
  text-align: right;
  flex: none;
}
.rpt-page .rpt-ids .k {
  font-size: 12px;
  font-weight: 700;
}
.rpt-page .rpt-ids .v {
  font-size: 12px;
  margin: 2px 0 6px;
  letter-spacing: 1px;
}
.rpt-page .rpt-qr {
  width: 104px;
  height: 104px;
}

/* ---------------------------------------------------------------------
   8. PATIENT INFO GRID
   --------------------------------------------------------------------- */
.rpt-page .rpt-patient {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 36px;
  margin: 6px 0 4px;
}
.rpt-page .rpt-prow {
  display: flex;
  gap: 10px;
  padding: 3px 0;
  font-size: 12.5px;
}
.rpt-page .rpt-prow .k {
  font-weight: 700;
  flex: none;
  min-width: 168px;
}
.rpt-page hr.rpt-rule {
  border: none;
  border-top: 1px solid #000;
  margin: 8px 0 4px;
}

/* ---------------------------------------------------------------------
   9. FOOTER — verification notes, signatories, address, powered-by
   --------------------------------------------------------------------- */
.rpt-page .rpt-footer {
  margin-top: 18px;
}
.rpt-page .rpt-ver {
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  line-height: 1.5;
  margin: 18px 0 4px;
}
.rpt-page hr.rpt-footrule {
  border: none;
  border-top: 2.5px solid #000;
  margin: 6px 0;
}
.rpt-page .rpt-sigs {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
}
.rpt-page .rpt-sig {
  flex: 1;
  text-align: center;
}
.rpt-page .rpt-sig .n {
  font-weight: 800;
  font-size: 12.5px;
}
.rpt-page .rpt-sig .q,
.rpt-page .rpt-sig .t {
  font-size: 10.5px;
  color: #000;
}
.rpt-page .rpt-addrblock {
  text-align: center;
  font-size: 12px;
  margin-top: 14px;
  line-height: 1.8;
}
.rpt-page .rpt-powered {
  color: #000;
  font-size: 11px;
  text-align: center;
  margin: 12px 0 0;
}

/* ---------------------------------------------------------------------
   10. PRINT FINISHING TOUCHES
   --------------------------------------------------------------------- */
@media print {
  /* Never start a new page for a lone heading: pull the first content
     block up with the section title when a break would orphan it. */
  .rpt-page h3:first-child {
    margin-top: 0;
  }
  /* Remove any drop shadows / rounded corners that survive from
     screen styles — flat print only. */
  .rpt-page * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
  /* QR and logo images: crisp edges. */
  .rpt-page img {
    image-rendering: auto;
  }
}

/* ---------------------------------------------------------------------
   11. TREND GRAPH (worker 3/3)
   Inline SVG rendered by App.renderGraphSvg (graph-config.js).
   --------------------------------------------------------------------- */
.rpt-page .rpt-graph {
  /* Keep the reference band / line colors in print. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  /* Never split the graph block across a page boundary. */
  break-inside: avoid;
  page-break-inside: avoid;
}
/* The SVG scales via its own viewBox; cap the rendered size instead of
   fixing pixel dimensions so it stays crisp on screen and in print. */
.rpt-page .rpt-graph svg {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
}
  `;

  /* ---------- worker 1/4: report header (Chughtai-style) ----------
     Decorative grey-to-blue top bar; circular logo; large serif lab name +
     tagline highlight box + address/Tel/Email (center); MR / Lab # and
     Case # with Code39 barcodes + 90px QR placeholder (right); thin black
     rule below. The custom s.headerHtml override is applied by
     reportHtml(), not here. */
  function reportHeaderHtml(d) {
    var inv = (d && d.inv) || {};
    var pat = (d && d.pat) || {};
    var s = (d && d.s) || {};

    var showTagline = s.showTagline !== false;   /* default true */
    var showQr = s.showQr !== false;             /* default true */
    var labName = s.labName || 'Optix Medical Sync';

    /* "INV-0042" -> "INV - 0042" spaced style like the reference */
    function spacedNo(v) {
      var t = String(v == null ? '' : v);
      if (!t) return '';
      return t.replace(/\s*-\s*/g, ' - ').replace(/\s*\/\s*/g, ' / ');
    }

    /* LEFT: logo + lab name side by side */
    var leftHtml =
      '<div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">' +
        (s.logo
          ? '<img src="' + (d && d._tpl ? '{{logo}}' : App.esc(s.logo)) + '" style="max-width:120px;max-height:72px;flex:none" alt="">'
          : '') +
        '<div style="min-width:0">' +
          '<div style="margin:0;color:' + (/^#[0-9a-fA-F]{6}$/.test(s.labNameColor || '') ? s.labNameColor : '#000') + ';font-family:' + RPT.serif +
            ';font-weight:700;font-size:1.7em;line-height:1.2">' +
            App.esc(labName) +
          '</div>' +
          ((showTagline && s.tagline)
            ? '<div style="margin:4px 0 0;color:#000;font-family:' + RPT.serif +
                ';font-style:italic;font-size:1.05em">' +
                App.esc(s.tagline) +
              '</div>'
            : '') +
        '</div>' +
      '</div>';

    /* RIGHT: QR on top, then Case # barcode + ID, then Patient ID barcode + ID */
    var _vn = App.visitNos(inv);                 /* LAB # (counts all reports) and CASE # (counts today's reports) with month / year */
    var _caseNo = _vn.labText, _caseCode = _vn.labCode;
    var _patId = _vn.caseText, _patCode = _vn.caseCode;
    var _tpl = !!(d && d._tpl);   /* template mode: per-report parts are written as {{tokens}} for the editable Custom Header box */
    var rightHtml =
      '<div style="flex:none;color:#000;font-size:0.95em;line-height:1.3;display:flex;align-items:flex-start;gap:12px">' +
        '<div style="text-align:left">' +
        '<div style="margin-top:2px">' + (_tpl ? '{{lab_barcode}}' : barcodeHtml(_caseCode, '100%', '15px').replace('margin:0 auto', 'margin:0')) +
          '<div style="font-weight:700;letter-spacing:1px;font-size:0.7em;margin-top:3px;line-height:1.2;white-space:nowrap">' + (_tpl ? '{{lab_no}}' : App.esc(_caseNo)) + '</div></div>' +
        '<div style="margin-top:7px">' + (_tpl ? '{{case_number_barcode}}' : barcodeHtml(_patCode, '100%', '15px').replace('margin:0 auto', 'margin:0')) +
          '<div style="font-weight:700;letter-spacing:1px;font-size:0.7em;margin-top:3px;line-height:1.2;white-space:nowrap">' + (_tpl ? '{{case_number}}' : App.esc(String(_patId || '').replace(/^P\s*#\s*/i, ''))) + '</div></div>' +
        '</div>' +
        (showQr
          ? (_tpl ? '<div>{{qr}}</div>' : '<div><img data-qr="1" style="width:70px;height:70px" alt="QR"></div>')
          : '') +
      '</div>';

    var _ht = (!_tpl && String(s.headerText || '').trim())
      ? '<div class="rpt-htext" style="text-align:center;color:#000;font-size:0.92em;line-height:1.45;margin-top:6px;white-space:pre-line">' + App.esc(String(s.headerText).trim()) + '</div>'
      : '';
    return (
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;background:#fff;color:#000;padding-top:2px">' +
        leftHtml +
        rightHtml +
      '</div>' + _ht
    );
  }

  /* ---------- worker 2/4: patient info grid ----------
     Reference layout: 2 columns; each row is "Label : value" with the
     colon separator; labels BOLD black (#000). Reg. Date comes from
     inv.createdAt (registration time), formatted "11-Jul-25 3:33:30 pm".
     Thin black rule below the grid. */
  /* the patient / registration block printed at the top of every report (HTML print + PDF use this one list):
     reference layout, all rows always present; empty father / address print ".", empty blood group prints "Unknown" */
  function reportHeaderRows(d) {
    var inv = d.inv || {}, pat = d.pat || {}, s = d.s || {};
    function t(v, fb) { var x = (v === undefined || v === null) ? '' : String(v).trim(); return x ? x : (fb || ''); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function dts(v) {
      if (!v) return ''; var dt = new Date(v); if (isNaN(dt.getTime())) return '';
      return pad(dt.getDate()) + '-' + pad(dt.getMonth() + 1) + '-' + dt.getFullYear() + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
    }
    var ageStr = t(pat.age), genderStr = t(pat.gender), ageSex = ageStr ? ageStr + ' Yr(s)' : '';
    if (genderStr) ageSex = ageSex ? ageSex + ' / ' + genderStr : genderStr;
    return {
      left: [
        ['Patient Name', t(pat.name)],
        ['Father / Husband Name', t(pat.father || pat.fatherName, '.')],
        ['Age / Sex', ageSex],
        ['Blood Group', t(pat.blood, 'Unknown')],
        ['Phone', t(pat.phone || pat.whatsapp)],
        ['Address', t(pat.address, '.')]
      ],
      right: [
        ['Registration Date', dts(inv.createdAt)],
        ['Reporting Date', dts(d.maxReported)],
        ['Registration Location', t(inv.regLocation, t(s.headOffice || s.address))],
        ['Destination Location', t(inv.destLocation, t(s.destinationLocation || s.mainLab || s.headOffice || s.address))],
        ['Reference', t(inv.reference, t(s.reference, 'Standard'))],
        ['Consultant', t((d.doc && d.doc.name), 'SELF')]
      ]
    };
  }
  function patientGridHtml(d) {
    var inv = d.inv || {};
    var pat = d.pat || {};
    var s = d.s || {};
    var em = '\u2014';

    function val(v) {
      if (v === undefined || v === null) return em;
      var str = String(v).trim();
      return str ? App.esc(str) : em;
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function validDate(t) {
      if (!t) return null;
      var dt = new Date(t);
      return isNaN(dt.getTime()) ? null : dt;
    }
    function fmtDate(t) {
      var dt = validDate(t);
      if (!dt) return null;
      return pad(dt.getDate()) + '-' + pad(dt.getMonth() + 1) + '-' + dt.getFullYear();
    }
    function fmtTime(t) {
      var dt = validDate(t);
      if (!dt) return null;
      return pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
    }
    function fmtDateTime(t) {
      var ds = fmtDate(t), ts = fmtTime(t);
      if (!ds || !ts) return em;
      return App.esc(ds + ' ' + ts);
    }
    function row(label, value) {
      return '<div style="display:flex;margin:1px 0;color:#000">' +
        '<span style="display:inline-block;min-width:140px;font-weight:bold;color:#000">' + label + '</span>' +
        '<span style="color:#000">:</span>' +
        '<span style="color:#000;margin-left:6px">' + value + '</span>' +
        '</div>';
    }

    var hr = reportHeaderRows(d), left = hr.left.map(function (r) { return [r[0], r[1] === '' ? em : App.esc(r[1])]; }), right = hr.right.map(function (r) { return [r[0], r[1] === '' ? em : App.esc(r[1])]; });
    /* every row is always printed (as in the reference); a missing value shows the reference's placeholder, or stays blank */
    left = left.map(function (r) { return [r[0], r[1] === em ? '&nbsp;' : r[1]]; });
    right = right.map(function (r) { return [r[0], r[1] === em ? '&nbsp;' : r[1]]; });

    var i, html = '<div style="display:flex;color:#000;font-size:12px">';
    html += '<div style="flex:1;padding-right:10px">';
    for (i = 0; i < left.length; i++) { html += row(left[i][0], left[i][1]); }
    html += '</div>';
    html += '<div style="flex:1;padding-left:10px">';
    for (i = 0; i < right.length; i++) { html += row(right[i][0], right[i][1]); }
    html += '</div>';
    html += '</div>';
    html += '<hr style="border:none;border-top:1px solid #000;margin:6px 0 4px">';
    return html;
  }

  /* ---------- worker 11/20: abnormal value highlighting ----------
     abnormalDir() parses the reference range ("135 - 150", "< 200",
     "> 10", "4,000 - 11,000") and returns 'high' | 'low' | null.
     Empty / non-numeric refs (e.g. test-template params with ref: '')
     are NEVER flagged. */
  function parseAbnNum(str) {
    if (str == null) return NaN;
    var clean = String(str).replace(/,/g, '').trim();   // "7,500" -> "7500"
    var m = clean.match(/^[+-]?(\d+(\.\d+)?|\.\d+)/);
    return m ? parseFloat(m[0]) : NaN;
  }

  /* Returns 'high' | 'low' | null — the direction tells which arrow to show. */
  function abnormalDir(valueStr, refStr) {
    var sev = abnormalSeverity(valueStr, refStr);
    return sev ? sev.dir : null;
  }

  /* returns { dir: 'high'|'low', severity: 'mild'|'moderate'|'critical' } or null */
  function abnormalSeverity(valueStr, refStr) {
    var v = parseAbnNum(valueStr);
    if (isNaN(v)) return null;
    if (refStr == null) return null;
    var ref = String(refStr).replace(/[–—]/g, '-').trim();
    if (!ref || /see\s*below/i.test(ref)) return null;
    ref = ref.replace(/,/g, '');

    var dir = null, lo = null, hi = null;
    var op = ref.match(/^\s*(<=|>=|<|>|≤|≥)\s*(.+)$/);
    if (op) {
      var bound = parseAbnNum(op[2]);
      if (isNaN(bound)) return null;
      switch (op[1]) {
        case '<':  if (v >= bound) { dir = 'high'; lo = bound * 0.9; hi = bound; } break;
        case '<=': case '≤': if (v > bound) { dir = 'high'; lo = bound * 0.9; hi = bound; } break;
        case '>':  if (v <= bound) { dir = 'low'; lo = bound; hi = bound * 1.1; } break;
        case '>=': case '≥': if (v < bound) { dir = 'low'; lo = bound; hi = bound * 1.1; } break;
      }
      if (!dir) return null;
    } else if (ref.indexOf('-') > -1) {
      /* plain "a-b" / "a - b" ranges (no spaces too: "13.5-17.5"), else fall back to signed numbers */
      var rm = ref.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
      var nums = rm ? [rm[1], rm[2]] : ref.match(/-?\d+(\.\d+)?/g);
      if (nums && nums.length >= 2) {
        lo = parseFloat(nums[0]); hi = parseFloat(nums[1]);
        if (lo > hi) { var t = lo; lo = hi; hi = t; }
        if (v < lo) dir = 'low';
        else if (v > hi) dir = 'high';
        else return null;
      } else return null;
    } else return null;

    /* calculate severity based on % outside range */
    var range = hi - lo;
    if (range <= 0) range = Math.abs(hi) || 1;
    var pct = dir === 'high' ? ((v - hi) / range) * 100 : ((lo - v) / range) * 100;
    var severity = pct <= 10 ? 'mild' : (pct <= 25 ? 'moderate' : 'critical');
    return { dir: dir, severity: severity };
  }

  function isAbnormal(valueStr, refStr) {
    return abnormalDir(valueStr, refStr) !== null;
  }

  /* Worker 11's resultCellHtml targets <table> markup; the redesigned
     report renders rows as a div grid, so rows use resultCellDiv() —
     same detection, same red-bold + ↑/↓ treatment. */
  function resultCellDiv(valueStr, refStr) {
    var disp = (valueStr == null) ? '' : String(valueStr);
    var dir = abnormalDir(valueStr, refStr);
    if (!dir) return '<div style="text-align:right">' + App.esc(disp) + '</div>';
    var isHigh = dir === 'high';
    var col = isHigh ? '#dc2626' : '#2563eb';
    var arrow = isHigh ? ' ↑' : ' ↓';
    return '<div style="text-align:right;color:' + col + ';font-weight:800">' +
      App.esc(disp) + arrow + '</div>';
  }

  /* table-markup variant (kept for parity with worker 11's spec) */
  function resultCellHtml(valueStr, refStr) {
    var disp = (valueStr == null) ? '' : String(valueStr);
    var dir = abnormalDir(valueStr, refStr);
    if (!dir) return '<td>' + App.esc(disp) + '</td>';
    var isHigh = dir === 'high';
    var col = isHigh ? '#dc2626' : '#2563eb';
    var arrow = isHigh ? ' ↑' : ' ↓';
    return '<td style="color:' + col + ';font-weight:800">' + App.esc(disp) + arrow + '</td>';
  }

  /* ---------- worker 9/20: Code39-style barcode (pure HTML/CSS) ----------
     barcodeHtml(text) renders a deterministic Code39-style barcode strip
     for the case # (~100px x 28px, black bars on white). No dependencies. */
  var CODE39 = {
    '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
    '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
    '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
    'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw',
    'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
    'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww',
    'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn',
    'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
    'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw',
    'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn',
    ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn', '$': 'nwnwnwnnn', '/': 'nwnwnnnwn',
    '+': 'nwnnnwnwn', '%': 'nnnwnwnwn'
  };

  function barcodeHtml(text, width, height) {
    var t = String(text == null ? '' : text).toUpperCase().replace(/\s+/g, '');
    // Encode with * start/stop; unsupported chars fall back to '-'
    var seq = '*' + t + '*';
    var bars = '';
    for (var i = 0; i < seq.length; i++) {
      var ch = seq.charAt(i);
      var pat = CODE39[ch] || CODE39['-'];
      for (var j = 0; j < 9; j++) {
        var isBar = (j % 2 === 0);
        var wide = pat.charAt(j) === 'w';
        // flex-grow proportional to module width: wide = 3x narrow
        bars += '<span style="display:block;flex:0 0 auto;width:0;flex-grow:' +
          (wide ? 3 : 1) + ';background:' + (isBar ? '#000' : '#fff') +
          ';height:100%;"></span>';
      }
      // narrow inter-character gap (white)
      if (i < seq.length - 1) {
        bars += '<span style="display:block;flex:0 0 auto;width:0;flex-grow:1;background:#fff;height:100%;"></span>';
      }
    }
    return '<div style="display:flex;align-items:stretch;width:' + (width || '64px') + ';height:' + (height || '14px') + ';' +
      'background:#fff;padding:0;margin:0 auto;line-height:0;overflow:hidden;" ' +
      'aria-hidden="true">' + bars + '</div>';
  }

  /* ---------- worker 4/20: one test section ----------
     Bold section title; medium-grey header bar (TEST | NORMAL VALUE | UNIT);
     bordered RESULT box on the right (grey "RESULT" strip, patient-no barcode,
     patient no. 'P # NN', visit date 'DD/MM'); borderless param rows with the result value right-aligned
     in its own 4th column; abnormal values render red-bold with ↑/↓.
     No-params tests get a single "Result" row; vals['Remarks'] renders
     below the rows.

     NOTE (integrator fix): the worker's draft used a 3-column grid for a
     4-cell row, which would wrap the result cell onto a second line. The
     grid below uses 4 columns (header bar carries an empty 4th cell) so
     the TEST | NORMAL VALUE | UNIT | result columns line up exactly.

     Relies on: testName(r), barcodeHtml(), resultCellDiv(), chughtaiTs(). */
  function chughtaiTs(v) {
    var t = v instanceof Date ? v : new Date(v);
    if (isNaN(t.getTime())) return '';
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getDate()) + '-' + M[t.getMonth()] + '-' + t.getFullYear() + ' ' +
           p(t.getHours()) + ':' + p(t.getMinutes());
  }

  /* ---------- worker 3/4: date helpers for integrated comparison columns ---------- */
  var CMP_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtD(iso) {   /* "11-Jul-25" (day-Mon-yy) */
    var t = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(t.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getDate()) + '-' + CMP_MON[t.getMonth()] + '-' + String(t.getFullYear()).slice(2);
  }
  function fmtDMY(iso) { /* "6:7:2025" (d:m:yyyy) */
    var t = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(t.getTime())) return '';
    return t.getDate() + ':' + (t.getMonth() + 1) + ':' + t.getFullYear();
  }
  function fmtDTm(iso) {  /* "11-Jul-25  15:33" */
    var t = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(t.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return fmtD(iso) + '  ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }

  /* ---------- worker 3/4: per-test table with INTEGRATED comparison columns ----------
     Target design (reference: Waheed Khanzada style):
     - Blue bold caps section title: "{Test Name} ({CODE}) REPORT" — test code
       from r.item.code (fallback r.test.code) shown with the test name.
     - Light-blue (#d9f2fb) header row (TEST | REFERENCE RANGE | UNIT, dark
       borders) plus one RESULT box per report: the current report first,
       then one per previous report of the same test for this patient
       (newest first, capped at 2). Each box shows:
         line 1: RESULT (bold), line 2: patient no. 'P # NN',
         line 3: full reported timestamp 'DD-Mon-YYYY HH:MM'
     - Body rows with dotted separators; param name regular weight.
     - Abnormal values (abnormalDir): red (#c00) bold with ↑ (high) or ↓
       (low) before the value — current and previous columns alike.
     - Tests with no params (free-text): single row labeled "Result" with
       the value spanning the result columns. */
  function testSectionHtml(r, d) {
    d = d || {};
    var test = r.test || {};
    var params = Array.isArray(test.params) ? test.params : [];
    var vals = (r.res && r.res.values) || {};
    var testId = (r.item && (r.item.testId || r.item.id)) || '';
    var prev = (d.prevByTest && testId && d.prevByTest[testId]) || [];
    var invNo = (d.inv && (d.inv.no || d.inv.id)) || '';
    var vn = null; try { vn = d.inv ? App.visitNos(d.inv) : null; } catch (e) { vn = null; }

    /* result columns: current report first, then previous (newest first) */
    var cols = [{ reportedAt: (r.res && r.res.reportedAt) || d.maxReported || '', values: vals, invoiceNo: invNo, caseText: (vn && vn.caseText) || '', caseCode: (vn && vn.caseCode) || '' }]
      .concat(prev.map(function (p) {
        return { reportedAt: p.reportedAt || '', values: p.values || {}, invoiceNo: p.invoiceNo || '', caseText: p.caseText || '', caseCode: p.caseCode || '' };
      }));
    var cmp = cols.length > 1; /* comparison print: previous results beside the new ones */
    if (cmp) d._cmpLegend = true;
    var nRes = cols.length;

    /* column grid: TEST 32% | NORMAL VALUE 24% | UNIT (rest) | RESULT fixed 120px */
    var gridCols = '32% 24% minmax(0,1fr)'; /* UNIT column absorbs the slack so the RESULT box sits at the right edge */
    for (var gi = 0; gi < nRes; gi++) gridCols += ' 120px';

    /* section title: "{Name} ({CODE})" — append REPORT unless already present */
    var tName = testName(r);
    var tCode = (r.item && r.item.code) || (test && test.code) || '';
    var title = tName + (tCode ? ' (' + tCode + ')' : '');
    if (!/report\s*:?\s*$/i.test(title)) title += ' REPORT';

    /* RESULT header boxes — span the full header height (grid-row: span 2):
       barcode of the patient number, then the patient number, then the
       date/time in Chughtai style ("22-Sep-2026 10:21") */
    var boxHtml = cols.map(function (c) {
      var bv = c.caseCode ? { code: c.caseCode, text: c.caseText } : (vn ? { code: vn.caseCode, text: vn.caseText } : null);
      return '<div style="border:2px solid #000;background:#fff;box-sizing:border-box;' +
        'padding:0;line-height:1.25;font-size:0.76em;grid-row:span 2;display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;width:100%">' +
        '<div style="font-weight:700;color:#000;font-size:1em;background:#bfbfbf;padding:3px 0;border-bottom:2px solid #000;text-align:center;width:100%">RESULT</div>' +
        '<div style="padding:3px 3px 2px;display:flex;flex-direction:column;align-items:center;width:100%;box-sizing:border-box">' +
        '<div style="width:100%;margin:0 0 2px">' + barcodeHtml((bv && bv.code) || c.invoiceNo || invNo, '100%', '11px') + '</div>' +
        '<div style="font-size:1em;color:#000;white-space:nowrap">' +
          App.esc(chughtaiTs(c.reportedAt)).replace(/ /g, '&nbsp;') +
        '</div></div>' +
      '</div>';
    }).join('');

    /* ONE grey header bar (heavy black outline, no inner dividers) like the reference:
       spaced "T E S T" | NORMAL VALUE | UNIT, columns aligned with the body rows */
    var _hc = 'background:#cfe4f6;color:#0b1740;font-weight:700;font-size:0.92em;line-height:1.2;padding:3px 4px;box-sizing:border-box;border-top:2px solid #000;border-bottom:2px solid #000;display:flex;align-items:center;';
    var headCells =
      '<div style="' + _hc + 'border-left:2px solid #000;letter-spacing:0.35em">TEST</div>' +
      '<div style="' + _hc + '">NORMAL VALUE</div>' +
      '<div style="' + _hc + '">UNIT</div>';

    /* value cell. Normal print: abnormal = bold black. Comparison print: the NEW result is colour-coded by how far it is
       outside the range (amber = slightly, orange = moderately, red = critical) with an arrow (up = high, down = low);
       previous results stay plain so the doctor can read the change at a glance. */
    function valCell(valueStr, refStr, isNew) {
      var disp = (valueStr == null) ? '' : String(valueStr);
      var sev = abnormalSeverity(disp, refStr);
      var base = 'text-align:right;padding-right:20px';
      if (cmp) {
        if (isNew && sev) {
          var isH = (sev.dir === 'high');
          var cCol = isH ? '#dc2626' : '#2563eb';
          var cArr = isH ? ' &uarr;' : ' &darr;';
          return '<div style="' + base + '"><span style="font-weight:800;color:' + cCol + '">' +
            App.esc(disp) + cArr + '</span></div>';
        }
        return '<div style="' + base + '">' + App.esc(disp) + '</div>';
      }
      if (sev) {
        var isHigh = (sev.dir === 'high');
        var col = isHigh ? '#dc2626' : '#2563eb';
        var arr = isHigh ? ' &uarr;' : ' &darr;';
        return '<div style="' + base + '"><span style="font-weight:800;color:' + col + '">' +
          App.esc(disp) + arr + '</span></div>';
      }
      return '<div style="' + base + '">' + App.esc(disp) + '</div>';
    }

    /* body rows: thin separators, param name regular weight */
    var rowsHtml;
    if (params.length) {
      var shown = params.filter(function (p) {
        return cols.some(function (c) { var v = (c.values || {})[p.name]; return v != null && String(v).trim() !== ''; });
      });
      if (!shown.length) shown = params; /* no values entered: keep blank layout */
      rowsHtml = shown.map(function (p) {
        var pref = refFor(p, d.pat);
        var cells = cols.map(function (c, ci) {
          return valCell((c.values || {})[p.name], pref, ci === 0);
        }).join('');
        return '<div style="display:grid;grid-template-columns:' + gridCols + ';' +
          'border-bottom:1px solid #ddd;font-size:1.04em;padding:2px 6px">' +
          '<div>' + App.esc(p.name || '') + '</div>' +
          '<div>' + App.esc(pref !== '' ? String(pref) : '—') + '</div>' +
          '<div>' + App.esc(p.unit != null && p.unit !== '' ? String(p.unit) : '') + '</div>' +
          cells +
        '</div>';
      }).join('');
    } else {
      // Test with no params: single row labeled "Result", value spans the result columns.
      var ftVal = vals['Result'];
      rowsHtml =
        '<div style="display:grid;grid-template-columns:' + gridCols + ';' +
          'border-bottom:1px solid #ddd;font-size:1.04em;padding:2px 6px">' +
          '<div>Result</div>' +
          '<div></div><div></div>' +
          '<div style="grid-column:span ' + nRes + ';text-align:center">' +
            App.esc(ftVal == null ? '' : String(ftVal)) +
          '</div>' +
        '</div>';
    }

    /* remarks below the table (kept from previous design) */
    var remarksHtml = '';
    if (vals['Remarks']) {
      remarksHtml =
        '<div style="font-size:1em;padding:6px 6px 0">' +
          '<div style="font-weight:700">Note:</div>' +
          '<div>' + App.esc(vals['Remarks']) + '</div>' +
        '</div>';
    }

    /* ---------- worker 3/3: trend graph below the table ----------
       Contract lives in assets/js/graph-config.js (Worker 1):
         App.graphFor(test) -> {xLabels, unit, refLo, refHi, title} | null
         App.renderGraphSvg(g, valsByParam) -> inline-SVG HTML | ''
       Current-report values only; renderGraphSvg returns '' when fewer
       than 2 numeric points are plottable. Guarded so the report still
       renders when graph-config.js is absent. Never throws. */
    var graphHtml = '';
    try {
      if (window.App && App.graphFor && App.renderGraphSvg) {
        var g = App.graphFor(test);
        /* Value lookup keys: the config carries the param names in g.params
           (g.xLabels are display labels like "0 min"); the contract used
           xLabels for both. Accept either shape. */
        var gKeys = (g && Array.isArray(g.params) && g.params.length) ? g.params :
                    (g && Array.isArray(g.xLabels) ? g.xLabels : []);
        if (gKeys.length > 1) {
          var nNum = 0;
          for (var qi = 0; qi < gKeys.length; qi++) {
            if (isFinite(parseFloat(vals[gKeys[qi]]))) nNum++;
          }
          if (nNum >= 2) {
            var svg = App.renderGraphSvg(g, vals) || '';
            if (svg) {
              graphHtml =
                '<div class="rpt-graph" style="margin:8px 0 4px;page-break-inside:avoid">' +
                  '<div style="font-weight:700;font-size:0.9em;margin-bottom:4px;color:#000">' +
                    App.esc(g.title || 'Trend Graph') +
                  '</div>' +
                  svg +
                '</div>';
            }
          }
        }
      }
    } catch (e) { graphHtml = ''; }

    /* assemble: title + RESULT boxes row, then grey header row, body, graph, remarks */
    return '<div class="rpt-section" style="margin:8px 0 2px">' +
      '<div style="display:grid;grid-template-columns:' + gridCols + ';grid-template-rows:1fr auto">' + /* title row absorbs the RESULT box height; the heading bar stays slim */
        '<div style="grid-column:span 3;align-self:center;color:#000;font-weight:700;' +
          'font-size:1.15em;text-transform:uppercase;letter-spacing:0.02em">' +
          App.esc(title) +
        '</div>' +
        boxHtml +
        headCells +
      '</div>' +
      rowsHtml +
      graphHtml +
      remarksHtml +
    '</div>';
  }

  /* ---------- worker 5/20: section dividers / subsection headers / notes ----------
     Emitted by reportHtml() when tests carry a category (grouped, stable
     sort). Until tests carry categories this is a safe no-op. */
  function sectionDividerHtml(title) {
    return '<div style="background:#e8e8e8;border:1px solid #000;' +
      'padding:7px 10px;margin:22px 0 10px;' +
      'font-size:1.12em;font-weight:700;color:#000;' +
      'page-break-after:avoid">' +
      App.esc(title || '') + '</div>';
  }

  function subsectionHeaderHtml(title) {
    return '<h3 style="margin:20px 0 8px;font-size:1em;font-weight:700;' +
      'letter-spacing:0.05em;color:#000;text-transform:uppercase;' +
      'page-break-after:avoid">' +
      App.esc(String(title || '').toUpperCase()) + '</h3>';
  }

  /* Per-test Note block ("Note:" + small text). Renders test.note when
     present, nothing otherwise. */
  function testNoteHtml(test) {
    var note = test && (test.note || '');
    if (!note) return '';
    return '<div class="rpt-note" style="margin:8px 0 2px;font-size:0.88em;line-height:1.5;color:#000;' +
      'page-break-inside:avoid">' +
      '<strong>Note:</strong><br>' +
      App.esc(note) + '</div>';
  }

  function sectionCatOf(r) {
    var c = r && r.test && r.test.category;
    if (c == null) return '';
    return String(c).trim();
  }

  /* exposed for other modules / future use */
  App.sectionDividerHtml = sectionDividerHtml;
  App.subsectionHeaderHtml = subsectionHeaderHtml;
  App.testNoteHtml = testNoteHtml;
  App.sectionCatOf = sectionCatOf;

  /* ---------- worker 4/4: report footer (redesign) ----------
     Centered bold verification line, thick black rule, signatories in
     one row spread across (from s.signatories), bordered disclaimer box,
     "Powered by System Optix". Used only when the custom s.footerHtml
     override is NOT set. */
  var DEFAULT_DISCLAIMER = 'NOTE: All the tests are performed on the most advanced, highly sophisticated, appropriate, and state of the art instruments with highly sensitive chemicals under strict conditions and with all care and diligence. However, the above results are NOT the DIAGNOSIS and should be correlated with clinical findings, patient\'s history, signs and symptoms and other diagnostic tests. Lab to lab variation may occur. This document is NEVER challengeable at any PLACE/COURT and in any CONDITION.';
  function reportFooterHtml(d) {
    var s = (d && d.s) || {};

    /* 1: centered bold verification line */
    var verNote = s.verNote || s.verificationNote ||
      'Electronically verified report. No signatures necessary. Sample brought to the main lab. Lab reports should be interpreted by a physician in correlation with clinical and radiologic findings.';
    var line1 =
      '<p class="rpt-ver" style="text-align:center;font-weight:700;font-size:0.96em;margin:8px 0 2px;line-height:1.4">' +
        App.esc(verNote) + '</p>';

    /* 2: thin black rule */
    var rule = '<hr class="rpt-footrule" style="border:none;border-top:1px solid #000;margin:3px 0">';

    /* 3: signatory doctors in one row, spread across */
    var sigs = (Array.isArray(s.signatories) ? s.signatories : [])
      .filter(function (g) { return g && g.name && g.active !== false; });
    var sigHtml = '';
    if (sigs.length) {
      sigHtml =
        '<div class="rpt-sigs" style="display:flex;justify-content:space-around;gap:12px;margin:6px 0 4px">' +
          sigs.map(function (g) {
            var sigPic = '';
            var hasSig = s.enableSignatures !== false && (g.sigImg || g.signature);
            var hasStamp = s.showStamps !== false && g.stampImg;
            if (hasSig || hasStamp) {
              sigPic = '<div style="height:44px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:2px;gap:6px">' +
                (hasSig ? '<img src="' + (g.sigImg || g.signature) + '" style="max-height:42px;max-width:125px;object-fit:contain" alt="Signature">' : '') +
                (hasStamp ? '<img src="' + g.stampImg + '" style="max-height:38px;max-width:55px;object-fit:contain" alt="Stamp">' : '') +
                '</div>';
            } else {
              sigPic = '<div style="height:10px"></div>';
            }
            return '<div class="rpt-sig" style="flex:1;text-align:center;min-width:0">' +
              sigPic +
              '<div style="font-weight:700;font-size:0.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.esc(g.name) + '</div>' +
              (g.qual ? '<div style="font-size:0.78em;color:#333">' + App.esc(g.qual) + '</div>' : '') +
              (g.title ? '<div style="font-size:0.78em;color:#555">' + App.esc(g.title) + (g.regNo ? ' (' + App.esc(g.regNo) + ')' : '') + '</div>' : '') +
            '</div>';
          }).join('') + '</div>';
    }

    /* 4: address block, centered bold-ish — all in ONE row */
    var addrParts = [];
    if (s.address) addrParts.push(s.address);
    if (s.headOffice) addrParts.push('Head Office: ' + s.headOffice);
    if (s.mainLab) addrParts.push('Previous Lab: ' + s.mainLab);
    if (s.phone) addrParts.push('Phone: ' + s.phone);
    if (s.callCenter) addrParts.push('Call Center: ' + s.callCenter);
    if (s.website) addrParts.push('Web: ' + s.website);
    if (s.email) addrParts.push('Email: ' + s.email);
    var addrHtml = '';
    if (addrParts.length) {
      addrHtml =
        '<div style="border-top:1px solid #000;margin:4px 0 3px;padding-top:3px">' +
        '<div style="text-align:center;font-weight:400;font-size:0.85em;line-height:1.6">' +
          App.esc(addrParts.join(' | ')) +
        '</div></div>';
    }

    /* 5: disclaimer box — skip the old "Get well soon" default footer note */
    var _fn = s.footerNote;
    if (_fn === 'Get well soon. Reports available on counter & phone.') _fn = '';
    var disc = s.disclaimer || _fn || DEFAULT_DISCLAIMER;
    var discHtml =
      '<div class="rpt-disc" style="border:none;border-bottom:1px solid #000;padding:2px 0 6px;font-size:0.52em;line-height:1.4;margin:4px 0 0;text-align:justify">' +
        App.esc(disc) + '</div>';

    /* 6: powered-by (existing constraint) */
    var powered =
      '<p class="rpt-powered" style="color:#000;font-size:0.88em;text-align:center;margin:5px 0 0">Powered by System Optix</p>';

    var ftHtml = String(s.footerText || '').trim()
      ? '<div class="rpt-ftext" style="text-align:center;color:#000;font-size:0.92em;font-weight:600;line-height:1.45;margin:6px 0 2px;white-space:pre-line">' + App.esc(String(s.footerText).trim()) + '</div>'
      : '';
    return '<div class="rpt-footer">' + ftHtml + line1 + rule + sigHtml + addrHtml + discHtml + powered + '</div>';
  }
  window.reportFooterHtml = reportFooterHtml;


  /* ---------- result entry: pick from a menu instead of typing ----------
     Text-type parameters get a drop-down of the usual answers (Positive / Negative, Reactive / Non-Reactive, Male / Female,
     colours ...). The list comes from the parameter's own `options` (comma separated) if set, else from its normal range text
     or its name. "Other…" turns the menu into a normal text box, so nothing is ever blocked. Numbers stay plain number boxes. */
  function optionsFor(p) {
    if (!p || p.type === 'number') return null;
    var o = p.options;
    if (typeof o === 'string') o = o.split(/\s*,\s*/);
    if (Array.isArray(o) && o.length) return o.filter(Boolean);
    var ref = String(p.ref || '').trim(), nm = String(p.name || '').trim(), rl = ref.toLowerCase(), nl = nm.toLowerCase();
    var BG8 = ['A Positive', 'A Negative', 'B Positive', 'B Negative', 'AB Positive', 'AB Negative', 'O Positive', 'O Negative'];
    var PN = ['Negative', 'Positive'];
    /* by name */
    if (/^(gender|sex)$/.test(nl)) return ['Male', 'Female'];
    if (/blood\s*group|\babo\b/.test(nl) && rl.indexOf('/') < 0) return (/\brh\b|rh\)|& rh|\+ rh/.test(nl) || /^blood\s*group$/.test(nl)) ? BG8 : ['A', 'B', 'AB', 'O'];
    if (/^rh(\s|$|\()/.test(nl) || /^rh[\s-]*(factor|type|d)/.test(nl)) return ['Positive', 'Negative'];
    if (/^colou?r$/.test(nl) || /^colou?r\b/.test(nl) && /yellow|amber|brown|colou?r/.test(rl)) return ['Pale yellow', 'Yellow', 'Dark yellow', 'Amber', 'Straw', 'Red', 'Brown', 'Colourless'];
    if (/^appearance$|^clarity$|^transparency$/.test(nl)) return ['Clear', 'Slightly turbid', 'Turbid', 'Hazy', 'Cloudy'];
    if (/^consistency$/.test(nl)) return ['Formed', 'Semi-formed', 'Loose', 'Watery', 'Hard', 'Mucoid'];
    if (/^odou?r$/.test(nl)) return ['Aromatic', 'Foul', 'Offensive', 'Odourless'];
    /* by the normal-range text */
    if (/1\s*:\s*\d+/.test(ref)) return ['Negative', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'];
    if (/^negative\s*\(/.test(rl)) return PN;                                   // "Negative (cutoff 300)" etc.
    if (/^non[\s-]*reactive/.test(rl)) return ['Non-Reactive', 'Reactive', 'Borderline'];
    if (/^reactive/.test(rl)) return ['Reactive', 'Non-Reactive', 'Borderline'];
    if (/^negative$|^negative\b.*\bpositive|^neg$/.test(rl)) return ['Negative', 'Positive', 'Trace', '+', '++', '+++', '++++'];
    if (/^positive/.test(rl)) return ['Positive', 'Negative'];
    if (/^no growth|^sterile/.test(rl)) return ['No growth', 'No growth after 48 hours', 'No growth after 5 days', 'Growth seen', 'Contaminated'];
    if (/^no organisms? isolated|^not isolated/.test(rl)) return ['No organism isolated', 'Organism isolated'];
    if (/^no organisms? seen/.test(rl)) return ['No organisms seen', 'Organisms seen'];
    if (/^no parasites? seen/.test(rl)) return ['No parasite seen', 'Parasite seen'];
    if (/^not seen/.test(rl)) return ['Not seen', 'Seen', 'Occasional', 'Few', 'Moderate', 'Many'];
    if (/^absent/.test(rl)) return ['Absent', 'Present'];
    if (/^present/.test(rl)) return ['Present', 'Absent'];
    if (/^not detected|^none detected|^no inhibitor/.test(rl)) return ['Not Detected', 'Detected'];
    if (/^none$/.test(rl)) return ['None', 'Present'];
    if (/^adequate/.test(rl)) return ['Adequate', 'Inadequate'];
    if (/^sufficient/.test(rl)) return ['Sufficient', 'Insufficient'];
    if (/^valid/.test(rl)) return ['Valid', 'Invalid'];
    if (/^compatible/.test(rl)) return ['Compatible', 'Incompatible'];
    if (/^low risk/.test(rl)) return ['Low Risk', 'Intermediate Risk', 'High Risk'];
    if (/^normal\b/.test(rl) && rl.length < 14) return ['Normal', 'Abnormal'];
    if (/^no significant abnormality/.test(rl)) return ['No significant abnormality', 'Abnormality seen'];
    if (/^clear/.test(rl)) return ['Clear', 'Slightly turbid', 'Turbid', 'Hazy'];
    if (/^(few|occasional)/.test(rl)) return ['Nil', 'Few', 'Occasional', 'Moderate', 'Plenty'];
    if (/^(pale )?yellow/.test(rl)) return ['Pale yellow', 'Yellow', 'Dark yellow', 'Amber', 'Straw', 'Red', 'Brown'];
    if (/^brown$/.test(rl)) return ['Brown', 'Yellow', 'Green', 'Black', 'Red', 'Clay-coloured'];
    if (/^formed$/.test(rl)) return ['Formed', 'Semi-formed', 'Loose', 'Watery', 'Hard', 'Mucoid'];
    if (/^aromatic$/.test(rl)) return ['Aromatic', 'Foul', 'Offensive'];
    if (/^nil|^absent/.test(rl)) return ['Nil', 'Few', 'Moderate', 'Plenty', 'Present'];
    if (/\//.test(ref) && !/\d\s*[-–:]|per |\(/.test(ref) && ref.length <= 40) {            // "Positive / Negative", "A / B / AB / O"
      var parts = ref.split(/\s*\/\s*/).filter(Boolean);
      if (parts.length > 1 && parts.length < 8 && parts.every(function (x) { return x.length <= 22; })) return parts;
    }
    /* no usable range text: guess from the name for the usual yes/no screening tests */
    if (!ref && /\b(hbsag|hcv|hiv|ns1|antigen|antibody|anti[\s-]|igm|igg|rapid|ict|malaria|vdrl|rpr|tpha|widal|brucella|h\.? ?pylori|troponin|covid|dengue|pregnancy|hcg|screen)\b/.test(nl)) return PN;
    return null;
  }
  /* the input (or menu) for one result field; `attrs` carries the data-* hooks the save code looks up */
  function resultField(p, v, attrs) {
    var opts = optionsFor(p);
    if (!opts) {
      var isNum = p.type === 'number';
      return '<input class="input" ' + attrs + (isNum ? ' type="number" step="any" inputmode="decimal"' : '') + ' value="' + App.esc(v) + '" placeholder="Enter value">';
    }
    var has = !v || opts.some(function (x) { return x.toLowerCase() === String(v).toLowerCase(); });
    return '<select class="input rs-opt" ' + attrs + '><option value="">— select —</option>' +
      opts.map(function (x) { return '<option' + (String(v).toLowerCase() === x.toLowerCase() ? ' selected' : '') + '>' + App.esc(x) + '</option>'; }).join('') +
      (has ? '' : '<option selected>' + App.esc(v) + '</option>') +
      '<option value="__other">Other… (type)</option></select>';
  }
  if (!window.__rsOptWired) {
    window.__rsOptWired = true;
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('rs-opt') || t.value !== '__other') return;
      var inp = document.createElement('input'); inp.className = 'input'; inp.placeholder = 'Type the result';
      Array.prototype.forEach.call(t.attributes, function (a) { if (/^data-/.test(a.name)) inp.setAttribute(a.name, a.value); });
      t.parentNode.replaceChild(inp, t); inp.focus();
    });
  }

  /* Reference range of a parameter for THIS patient: child (< 13 yrs) -> male / female -> general range. */
  function refFor(p, pat) {
    if (!p) return '';
    var age = parseFloat(pat && pat.age), g = String((pat && pat.gender) || '').toLowerCase().charAt(0);
    if (!isNaN(age) && age < 13 && p.refChild) return p.refChild;
    if (g === 'm' && p.refMale) return p.refMale;
    if (g === 'f' && p.refFemale) return p.refFemale;
    return p.ref || '';
  }
  App.refFor = refFor;

  /* ---------- patient result trends ----------
     Every numeric parameter a patient has ever been reported on (Hb, sugar, creatinine ...), plotted visit by visit against
     that patient's own reference range. Rendered into any container by the patient profile page. */
  function trendSeries(pat) {
    var invs = DB.all('invoices').filter(function (i) { return i.patientId === pat.id; });
    var invById = {}; invs.forEach(function (i) { invById[i.id] = i; });
    var map = {};
    DB.all('results').forEach(function (r) {
      var inv = invById[r.invoiceId];
      if (!inv || r.status !== 'ready' || !r.values) return;
      var test = DB.get('tests', r.testId); if (!test || !Array.isArray(test.params)) return;
      var when = r.reportedAt || inv.createdAt || '';
      test.params.forEach(function (p) {
        var raw = r.values[p.name];
        if (raw == null || raw === '') return;
        var v = parseAbnNum(raw); if (isNaN(v)) return;
        var key = String(p.name).toLowerCase();
        var ref = refFor(p, pat);
        var m = map[key] || (map[key] = { name: p.name, unit: p.unit || '', ref: ref, pts: [] });
        m.ref = ref || m.ref; m.unit = p.unit || m.unit;
        m.pts.push({ t: when, v: v, raw: String(raw), inv: inv.no || inv.id, invId: inv.id });
      });
    });
    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.forEach(function (m) {
      m.pts.sort(function (a, b) { return a.t < b.t ? -1 : (a.t > b.t ? 1 : 0); });
      m.pts.forEach(function (pt) { var sv = abnormalSeverity(pt.raw, m.ref); pt.sev = sv ? sv.severity : null; pt.dir = sv ? sv.dir : null; });
    });
    out.sort(function (a, b) { return (b.pts.length - a.pts.length) || a.name.localeCompare(b.name); });
    return out;
  }
  function refBounds(ref) {
    var r = String(ref || '').replace(/[–—]/g, '-').replace(/,/g, '').trim(), m;
    if ((m = r.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/))) return { lo: parseFloat(m[1]), hi: parseFloat(m[2]) };
    if ((m = r.match(/^\s*(?:<=|<|≤)\s*(\d+(?:\.\d+)?)/))) return { lo: null, hi: parseFloat(m[1]) };
    if ((m = r.match(/^\s*(?:>=|>|≥)\s*(\d+(?:\.\d+)?)/))) return { lo: parseFloat(m[1]), hi: null };
    return null;
  }
  function outDist(m, v) {
    var b = refBounds(m.ref); if (!b) return 0;
    if (b.lo != null && v < b.lo) return b.lo - v;
    if (b.hi != null && v > b.hi) return v - b.hi;
    return 0;
  }
  var TREND_COL = { ok: '#16a34a', mild: '#d97706', moderate: '#ea580c', critical: '#dc2626' };
  function trendSvg(m) {
    var W = 1000, H = 320, L = 56, R = 48, T = 22, B = 46, n = m.pts.length;
    var b = refBounds(m.ref);
    var vals = m.pts.map(function (q) { return q.v; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (b) { if (b.lo != null) { mn = Math.min(mn, b.lo); mx = Math.max(mx, b.lo); } if (b.hi != null) { mn = Math.min(mn, b.hi); mx = Math.max(mx, b.hi); } }
    var span = (mx - mn) || Math.abs(mx) || 1; mn -= span * 0.14; mx += span * 0.14; if (mn < 0 && Math.min.apply(null, vals) >= 0 && (!b || b.lo == null || b.lo >= 0)) mn = 0;
    var X = function (i) { return n === 1 ? (L + (W - L - R) / 2) : L + (W - L - R) * i / (n - 1); };
    var Y = function (v) { return T + (H - T - B) * (1 - (v - mn) / (mx - mn)); };
    var f = function (v) { return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); };
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block" role="img" aria-label="' + App.esc(m.name) + ' trend">';
    for (var k = 0; k <= 4; k++) { var gv = mn + (mx - mn) * k / 4, gy = Y(gv);
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="#e5eaf3"/><text x="' + (L - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="#6b7a90">' + f(gv) + '</text>'; }
    if (b) { var yTop = b.hi != null ? Y(b.hi) : T, yBot = b.lo != null ? Y(b.lo) : (H - B);
      g += '<rect x="' + L + '" y="' + yTop + '" width="' + (W - L - R) + '" height="' + Math.max(2, yBot - yTop) + '" fill="#16a34a" opacity=".10"/>';
      if (b.hi != null) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yTop + '" y2="' + yTop + '" stroke="#16a34a" stroke-dasharray="4 4" opacity=".6"/>';
      if (b.lo != null) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yBot + '" y2="' + yBot + '" stroke="#16a34a" stroke-dasharray="4 4" opacity=".6"/>';
      g += '<text x="' + (W - R - 4) + '" y="' + (yTop + 13) + '" text-anchor="end" font-size="10.5" fill="#15803d">normal ' + App.esc(m.ref) + '</text>'; }
    if (n > 1) g += '<polyline fill="none" stroke="#3b5b9a" stroke-width="2.2" stroke-linejoin="round" points="' + m.pts.map(function (q, i) { return X(i) + ',' + Y(q.v); }).join(' ') + '"/>';
    m.pts.forEach(function (q, i) {
      var col = TREND_COL[q.sev || 'ok'], x = X(i), y = Y(q.v), up = y > T + 26;
      g += '<g><title>' + App.esc(m.name + ': ' + q.raw + ' ' + m.unit + ' — ' + App.d(q.t) + ' (' + q.inv + ')') + '</title>' +
        '<circle cx="' + x + '" cy="' + y + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="3"/>' +
        '<text x="' + x + '" y="' + (up ? y - 12 : y + 20) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + col + '">' + App.esc(f(q.v)) + '</text></g>' +
        '<text x="' + x + '" y="' + (H - 22) + '" text-anchor="middle" font-size="11" fill="#6b7a90">' + App.esc(App.d(q.t)) + '</text>';
    });
    return g + '</svg>';
  }
  App.renderPatientTrends = function (host, pat) {
    if (!host) return;
    var series = trendSeries(pat);
    if (!series.length) { host.innerHTML = '<p class="muted" style="margin:0">Trends appear here once this patient has reported numeric results.</p>'; return; }
    host.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
      '<label class="label" style="margin:0;font-weight:700">Parameter</label>' +
      '<select class="input" id="trSel" style="max-width:320px">' + series.map(function (m, i) {
        return '<option value="' + i + '">' + App.esc(m.name) + ' (' + m.pts.length + ' result' + (m.pts.length > 1 ? 's' : '') + ')</option>'; }).join('') + '</select>' +
      '<span class="muted" style="font-size:12px;margin-left:auto"><span style="color:#16a34a">●</span> normal &nbsp;<span style="color:#d97706">●</span> mild/moderate &nbsp;<span style="color:#dc2626">●</span> critical</span></div>' +
      '<div id="trBody"></div>';
    function draw(i) {
      var m = series[i], rows = m.pts.map(function (q, j) {
        var prev = j ? m.pts[j - 1] : null, d = prev ? q.v - prev.v : null, dTxt;
        if (d == null) dTxt = '<span class="muted">—</span>';
        else if (d === 0) dTxt = '<span class="muted">no change</span>';
        else {
          var da = outDist(m, prev.v), db = outDist(m, q.v);   /* distance outside the normal range: smaller = improving */
          var col = (da === 0 && db === 0) ? '#6b7a90' : (db < da ? '#16a34a' : '#dc2626');
          dTxt = '<span style="color:' + col + ';font-weight:700">' + (d > 0 ? '▲ +' : '▼ ') + (Math.round(d * 100) / 100) + '</span>';
        }
        var flag = q.sev ? '<span style="color:' + TREND_COL[q.sev] + ';font-weight:800">' + (q.dir === 'high' ? '↑ HIGH' : '↓ LOW') + (q.sev === 'critical' ? ' · CRITICAL' : '') + '</span>' : '<span style="color:#16a34a;font-weight:700">Normal</span>';
        return '<tr><td>' + App.esc(App.d(q.t)) + '</td><td><span class="mono">' + App.esc(q.inv) + '</span></td><td><b>' + App.esc(q.raw) + '</b> <span class="muted">' + App.esc(m.unit) + '</span></td><td>' + flag + '</td><td>' + dTxt + '</td></tr>';
      }).reverse().join('');
      document.getElementById('trBody').innerHTML = (m.pts.length < 2 ? '<p class="muted" style="margin:0 0 8px;font-size:12.5px">Only one result so far — the line appears from the next visit.</p>' : '') + trendSvg(m) +
        '<div class="tbl-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Date</th><th>Invoice</th><th>Result</th><th>Status</th><th>Change</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    host.querySelector('#trSel').addEventListener('change', function () { draw(+this.value); });
    draw(0);
  };
  App.parseAbnNum = parseAbnNum;
  App.abnormalSeverity = abnormalSeverity;
  App.trendSeries = trendSeries;
  App.refBounds = refBounds;
  App.outDist = outDist;
  App.trendSvg = trendSvg;

  function reportData(invoiceId, ropts) {
    var inv = invOf(invoiceId);
    if (!inv) return null;
    if (!inv.no) inv = Object.assign({}, inv, { no: inv.id });   /* older invoices saved without a number */
    var readyRows = joinedRows('ready').filter(function (r) { return r.invoice.id === invoiceId; });
    if (!readyRows.length) return null;
    var pendingCount = joinedRows('pending').filter(function (r) { return r.invoice.id === invoiceId; }).length;
    var maxReported = '';
    readyRows.forEach(function (r) {
      if (r.res && r.res.reportedAt && r.res.reportedAt > maxReported) maxReported = r.res.reportedAt;
    });

    /* ---------- worker 3/4: integrated comparison data ----------
       Previous-report data: for the same patient (inv.patientId), find OTHER
       invoices (id !== invoiceId) with ready results, newest first.
       d.prevByTest = map testId -> array of { invoiceNo, caseText, caseCode, reportedAt, values }
       (capped at 2 previous columns per test for readability). */
    var prevByTest = {};
    var otherInvRows = joinedRows('ready').filter(function (r) {
      return r.invoice.id !== invoiceId && r.invoice.patientId === inv.patientId;
    });
    otherInvRows.sort(function (a, b) {
      var da = (a.res && a.res.reportedAt) || a.invoice.createdAt || '';
      var db = (b.res && b.res.reportedAt) || b.invoice.createdAt || '';
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    var cmpIds = (ropts && Array.isArray(ropts.compareIds)) ? ropts.compareIds : [];
    otherInvRows.forEach(function (r) {
      if (cmpIds.indexOf(r.invoice.id) < 0) return; /* previous results are shown only for the reports chosen in the print dialog */
      var tid = (r.item && (r.item.testId || r.item.id)) || (r.res && r.res.testId);
      if (!tid) return;
      if (!prevByTest[tid]) prevByTest[tid] = [];
      if (prevByTest[tid].length >= 2) return;  /* cap: 2 previous columns */
      prevByTest[tid].push({
        invoiceNo: r.invoice.no || r.invoice.id,
        caseText: App.visitNos(r.invoice).caseText,
        caseCode: App.visitNos(r.invoice).caseCode,
        reportedAt: (r.res && r.res.reportedAt) || r.invoice.createdAt || '',
        values: (r.res && r.res.values) || {}
      });
    });

    return {
      inv: inv,
      pat: patOf(inv.patientId),
      s: DB.get('settings', 'main') || {},
      doc: inv.doctorId ? DB.get('doctors', inv.doctorId) : null,
      readyRows: readyRows,
      pendingCount: pendingCount,
      maxReported: maxReported,
      prevByTest: prevByTest
    };
  }

  /* ---------- lab report document (Chughtai-style redesign) ----------
     Composed from the integrated helpers above:
       header (worker 2) + patient grid (worker 3) + test sections with
       category dividers/notes (workers 4+5) + footer (worker 6).
     - s.headerHtml / s.footerHtml custom overrides still win when set.
     - opts.noLabHeader (print-choice dialog: pre-printed letterhead) still
       suppresses the header.
     - The QR placeholder <img data-qr="1"> contract is unchanged:
       printReport() injects the src; stripQrImg() only runs if QR
       generation itself fails (unpaid invoices get a fallback-URL QR).
     - Output is wrapped in .rpt-page (print stylesheet governs page box,
       breaks and exact backgrounds) with the <style> prepended. */
  /* {{tokens}} usable inside a Custom Report Header / Footer; filled for every report */
  function fillTokens(html, d) {
    var inv = (d && d.inv) || {}, pat = (d && d.pat) || {}, s = (d && d.s) || {};
    var vn = App.visitNos(inv);   /* lab_no / case_number; the old names case_no / patient_id keep their place (top / second) and now show the same two numbers */
    var bc = function (code) { return barcodeHtml(code, '124px', '15px').replace('margin:0 auto', 'margin:0'); };
    return String(html || '')
      .replace(/\{\{\s*logo\s*\}\}/g, function () { return App.esc(s.logo || ''); })
      .replace(/\{\{\s*(?:lab_barcode|case_barcode)\s*\}\}/g, function () { return bc(vn.labCode); })
      .replace(/\{\{\s*(?:case_number_barcode|patient_barcode)\s*\}\}/g, function () { return bc(vn.caseCode); })
      .replace(/\{\{\s*(?:lab_no|case_no)\s*\}\}/g, function () { return App.esc(vn.labText); })
      .replace(/\{\{\s*(?:case_number|patient_id)\s*\}\}/g, function () { return App.esc(vn.caseText); })
      .replace(/\{\{\s*qr\s*\}\}/g, function () { return s.showQr === false ? '' : '<img data-qr="1" style="width:70px;height:70px" alt="QR">'; });
  }
  /* the current automatic header / footer as editable HTML (pre-fills the Custom boxes in Settings -> Lab Profile) */
  function prettyHtml(h) { return String(h).replace(/></g, '>\n<').replace(/&#39;/g, "'"); }
  App.reportHeaderTemplate = function (s) { return prettyHtml(reportHeaderHtml({ inv: {}, pat: {}, s: s || {}, _tpl: true })); };
  App.reportFooterTemplate = function (s) {
    var h = reportFooterHtml({ s: s || {} });
    return prettyHtml(h.replace(/^<div class="rpt-footer">/, '').replace(/<\/div>$/, ''));
  };

  function reportHtml(d, opts) {
    var inv = d.inv || {}, pat = d.pat || {}, s = d.s || {};
    var readyRows = d.readyRows || [], pendingCount = d.pendingCount || 0;
    var noLabHeader = !!(opts && opts.noLabHeader);

    /* report font-size scale (Lab Profile -> Report Font Size) */
    var rptScale = RPT.setScale(s.reportFontSize || 'medium');
    var rptBase = Math.round(12.5 * rptScale * 10) / 10;

    /* header */
    /* custom header/footer only override if they contain real content (ignore trivial/invalid like ">") */
    function hasRealHtml(h) {
      if (!h) return false;
      var t = String(h).replace(/<[^>]*>/g, '').trim();
      return t.length > 1;
    }
    var headOut = noLabHeader ? '' : (hasRealHtml(s.headerHtml) ? fillTokens(s.headerHtml, d) : reportHeaderHtml(d));

    /* patient info grid */
    var infoHtml = patientGridHtml(d);

    /* test sections, grouped by test category when present */
    var rows = readyRows.slice();
    rows.sort(function (a, b) {
      var ca = sectionCatOf(a), cb = sectionCatOf(b);
      if (!ca && !cb) return 0;              // keep original order
      if (!ca) return 1;                     // uncategorised last
      if (!cb) return -1;
      return ca === cb ? 0 : (ca < cb ? -1 : 1);
    });
    var testsHtml = '', lastCat = null;
    rows.forEach(function (r) {
      var cat = sectionCatOf(r);
      lastCat = cat; /* category headings (HAEMATOLOGY / CHEMICAL PATHOLOGY ...) are intentionally not printed */
      testsHtml += testSectionHtml(r, d);
      testsHtml += testNoteHtml(r.test);
    });

    /* footer */
    var footOut = hasRealHtml(s.footerHtml) ? '<div class="rpt-footer">' + fillTokens(s.footerHtml, d) + '</div>' : reportFooterHtml(d);

    var bodyHtml = '<table class="rpt-wrap"><thead><tr><td>' + headOut + infoHtml + '</td></tr></thead><tbody><tr><td>' + testsHtml +
      (pendingCount
        ? '<p style="color:#000;font-size:0.96em;margin:6px 0"><em>Note: ' +
          pendingCount + ' test(s) from this invoice are still pending.</em></p>'
        : '') +
      (s.footerNote && s.footerNote !== 'Get well soon. Reports available on counter & phone.'
        ? '<p style="color:#000;margin-top:18px;margin-bottom:4px;font-size:0.92em"><em>' +
          App.esc(s.footerNote) + '</em></p>'
        : '') + '</td></tr></tbody></table>' +
      footOut;

    if (d._cmpLegend) {
      bodyHtml = bodyHtml.replace(footOut, '<p style="margin:6px 0 2px;font-size:0.82em;color:#000">' +
        '<b>New result:</b> <span style="color:#dc2626;font-weight:700">&uarr; above range (high)</span> &nbsp;|&nbsp; ' +
        '<span style="color:#2563eb;font-weight:700">&darr; below range (low)</span>. Previous results are shown as recorded.</p>' + footOut);
    }
    return '<style>' + RPT_PRINT_CSS + '</style>' +
      '<div class="rpt-page" style="font-size:' + rptBase + 'px">' + bodyHtml + '</div>';
  }

  /* ---------- QR-coded report PDF upload ---------- */
  // The printed report carries a QR code that opens the report PDF on a phone.
  // The PDF is uploaded once per invoice (stable key), then the URL is reused.

  function rand6() {
    var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', i;
    for (i = 0; i < 6; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }

  /* A custom header / footer (Lab Profile) is HTML, so for the PDF it is drawn to a picture (SVG foreignObject -> canvas) and
     placed on the page; this keeps the PDF identical to the printout. Resolves null if the browser cannot do it (the PDF then
     falls back to the automatic header / footer). */
  function realHtml(h) { return !!h && String(h).replace(/<[^>]*>/g, '').trim().length > 1; }
  function htmlToPng(inner, wPx, basePx) {
    return new Promise(function (resolve) {
      var fr = null;
      function done(v) { try { if (fr && fr.parentNode) fr.parentNode.removeChild(fr); } catch (e) {} resolve(v); }
      try {
        /* measured in a bare frame (no app stylesheet), because the picture is rendered without one too */
        fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + wPx + 'px;height:20px;border:0;visibility:hidden';
        document.body.appendChild(fr);
        var dd = fr.contentDocument; dd.open();
        dd.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="h" style="display:flow-root;width:' + wPx + 'px;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:' + basePx + 'px;line-height:1.3">' + inner + '</div></body></html>');
        dd.close();
        var host = dd.getElementById('h');
        var hPx = Math.ceil(host.getBoundingClientRect().height) + 4;
        if (!hPx || hPx < 6) return done(null);
        var xhtml = new XMLSerializer().serializeToString(host);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + wPx + '" height="' + hPx + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
        var img = new Image(), sc = 2.5, to = setTimeout(function () { done(null); }, 8000);
        img.onload = function () {
          clearTimeout(to);
          try {
            var cv = document.createElement('canvas'); cv.width = Math.round(wPx * sc); cv.height = Math.round(hPx * sc);
            var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
            done({ url: cv.toDataURL('image/png'), ratio: hPx / wPx });
          } catch (e) { done(null); }
        };
        img.onerror = function () { clearTimeout(to); done(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (e) { done(null); }
    });
  }
  function customPdfParts(invoiceId, qrDataUrl) {
    var d = null; try { d = reportData(invoiceId); } catch (e) {}
    if (!d) return Promise.resolve({});
    var s = d.s || {}, hasH = realHtml(s.headerHtml), hasF = realHtml(s.footerHtml);
    if (!hasH && !hasF) return Promise.resolve({});
    var base = Math.round(12.5 * (RPT.setScale(s.reportFontSize || 'medium') || 1) * 10) / 10;
    function prep(h) {
      var f = fillTokens(h, d);
      return qrDataUrl ? f.replace(/data-qr="1"/g, 'src="' + qrDataUrl + '"') : f.replace(/<img[^>]*data-qr="1"[^>]*>/g, '');
    }
    var CWpx = Math.round((210 - 24) / 25.4 * 96);
    return Promise.all([
      hasH ? htmlToPng(prep(s.headerHtml), CWpx, base) : null,
      hasF ? htmlToPng(prep(s.footerHtml), CWpx, base) : null
    ]).then(function (r) { return { hdr: r[0] || null, ftr: r[1] || null }; }, function () { return {}; });
  }

  // Build the report PDF, upload it to the cloud API, return the public URL (or null).
  function getReportPdfUrl(invoiceId, force) {
    var inv = invOf(invoiceId);
    if (!inv) return Promise.resolve(null);
    // QR goes live only when the invoice is fully paid; unpaid reports print without a live QR
    // (force = the Android app, which opens the PDF viewer instead of printing)
    if (inv.status !== 'paid' && !force) return Promise.resolve(null);
    var key = inv.reportPdfKey || ('rpt-' + invoiceId + '-' + rand6());
    /* the PDF carries its own QR (this same link) in the header, like the printout; on the desktop app the cloud address is only known after the upload, so there the QR is left out of the PDF */
    var selfQr = null;
    try {
      var qb = String(window.LABPOS_API || '').replace(/\/+$/, '');
      if (qb && !(window.labposDesktop && window.labposDesktop.isDesktop)) selfQr = qrDataUrlFor(qb + '/r/' + key);
    } catch (e) { selfQr = null; }
    return customPdfParts(invoiceId, selfQr).catch(function () { return {}; }).then(function (pre) {
    var pdf = null;
    try { pdf = buildReportPdf(invoiceId, selfQr, pre); } catch (e) { pdf = null; }
    if (!pdf || !pdf.dataUri) return null;
    var rawUri = String(pdf.dataUri);
    var b64 = rawUri.slice(rawUri.indexOf(',') + 1); // strip data:...;base64, prefix (jsPDF adds filename=)
    var base = 'https://labpos-api.150.230.52.29.sslip.io';
    try { if (window.LABPOS_API) base = window.LABPOS_API; } catch (e) {}
    return fetch(base + '/api/report-pdfs', {
      method: 'POST',
      headers: (DB.authHeaders ? DB.authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key: key, pdfBase64: b64 })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.url) {
          try { DB.update('invoices', invoiceId, { reportPdfKey: key }); } catch (e) {}
          return j.url;
        }
        return null;
      })
      .catch(function () { return null; });
    });
  }
  App.getReportPdfUrl = getReportPdfUrl;
  App.barcodeHtml = barcodeHtml;   /* the invoice print draws the same barcodes */

  function qrDataUrlFor(url) {
    try {
      if (!url || typeof qrcode === 'undefined') return null;
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(4, 4);
    } catch (e) { return null; }
  }

  /* the preview shows the same QR the printout carries: the report's cloud link when it exists, otherwise the invoice link */
  function previewQr(html, invoiceId) {
    try {
      var inv = invOf(invoiceId) || {}, base = '';
      try { base = String(window.LABPOS_API || '').replace(/\/+$/, ''); } catch (e) {}
      var url = (inv.reportPdfKey && base && !(App.isNative && App.isNative()) && !(window.labposDesktop && window.labposDesktop.isDesktop)) ? base + '/r/' + inv.reportPdfKey : 'https://optix-lab-medsync.pages.dev/app/#/invoice/' + invoiceId;
      var img = qrDataUrlFor(url);
      return img ? String(html).replace('data-qr="1"', 'data-qr="1" src="' + img + '"') : stripQrImg(html);
    } catch (e) { return stripQrImg(html); }
  }
  function stripQrImg(html) {
    var h = String(html);
    // The data-qr-wrap block contains no nested <div> (the caption is a
    // <span>), so the first </div> the non-greedy match hits is the
    // wrapper's own closing tag — this removes the QR *and* its
    // "Scan to verify" caption, so a report whose QR generation failed
    // never shows a dangling caption.
    h = h.replace(/<div[^>]*\bdata-qr-wrap\b[^>]*>[\s\S]*?<\/div>/, '');
    // Fallback: strip a bare QR img if the wrapper is ever absent.
    h = h.replace(/<img[^>]*data-qr="1"[^>]*>/, '');
    return h;
  }

  async function printReport(invoiceId, opts) {
    var d = reportData(invoiceId, { compareIds: opts && opts.compareIds });
    if (!d) { App.toast('No ready results to print', 'err'); return; }
    var invPaid = d.inv && d.inv.status === 'paid';
    var qrImg = null;
    /* Android app: no popups/printing in a WebView -> open the report in the phone browser (cloud viewer: print, share, download) */
    if (App.isNative && App.isNative()) {
      try {
        if (await App.ensureJsPDF()) {
          var nurl = await getReportPdfUrl(invoiceId, true);
          if (nurl) { location.href = nurl; return; }
        }
      } catch (e) {}
      App.toast('Could not open the report. Check your internet connection.', 'err');
      return;
    }
    try {
      var jsOk = await App.ensureJsPDF();
      if (jsOk) {
        var url = await getReportPdfUrl(invoiceId);
        /* fallback: if backend upload fails or invoice unpaid, generate QR with invoice reference */
        if (!url) url = 'https://optix-lab-medsync.pages.dev/app/#/invoice/' + invoiceId;
        qrImg = qrDataUrlFor(url);
      }
    } catch (e) { qrImg = null; }
    var html = reportHtml(d, opts);
    if (qrImg) html = html.replace('data-qr="1"', 'data-qr="1" src="' + qrImg + '"');
    else html = stripQrImg(html);
    App.print('Lab Report — ' + d.inv.no, html, { noHeader: true });
  }

  /* print choice dialog: with or without the lab letterhead header */
  function printReportChoice(invoiceId) {
    /* previous reports of this patient: choose up to 2 to show beside the new result (old = plain, new = colour-coded) */
    var prevList = [];
    try {
      var curInv = invOf(invoiceId);
      if (curInv && curInv.patientId) {
        prevList = DB.all('invoices').filter(function (inv) {
          return inv.patientId === curInv.patientId && inv.id !== invoiceId &&
            joinedRows('ready').some(function (r) { return r.invoice.id === inv.id; });
        }).sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      }
    } catch (e) {}
    var cmpHtml = '';
    if (prevList.length) {
      cmpHtml = '<div style="margin-top:14px;border:1px solid var(--bd);border-radius:10px;padding:10px;max-height:190px;overflow:auto">' +
        '<div style="font-weight:700;margin-bottom:2px">Show previous result beside the new one</div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:6px">Optional (max 2). New abnormal values are coloured with &uarr;/&darr; to help read the change.</div>';
      prevList.forEach(function (p) {
        cmpHtml += '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-top:1px solid var(--line)">' +
          '<input type="checkbox" class="prCmpSel" value="' + App.esc(p.id) + '" style="width:16px;height:16px"> ' +
          '<span><strong>' + App.esc(p.no || p.id) + '</strong> <span class="muted">' + App.esc(App.d(p.createdAt)) + '</span></span></label>';
      });
      cmpHtml += '</div>';
    }
    App.modal('Print Report',
      '<p style="margin-bottom:16px">Print this report with or without the lab header?</p>' +
      '<div style="display:flex;gap:12px">' +
      '<button class="btn btn-primary" id="prWithHead" style="flex:1;padding:14px">With Header</button>' +
      '<button class="btn btn-ghost" id="prNoHead" style="flex:1;padding:14px">Without Header</button>' +
      '</div>' + cmpHtml +
      '<p class="muted" style="margin-top:12px;font-size:12px;margin-bottom:0">Use "Without Header" when printing on pre-printed letterhead paper.</p>',
      { onOpen: function (ov, close) {
          function sels() { var o = []; ov.querySelectorAll('.prCmpSel:checked').forEach(function (c) { o.push(c.value); }); return o.slice(0, 2); }
          ov.querySelectorAll('.prCmpSel').forEach(function (c) {
            c.addEventListener('change', function () { if (ov.querySelectorAll('.prCmpSel:checked').length > 2) { c.checked = false; App.toast('You can show at most 2 previous reports.', 'err'); } });
          });
          ov.querySelector('#prWithHead').addEventListener('click', function () { var ids = sels(); close(); printReport(invoiceId, { compareIds: ids }); });
          ov.querySelector('#prNoHead').addEventListener('click', function () { var ids = sels(); close(); printReport(invoiceId, { noLabHeader: true, compareIds: ids }); });
        }
      });
  }

  /* print current + previous report with auto-comparison on one page */
  async function printWithComparison(newInvId, oldInvId, opts) {
    var dNew = reportData(newInvId), dOld = reportData(oldInvId);
    if (!dNew || !dOld) { App.toast('Could not load both reports', 'err'); return; }
    /* generate comparison table HTML */
    var cmpHtml = buildComparisonTable(dOld, dNew);
    /* full new report + comparison on one page */
    var qrImg = null;
    try {
      var jsOk = await App.ensureJsPDF();
      if (jsOk) {
        var url = await getReportPdfUrl(newInvId);
        if (!url) url = 'https://optix-lab-medsync.pages.dev/app/#/invoice/' + newInvId;
        qrImg = qrDataUrlFor(url);
      }
    } catch (e) {}
    var html = reportHtml(dNew, opts);
    if (qrImg) html = html.replace('data-qr="1"', 'data-qr="1" src="' + qrImg + '"');
    else html = stripQrImg(html);
    html += '<div style="page-break-before:always"></div>' + cmpHtml;
    App.print('Lab Report with Comparison — ' + dNew.inv.no, html, { noHeader: true });
  }

  /* build comparison table HTML from two report datasets (old vs new) */
  function buildComparisonTable(dOld, dNew) {
    function indexResults(d) {
      var map = {};
      (d.readyRows || []).forEach(function (r) {
        var tid = (r.item && (r.item.testId || r.item.id)) || '';
        var tname = (r.item && r.item.name) || (r.test && r.test.name) || tid;
        var params = (r.test && r.test.params) || [];
        var vals = (r.res && r.res.values) || {};
        if (!map[tid]) map[tid] = { name: tname, params: {} };
        params.forEach(function (p) {
          map[tid].params[p.name] = { val: vals[p.name] || '—', unit: p.unit || '', ref: p.ref || '' };
        });
      });
      return map;
    }
    var mOld = indexResults(dOld), mNew = indexResults(dNew);
    var allTids = [];
    Object.keys(mOld).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });
    Object.keys(mNew).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });
    function numVal(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
    var rowsHtml = '';
    allTids.forEach(function (tid) {
      var tO = mOld[tid], tN = mNew[tid];
      var tname = (tN && tN.name) || (tO && tO.name) || tid;
      rowsHtml += '<tr><td colspan="5" style="background:#eef;font-weight:800;padding:8px">' + App.esc(tname) + '</td></tr>';
      var pnames = [];
      [tO, tN].forEach(function (t) {
        if (t) Object.keys(t.params).forEach(function (pn) { if (pnames.indexOf(pn) < 0) pnames.push(pn); });
      });
      pnames.forEach(function (pn) {
        var pO = tO && tO.params[pn], pN = tN && tN.params[pn];
        var vO = pO ? pO.val : '—', vN = pN ? pN.val : '—';
        var ref = (pN && pN.ref) || (pO && pO.ref) || '', unit = (pN && pN.unit) || (pO && pO.unit) || '';
        var changed = vO !== vN && vO !== '—' && vN !== '—';
        var vs = changed ? ' style="color:#c00;font-weight:800"' : '';
        var nO = numVal(vO), nN = numVal(vN), trend = '';
        if (changed && nO !== null && nN !== null) trend = nN > nO ? ' ↑' : (nN < nO ? ' ↓' : ' =');
        rowsHtml += '<tr' + (changed ? ' style="background:#fff8e1"' : '') + '>' +
          '<td>' + App.esc(pn) + '</td><td class="muted">' + App.esc(ref) + '</td>' +
          '<td class="muted">' + App.esc(unit) + '</td>' +
          '<td' + vs + '><strong>' + App.esc(vO) + '</strong></td>' +
          '<td' + vs + '><strong>' + App.esc(vN) + '</strong>' + trend + '</td></tr>';
      });
    });
    return '<div style="font-family:inherit">' +
      '<h2 style="text-align:center">Report Comparison</h2>' +
      '<p style="text-align:center" class="muted">' + App.esc(dNew.pat.name || '') + '</p>' +
      '<table class="table"><thead><tr><th>Parameter</th><th>Normal Value</th><th>Unit</th>' +
      '<th>Previous<br><span class="muted">' + App.esc(rptCaseText(dOld.inv)) + ' (' + App.d(dOld.inv.createdAt) + ')</span></th>' +
      '<th>Current<br><span class="muted">' + App.esc(rptCaseText(dNew.inv)) + ' (' + App.d(dNew.inv.createdAt) + ')</span></th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // Report preview modal with Print + Share on WhatsApp actions
  function viewReport(invoiceId) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results to view', 'err'); return; }
    /* manual WhatsApp sends: patient button always shown; doctor button only
       when the invoice has a referring doctor — disabled with a tooltip when
       the doctor has no WhatsApp number on file */
    var docWaBtn = '';
    if (d.doc) {
      var docPh = waPhone(d.doc.whatsapp || d.doc.phone);
      docWaBtn = docPh
        ? '<button class="btn btn-ghost" id="rvWaDoctor">' + WA_ICON + ' Send to Doctor (WhatsApp)</button>'
        : '<button class="btn btn-ghost" id="rvWaDoctor" disabled title="No WhatsApp number on file" style="opacity:.45;cursor:not-allowed">' + WA_ICON + ' Send to Doctor (WhatsApp)</button>';
    }
    var close = App.modal('Lab Report — ' + App.esc(d.inv.no),
      '<div class="report-preview" style="max-height:66vh;overflow:auto;border-radius:12px;padding:18px;background:#525659">' +
        previewQr(reportHtml(d), invoiceId) +
      '</div>' +
      '<div id="rvWaHist" style="margin-top:12px">' + waHistoryHtml(invoiceId) + '</div>' +
      '<div id="rvAuto" style="margin-top:10px;font-size:13px;color:var(--muted)"></div>' +
      '<div class="actions" style="margin-top:12px;flex-wrap:wrap;justify-content:flex-end;gap:8px">' +
        '<button class="btn btn-ghost" id="rvClose">Close</button>' +
        '<button class="btn btn-ghost" id="rvWaPatient">' + WA_ICON + ' Send to Patient (WhatsApp)</button>' +
        docWaBtn +
        '<span id="rvShare" style="display:contents"></span>' +
        '<button class="btn btn-primary" id="rvPrint">' + PRINT_ICON + ' Print Report <span style="opacity:.7;font-weight:500;font-size:11px;margin-left:4px">Ctrl+P</span></button>' +
      '</div>',
      { wide: true, onOpen: function (ov, close) {
          document.getElementById('rvClose').addEventListener('click', close);
          document.getElementById('rvPrint').addEventListener('click', function () { close(); printReportChoice(invoiceId); });
          shareStatus().then(function (st) { /* Email / Slack buttons appear only when the server can send them */
            var slot = document.getElementById('rvShare'); if (!slot || !document.body.contains(ov)) return;
            var h = '', off = st.email ? '' : ' disabled title="Email sending is not set up on this server yet" style="opacity:.5;cursor:not-allowed"';
            if (shareOn()) h += '<button class="btn btn-ghost" id="rvEmPat"' + off + '>&#9993; Email Patient</button>' + (d.doc ? '<button class="btn btn-ghost" id="rvEmDoc"' + off + '>&#9993; Email Doctor</button>' : '');
            if (st.slack) h += '<button class="btn btn-ghost" id="rvSlack">Send to Slack</button>';
            slot.innerHTML = h;
            var auto = document.getElementById('rvAuto');
            if (auto && shareOn() && st.email) {
              var S0 = {}; try { S0 = DB.get('settings', 'main') || {}; } catch (e) {}
              auto.innerHTML = '<label style="display:inline-flex;gap:6px;align-items:center;margin-right:18px"><input type="checkbox" id="rvAutoPat"' + (S0.emailAuto ? ' checked' : '') + '> Email every report to the patient automatically when it is ready</label>' +
                (d.doc ? '<label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="rvAutoDoc"' + (S0.emailAutoDoctor ? ' checked' : '') + '> and to the doctor</label>' : '');
              var a1 = document.getElementById('rvAutoPat'), a2 = document.getElementById('rvAutoDoc');
              if (a1) a1.addEventListener('change', function () { try { DB.update('settings', 'main', { emailAuto: a1.checked }); App.toast(a1.checked ? 'Reports will be emailed to patients automatically (when they have an email on file)' : 'Automatic email to patients is off'); } catch (e) {} });
              if (a2) a2.addEventListener('change', function () { try { DB.update('settings', 'main', { emailAutoDoctor: a2.checked }); App.toast(a2.checked ? 'Reports will also be emailed to the referring doctor (when they have an email on file)' : 'Automatic email to doctors is off'); } catch (e) {} });
            }
            var b1 = document.getElementById('rvEmPat'); if (b1) b1.addEventListener('click', function () { emailReport(invoiceId, 'patient'); });
            var b2 = document.getElementById('rvEmDoc'); if (b2) b2.addEventListener('click', function () { emailReport(invoiceId, 'doctor'); });
            var b3 = document.getElementById('rvSlack'); if (b3) b3.addEventListener('click', function () { slackSend(invoiceId); });
          });
          /* Ctrl+P / Cmd+P while the report is open prints this report (with the lab header) instead of the browser printing the whole page */
          function rvKey(e) {
            if (!document.body.contains(ov)) { document.removeEventListener('keydown', rvKey, true); return; }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key || '').toLowerCase() === 'p') {
              e.preventDefault(); e.stopPropagation();
              document.removeEventListener('keydown', rvKey, true);
              close(); printReport(invoiceId);
            }
          }
          document.addEventListener('keydown', rvKey, true);
          document.getElementById('rvWaPatient').addEventListener('click', function () { waManualSend(invoiceId, 'patient'); });
          var wdoc = document.getElementById('rvWaDoctor');
          if (wdoc && !wdoc.disabled) wdoc.addEventListener('click', function () { waManualSend(invoiceId, 'doctor'); });
        }
      });
  }

  /* ---------- report PDF builder (jsPDF) ---------- */

  // Returns { dataUri } or null (error toasted).
  // qrDataUrl (optional): QR image data URL embedded in the header.
  function buildReportPdf(invoiceId, qrDataUrl, pre) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results for PDF', 'err'); return null; }
    var JSPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JSPDF) { App.toast('PDF engine not loaded — check connection and reload', 'err'); return null; }

    var s = d.s, inv = d.inv, pat = d.pat;
    var doc = new JSPDF({ unit: 'mm', format: 'a4' });
    var W = 210, M = 12, CW = W - 2 * M;
    var y = M;

    var inHdr = false;
    function need(h) { if (y + h > 280) { doc.addPage(); y = M; if (!inHdr && typeof drawHeader === 'function') { inHdr = true; drawHeader(); inHdr = false; } } } /* every page starts with the letterhead + patient block */
    function txt(t, x, yy, opts) {
      // jsPDF renders a string[] as multiple lines; keep that working
      // (patient grid / wrapped footer lines pass splitTextToSize arrays).
      if (Array.isArray(t)) t = t.map(function (l) { return String(l == null ? '' : l); });
      else t = String(t == null ? '' : t);
      doc.text(t, x, yy, opts || {});
    }
    function dash(v) { return (v == null || v === '') ? '—' : String(v); }
    function addImg(dataUrl, x, yy, w, h) {
      try {
        var fmt = /image\/png/i.test(dataUrl) ? 'PNG' : (/image\/gif/i.test(dataUrl) ? 'GIF' : 'JPEG');
        doc.addImage(dataUrl, fmt, x, yy, w, h);
        return true;
      } catch (e) { return false; }
    }

    /* ----- header: logo + lab (left), patient/case nos + QR (right) ----- */

    // Accent hex -> RGB (default navy #1B1B6E); accepts "#rrggbb" or "rrggbb".
    function hdrAccentRgb(hex) {
      var raw = String(hex || '').trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$/.test(raw)) raw = raw.split('').map(function (c) { return c + c; }).join('');
      if (!/^[0-9a-fA-F]{6}$/.test(raw)) raw = '1B1B6E';
      var v = parseInt(raw, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var A = hdrAccentRgb(s.accent);
    var showQr = s.showQr !== false && !!qrDataUrl;
    var showTagline = s.showTagline !== false && !!s.tagline;

    var qrS = 26;                                  // QR size (mm)
    var headH = showQr ? qrS : 23;                 // header block height

    function drawHeader() {
      if (pre && pre.hdr) {   /* custom header from Lab Profile, drawn as a picture (same as the printout) */
        var chH = CW * pre.hdr.ratio;
        addImg(pre.hdr.url, M, y, CW, chH);
        y += chH + 3;
        drawPatientGrid();
        return;
      }
      // --- left: logo (~18mm) + lab name + subtitle ---
      if (s.logo) addImg(s.logo, M, y, 18, 18);
      var htx = M + (s.logo ? 22 : 0);
      doc.setFont('times', 'bold'); doc.setFontSize(18);
      var NC = s.labNameColor ? hdrAccentRgb(s.labNameColor) : A; /* the lab-name colour from Lab Profile (default: the accent colour) */
      doc.setTextColor(NC[0], NC[1], NC[2]);
      txt(s.labName || 'Optix Medical Sync', htx, y + 9);
      if (showTagline) {
        doc.setFont('times', 'italic'); doc.setFontSize(11);
        doc.setTextColor(A[0], A[1], A[2]);
        txt(s.tagline, htx, y + 15.5);
      }

      // --- right: Patient No. / Case # right-aligned with wide letter spacing ---
      var hnx = W - M - (showQr ? qrS + 15 : 0);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      var vnp = App.visitNos(inv);
      txt('Inv #:', hnx, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      txt(vnp.labText.replace('INV # ', ''), hnx, y + 10, { align: 'right', charSpace: 0.6 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      txt(vnp.caseText.replace('P # ', ''), hnx, y + 17, { align: 'right', charSpace: 0.6 });

      // --- QR 26mm at far right ---
      if (showQr) addImg(qrDataUrl, W - M - qrS, y, qrS, qrS);

      y += headH + 2;

      // --- plain header text from Lab Profile ("Header text"), centred under the header ---
      if (String(s.headerText || '').trim()) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
        var htLines = doc.splitTextToSize(String(s.headerText).trim(), CW);
        txt(htLines, W / 2, y + 2, { align: 'center' });
        y += htLines.length * 4.1 + 3;
      }

      // --- optional report banner (only when s.reportTitle is set) ---
      if (s.reportTitle) {
        doc.setFillColor(A[0], A[1], A[2]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
        doc.rect(M, y, CW, 8, 'F');
        txt(s.reportTitle, M + CW / 2, y + 5.6, { align: 'center' });
        y += 8 + 2;
      }

      // --- navy divider line; y now sits below the header ---
      doc.setDrawColor(A[0], A[1], A[2]); doc.setLineWidth(0.6);
      doc.line(M, y, W - M, y);
      y += 5;

      drawPatientGrid();
    }
    function drawPatientGrid() {
      /* ----- patient info: 2-column grid (ref: Chughtai report) ----- */
      (function () {
        var pat = d.pat || {}, inv = d.inv || {}, s = d.s || {};
        var docName = d.doc ? d.doc.name : '';

        // Reference label set + order. Registration Location = lab head office,
        // Destination Location = main lab (same mapping as reportHtml).
        var hr = reportHeaderRows(d), left = hr.left, right = hr.right;

        var COL_W   = CW / 2;            // 93 mm per column
        var VAL_OFF = 44;               // label -> value offset (matches reference)
        var WRAP_W  = COL_W - VAL_OFF - 2; // value wrap width (~47 mm)
        var LH      = 4.6;              // line height
        var ROW_PAD = 2.4;              // breathing room between rows

        doc.setFontSize(9);
        var rows = Math.max(left.length, right.length);
        for (var i = 0; i < rows; i++) {
          var lLines = left[i]  ? doc.splitTextToSize(String(left[i][1] || ' '),  WRAP_W) : [''];
          var rLines = right[i] ? doc.splitTextToSize(String(right[i][1] || ' '), WRAP_W) : [''];
          var rh = Math.max(lLines.length, rLines.length) * LH + ROW_PAD;
          need(rh);

          if (left[i]) {
            doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
            txt(left[i][0] + ':', M, y);
            doc.setFont('helvetica', 'normal');
            txt(lLines, M + VAL_OFF, y);
          }
          if (right[i]) {
            var rx = M + COL_W;
            doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
            txt(right[i][0] + ':', rx, y);
            doc.setFont('helvetica', 'normal');
            txt(rLines, rx + VAL_OFF, y);
          }
          y += rh;
        }

        /* thin divider rule below the grid (ref: light-grey full-width rule) */
        y += 1.5;
        need(4);
        doc.setDrawColor(160, 160, 160);
        doc.setLineWidth(0.3);
        doc.line(M, y, W - M, y);
        y += 5;
      })();
    }
    drawHeader();

    /* ----- test tables: section title + RESULT box, grey bar, rows ----- */
    (function () {
      var s = d.s || {}, inv = d.inv || {};

      // ---- geometry ----
      var RBW  = 30;                // RESULT box width (~30mm per reference)
      var GREY = [169, 169, 169];   // #A9A9A9 header fill
      var INK  = [20, 20, 20];
      var RED  = [220, 38, 38];     // abnormal high
      var BLUE = [37, 99, 235];     // abnormal low
      var CX_TEST = M + 2;          // param name column
      var CX_REF  = M + 55;         // NORMAL VALUE column
      var CX_UNIT = M + 84;         // UNIT column
      var RX      = W - M - 2;      // right-aligned result value x
      var LINE    = 4.6;            // row line height

      var showBc = (s.showBarcode !== false);   // default true
      var BOX_H  = showBc ? 20 : 13.5;

      // ---- "15-Jun-2026 14:56" style timestamp ----
      var MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      function fmtTs(v) {
        var dt = new Date(v);
        if (!v || isNaN(dt.getTime())) return '';
        return p2(dt.getDate()) + '-' + MONS[dt.getMonth()] + '-' + dt.getFullYear() +
               ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes());
      }

      // ---- inline abnormal check: "low - high" refs, also "<x" / ">x" style ----
      // Returns -1 (low), 1 (high), 0 (normal / not parseable).
      function rangeFlag(ref, valStr) {
        var v = parseFloat(String(valStr == null ? '' : valStr).replace(/,/g, '').trim()); /* "7,600" -> 7600 */
        if (isNaN(v)) return 0;
        var rs = String(ref == null ? '' : ref).replace(/,/g, '');
        var m = rs.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to|\u2013)\s*(-?\d+(?:\.\d+)?)/i);
        if (m) {
          var lo = parseFloat(m[1]), hi = parseFloat(m[2]);
          if (v < lo) return -1;
          if (v > hi) return 1;
          return 0;
        }
        var m2 = rs.match(/(<=|<|>=|>)\s*(-?\d+(?:\.\d+)?)/);
        if (m2) {
          var b = parseFloat(m2[2]), op = m2[1];
          if ((op === '<' && v >= b) || (op === '<=' && v > b)) return 1;
          if ((op === '>' && v <= b) || (op === '>=' && v < b)) return -1;
          return 0;
        }
        return 0;
      }

      // ---- pseudo-barcode: thin vertical rects derived from the case # chars ----
      function drawBarcode(bx, byy, bw, bh, seed) {
        var str = String(seed == null || seed === '' ? '0000' : seed);
        var bars = [], total = 0, i, c, w, g;
        for (i = 0; i < str.length; i++) {
          c = str.charCodeAt(i);
          w = 0.35 + (((c * 7 + i * 13) % 5) * 0.16);   // 0.35 - 0.99
          g = 0.30 + (((c * 3 + i * 11) % 3) * 0.20);   // 0.30 - 0.70
          bars.push({ w: w, g: g });
          total += w + g;
        }
        var scale = Math.min(1, (bw - 4) / total);
        var x = bx + bw / 2 - (total * scale) / 2;
        doc.setFillColor(INK[0], INK[1], INK[2]);
        for (i = 0; i < bars.length; i++) {
          doc.rect(x, byy, bars[i].w * scale, bh, 'F');
          x += (bars[i].w + bars[i].g) * scale;
        }
      }

      // ---- sub-reference lines for "(See Below)" style params ----
      // Supports p.refLines (array of strings), p.subRefs ([{label,ref}] or
      // strings), or p.refNote (newline-separated string).
      function subRefLines(p) {
        if (p.refLines && p.refLines.length) return p.refLines;
        if (p.subRefs && p.subRefs.length) return p.subRefs.map(function (sr) {
          return typeof sr === 'string' ? sr : ((sr.label ? sr.label + ': ' : '') + (sr.ref || ''));
        });
        if (p.refNote) return String(p.refNote).split(/\n+/).filter(function (l) { return l.trim(); });
        return null;
      }

      // ---- the RESULT box (top-right of each section) ----
      function resultBox(bx, byy, patCode, patText, ddmm) {
        var cx = bx + RBW / 2, yy = byy + 5.5;
        doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.4);
        doc.rect(bx, byy, RBW, BOX_H);                       // outer border
        doc.setFillColor(GREY[0], GREY[1], GREY[2]);
        doc.rect(bx, byy, RBW, 5.5, 'F');                    // grey RESULT strip
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        txt('RESULT', cx, byy + 3.9, { align: 'center' });
        if (showBc) {
          drawBarcode(bx, yy + 1, RBW, 6.5, patCode);
          yy += 8.5;
        } else {
          yy += 1.5;
        }
        if (ddmm) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
          doc.setTextColor(60, 60, 60);
          txt(ddmm, cx, yy + 3.5, { align: 'center' });
        }
      }

      // ---- grey header bar: TEST | NORMAL VALUE | UNIT ----
      function tableHead() {
        need(9);
        doc.setFillColor(GREY[0], GREY[1], GREY[2]);
        doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.35);
        doc.rect(M, y, CW, 7, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        txt('TEST', CX_TEST, y + 4.8);
        txt('NORMAL VALUE', CX_REF, y + 4.8);
        txt('UNIT', CX_UNIT, y + 4.8);
        y += 7;
      }

      // ---- build one param row (lines pre-wrapped, height pre-computed) ----
      function buildRow(p, vals) {
        var valStr = vals[p.name] != null ? String(vals[p.name]) : '';
        var refStr = refFor(p, d.pat) || '—';
        var nameW = CX_REF - CX_TEST - 2;
        var refW  = CX_UNIT - CX_REF - 2;
        var unitW = RX - 36 - CX_UNIT - 2;   // keep clear of right-aligned value
        var nameL = doc.splitTextToSize(p.name || '', Math.max(10, nameW));
        var refL  = doc.splitTextToSize(refStr, Math.max(10, refW));
        var unitL = doc.splitTextToSize(p.unit || '—', Math.max(10, unitW));
        var valL  = valStr ? doc.splitTextToSize(valStr, 34) : [''];
        var n = Math.max(nameL.length, refL.length, unitL.length, valL.length);
        var subs = null, sl = subRefLines(p);
        if (sl) {
          subs = [];
          sl.forEach(function (s) {
            doc.splitTextToSize(s, CW - 6).forEach(function (l) { subs.push(l); });
          });
          if (!subs.length) subs = null;
        }
        var rf = rangeFlag(refStr, valStr);
        var dir = rf === 1 ? 'high' : (rf === -1 ? 'low' : null);
        if (!dir) {
          var sev = abnormalSeverity(valStr, refStr);
          if (sev) dir = sev.dir;
        }
        return {
          name: nameL, ref: refL, unit: unitL, val: valL, subs: subs,
          dir: dir,
          rh: n * LINE + 2.5
        };
      }

      // ---- draw one param row: bold name | ref | unit | right-aligned value ----
      // No gridlines. Abnormal values are bold red (high) with up triangle or blue (low) with down triangle.
      function tableRow(row) {
        need(row.rh);
        var li;
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        for (li = 0; li < row.name.length; li++) txt(row.name[li], CX_TEST, y + LINE + li * LINE);
        doc.setFont('helvetica', 'normal');
        for (li = 0; li < row.ref.length; li++) txt(row.ref[li], CX_REF, y + LINE + li * LINE);
        for (li = 0; li < row.unit.length; li++) txt(row.unit[li], CX_UNIT, y + LINE + li * LINE);
        if (row.dir === 'high') { doc.setFont('helvetica', 'bold'); doc.setTextColor(RED[0], RED[1], RED[2]); }
        else if (row.dir === 'low') { doc.setFont('helvetica', 'bold'); doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]); }
        else { doc.setFont('helvetica', 'bold'); doc.setTextColor(INK[0], INK[1], INK[2]); }
        for (li = 0; li < row.val.length; li++) {
          if (row.dir && li === 0 && row.val[li]) {
            txt(row.val[li], RX - 3.5, y + LINE + li * LINE, { align: 'right' });
            var arrowCol = row.dir === 'high' ? RED : BLUE;
            doc.setFillColor(arrowCol[0], arrowCol[1], arrowCol[2]);
            doc.setDrawColor(arrowCol[0], arrowCol[1], arrowCol[2]);
            var baseY = y + LINE + li * LINE;
            var triMidY = baseY - 1.1;
            if (row.dir === 'high') {
              // Up triangle (▲)
              doc.triangle(RX - 2.6, triMidY + 1.2, RX, triMidY + 1.2, RX - 1.3, triMidY - 1.3, 'FD');
            } else {
              // Down triangle (▼)
              doc.triangle(RX - 2.6, triMidY - 1.2, RX, triMidY - 1.2, RX - 1.3, triMidY + 1.3, 'FD');
            }
          } else {
            txt(row.val[li], RX, y + LINE + li * LINE, { align: 'right' });
          }
        }
        y += row.rh;
        if (row.subs && row.subs.length) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          doc.setTextColor(INK[0], INK[1], INK[2]);
          row.subs.forEach(function (s) { txt(s, CX_TEST, y + 4.2); y += 4.2; });
          y += 1;
        }
      }

      /* ----- one section per ready row ----- */
      var caseNo = inv.no || inv.id;
      /* patient-visit numbers for the RESULT box (falls back to invoice no. if unavailable) */
      var pvn = null;
      if (inv && typeof App !== 'undefined' && App.visitNos) {
        try { pvn = App.visitNos(inv); } catch (e) { pvn = null; }
      }

      d.readyRows.forEach(function (r) {
        var test = r.test || {};
        var params = Array.isArray(test.params) ? test.params : [];
        var vals = (r.res && r.res.values) || {};

        // Section title (kept clear of the RESULT box on the right).
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
        var titleLines = doc.splitTextToSize(
          testName(r) + (testCode(r) ? ' (' + testCode(r) + ')' : ''), CW - RBW - 6);
        var titleH = titleLines.length * 6;

        // Build rows up-front so the whole section page-breaks cleanly.
        var shown = params.filter(function (p) { var v = vals[p.name]; return v != null && String(v).trim() !== ''; });
        if (!shown.length) shown = params; /* no values entered: keep blank layout */
        var rows = params.length
          ? shown.map(function (p) { return buildRow(p, vals); })
          : [buildRow({ name: 'Result', ref: '', unit: '' },
                      { Result: vals['Result'] != null ? String(vals['Result']) : '' })];

        var rowsH = rows.reduce(function (a, row) {
          return a + row.rh + (row.subs ? row.subs.length * 4.2 + 1 : 0);
        }, 0);

        var noteLines = null, noteH = 0;
        var tnote = test.note || test.notes || '';
        if (tnote) {
          noteLines = doc.splitTextToSize(String(tnote), CW - 4);
          noteH = 6 + noteLines.length * 4.4;
        }
        var remLines = null, remH = 0;
        if (vals['Remarks']) {
          remLines = doc.splitTextToSize('Remarks: ' + vals['Remarks'], CW - 4);
          remH = remLines.length * 4.4 + 2;
        }

        need(Math.max(titleH, BOX_H) + 2 + 7 + rowsH + noteH + remH + 6);

        // Title (left) + RESULT box (right).
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        titleLines.forEach(function (tl, i) { txt(tl, M, y + 5 + i * 6); });
        /* patient code/text/date in the RESULT box (invoice no. + timestamp as fallback) */
        var repV = (r.res && r.res.reportedAt) || d.maxReported || inv.createdAt;
        var boxCode = caseNo, boxText = dash(caseNo), boxDate = fmtTs(repV);
        if (pvn && pvn.caseCode) {
          boxCode = pvn.caseCode;
          boxText = String(pvn.caseText || '').split(' - ')[0] || String(pvn.caseText || '');
          boxDate = fmtTs(repV);
        }
        resultBox(W - M - RBW, y - 1, boxCode, boxText, boxDate);
        y += Math.max(titleH, BOX_H) + 2;

        // Grey bar + rows.
        tableHead();
        rows.forEach(tableRow);

        // Optional test-level note.
        if (noteLines) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          doc.setTextColor(INK[0], INK[1], INK[2]);
          txt('Note:', M, y + 4.5);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          doc.setTextColor(70, 70, 70);
          txt(noteLines, M, y + 8.9);
          y += noteH;
        }
        // Remarks (existing behavior).
        if (remLines) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          txt(remLines, M, y + 4.5);
          y += remH;
        }
        y += 5;
      });
    })();

    if (d.pendingCount) {
      need(8);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(180, 120, 20);
      txt('Note: ' + d.pendingCount + ' test(s) from this invoice are still pending.', M, y);
      y += 7;
    }
    if (s.footerNote && s.footerNote !== 'Get well soon. Reports available on counter & phone.') {
      need(8);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      txt(doc.splitTextToSize(s.footerNote, CW), M, y);
      y += 6;
    }

    // ----- footer (same content as the HTML report): verification line, signatories, address line, NOTE, powered-by.
    // It is measured first and pinned to the bottom of the last page (a new page is added only if it cannot fit). -----
    var PH = 297, FM = M;                                   // A4 height, bottom margin
    if (pre && pre.ftr) {   /* custom footer from Lab Profile, drawn as a picture (same as the printout) */
      var cfH = CW * pre.ftr.ratio + 2;
      if (y + cfH > PH - FM) { doc.addPage(); y = M; }
      y = Math.max(y + 4, PH - FM - cfH);
      addImg(pre.ftr.url, M, y, CW, cfH - 2);
      y += cfH;
    } else {
    var fVerNote = s.verNote || s.verificationNote || 'Electronically verified report. No signatures necessary.';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    var fVerLines = doc.splitTextToSize(fVerNote, CW);
    var fSigs = (Array.isArray(s.signatories) ? s.signatories : []).filter(function (g) { return g && (g.name || g.title) && g.active !== false; });
    var fSw = fSigs.length ? CW / fSigs.length : CW;
    var fHasSigImg = s.enableSignatures !== false && fSigs.some(function (g) { return !!(g.sigImg || g.signature); });
    var fSigImgH = fHasSigImg ? 9 : 0;
    var fSigBlockH = 0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    var fSigNameLines = fSigs.map(function (g) { return doc.splitTextToSize(g.name || '', fSw - 3); });
    fSigs.forEach(function (g, k) {
      var h = fSigImgH + fSigNameLines[k].length * 4.1 + (g.qual ? 3.9 : 0) + (g.title ? 3.9 : 0);
      if (h > fSigBlockH) fSigBlockH = h;
    });
    var fAddrParts = [];
    if (s.address) fAddrParts.push(s.address);
    if (s.headOffice) fAddrParts.push('Head Office: ' + s.headOffice);
    if (s.mainLab) fAddrParts.push('Previous Lab: ' + s.mainLab);
    if (s.phone) fAddrParts.push('Phone: ' + s.phone);
    if (s.callCenter) fAddrParts.push('Call Center: ' + s.callCenter);
    if (s.website) fAddrParts.push('Web: ' + s.website);
    if (s.email) fAddrParts.push('Email: ' + s.email);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    var fAddrLines = fAddrParts.length ? doc.splitTextToSize(fAddrParts.join(' | '), CW) : [];
    var fNote = s.disclaimer || ((s.footerNote && s.footerNote !== 'Get well soon. Reports available on counter & phone.') ? s.footerNote : '') || DEFAULT_DISCLAIMER;
    doc.setFontSize(6.6);
    var fNoteLines = doc.splitTextToSize(fNote, CW);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    var fTextLines = String(s.footerText || '').trim() ? doc.splitTextToSize(String(s.footerText).trim(), CW) : [];
    var fTextH = fTextLines.length ? fTextLines.length * 4.2 + 3 : 0;
    var fH = fTextH + fVerLines.length * 4.4 + 3 + 1 + 4 + fSigBlockH + 4 + 1 + (fAddrLines.length ? fAddrLines.length * 4.2 + 2 : 0) + fNoteLines.length * 2.9 + 3 + 1 + 5;
    if (y + fH > PH - FM) { doc.addPage(); y = M; }
    y = Math.max(y + 4, PH - FM - fH);                      // pin to the bottom of the page

    // plain footer text from Lab Profile ("Footer text"), above the verification line
    if (fTextLines.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
      txt(fTextLines, W / 2, y + 3, { align: 'center' });
      y += fTextH;
    }
    // verification line (bold, centered)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
    txt(fVerLines, W / 2, y + 3, { align: 'center' });
    y += fVerLines.length * 4.4 + 3;
    // rule
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 5;
    // signatories, centered columns
    fSigs.forEach(function (g, k) {
      var fCx = M + fSw * (k + 0.5), fSy = y;
      var sigImgData = (s.enableSignatures !== false) ? (g.sigImg || g.signature) : null;
      if (sigImgData) {
        try {
          doc.addImage(sigImgData, 'PNG', fCx - 13, fSy, 26, 8.5);
        } catch (e) {}
      }
      if (s.showStamps !== false && g.stampImg) {
        try {
          doc.addImage(g.stampImg, 'PNG', fCx + 10, fSy, 8, 8);
        } catch (e) {}
      }
      if (fSigImgH) fSy += fSigImgH + 1;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
      txt(fSigNameLines[k], fCx, fSy, { align: 'center' }); fSy += fSigNameLines[k].length * 4.1;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
      if (g.qual)  { txt(g.qual,  fCx, fSy, { align: 'center' }); fSy += 3.9; }
      if (g.title) { txt(g.title + (g.regNo ? ' (' + g.regNo + ')' : ''), fCx, fSy, { align: 'center' }); fSy += 3.9; }
    });
    y += fSigBlockH + 3;
    // rule + address line
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 4;
    if (fAddrLines.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
      txt(fAddrLines, W / 2, y, { align: 'center' }); y += fAddrLines.length * 4.2 + 2;
    }
    // NOTE (small)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(20, 20, 20);
    txt(fNoteLines, M, y, {}); y += fNoteLines.length * 2.9 + 2;
    doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 4;
    // powered-by
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
    txt('Powered by System Optix', W / 2, y, { align: 'center' });
    y += 4;
    }

    var dataUri;
    try { dataUri = doc.output('datauristring'); }
    catch (e) { App.toast('Could not build PDF: ' + e.message, 'err'); return null; }
    return { dataUri: dataUri };
  }

  /* ---------- dashboard-style stat cards: shared compact CSS now in app.css ---------- */

  var STAT_CSS = '';

  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var STAT_ICONS = {
    alert: svgIcon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    check: svgIcon('<path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/>'),
    cal: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    clock: svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')
  };

  var KPI_TINTS = { amber: 't-amber', green: 't-green', blue: 't-blue', red: 't-red', navy: 't-navy', brand: 't-navy', purple: 't-purple', violet: 't-purple' };
  var STAT_TINTS = {
    brand: { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#a9c9ec', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e9cb96', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#9fd8b8', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e6aaaa', soft: '#fdecec', circle: '#fad2d2' }
  };

  function statCard(icon, tint, label, value, sub) {
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:1.5px solid ' + c.line + ' !important;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
      '<div style="position:absolute;top:-30px;right:-30px;width:90px;height:90px;border-radius:50%;background:' + c.circle + ';opacity:0.65;pointer-events:none"></div>' +
      '<div class="stat-ico" style="position:relative;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:' + c.sc + ';background:linear-gradient(135deg,' + c.soft + ' 0%,#ffffff 160%);box-shadow:inset 0 0 0 1px ' + c.line + ',0 1px 3px rgba(15,30,46,.06);margin-bottom:6px;flex:0 0 auto">' + icon + '</div>' +
      '<div class="lb" style="position:relative;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;flex:0 0 auto">' + App.esc(label) + '</div>' +
      '<div class="vl" style="position:relative;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 0 4px 0;flex:0 0 auto">' + value + '</div>' +
      '<div class="dl" style="position:relative;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">' + sub + '</div>' +
      '</div>';
  }

  /* ---------- main render ---------- */

  /* warning chip: tests of this patient whose sample tube has not been collected yet (entry is still allowed unless the setting blocks it) */
  function smpWarn(rows) {
    try {
      if (!window.Samples) return '';
      var n = Samples.uncollectedCount(rows);
      if (!n) return '';
      return '<span class="smp-chip smp-c-pend" title="' + (Samples.requireCollected() ? 'Result entry is blocked until the sample is collected' : 'Sample not collected yet') + '">' +
        Samples.tubeIcon(12) + n + ' sample' + (n === 1 ? '' : 's') + ' not collected</span>';
    } catch (e) { return ''; }
  }

  function render() {
    var pendingRows = joinedRows('pending');
    var readyRows = joinedRows('ready');
    var pendingPatientGroups = [];
    var readyPatientGroups = [];

    // ---- dashboard-style stat cards (real data) ----
    var today = App.today();
    var mKey = today.slice(0, 7);
    function dayKey(d) { return String(d || '').slice(0, 10); }
    var reportedToday = readyRows.filter(function (r) { return r.res && dayKey(r.res.reportedAt) === today; }).length;
    var reportedMonth = readyRows.filter(function (r) { return r.res && dayKey(r.res.reportedAt).slice(0, 7) === mKey; }).length;
    var oldestDays = null;
    pendingRows.forEach(function (r) {
      var c = r.invoice && r.invoice.createdAt;
      if (!c) return;
      var d = Math.floor((Date.now() - new Date(c).getTime()) / 86400000);
      if (d < 0) d = 0;
      oldestDays = (oldestDays === null) ? d : Math.max(oldestDays, d);
    });
    var statsHtml = STAT_CSS +
      '<div class="pgstat"><div class="stat-grid">' +
      statCard(STAT_ICONS.alert, 'amber', 'Pending Results', pendingRows.length, 'awaiting entry') +
      statCard(STAT_ICONS.check, 'green', 'Reported Today', reportedToday, 'results completed') +
      statCard(STAT_ICONS.cal, 'blue', 'Reported This Month', reportedMonth, 'this month') +
      statCard(STAT_ICONS.clock, 'brand', 'Oldest Pending', oldestDays === null ? '—' : oldestDays, oldestDays === null ? 'no pending' : 'days old') +
      '</div></div>';

    var q = query.trim().toLowerCase();

    /* ready patient groups count for the tab badge (computed before tabsHtml) */
    var readyGroupsCount = groupByPatient(readyRows).length;

    var tabsHtml =
      '<div class="toolbar" style="margin-bottom:16px;flex-wrap:wrap">' +
        '<input class="input search" id="resSearch" placeholder="Search invoice no / patient..." value="' + App.esc(query) + '" style="max-width:280px;flex:1;min-width:200px">' +
        /* Pending Entry / Ready Reports are sidebar sub-menu items now (#/results, #/results/ready); this only labels the list */
        '<div style="margin-left:auto;font-weight:700;font-size:14px;color:var(--ink2)">' + (tab === 'pending'
          ? 'Pending Entry <span class="badge b-pending" style="margin-left:6px">' + pendingRows.length + '</span>'
          : 'Ready Reports <span class="badge b-ready" style="margin-left:6px">' + readyGroupsCount + '</span>') + '</div>' +
      '</div>';

    var bodyHtml = '';
    if (tab === 'pending') {
      var pgroups = groupByPatient(pendingRows).filter(function (pg) {
        if (!q) return true;
        var p = pg.patient || {};
        var invMatch = pg.rows.some(function (r) { return (r.invoice.no || '').toLowerCase().indexOf(q) > -1; });
        return invMatch ||
               (p.name || '').toLowerCase().indexOf(q) > -1 ||
               (p.phone || '').indexOf(q) > -1 ||
               (p.id || '').toLowerCase().indexOf(q) > -1;
      });
      if (!pgroups.length) {
        bodyHtml = App.empty(query ? 'No pending results match your search.' : 'All caught up — no pending results.');
      } else {
        var prowsHtml = pgroups.map(function (pg, pi) {
          var pat = pg.patient || {};
          var invNos = {};
          pg.rows.forEach(function (r) { invNos[r.invoice.no || r.invoice.id] = true; });
          var testNames = pg.rows.map(function (r) { return testName(r); }).join(', ');
          return '<tr>' +
            '<td><span class="mono">' + App.esc(pat.id || '—') + '</span></td>' +
            '<td><a class="link pt-name" data-patenter="' + pi + '" href="javascript:void(0)"><strong>' + App.esc(pat.name || '—') + '</strong></a></td>' +
            '<td class="muted">' + App.esc([pat.age ? pat.age + ' yrs' : '', pat.gender || ''].filter(Boolean).join(' / ') || '—') + '</td>' +
            '<td class="muted">' + App.esc(pat.phone || '—') + '</td>' +
            '<td class="muted">' + App.esc(Object.keys(invNos).join(', ')) + '</td>' +
            '<td><span class="badge b-pending">' + pg.rows.length + ' pending</span>' + smpWarn(pg.rows) + '</td>' +
            '<td class="actions"><button class="btn btn-primary btn-sm" data-patenter="' + pi + '">Enter Results</button></td></tr>';
        }).join('');
        // stash for the click handlers below
        pendingPatientGroups = pgroups;
        bodyHtml =
          '<div class="card"><div class="card-b">' +
          '<div class="tbl-wrap"><table class="table"><thead><tr>' +
          '<th>Patient ID</th><th>Patient Name</th><th>Age / Gender</th><th>Phone</th><th>Invoice(s)</th><th>Status</th><th></th>' +
          '</tr></thead><tbody>' + prowsHtml + '</tbody></table></div>' +
          '</div></div>';
      }
    } else {
      var rpgroups = groupByPatient(readyRows).filter(function (pg) {
        if (!q) return true;
        var p = pg.patient || {};
        var invMatch = pg.rows.some(function (r) { return (r.invoice.no || '').toLowerCase().indexOf(q) > -1; });
        return invMatch ||
               (p.name || '').toLowerCase().indexOf(q) > -1 ||
               (p.phone || '').indexOf(q) > -1 ||
               (p.id || '').toLowerCase().indexOf(q) > -1;
      });
      if (!rpgroups.length) {
        bodyHtml = App.empty(query ? 'No ready reports match your search.' : 'No ready reports yet.');
      } else {
        var rprowsHtml = rpgroups.map(function (pg, pi) {
          var pat = pg.patient || {};
          // group this patient's ready rows by invoice for per-report actions
          var invMap = {}, invOrder = [];
          pg.rows.forEach(function (r) {
            var iid = r.invoice.id;
            if (!invMap[iid]) { invMap[iid] = { invoice: r.invoice, rows: [], maxRep: '' }; invOrder.push(iid); }
            invMap[iid].rows.push(r);
            if (r.res && r.res.reportedAt && r.res.reportedAt > invMap[iid].maxRep) invMap[iid].maxRep = r.res.reportedAt;
          });
          var invCells = invOrder.map(function (iid) {
            return '<span class="mono">' + App.esc(invMap[iid].invoice.no || iid) + '</span>';
          }).join('<br>');
          var testCount = pg.rows.length;
          var lastRep = '';
          pg.rows.forEach(function (r) { if (r.res && r.res.reportedAt && r.res.reportedAt > lastRep) lastRep = r.res.reportedAt; });
          var actHtml = invOrder.map(function (iid) {
            var inv = invMap[iid].invoice;
            var cmpBtn = '';
            return '<div style="margin-bottom:4px;white-space:nowrap">' +
              '<button class="btn btn-ghost btn-sm" data-rview="' + App.esc(inv.id) + '">View</button> ' +
              '<button class="btn btn-primary btn-sm" data-rprint="' + App.esc(inv.id) + '">' + PRINT_ICON + ' Print</button>' + cmpBtn + '</div>';
          }).join('');
          return '<tr>' +
            '<td><span class="mono">' + App.esc(pat.id || '—') + '</span></td>' +
            '<td><a class="link" data-rviewfirst="' + pi + '" href="javascript:void(0)"><strong>' + App.esc(pat.name || '—') + '</strong></a></td>' +
            '<td class="muted">' + App.esc([pat.age ? pat.age + ' yrs' : '', pat.gender || ''].filter(Boolean).join(' / ') || '—') + '</td>' +
            '<td class="muted">' + App.esc(pat.phone || '—') + '</td>' +
            '<td>' + invCells + '</td>' +
            '<td><span class="badge b-ready">' + testCount + ' done</span></td>' +
            '<td class="muted">' + App.esc(lastRep ? App.dt(lastRep) : '—') + '</td>' +
            '<td class="actions rr-act">' + actHtml + '</td></tr>';
        }).join('');
        readyPatientGroups = rpgroups;
        bodyHtml =
          '<div class="card"><div class="card-b">' +
          '<div class="tbl-wrap"><table class="table"><thead><tr>' +
          '<th>Patient ID</th><th>Patient Name</th><th>Age / Gender</th><th>Phone</th><th>Invoice(s)</th><th>Status</th><th>Reported</th><th></th>' +
          '</tr></thead><tbody>' + rprowsHtml + '</tbody></table></div>' +
          '</div></div>';
      }
    }

    var v = document.getElementById('view');
    v.innerHTML =
      statsHtml + tabsHtml + bodyHtml;

    // wire tabs
    v.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); });
    });
    // wire search (keep focus, don't full re-render on each keystroke)
    var si = document.getElementById('resSearch');
    si.addEventListener('input', function () { query = si.value; render(); var n = document.getElementById('resSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    // wire patient-name / Enter Results buttons (pending tab) → bulk entry form
    v.querySelectorAll('[data-patenter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pg = pendingPatientGroups[+b.getAttribute('data-patenter')];
        if (pg && pg.rows.length) openBulkEntry(pg.patient || {}, pg.rows);
      });
    });
    // wire view/print (ready tab patient list)
    v.querySelectorAll('[data-rview]').forEach(function (b) {
      b.addEventListener('click', function () { viewReport(b.getAttribute('data-rview')); });
    });
    v.querySelectorAll('[data-rprint]').forEach(function (b) {
      b.addEventListener('click', function () { printReportChoice(b.getAttribute('data-rprint')); });
    });
    v.querySelectorAll('[data-rviewfirst]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pg = readyPatientGroups[+b.getAttribute('data-rviewfirst')];
        if (pg && pg.rows.length) viewReport(pg.rows[0].invoice.id);
      });
    });
  }


  /* ---------- Old Reports: every finished report, newest first. Search, filter, view, print, edit the values, delete. ---------- */
  var old = { q: '', from: '', to: '', doc: '', page: 1 }, OLD_PER = 25;
  function oldList() {
    var by = {}, order = [];
    joinedRows('ready').forEach(function (r) {
      var id = r.invoice && r.invoice.id; if (!id) return;
      if (!by[id]) { by[id] = { inv: r.invoice, pat: r.patient || patOf(r.invoice.patientId) || {}, rows: [], last: '' }; order.push(id); }
      by[id].rows.push(r); if (r.res && r.res.reportedAt && r.res.reportedAt > by[id].last) by[id].last = r.res.reportedAt;
    });
    return order.map(function (id) { return by[id]; }).sort(function (a, b) { return String(b.inv.createdAt || '').localeCompare(String(a.inv.createdAt || '')); });
  }
  function oldText(g) {
    var vn = App.visitNos(g.inv), d = g.inv.doctorId ? DB.get('doctors', g.inv.doctorId) : null;
    return [g.pat.name, g.pat.phone, g.pat.whatsapp, g.pat.id, g.inv.no, g.inv.id, vn.labText, vn.caseText, d && d.name, g.inv.reference,
      g.rows.map(function (r) { return testName(r); }).join(' ')].join(' ').toLowerCase();
  }
  /* ---------- Old Reports KPI cards: global totals over every finished report ---------- */
  function oldKpis(all) {
    var today = App.today(), ym = today.slice(0, 7);
    var nToday = 0, nMonth = 0, due = 0;
    all.forEach(function (g) {
      var d = g.inv ? (+g.inv.due || 0) : 0; if (d > 0.009) due += d;
      var l = String(g.last || '');
      if (l.slice(0, 10) === today) nToday++;
      if (l.slice(0, 7) === ym) nMonth++;
    });
    var I = {
      file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
      cal: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>'
    };
    return '<div class="stat-grid">' +
      statCard(svgIcon(I.file), 'brand', 'TOTAL REPORTS', all.length, 'finished reports') +
      statCard(svgIcon(I.check), 'green', 'REPORTED TODAY', nToday, 'results completed') +
      statCard(svgIcon(I.cal), 'blue', 'REPORTED THIS MONTH', nMonth, 'this month') +
      statCard(svgIcon(I.wallet), 'amber', 'UNPAID DUES', App.money(due), 'outstanding') +
      '</div>';
  }
  function renderOld() {
    var view = document.getElementById('view'), all = oldList(), ed = true;
    var q = old.q.trim().toLowerCase();
    var rows = all.filter(function (g) {
      var day = String(g.inv.createdAt || '').slice(0, 10);
      if (old.from && day < old.from) return false;
      if (old.to && day > old.to) return false;
      if (old.doc && g.inv.doctorId !== old.doc) return false;
      return !q || oldText(g).indexOf(q) >= 0;
    });
    var pages = Math.max(1, Math.ceil(rows.length / OLD_PER)); if (old.page > pages) old.page = pages;
    var slice = rows.slice((old.page - 1) * OLD_PER, old.page * OLD_PER);
    var docs = (DB.all('doctors') || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var bar = '<div class="toolbar" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
      '<input class="input search" id="olQ" placeholder="Search name, phone, patient ID, invoice, INV #, test, doctor…" value="' + App.esc(old.q) + '" style="max-width:380px;flex:1;min-width:220px">' +
      '<label class="muted" style="font-size:12.5px;display:flex;align-items:center;gap:6px">From <input class="input" id="olFrom" type="date" value="' + App.esc(old.from) + '" style="width:auto"></label>' +
      '<label class="muted" style="font-size:12.5px;display:flex;align-items:center;gap:6px">To <input class="input" id="olTo" type="date" value="' + App.esc(old.to) + '" style="width:auto"></label>' +
      '<select class="select" id="olDoc" style="width:auto"><option value="">All doctors</option>' + docs.map(function (d) { return '<option value="' + App.esc(d.id) + '"' + (old.doc === d.id ? ' selected' : '') + '>' + App.esc(d.name) + '</option>'; }).join('') + '</select>' +
      ((old.q || old.from || old.to || old.doc) ? '<button class="btn btn-ghost btn-sm" id="olClear">Clear</button>' : '') +
      '<div style="margin-left:auto;font-weight:700;font-size:14px;color:var(--ink2)">Old Reports <span class="badge b-ready" style="margin-left:6px">' + rows.length + (rows.length !== all.length ? ' of ' + all.length : '') + '</span></div></div>';
    var body = !slice.length ? App.empty(all.length ? 'No report matches your search.' : 'No finished reports yet.') :
      '<div class="tbl-wrap"><table class="table"><thead><tr><th>INV # / Invoice no.</th><th>Registered</th><th>Patient</th><th>Tests</th><th>Doctor</th><th>Reported</th><th>Bill</th><th style="text-align:right">Actions</th></tr></thead><tbody>' + slice.map(function (g) {
        var inv = g.inv, vn = App.visitNos(inv), d = inv.doctorId ? DB.get('doctors', inv.doctorId) : null, names = g.rows.map(function (r) { return testName(r); }).filter(Boolean);
        return '<tr><td><b>' + App.esc(vn.labText) + '</b><div class="muted mono" style="font-size:11.5px">' + App.esc(inv.no || inv.id) + '</div></td><td>' + App.esc(App.d(inv.createdAt)) + '</td>' +
          '<td><b>' + App.esc(g.pat.name || '—') + '</b><div class="muted" style="font-size:12px">' + App.esc([g.pat.age ? g.pat.age + ' yrs' : '', g.pat.gender || '', g.pat.phone || g.pat.whatsapp || ''].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td style="max-width:260px;font-size:13px">' + App.esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ' <span class="muted">+' + (names.length - 3) + ' more</span>' : '') + '</td>' +
          '<td>' + App.esc(d ? d.name : 'Self') + '</td><td class="muted">' + App.esc(g.last ? App.d(g.last) : '—') + '</td>' +
          '<td>' + ((+inv.due || 0) > 0.009 ? '<span class="badge b-unpaid">Due ' + App.esc(App.money(inv.due)) + '</span>' : '<span class="badge b-paid">Paid</span>') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-ov="' + App.esc(inv.id) + '">View</button> <button class="btn btn-ghost btn-sm" data-op="' + App.esc(inv.id) + '">Print</button> <button class="btn btn-ghost btn-sm" data-oe="' + App.esc(inv.id) + '">Edit</button> <button class="btn btn-ghost btn-sm" data-od="' + App.esc(inv.id) + '" style="color:#b91c1c">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (pages > 1 ? '<div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:14px"><button class="btn btn-ghost btn-sm" id="olPrev"' + (old.page <= 1 ? ' disabled' : '') + '>&larr; Newer</button><span class="muted" style="font-size:13px">Page ' + old.page + ' of ' + pages + '</span><button class="btn btn-ghost btn-sm" id="olNext"' + (old.page >= pages ? ' disabled' : '') + '>Older &rarr;</button></div>' : '');
    view.innerHTML = oldKpis(all) + bar + '<div class="card"><div class="card-b">' + body + '</div></div>';
    var on = function (id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('input', fn); };
    on('olQ', function () { old.q = this.value; old.page = 1; var pos = this.selectionStart; renderOld(); var e = document.getElementById('olQ'); e.focus(); try { e.setSelectionRange(pos, pos); } catch (x) {} });
    ['olFrom:from', 'olTo:to', 'olDoc:doc'].forEach(function (s) { var p2 = s.split(':'); var e = document.getElementById(p2[0]); if (e) e.addEventListener('change', function () { old[p2[1]] = this.value; old.page = 1; renderOld(); }); });
    var cl = document.getElementById('olClear'); if (cl) cl.addEventListener('click', function () { old = { q: '', from: '', to: '', doc: '', page: 1 }; renderOld(); });
    var pv = document.getElementById('olPrev'); if (pv) pv.addEventListener('click', function () { old.page--; renderOld(); });
    var nx = document.getElementById('olNext'); if (nx) nx.addEventListener('click', function () { old.page++; renderOld(); });
    view.querySelectorAll('[data-ov]').forEach(function (b) { b.addEventListener('click', function () { viewReport(b.getAttribute('data-ov')); }); });
    view.querySelectorAll('[data-op]').forEach(function (b) { b.addEventListener('click', function () { printReportChoice(b.getAttribute('data-op')); }); });
    view.querySelectorAll('[data-oe]').forEach(function (b) { b.addEventListener('click', function () { manageReport(b.getAttribute('data-oe'), 'edit'); }); });
    view.querySelectorAll('[data-od]').forEach(function (b) { b.addEventListener('click', function () { manageReport(b.getAttribute('data-od'), 'delete'); }); });
  }
  /* edit the values of a finished report, test by test, or delete one test / the whole report (the test goes back to "Pending Entry", the bill is untouched) */
  function manageReport(invoiceId, mode) {
    var g = oldList().filter(function (x) { return x.inv.id === invoiceId; })[0]; if (!g) { App.toast('Report not found.', 'err'); return; }
    var vn = App.visitNos(g.inv);
    App.modal((mode === 'delete' ? 'Delete report — ' : 'Edit report — ') + vn.labText.replace('LAB # ', 'LAB # '),
      '<p class="muted" style="margin-top:0">' + App.esc(g.pat.name || '') + ' · ' + App.esc(g.inv.no || g.inv.id) + ' · ' + App.esc(App.d(g.inv.createdAt)) + '</p>' +
      (mode === 'delete' ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px">Deleting a result removes its values and the report. The test goes back to <b>Pending Entry</b>; the bill and the payment stay as they are. This cannot be undone.</div>' : '') +
      '<div id="mrList">' + g.rows.map(function (r) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px"><div style="flex:1"><b>' + App.esc(testName(r)) + '</b><div class="muted" style="font-size:12px">Reported ' + App.esc(r.res && r.res.reportedAt ? App.dt(r.res.reportedAt) : '—') + '</div></div>' +
          '<button class="btn btn-ghost btn-sm" data-mre="' + App.esc(r.res ? r.res.id : '') + '">Edit values</button><button class="btn btn-ghost btn-sm" data-mrd="' + App.esc(r.res ? r.res.id : '') + '" style="color:#b91c1c">Delete</button></div>';
      }).join('') + '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px"><button class="btn btn-ghost" id="mrAll" style="color:#b91c1c">Delete the whole report</button><button class="btn btn-primary" id="mrClose">Done</button></div>',
      { wide: true, onOpen: function (ov, close) {
        ov.querySelector('#mrClose').addEventListener('click', function () { close(); renderOld(); });
        ov.querySelectorAll('[data-mre]').forEach(function (b) { b.addEventListener('click', function () {
          var row = g.rows.filter(function (r) { return r.res && r.res.id === b.getAttribute('data-mre'); })[0]; if (!row) return;
          close(); openEntry(row, function () { renderOld(); });
        }); });
        function del(ids, label) {
          App.confirm('Delete ' + label + '? This cannot be undone.').then(function (ok) {
            if (!ok) return; ids.forEach(function (id) { if (id) DB.remove('results', id); });
            App.toast('Deleted. The test is back in Pending Entry.'); close(); renderOld();
          });
        }
        ov.querySelectorAll('[data-mrd]').forEach(function (b) { b.addEventListener('click', function () { del([b.getAttribute('data-mrd')], 'this result'); }); });
        ov.querySelector('#mrAll').addEventListener('click', function () { del(g.rows.map(function (r) { return r.res && r.res.id; }), 'the whole report (' + g.rows.length + ' result' + (g.rows.length === 1 ? '' : 's') + ')'); });
      } });
  }
  App.route('#/results/old', function () { renderOld(); });
  App.route('#/results', function () { tab = 'pending'; render(); });
  App.route('#/results/ready', function () { tab = 'ready'; render(); });

  /* exposed so the Reports page "Finalized Patient Reports" archive can view/print */
  App.viewLabReport = viewReport;
  App.printLabReport = printReportChoice;
  /* exposed so the Patient Profile page can enter results directly */
  App.enterLabResult = openEntry;

  /* ---- report comparison: 2 invoices side by side with auto-diff ---- */
  function compareReports(invId1, invId2) {
    var d1 = reportData(invId1), d2 = reportData(invId2);
    if (!d1 || !d2) { App.toast('Both reports need ready results to compare', 'err'); return; }
    var s = d1.s || {};
    /* index results by testId -> param name -> value */
    function indexResults(d) {
      var map = {};
      (d.readyRows || []).forEach(function (r) {
        var tid = (r.item && (r.item.testId || r.item.id)) || '';
        var tname = (r.item && r.item.name) || (r.test && r.test.name) || tid;
        var params = (r.test && r.test.params) || [];
        var vals = (r.res && r.res.values) || {};
        if (!map[tid]) map[tid] = { name: tname, params: {} };
        params.forEach(function (p) {
          map[tid].params[p.name] = { val: vals[p.name] || '—', unit: p.unit || '', ref: p.ref || '' };
        });
      });
      return map;
    }
    var m1 = indexResults(d1), m2 = indexResults(d2);
    var allTids = [];
    Object.keys(m1).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });
    Object.keys(m2).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });

    function numVal(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
    function trend(v1, v2) {
      var n1 = numVal(v1), n2 = numVal(v2);
      if (n1 === null || n2 === null || v1 === '—' || v2 === '—') return '';
      if (n2 > n1) return ' <span style="color:#c00;font-weight:700">↑</span>';
      if (n2 < n1) return ' <span style="color:#c00;font-weight:700">↓</span>';
      return ' <span style="color:#090">=</span>';
    }

    var rowsHtml = '';
    allTids.forEach(function (tid) {
      var t1 = m1[tid], t2 = m2[tid];
      var tname = (t1 && t1.name) || (t2 && t2.name) || tid;
      rowsHtml += '<tr><td colspan="5" style="background:#eef;font-weight:800;padding:8px">' + App.esc(tname) + '</td></tr>';
      var pnames = [];
      [t1, t2].forEach(function (t) {
        if (t) Object.keys(t.params).forEach(function (pn) { if (pnames.indexOf(pn) < 0) pnames.push(pn); });
      });
      pnames.forEach(function (pn) {
        var p1 = t1 && t1.params[pn], p2 = t2 && t2.params[pn];
        var v1 = p1 ? p1.val : '—', v2 = p2 ? p2.val : '—';
        var ref = (p1 && p1.ref) || (p2 && p2.ref) || '', unit = (p1 && p1.unit) || (p2 && p2.unit) || '';
        var changed = v1 !== v2 && v1 !== '—' && v2 !== '—';
        var valStyle = changed ? ' style="color:#c00;font-weight:800"' : '';
        rowsHtml += '<tr' + (changed ? ' style="background:#fff8e1"' : '') + '>' +
          '<td>' + App.esc(pn) + '</td>' +
          '<td class="muted">' + App.esc(ref) + '</td>' +
          '<td class="muted">' + App.esc(unit) + '</td>' +
          '<td' + valStyle + '><strong>' + App.esc(v1) + '</strong></td>' +
          '<td' + valStyle + '><strong>' + App.esc(v2) + '</strong>' + trend(v1, v2) + '</td></tr>';
      });
    });

    var html =
      '<div style="font-family:inherit;max-width:900px;margin:0 auto">' +
      '<h2 style="text-align:center">Report Comparison</h2>' +
      '<p style="text-align:center" class="muted">' + App.esc(d1.pat.name || '') + ' — ' +
      App.esc(rptCaseText(d1.inv)) + ' (' + App.d(d1.inv.createdAt) + ') vs ' +
      App.esc(rptCaseText(d2.inv)) + ' (' + App.d(d2.inv.createdAt) + ')</p>' +
      '<table class="table"><thead><tr><th>Parameter</th><th>Normal Value</th><th>Unit</th>' +
      '<th>' + App.esc(rptCaseText(d1.inv)) + '<br><span class="muted">' + App.d(d1.inv.createdAt) + '</span></th>' +
      '<th>' + App.esc(rptCaseText(d2.inv)) + '<br><span class="muted">' + App.d(d2.inv.createdAt) + '</span></th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      '<p class="muted" style="font-size:12px">↑ increased &nbsp; ↓ decreased &nbsp; = unchanged &nbsp; highlighted rows differ between reports</p>' +
      '<div style="text-align:center;margin-top:16px"><button class="btn btn-primary" id="cmpPrint">Print Comparison</button></div>' +
      '</div>';
    App.modal('Compare Reports', html, { wide: true, onOpen: function (ov, close) {
      ov.querySelector('#cmpPrint').addEventListener('click', function () {
        App.print('Report Comparison — ' + (d1.pat.name || ''), html, { noHeader: true });
      });
    }});
  }
  App.compareReports = compareReports;
  /* exposed for Lab Profile preview QR */
  App.qrDataUrlFor = qrDataUrlFor;
  /* Report preview for Lab Profile settings. It shows REAL data (no demo patient/tests): the newest patient report that has
     results; else the newest invoice's selected tests with empty result cells; else the first active tests of the catalog.
     `s` = the (possibly unsaved) form settings, merged over the saved ones so every setting flows into reportHtml. */
  App.sampleReportPreview = function (s) {
    s = s || {};
    var now = new Date().toISOString();
    var saved = {};
    try { saved = DB.get('settings', 'main') || {}; } catch (e) {}
    var merged = Object.assign({}, saved, s);
    var invs = DB.all('invoices').slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    var k, d;
    /* 1) newest real report with results */
    for (k = 0; k < invs.length; k++) {
      try { d = reportData(invs[k].id); } catch (e) { d = null; }
      if (d && d.readyRows && d.readyRows.length) { d.s = merged; return reportHtml(d); }
    }
    /* 2) newest invoice: its selected tests, results not entered yet */
    var inv = invs.filter(function (i) { return i.items && i.items.length; })[0];
    var rows, pat, doc;
    if (inv) {
      pat = DB.get('patients', inv.patientId) || {};
      doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
      rows = inv.items.map(function (it) {
        return { item: it, test: DB.get('tests', it.testId) || {}, res: { values: {} }, invoice: { id: inv.id, no: inv.no } };
      });
    } else {
      /* 3) nothing billed yet: layout with the first active tests of the catalog */
      inv = { id: 'preview', no: '', createdAt: now };
      pat = {}; doc = null;
      rows = DB.all('tests').filter(function (t) { return t.active !== false && !t.isPackage && t.params && t.params.length; }).slice(0, 3)
        .map(function (t) { return { item: { name: t.name, code: t.code, testId: t.id }, test: t, res: { values: {} }, invoice: { id: 'preview', no: '' } }; });
    }
    return reportHtml({
      inv: inv, pat: pat, s: merged, doc: doc,
      readyRows: rows, pendingCount: 0, maxReported: now, prevByTest: {}
    });
  };
})();
