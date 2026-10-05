/* LabPOS — Dashboard module (#/dashboard) */
(function () {
  'use strict';

  function dayKey(d) { return String(d || '').slice(0, 10); }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function session() {
    try { return JSON.parse(localStorage.getItem('labpos_session') || '{}'); } catch (e) { return {}; }
  }
  function compact(n) {
    n = +n || 0;
    if (n >= 100000) return (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }
  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  var ICONS = {
    cash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    flask: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/></svg>',
    alert: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/></svg>'
  };

  function statCard(icon, tint, label, value, sub) {
    return '<div class="stat">' +
      '<div class="db-ic" style="background:var(--' + tint + '-soft);color:var(--' + tint + ')">' + icon + '</div>' +
      '<div class="db-sl">' + App.esc(label) + '</div>' +
      '<div class="db-sv">' + value + '</div>' +
      '<div class="db-ss">' + sub + '</div>' +
      '</div>';
  }

  App.route('/dashboard', function () {
    var s = session();
    var role = s.role || 'admin';
    var isTech = role === 'technician';
    var today = App.today();
    var invoices = DB.all('invoices') || [];
    var payments = DB.all('payments') || [];
    var results = DB.all('results') || [];
    var patients = DB.all('patients') || [];

    function pname(id) { var p = DB.get('patients', id); return p ? p.name : 'Walk-in'; }

    // ---- aggregates ----
    var payToday = payments.filter(function (p) { return dayKey(p.date) === today; });
    var todayCol = payToday.reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    var invToday = invoices.filter(function (i) { return dayKey(i.createdAt) === today; });
    var testsToday = invToday.reduce(function (a, i) { return a + (i.items ? i.items.length : 0); }, 0);
    var dueInvs = invoices.filter(function (i) { return (+i.due || 0) > 0; });
    var duesTotal = dueInvs.reduce(function (a, i) { return a + (+i.due || 0); }, 0);
    var mKey = today.slice(0, 7);
    var monthCol = payments.filter(function (p) { return dayKey(p.date).slice(0, 7) === mKey; })
      .reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    var pendingRes = results.filter(function (r) { return r.status === 'pending'; });
    var reportedToday = results.filter(function (r) { return r.status === 'ready' && dayKey(r.reportedAt) === today; }).length;
    var monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

    // ---- weekly chart (last 7 days) ----
    var week = [];
    for (var k = 6; k >= 0; k--) {
      var d = new Date(); d.setDate(d.getDate() - k);
      var key = ymd(d);
      var val = isTech
        ? invoices.filter(function (i) { return dayKey(i.createdAt) === key; })
            .reduce(function (a, i) { return a + (i.items ? i.items.length : 0); }, 0)
        : payments.filter(function (p) { return dayKey(p.date) === key; })
            .reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
      week.push({ key: key, label: d.toLocaleDateString('en-US', { weekday: 'short' }), val: val, isToday: key === today });
    }
    var maxV = Math.max.apply(null, week.map(function (w) { return w.val; }).concat([0]));
    var bars = week.map(function (w) {
      var h = maxV > 0 ? Math.max(6, Math.round(w.val / maxV * 100)) : 3;
      var vlab = isTech ? String(w.val) : 'Rs ' + compact(w.val);
      return '<div class="db-col">' +
        '<div class="db-val">' + vlab + '</div>' +
        '<div class="db-track"><div class="db-fill' + (w.isToday ? ' db-today' : '') + '" style="height:' + h + '%" title="' + App.esc(w.label + ': ' + (isTech ? w.val + ' tests' : App.money(w.val))) + '"></div></div>' +
        '<div class="db-day' + (w.isToday ? ' db-day-t' : '') + '">' + w.label + '</div>' +
        '</div>';
    }).join('');

    // ---- recent invoices (last 8) ----
    var recent = invoices.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 8);
    var rows = recent.map(function (i) {
      return '<tr>' +
        '<td><strong>' + App.esc(i.no || i.id) + '</strong><div class="db-sub">' + App.esc(App.d(i.createdAt)) + '</div></td>' +
        '<td>' + App.esc(pname(i.patientId)) + '</td>' +
        '<td>' + (i.items ? i.items.length : 0) + ' test' + ((i.items && i.items.length !== 1) ? 's' : '') + '</td>' +
        (isTech ? '' : '<td><strong>' + App.money(i.total) + '</strong>' + ((+i.due || 0) > 0 ? '<div class="db-sub db-due">Due ' + App.money(i.due) + '</div>' : '') + '</td>') +
        '<td>' + App.badge(i.status) + '</td>' +
        '<td class="actions"><a class="btn btn-ghost btn-sm" href="#/invoice/' + App.esc(i.id) + '">View</a></td>' +
        '</tr>';
    }).join('');

    // ---- pending lab results, grouped by invoice ----
    var byInv = {};
    pendingRes.forEach(function (r) {
      (byInv[r.invoiceId] = byInv[r.invoiceId] || []).push(r);
    });
    var pendList = Object.keys(byInv).slice(0, 6).map(function (invId) {
      var inv = DB.get('invoices', invId);
      var rs = byInv[invId];
      var names = rs.map(function (r) {
        var t = r.testId ? DB.get('tests', r.testId) : null;
        return t ? (t.code || t.name) : 'Test';
      });
      return '<div class="db-pend">' +
        '<div><strong>' + App.esc(inv ? (inv.no || inv.id) : invId) + '</strong>' +
        '<div class="db-sub">' + App.esc(inv ? pname(inv.patientId) : '') + ' &middot; ' + rs.length + ' pending</div>' +
        '<div class="db-tests">' + App.esc(names.slice(0, 4).join(', ')) + (names.length > 4 ? ' +' + (names.length - 4) : '') + '</div></div>' +
        '</div>';
    }).join('');

    // ---- stats per role ----
    var stats;
    if (isTech) {
      stats =
        statCard(ICONS.flask, 'brand', "Today's Tests", testsToday, invToday.length + ' invoices today') +
        statCard(ICONS.alert, 'amber', 'Pending Results', pendingRes.length, 'awaiting entry') +
        statCard(ICONS.check, 'green', 'Reported Today', reportedToday, 'results completed') +
        statCard(ICONS.users, 'blue', 'Total Patients', patients.length, 'registered');
    } else {
      stats =
        statCard(ICONS.cash, 'brand', "Today's Collection", App.money(todayCol), payToday.length + ' payments received') +
        statCard(ICONS.flask, 'blue', "Today's Tests", testsToday, invToday.length + ' invoices today') +
        statCard(ICONS.alert, 'amber', 'Pending Dues', App.money(duesTotal), dueInvs.length + ' invoices unpaid') +
        statCard(ICONS.cal, 'green', monthName + ' Collection', App.money(monthCol), 'this month');
    }

    var quick = isTech
      ? '<a class="btn btn-primary" href="#/results">Lab Results</a><a class="btn btn-ghost" href="#/tests">View Tests</a>'
      : '<a class="btn btn-primary" href="#/billing">+ New Bill</a><a class="btn btn-ghost" href="#/patients">+ Add Patient</a><a class="btn btn-ghost" href="#/expenses">+ Add Expense</a>';

    return '' +
    '<style>' +
    '.db-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}' +
    '.db-head h2{margin:0;font-size:24px;letter-spacing:-.02em}' +
    '.db-head p{margin:4px 0 0;color:var(--muted);font-size:14px}' +
    '.db-qa{display:flex;gap:10px;flex-wrap:wrap}' +
    '.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}' +
    '@media(max-width:1100px){.stat-grid{grid-template-columns:repeat(2,1fr)}}' +
    '@media(max-width:560px){.stat-grid{grid-template-columns:1fr}}' +
    '.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(15,30,46,.06)}' +
    '.db-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:12px}' +
    '.db-sl{font-size:13px;color:var(--muted);font-weight:600}' +
    '.db-sv{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:2px}' +
    '.db-ss{font-size:12.5px;color:var(--muted);margin-top:4px}' +
    '.db-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px}' +
    '@media(max-width:1000px){.db-grid{grid-template-columns:1fr}}' +
    '.db-sub{font-size:12px;color:var(--muted);margin-top:2px}' +
    '.db-due{color:var(--red);font-weight:700}' +
    '.db-tests{font-size:12.5px;color:var(--muted);margin-top:4px}' +
    '.db-pend{padding:12px 0;border-bottom:1px solid var(--line)}' +
    '.db-pend:last-child{border-bottom:none}' +
    '.db-foot{margin-top:12px}' +
    '.db-cols{display:flex;align-items:stretch;gap:8px;padding:8px 4px 0}' +
    '.db-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}' +
    '.db-val{font-size:11px;font-weight:700;color:var(--muted);white-space:nowrap}' +
    '.db-track{height:150px;width:100%;max-width:58px;background:#f1f5f9;border-radius:9px;display:flex;align-items:flex-end;overflow:hidden}' +
    '.db-fill{width:100%;background:linear-gradient(180deg,#14b8a6,#0f766e);border-radius:9px;transition:height .5s}' +
    '.db-fill.db-today{background:linear-gradient(180deg,#3b82f6,#1d4ed8)}' +
    '.db-day{font-size:12px;color:var(--muted);font-weight:600}' +
    '.db-day-t{color:var(--blue);font-weight:800}' +
    '</style>' +

    '<div class="db-head"><div><h2>' + greeting() + (s.name ? ', ' + App.esc(s.name) : '') + '</h2>' +
    '<p>' + App.esc(new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + ' &middot; Here is what is happening at the lab today.</p></div>' +
    '<div class="db-qa">' + quick + '</div></div>' +

    '<div class="stat-grid">' + stats + '</div>' +

    '<div class="db-grid">' +
      '<div class="card"><div class="card-h"><h3>Recent Invoices</h3><a class="btn btn-ghost btn-sm" href="#/invoices">View all</a></div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Patient</th><th>Tests</th>' + (isTech ? '' : '<th>Total</th>') + '<th>Status</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '') + '</tbody></table>' +
      (recent.length ? '' : App.empty('No invoices yet. Create your first bill to get started.')) +
      '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Pending Lab Results</h3><span class="badge b-pending">' + pendingRes.length + ' pending</span></div>' +
      '<div class="card-b">' + (pendList || App.empty('All caught up! No pending results.')) +
      (pendList ? '<div class="db-foot"><a class="btn btn-primary btn-sm" href="#/results" style="width:100%">Open Lab Results</a></div>' : '') +
      '</div></div>' +
    '</div>' +

    '<div class="card" style="margin-bottom:20px"><div class="card-h"><h3>' + (isTech ? 'Tests — Last 7 Days' : 'Collection — Last 7 Days') + '</h3>' +
    '<span class="db-sub">Total ' + (isTech ? week.reduce(function (a, w) { return a + w.val; }, 0) + ' tests' : App.money(week.reduce(function (a, w) { return a + w.val; }, 0))) + ' this week</span></div>' +
    '<div class="card-b"><div class="db-cols">' + bars + '</div></div></div>';
  });
})();
