/* Optix LAB MedSync — WhatsApp Center (#/whatsapp, admin + reception)
   Ready-to-send reports (one click / bulk), message log with retry, editable message templates + sending rules.
   Sending logic lives in mod-results.js (App.wa); this page only drives it. */
(function () {
  'use strict';
  var esc = App.esc;
  var tab = 'ready', sel = {}, logF = { status: '', kind: '', q: '' }, tplDraft = null;

  var CSS = '' +
    '.wc-cur{display:flex;align-items:baseline;gap:10px;margin-bottom:14px}.wc-cur b{font-size:17px;font-weight:800;color:var(--brand)}.wc-cur span{font-size:13px;color:var(--muted)}' +
    '.wc-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}' +
    '.wc-tabs button{border:1px solid var(--bd);background:#fff;border-radius:99px;padding:8px 18px;font-weight:700;font-size:13.5px;color:var(--ink2);cursor:pointer;font-family:inherit}' +
    '.wc-tabs button.on{background:var(--brand);color:#fff;border-color:var(--brand)}.wc-tabs b{margin-left:6px;font-size:12px;opacity:.85}' +
    '.wc-st{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.wc-st .card{padding:14px 16px}.wc-st .k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}.wc-st b{display:block;font-size:24px;font-weight:800;margin-top:4px}' +
    '.wc-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap}' +
    '.wc-chip.g{background:#e6f7f0;color:#047857}.wc-chip.r{background:#fdecec;color:#b91c1c}.wc-chip.o{background:#fef4e2;color:#b45309}.wc-chip.n{background:#f1f5f9;color:#475569}.wc-chip.b{background:#e8f0fe;color:#1d4ed8}' +
    '.wc-sub{font-size:12px;color:var(--muted)}.wc-tests{max-width:260px;font-size:13px;color:var(--ink2)}' +
    '.wc-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--line2)}.wc-bar .grow{flex:1}' +
    '.wc-tpl{display:grid;grid-template-columns:1.2fr 1fr;gap:18px}.wc-tpl textarea{width:100%;min-height:190px;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical}' +
    '.wc-ph{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px}.wc-ph button{border:1px dashed #9db0d3;background:#f4f7fc;border-radius:8px;padding:4px 9px;font-size:12px;font-weight:700;color:#1e3a8a;cursor:pointer;font-family:inherit}' +
    '.wc-bub{background:#e7ffdb;border:1px solid #cfe9c3;border-radius:14px 14px 14px 4px;padding:12px 14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.08)}' +
    '.wc-rules label.r{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-bottom:12px;cursor:pointer}.wc-rules input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}' +
    '@media(max-width:900px){.wc-st{grid-template-columns:1fr 1fr}.wc-tpl{grid-template-columns:1fr}.wc-tests{max-width:none}}';
  function css() { if (document.getElementById('wcCss')) return; var s = document.createElement('style'); s.id = 'wcCss'; s.textContent = CSS; document.head.appendChild(s); }

  function ensure(cb) {
    if (App.wa) { cb(); return; }
    App.loadScript('assets/js/mod-results.js').then(function () { if (App.wa) cb(); else App.toast('Could not load WhatsApp module', 'err'); }, function () { App.toast('Could not load WhatsApp module', 'err'); });
  }
  function ts(t) { var d = new Date(t); if (isNaN(d)) return ''; return App.d(d) + ' <span class="wc-sub">' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</span>'; }
  function logs() { try { return DB.all('wa_log').slice().sort(function (a, b) { return a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0); }); } catch (e) { return []; } }
  function sentAt(invId, role, kind) {
    var l = logs().filter(function (e) { return e.invoiceId === invId && e.toRole === role && (e.kind || 'report') === kind && e.status === 'sent'; });
    return l.length ? l[0].ts : '';
  }
  function readyInvoices() {
    var out = [], seen = {};
    DB.all('results').forEach(function (r) { if (r.invoiceId && !seen[r.invoiceId]) { seen[r.invoiceId] = 1; } });
    Object.keys(seen).forEach(function (id) {
      var inv = DB.get('invoices', id);
      if (!inv || !App.wa.allReady(id)) return;
      out.push(inv);
    });
    out.sort(function (a, b) { return String(b.createdAt) < String(a.createdAt) ? -1 : 1; });
    return out.slice(0, 300);
  }

  function render() {
    css();
    var s = App.session();
    if (!s || (s.role !== 'admin' && s.role !== 'reception')) return '<div class="card"><div class="card-b">' + App.empty('You do not have access to WhatsApp Center.') + '</div></div>';
    if (!App.wa) { ensure(paint); return '<div class="card"><div class="card-b">' + App.empty('Loading…') + '</div></div>'; }
    var cfg = App.wa.cfg(), ready = App.wa.ready(cfg), today = App.today();
    var L = logs(), sentToday = L.filter(function (e) { return e.status === 'sent' && String(e.ts).slice(0, 10) === today; }).length;
    var failed = L.filter(function (e) { return e.status === 'failed'; }).length;
    var rdy = readyInvoices(), waiting = rdy.filter(function (i) { return !sentAt(i.id, 'patient', 'report'); }).length;
    var h = (ready ? '' : '<div class="card" style="margin-bottom:14px;border-color:#f6c6c6;background:#fff6f6"><div class="card-b"><b style="color:#b91c1c">WhatsApp sending is not configured yet.</b> <span class="muted">Link the lab WhatsApp number in Settings → WhatsApp (scan a QR code). Reports can still be printed and shared manually.</span></div></div>') +
      '<div class="wc-st"><div class="card"><div class="k">Sent today</div><b>' + sentToday + '</b></div><div class="card"><div class="k">Waiting to send</div><b>' + waiting + '</b></div>' +
      '<div class="card"><div class="k">Failed (all time)</div><b style="color:' + (failed ? '#b91c1c' : 'inherit') + '">' + failed + '</b></div>' +
      '<div class="card"><div class="k">Auto-send</div><b style="font-size:17px;margin-top:9px">' + (cfg.autoPatient !== false ? 'Patient ✓ ' : '') + (cfg.autoDoctor === true ? 'Doctor ✓' : '') + ((cfg.autoPatient === false && cfg.autoDoctor !== true) ? 'Off' : '') + '</b></div></div>' +
      /* Ready to send / Message log / Templates & rules are sidebar sub-menu items (#/whatsapp, #/whatsapp/log, #/whatsapp/templates); this labels the open list */
      '<div class="wc-cur"><b>' + (tab === 'tpl' ? 'Templates &amp; rules' : (tab === 'log' ? 'Message log' : 'Ready to send')) + '</b><span>' + (tab === 'tpl' ? 'Messages and sending rules' : (tab === 'log' ? L.length + ' message' + (L.length === 1 ? '' : 's') : waiting + ' waiting')) + '</span></div>';
    if (tab === 'tpl' && s.role === 'admin') h += tplHtml(cfg);
    else if (tab === 'log') h += logHtml(L);
    else h += readyHtml(rdy, ready);
    setTimeout(wire, 0);
    return h;
  }

  function readyHtml(rdy, ready) {
    var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
    return '<div class="card"><div class="wc-bar"><b>Finished reports</b><span class="wc-sub">Reports whose every test is ready</span><span class="grow"></span>' +
      '<button class="btn btn-primary btn-sm" id="wcSendSel"' + (n && ready ? '' : ' disabled') + '>Send selected to patients' + (n ? ' (' + n + ')' : '') + '</button></div>' +
      (rdy.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th style="width:34px"><input type="checkbox" id="wcAll"></th><th>Invoice</th><th>Patient</th><th>Tests</th><th>Payment</th><th>Patient</th><th>Doctor</th><th></th></tr></thead><tbody>' +
        rdy.map(function (inv) {
          var pat = DB.get('patients', inv.patientId) || {}, doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
          var sp = sentAt(inv.id, 'patient', 'report'), sd = sentAt(inv.id, 'doctor', 'report'), sn = sentAt(inv.id, 'patient', 'due');
          var owes = (+inv.due || 0) > 0.009;
          return '<tr><td><input type="checkbox" class="wcRow" data-id="' + esc(inv.id) + '"' + (sel[inv.id] ? ' checked' : '') + (sp ? ' disabled' : '') + '></td>' +
            '<td><b>' + esc(inv.no || inv.id) + '</b><div class="wc-sub">' + App.d(inv.createdAt) + '</div></td>' +
            '<td><b>' + esc(pat.name || '—') + '</b><div class="wc-sub">' + esc(pat.whatsapp || pat.phone || 'no number') + '</div></td>' +
            '<td class="wc-tests">' + esc(App.wa.testNames(inv.id).join(', ')) + '</td>' +
            '<td>' + (owes ? '<span class="wc-chip o">Due ' + esc(App.money(inv.due)) + '</span>' : '<span class="wc-chip g">Paid</span>') + '</td>' +
            '<td>' + (sp ? '<span class="wc-chip g">✓ Sent</span><div class="wc-sub">' + ts(sp) + '</div>' : (sn ? '<span class="wc-chip b">Balance note sent</span>' : '<span class="wc-chip n">Not sent</span>')) + '</td>' +
            '<td>' + (doc ? (sd ? '<span class="wc-chip g">✓ Sent</span><div class="wc-sub">' + ts(sd) + '</div>' : '<span class="wc-chip n">Not sent</span>') + '<div class="wc-sub">' + esc(doc.name) + '</div>' : '<span class="wc-sub">—</span>') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-send="' + esc(inv.id) + '|patient"' + (ready ? '' : ' disabled') + '>' + (sp ? 'Resend' : 'Send') + ' to patient</button>' +
            (doc ? ' <button class="btn btn-ghost btn-sm" data-send="' + esc(inv.id) + '|doctor"' + (ready ? '' : ' disabled') + '>Doctor</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No finished reports yet') + '</div>') + '</div>';
  }

  var KIND = { report: 'Report', due: 'Balance note', critical: 'Critical alert' };
  function logHtml(L) {
    var q = logF.q.toLowerCase();
    var rows = L.filter(function (e) {
      if (logF.status && e.status !== logF.status) return false;
      if (logF.kind && (e.kind || 'report') !== logF.kind) return false;
      if (q) { var inv = e.invoiceId ? DB.get('invoices', e.invoiceId) : null; if ((String(e.toName) + ' ' + String(e.to) + ' ' + String(e.invoiceId) + ' ' + String(inv && inv.no)).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
    var failedN = rows.filter(function (e) { return e.status === 'failed' && (e.kind || 'report') !== 'critical'; }).length;
    return '<div class="card"><div class="wc-bar"><select class="select" id="lgStatus" style="width:140px"><option value="">All status</option><option value="sent"' + (logF.status === 'sent' ? ' selected' : '') + '>Sent</option><option value="failed"' + (logF.status === 'failed' ? ' selected' : '') + '>Failed</option></select>' +
      '<select class="select" id="lgKind" style="width:160px"><option value="">All types</option>' + Object.keys(KIND).map(function (k) { return '<option value="' + k + '"' + (logF.kind === k ? ' selected' : '') + '>' + KIND[k] + '</option>'; }).join('') + '</select>' +
      '<input class="input grow" id="lgQ" placeholder="Search name, number, invoice…" value="' + esc(logF.q) + '" style="min-width:180px">' +
      '<button class="btn btn-ghost btn-sm" id="wcRetryAll"' + (failedN ? '' : ' disabled') + '>Retry all failed (' + failedN + ')</button></div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>When</th><th>To</th><th>Type</th><th>Invoice</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 200).map(function (e) {
          var inv = e.invoiceId ? DB.get('invoices', e.invoiceId) : null, k = e.kind || 'report';
          return '<tr><td>' + ts(e.ts) + '</td><td><b>' + esc(e.toName || '—') + '</b><div class="wc-sub">' + esc(e.toRole || '') + (e.to ? ' · ' + esc(e.to) : '') + '</div></td><td>' + esc(KIND[k] || k) + '</td><td>' + esc(inv ? (inv.no || inv.id) : (e.invoiceId || '—')) + '</td>' +
            '<td>' + (e.status === 'sent' ? '<span class="wc-chip g">Sent</span>' : '<span class="wc-chip r">Failed</span>' + (e.error ? '<div class="wc-sub" style="max-width:260px">' + esc(e.error) + '</div>' : '')) + '</td>' +
            '<td>' + (e.status === 'failed' && k !== 'critical' && e.invoiceId ? '<button class="btn btn-ghost btn-sm" data-retry="' + esc(e.invoiceId) + '|' + esc(e.toRole || 'patient') + '">Retry</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No messages yet') + '</div>') + '</div>';
  }

  var PH = ['patient', 'doctor', 'lab', 'invoice', 'date', 'tests', 'total', 'due', 'linkline', 'link'];
  var SAMPLE = { lab: 'Your Lab', patient: 'Ayesha Khan', doctor: 'Dr. Ahmed', invoice: 'INV-0142', date: '06 Oct 2026', tests: 'CBC, Blood Sugar', total: 'Rs 1,800', due: 'Rs 800', link: 'https://…/r/rpt-INV-0142-x7Kp2q' };
  function tplHtml(cfg) {
    var d = tplDraft || { tplPatient: App.wa.tplText('tplPatient'), tplDoctor: App.wa.tplText('tplDoctor'), tplDue: App.wa.tplText('tplDue') };
    var rule = cfg.dueRule || 'note';
    function box(key, title, hint) {
      return '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>' + title + '</h3><span class="sp"></span><button class="btn btn-ghost btn-sm" data-reset="' + key + '">Reset</button></div><div class="card-b"><p class="muted" style="margin:0 0 8px;font-size:13px">' + hint + '</p>' +
        '<div class="wc-tpl"><div><textarea class="input" id="t_' + key + '">' + esc(d[key]) + '</textarea><div class="wc-ph">' + PH.map(function (p) { return '<button type="button" data-ins="' + key + '|{' + p + '}">{' + p + '}</button>'; }).join('') + '</div></div>' +
        '<div><div class="wc-sub" style="margin-bottom:6px">Preview</div><div class="wc-bub" id="pv_' + key + '"></div></div></div></div></div>';
    }
    return '<div class="card wc-rules" style="margin-bottom:16px"><div class="card-h"><h3>Sending rules</h3></div><div class="card-b">' +
      '<label class="r"><input type="checkbox" id="rAutoP"' + (cfg.autoPatient !== false ? ' checked' : '') + '><span><b>Auto-send report to the patient</b><br><span class="muted" style="font-size:13px">As soon as every test of an invoice is ready.</span></span></label>' +
      '<label class="r"><input type="checkbox" id="rAutoD"' + (cfg.autoDoctor === true ? ' checked' : '') + '><span><b>Auto-send report to the referring doctor</b></span></label>' +
      '<label class="r"><input type="checkbox" id="rCrit"' + (cfg.autoCritical !== false ? ' checked' : '') + '><span><b>Critical value alerts</b> to the doctor and the lab number</span></label>' +
      '<label class="label" style="max-width:520px">When the invoice still has a balance due<select class="select" id="rDue">' +
      '<option value="note"' + (rule === 'note' ? ' selected' : '') + '>Tell the patient a balance is pending — send the report automatically once paid (recommended)</option>' +
      '<option value="hold"' + (rule === 'hold' ? ' selected' : '') + '>Send nothing until it is fully paid</option>' +
      '<option value="send"' + (rule === 'send' ? ' selected' : '') + '>Send the report anyway</option></select></label>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="wcSaveRules">Save rules &amp; templates</button> <button class="btn btn-ghost" id="wcTest"' + (cfg.labNumber ? '' : ' disabled title="Set your lab WhatsApp number in Settings first"') + '>Send test to lab number</button></div></div></div>' +
      box('tplPatient', 'Report message — patient', 'Sent when the report is ready.') + box('tplDoctor', 'Report message — doctor', 'Sent to the referring doctor.') + box('tplDue', 'Balance pending message', 'Sent instead of the report while a balance is due (rule above).');
  }

  function paint() { var v = document.getElementById('view'); if (v && /#\/whatsapp/.test(location.hash)) { v.innerHTML = render(); } }

  function readDraft() {
    var d = {};
    ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) { var e = document.getElementById('t_' + k); d[k] = e ? e.value : App.wa.tplText(k); });
    return d;
  }
  function preview() {
    ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) {
      var e = document.getElementById('t_' + k), p = document.getElementById('pv_' + k); if (!e || !p) return;
      var v = Object.assign({}, SAMPLE); if (k === 'tplDue') v.link = '';
      p.textContent = App.wa.render(e.value, v);
    });
  }
  function saveRules() {
    var st = DB.get('settings', 'main') || {}, w = Object.assign({}, st.whatsapp || {});
    var d = readDraft();
    ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) { w[k] = (d[k] === App.wa.tpl[k]) ? '' : d[k]; });
    w.autoPatient = document.getElementById('rAutoP').checked; w.autoDoctor = document.getElementById('rAutoD').checked; w.autoCritical = document.getElementById('rCrit').checked;
    w.dueRule = document.getElementById('rDue').value;
    st.whatsapp = w; DB.update('settings', 'main', st); tplDraft = null; App.toast('WhatsApp rules saved'); paint();
  }
  function sendOne(invId, role, cb) { App.wa.manual(invId, role); if (cb) setTimeout(cb, 900); }

  function wire() {
    var v = document.getElementById('view'); if (!v || !App.wa) return;
    function on(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
    Array.prototype.forEach.call(v.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { if (tab === 'tpl') tplDraft = readDraft(); tab = b.getAttribute('data-tab'); paint(); }); });
    Array.prototype.forEach.call(v.querySelectorAll('[data-send]'), function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-send').split('|'); sendOne(p[0], p[1], paint); }); });
    Array.prototype.forEach.call(v.querySelectorAll('[data-retry]'), function (b) { b.addEventListener('click', function () { var p = b.getAttribute('data-retry').split('|'); sendOne(p[0], p[1], function () { setTimeout(paint, 1500); }); }); });
    Array.prototype.forEach.call(v.querySelectorAll('.wcRow'), function (c) { c.addEventListener('change', function () { sel[c.getAttribute('data-id')] = c.checked; paint(); }); });
    on('wcAll', 'change', function (e) { Array.prototype.forEach.call(v.querySelectorAll('.wcRow:not(:disabled)'), function (c) { sel[c.getAttribute('data-id')] = e.target.checked; }); paint(); });
    on('wcSendSel', 'click', function () {
      var ids = Object.keys(sel).filter(function (k) { return sel[k]; }), i = 0;
      sel = {}; App.toast('Sending ' + ids.length + ' report' + (ids.length === 1 ? '' : 's') + '…');
      (function next() { if (i >= ids.length) { setTimeout(paint, 1200); return; } App.wa.manual(ids[i++], 'patient'); setTimeout(next, 1500); })();
    });
    on('wcRetryAll', 'click', function () {
      var seen = {}, jobs = [];
      logs().forEach(function (e) { var k = (e.kind || 'report'); if (e.status === 'failed' && k !== 'critical' && e.invoiceId) { var key = e.invoiceId + '|' + e.toRole; if (!seen[key] && !App.wa.alreadySent(e.invoiceId, e.toRole || 'patient')) { seen[key] = 1; jobs.push(key.split('|')); } } });
      if (!jobs.length) { App.toast('Nothing to retry'); return; }
      var i = 0; App.toast('Retrying ' + jobs.length + '…');
      (function next() { if (i >= jobs.length) { setTimeout(paint, 1500); return; } App.wa.manual(jobs[i][0], jobs[i][1]); i++; setTimeout(next, 1500); })();
    });
    on('lgStatus', 'change', function (e) { logF.status = e.target.value; paint(); });
    on('lgKind', 'change', function (e) { logF.kind = e.target.value; paint(); });
    on('lgQ', 'input', function (e) { logF.q = e.target.value.trim(); clearTimeout(wire.t); wire.t = setTimeout(function () { paint(); var q = document.getElementById('lgQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); });
    if (tab === 'tpl') {
      ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) { on('t_' + k, 'input', preview); });
      preview();
      Array.prototype.forEach.call(v.querySelectorAll('[data-ins]'), function (b) { b.addEventListener('click', function () {
        var p = b.getAttribute('data-ins').split('|'), t = document.getElementById('t_' + p[0]); if (!t) return;
        var a = t.selectionStart || 0, z = t.selectionEnd || 0; t.value = t.value.slice(0, a) + p[1] + t.value.slice(z); t.focus(); t.setSelectionRange(a + p[1].length, a + p[1].length); preview(); }); });
      Array.prototype.forEach.call(v.querySelectorAll('[data-reset]'), function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-reset'); document.getElementById('t_' + k).value = App.wa.tpl[k]; preview(); }); });
      on('wcSaveRules', 'click', saveRules);
      on('wcTest', 'click', function () {
        var cfg = App.wa.cfg(), to = App.wa.phone(cfg.labNumber);
        if (!App.wa.ready(cfg)) { App.toast('WhatsApp API is not configured', 'err'); return; }
        var d = readDraft(); App.toast('Sending test…', 'info');
        App.wa.send(cfg, to, '🧪 TEST\n\n' + App.wa.render(d.tplPatient, SAMPLE), function (err) { if (err) App.toast('Test failed: ' + String(err.message || err).slice(0, 100), 'err'); else App.toast('Test message sent to ' + cfg.labNumber); });
      });
    }
  }

  function go(t) { if (tab === 'tpl' && document.getElementById('t_tplPatient')) tplDraft = readDraft(); var me = App.session(); if (t === 'tpl' && !(me && me.role === 'admin')) { App.nav('#/whatsapp'); return ''; } tab = t; sel = {}; return render(); }
  App.route('/whatsapp', function () { return go('ready'); });
  App.route('/whatsapp/log', function () { return go('log'); });
  App.route('/whatsapp/templates', function () { return go('tpl'); });
})();
