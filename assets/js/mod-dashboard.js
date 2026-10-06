/* Optix LAB MedSync — Dashboard module (#/dashboard)
   Simplified layout (2026-10-06): stat cards row, quick-access cards,
   Recent Patients, Tests in Progress. All graphs/charts removed. */
(function () {
  'use strict';

  function dayKey(d) { return String(d || '').slice(0, 10); }
  function session() {
    try { return JSON.parse(localStorage.getItem('labpos_session') || '{}'); } catch (e) { return {}; }
  }

  var ICONS = {
    cash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    flask: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/></svg>',
    alert: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/></svg>'
  };

  function statCard(icon, tint, label, value, sub, raw, isMoney) {
    var countAttrs = (typeof raw === 'number' && isFinite(raw))
      ? ' data-count="' + raw + '" data-money="' + (isMoney ? '1' : '0') + '"'
      : '';
    return '<div class="stat" data-tint="' + tint + '" style="--sc:var(--' + tint + ')">' +
      '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft)">' + icon + '</div>' +
      '<div class="lb">' + App.esc(label) + '</div>' +
      '<div class="vl"' + countAttrs + '>' + value + '</div>' +
      '<div class="dl">' + sub + '</div>' +
      '</div>';
  }

  App.route('/dashboard', function () {
    var s = session();
    var role = s.role || 'admin';
    var isTech = role === 'technician';

    /* ---------- loading skeletons (CSS-only shimmer, shown while content computes) ---------- */
    var SKEL_CSS =
      '<style>' +
      '.db-skel .sk{position:relative;overflow:hidden;background:#e9eef6;border-radius:8px}' +
      '.db-skel .sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);' +
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);' +
      'animation:dbShimmer 1.15s infinite}' +
      '@keyframes dbShimmer{to{transform:translateX(100%)}}' +
      '@media (prefers-reduced-motion:reduce){.db-skel .sk::after{animation:none;transform:none}}' +
      '.db-skel .stat{min-height:118px;box-shadow:none}' +
      '.db-skel .stat-ico{border-radius:50%;width:32px;height:32px}' +
      '</style>';

    function skelStat() {
      return '<div class="stat"><div class="stat-ico sk"></div>' +
        '<div class="lb sk" style="height:10px;width:62%"></div>' +
        '<div class="vl sk" style="height:20px;width:48%"></div>' +
        '<div class="dl sk" style="height:11px;width:84%"></div></div>';
    }
    function skelRows(n) {
      var out = '';
      for (var i = 0; i < n; i++) out += '<div class="sk" style="height:14px;margin:12px 0;width:' + (92 - i * 6) + '%"></div>';
      return out;
    }
    function skelCard(titleW) {
      return '<div class="card"><div class="card-h"><div class="sk" style="height:15px;width:' + titleW + 'px"></div></div>' +
        '<div class="card-b">' + skelRows(4) + '</div></div>';
    }
    function skeletonHtml() {
      var qa = '';
      for (var i = 0; i < 6; i++) qa += '<div class="sk" style="height:66px"></div>';
      return '<div class="db-page db-skel" data-db-skel="1">' + SKEL_CSS +
        '<div class="stat-grid">' + skelStat() + skelStat() + skelStat() + skelStat() + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:14px">' + qa + '</div>' +
        '<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px">' +
        skelCard(150) + skelCard(170) + '</div>' +
        '</div>';
    }

    /* count-up stat values — runs after the real content is painted */
    function scheduleCountUp() {
      function fmt(raw, isMoney) {
        raw = Math.round(raw);
        return isMoney ? 'Rs ' + raw.toLocaleString('en-US') : String(raw);
      }
      function run() {
        var els = document.querySelectorAll('#view .stat .vl[data-count]');
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        for (var i = 0; i < els.length; i++) (function (el) {
          var target = parseFloat(el.getAttribute('data-count')) || 0;
          var isMoney = el.getAttribute('data-money') === '1';
          if (reduce || target <= 0) { el.textContent = fmt(target, isMoney); return; }
          var t0 = null, dur = 900;
          function step(ts) {
            if (!t0) t0 = ts;
            var p = Math.min(1, (ts - t0) / dur);
            var e = 1 - Math.pow(1 - p, 3);
            el.textContent = fmt(target * e, isMoney);
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        })(els[i]);
      }
      if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(run); });
      else setTimeout(run, 40);
    }

    /* ---------- full dashboard render (deferred until the skeleton has painted) ---------- */
    function buildDashboard() {
    var today = App.today();
    var invoices = DB.all('invoices') || [];
    var payments = DB.all('payments') || [];
    var results = DB.all('results') || [];
    var patients = DB.all('patients') || [];

    // ---- aggregates ----
    var payToday = payments.filter(function (p) { return dayKey(p.date) === today; });
    var todayCol = payToday.reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    var invToday = invoices.filter(function (i) { return dayKey(i.createdAt) === today; });
    var testsToday = invToday.reduce(function (a, i) { return a + (i.items ? i.items.length : 0); }, 0);
    var pendingRes = results.filter(function (r) { return r.status === 'pending'; });
    var reportedToday = results.filter(function (r) { return r.status === 'ready' && dayKey(r.reportedAt) === today; }).length;
    var mKey = today.slice(0, 7);
    var monthPatients = patients.filter(function (p) { return dayKey(p.createdAt).slice(0, 7) === mKey; }).length;

    // ---- stat cards row (top stats, no charts) ----
    var stats;
    if (isTech) {
      stats =
        statCard(ICONS.flask, 'blue', "Today's Tests", String(testsToday), invToday.length + ' invoices today', testsToday, false) +
        statCard(ICONS.alert, 'amber', 'Pending Results', String(pendingRes.length), 'awaiting entry', pendingRes.length, false) +
        statCard(ICONS.check, 'green', 'Reported Today', String(reportedToday), 'results completed', reportedToday, false) +
        statCard(ICONS.users, 'brand', 'Total Patients', String(patients.length), monthPatients + ' new this month', patients.length, false);
    } else {
      stats =
        statCard(ICONS.cash, 'brand', "Today's Collection", App.money(todayCol), payToday.length + ' payments today', todayCol, true) +
        statCard(ICONS.flask, 'blue', "Today's Tests", String(testsToday), invToday.length + ' invoices today', testsToday, false) +
        statCard(ICONS.alert, 'amber', 'Pending Results', String(pendingRes.length), 'awaiting entry', pendingRes.length, false) +
        statCard(ICONS.users, 'green', 'Total Patients', String(patients.length), monthPatients + ' new this month', patients.length, false);
    }

    // ---- quick-access cards — 6 shortcuts ----
    var quickCss =
    '<style>' +
    '.dbw-grid{display:grid;grid-template-columns:repeat(' + (isTech ? 6 : 7) + ',1fr);gap:12px;margin-bottom:14px}' +
    '.dbq-card{transition:transform .15s,box-shadow .15s}.dbq-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(15,30,46,.12)}' +
    '.dbq-card .card-b{padding:10px 12px!important}' +
    '.dbq-card b{font-size:13px!important}.dbq-card small{font-size:11px!important}' +
    '@media(max-width:1200px){.dbw-grid{grid-template-columns:repeat(3,1fr)}}' +
    '@media(max-width:900px){.dbw-grid{grid-template-columns:1fr}}' +
    '</style>';
    var quickAccess =
    '<div class="dbw-grid">' +
      '<a href="#/patients" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#22c55e1a;color:#22c55e;display:grid;place-items:center;flex:none">' + App.icon('users', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Patients</b><br><small style="color:var(--muted)">Manage patient records</small></span>' +
        '</div></a>' +
      '<a href="#/results" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#8b5cf61a;color:#8b5cf6;display:grid;place-items:center;flex:none">' + App.icon('clipboard', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Lab Results</b><br><small style="color:var(--muted)">Enter & view results</small></span>' +
        '</div></a>' +
      '<a href="#/tests" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#14b8a61a;color:#14b8a6;display:grid;place-items:center;flex:none">' + App.icon('flask', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Tests</b><br><small style="color:var(--muted)">Test catalog & prices</small></span>' +
        '</div></a>' +
      '<a href="#/invoices" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#f973161a;color:#f97316;display:grid;place-items:center;flex:none">' + App.icon('file', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Invoices</b><br><small style="color:var(--muted)">Billing & payments</small></span>' +
        '</div></a>' +
      '<a href="#/reports" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#6366f11a;color:#6366f1;display:grid;place-items:center;flex:none">' + App.icon('chart', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Reports</b><br><small style="color:var(--muted)">Analytics & insights</small></span>' +
        '</div></a>' +
      (isTech ? '' : '<a href="#/finance" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#0ea5a41a;color:#0ea5a4;display:grid;place-items:center;flex:none">' + App.icon('finance', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Cash &amp; Profit</b><br><small style="color:var(--muted)">Day closing &amp; P&amp;L</small></span>' +
        '</div></a>') +
      '<a href="#/settings" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#64748b1a;color:#64748b;display:grid;place-items:center;flex:none">' + App.icon('gear', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Settings</b><br><small style="color:var(--muted)">Lab profile & config</small></span>' +
        '</div></a>' +
    '</div>';

    /* Recent Patients — latest 5 added */
    var recentPats = patients.slice().sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }).slice(0, 5);
    var patRows = recentPats.map(function (p) {
      var nm = p.name || 'Patient';
      var init = App.esc(nm.charAt(0).toUpperCase());
      return '<a href="#/patient/' + p.id + '" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);text-decoration:none">' +
        '<span style="width:34px;height:34px;border-radius:50%;background:#22c55e1a;color:#22c55e;display:grid;place-items:center;font-weight:700;flex:none">' + init + '</span>' +
        '<span style="flex:1"><b style="font-size:13px;color:var(--ink)">' + App.esc(nm) + '</b><br>' +
        '<small style="color:var(--muted)">' + App.esc(p.phone || p.cnic || '') + '</small></span>' +
        '<small style="color:var(--muted)">' + App.esc(App.dt(p.createdAt) || '') + '</small></a>';
    }).join('');
    var patCard = '<div class="card"><div class="card-h"><h3>Recent Patients</h3><a class="btn btn-ghost btn-sm" href="#/patients">View all</a></div>' +
      '<div class="card-b">' + (patRows || App.empty('No patients yet.')) + '</div></div>';

    /* Tests in Progress — pending results */
    var pendRes = results.filter(function (r) { return !r.value && r.status !== 'ready'; })
      .sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); }).slice(0, 5);
    var pendRows = pendRes.map(function (r) {
      var p = DB.get('patients', r.patientId) || {};
      var t = DB.get('tests', r.testId) || {};
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">' +
        '<span style="width:34px;height:34px;border-radius:10px;background:#8b5cf61a;color:#8b5cf6;display:grid;place-items:center;flex:none">' + App.icon('flask', 16) + '</span>' +
        '<span style="flex:1"><b style="font-size:13px;color:var(--ink)">' + App.esc(t.name || r.testName || 'Test') + '</b><br>' +
        '<small style="color:var(--muted)">' + App.esc(p.name || '') + '</small></span>' +
        '<span class="badge badge-warn">Pending</span></div>';
    }).join('');
    var pendCard = '<div class="card"><div class="card-h"><h3>Tests in Progress</h3><a class="btn btn-ghost btn-sm" href="#/results">View all</a></div>' +
      '<div class="card-b">' + (pendRows || App.empty('No pending tests.')) + '</div></div>';

    return '<div class="db-page">' +
    '<style>' +
    '/* ===== Dashboard website-matched theme (scoped, navy/blue medical) ===== */' +
    '.db-page{--brand:#131845;--brand-d:#0e1138;--brand-soft:#e9edf9;--brand-line:#c9d4f2;' +
    '--brand-grad:linear-gradient(135deg,#2b3a7a 0%,#131845 60%,#0d1030 100%);' +
    '--blue:#5392ba;--blue-soft:#ebf4f8;' +
    '--ink:#131845;--ink2:#2a2f38;--muted:#5b6b80;--faint:#8a94a6;' +
    '--line:#e3ecf7;--line2:#edf2f9;--bg:#f4f7fc;--card:#ffffff;' +
    '--sh-sm:0 2px 8px rgba(19,24,69,.06);--sh-md:0 18px 45px rgba(11,23,64,.10);' +
    'font-family:"Plus Jakarta Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink)}' +
    '.db-page .stat{border-radius:20px;box-shadow:0 18px 45px rgba(11,23,64,.10);border:1px solid #eef3fa}' +
    '.db-page .stat[data-tint="brand"]{--sc-line:#c9d4f2;--sc-soft:#e9edf9}' +
    '.db-page .stat[data-tint="blue"]{--sc-line:#c9e2f2;--sc-soft:#ebf4f8}' +
    '.db-page .stat-ico{border-radius:50%;box-shadow:inset 0 0 0 1px var(--sc-line),0 4px 10px rgba(11,23,64,.08)}' +
    '.db-page .stat .vl{color:var(--ink)}' +
    '.db-page .stat .lb{color:var(--muted)}' +
    '.db-page .card{border-radius:20px;box-shadow:0 18px 45px rgba(11,23,64,.10);border:2px solid var(--bd) !important}' +
    '.db-page .card-h h3{color:var(--ink);font-weight:800;letter-spacing:-.01em}' +
    '</style>' +
    '<style>' +
    '/* shared compact stat card CSS now in app.css */' +
    '.stat .dl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '.db-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px}' +
    '@media(max-width:1000px){.db-grid{grid-template-columns:1fr}}' +
    '.db-grid .card-h h3{font-size:16.5px;font-weight:700;letter-spacing:-.01em}' +
    '@media (prefers-reduced-motion:reduce){.stat{animation:none}.stat:hover{transform:none}}' +
    '</style>' +

    '<div class="stat-grid">' + stats + '</div>' +

    quickCss + quickAccess +

    critCard() +
    '<div class="db-grid">' + patCard + pendCard + '</div>' +
    '</div>';
    } /* end buildDashboard */

    /* Critical results nobody has acknowledged yet (set when a result far outside the normal range is saved) */
    function critCard() {
      var crits = DB.all('results').filter(function (r) { return r.critical && r.critical.length && !r.criticalAck; })
        .sort(function (a, b) { return String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')); });
      if (!crits.length) return '';
      var rows = crits.slice(0, 8).map(function (r) {
        var inv = DB.get('invoices', r.invoiceId) || {}, p = DB.get('patients', inv.patientId) || {}, t = DB.get('tests', r.testId) || {};
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #fecaca;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:200px"><b style="color:#991b1b">' + App.esc(p.name || '—') + '</b> <span style="color:#7f1d1d;font-size:12.5px">· ' + App.esc(inv.no || inv.id || '') + ' · ' + App.esc(t.name || '') + '</span><br>' +
          r.critical.map(function (c) { return '<span style="display:inline-block;margin:3px 8px 0 0;font-size:13px"><b>' + App.esc(c.name) + '</b> <span style="color:#b91c1c;font-weight:800">' + (c.dir === 'high' ? '&uarr; ' : '&darr; ') + App.esc(c.value) + ' ' + App.esc(c.unit || '') + '</span></span>'; }).join('') + '</div>' +
          '<small style="color:#7f1d1d">' + App.esc(App.dt(r.reportedAt) || '') + '</small>' +
          '<button class="btn btn-sm btn-danger" data-ack="' + App.esc(r.id) + '">Acknowledge</button></div>';
      }).join('');
      return '<div class="card" style="margin-bottom:16px;background:#fff5f5"><div class="card-h"><h3 style="color:#991b1b">🚨 Critical results (' + crits.length + ')</h3>' +
        '<span class="muted" style="font-size:12.5px">Inform the doctor, then acknowledge.</span></div><div class="card-b">' + rows + '</div></div>';
    }
    function wireCrit(v) {
      v.querySelectorAll('[data-ack]').forEach(function (b) {
        b.addEventListener('click', function () {
          DB.update('results', b.getAttribute('data-ack'), { criticalAck: { by: (session() || {}).name || 'user', at: new Date().toISOString() } });
          v.innerHTML = buildDashboard(); wireCrit(v); scheduleCountUp();
        });
      });
    }

    /* paint skeleton now; render full content right after it paints */
    setTimeout(function () {
      var v = document.getElementById('view');
      if (!v || !v.querySelector('[data-db-skel]')) return; /* user navigated away */
      v.innerHTML = buildDashboard();
      wireCrit(v);
      scheduleCountUp();
    }, 120);

    return skeletonHtml();
  });
})();
