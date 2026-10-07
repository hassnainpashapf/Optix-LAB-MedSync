/* Optix LAB MedSync — Audit Log (#/audit, admin only)
   Who created / changed / deleted what and when (written by the server, cannot be edited or deleted from the app).
   Filters: date range, user, area, action, search. Click a row for the field-by-field before/after. CSV export. */
(function () {
  'use strict';
  var esc = App.esc;
  var PAGE = 100;
  var F = { range: '7', from: '', to: '', user: '', table: '', action: '', q: '' };
  var data = null, rows = [], loading = false, err = '', timer = null;

  var TNAME = { patients: 'Patient', invoices: 'Invoice', payments: 'Payment', results: 'Lab result', tests: 'Test', doctors: 'Doctor', expenses: 'Expense',
    users: 'User', settings: 'Settings', report_templates: 'Report template', closings: 'Cash closing', auth: 'Sign-in', system: 'System' };
  var ACT = { create: ['Created', 'g'], update: ['Changed', 'b'], delete: ['Deleted', 'r'], login: ['Signed in', 'n'], login_failed: ['Failed sign-in', 'o'], bulk: ['Bulk save', 'p'], restore: ['Restore', 'r'], reseed: ['Reset', 'r'] };
  var FNAME = { name: 'Name', price: 'Price', amount: 'Amount', status: 'Status', phone: 'Phone', age: 'Age', gender: 'Gender', discount: 'Discount', total: 'Total', paid: 'Paid',
    values: 'Result values', role: 'Role', active: 'Active', username: 'Username', password: 'Password', labName: 'Lab name', note: 'Note', category: 'Category' };

  var CSS = '' +
    '.au-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}' +
    '.au-st{padding:14px 16px}.au-st .k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}.au-st b{display:block;font-size:24px;font-weight:800;margin-top:4px;color:var(--ink)}' +
    '.au-f{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:16px 18px}' +
    '.au-f label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--ink2);min-width:130qx}.au-f .grow{flex:1;min-width:200px}' +
    '.au-f .input,.au-f .select{height:38px;padding:0 10px}' +
    '.au-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap}' +
    '.au-chip.g{background:#e6f7f0;color:#047857}.au-chip.b{background:#e8f0fe;color:#1d4ed8}.au-chip.r{background:#fdecec;color:#b91c1c}.au-chip.n{background:#f1f5f9;color:#475569}.au-chip.o{background:#fef4e2;color:#b45309}.au-chip.p{background:#f3e8ff;color:#7e22ce}' +
    '.au-tbl tbody tr{cursor:pointer}.au-w{font-weight:700;color:var(--ink)}.au-sub{font-size:12px;color:var(--muted)}' +
    '.au-ch{font-size:12.5px;color:var(--ink2);max-width:420px}.au-ch s{color:#b91c1c;text-decoration:line-through;opacity:.8}.au-ch ins{color:#047857;text-decoration:none;font-weight:700}' +
    '.au-d{width:100%;border-collapse:collapse;margin-top:8px}.au-d th,.au-d td{padding:9px 10px;border-bottom:1px solid var(--line);font-size:13.5px;text-align:left;vertical-align:top}.au-d th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}' +
    '.au-d .from{color:#b91c1c;word-break:break-word}.au-d .to{color:#047857;font-weight:700;word-break:break-word}' +
    '.au-note{font-size:12.5px;color:var(--muted);padding:12px 18px}' +
    '@media(max-width:900px){.au-stats{grid-template-columns:1fr 1fr}.au-ch{max-width:none}}';
  function css() { if (document.getElementById('auCss')) return; var s = document.createElement('style'); s.id = 'auCss'; s.textContent = CSS; document.head.appendChild(s); }

  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function range() {
    var n = new Date(), from = '', to = '';
    if (F.range === 'custom') { from = F.from; to = F.to; }
    else if (F.range !== 'all') { var d = new Date(n.getTime() - (+F.range - 1) * 86400000); from = iso(d); to = iso(n); }
    return { from: from, to: to };
  }
  function qs(off, limit) {
    var r = range(), p = [];
    if (r.from) p.push('from=' + r.from); if (r.to) p.push('to=' + r.to);
    ['user', 'table', 'action', 'q'].forEach(function (k) { if (F[k]) p.push(k + '=' + encodeURIComponent(F[k])); });
    p.push('limit=' + (limit || PAGE)); p.push('offset=' + (off || 0));
    return p.join('&');
  }
  function api(path) {
    return fetch(window.LABPOS_API + '/api/' + path, { headers: DB.authHeaders ? DB.authHeaders({}) : {} }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 404) throw new Error('The Audit Log needs the latest version of the desktop app — download and install the update from the Downloads page.'); if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')')); return j; });
    });
  }
  var seq = 0;
  function load(more) {
    if (loading && more) return;
    var my = ++seq; /* the latest request wins: a slower, older answer (previous filters) is ignored */
    loading = true; err = '';
    api('audit?' + qs(more ? rows.length : 0)).then(function (j) {
      if (my !== seq) return;
      loading = false; data = j; rows = more ? rows.concat(j.rows) : j.rows; paint();
    }, function (e) { if (my !== seq) return; loading = false; err = e.message || 'Could not load the audit log'; paint(); });
  }
  function paint() { var v = document.getElementById('view'); if (v && /#\/audit/.test(location.hash)) { var keep = document.activeElement && document.activeElement.id; v.innerHTML = render(); wire(); if (keep && document.getElementById(keep)) { var e = document.getElementById(keep); e.focus(); try { e.setSelectionRange(e.value.length, e.value.length); } catch (x) {} } } }

  function tname(t) { return TNAME[t] || t; }
  function fname(f) { return FNAME[f] || f.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function when(ts) { var d = new Date(ts); return App.d(d) + ' <span class="au-sub">' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + '</span>'; }
  function preview(r) {
    var c = r.changes || [];
    if (r.action === 'create') return c.slice(0, 3).map(function (x) { return esc(fname(x.f)) + ': <ins>' + esc(x.to) + '</ins>'; }).join(' · ') + (c.length > 3 ? ' …' : '');
    if (r.action === 'delete') return '<span class="au-sub">' + (c.length ? 'Removed record' : '') + '</span>';
    return c.slice(0, 2).map(function (x) { return esc(fname(x.f)) + ': <s>' + esc(x.from || '—') + '</s> → <ins>' + esc(x.to || '—') + '</ins>'; }).join('<br>') + (c.length > 2 ? '<br><span class="au-sub">+' + (c.length - 2) + ' more</span>' : '');
  }

  function render() {
    css();
    var s = App.session();
    if (!s || s.role !== 'admin') return '<div class="card"><div class="card-b">' + App.empty('Only the lab admin can view the audit log.') + '</div></div>';
    if (!data && !err) { load(false); return '<div class="card"><div class="card-b">' + App.empty('Loading…') + '</div></div>'; }
    if (err && !data) return '<div class="card"><div class="card-b">' + App.empty(err) + '<div style="text-align:center;margin-top:8px"><button class="btn btn-primary" id="auRetry">Retry</button></div></div></div>';
    var users = data.users || {}, tables = data.tables || [];
    var h = '<div class="card" style="margin-bottom:16px"><div class="au-f">' +
      '<label>Period<select class="select" id="auRange">' + [['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time'], ['custom', 'Custom range']].map(function (o) { return '<option value="' + o[0] + '"' + (F.range === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      (F.range === 'custom' ? '<label>From<input type="date" class="input" id="auFrom" value="' + esc(F.from) + '"></label><label>To<input type="date" class="input" id="auTo" value="' + esc(F.to) + '"></label>' : '') +
      '<label>User<select class="select" id="auUser"><option value="">Everyone</option>' + Object.keys(users).map(function (k) { return '<option value="' + esc(k) + '"' + (F.user === k ? ' selected' : '') + '>' + esc(users[k]) + '</option>'; }).join('') + '</select></label>' +
      '<label>Area<select class="select" id="auTable"><option value="">All</option>' + tables.map(function (t) { return '<option value="' + esc(t) + '"' + (F.table === t ? ' selected' : '') + '>' + esc(tname(t)) + '</option>'; }).join('') + '</select></label>' +
      '<label>Action<select class="select" id="auAct"><option value="">All</option>' + Object.keys(ACT).map(function (a) { return '<option value="' + a + '"' + (F.action === a ? ' selected' : '') + '>' + ACT[a][0] + '</option>'; }).join('') + '</select></label>' +
      '<label class="grow">Search<input class="input" id="auQ" placeholder="Patient, invoice, value…" value="' + esc(F.q) + '"></label>' +
      '<button class="btn btn-ghost" id="auCsv">Export CSV</button></div></div>';
    h += '<div class="card"><div class="card-h"><h3>Activity</h3><span class="muted" style="font-size:13px">' + data.total + ' event' + (data.total === 1 ? '' : 's') + '</span><span class="sp"></span></div><div class="card-b flush">' +
      (rows.length ? '<div class="tbl-wrap"><table class="table au-tbl"><thead><tr><th>When</th><th>User</th><th>Action</th><th>What</th><th>Details</th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          var a = ACT[r.action] || [r.action, 'n'];
          return '<tr data-i="' + i + '"><td>' + when(r.ts) + '</td><td><span class="au-w">' + esc(r.user || '—') + '</span><div class="au-sub">' + esc(r.role || '') + '</div></td>' +
            '<td><span class="au-chip ' + a[1] + '">' + a[0] + '</span></td><td><span class="au-w">' + esc(tname(r.table)) + '</span><div class="au-sub">' + esc(r.label || r.rowId || '') + '</div></td><td class="au-ch">' + preview(r) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (rows.length < data.total ? '<div style="text-align:center;padding:14px"><button class="btn btn-ghost" id="auMore">Load more (' + (data.total - rows.length) + ' left)</button></div>' : '')
        : '<div class="card-b">' + App.empty('No activity found for these filters') + '</div>') +
      '</div><div class="au-note">The audit log is written by the server. Entries cannot be edited or deleted from the app and are kept for 365 days. Passwords and images are never recorded.</div></div>';
    return h;
  }

  function detail(r) {
    var a = ACT[r.action] || [r.action, 'n'], c = r.changes || [];
    var body = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><span class="au-chip ' + a[1] + '">' + a[0] + '</span><b>' + esc(tname(r.table)) + '</b><span class="muted">' + esc(r.label || r.rowId || '') + '</span></div>' +
      '<div class="muted" style="font-size:13px;margin-bottom:10px">' + esc(r.user || '—') + (r.role ? ' (' + esc(r.role) + ')' : '') + ' · ' + esc(new Date(r.ts).toLocaleString()) + (r.ip ? ' · ' + esc(r.ip) : '') + (r.rowId ? ' · ID ' + esc(r.rowId) : '') + '</div>' +
      (c.length ? '<table class="au-d"><thead><tr><th>Field</th><th>' + (r.action === 'create' ? '' : 'Before') + '</th><th>' + (r.action === 'delete' ? '' : 'After') + '</th></tr></thead><tbody>' +
        c.map(function (x) { return '<tr><td>' + esc(fname(x.f)) + '</td><td class="from">' + esc(x.from) + '</td><td class="to">' + esc(x.to) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">No field-level details recorded for this event.</p>') +
      (r.note ? '<p style="margin-top:10px">' + esc(r.note) + '</p>' : '');
    App.modal('Audit entry', body + '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-primary" id="auClose">Close</button></div>', { onOpen: function (ov, close) { ov.querySelector('#auClose').addEventListener('click', close); } });
  }

  function csv() {
    api('audit?' + qs(0, 5000)).then(function (j) {
      var out = [['Time', 'User', 'Role', 'Action', 'Area', 'Record', 'Label', 'Field', 'Before', 'After']];
      j.rows.forEach(function (r) {
        var base = [r.ts, r.user, r.role, r.action, r.table, r.rowId, r.label];
        if (r.changes && r.changes.length) r.changes.forEach(function (c) { out.push(base.concat([c.f, c.from, c.to])); }); else out.push(base.concat(['', '', '']));
      });
      var text = out.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; /* spreadsheet formulas from user-typed names must stay text */ return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = 'audit-log-' + iso(new Date()) + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, function (e) { App.toast(e.message, 'err'); });
  }

  function refetch() { err = ''; load(false); } /* keep the current table on screen (and the focused filter) until the new rows arrive */
  function wire() {
    var v = document.getElementById('view'); if (!v) return;
    function on(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
    on('auRetry', 'click', refetch);
    on('auRange', 'change', function (e) { F.range = e.target.value; if (F.range === 'custom' && !F.from) { F.from = iso(new Date(Date.now() - 6 * 86400000)); F.to = iso(new Date()); } refetch(); });
    on('auFrom', 'change', function (e) { F.from = e.target.value; refetch(); });
    on('auTo', 'change', function (e) { F.to = e.target.value; refetch(); });
    on('auUser', 'change', function (e) { F.user = e.target.value; refetch(); });
    on('auTable', 'change', function (e) { F.table = e.target.value; refetch(); });
    on('auAct', 'change', function (e) { F.action = e.target.value; refetch(); });
    on('auQ', 'input', function (e) { F.q = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(refetch, 350); });
    on('auMore', 'click', function () { load(true); });
    on('auCsv', 'click', csv);
    Array.prototype.forEach.call(v.querySelectorAll('.au-tbl tbody tr'), function (tr) { tr.addEventListener('click', function () { var r = rows[+tr.getAttribute('data-i')]; if (r) detail(r); }); });
  }

  App.route('/audit', function () { data = null; rows = []; err = ''; return render(); });
})();
