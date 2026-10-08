/* Optix Medical Sync — Outsourced tests (#/outsourced): tests the lab sends to another (reference) lab.
   Its own dashboard: what still has to be sent, what is out at the reference lab (and what is late), what came back, what it costs and what is owed to
   each reference lab. A job is made automatically for every bill that contains an outsourced test (App.outsourceSync). */
(function () {
  'use strict';
  var esc = App.esc, DAY = 86400000;
  var tab = 'dash', flt = { st: '', lab: '', q: '', mk: '' }, sel = {};

  function rs(n) { return 'Rs ' + Math.round(+n || 0).toLocaleString('en-US'); }
  function mkOf(d) { var x = new Date(d); if (isNaN(x.getTime())) return ''; return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); }
  function monthLabel(mk) { var p = mk.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function months() { var out = [], n = new Date(); for (var i = 0; i < 12; i++) { var d = new Date(n.getFullYear(), n.getMonth() - i, 1), k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); out.push({ key: k, label: monthLabel(k) }); } return out; }
  function canEdit() { var s = App.session(); return !!s && App.canPage('outsourced'); }
  function labs() { return (DB.all('ref_labs') || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); }

  /* every outsourced test on a live bill has a job; a ready result closes its job; jobs of deleted bills drop out */
  function reconcile() {
    var outT = {}; (DB.all('tests') || []).forEach(function (t) { if (t.outsourced && t.refLabId) outT[t.id] = 1; });
    var jobs = DB.all('outsourced') || [], haveJobs = jobs.length > 0;
    if (!Object.keys(outT).length && !haveJobs) return;
    var invs = DB.all('invoices') || [], live = {};
    invs.forEach(function (i) {
      live[i.id] = 1;
      var has = (i.items || []).some(function (it) { return outT[it.testId] || (it.includes || []).some(function (x) { return outT[x]; }); });
      if (has) App.outsourceSync(i.id);
    });
    jobs = DB.all('outsourced') || [];
    var ready = {}; (DB.all('results') || []).forEach(function (r) { if (r.status === 'ready') ready[r.invoiceId + '|' + r.testId] = r; });
    jobs.forEach(function (j) {
      if (!live[j.invoiceId]) { DB.remove('outsourced', j.id); return; }
      if (j.status !== 'received' && ready[j.invoiceId + '|' + j.testId]) DB.update('outsourced', j.id, { status: 'received', sentAt: j.sentAt || new Date().toISOString(), receivedAt: new Date().toISOString(), note: (j.note ? j.note + ' · ' : '') + 'result entered' });
    });
  }
  function view(j) {
    var inv = DB.get('invoices', j.invoiceId) || {}, pat = DB.get('patients', j.patientId || inv.patientId) || {}, t = DB.get('tests', j.testId) || {}, lab = DB.get('ref_labs', j.refLabId) || {};
    var tat = (+t.refTatDays || 3) * DAY, late = j.status === 'sent' && j.sentAt && (Date.now() - Date.parse(j.sentAt)) > tat;
    return { j: j, inv: inv, pat: pat, t: t, lab: lab, late: late, due: j.status === 'sent' && j.sentAt ? new Date(Date.parse(j.sentAt) + tat) : null };
  }
  var ST = { to_send: ['b-pending', 'To send'], sent: ['b-partial', 'At reference lab'], received: ['b-ready', 'Result back'] };
  function stBadge(v) { return '<span class="badge ' + ST[v.j.status][0] + '">' + ST[v.j.status][1] + '</span>' + (v.late ? ' <span class="badge b-unpaid">late</span>' : ''); }

  /* ---------- dashboard ---------- */
  /* stat-card tints driven by shared .kpi t-* classes in app.css */
  var ICONS = {
    truck: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    building: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>',
    alert: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    cash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    scale: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7l7-4 7 4"/><path d="M3 13l2-6 2 6a3.5 3.5 0 0 1-4 0z"/><path d="M17 13l2-6 2 6a3.5 3.5 0 0 1-4 0z"/><path d="M8 21h8"/></svg>'
  };
  var STAT_TINTS = {
    brand: { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    navy:  { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#a9c9ec', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e9cb96', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#9fd8b8', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e6aaaa', soft: '#fdecec', circle: '#fad2d2' }
  };

  function stat(label, val, sub, tint, icon) {
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:1.5px solid ' + c.line + ' !important;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
      '<div style="position:absolute;top:-30px;right:-30px;width:90px;height:90px;border-radius:50%;background:' + c.circle + ';opacity:0.65;pointer-events:none"></div>' +
      '<div class="stat-ico" style="position:relative;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:' + c.sc + ';background:linear-gradient(135deg,' + c.soft + ' 0%,#ffffff 160%);box-shadow:inset 0 0 0 1px ' + c.line + ',0 1px 3px rgba(15,30,46,.06);margin-bottom:6px;flex:0 0 auto">' + icon + '</div>' +
      '<div class="lb" style="position:relative;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;flex:0 0 auto">' + App.esc(label) + '</div>' +
      '<div class="vl" style="position:relative;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 0 4px 0;flex:0 0 auto">' + val + '</div>' +
      '<div class="dl" style="position:relative;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">' + sub + '</div>' +
      '</div>';
  }

  function dashData(all) {
    var mk = mkOf(new Date()), c = { to_send: 0, sent: 0, late: 0, back: 0, cost: 0, margin: 0 }, byLab = {};
    all.forEach(function (v) {
      if (v.j.status === 'to_send') c.to_send++; if (v.j.status === 'sent') c.sent++; if (v.late) c.late++;
      var l = byLab[v.j.refLabId] = byLab[v.j.refLabId] || { name: v.lab.name || 'Unknown', open: 0, cost: 0, n: 0 };
      if (v.j.status !== 'received') l.open++;
      if ((v.j.status === 'sent' || v.j.status === 'received') && mkOf(v.j.sentAt) === mk) { c.cost += +v.j.cost || 0; l.cost += +v.j.cost || 0; l.n++; if (v.j.price) c.margin += (+v.j.price || 0) - (+v.j.cost || 0); }
      if (v.j.status === 'received' && mkOf(v.j.receivedAt) === mk) c.back++;
    });
    var owed = labs().reduce(function (s, l) { return s + Math.max(0, App.refLabAccount(l).balance); }, 0);
    var attention = all.filter(function (v) { return v.j.status === 'to_send' || v.late; }).sort(function (a, b) { return (b.late ? 1 : 0) - (a.late ? 1 : 0) || String(a.j.createdAt).localeCompare(String(b.j.createdAt)); }).slice(0, 8);
    var labRows = Object.keys(byLab).map(function (k) { return byLab[k]; }).sort(function (a, b) { return b.cost - a.cost; });
    return { mk: mk, c: c, byLab: byLab, owed: owed, attention: attention, labRows: labRows };
  }

  function statCards(d) {
    var lateSub = d.c.late > 0 ? ('<span style="color:#dc2626;font-weight:700">' + d.c.late + ' running late</span>') : 'results awaited';
    var oweSub = d.c.cost ? ('this month ' + rs(d.c.cost)) : 'to all reference labs';
    return '<div class="stat-grid">' +
      stat('To send', d.c.to_send, 'waiting at your lab', 'amber', ICONS.truck) +
      stat('At reference lab', d.c.sent, lateSub, 'blue', ICONS.building) +
      stat('Results back', d.c.back, 'this month', 'green', ICONS.check) +
      stat('You owe', rs(d.owed), oweSub, 'red', ICONS.scale) +
      '</div>';
  }
  function dashBody(d) {
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">' +
      '<div class="card" style="margin:0"><div class="card-h"><h3>Needs attention</h3></div><div class="card-b flush">' + (d.attention.length ? '<div class="tbl-wrap"><table class="table"><tbody>' + d.attention.map(function (v) {
        return '<tr><td><b>' + esc(v.pat.name || '—') + '</b><div class="muted" style="font-size:12px">' + esc(v.inv.no || v.inv.id || '') + ' · ' + esc(v.t.name || '') + '</div></td><td>' + esc(v.lab.name || '') + '</td><td>' + stBadge(v) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('Nothing waiting. All caught up.') + '</div>') + '</div></div>' +
      '<div class="card" style="margin:0"><div class="card-h"><h3>By reference lab</h3><span class="sub muted" style="margin-left:8px">' + esc(monthLabel(d.mk)) + '</span></div><div class="card-b flush">' + (d.labRows.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Lab</th><th style="text-align:right">Open</th><th style="text-align:right">Tests</th><th style="text-align:right">Cost</th></tr></thead><tbody>' + d.labRows.map(function (l) {
        return '<tr><td><b>' + esc(l.name) + '</b></td><td style="text-align:right">' + l.open + '</td><td style="text-align:right">' + l.n + '</td><td style="text-align:right">' + rs(l.cost) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No outsourced tests yet. Mark a test as outsourced in Tests, then bill it.') + '</div>') + '</div></div></div>';
  }

  /* ---------- jobs ---------- */
  function jobsHtml(all) {
    var q = flt.q.toLowerCase();
    var rows = all.filter(function (v) {
      if (flt.st && v.j.status !== flt.st && !(flt.st === 'late' && v.late)) return false;
      if (flt.lab && v.j.refLabId !== flt.lab) return false;
      if (flt.mk && mkOf(v.j.createdAt) !== flt.mk) return false;
      return !q || ((v.pat.name || '') + ' ' + (v.inv.no || v.inv.id || '') + ' ' + (v.t.name || '') + ' ' + (v.lab.name || '')).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return String(b.j.createdAt).localeCompare(String(a.j.createdAt)); });
    var ed = canEdit();
    var bar = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><input class="input search" id="osQ" placeholder="Search patient, invoice, test…" value="' + esc(flt.q) + '" style="max-width:260px">' +
      '<select class="select" id="osSt" style="width:auto"><option value="">All statuses</option><option value="to_send"' + (flt.st === 'to_send' ? ' selected' : '') + '>To send</option><option value="sent"' + (flt.st === 'sent' ? ' selected' : '') + '>At reference lab</option><option value="late"' + (flt.st === 'late' ? ' selected' : '') + '>Running late</option><option value="received"' + (flt.st === 'received' ? ' selected' : '') + '>Result back</option></select>' +
      '<select class="select" id="osLab" style="width:auto"><option value="">All labs</option>' + labs().map(function (l) { return '<option value="' + esc(l.id) + '"' + (flt.lab === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="osMk" style="width:auto"><option value="">Any month</option>' + months().map(function (m) { return '<option value="' + m.key + '"' + (flt.mk === m.key ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') + '</select>' +
      (ed ? '<span style="margin-left:auto;display:flex;gap:8px"><button class="btn btn-ghost btn-sm" id="osSendSel">Mark selected as sent</button><button class="btn btn-ghost btn-sm" id="osPrintSel">Print send-list</button></span>' : '') + '</div>';
    if (!rows.length) return bar + App.empty(all.length ? 'No job matches the filters.' : 'No outsourced tests yet. Mark a test as outsourced in Tests, then bill it — it will appear here.');
    return bar + '<div class="tbl-wrap"><table class="table"><thead><tr>' + (ed ? '<th style="width:30px"></th>' : '') + '<th>Date</th><th>Patient / invoice</th><th>Test</th><th>Reference lab</th><th style="text-align:right">Cost</th><th style="text-align:right">Margin</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody>' + rows.map(function (v) {
      var j = v.j, margin = j.price ? (+j.price || 0) - (+j.cost || 0) : null;
      return '<tr>' + (ed ? '<td>' + (j.status === 'to_send' ? '<input type="checkbox" class="osChk" data-id="' + esc(j.id) + '"' + (sel[j.id] ? ' checked' : '') + '>' : '') + '</td>' : '') +
        '<td>' + esc(App.d(j.createdAt)) + '</td><td><b>' + esc(v.pat.name || '—') + '</b><div class="muted" style="font-size:12px">' + esc(v.inv.no || v.inv.id || '') + '</div></td><td>' + esc(v.t.name || '') + '</td><td>' + esc(v.lab.name || '—') + '</td>' +
        '<td style="text-align:right">' + rs(j.cost) + '</td><td style="text-align:right;color:' + (margin != null && margin < 0 ? '#b91c1c' : 'inherit') + '">' + (margin == null ? '<span class="muted">—</span>' : rs(margin)) + '</td>' +
        '<td>' + stBadge(v) + (j.status === 'sent' && v.due ? '<div class="muted" style="font-size:11.5px">due ' + esc(App.d(v.due)) + '</div>' : '') + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' + (ed ? (j.status === 'to_send' ? '<button class="btn btn-primary btn-sm" data-send="' + esc(j.id) + '">Mark sent</button>' : j.status === 'sent' ? '<button class="btn btn-primary btn-sm" data-back="' + esc(j.id) + '">Result back</button> ' + '<button class="btn btn-ghost btn-sm" data-undo="' + esc(j.id) + '">Undo</button>' : '<button class="btn btn-ghost btn-sm" data-undo="' + esc(j.id) + '">Undo</button>') : '') +
        (j.status !== 'to_send' && j.status !== 'received' ? ' <a class="btn btn-ghost btn-sm" href="#/results">Enter result</a>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function printSendList(list) {
    var by = {}; list.forEach(function (v) { (by[v.j.refLabId] = by[v.j.refLabId] || []).push(v); });
    var L = DB.get('settings', 'main') || {};
    var html = Object.keys(by).map(function (k) {
      var lab = DB.get('ref_labs', k) || {};
      return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2540;padding:6px 4px;page-break-after:always"><div style="border-bottom:3px solid #131845;padding-bottom:8px;margin-bottom:12px"><div style="font-size:22px;font-weight:800;color:#131845">' + esc(L.labName || 'Lab') + '</div><div style="font-size:12px;color:#5b6b80">' + esc([L.address, L.phone].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div style="font-size:16px;font-weight:800;margin-bottom:4px">Samples sent to ' + esc(lab.name || 'reference lab') + '</div><div style="font-size:12.5px;color:#5b6b80;margin-bottom:10px">' + esc(App.d(new Date())) + ' · ' + by[k].length + ' test' + (by[k].length === 1 ? '' : 's') + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>' + ['#', 'Patient', 'Age / sex', 'Invoice', 'Test'].map(function (h) { return '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid #131845;font-size:12px;text-transform:uppercase">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + by[k].map(function (v, i) {
          return '<tr><td style="padding:7px 8px;border-bottom:1px solid #e3e8f2">' + (i + 1) + '</td><td style="padding:7px 8px;border-bottom:1px solid #e3e8f2">' + esc(v.pat.name || '') + '</td><td style="padding:7px 8px;border-bottom:1px solid #e3e8f2">' + esc([v.pat.age, v.pat.gender].filter(Boolean).join(' / ')) + '</td><td style="padding:7px 8px;border-bottom:1px solid #e3e8f2">' + esc(v.inv.no || v.inv.id || '') + '</td><td style="padding:7px 8px;border-bottom:1px solid #e3e8f2">' + esc(v.t.name || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('');
    App.print('Samples sent', html, { noHeader: true });
  }
  function wireJobs(all) {
    var v = document.getElementById('osBody'), byId = {}; all.forEach(function (x) { byId[x.j.id] = x; });
    function rerender() { render(); }
    var setF = function (id, k) { var e = document.getElementById(id); if (e) e.addEventListener('change', function () { flt[k] = this.value; rerender(); }); };
    setF('osSt', 'st'); setF('osLab', 'lab'); setF('osMk', 'mk');
    var q = document.getElementById('osQ'); if (q) q.addEventListener('input', function () { flt.q = this.value.trim(); var p = this.selectionStart; rerender(); var e = document.getElementById('osQ'); e.focus(); try { e.setSelectionRange(p, p); } catch (x) {} });
    v.querySelectorAll('.osChk').forEach(function (c) { c.addEventListener('change', function () { sel[c.getAttribute('data-id')] = c.checked; }); });
    v.querySelectorAll('[data-send]').forEach(function (b) { b.addEventListener('click', function () { DB.update('outsourced', b.getAttribute('data-send'), { status: 'sent', sentAt: new Date().toISOString() }); App.toast('Marked as sent.'); rerender(); }); });
    v.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { DB.update('outsourced', b.getAttribute('data-back'), { status: 'received', receivedAt: new Date().toISOString() }); App.toast('Marked as result back. Enter the result in Lab Results.'); rerender(); }); });
    v.querySelectorAll('[data-undo]').forEach(function (b) { b.addEventListener('click', function () { var j = DB.get('outsourced', b.getAttribute('data-undo')); if (!j) return; DB.update('outsourced', j.id, j.status === 'received' ? { status: 'sent', receivedAt: null } : { status: 'to_send', sentAt: null }); rerender(); }); });
    var ss = document.getElementById('osSendSel'); if (ss) ss.addEventListener('click', function () { var ids = Object.keys(sel).filter(function (k) { return sel[k] && byId[k] && byId[k].j.status === 'to_send'; }); if (!ids.length) return App.toast('Tick the tests you are sending first.', 'err'); ids.forEach(function (id) { DB.update('outsourced', id, { status: 'sent', sentAt: new Date().toISOString() }); }); sel = {}; App.toast(ids.length + ' marked as sent.'); rerender(); });
    var ps = document.getElementById('osPrintSel'); if (ps) ps.addEventListener('click', function () { var list = all.filter(function (x) { return x.j.status === 'to_send' && (sel[x.j.id] || (!Object.keys(sel).some(function (k) { return sel[k]; }) && (!flt.lab || x.j.refLabId === flt.lab))); }); if (!list.length) return App.toast('Nothing to send.', 'err'); printSendList(list); });
  }

  /* ---------- reference labs ---------- */
  function labsHtml() {
    var list = labs(), ed = canEdit();
    return '<div style="display:flex;margin-bottom:12px"><span class="muted" style="font-size:13px">Labs you send tests to, and what you owe each of them.</span>' + (ed ? '<button class="btn btn-primary btn-sm" id="rlNew" style="margin-left:auto">+ Add reference lab</button>' : '') + '</div>' +
      (list.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Reference lab</th><th>Contact</th><th style="text-align:right">Tests sent</th><th style="text-align:right">You owe</th><th style="text-align:right">Actions</th></tr></thead><tbody>' + list.map(function (l) {
        var a = App.refLabAccount(l), n = (DB.all('outsourced') || []).filter(function (j) { return j.refLabId === l.id && j.status !== 'to_send'; }).length;
        return '<tr' + (l.active === false ? ' style="opacity:.55"' : '') + '><td><b>' + esc(l.name) + '</b>' + (l.active === false ? ' <span class="badge b-unpaid">inactive</span>' : '') + '</td><td>' + esc([l.contact, l.phone].filter(Boolean).join(' · ')) + '</td><td style="text-align:right">' + n + '</td><td style="text-align:right;font-weight:800;color:' + (a.balance > 0 ? '#b91c1c' : 'inherit') + '">' + rs(a.balance) + '</td>' +
          '<td style="text-align:right;white-space:nowrap">' + (ed ? '<button class="btn btn-ghost btn-sm" data-rpay="' + esc(l.id) + '">Payment</button> ' : '') + '<button class="btn btn-ghost btn-sm" data-rstmt="' + esc(l.id) + '">Statement</button>' + (ed ? ' <button class="btn btn-ghost btn-sm" data-redit="' + esc(l.id) + '">Edit</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : App.empty('No reference labs yet. Add the lab you send tests to, then mark those tests as outsourced in Tests.'));
  }
  function wireLabs() {
    var v = document.getElementById('osBody');
    var n = document.getElementById('rlNew'); if (n) n.addEventListener('click', function () { labModal(null); });
    v.querySelectorAll('[data-redit]').forEach(function (b) { b.addEventListener('click', function () { labModal(b.getAttribute('data-redit')); }); });
    v.querySelectorAll('[data-rpay]').forEach(function (b) { b.addEventListener('click', function () { payModal(b.getAttribute('data-rpay')); }); });
    v.querySelectorAll('[data-rstmt]').forEach(function (b) { b.addEventListener('click', function () { stmtModal(b.getAttribute('data-rstmt')); }); });
  }
  function labModal(id) {
    var l = id ? DB.get('ref_labs', id) : null; l = l || { name: '', contact: '', phone: '', whatsapp: '', email: '', address: '', openingBalance: 0, notes: '', active: true, payments: [] };
    App.modal(id ? 'Edit reference lab' : 'Add reference lab',
      '<div class="form-grid"><div><label class="label">Lab name *</label><input class="input" id="rlName" maxlength="80" value="' + esc(l.name) + '"></div><div><label class="label">Contact person</label><input class="input" id="rlContact" maxlength="60" value="' + esc(l.contact || '') + '"></div>' +
      '<div><label class="label">Phone</label><input class="input" id="rlPhone" value="' + esc(l.phone || '') + '"></div><div><label class="label">WhatsApp</label><input class="input" id="rlWa" value="' + esc(l.whatsapp || '') + '"></div>' +
      '<div><label class="label">Email</label><input class="input" id="rlEmail" type="email" value="' + esc(l.email || '') + '"></div><div><label class="label">Address</label><input class="input" id="rlAddr" maxlength="120" value="' + esc(l.address || '') + '"></div>' +
      '<div><label class="label">Opening balance (Rs) <span class="muted" style="font-weight:400">already owed</span></label><input class="input" id="rlOpen" type="number" step="any" value="' + esc(String(l.openingBalance || 0)) + '"></div>' +
      '<div><label class="label">Status</label><label style="display:flex;align-items:center;gap:8px;font-weight:600"><input id="rlActive" type="checkbox"' + (l.active !== false ? ' checked' : '') + '> Active</label></div></div>' +
      '<div style="margin-top:10px"><label class="label">Notes</label><input class="input" id="rlNotes" maxlength="200" value="' + esc(l.notes || '') + '"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">' + (id ? '<button class="btn btn-ghost" id="rlDel" style="color:#b91c1c;margin-right:auto">Delete</button>' : '') + '<button class="btn btn-ghost" id="rlCancel">Cancel</button><button class="btn btn-primary" id="rlSave">' + (id ? 'Save changes' : 'Add lab') + '</button></div>',
      { onOpen: function (ov, close) {
        var $ = function (i) { return ov.querySelector('#' + i); };
        $('rlCancel').addEventListener('click', close);
        if ($('rlDel')) $('rlDel').addEventListener('click', function () {
          if ((DB.all('outsourced') || []).some(function (j) { return j.refLabId === id; }) || (DB.all('tests') || []).some(function (t) { return t.refLabId === id; })) return App.toast('This lab has tests or jobs. Untick "Active" instead of deleting.', 'err');
          App.confirm('Delete "' + l.name + '"?').then(function (ok) { if (!ok) return; DB.remove('ref_labs', id); close(); render(); });
        });
        $('rlSave').addEventListener('click', function () {
          var name = $('rlName').value.trim(); if (!name) return App.toast('Enter the lab name.', 'err');
          if ((DB.all('ref_labs') || []).some(function (x) { return x.id !== id && String(x.name).toLowerCase() === name.toLowerCase(); })) return App.toast('A reference lab with this name already exists.', 'err');
          var data = { name: name, contact: $('rlContact').value.trim(), phone: $('rlPhone').value.trim(), whatsapp: $('rlWa').value.trim(), email: $('rlEmail').value.trim(), address: $('rlAddr').value.trim(), openingBalance: parseFloat($('rlOpen').value) || 0, notes: $('rlNotes').value.trim(), active: $('rlActive').checked };
          if (id) DB.update('ref_labs', id, data); else { data.payments = []; DB.insert('ref_labs', data); }
          App.toast('Saved.'); close(); render();
        });
      } });
  }
  function payModal(id) {
    var l = DB.get('ref_labs', id); if (!l) return; var a = App.refLabAccount(l);
    App.modal('Payment to ' + l.name,
      '<p class="muted" style="margin-top:0">You owe now: <b style="color:' + (a.balance > 0 ? '#b91c1c' : 'inherit') + '">' + rs(a.balance) + '</b></p><div class="form-grid"><div><label class="label">Amount (Rs) *</label><input class="input" id="rpAmt" type="number" min="1" step="any" value="' + (a.balance > 0 ? a.balance : '') + '"></div><div><label class="label">Date</label><input class="input" id="rpDate" type="date" value="' + App.today() + '"></div>' +
      '<div><label class="label">Method</label><select class="select" id="rpMeth">' + App.optionsHtml('paymentMethod', 'Cash') + '</select></div><div><label class="label">Note</label><input class="input" id="rpNote" maxlength="80"></div></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn btn-ghost" id="rpCancel">Cancel</button><button class="btn btn-primary" id="rpSave">Save payment</button></div>',
      { onOpen: function (ov, close) {
        var $ = function (i) { return ov.querySelector('#' + i); };
        $('rpCancel').addEventListener('click', close);
        $('rpSave').addEventListener('click', function () {
          var amt = Math.round((parseFloat($('rpAmt').value) || 0) * 100) / 100; if (!(amt > 0)) return App.toast('Enter the amount paid.', 'err');
          var cur = DB.get('ref_labs', id), list = (cur.payments || []).slice(); list.push({ id: 'RP-' + Date.now().toString(36), date: $('rpDate').value || App.today(), amount: amt, method: $('rpMeth').value, note: $('rpNote').value.trim() });
          DB.update('ref_labs', id, { payments: list }); App.toast('Payment saved.'); close(); render();
        });
      } });
  }
  function stmt(labId, mk) {
    var lab = DB.get('ref_labs', labId) || {}, p = mk.split('-'), prev = new Date(+p[0], +p[1] - 1, 0), prevDay = prev.getFullYear() + '-' + ('0' + (prev.getMonth() + 1)).slice(-2) + '-' + ('0' + prev.getDate()).slice(-2);
    var live = {}; (DB.all('invoices') || []).forEach(function (i) { live[i.id] = 1; });
    var all = (DB.all('outsourced') || []).filter(function (j) { return j.refLabId === labId && live[j.invoiceId] && (j.status === 'sent' || j.status === 'received'); });
    var before = all.filter(function (j) { return String(j.sentAt || '').slice(0, 10) <= prevDay; }).reduce(function (a, j) { return a + (+j.cost || 0); }, 0);
    var paidBefore = (lab.payments || []).filter(function (x) { return String(x.date).slice(0, 10) <= prevDay; }).reduce(function (a, x) { return a + (+x.amount || 0); }, 0);
    var rows = all.filter(function (j) { return mkOf(j.sentAt) === mk; }).sort(function (a, b) { return String(a.sentAt).localeCompare(String(b.sentAt)); });
    var pays = (lab.payments || []).filter(function (x) { return mkOf(x.date) === mk; });
    var cost = rows.reduce(function (a, j) { return a + (+j.cost || 0); }, 0), paid = pays.reduce(function (a, x) { return a + (+x.amount || 0); }, 0), open = (+lab.openingBalance || 0) + before - paidBefore;
    return { lab: lab, mk: mk, rows: rows.map(function (j) { var v = view(j); return { date: j.sentAt, inv: v.inv.no || v.inv.id || '', pat: v.pat.name || '', test: v.t.name || '', cost: +j.cost || 0 }; }), pays: pays, open: open, cost: cost, paid: paid, close: Math.round((open + cost - paid) * 100) / 100 };
  }
  function stmtHtml(s) {
    var TD = 'padding:6px 8px;border-bottom:1px solid #e3e8f2;font-size:12.5px';
    return '<div style="font-size:15px;font-weight:800;margin-bottom:8px">' + esc(s.lab.name || '') + ' — ' + esc(monthLabel(s.mk)) + '</div><table style="width:100%;border-collapse:collapse"><thead><tr>' + ['Date', 'Invoice', 'Patient', 'Test', 'Cost'].map(function (h, i) { return '<th style="text-align:' + (i === 4 ? 'right' : 'left') + ';padding:6px 8px;border-bottom:2px solid #131845;font-size:12px;text-transform:uppercase">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (s.rows.length ? s.rows.map(function (r) { return '<tr><td style="' + TD + '">' + esc(App.d(r.date)) + '</td><td style="' + TD + '">' + esc(r.inv) + '</td><td style="' + TD + '">' + esc(r.pat) + '</td><td style="' + TD + '">' + esc(r.test) + '</td><td style="' + TD + ';text-align:right">' + rs(r.cost) + '</td></tr>'; }).join('') : '<tr><td colspan="5" style="' + TD + ';text-align:center;color:#8a94a6;padding:18px">No tests sent this month.</td></tr>') + '</tbody></table>' +
      (s.pays.length ? '<div style="margin-top:10px;font-size:13px"><b>Payments made</b>' + s.pays.map(function (x) { return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eef1f7"><span>' + esc(App.d(x.date)) + ' · ' + esc(x.method || '') + (x.note ? ' · ' + esc(x.note) : '') + '</span><span>' + rs(x.amount) + '</span></div>'; }).join('') + '</div>' : '') +
      '<div style="margin:12px 0 0 auto;max-width:320px;font-size:13.5px">' + [['Previous balance', rs(s.open)], ['Sent this month', rs(s.cost)], ['Paid this month', '− ' + rs(s.paid)]].map(function (x) { return '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>' + x[0] + '</span><span>' + x[1] + '</span></div>'; }).join('') + '<div style="display:flex;justify-content:space-between;padding:5px 0;border-top:2px solid #131845;font-weight:800;font-size:15px"><span>You owe</span><span style="color:' + (s.close > 0 ? '#b91c1c' : 'inherit') + '">' + rs(s.close) + '</span></div></div>';
  }
  function stmtModal(id) {
    var mk = months()[0].key;
    App.modal('Reference lab statement', '<div style="display:flex;gap:10px;margin-bottom:10px"><select class="select" id="rsMk" style="min-width:170px">' + months().map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + '</option>'; }).join('') + '</select></div><div id="rsBody" style="max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:12px"></div>' +
      '<div class="actions" style="margin-top:12px;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" id="rsClose">Close</button><button class="btn btn-ghost" id="rsCsv">Export CSV</button><button class="btn btn-primary" id="rsPrint">Print</button></div>',
      { wide: true, onOpen: function (ov, close) {
        var $ = function (i) { return ov.querySelector('#' + i); }, s;
        function paint() { mk = $('rsMk').value; s = stmt(id, mk); $('rsBody').innerHTML = stmtHtml(s); }
        $('rsMk').addEventListener('change', paint); $('rsClose').addEventListener('click', close); paint();
        $('rsPrint').addEventListener('click', function () { var L = DB.get('settings', 'main') || {}; App.print('Reference lab statement', '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2540;padding:6px 4px"><div style="border-bottom:3px solid #131845;padding-bottom:8px;margin-bottom:12px;font-size:22px;font-weight:800;color:#131845">' + esc(L.labName || 'Lab') + '</div>' + stmtHtml(s) + '</div>', { noHeader: true }); });
        $('rsCsv').addEventListener('click', function () {
          var out = [['Date', 'Invoice', 'Patient', 'Test', 'Cost']]; s.rows.forEach(function (r) { out.push([App.d(r.date), r.inv, r.pat, r.test, Math.round(r.cost)]); }); out.push([]); out.push(['', '', '', 'Previous balance', Math.round(s.open)], ['', '', '', 'Sent', Math.round(s.cost)], ['', '', '', 'Paid', Math.round(s.paid)], ['', '', '', 'You owe', Math.round(s.close)]);
          var text = out.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = 'reference-lab-' + String(s.lab.name || 'lab').replace(/[^A-Za-z0-9]+/g, '-') + '-' + mk + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        });
      } });
  }

  /* ---------- the page ---------- */
  function render() {
    var el = document.getElementById('view');
    if (!canEdit()) { el.innerHTML = '<div class="card"><div class="card-b">' + App.empty('You do not have access to Outsourced tests.') + '</div></div>'; return; }
    if (tab === 'dash' || tab === 'jobs') reconcile();
    var all = (DB.all('outsourced') || []).map(view);
    var d = dashData(all);
    var tabs = [['dash', 'Dashboard'], ['jobs', 'Tests'], ['labs', 'Reference labs']];
    var open = all.filter(function (v) { return v.j.status !== 'received'; }).length;
    var tabsHtml = '<div class="tabs" id="osTabs" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' + tabs.map(function (t) { return '<button type="button" class="btn ' + (tab === t[0] ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-tab="' + t[0] + '">' + t[1] + (t[0] === 'jobs' && open ? ' <span class="badge b-pending" style="margin-left:4px">' + open + '</span>' : '') + '</button>'; }).join('') + '</div>';
    el.innerHTML = statCards(d) + tabsHtml + '<div id="osBody">' + (tab === 'dash' ? dashBody(d) : tab === 'jobs' ? '<div class="card"><div class="card-b">' + jobsHtml(all) + '</div></div>' : '<div class="card"><div class="card-b">' + labsHtml() + '</div></div>') + '</div>';
    el.querySelectorAll('#osTabs [data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); }); });
    if (tab === 'jobs') wireJobs(all); if (tab === 'labs') wireLabs();
  }
  App.route('#/outsourced', function () { tab = 'dash'; sel = {}; render(); });
})();
