/* Optix LAB MedSync — Email Center (#/email, admin + reception) — the email twin of the WhatsApp Center.
   Ready to send (one click / bulk), Email log with retry, and rules + the line added to every email.
   The actual sending lives in mod-results.js (App.mail); the server (/api/share/email) builds and sends the mail with the PDF attached. */
(function () {
  'use strict';
  var esc = App.esc;
  var tab = 'ready', sel = {}, logF = { status: '', q: '' }, srv = null;
  var EM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var CSS = '' +
    '.ec-cur{display:flex;align-items:baseline;gap:10px;margin-bottom:14px}.ec-cur b{font-size:17px;font-weight:800;color:var(--brand)}.ec-cur span{font-size:13px;color:var(--muted)}' +
    '.ec-st{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.ec-st .card{padding:14px 16px}.ec-st .k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}.ec-st b{display:block;font-size:24px;font-weight:800;margin-top:4px}' +
    '.ec-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap}' +
    '.ec-chip.g{background:#e6f7f0;color:#047857}.ec-chip.r{background:#fdecec;color:#b91c1c}.ec-chip.o{background:#fef4e2;color:#b45309}.ec-chip.n{background:#f1f5f9;color:#475569}.ec-chip.b{background:#e8f0fe;color:#1d4ed8}' +
    '.ec-sub{font-size:12px;color:var(--muted)}.ec-tests{max-width:240px;font-size:13px;color:var(--ink2)}' +
    '.ec-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--line2)}.ec-bar .grow{flex:1}' +
    '.ec-tpl{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}.ec-tpl textarea{width:100%;min-height:96px;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical}' +
    '.ec-mail{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px;font-size:13.5px;line-height:1.55;color:#1b2540;box-shadow:0 1px 4px rgba(15,30,60,.06)}' +
    '.ec-mail h4{margin:0 0 10px;font-size:17px;color:#131845}.ec-mail .bt{display:inline-block;background:#131845;color:#fff;padding:9px 18px;border-radius:8px;font-weight:700;margin:10px 0}' +
    '.ec-rules label.r{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-bottom:12px;cursor:pointer}.ec-rules input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}' +
    '@media(max-width:900px){.ec-st{grid-template-columns:1fr 1fr}.ec-tpl{grid-template-columns:1fr}.ec-tests{max-width:none}}';
  function css() { if (document.getElementById('ecCss')) return; var s = document.createElement('style'); s.id = 'ecCss'; s.textContent = CSS; document.head.appendChild(s); }

  function ensure(cb) {
    if (App.mail && App.wa) { cb(); return; }
    App.loadScript('assets/js/mod-results.js').then(function () { if (App.mail) cb(); else App.toast('Could not load the email module', 'err'); }, function () { App.toast('Could not load the email module', 'err'); });
  }
  function ts(t) { var d = new Date(t); if (isNaN(d)) return ''; return App.d(d) + ' <span class="ec-sub">' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</span>'; }
  function logs() { try { return DB.all('email_log').slice().sort(function (a, b) { return a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0); }); } catch (e) { return []; } }
  function sentAt(invId, role) { var l = logs().filter(function (e) { return e.invoiceId === invId && e.toRole === role && e.status === 'sent'; }); return l.length ? l[0].ts : ''; }
  function emailOf(inv, role) {
    var t = role === 'doctor' ? (inv.doctorId ? DB.get('doctors', inv.doctorId) : null) : (DB.get('patients', inv.patientId) || null);
    var a = t && String(t.email || '').trim(); return a && EM.test(a) ? a : '';
  }

  function paint() { var v = document.getElementById('view'); if (v && /#\/email/.test(location.hash)) v.innerHTML = render(); }

  function render() {
    css();
    var s = App.session();
    if (!s || (s.role !== 'admin' && s.role !== 'reception')) return '<div class="card"><div class="card-b">' + App.empty('You do not have access to the Email Center.') + '</div></div>';
    if (!App.mail) { ensure(paint); return '<div class="card"><div class="card-b">' + App.empty('Loading…') + '</div></div>'; }
    if (!srv) { App.mail.status(true).then(function (j) { srv = j; paint(); }); return '<div class="card"><div class="card-b">' + App.empty('Loading…') + '</div></div>'; }
    var st = DB.get('settings', 'main') || {}, today = App.today(), L = logs();
    var sentToday = L.filter(function (e) { return e.status === 'sent' && String(e.ts).slice(0, 10) === today; }).length, failed = L.filter(function (e) { return e.status === 'failed'; }).length;
    var rdy = App.mail.ready(), waiting = rdy.filter(function (i) { return emailOf(i, 'patient') && !sentAt(i.id, 'patient'); }).length, noAddr = rdy.filter(function (i) { return !emailOf(i, 'patient'); }).length;
    var on = srv.email, auto = (st.emailAuto ? 'Patient ✓ ' : '') + (st.emailAutoDoctor ? 'Doctor ✓' : '') + ((!st.emailAuto && !st.emailAutoDoctor) ? 'Off' : '');
    var h = (on ? '' : '<div class="card" style="margin-bottom:14px;border-color:#f6c6c6;background:#fff6f6"><div class="card-b"><b style="color:#b91c1c">Email sending is not set up on this server yet.</b> <span class="muted">The system owner can set it up in the superadmin console (Email sender).</span></div></div>') +
      '<div class="ec-st"><div class="card"><div class="k">Sent today</div><b>' + sentToday + '</b></div><div class="card"><div class="k">Waiting to send</div><b>' + waiting + '</b>' + (noAddr ? '<div class="ec-sub">' + noAddr + ' without an email address</div>' : '') + '</div>' +
      '<div class="card"><div class="k">Failed (all time)</div><b style="color:' + (failed ? '#b91c1c' : 'inherit') + '">' + failed + '</b></div>' +
      '<div class="card"><div class="k">Auto-send</div><b style="font-size:17px;margin-top:9px">' + auto + '</b></div></div>' +
      '<div class="ec-cur"><b>' + (tab === 'tpl' ? 'Templates &amp; rules' : (tab === 'log' ? 'Email log' : 'Ready to send')) + '</b><span>' + (tab === 'tpl' ? 'Sending rules and the email your patients receive' : (tab === 'log' ? L.length + ' email' + (L.length === 1 ? '' : 's') : waiting + ' waiting')) + '</span></div>';
    if (tab === 'tpl' && s.role === 'admin') h += tplHtml(st);
    else if (tab === 'log') h += logHtml(L);
    else h += readyHtml(rdy, on);
    setTimeout(wire, 0);
    return h;
  }

  function readyHtml(rdy, on) {
    var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
    return '<div class="card"><div class="ec-bar"><b>Finished reports</b><span class="ec-sub">Reports whose every test is ready. The PDF is attached to the email.</span><span class="grow"></span>' +
      '<button class="btn btn-primary btn-sm" id="ecSendSel"' + (n && on ? '' : ' disabled') + '>Email selected to patients' + (n ? ' (' + n + ')' : '') + '</button></div>' +
      (rdy.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th style="width:34px"><input type="checkbox" id="ecAll"></th><th>Invoice</th><th>Patient</th><th>Tests</th><th>Payment</th><th>Patient</th><th>Doctor</th><th></th></tr></thead><tbody>' +
        rdy.map(function (inv) {
          var pat = DB.get('patients', inv.patientId) || {}, doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null, pe = emailOf(inv, 'patient'), de = doc ? emailOf(inv, 'doctor') : '';
          var sp = sentAt(inv.id, 'patient'), sd = sentAt(inv.id, 'doctor'), owes = (+inv.due || 0) > 0.009;
          return '<tr><td><input type="checkbox" class="ecRow" data-id="' + esc(inv.id) + '"' + (sel[inv.id] ? ' checked' : '') + (sp || !pe ? ' disabled' : '') + '></td>' +
            '<td><b>' + esc(inv.no || inv.id) + '</b><div class="ec-sub">' + App.d(inv.createdAt) + '</div></td>' +
            '<td><b>' + esc(pat.name || '—') + '</b><div class="ec-sub">' + (pe ? esc(pe) : '<span style="color:#b45309">no email address</span>') + '</div></td>' +
            '<td class="ec-tests">' + esc(App.wa.testNames(inv.id).join(', ')) + '</td>' +
            '<td>' + (owes ? '<span class="ec-chip o">Due ' + esc(App.money(inv.due)) + '</span>' : '<span class="ec-chip g">Paid</span>') + '</td>' +
            '<td>' + (sp ? '<span class="ec-chip g">✓ Sent</span><div class="ec-sub">' + ts(sp) + '</div>' : '<span class="ec-chip n">Not sent</span>') + '</td>' +
            '<td>' + (doc ? (sd ? '<span class="ec-chip g">✓ Sent</span><div class="ec-sub">' + ts(sd) + '</div>' : '<span class="ec-chip n">Not sent</span>') + '<div class="ec-sub">' + esc(doc.name) + (de ? '' : ' · no email') + '</div>' : '<span class="ec-sub">—</span>') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-send="' + esc(inv.id) + '|patient"' + (on ? '' : ' disabled') + '>' + (pe ? (sp ? 'Resend' : 'Send') + ' to patient' : 'Add email &amp; send') + '</button>' +
            (doc ? ' <button class="btn btn-ghost btn-sm" data-send="' + esc(inv.id) + '|doctor"' + (on ? '' : ' disabled') + '>Doctor</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No finished reports yet') + '</div>') + '</div>';
  }

  function logHtml(L) {
    var q = logF.q.toLowerCase();
    var rows = L.filter(function (e) {
      if (logF.status && e.status !== logF.status) return false;
      if (q) { var inv = e.invoiceId ? DB.get('invoices', e.invoiceId) : null; if ((String(e.toName) + ' ' + String(e.to) + ' ' + String(e.invoiceId) + ' ' + String(inv && inv.no)).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
    var failedN = rows.filter(function (e) { return e.status === 'failed'; }).length;
    return '<div class="card"><div class="ec-bar"><select class="select" id="elStatus" style="width:140px"><option value="">All status</option><option value="sent"' + (logF.status === 'sent' ? ' selected' : '') + '>Sent</option><option value="failed"' + (logF.status === 'failed' ? ' selected' : '') + '>Failed</option></select>' +
      '<input class="input grow" id="elQ" placeholder="Search name, email, invoice…" value="' + esc(logF.q) + '" style="min-width:180px">' +
      '<button class="btn btn-ghost btn-sm" id="ecRetryAll"' + (failedN ? '' : ' disabled') + '>Retry all failed (' + failedN + ')</button></div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>When</th><th>To</th><th>Invoice</th><th>How</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 200).map(function (e) {
          var inv = e.invoiceId ? DB.get('invoices', e.invoiceId) : null;
          return '<tr><td>' + ts(e.ts) + '</td><td><b>' + esc(e.toName || '—') + '</b><div class="ec-sub">' + esc(e.toRole || '') + (e.to ? ' · ' + esc(e.to) : '') + '</div></td><td>' + esc(inv ? (inv.no || inv.id) : (e.invoiceId || '—')) + '</td>' +
            '<td>' + (e.auto ? '<span class="ec-chip b">Automatic</span>' : '<span class="ec-chip n">Manual</span>') + '</td>' +
            '<td>' + (e.status === 'sent' ? '<span class="ec-chip g">Sent</span>' : '<span class="ec-chip r">Failed</span>' + (e.error ? '<div class="ec-sub" style="max-width:260px">' + esc(e.error) + '</div>' : '')) + '</td>' +
            '<td>' + (e.status === 'failed' && e.invoiceId && e.to ? '<button class="btn btn-ghost btn-sm" data-retry="' + esc(e.invoiceId) + '|' + esc(e.toRole || 'patient') + '|' + esc(e.to) + '">Retry</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No emails sent yet') + '</div>') + '</div>';
  }

  function tplHtml(st) {
    return '<div class="card ec-rules" style="margin-bottom:16px"><div class="card-h"><h3>Sending rules</h3></div><div class="card-b">' +
      '<label class="r"><input type="checkbox" id="erAutoP"' + (st.emailAuto ? ' checked' : '') + '><span><b>Email the report to the patient automatically</b><br><span class="muted" style="font-size:13px">As soon as every test of an invoice is ready (only if the patient has an email address).</span></span></label>' +
      '<label class="r"><input type="checkbox" id="erAutoD"' + (st.emailAutoDoctor ? ' checked' : '') + '><span><b>Also email it to the referring doctor</b></span></label>' +
      '<label class="label" style="max-width:520px">When the invoice still has a balance due<select class="select" id="erDue">' +
      '<option value="hold"' + (st.emailDueRule === 'send' ? '' : ' selected') + '>Send nothing until it is fully paid (recommended)</option>' +
      '<option value="send"' + (st.emailDueRule === 'send' ? ' selected' : '') + '>Send the report anyway</option></select></label></div></div>' +
      '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>The email your patients receive</h3></div><div class="card-b"><div class="ec-tpl"><div>' +
      '<p class="muted" style="margin:0 0 8px;font-size:13px">The wording is fixed and professional: your lab\'s name as the sender, the PDF attached, and a link to open it on a phone. You can add <b>one line of your own</b> (for example opening hours or a get-well message).</p>' +
      '<label class="label" for="erNote">Your line (optional, max 200 characters)</label><textarea class="input" id="erNote" maxlength="200" placeholder="e.g. Open daily 8am–10pm. Get well soon!">' + esc(st.emailNote || '') + '</textarea>' +
      '<div style="margin-top:14px"><button class="btn btn-primary" id="ecSaveRules">Save rules &amp; line</button></div></div>' +
      '<div><div class="ec-sub" style="margin-bottom:6px">Preview</div><div class="ec-mail" id="erPrev"></div></div></div></div></div>';
  }
  function preview() {
    var p = document.getElementById('erPrev'); if (!p) return;
    var st = DB.get('settings', 'main') || {}, note = (document.getElementById('erNote') || {}).value || '';
    var contact = [st.phone ? 'Phone: ' + st.phone : '', st.email ? 'Email: ' + st.email : ''].filter(Boolean).join('  |  ');
    p.innerHTML = '<h4>' + esc(st.labName || 'Your Lab') + '</h4><p>Dear Ayesha Khan,</p><p>Your lab report is ready. It is attached to this email as a PDF.</p>' + (note.trim() ? '<p>' + esc(note.trim()) + '</p>' : '') +
      '<div class="bt">Open / download report</div><div class="ec-sub">' + esc(contact) + '</div><div class="ec-sub" style="margin-top:12px">If you were not expecting this email, you can ignore it.</div>';
  }
  function saveRules() {
    var note = String((document.getElementById('erNote') || {}).value || '').trim().slice(0, 200);
    DB.update('settings', 'main', { emailAuto: document.getElementById('erAutoP').checked, emailAutoDoctor: document.getElementById('erAutoD').checked, emailDueRule: document.getElementById('erDue').value, emailNote: note });
    App.toast('Email rules saved'); paint();
  }

  function sendOne(invId, role, cb) {
    var inv = DB.get('invoices', invId); if (!inv) return;
    var to = emailOf(inv, role);
    if (!to) { App.mail.ask(invId, role); return; } /* no address on file: the dialog asks for it and saves it */
    var who = role === 'doctor' ? ((DB.get('doctors', inv.doctorId) || {}).name || 'doctor') : ((DB.get('patients', inv.patientId) || {}).name || 'patient');
    App.toast('Emailing ' + who + '…', 'info');
    App.mail.send(invId, role, to, false).then(function () { App.toast('Report emailed to ' + who); }, function (e) { App.toast('Email failed: ' + String((e && e.message) || e).slice(0, 120), 'err'); }).then(function () { if (cb) cb(); });
  }

  function wire() {
    var v = document.getElementById('view'); if (!v || !App.mail) return;
    function on(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
    Array.prototype.forEach.call(v.querySelectorAll('[data-send]'), function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-send').split('|'); sendOne(p[0], p[1], function () { setTimeout(paint, 400); }); if (!emailOf(DB.get('invoices', p[0]) || {}, p[1])) setTimeout(paint, 6000); }); });
    Array.prototype.forEach.call(v.querySelectorAll('[data-retry]'), function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-retry').split('|'); App.toast('Retrying…', 'info'); App.mail.send(p[0], p[1], p[2], false).then(function () { App.toast('Sent'); }, function (e) { App.toast('Failed: ' + String((e && e.message) || e).slice(0, 100), 'err'); }).then(function () { setTimeout(paint, 300); }); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('.ecRow'), function (c) { c.addEventListener('change', function () { sel[c.getAttribute('data-id')] = c.checked; paint(); }); });
    on('ecAll', 'change', function (e) { Array.prototype.forEach.call(v.querySelectorAll('.ecRow:not(:disabled)'), function (c) { sel[c.getAttribute('data-id')] = e.target.checked; }); paint(); });
    function runJobs(jobs) {
      var i = 0; (function next() { if (i >= jobs.length) { setTimeout(paint, 600); return; } var j = jobs[i++]; App.mail.send(j[0], j[1], j[2], false).then(next, next); })();
    }
    on('ecSendSel', 'click', function () {
      var ids = Object.keys(sel).filter(function (k) { return sel[k]; }), jobs = [];
      ids.forEach(function (id) { var inv = DB.get('invoices', id), to = inv && emailOf(inv, 'patient'); if (to) jobs.push([id, 'patient', to]); });
      sel = {}; App.toast('Emailing ' + jobs.length + ' report' + (jobs.length === 1 ? '' : 's') + '…'); runJobs(jobs);
    });
    on('ecRetryAll', 'click', function () {
      var seen = {}, jobs = [];
      logs().forEach(function (e) { if (e.status === 'failed' && e.invoiceId && e.to) { var k = e.invoiceId + '|' + e.toRole; if (!seen[k] && !sentAt(e.invoiceId, e.toRole || 'patient')) { seen[k] = 1; jobs.push([e.invoiceId, e.toRole || 'patient', e.to]); } } });
      if (!jobs.length) { App.toast('Nothing to retry'); return; } App.toast('Retrying ' + jobs.length + '…'); runJobs(jobs);
    });
    on('elStatus', 'change', function (e) { logF.status = e.target.value; paint(); });
    on('elQ', 'input', function (e) { logF.q = e.target.value.trim(); clearTimeout(wire.t); wire.t = setTimeout(function () { paint(); var q = document.getElementById('elQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); });
    if (tab === 'tpl') { on('erNote', 'input', preview); preview(); on('ecSaveRules', 'click', saveRules); }
  }

  function go(t) { var me = App.session(); if (t === 'tpl' && !(me && me.role === 'admin')) { App.nav('#/email'); return ''; } tab = t; sel = {}; srv = null; return render(); }
  App.route('/email', function () { return go('ready'); });
  App.route('/email/log', function () { return go('log'); });
  App.route('/email/templates', function () { return go('tpl'); });
})();
