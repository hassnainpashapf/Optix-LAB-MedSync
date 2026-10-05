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
      '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft);--sc-c:var(--' + tint + ')">' + icon + '</div>' +
      '<div class="stat-tx"><div class="lb">' + App.esc(label) + '</div>' +
      '<div class="vl">' + value + '</div>' +
      '<div class="dl">' + sub + '</div></div>' +
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

    // ---- today vs yesterday collection trend ----
    var yDate = new Date(); yDate.setDate(yDate.getDate() - 1);
    var yestCol = payments.filter(function (p) { return dayKey(p.date) === ymd(yDate); })
      .reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    var colDelta;
    if (yestCol > 0) {
      var colPct = Math.round((todayCol - yestCol) / yestCol * 100);
      colDelta = colPct >= 0
        ? '<span class="db-up">&#9650; ' + colPct + '% vs yesterday</span>'
        : '<span class="db-down">&#9660; ' + Math.abs(colPct) + '% vs yesterday</span>';
    } else {
      colDelta = '<span class="db-flat">&mdash; vs yesterday</span>';
    }

    // ---- top tests this month (by billed item count) ----
    var monthInvs = invoices.filter(function (i) { return dayKey(i.createdAt).slice(0, 7) === mKey; });
    var testAgg = {};
    monthInvs.forEach(function (i) {
      (i.items || []).forEach(function (it) {
        var key = it.testId || it.code || it.name || 'unknown';
        var e = testAgg[key] = testAgg[key] || { testId: it.testId, code: it.code, name: it.name, count: 0, revenue: 0 };
        e.count += 1;
        e.revenue += (+it.price || 0);
      });
    });
    var topTests = Object.keys(testAgg).map(function (k) { return testAgg[k]; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    var topTestRows = topTests.map(function (e, ix) {
      var t = e.testId ? DB.get('tests', e.testId) : null;
      var nm = t ? ((t.code ? t.code + ' \u2014 ' : '') + t.name) : (e.name || e.code || 'Test');
      return '<tr><td><span class="db-rank">' + (ix + 1) + '</span></td>' +
        '<td><strong>' + App.esc(nm) + '</strong></td>' +
        '<td>' + e.count + ' billed</td>' +
        (isTech ? '' : '<td style="text-align:right"><strong>' + App.money(e.revenue) + '</strong></td>') +
        '</tr>';
    }).join('');

    // ---- top referring doctors this month ----
    var docAgg = {};
    monthInvs.forEach(function (i) {
      if (!i.doctorId) return;
      var e = docAgg[i.doctorId] = docAgg[i.doctorId] || { count: 0, revenue: 0 };
      e.count += 1;
      e.revenue += (+i.total || 0);
    });
    var topDocs = Object.keys(docAgg).map(function (id) {
      var d = DB.get('doctors', id);
      var pct = d ? (+d.commissionPct || 0) : 0;
      return { name: d ? d.name : 'Doctor', clinic: d ? (d.clinic || '') : '',
               count: docAgg[id].count, comm: Math.round(docAgg[id].revenue * pct / 100) };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    var topDocRows = topDocs.map(function (d) {
      return '<tr>' +
        '<td><strong>' + App.esc(d.name) + '</strong>' + (d.clinic ? '<div class="db-sub">' + App.esc(d.clinic) + '</div>' : '') + '</td>' +
        '<td>' + d.count + ' referral' + (d.count !== 1 ? 's' : '') + '</td>' +
        (isTech ? '' : '<td style="text-align:right"><strong>' + App.money(d.comm) + '</strong></td>') +
        '</tr>';
    }).join('');

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
        statCard(ICONS.cash, 'brand', "Today's Collection", App.money(todayCol), payToday.length + ' payments received &middot; ' + colDelta) +
        statCard(ICONS.flask, 'blue', "Today's Tests", testsToday, invToday.length + ' invoices today') +
        statCard(ICONS.alert, 'amber', 'Pending Dues', App.money(duesTotal), dueInvs.length + ' invoices unpaid') +
        statCard(ICONS.cal, 'green', monthName + ' Collection', App.money(monthCol), 'this month');
    }

    var quick = isTech
      ? '<a class="btn btn-primary" href="#/results">Lab Results</a><a class="btn btn-ghost" href="#/tests">View Tests</a>'
      : '<a class="btn btn-primary" href="#/billing">+ New Bill</a><a class="btn btn-blue" href="#/patients">+ Add Patient</a><a class="btn btn-amber" href="#/expenses">+ Add Expense</a>';

    return '' +
    '<style>' +
    '.db-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}' +
    '.db-head h2{margin:0;font-size:24px;letter-spacing:-.02em}' +
    '.db-head p{margin:4px 0 0;color:var(--muted);font-size:14px}' +
    '.db-qa{display:flex;gap:10px;flex-wrap:wrap}' +
    '.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}' +
    '@media(max-width:1100px){.stat-grid{grid-template-columns:repeat(2,1fr)}}' +
    '@media(max-width:560px){.stat-grid{grid-template-columns:1fr}}' +
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
    '.db-up{color:var(--green);font-weight:700;white-space:nowrap}' +
    '.db-down{color:var(--red);font-weight:700;white-space:nowrap}' +
    '.db-flat{color:var(--muted);font-weight:600;white-space:nowrap}' +
    '.db-rank{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--brand-soft);color:var(--brand-d);font-weight:800;font-size:12px}' +
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

    '<div class="db-grid">' +
      '<div class="card"><div class="card-h"><h3>Top Tests &mdash; This Month</h3><a class="btn btn-ghost btn-sm" href="#/tests">View all</a></div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr><th></th><th>Test</th><th>Billed</th>' + (isTech ? '' : '<th style="text-align:right">Revenue</th>') + '</tr></thead>' +
      '<tbody>' + (topTestRows || '') + '</tbody></table>' +
      (topTests.length ? '' : App.empty('No bills this month yet.')) +
      '</div></div>' +
      '<div class="card"><div class="card-h"><h3>Top Referring Doctors</h3><a class="btn btn-ghost btn-sm" href="#/doctors">View all</a></div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr><th>Doctor</th><th>Referrals</th>' + (isTech ? '' : '<th style="text-align:right">Commission Due</th>') + '</tr></thead>' +
      '<tbody>' + (topDocRows || '') + '</tbody></table>' +
      (topDocs.length ? '' : App.empty('No referrals this month yet.')) +
      '</div></div>' +
    '</div>' +

    '<div class="card" style="margin-bottom:20px"><div class="card-h"><h3>' + (isTech ? 'Tests — Last 7 Days' : 'Collection — Last 7 Days') + '</h3>' +
    '<span class="db-sub">Total ' + (isTech ? week.reduce(function (a, w) { return a + w.val; }, 0) + ' tests' : App.money(week.reduce(function (a, w) { return a + w.val; }, 0))) + ' this week</span></div>' +
    '<div class="card-b"><div class="db-cols">' + bars + '</div></div></div>';
  });
})();
