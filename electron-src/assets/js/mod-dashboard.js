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
    brand: { sc: '#0284c7', line: '#6fa6cf', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#7aa7e6', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e0b25c', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#5fbf8a', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e08080', soft: '#fdecec', circle: '#fad2d2' }
  };

  function statCard(icon, tint, label, value, sub, raw, isMoney) {
    var countAttrs = (typeof raw === 'number' && isFinite(raw))
      ? ' data-count="' + raw + '" data-money="' + (isMoney ? '1' : '0') + '"'
      : '';
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:0;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
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
    var showBranchMoney = !isTech && (!App.canPage || App.canPage('finance'));

    function reportPeriod(period) {
      if (period === 'all') return { from: '' };
      var days = period === '90' ? 90 : 30, d = new Date();
      d.setDate(d.getDate() - days + 1);
      return { from: d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) };
    }
    function smartAnalyticsBody(period) {
      var todayKey = App.today(), range = reportPeriod(period);
      var branches = DB.all('branches') || [], branchById = {}, branchByLabel = {};
      var rows = {}, invoiceBranch = {}, invoiceById = {};
      branches.forEach(function (b) {
        if (!b || !b.id) return;
        branchById[b.id] = b;
        [b.name, b.code].forEach(function (label) {
          var k = String(label || '').trim().toLowerCase();
          if (k) branchByLabel[k] = b.id;
        });
        rows[b.id] = { id: b.id, name: b.name || b.code || b.id, billed: 0, collected: 0, due: 0, invoices: 0, activity: 0 };
      });
      rows.__unassigned = { id: '__unassigned', name: 'Unassigned', billed: 0, collected: 0, due: 0, invoices: 0, activity: 0 };
      function rowForInvoice(inv) {
        var branchId = inv.branchId && branchById[inv.branchId] ? inv.branchId : null;
        if (!branchId) {
          var loc = String(inv.regLocation || '').trim().toLowerCase();
          branchId = branchByLabel[loc] || null;
        }
        if (!branchId) branchId = '__unassigned';
        return rows[branchId] || rows.__unassigned;
      }
      function inPeriod(value) {
        var key = dayKey(value);
        return !!key && (!range.from || key >= range.from) && key <= todayKey;
      }
      /* ---- the chart over the selected period: one bar group per day (30 days), week (90 days) or month (all time) ---- */
      var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], buckets = {};
      function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
      function parseKey(k) { return new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +(k.slice(8, 10) || 1)); }
      function bucketOf(value) {
        var k = dayKey(value); if (!k) return '';
        if (period === 'all') return k.slice(0, 7);
        if (period === '90') { var d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
        return k;
      }
      function tally(value, field, amount) {
        var bk = bucketOf(value); if (!bk) return;
        var o = buckets[bk] || (buckets[bk] = { billed: 0, collected: 0, tests: 0 });
        o[field] += amount;
      }
      function bucketList() {
        var from = range.from, list = [], d, end = parseKey(todayKey);
        if (period === 'all') {
          var keys = Object.keys(buckets).sort(); if (!keys.length) return [];
          d = parseKey(keys[0] + '-01'); d.setDate(1);
          var floor = new Date(end.getFullYear(), end.getMonth() - 23, 1); if (d < floor) d = floor;
          for (; d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) list.push(ymd(d).slice(0, 7));
        } else if (period === '90') {
          d = parseKey(bucketOf(from));
          for (; d <= end; d.setDate(d.getDate() + 7)) list.push(ymd(d));
        } else {
          d = parseKey(from);
          for (; d <= end; d.setDate(d.getDate() + 1)) list.push(ymd(d));
        }
        return list;
      }
      function bucketLabel(k) {
        if (period === 'all') return MON[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4);
        return (+k.slice(8, 10)) + ' ' + MON[+k.slice(5, 7) - 1];
      }
      function niceTop(v) { if (v <= 0) return 4; var q = v / 4, p = Math.pow(10, Math.floor(Math.log(q) / Math.LN10)), f = q / p; return 4 * (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
      function shortNum(n) { return n >= 1000000 ? (Math.round(n / 100000) / 10) + 'M' : (n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(Math.round(n))); }
      var SERIES = { billed: ['Billed', '#3b82f6'], collected: ['Collected', '#10b981'], tests: ['Tests ordered', '#7c3aed'] };
      function trendSvg(fields, isMoney) {
        var list = bucketList(); if (!list.length) return '';
        var W = 900, H = 250, L = 50, R = 10, T = 12, B = 30, iw = W - L - R, ih = H - T - B, n = list.length, step = iw / n, max = 0, g = '', bars = '', i;
        list.forEach(function (k) { var o = buckets[k] || {}; fields.forEach(function (f) { max = Math.max(max, o[f] || 0); }); });
        max = niceTop(max);
        for (i = 0; i <= 4; i++) { var y = T + ih - ih * i / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e3ecf7"' + (i ? ' stroke-dasharray="3 4"' : '') + '/><text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#8a94a6">' + (isMoney ? shortNum(max * i / 4) : (Math.round(max * i / 4 * 10) / 10)) + '</text>'; }
        var nb = fields.length, bw = Math.max(2, Math.min(18, step / (nb + 0.8))), every = Math.ceil(n / 8);
        list.forEach(function (k, idx) {
          var o = buckets[k] || {}, cx = L + step * idx + step / 2;
          fields.forEach(function (f, bi) {
            var v = o[f] || 0, h = ih * v / max, x = cx - (nb * bw) / 2 + bi * bw;
            bars += '<rect x="' + x.toFixed(1) + '" y="' + (T + ih - h).toFixed(1) + '" width="' + (bw - (nb > 1 ? 1 : 0)).toFixed(1) + '" height="' + Math.max(h, v > 0 ? 2 : 0).toFixed(1) + '" rx="' + Math.min(4, bw / 2) + '" fill="' + SERIES[f][1] + '"><title>' + bucketLabel(k) + (period === '90' ? ' (week)' : '') + ' — ' + SERIES[f][0] + ': ' + (isMoney ? 'Rs ' + Math.round(v).toLocaleString('en-US') : v) + '</title></rect>';
          });
          if (idx % every === 0) g += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#8a94a6">' + bucketLabel(k) + '</text>';
        });
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Trend over the selected period" style="display:block">' + g + bars + '</svg>' +
          '<div class="dbc-leg">' + fields.map(function (f) { return '<span><i style="background:' + SERIES[f][1] + '"></i>' + SERIES[f][0] + '</span>'; }).join('') + '</div>';
      }
      var invoices = DB.all('invoices') || [];
      invoices.forEach(function (inv) {
        if (!inv || !inv.id) return;
        invoiceById[inv.id] = inv;
        var row = rowForInvoice(inv);
        invoiceBranch[inv.id] = row.id;
        row.activity++;
        row.due += Math.max(0, +inv.due || 0);
        if (inPeriod(inv.createdAt)) {
          row.billed += +inv.total || 0;
          row.invoices++;
          tally(inv.createdAt, 'billed', +inv.total || 0);
        }
      });
      if (showBranchMoney) {
        (DB.all('payments') || []).forEach(function (payment) {
          var inv = payment && invoiceById[payment.invoiceId];
          if (!inv || !inPeriod(payment.date)) return;
          var row = rows[invoiceBranch[inv.id]] || rows.__unassigned;
          row.collected += +payment.amount || 0;
          tally(payment.date, 'collected', +payment.amount || 0);
        });
      }
      var demand = {};
      invoices.forEach(function (inv) {
        if (!inv || !inPeriod(inv.createdAt)) return;
        (inv.items || []).forEach(function (item) {
          var ids = item.isPackage && item.includes && item.includes.length ? item.includes : [item.testId || ''];
          ids.forEach(function (testId) {
            var test = testId && DB.get('tests', testId), key = testId || item.code || item.name || 'unknown';
            if (!demand[key]) demand[key] = { name: (test && test.name) || item.name || 'Unnamed test', count: 0 };
            demand[key].count++;
            tally(inv.createdAt, 'tests', 1);
          });
        });
      });
      var demandRows = Object.keys(demand).map(function (k) { return demand[k]; })
        .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); }).slice(0, 10);
      var demandHtml = demandRows.length
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th class="num">Ordered</th></tr></thead><tbody>' +
          demandRows.map(function (r) { return '<tr><td><strong>' + App.esc(r.name) + '</strong><div class="db-bar"><i style="width:' + Math.max(3, Math.round(100 * r.count / demandRows[0].count)) + '%"></i></div></td><td class="num">' + r.count + '</td></tr>'; }).join('') +
          '</tbody></table></div>'
        : App.empty('No test orders in this period.');
      var branchHtml = '';
      if (showBranchMoney) {
        var branchRows = Object.keys(rows).map(function (k) { return rows[k]; })
          .filter(function (r) { return r.activity > 0; })
          .sort(function (a, b) { return b.billed - a.billed || a.name.localeCompare(b.name); });
        var branchTable = branchRows.length
          ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Branch</th><th class="num">Billed</th><th class="num">Collected</th><th class="num">Pending dues</th></tr></thead><tbody>' +
            branchRows.map(function (r) { return '<tr><td><strong>' + App.esc(r.name) + '</strong><br><small class="muted">' + r.invoices + ' invoice' + (r.invoices === 1 ? '' : 's') + ' in period</small></td><td class="num">' + App.money(r.billed) + '</td><td class="num">' + App.money(r.collected) + '</td><td class="num">' + App.money(r.due) + '</td></tr>'; }).join('') +
            '</tbody></table></div>'
          : App.empty('No invoices or payments in this period.');
        var bMax = 0; branchRows.forEach(function (r) { bMax = Math.max(bMax, r.billed, r.collected, r.due); });
        var branchBars = branchRows.length && bMax > 0 ? '<div class="db-bbars">' + branchRows.map(function (r) {
          function line(label, v, color) { return '<div class="db-bline"><span>' + label + '</span><div class="db-btrack"><i style="width:' + (v > 0 ? Math.max(2, Math.round(100 * v / bMax)) : 0) + '%;background:' + color + '"></i></div><b>' + App.money(v) + '</b></div>'; }
          return '<div class="db-bbranch"><div class="db-bname">' + App.esc(r.name) + '</div>' + line('Billed', r.billed, '#3b82f6') + line('Collected', r.collected, '#10b981') + line('Pending', r.due, '#f59e0b') + '</div>';
        }).join('') + '</div>' : '';
        branchHtml = '<div class="db-smart-branch"><h3>Branch revenue &amp; dues</h3>' + branchBars + branchTable +
          '<div class="dbc-sub">Billed and collected follow the selected period. Pending dues include all currently open invoices.</div></div>';
      }
      /* top numbers + the trend over the selected period */
      var kBilled = 0, kCollected = 0, kDue = 0, kInvoices = 0, kTests = 0;
      Object.keys(rows).forEach(function (k) { kBilled += rows[k].billed; kCollected += rows[k].collected; kDue += rows[k].due; kInvoices += rows[k].invoices; });
      Object.keys(demand).forEach(function (k) { kTests += demand[k].count; });
      function kpi(icon, label, sub, value) {
        return '<div class="ovk sm"><div class="ovk-h"><span class="ovk-ic">' + App.icon(icon, 20) + '</span><div class="ovk-t"><b>' + label + '</b><small>' + sub + '</small></div></div><div class="ovk-v">' + value + '</div></div>';
      }
      var kpiHtml = '<div class="ov-grid">' + (showBranchMoney
        ? kpi('file', 'Billed', 'Invoices in the period', App.money(kBilled)) + kpi('wallet', 'Collected', 'Cash received', App.money(kCollected)) + kpi('coins', 'Pending dues', 'All open invoices', App.money(kDue)) + kpi('clipboard', 'Invoices', 'Made in the period', String(kInvoices))
        : kpi('clipboard', 'Invoices', 'Made in the period', String(kInvoices)) + kpi('flask', 'Tests ordered', 'In the period', String(kTests))) + '</div>';
      var trend = trendSvg(showBranchMoney ? ['billed', 'collected'] : ['tests'], showBranchMoney);
      var trendHtml = trend ? '<div class="card db-trend"><div class="card-b"><h3>' + (showBranchMoney ? 'Billed vs collected' : 'Tests ordered') + '</h3>' + trend + '</div></div>' : '';
      return kpiHtml + '<div class="db-smart-grid' + (showBranchMoney ? '' : ' db-smart-tests-only') + '">' +
        (branchHtml ? '<div class="card"><div class="card-b">' + branchHtml + '</div></div>' : '') +
        '<div class="card"><div class="card-b"><h3>Test demand</h3>' + demandHtml + '</div></div></div>' + trendHtml;
    }

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
        var els = document.querySelectorAll('#view .stat .vl[data-count], #view .kpi .kpi-nm[data-count], #view .ovk .ovk-v[data-count]');
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

    // ---- Overview: period dropdown + eight KPI cards ----
    var expAll = DB.all('expenses') || [];
    function rangeFrom(period) {
      var d = new Date();
      if (period === '7') d.setDate(d.getDate() - 6);
      else if (period === 'month') d.setDate(1);
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    var PERIOD_LABEL = { today: 'today', '7': 'this week', month: 'this month' };
    function ovCards(period) {
      var from = rangeFrom(period), within = function (v) { var k = dayKey(v); return !!k && k >= from && k <= today; };
      var pays = payments.filter(function (x) { return within(x.date); });
      var col = pays.reduce(function (a, x) { return a + (+x.amount || 0); }, 0);
      var invs = invoices.filter(function (x) { return within(x.createdAt); });
      var tests = invs.reduce(function (a, x) { return a + (x.items ? x.items.length : 0); }, 0);
      var billed = invs.reduce(function (a, x) { return a + (+x.total || 0); }, 0);
      var seen = {}, reported = results.filter(function (r) {
        if (r.status !== 'ready' || !within(r.reportedAt)) return false;
        var k = r.invoiceId + '|' + r.testId; if (seen[k]) return false; seen[k] = 1; return true;
      }).length;
      var newPts = patients.filter(function (x) { return within(x.createdAt); }).length;
      var dueSum = invoices.reduce(function (a, x) { return a + Math.max(0, +x.due || 0); }, 0);
      var dueN = invoices.filter(function (x) { return (+x.due || 0) > 0; }).length;
      var exp = expAll.filter(function (x) { return within(x.date); }).reduce(function (a, x) { return a + (+x.amount || 0); }, 0);
      var pl = PERIOD_LABEL[period] || '';
      function card(ic, tint, title, sub, value, raw, isMoney, extra, href) {
        var cnt = (typeof raw === 'number' && isFinite(raw)) ? ' data-count="' + raw + '" data-money="' + (isMoney ? '1' : '0') + '"' : '';
        return '<div class="ovk" style="--kc:' + tint + '"><div class="ovk-h"><span class="ovk-ic">' + App.icon(ic, 20) + '</span>' +
          '<div class="ovk-t"><b>' + App.esc(title) + '</b><small>' + App.esc(sub) + '</small></div>' +
          '<a class="ovk-m" href="' + href + '" title="Open" aria-label="Open ' + App.esc(title) + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></a></div>' +
          '<div class="ovk-v"' + cnt + '>' + value + '</div>' + (extra || '') + '</div>';
      }
      var bar = function (pct, color) { return '<div class="ovk-bar"><i style="width:' + Math.max(2, Math.min(100, Math.round(pct))) + '%;background:' + color + '"></i></div>'; };
      var out = '';
      if (isTech) {
        out += card('flask', '#7c3aed', 'Tests Ordered', 'Tests ' + pl, String(tests), tests, false, '<div class="ovk-f">' + invs.length + ' invoices</div>', '#/invoices');
        out += card('check', '#16a34a', 'Reported', 'Results completed ' + pl, String(reported), reported, false, '', '#/results/ready');
        out += card('alert', '#d97706', 'Pending Results', 'Waiting for entry', String(pendingRes.length), pendingRes.length, false, '', '#/results');
        out += card('users', '#2f6df6', 'New Patients', 'Registered ' + pl, String(newPts), newPts, false, '<div class="ovk-f">' + patients.length + ' in total</div>', '#/patients');
        return out;
      }
      var rate = billed > 0 ? Math.min(100, col * 100 / billed) : 0;
      out += card('wallet', '#2f6df6', 'Collection', 'Cash received ' + pl, App.money(col), col, true, '<div class="ovk-f">' + pays.length + ' payment' + (pays.length === 1 ? '' : 's') + '</div>', '#/finance');
      out += card('flask', '#7c3aed', 'Tests Ordered', 'Tests ' + pl, String(tests), tests, false, '<div class="ovk-f">' + invs.length + ' invoice' + (invs.length === 1 ? '' : 's') + '</div>', '#/invoices');
      out += card('alert', '#d97706', 'Pending Results', 'Waiting for entry', String(pendingRes.length), pendingRes.length, false, '<div class="ovk-f">awaiting result entry</div>', '#/results');
      out += card('users', '#0ea5e9', 'New Patients', 'Registered ' + pl, String(newPts), newPts, false, '<div class="ovk-f">' + patients.length + ' patients in total</div>', '#/patients');
      out += card('check', '#16a34a', 'Reported', 'Results completed ' + pl, String(reported), reported, false, '', '#/results/ready');
      out += card('file', '#2563eb', 'Billed', 'Invoices ' + pl, App.money(billed), billed, true, bar(rate, '#16a34a') + '<div class="ovk-f"><b>' + Math.round(rate) + '%</b> collected</div>', '#/invoices');
      out += card('coins', '#dc2626', 'Outstanding Dues', 'Unpaid balance, all invoices', App.money(dueSum), dueSum, true, '<div class="ovk-f">' + dueN + ' unpaid invoice' + (dueN === 1 ? '' : 's') + '</div>', '#/dues');
      out += card('finance', '#0ea5a4', 'Expenses', 'Spent ' + pl, App.money(exp), exp, true, '<div class="ovk-f">net <b>' + App.money(col - exp) + '</b></div>', '#/expenses');
      return out;
    }
    var ovHead = '<div class="ov-head"><div><h1>Overview</h1><p>Here is the Summary of Overall Data</p></div>' +
      '<select class="select" id="ovPeriod" aria-label="Period"><option value="today">Today</option><option value="7">Last 7 days</option><option value="month">This month</option></select></div>';
    var ovGrid = '<div class="ov-grid" id="ovGrid">' + ovCards('today') + '</div>';
    window.__ovCards = ovCards;

    // ---- quick-access cards ----
    var quickCss =
    '<style>' +
    '.dbw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:18px;align-items:stretch}' +
    '.dbq-card{display:flex;flex-direction:column;height:100%;min-height:0;border-radius:22px!important;transition:transform .15s,box-shadow .15s}.dbq-card:hover{transform:translateY(-2px);box-shadow:0 14px 34px -18px rgba(27,42,74,.35)}' +
    '.dbq-card .card-b{padding:16px 18px!important;flex:1;display:flex!important;flex-direction:row!important;align-items:center;justify-content:flex-start;text-align:left;gap:14px!important;box-sizing:border-box}' +
    '.dbq-card .card-b>span:first-child{width:46px!important;height:46px!important;border-radius:14px!important;flex:none}.dbq-card .card-b>span:first-child svg{width:22px;height:22px}' +
    '.dbq-card .card-b>span:last-child{flex:1;min-width:0;overflow-wrap:break-word}' +
    '.dbq-card b{display:block;font-size:15px!important;line-height:1.3!important}.dbq-card br{display:none}.dbq-card small{font-size:12.5px!important;line-height:1.35!important;display:block;margin-top:2px}' +
    '@media(max-width:1250px){.dbw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '@media(max-width:640px){.dbw-grid{grid-template-columns:1fr}}' +
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
    }).slice(0, 7);
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
      .sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); }).slice(0, 6);
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
      var W = 900, H = 270, L = 50, R = 14, T = 16, B = 34, iw = W - L - R, ih = H - T - B, n = DAYS7.length;
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
      chartA = bigCard('Cash Flow', 'Collections vs expenses · last 7 days', chip('Collected', App.money(sum(col7)), '#2563eb') + chip('Expenses', App.money(sum(exp7)), '#d97706') + chip(net >= 0 ? 'Net profit' : 'Net loss', (net < 0 ? '−' : '') + App.money(Math.abs(net)), net >= 0 ? '#059669' : '#dc2626'),
        chartSvg({ label: 'Collections and expenses per day', money: true, bars: [{ name: 'Collected', data: col7, color: '#3b82f6' }, { name: 'Expenses', data: exp7, color: '#f59e0b' }] }), legend([['Collected', '#3b82f6'], ['Expenses', '#f59e0b']]), ['#/finance/profit', 'Profit &amp; Loss']);
    }
    chartB = bigCard('Tests &amp; Invoices', 'Last 7 days', chip('Tests ordered', sum(tests7), '#7c3aed') + chip('Invoices', sum(inv7), '#ea580c') + chip('Today', tests7[6] + ' tests'),
      chartSvg({ label: 'Tests ordered and invoices per day', bars: [{ name: 'Invoices', data: inv7, color: '#fdba74' }], line: { name: 'Tests ordered', data: tests7, color: '#7c3aed' } }), legend([['Invoices', '#fdba74'], ['Tests ordered', '#7c3aed']]), isTech ? null : ['#/invoices', 'Invoices']);
    var chartsHtml = '<div class="db-charts">' + chartA + chartB + '</div>';
    /* the Smart Dashboard section was removed from the dashboard (smartAnalyticsBody is kept for the tests / later use) */


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
    '.db-page .card{border-radius:16px;box-shadow:var(--sh-md);border:1.5px solid #8c9ab3}' +
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
    '.db-smart{margin-bottom:16px}.db-smart-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:20px}.db-smart-grid.db-smart-tests-only{grid-template-columns:1fr}.db-smart-grid h3{font-size:15px;margin:0 0 10px;font-weight:800}.db-smart-grid .tbl-wrap{max-height:360px;overflow:auto}.db-smart-branch .dbc-sub{margin-top:8px}' +
    '.db-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}' +
    '.db-kpi{background:#f7f9fd;border:1.5px solid #8c9ab3;border-left:4px solid var(--kc);border-radius:14px;padding:12px 14px}.db-kpi small{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.db-kpi b{font-size:20px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.db-trend{margin:20px 0 0;border:1.5px solid #8c9ab3;border-radius:14px;padding:14px 16px}.db-trend h3{font-size:15px;margin:0 0 8px;font-weight:800}' +
    '.db-bar{height:5px;border-radius:99px;background:#e9eef8;margin-top:6px;overflow:hidden}.db-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7c3aed,#3b82f6)}' +
    '.db-bbars{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}.db-bname{font-weight:800;font-size:13.5px;margin-bottom:6px}.db-bline{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;font-size:12px;color:var(--muted);margin-bottom:4px}.db-bline b{color:var(--ink);font-variant-numeric:tabular-nums;min-width:88px;text-align:right}.db-btrack{height:9px;border-radius:99px;background:#e9eef8;overflow:hidden}.db-btrack i{display:block;height:100%;border-radius:99px}' +
    '@media(max-width:900px){.db-smart-grid{grid-template-columns:1fr}}' +
    '.db-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-bottom:20px}' +
    '@media(max-width:1000px){.db-grid{grid-template-columns:1fr}}' +
    '.db-grid .card-h h3{font-size:16.5px;font-weight:700;letter-spacing:-.01em}' +
    '@media (prefers-reduced-motion:reduce){.stat{animation:none}.stat:hover{transform:none}}' +
    '</style>' +

    ovHead + critCard() + ovGrid +
    '<h3 class="ov-h3">Quick access</h3>' + quickCss + quickAccess +
    '<div class="ov-two"><div class="ov-col">' + chartA + chartB + '</div><div class="ov-col">' + patCard + pendCard + '</div></div>' +
    '</div>';
    } /* end buildDashboard */

    /* Critical results nobody has acknowledged yet (set when a result far outside the normal range is saved) */
    function critCard() {
      var me = App.session();
      if (!me || ['admin', 'technician'].indexOf(me.role) === -1 || !App.canPage('results') || (App.featureOn && !App.featureOn('results'))) return '';
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
          var me = App.session();
          if (!me || ['admin', 'technician'].indexOf(me.role) === -1 || !App.canPage('results') || (App.featureOn && !App.featureOn('results'))) return;
          DB.update('results', b.getAttribute('data-ack'), { criticalAck: { by: (session() || {}).name || 'user', at: new Date().toISOString() } });
          if (App.notifications) App.notifications.refresh();
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
      var ovSel = v.querySelector('#ovPeriod');
      if (ovSel) ovSel.addEventListener('change', function () {
        var g = v.querySelector('#ovGrid'); if (g && window.__ovCards) { g.innerHTML = window.__ovCards(ovSel.value); scheduleCountUp(); }
      });
      scheduleCountUp();
    }, 120);

    return skeletonHtml();
  });
})();
