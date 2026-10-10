/* Optix Medical Sync — Dashboard module (#/dashboard)
   Layout: stat cards row, quick-access cards, two big 7-day graph cards
   (collections vs expenses / tests & invoices), Recent Patients, Tests in Progress. */
(function () {
  'use strict';

  function dayKey(d) { return String(d || '').slice(0, 10); }
  function session() {
    try { return JSON.parse(localStorage.getItem('labpos_session') || '{}'); } catch (e) { return {}; }
  }

  var ICONS = {
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/></svg>'
  };

  var STAT_TINTS = {
    brand: { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#a9c9ec', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e9cb96', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#9fd8b8', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e6aaaa', soft: '#fdecec', circle: '#fad2d2' }
  };

  function statCard(icon, tint, label, value, sub, raw, isMoney) {
    var countAttrs = (typeof raw === 'number' && isFinite(raw))
      ? ' data-count="' + raw + '" data-money="' + (isMoney ? '1' : '0') + '"'
      : '';
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:1.5px solid ' + c.line + ' !important;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
      '<div style="position:absolute;top:-30px;right:-30px;width:90px;height:90px;border-radius:50%;background:' + c.circle + ';opacity:0.65;pointer-events:none"></div>' +
      '<div class="stat-ico" style="position:relative;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:' + c.sc + ';background:linear-gradient(135deg,' + c.soft + ' 0%,#ffffff 160%);box-shadow:inset 0 0 0 1px ' + c.line + ',0 1px 3px rgba(15,30,46,.06);margin-bottom:6px;flex:0 0 auto">' + icon + '</div>' +
      '<div class="lb" style="position:relative;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;flex:0 0 auto">' + App.esc(label) + '</div>' +
      '<div class="vl"' + countAttrs + ' style="position:relative;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 0 4px 0;flex:0 0 auto">' + value + '</div>' +
      '<div class="dl" style="position:relative;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">' + sub + '</div>' +
      '</div>';
  }

  App.route('/dashboard', function () {
    var s = session();
    var role = s.role || 'admin';
    var isTech = role === 'technician' || (App.hideMoney && App.hideMoney());

    /* ---------- loading skeletons (CSS-only shimmer, shown while content computes) ---------- */
    var SKEL_CSS =
      '<style>' +
      '.db-skel .sk{position:relative;overflow:hidden;background:#e9eef6;border-radius:8px}' +
      '.db-skel .sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);' +
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);' +
      'animation:dbShimmer 1.15s infinite}' +
      '@keyframes dbShimmer{to{transform:translateX(100%)}}' +
      '@media (prefers-reduced-motion:reduce){.db-skel .sk::after{animation:none;transform:none}}' +
      '.db-skel .stat{min-height:128px;height:128px;box-shadow:none}' +
      '.db-skel .stat-ico{border-radius:10px;width:34px;height:34px}' +
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
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' + '<div class="sk" style="height:330px;border-radius:20px"></div><div class="sk" style="height:330px;border-radius:20px"></div></div>' +
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
        var els = document.querySelectorAll('#view .stat .vl[data-count], #view .kpi .kpi-nm[data-count]');
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
    var _rtSeen = {};
    var reportedToday = results.filter(function (r) {
      if (r.status !== 'ready' || dayKey(r.reportedAt) !== today) return false;
      var k = r.invoiceId + '|' + r.testId; if (_rtSeen[k]) return false; _rtSeen[k] = 1; return true;   /* one per test, even if saved twice */
    }).length;
    var mKey = today.slice(0, 7);
    var monthPatients = patients.filter(function (p) { return dayKey(p.createdAt).slice(0, 7) === mKey; }).length;

    // ---- stat cards row (top stats, no charts) ----
    var stats;
    if (isTech) {
      stats =
        statCard(ICONS.flask, 'blue', "Today's Tests", String(testsToday), invToday.length + ' invoices today', testsToday, false) +
        statCard(ICONS.check, 'green', 'Reported Today', String(reportedToday), 'results completed', reportedToday, false) +
        statCard(ICONS.alert, 'amber', 'Pending Results', String(pendingRes.length), 'awaiting entry', pendingRes.length, false) +
        statCard(ICONS.users, 'brand', 'Total Patients', String(patients.length), monthPatients + ' new this month', patients.length, false);
    } else {
      stats =
        statCard(ICONS.cash, 'blue', "Today's Collection", App.money(todayCol), payToday.length + ' payments today', todayCol, true) +
        statCard(ICONS.flask, 'green', "Today's Tests", String(testsToday), invToday.length + ' invoices today', testsToday, false) +
        statCard(ICONS.alert, 'amber', 'Pending Results', String(pendingRes.length), 'awaiting entry', pendingRes.length, false) +
        statCard(ICONS.users, 'brand', 'Total Patients', String(patients.length), monthPatients + ' new this month', patients.length, false);
    }

    // ---- quick-access cards ----
    var quickCss =
    '<style>' +
    '.dbw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px;align-items:stretch}' +
    '.dbq-card{display:flex;flex-direction:column;height:100%;min-height:96px;transition:transform .15s,box-shadow .15s}.dbq-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(15,30,46,.12)}' +
    '.dbq-card .card-b{padding:10px!important;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;gap:6px!important;box-sizing:border-box}' +
    '.dbq-card .card-b>span:first-child{width:32px!important;height:32px!important;border-radius:9px!important}.dbq-card .card-b>span:first-child svg{width:18px;height:18px}' +
    '.dbq-card .card-b>span:last-child{width:100%;min-width:0;overflow-wrap:break-word}' +
    '.dbq-card b{display:block;font-size:13px!important;line-height:1.3!important}.dbq-card br{display:none}.dbq-card small{font-size:11px!important;line-height:1.3!important;display:block;margin-top:3px}' +
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
      '<a href="#/samples/home" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#06b6d41a;color:#0891b2;display:grid;place-items:center;flex:none">' + App.icon('box', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Home Sampling &amp; Dispatch</b><br><small style="color:var(--muted)">Book and track home collections</small></span>' +
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
      '<a href="#/reports/tests" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#6366f11a;color:#6366f1;display:grid;place-items:center;flex:none">' + App.icon('chart', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Reports</b><br><small style="color:var(--muted)">Analytics & insights</small></span>' +
        '</div></a>' +
      (isTech ? '' : '<a href="#/finance" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#0ea5a41a;color:#0ea5a4;display:grid;place-items:center;flex:none">' + App.icon('finance', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Close Day</b><br><small style="color:var(--muted)">Daily cash register closing</small></span>' +
        '</div></a>') +
      '<a href="#/settings" class="card dbq-card" style="text-decoration:none">' +
        '<div class="card-b" style="display:flex;align-items:center;gap:12px">' +
          '<span style="width:44px;height:44px;border-radius:12px;background:#64748b1a;color:#64748b;display:grid;place-items:center;flex:none">' + App.icon('gear', 22) + '</span>' +
          '<span><b style="font-size:15px;color:var(--ink)">Settings</b><br><small style="color:var(--muted)">Report form, users & more</small></span>' +
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


    /* ---------- two big graph cards: last 7 days (hand-drawn SVG, no libraries) ---------- */
    function localDay(v) { var d = new Date(v); if (isNaN(d)) return ''; return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    var DAYS7 = [], DNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    (function () { var n = new Date(); for (var i = 6; i >= 0; i--) { var d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - i); DAYS7.push({ key: localDay(d), label: DNAMES[d.getDay()], num: d.getDate() }); } })();
    function perDay(rows, dateOf, valOf) {
      var m = {}; DAYS7.forEach(function (d) { m[d.key] = 0; });
      rows.forEach(function (r) { var k = localDay(dateOf(r)); if (m.hasOwnProperty(k)) m[k] += valOf(r); });
      return DAYS7.map(function (d) { return m[d.key]; });
    }
    function niceMax(v) {
      if (v <= 0) return 10;
      var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
      return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    }
    function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
    function short(n) { return n >= 1000000 ? (Math.round(n / 100000) / 10) + 'M' : (n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(Math.round(n))); }
    /* bars (one or two series) + optional line; W/H = viewBox */
    function chartSvg(o) {
      var W = 640, H = 270, L = 46, R = 14, T = 16, B = 34, iw = W - L - R, ih = H - T - B, n = DAYS7.length;
      var all = []; o.bars.forEach(function (b) { all = all.concat(b.data); }); if (o.line) all = all.concat(o.line.data);
      var max = niceMax(Math.max.apply(null, all.concat([0]))), step = iw / n, g = '', i, k;
      for (k = 0; k <= 4; k++) { var y = T + ih - ih * k / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e3ecf7" stroke-width="1"' + (k ? ' stroke-dasharray="3 4"' : '') + '/>' + '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#8a94a6">' + (o.money ? short(max * k / 4) : Math.round(max * k / 4)) + '</text>'; }
      var nb = o.bars.length, bw = Math.min(30, step / (nb + 1.1)), bars = '';
      for (i = 0; i < n; i++) {
        var cx = L + step * i + step / 2;
        o.bars.forEach(function (b, bi) {
          var v = b.data[i], h = ih * v / max, x = cx - (nb * bw) / 2 + bi * bw + (bi ? 2 : 0), tip = DAYS7[i].label + ' ' + DAYS7[i].num + ' — ' + b.name + ': ' + (o.money ? 'Rs ' + Math.round(v).toLocaleString('en-US') : v);
          bars += '<rect class="dbc-bar" x="' + x + '" y="' + (T + ih - h) + '" width="' + (bw - (bi ? 2 : 0)) + '" height="' + Math.max(h, v > 0 ? 2 : 0) + '" rx="5" fill="' + b.color + '" style="animation-delay:' + (i * 55 + bi * 90) + 'ms"><title>' + tip + '</title></rect>';
        });
        g += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11.5" fill="' + (DAYS7[i].key === today ? '#131845' : '#8a94a6') + '" font-weight="' + (DAYS7[i].key === today ? '800' : '600') + '">' + DAYS7[i].label + ' ' + DAYS7[i].num + '</text>';
      }
      var line = '';
      if (o.line) {
        var pts = o.line.data.map(function (v, idx) { return [L + step * idx + step / 2, T + ih - ih * v / max, v, idx]; });
        var d = pts.map(function (q, idx) { return (idx ? 'L' : 'M') + q[0] + ' ' + q[1]; }).join(' ');
        line = '<path d="' + d + ' L' + pts[pts.length - 1][0] + ' ' + (T + ih) + ' L' + pts[0][0] + ' ' + (T + ih) + ' Z" fill="' + o.line.color + '" opacity=".10"/>' +
          '<path class="dbc-line" d="' + d + '" fill="none" stroke="' + o.line.color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/>' +
          pts.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4.5" fill="#fff" stroke="' + o.line.color + '" stroke-width="2.5"><title>' + DAYS7[q[3]].label + ' ' + DAYS7[q[3]].num + ' — ' + o.line.name + ': ' + q[2] + '</title></circle>'; }).join('');
      }
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + App.esc(o.label) + '" style="display:block;overflow:visible">' + g + bars + line + '</svg>';
    }
    function legend(items) { return '<div class="dbc-leg">' + items.map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[0] + '</span>'; }).join('') + '</div>'; }
    function chip(label, value, color) { return '<div class="dbc-chip"><small>' + label + '</small><b' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</b></div>'; }
    function bigCard(title, sub, chips, svg, leg, link) {
      return '<div class="card dbc-card"><div class="card-h"><div><h3>' + title + '</h3><div class="dbc-sub">' + sub + '</div></div>' + (link ? '<a class="btn btn-ghost btn-sm" href="' + link[0] + '" style="margin-left:auto">' + link[1] + '</a>' : '') + '</div>' +
        '<div class="card-b"><div class="dbc-chips">' + chips + '</div>' + svg + leg + '</div></div>';
    }
    var expenses = DB.all('expenses') || [];
    var tests7 = perDay(invoices, function (r) { return r.createdAt; }, function (r) { return r.items ? r.items.length : 0; });
    var inv7 = perDay(invoices, function (r) { return r.createdAt; }, function () { return 1; });
    var chartA, chartB;
    if (isTech) {
      var rep7 = perDay(results.filter(function (r) { return r.status === 'ready'; }), function (r) { return r.reportedAt; }, function () { return 1; });
      chartA = bigCard('Results reported', 'Last 7 days', chip('Reported (7 days)', sum(rep7), '#059669') + chip('Pending now', pendingRes.length, '#d97706') + chip('Today', rep7[6]),
        chartSvg({ label: 'Results reported per day', bars: [{ name: 'Results reported', data: rep7, color: '#10b981' }] }), legend([['Results reported', '#10b981']]), ['#/results/ready', 'Ready reports']);
    } else {
      var col7 = perDay(payments, function (r) { return r.date; }, function (r) { return +r.amount || 0; });
      var exp7 = perDay(expenses, function (r) { return r.date; }, function (r) { return +r.amount || 0; });
      var net = sum(col7) - sum(exp7);
      chartA = bigCard('Collections vs Expenses', 'Last 7 days', chip('Collected', App.money(sum(col7)), '#2563eb') + chip('Expenses', App.money(sum(exp7)), '#d97706') + chip(net >= 0 ? 'Net profit' : 'Net loss', (net < 0 ? '−' : '') + App.money(Math.abs(net)), net >= 0 ? '#059669' : '#dc2626'),
        chartSvg({ label: 'Collections and expenses per day', money: true, bars: [{ name: 'Collected', data: col7, color: '#3b82f6' }, { name: 'Expenses', data: exp7, color: '#f59e0b' }] }), legend([['Collected', '#3b82f6'], ['Expenses', '#f59e0b']]), ['#/finance/profit', 'Profit &amp; Loss']);
    }
    chartB = bigCard('Tests &amp; Invoices', 'Last 7 days', chip('Tests ordered', sum(tests7), '#7c3aed') + chip('Invoices', sum(inv7), '#ea580c') + chip('Today', tests7[6] + ' tests'),
      chartSvg({ label: 'Tests ordered and invoices per day', bars: [{ name: 'Invoices', data: inv7, color: '#fdba74' }], line: { name: 'Tests ordered', data: tests7, color: '#7c3aed' } }), legend([['Invoices', '#fdba74'], ['Tests ordered', '#7c3aed']]), isTech ? null : ['#/invoices', 'Invoices']);
    var chartsHtml = '<div class="db-charts">' + chartA + chartB + '</div>';

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
    '.db-page .card{border-radius:16px;box-shadow:var(--sh-md);border:1px solid var(--line)}' +
    '.db-page .card-h h3{color:var(--ink);font-weight:800;letter-spacing:-.01em}' +
    '</style>' +
    '<style>' +
    '.db-charts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}' +
    '@media(max-width:1000px){.db-charts{grid-template-columns:1fr}}' +
    '.dbc-card .card-h{align-items:flex-start}.dbc-card .card-h h3{font-size:17px;font-weight:800;letter-spacing:-.01em}.dbc-sub{font-size:12.5px;color:var(--muted);margin-top:2px;font-weight:600}' +
    '.dbc-chips{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}' +
    '.dbc-chip{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:8px 14px;min-width:96px}.dbc-chip small{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}.dbc-chip b{font-size:16.5px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}' +
    '.dbc-leg{display:flex;gap:16px;justify-content:center;margin-top:6px;font-size:12.5px;font-weight:600;color:var(--muted)}.dbc-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}' +
    '.dbc-bar{transform-box:fill-box;transform-origin:bottom;animation:dbcGrow .7s cubic-bezier(.22,.8,.3,1) backwards}@keyframes dbcGrow{from{transform:scaleY(0)}}' +
    '.dbc-line{stroke-dasharray:100;animation:dbcDraw 1.1s .2s ease-out backwards}@keyframes dbcDraw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}' +
    '@media (prefers-reduced-motion:reduce){.dbc-bar,.dbc-line{animation:none}}' +
    '.db-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px}' +
    '@media(max-width:1000px){.db-grid{grid-template-columns:1fr}}' +
    '.db-grid .card-h h3{font-size:16.5px;font-weight:700;letter-spacing:-.01em}' +
    '@media (prefers-reduced-motion:reduce){.stat{animation:none}.stat:hover{transform:none}}' +
    '</style>' +

    '<div class="stat-grid">' + stats + '</div>' +

    quickCss + quickAccess +

    critCard() + chartsHtml +
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
