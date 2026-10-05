/* Optix LAB MedSync — Dashboard module (#/dashboard) */
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

  var ICONS = {
    cash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    flask: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/></svg>',
    alert: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
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
      '.db-skel .sk-bar{flex:1;border-radius:8px 8px 4px 4px}' +
      '</style>';

    function skelStat() {
      return '<div class="stat"><div class="stat-ico sk"></div>' +
        '<div class="lb sk" style="height:10px;width:62%"></div>' +
        '<div class="vl sk" style="height:20px;width:48%"></div>' +
        '<div class="dl sk" style="height:11px;width:84%"></div></div>';
    }
    function skelBars() {
      var hs = [42, 66, 54, 78, 60, 88, 72], out = '';
      for (var i = 0; i < hs.length; i++) out += '<div class="sk sk-bar" style="height:' + hs[i] + 'px"></div>';
      return out;
    }
    function skelRows(n) {
      var out = '';
      for (var i = 0; i < n; i++) out += '<div class="sk" style="height:14px;margin:12px 0;width:' + (92 - i * 6) + '%"></div>';
      return out;
    }
    function skeletonHtml() {
      return '<div class="db-page db-skel" data-db-skel="1">' + SKEL_CSS +
        '<div class="stat-grid">' + skelStat() + skelStat() + skelStat() + skelStat() + '</div>' +
        '<div class="card"><div class="card-h"><div class="sk" style="height:15px;width:180px"></div></div>' +
        '<div class="card-b"><div style="display:flex;align-items:flex-end;gap:10px;height:100px">' + skelBars() + '</div></div></div>' +
        '<div class="card"><div class="card-h"><div class="sk" style="height:15px;width:150px"></div></div>' +
        '<div class="card-b">' + skelRows(4) + '</div></div>' +
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
    var bars = week.map(function (w, ix) {
      var h = maxV > 0 ? Math.max(6, Math.round(w.val / maxV * 100)) : 3;
      var vlab = isTech ? String(w.val) : 'Rs ' + compact(w.val);
      var tip = App.esc(w.label + ': ' + (isTech ? w.val + ' tests' : App.money(w.val)));
      return '<div class="db-col">' +
        '<div class="db-val">' + vlab + '</div>' +
        '<div class="db-track"><div class="db-fill' + (w.isToday ? ' db-today' : '') + '" style="height:' + h + '%;animation-delay:' + (ix * 0.07).toFixed(2) + 's"></div>' +
        '<span class="db-tip">' + tip + '</span></div>' +
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

    // ---- NEW rich widgets: monthly goal, payment methods, dues aging, month P&L ----
    var monthPays = payments.filter(function (p) { return dayKey(p.date).slice(0, 7) === mKey; });
    var monthPayCount = monthPays.length;
    var mkY = +mKey.slice(0, 4), mkM = +mKey.slice(5, 7);
    var pvY = mkM === 1 ? mkY - 1 : mkY, pvM = mkM === 1 ? 12 : mkM - 1;
    var prevKey = pvY + '-' + String(pvM).padStart(2, '0');
    var lastMonthCol = payments.filter(function (p) { return dayKey(p.date).slice(0, 7) === prevKey; })
      .reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    var mainSet = {}; try { mainSet = DB.get('settings', 'main') || {}; } catch (e) {}
    var goalTarget = +mainSet.monthlyTarget > 0 ? +mainSet.monthlyTarget
      : Math.round(lastMonthCol * 1.25 / 100) * 100;
    var goalPct = goalTarget > 0 ? Math.min(100, Math.round(monthCol / goalTarget * 100)) : 0;
    var goalBody = goalTarget > 0
      ? '<div class="dbw-bar"><div class="dbw-fill" style="width:' + goalPct + '%"></div></div>' +
        '<div class="db-sub">' + (isTech
          ? monthPayCount + ' payments received &middot; ' + goalPct + '% of monthly goal'
          : App.money(monthCol) + ' of ' + App.money(goalTarget) + ' (' + goalPct + '%)') + '</div>'
      : App.empty('No collection data yet — the goal appears once payments are recorded.');
    var goalCard = '<div class="card"><div class="card-h"><h3>Monthly Collection Goal</h3>' +
      (goalTarget > 0 ? '<span class="dbw-pct">' + goalPct + '%</span>' : '') + '</div>' +
      '<div class="card-b">' + goalBody + '</div></div>';

    // payment method donut (this month)
    var mBuckets = [
      { label: 'Cash', color: '#5392ba', amt: 0, n: 0 },
      { label: 'Card', color: '#131845', amt: 0, n: 0 },
      { label: 'Bank / Transfer', color: '#f59e0b', amt: 0, n: 0 },
      { label: 'Other', color: '#94a3b8', amt: 0, n: 0 }
    ];
    monthPays.forEach(function (p) {
      var m = String(p.method || '').toLowerCase();
      var b = m.indexOf('cash') >= 0 ? 0 : m.indexOf('card') >= 0 ? 1 :
        (m.indexOf('bank') >= 0 || m.indexOf('transfer') >= 0 || m.indexOf('online') >= 0 ||
         m.indexOf('cheque') >= 0 || m.indexOf('check') >= 0) ? 2 : 3;
      mBuckets[b].amt += (+p.amount || 0); mBuckets[b].n += 1;
    });
    var mTot = mBuckets.reduce(function (a, b) { return a + b.amt; }, 0);
    var RC = 2 * Math.PI * 38, dAcc = 0, dSegs = '';
    mBuckets.forEach(function (b) {
      if (!(b.amt > 0)) return;
      var frac = b.amt / mTot;
      dSegs += '<circle cx="50" cy="50" r="38" fill="none" stroke="' + b.color + '" stroke-width="14"' +
        ' stroke-dasharray="' + (frac * RC).toFixed(1) + ' ' + RC.toFixed(1) + '"' +
        ' stroke-dashoffset="' + (-dAcc * RC).toFixed(1) + '" transform="rotate(-90 50 50)"/>';
      dAcc += frac;
    });
    var donutSvg = '<svg width="100" height="100" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="38" fill="none" stroke="#eef2f7" stroke-width="14"/>' + dSegs +
      '<text x="50" y="49" text-anchor="middle" font-size="14" font-weight="800" fill="#0f172a">' +
        App.esc(isTech ? String(monthPayCount) : 'Rs ' + compact(mTot)) + '</text>' +
      '<text x="50" y="63" text-anchor="middle" font-size="10" fill="#64748b">' +
        App.esc(isTech ? 'payments' : monthName) + '</text></svg>';
    var legRows = mBuckets.map(function (b) {
      return '<div class="dbw-row"><span class="dbw-dot" style="background:' + b.color + '"></span>' +
        '<span class="dbw-leg">' + App.esc(b.label) + '</span>' +
        '<span class="dbw-amt">' + (isTech ? b.n + ' paid' : App.money(b.amt)) + '</span></div>';
    }).join('');
    var donutCard = '<div class="card"><div class="card-h"><h3>Payments by Method</h3><span class="db-sub">' +
      App.esc(monthName) + '</span></div><div class="card-b">' + (mTot > 0
        ? '<div class="dbw-split"><div>' + donutSvg + '</div><div class="dbw-legs">' + legRows + '</div></div>'
        : App.empty('No payments recorded this month.')) + '</div></div>';

    // dues aging buckets
    var ageB = [
      { label: '0\u201315 days', color: '#5392ba', amt: 0, n: 0 },
      { label: '16\u201330 days', color: '#f59e0b', amt: 0, n: 0 },
      { label: '30+ days', color: '#ef4444', amt: 0, n: 0 }
    ];
    dueInvs.forEach(function (i) {
      var t = new Date(i.createdAt).getTime();
      var age = isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
      var bi = age <= 15 ? 0 : (age <= 30 ? 1 : 2);
      ageB[bi].amt += (+i.due || 0); ageB[bi].n += 1;
    });
    var ageMax = Math.max.apply(null, ageB.map(function (b) { return isTech ? b.n : b.amt; }).concat([0]));
    var ageRows = ageB.map(function (b) {
      var v = isTech ? b.n : b.amt;
      var w = ageMax > 0 ? Math.max(4, Math.round(v / ageMax * 100)) : 0;
      return '<div class="dbw-arow"><div class="dbw-alab">' + b.label + '</div>' +
        '<div class="dbw-hbar"><div class="dbw-hfill" style="width:' + w + '%;background:' + b.color + '"></div></div>' +
        '<div class="dbw-amt">' + (isTech ? b.n + ' inv' : App.money(b.amt)) + '</div></div>';
    }).join('');
    var ageCard = '<div class="card"><div class="card-h"><h3>Dues Aging</h3><span class="db-sub">' +
      (isTech ? dueInvs.length + ' unpaid invoices' : App.money(duesTotal) + ' outstanding') + '</span></div>' +
      '<div class="card-b">' + (dueInvs.length ? ageRows : App.empty('No pending dues. All clear!')) + '</div></div>';

    // month P&L snapshot
    var monthExps = (DB.all('expenses') || []).filter(function (e) { return dayKey(e.date).slice(0, 7) === mKey; });
    var monthExp = monthExps.reduce(function (a, e) { return a + (+e.amount || 0); }, 0);
    var net = monthCol - monthExp;
    var plMax = isTech ? Math.max(monthPayCount, monthExps.length, 0) : Math.max(monthCol, monthExp, 0);
    function dbwBar(val, color) {
      var w = plMax > 0 ? Math.max(4, Math.round(val / plMax * 100)) : 0;
      return '<div class="dbw-hbar"><div class="dbw-hfill" style="width:' + w + '%;background:' + color + '"></div></div>';
    }
    var plRows = isTech
      ? '<div class="dbw-arow"><div class="dbw-alab">Payments in</div>' + dbwBar(monthPayCount, '#5392ba') + '<div class="dbw-amt">' + monthPayCount + '</div></div>' +
        '<div class="dbw-arow"><div class="dbw-alab">Expense entries</div>' + dbwBar(monthExps.length, '#f59e0b') + '<div class="dbw-amt">' + monthExps.length + '</div></div>'
      : '<div class="dbw-arow"><div class="dbw-alab">Collection</div>' + dbwBar(monthCol, '#5392ba') + '<div class="dbw-amt">' + App.money(monthCol) + '</div></div>' +
        '<div class="dbw-arow"><div class="dbw-alab">Expenses</div>' + dbwBar(monthExp, '#ef4444') + '<div class="dbw-amt">' + App.money(monthExp) + '</div></div>' +
        '<div class="dbw-net' + (net >= 0 ? ' dbw-pos' : ' dbw-neg') + '">Net ' + App.money(net) + '</div>';
    var plCard = '<div class="card"><div class="card-h"><h3>' + (isTech ? 'Month Activity' : 'Month P&L') + '</h3>' +
      '<span class="db-sub">' + App.esc(monthName) + '</span></div>' +
      '<div class="card-b">' + plRows + '</div></div>';

    var widgets =
    '<style>' +
    '.dbw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}' +
    '.dbw-grid .card-h,.dbx-grid .card-h{padding:10px 14px}.dbw-grid .card-h h3,.dbx-grid .card-h h3{font-size:14px}' +
    '.dbw-grid .card-b,.dbx-grid .card-b{padding:12px 14px}' +
    '@media(max-width:900px){.dbw-grid{grid-template-columns:1fr}}' +
    '.dbw-pct{font-weight:800;color:var(--brand-d);font-size:15px}' +
    '.dbw-bar{height:9px;background:#eef2f7;border-radius:99px;overflow:hidden;margin:8px 0 6px}' +
    '.dbw-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#14b8a6,#0d9488);transition:width .6s}' +
    '.dbw-split{display:flex;align-items:center;gap:18px}' +
    '.dbw-legs{flex:1;min-width:0}' +
    '.dbw-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:12.5px}' +
    '.dbw-row:last-child{border-bottom:none}' +
    '.dbw-dot{width:12px;height:12px;border-radius:4px;flex:none}' +
    '.dbw-leg{flex:1;color:var(--muted)}' +
    '.dbw-amt{font-weight:700;white-space:nowrap}' +
    '.dbw-arow{display:grid;grid-template-columns:86px 1fr auto;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px}' +
    '.dbw-arow:last-child{border-bottom:none}' +
    '.dbw-alab{color:var(--muted);font-weight:600}' +
    '.dbw-hbar{height:8px;background:#eef2f7;border-radius:99px;overflow:hidden}' +
    '.dbw-hfill{height:100%;border-radius:99px}' +
    '.dbw-net{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-weight:800;font-size:14px}' +
    '.dbw-pos{color:var(--green)}' +
    '.dbw-neg{color:var(--red)}' +
    '</style>' +
    '<div class="dbw-grid">' + goalCard + donutCard + ageCard + plCard + '</div>';

    // ---- ADVANCED graphs: category bars, expense breakdown, doctor leaderboard ----

    // tests by category (all time)
    var catAgg = {};
    invoices.forEach(function (i) {
      (i.items || []).forEach(function (it) {
        var t = it.testId ? DB.get('tests', it.testId) : null;
        var cat = (t && t.category) || it.category || 'General';
        catAgg[cat] = (catAgg[cat] || 0) + 1;
      });
    });
    var catList = Object.keys(catAgg).map(function (c) { return { cat: c, n: catAgg[c] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var catMax = catList.length ? catList[0].n : 0;
    var catRows = catList.map(function (e) {
      var w = catMax > 0 ? Math.max(3, Math.round(e.n / catMax * 100)) : 0;
      return '<div class="dbx-hrow"><div class="dbx-hlab">' + App.esc(e.cat) + '</div>' +
        '<div class="dbx-htrack"><div class="dbx-hfill" style="width:' + w + '%"></div></div>' +
        '<div class="dbx-hval">' + e.n + '</div></div>';
    }).join('');
    var catCard = '<div class="card"><div class="card-h"><h3>Tests by Category</h3><a class="btn btn-ghost btn-sm" href="#/tests">View all</a></div>' +
      '<div class="card-b">' + (catRows || App.empty('No tests billed yet.')) + '</div></div>';

    // expense breakdown (current month)
    var expPalette = ['#131845', '#2b3a7a', '#5392ba', '#7fb3d4', '#f59e0b', '#94a3b8'];
    var expAgg = {};
    monthExps.forEach(function (e) {
      var c = e.category || 'General';
      var g = expAgg[c] = expAgg[c] || { amt: 0, n: 0 };
      g.amt += (+e.amount || 0); g.n += 1;
    });
    var expList = Object.keys(expAgg).map(function (c) { return { cat: c, amt: expAgg[c].amt, n: expAgg[c].n }; })
      .sort(function (a, b) { return b.amt - a.amt; }).slice(0, 6);
    var expMax = expList.length ? Math.max.apply(null, expList.map(function (e) { return isTech ? e.n : e.amt; })) : 0;
    var expRows = expList.map(function (e, ix) {
      var v = isTech ? e.n : e.amt;
      var w = expMax > 0 ? Math.max(3, Math.round(v / expMax * 100)) : 0;
      var col = expPalette[ix % expPalette.length];
      return '<div class="dbx-hrow"><div class="dbx-hlab">' + App.esc(e.cat) + '</div>' +
        '<div class="dbx-htrack"><div class="dbx-hfill" style="width:' + w + '%;background:' + col + '"></div></div>' +
        '<div class="dbx-hval">' + (isTech ? e.n + ' entries' : App.money(e.amt)) + '</div></div>';
    }).join('');
    var expCard = '<div class="card"><div class="card-h"><h3>' + (isTech ? 'Expense Entries' : 'Expense Breakdown') + '</h3>' +
      '<span class="db-sub">' + App.esc(monthName) + '</span></div>' +
      '<div class="card-b">' + (expRows || App.empty('No expenses recorded this month.')) + '</div></div>';

    // doctor referral leaderboard (all time)
    var lbAgg = {};
    invoices.forEach(function (i) {
      if (!i.doctorId) return;
      var e = lbAgg[i.doctorId] = lbAgg[i.doctorId] || { count: 0, revenue: 0 };
      e.count += 1; e.revenue += (+i.total || 0);
    });
    var lbList = Object.keys(lbAgg).map(function (id) {
      var d = DB.get('doctors', id);
      var pct = d ? (+d.commissionPct || 0) : 0;
      return { name: d ? d.name : 'Doctor', clinic: d ? (d.clinic || '') : '',
               count: lbAgg[id].count, comm: Math.round(lbAgg[id].revenue * pct / 100) };
    }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    var lbMax = lbList.length ? lbList[0].count : 0;
    var lbRows = lbList.map(function (d, ix) {
      var w = lbMax > 0 ? Math.max(4, Math.round(d.count / lbMax * 100)) : 0;
      var bg = ['#d4a017', '#9aa5b5', '#b0763c'][ix] || '#e9edf9';
      var fg = ix < 3 ? '#fff' : '#131845';
      var init = App.esc(((d.name || 'D').replace(/^(dr\.?\s*)/i, '').trim().charAt(0) || 'D').toUpperCase());
      return '<div class="dbx-lbrow">' +
        '<div class="dbx-rank" style="background:' + bg + ';color:' + fg + '">' + (ix + 1) + '</div>' +
        '<div class="dbx-av">' + init + '</div>' +
        '<div class="dbx-linfo"><strong>' + App.esc(d.name) + '</strong>' +
        (d.clinic ? '<div class="db-sub">' + App.esc(d.clinic) + '</div>' : '') + '</div>' +
        '<div class="dbx-lbar"><div class="dbx-lfill" style="width:' + w + '%"></div></div>' +
        '<div class="dbx-lval"><strong>' + d.count + '</strong> referral' + (d.count !== 1 ? 's' : '') +
        (isTech ? '' : '<div class="db-sub">' + App.money(d.comm) + ' commission</div>') + '</div></div>';
    }).join('');
    var lbCard = '<div class="card dbx-span"><div class="card-h"><h3>Top Referring Doctors — Leaderboard</h3>' +
      '<a class="btn btn-ghost btn-sm" href="#/doctors">View all</a></div>' +
      '<div class="card-b">' + (lbRows || App.empty('No doctor referrals yet.')) + '</div></div>';

    var advSection =
    '<style>' +
    '.dbx-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}' +
    '.dbx-span{grid-column:1/-1}' +
    '@media(max-width:900px){.dbx-grid{grid-template-columns:1fr}.dbx-span{grid-column:auto}}' +
    '.dbx-total{font-weight:800;color:#131845;font-size:13px;white-space:nowrap}' +
    '.dbx-hrow{display:grid;grid-template-columns:120px 1fr auto;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:12.5px}' +
    '.dbx-hrow:last-child{border-bottom:none}' +
    '.dbx-hlab{font-weight:600;color:var(--ink2,#2a2f38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.dbx-htrack{height:9px;background:#e8eef6;border-radius:99px;overflow:hidden}' +
    '.dbx-hfill{height:100%;border-radius:99px;background:linear-gradient(90deg,#5392ba,#3d7ea6)}' +
    '.dbx-hval{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;min-width:70px;text-align:right}' +
    '.dbx-lbrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)}' +
    '.dbx-lbrow:last-child{border-bottom:none}' +
    '.dbx-rank{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none}' +
    '.dbx-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#e9edf9,#ffffff);display:grid;place-items:center;font-weight:800;color:#131845;box-shadow:inset 0 0 0 1px #c9d4f2;flex:none}' +
    '.dbx-linfo{flex:1.2;min-width:0}' +
    '.dbx-linfo strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.dbx-lbar{flex:1.6;height:8px;background:#e8eef6;border-radius:99px;overflow:hidden;min-width:70px}' +
    '.dbx-lfill{height:100%;border-radius:99px;background:linear-gradient(90deg,#2b3a7a,#131845)}' +
    '.dbx-lval{text-align:right;white-space:nowrap;font-size:12px;min-width:84px}' +
    '@media(max-width:560px){.dbx-hrow{grid-template-columns:104px 1fr auto}.dbx-lbar{flex-basis:100%;order:6}.dbx-lbrow{flex-wrap:wrap}}' +
    '</style>' +
    '<div class="dbx-grid">' + catCard + expCard + lbCard + '</div>';

    // ---- stats per role ----
    var stats;
    if (isTech) {
      stats =
        statCard(ICONS.flask, 'brand', "Today's Tests", testsToday, invToday.length + ' invoices today', testsToday, false) +
        statCard(ICONS.alert, 'amber', 'Pending Results', pendingRes.length, 'awaiting entry', pendingRes.length, false) +
        statCard(ICONS.check, 'green', 'Reported Today', reportedToday, 'results completed', reportedToday, false) +
        statCard(ICONS.users, 'blue', 'Total Patients', patients.length, 'registered', patients.length, false);
    } else {
      stats =
        statCard(ICONS.cash, 'brand', "Today's Collection", App.money(todayCol), payToday.length + ' payments received &middot; ' + colDelta, todayCol, true) +
        statCard(ICONS.flask, 'blue', "Today's Tests", testsToday, invToday.length + ' invoices today', testsToday, false) +
        statCard(ICONS.alert, 'amber', 'Pending Dues', App.money(duesTotal), dueInvs.length + ' invoices unpaid', duesTotal, true) +
        statCard(ICONS.cal, 'green', monthName + ' Collection', App.money(monthCol), 'this month', monthCol, true);
    }

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
    '.db-page .db-date{background:#fff;border:1px solid var(--line);box-shadow:0 18px 45px rgba(11,23,64,.10);color:var(--ink);font-weight:700}' +
    '.db-page .db-date svg{color:var(--blue)}' +
    '.db-page .stat{border-radius:20px;box-shadow:0 18px 45px rgba(11,23,64,.10);border:1px solid #eef3fa}' +
    '.db-page .stat[data-tint="brand"]{--sc-line:#c9d4f2;--sc-soft:#e9edf9}' +
    '.db-page .stat[data-tint="blue"]{--sc-line:#c9e2f2;--sc-soft:#ebf4f8}' +
    '.db-page .stat-ico{border-radius:50%;box-shadow:inset 0 0 0 1px var(--sc-line),0 4px 10px rgba(11,23,64,.08)}' +
    '.db-page .stat .vl{color:var(--ink)}' +
    '.db-page .stat .lb{color:var(--muted)}' +
    '.db-page .card{border-radius:20px;box-shadow:0 18px 45px rgba(11,23,64,.10);border:1px solid #eef3fa}' +
    '.db-page .card-h h3{color:var(--ink);font-weight:800;letter-spacing:-.01em}' +
    '.db-page .btn-primary{background:var(--brand-grad);box-shadow:0 12px 28px rgba(11,23,64,.25)}' +
    '.db-page .btn-primary:hover{box-shadow:0 16px 34px rgba(11,23,64,.3);transform:translateY(-1px)}' +
    '.db-page .db-fill{background:linear-gradient(180deg,#7fb3d4 0%,#5392ba 55%,#3d7ea6 100%);box-shadow:0 8px 16px -8px rgba(83,146,186,.6)}' +
    '.db-page .db-fill.db-today{background:linear-gradient(180deg,#2b3a7a 0%,#131845 60%,#0d1030 100%);box-shadow:0 8px 18px -6px rgba(19,24,69,.65),0 0 0 3px rgba(19,24,69,.14)}' +
    '.db-page .db-track{background:#e9eff7}' +
    '.db-page .db-week-pill{background:var(--brand-soft);color:var(--brand-d);box-shadow:inset 0 0 0 1px var(--brand-line)}' +
    '.db-page .dbw-fill{background:linear-gradient(90deg,#5392ba,#3d7ea6)}' +
    '.db-page .dbw-bar,.db-page .dbw-hbar{background:#e8eef6}' +
    '.db-page .dbw-pct{color:var(--brand-d)}' +
    '.db-page .db-rank{background:linear-gradient(135deg,var(--brand-soft),#ffffff 130%);color:var(--brand-d);box-shadow:inset 0 0 0 1px var(--brand-line)}' +
    '.db-page .dbd-tx h3{color:var(--ink)}' +
    '.db-page .db-tip{background:var(--ink)}' +
    '.db-page .db-tip::after{border-top-color:var(--ink)}' +
    '.db-page .table thead th{color:var(--muted)}' +
    '.db-page .table .id-cell{color:var(--brand-d)}' +
    '</style>' +
    '<style>' +
    '.db-date{display:inline-flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 13px;font-size:12.5px;font-weight:600;color:var(--ink2);box-shadow:var(--sh-sm)}' +
    '.db-date svg{width:14px;height:14px;color:var(--brand-d)}' +
    '.db-qa{display:flex;gap:10px;flex-wrap:wrap}' +
    '.db-qa .btn{display:inline-flex;align-items:center;gap:8px;transition:transform .15s ease,box-shadow .15s ease}' +
    '.db-qa .btn svg{width:16px;height:16px}' +
    '.db-qa .btn:hover{transform:translateY(-2px);box-shadow:var(--sh-md)}' +
    '/* shared compact stat card CSS now in app.css */' +
    '.stat .dl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '.db-up,.db-down,.db-flat{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;line-height:1.6}' +
    '.db-up{background:var(--green-soft);color:var(--green)}' +
    '.db-down{background:var(--red-soft);color:var(--red)}' +
    '.db-flat{background:#eef2f6;color:var(--muted)}' +
    '.db-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px}' +
    '@media(max-width:1000px){.db-grid{grid-template-columns:1fr}}' +
    '.db-grid .card-h h3,.card:has(>.card-b>.db-cols) .card-h h3{font-size:16.5px;font-weight:700;letter-spacing:-.01em}' +
    '.card:has(>.card-b>.db-cols) .card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
    '.db-grid .table tbody tr{transition:background .15s ease}' +
    '.db-grid .table tbody tr:hover{background:#f4f9fd}' +
    '.db-sub{font-size:12px;color:var(--muted);margin-top:2px}' +
    '.db-due{color:var(--red);font-weight:700}' +
    '.db-tests{font-size:12.5px;color:var(--muted);margin-top:4px}' +
    '.db-pend{padding:12px 10px;margin:0 -10px;border-bottom:1px solid var(--line);border-radius:10px;transition:background .15s ease}' +
    '.db-pend:last-child{border-bottom:none}' +
    '.db-pend:hover{background:#f4f9fd}' +
    '.db-foot{margin-top:12px}' +
    '.db-week-pill{display:inline-flex;align-items:center;gap:6px;background:var(--brand-soft);color:var(--brand-d);font-size:12px;font-weight:700;padding:5px 13px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--brand-line);white-space:nowrap}' +
    '.db-cols{display:flex;align-items:stretch;gap:10px;padding:12px 4px 2px}' +
    '@media(max-width:560px){.db-cols{gap:5px}}' +
    '.db-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}' +
    '.db-val{font-size:11px;font-weight:700;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;transition:color .15s}' +
    '.db-col:hover .db-val{color:var(--ink)}' +
    '.db-track{position:relative;height:100px;width:100%;max-width:58px;background:#f1f5f9;border-radius:10px;display:flex;align-items:flex-end;box-shadow:inset 0 2px 5px rgba(15,30,46,.07)}' +
    '@media(max-width:560px){.db-track{max-width:none}}' +
    '@keyframes dbGrow{to{transform:scaleY(1)}}' +
    '.db-fill{width:100%;border-radius:10px;background:linear-gradient(180deg,#2dd4bf 0%,#0d9488 55%,#0f766e 100%);box-shadow:0 8px 16px -8px rgba(13,148,136,.6);transform:scaleY(0);transform-origin:50% 100%;animation:dbGrow .8s cubic-bezier(.22,.8,.3,1) forwards}' +
    '.db-fill.db-today{background:linear-gradient(180deg,#60a5fa 0%,#2563eb 55%,#1d4ed8 100%);box-shadow:0 8px 18px -6px rgba(37,99,235,.65),0 0 0 3px rgba(37,99,235,.14)}' +
    '.db-tip{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translate(-50%,4px);background:var(--ink);color:#fff;font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:8px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .16s ease,transform .16s ease;z-index:5;box-shadow:var(--sh-md)}' +
    '.db-tip::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--ink)}' +
    '.db-col:hover .db-tip{opacity:1;transform:translate(-50%,0)}' +
    '.db-day{font-size:12px;color:var(--muted);font-weight:600}' +
    '.db-day-t{color:var(--blue);font-weight:800}' +
    '.db-rank{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 7px;border-radius:9px;background:linear-gradient(135deg,var(--brand-soft),#ffffff 130%);color:var(--brand-d);font-weight:800;font-size:12px;box-shadow:inset 0 0 0 1px var(--brand-line)}' +
    '@media (prefers-reduced-motion:reduce){.stat,.db-fill{animation:none}.db-fill{transform:none}.stat:hover,.db-qa .btn:hover{transform:none}}' +
    '</style>' +

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

    widgets +
    advSection +
    '<div class="card" style="margin-bottom:20px"><div class="card-h"><h3>' + (isTech ? 'Tests — Last 7 Days' : 'Collection — Last 7 Days') + '</h3>' +
    '<span class="db-week-pill">Total ' + (isTech ? week.reduce(function (a, w) { return a + w.val; }, 0) + ' tests' : App.money(week.reduce(function (a, w) { return a + w.val; }, 0))) + ' this week</span></div>' +
    '<div class="card-b"><div class="db-cols">' + bars + '</div></div></div>' +
    '</div>';
    } /* end buildDashboard */

    /* paint skeleton now; render full content right after it paints */
    setTimeout(function () {
      var v = document.getElementById('view');
      if (!v || !v.querySelector('[data-db-skel]')) return; /* user navigated away */
      v.innerHTML = buildDashboard();
      scheduleCountUp();
    }, 120);

    return skeletonHtml();
  });
})();
