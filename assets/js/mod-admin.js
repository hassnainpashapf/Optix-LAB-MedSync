/* ============================================================
   Optix Medical Sync — Admin module (Agent 10)
   Routes: #/expenses, #/reports, #/settings
   Depends on: window.DB, window.App (per SPEC.md)
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  var PRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  var DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
  function sess() {
    try { return JSON.parse(localStorage.getItem('labpos_session')) || null; }
    catch (e) { return null; }
  }
  function role() { var s = sess(); return s ? s.role : ''; }
  function userName() { var s = sess(); return s ? (s.name || s.username || 'staff') : 'staff'; }
  function denied() { App.toast('Access denied for your role.', 'err'); App.nav('#/dashboard'); }

  // normalize any date/datetime value to local YYYY-MM-DD
  function toDay(v) {
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var d = new Date(v);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function thisMonth() { return App.today().slice(0, 7); }
  function addDays(dayStr, n) {
    var p = dayStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function inRange(day, from, to) { return day >= from && day <= to; }

  function expCats() { return App.listOptions('expenseCategory'); }

  /* dashboard-style premium stat cards — markup + CSS copied from the
     dashboard statCard() pattern (stat-grid > stat > stat-ico + lb/vl/dl),
     injected inline per page so the premium look applies without touching
     app.css */
  function _svgA(paths) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var AICONS = {
    receipt: _svgA('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6"/>'),
    cal: _svgA('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
    tag: _svgA('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/>'),
    list: _svgA('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
    cash: _svgA('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
    trend: _svgA('<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
    flask: _svgA('<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/>')
  };
  function admStat(icon, tint, label, value, sub, raw, isMoney, vlStyle, fullTint) {
    var countAttrs = (typeof raw === 'number' && isFinite(raw))
      ? ' data-count="' + raw + '" data-money="' + (isMoney ? '1' : '0') + '"'
      : '';
    var cardStyle = '--sc:var(--' + tint + ')' + (fullTint ? ';background:linear-gradient(135deg,#ffffff 50%,var(--' + tint + '-soft) 50%);border-color:transparent' : '');
    return '<div class="stat" data-tint="' + tint + '" style="' + cardStyle + '">' +
      '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft)">' + icon + '</div>' +
      '<div class="lb">' + App.esc(label) + '</div>' +
      '<div class="vl"' + countAttrs + (vlStyle ? ' style="' + vlStyle + '"' : '') + '>' + value + '</div>' +
      '<div class="dl">' + sub + '</div>' +
      '</div>';
  }
  /* shared compact stat card CSS now in app.css */
  var ADM_STAT_CSS = '';
  /* dashboard-style count-up for .vl[data-count] values (final value is
     already in the markup, so a failure here never leaves a blank card) */
  function admCountUp() {
    function fmt(raw, isMoney) { return isMoney ? App.money(raw) : String(Math.round(raw)); }
    var els = document.querySelectorAll('#view .stat .vl[data-count]');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (var i = 0; i < els.length; i++) (function (el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var isMoney = el.getAttribute('data-money') === '1';
      if (reduce || target <= 0) { el.textContent = fmt(target, isMoney); return; }
      var t0 = null, dur = 800;
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

  /* ============================================================
     EXPENSES  (#/expenses) — admin + reception
     ============================================================ */
  var expFilter = { q: '', month: null };
  function expInitFilter() {
    if (!expFilter.month) expFilter.month = thisMonth();
  }

  function renderExpenses() {
    if (role() !== 'admin' && role() !== 'reception' && !(role() === 'custom' && App.canPage('expenses'))) return denied();
    expInitFilter();

    var all = DB.all('expenses').slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    var q = expFilter.q.trim().toLowerCase();
    var rows = all.filter(function (e) {
      if (expFilter.month && toDay(e.date).slice(0, 7) !== expFilter.month) return false;
      if (q && String(e.title || '').toLowerCase().indexOf(q) < 0 &&
          String(e.note || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var monthExp = DB.all('expenses').filter(function (e) {
      return toDay(e.date).slice(0, 7) === thisMonth();
    });
    var monthTotal = monthExp.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
    var todayTotal = monthExp.filter(function (e) { return toDay(e.date) === App.today(); })
      .reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
    var byCat = {};
    monthExp.forEach(function (e) {
      var c = e.category || 'Other';
      byCat[c] = (byCat[c] || 0) + (+e.amount || 0);
    });
    var topCat = '', topCatAmt = 0;
    Object.keys(byCat).forEach(function (c) {
      if (byCat[c] > topCatAmt) { topCatAmt = byCat[c]; topCat = c; }
    });
    var mLabel = new Date().toLocaleDateString('en-US', { month: 'long' });
    var expStats =
      admStat(AICONS.receipt, 'red', 'Expenses (This Month)', App.money(monthTotal), mLabel + ' total spend', monthTotal, true) +
      admStat(AICONS.cal, 'amber', 'Expenses Today', App.money(todayTotal), 'recorded today', todayTotal, true) +
      admStat(AICONS.tag, 'blue', 'Top Category', App.esc(topCat || '—'), App.money(topCatAmt) + ' this month',
        null, false, 'font-size:20px;white-space:normal;line-height:1.25') +
      admStat(AICONS.list, 'green', 'Expense Entries', monthExp.length, 'recorded in ' + mLabel, monthExp.length, false);

    var html = ''
      + '<style>' + ADM_STAT_CSS + '</style>'
      + '<div class="stat-grid">' + expStats + '</div>'
      + '<div class="card"><div class="card-b">'
      +   '<div class="toolbar" style="margin-bottom:12px">'
      +     '<input class="input search" id="exQ" placeholder="Search title or note..." value="' + App.esc(expFilter.q) + '" style="max-width:280px">'
      +     '<input class="input" type="month" id="exMonth" value="' + App.esc(expFilter.month) + '" style="max-width:180px">'
      +     '<button class="btn btn-ghost btn-sm" id="exClear">Clear</button>'
      +     '<button class="btn btn-primary" id="exAdd" style="margin-left:auto">+ Add Expense</button>'
      +   '</div>'
      +   '<div class="tbl-wrap"><table class="table"><thead><tr>'
      +   '<th>Date</th><th>Title</th><th>Category</th><th style="text-align:right">Amount</th><th>Added By</th><th>Note</th><th style="text-align:right">Actions</th>'
      +   '</tr></thead><tbody>';

    if (!rows.length) {
      html += '<tr><td colspan="7">' + App.empty('No expenses found for this filter.') + '</td></tr>';
    } else {
      rows.forEach(function (e) {
        html += '<tr>'
          + '<td style="white-space:nowrap">' + App.esc(App.d(e.date)) + '</td>'
          + '<td><strong>' + App.esc(e.title) + '</strong></td>'
          + '<td><span class="badge b-pending">' + App.esc(e.category || 'Other') + '</span></td>'
          + '<td style="text-align:right;font-weight:700">' + App.money(e.amount) + '</td>'
          + '<td>' + App.esc(e.createdBy || '—') + '</td>'
          + '<td class="muted">' + App.esc(e.note || '—') + '</td>'
          + '<td style="text-align:right;white-space:nowrap" class="actions">'
          +   '<button class="btn btn-ghost btn-sm" data-edit="' + App.esc(e.id) + '">Edit</button> '
          +   '<button class="btn btn-ghost btn-sm" data-del="' + App.esc(e.id) + '" style="color:var(--red)">Delete</button>'
          + '</td></tr>';
      });
    }
    html += '</tbody></table></div></div></div>';

    document.getElementById('view').innerHTML = html;
    admCountUp();

    document.getElementById('exAdd').addEventListener('click', function () { openExpenseModal(null); });
    document.getElementById('exQ').addEventListener('input', function (e) { expFilter.q = e.target.value; renderExpenses(); var q2 = document.getElementById('exQ'); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); });
    document.getElementById('exMonth').addEventListener('change', function (e) { expFilter.month = e.target.value; renderExpenses(); });
    document.getElementById('exClear').addEventListener('click', function () { expFilter = { q: '', month: '' }; renderExpenses(); });

    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openExpenseModal(DB.get('expenses', b.getAttribute('data-edit'))); });
    });
    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = DB.get('expenses', b.getAttribute('data-del'));
        App.confirm('Delete expense "' + e.title + '" (' + App.money(e.amount) + ')?').then(function (ok) {
          if (!ok) return;
          DB.remove('expenses', e.id);
          App.toast('Expense deleted.');
          renderExpenses();
        });
      });
    });
  }

  function openExpenseModal(exp) {
    var isEdit = !!exp;
    exp = exp || { title: '', category: 'Reagents', amount: '', date: App.today(), note: '' };
    var body = '<div class="form-grid">'
      + '<div><label class="label">Title *</label><input class="input" id="exfTitle" value="' + App.esc(exp.title) + '" placeholder="e.g. CBC reagent kit"></div>'
      + '<div><label class="label">Category *</label><select class="select" id="exfCat">'
      + App.optionsHtml('expenseCategory', exp.category)
      + '</select></div>'
      + '<div><label class="label">Amount (Rs) *</label><input class="input" id="exfAmt" type="number" min="1" step="any" value="' + App.esc(exp.amount) + '" placeholder="0"></div>'
      + '<div><label class="label">Date *</label><input class="input" id="exfDate" type="date" value="' + App.esc(toDay(exp.date) || App.today()) + '"></div>'
      + '<div><label class="label">Paid from</label><select class="select" id="exfMethod"><option value="Cash"' + (!exp.method || exp.method === 'Cash' ? ' selected' : '') + '>Cash (drawer)</option><option value="Bank"' + (exp.method === 'Bank' ? ' selected' : '') + '>Bank / online</option></select></div>'
      + '<div style="grid-column:1/-1"><label class="label">Note</label><input class="input" id="exfNote" value="' + App.esc(exp.note || '') + '" placeholder="Optional note"></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'
      + '<button class="btn btn-ghost" id="exfCancel">Cancel</button>'
      + '<button class="btn btn-primary" id="exfSave">' + (isEdit ? 'Save Changes' : 'Add Expense') + '</button></div>';

    var close = App.modal(isEdit ? 'Edit Expense' : 'Add Expense', body, {
      onOpen: function (ov, close) {
        document.getElementById('exfCancel').addEventListener('click', close);
        document.getElementById('exfSave').addEventListener('click', function () {
          var title = document.getElementById('exfTitle').value.trim();
          var cat = document.getElementById('exfCat').value;
          var amt = parseFloat(document.getElementById('exfAmt').value);
          var date = document.getElementById('exfDate').value;
          var note = document.getElementById('exfNote').value.trim();
          if (!title) return App.toast('Title is required.', 'err');
          if (!(amt > 0)) return App.toast('Enter a valid amount.', 'err');
          if (!date) return App.toast('Date is required.', 'err');
          var data = { title: title, category: cat, amount: amt, date: date, note: note, method: document.getElementById('exfMethod').value, createdBy: userName() };
          if (isEdit) { DB.update('expenses', exp.id, data); App.toast('Expense updated.'); }
          else { DB.insert('expenses', data); App.toast('Expense added.'); }
          close();
          renderExpenses();
        });
      }
    });
  }

  App.route('#/expenses', renderExpenses);

  /* ============================================================
     REPORTS  (#/reports) — admin only
     ============================================================ */
  var rep = { from: null, to: null, type: 'all', preset: 'thisMonth' };
  function repInit() {
    if (!rep.from) {
      var t = App.today();
      rep.from = t.slice(0, 8) + '01'; // first of month
      rep.to = t;
    }
    if (!rep.type) rep.type = 'all';
    if (!rep.preset) rep.preset = 'thisMonth';
  }
  function setPreset(p) {
    var t = App.today();
    if (p === 'custom') { /* no-op: keep manual From/To, just re-render */ }
    else if (p === 'today') { rep.from = t; rep.to = t; }
    else if (p === 'yesterday') { rep.from = addDays(t, -1); rep.to = addDays(t, -1); }
    else if (p === 'last7' || p === 'week') { rep.from = addDays(t, -6); rep.to = t; }
    else if (p === 'last30') { rep.from = addDays(t, -29); rep.to = t; }
    else if (p === 'thisMonth' || p === 'month') { rep.from = t.slice(0, 8) + '01'; rep.to = t; }
    else if (p === 'lastMonth') {
      var prevEnd = addDays(t.slice(0, 8) + '01', -1); // last day of previous month
      rep.from = prevEnd.slice(0, 8) + '01';
      rep.to = prevEnd;
    }
    else return; // unknown preset: leave state untouched
    rep.preset = (p === 'week') ? 'last7' : (p === 'month') ? 'thisMonth' : p;
    renderReports();
  }

  function renderReports() {
    if (role() !== 'admin' && !(role() === 'custom' && App.canPage('reports'))) return denied();
    repInit();
    var from = rep.from, to = rep.to;

    var invoices = DB.all('invoices').filter(function (iv) { return inRange(toDay(iv.createdAt), from, to); });
    var payments = DB.all('payments').filter(function (p) { return inRange(toDay(p.date || p.createdAt), from, to); });
    var expenses = DB.all('expenses').filter(function (e) { return inRange(toDay(e.date), from, to); });

    var billed = invoices.reduce(function (s, iv) { return s + (+iv.total || 0); }, 0);
    var discounts = invoices.reduce(function (s, iv) { return s + (+iv.discount || 0); }, 0);
    var collected = payments.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
    var due = invoices.reduce(function (s, iv) { return s + (+iv.due || 0); }, 0);
    var expTotal = expenses.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
    var net = collected - expTotal;

    /* ---- previous-period comparison: same length, immediately before ---- */
    var pLen = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    if (!(pLen > 0)) pLen = 1;
    var pTo = addDays(from, -1), pFrom = addDays(from, -pLen);
    var pInv = DB.all('invoices').filter(function (iv) { return inRange(toDay(iv.createdAt), pFrom, pTo); });
    var pPay = DB.all('payments').filter(function (p) { return inRange(toDay(p.date || p.createdAt), pFrom, pTo); });
    var pExp = DB.all('expenses').filter(function (e) { return inRange(toDay(e.date), pFrom, pTo); });
    var pBilled = pInv.reduce(function (s, iv) { return s + (+iv.total || 0); }, 0);
    var pCollected = pPay.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
    var pExpTotal = pExp.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
    var pNet = pCollected - pExpTotal;
    var pTests = pInv.reduce(function (s, iv) { return s + ((iv.items || []).length); }, 0);
    var pInvCount = pInv.length;

    /* ---- report type visibility flags ---- */
    var showAll = rep.type === 'all';
    var showTests = showAll || rep.type === 'tests';
    var showFinance = showAll || rep.type === 'finance';
    var showDues = showAll || rep.type === 'dues';
    var showPatients = showAll || rep.type === 'patients';

    /* ---- this-month snapshot row (real data) ---- */
    var mFrom = App.today().slice(0, 8) + '01', mTo = App.today();
    var mLbl2 = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    var mShort = new Date().toLocaleDateString('en-US', { month: 'long' });
    var mPayments = DB.all('payments').filter(function (p) { return inRange(toDay(p.date || p.createdAt), mFrom, mTo); });
    var mExpenses = DB.all('expenses').filter(function (e) { return inRange(toDay(e.date), mFrom, mTo); });
    var mInvoices = DB.all('invoices').filter(function (iv) { return inRange(toDay(iv.createdAt), mFrom, mTo); });
    var mColl = mPayments.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
    var mExpT = mExpenses.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
    var mNet = mColl - mExpT;
    var mTests = mInvoices.reduce(function (s, iv) { return s + ((iv.items || []).length); }, 0);
    var CASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>';
    var RECEIPT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>';
    var TREND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
    var FLASK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v6L4.5 18a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 8V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></svg>';
    var USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    var ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
    function kpi(cls, icon, label, num, sub) {
      return '<div class="kpi ' + cls + '"><div class="kpi-ic">' + icon + '</div><div class="kpi-lb">' + label + '</div><div class="kpi-nm">' + num + '</div><div class="kpi-sb">' + sub + '</div></div>';
    }

    var methods = { Cash: 0, Bank: 0, Card: 0, Other: 0 };
    payments.forEach(function (p) {
      var m = p.method || 'Cash';
      if (!methods.hasOwnProperty(m)) methods.Other += (+p.amount || 0);
      else methods[m] += (+p.amount || 0);
    });

    // test-wise
    var tw = {};
    invoices.forEach(function (iv) {
      (iv.items || []).forEach(function (it) {
        var k = it.code || it.name || '—';
        if (!tw[k]) tw[k] = { code: it.code || '', name: it.name || '', count: 0, revenue: 0 };
        tw[k].count++;
        tw[k].revenue += (+it.price || 0);
      });
    });
    var twRows = Object.keys(tw).map(function (k) { return tw[k]; })
      .sort(function (a, b) { return b.revenue - a.revenue; });

    // revenue by test category (via tests DB, fallback 'Other') + top 5 tests by count
    var catRev = {};
    invoices.forEach(function (iv) {
      (iv.items || []).forEach(function (it) {
        var tRec = it.testId ? DB.get('tests', it.testId) : null;
        var cat = (tRec && tRec.category) ? tRec.category : 'Other';
        if (!catRev[cat]) catRev[cat] = 0;
        catRev[cat] += (+it.price || 0);
      });
    });
    var catRows = Object.keys(catRev).map(function (c) { return { cat: c, revenue: catRev[c] }; })
      .sort(function (a, b) { return b.revenue - a.revenue; });
    var top5 = Object.keys(tw).map(function (k) { return tw[k]; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 5);

    // doctor-wise
    var dw = {};
    var tByIdRep = App.testsById();
    invoices.forEach(function (iv) {
      if (!iv.doctorId) return;
      var doc = DB.get('doctors', iv.doctorId);
      var nm = doc ? doc.name : 'Unknown doctor';
      if (!dw[iv.doctorId]) dw[iv.doctorId] = { name: nm, referrals: 0, billed: 0, pct: doc ? (+doc.commissionPct || 0) : 0 };
      dw[iv.doctorId].referrals++;
      dw[iv.doctorId].billed += (+iv.total || 0);
      dw[iv.doctorId].comm = (dw[iv.doctorId].comm || 0) + (doc ? App.commissionOf(iv, doc, tByIdRep) : 0);
      if (doc && (doc.commissionRules || []).length && dw[iv.doctorId].billed > 0) dw[iv.doctorId].pct = Math.round(dw[iv.doctorId].comm / dw[iv.doctorId].billed * 1000) / 10;
    });
    var dwRows = Object.keys(dw).map(function (k) { return dw[k]; })
      .sort(function (a, b) { return b.billed - a.billed; });

    /* ---- report sections shared by CSV export + print ---- */
    var repTypeLbl = { all: 'All Reports', tests: 'Test Reports', finance: 'Finance', dues: 'Dues', patients: 'Patient Reports', labs: 'Lab Comparison' }[rep.type] || rep.type;
    var repSecs = {
      finance: rep.type === 'all' || rep.type === 'finance',
      tests: rep.type === 'all' || rep.type === 'tests',
      doctors: rep.type === 'all' || rep.type === 'tests',
      dues: rep.type === 'all' || rep.type === 'dues',
      patients: rep.type === 'all' || rep.type === 'patients'
    };
    function csvEsc(v) {
      var s = (v === null || v === undefined) ? '' : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var repUnpaid = invoices.filter(function (iv) { return (+iv.due || 0) > 0; });
    var repPatients = {};
    invoices.forEach(function (iv) { if (iv.patientId) repPatients[iv.patientId] = true; });
    var repPatientCount = Object.keys(repPatients).length;
    /* ---- previous-period % change: {txt:'+12.5%', up:true/false/null} ---- */
    function pctChg(cur, prev) {
      cur = +cur || 0; prev = +prev || 0;
      if (prev === 0) {
        if (cur === 0) return { txt: '—', up: null };
        return { txt: 'new', up: cur > 0 };
      }
      var r = Math.round((cur - prev) / prev * 100 * 10) / 10;
      return { txt: (r > 0 ? '+' : '') + r + '%', up: r > 0 ? true : (r < 0 ? false : null) };
    }

    /* ---- custom report builder (worker 7) ---- */
    var builderSources = {
      invoices: {
        label: 'Invoices',
        dateOf: function (iv) { return iv.createdAt; },
        recs: function () { return DB.all('invoices'); },
        cols: [
          { key: 'no', label: 'Invoice No', get: function (iv) { return iv.no || iv.id; } },
          { key: 'patient', label: 'Patient', get: function (iv) { var p = iv.patientId ? DB.get('patients', iv.patientId) : null; return p ? p.name : 'Walk-in'; } },
          { key: 'doctor', label: 'Doctor', get: function (iv) { var d = iv.doctorId ? DB.get('doctors', iv.doctorId) : null; return d ? d.name : '—'; } },
          { key: 'date', label: 'Date', get: function (iv) { return App.d(iv.createdAt); } },
          { key: 'total', label: 'Total', get: function (iv) { return +iv.total || 0; } },
          { key: 'discount', label: 'Discount', get: function (iv) { return +iv.discount || 0; } },
          { key: 'due', label: 'Due', get: function (iv) { return +iv.due || 0; } }
        ]
      },
      payments: {
        label: 'Payments',
        dateOf: function (p) { return p.date || p.createdAt; },
        recs: function () { return DB.all('payments'); },
        cols: [
          { key: 'date', label: 'Date', get: function (p) { return App.d(p.date || p.createdAt); } },
          { key: 'invoice', label: 'Invoice', get: function (p) { var iv = p.invoiceId ? DB.get('invoices', p.invoiceId) : null; return iv ? (iv.no || iv.id) : '—'; } },
          { key: 'method', label: 'Method', get: function (p) { return p.method || 'Cash'; } },
          { key: 'amount', label: 'Amount', get: function (p) { return +p.amount || 0; } }
        ]
      },
      expenses: {
        label: 'Expenses',
        dateOf: function (e) { return e.date; },
        recs: function () { return DB.all('expenses'); },
        cols: [
          { key: 'date', label: 'Date', get: function (e) { return App.d(e.date); } },
          { key: 'category', label: 'Category', get: function (e) { return e.category || 'Other'; } },
          { key: 'title', label: 'Title', get: function (e) { return e.title || '—'; } },
          { key: 'amount', label: 'Amount', get: function (e) { return +e.amount || 0; } }
        ]
      },
      patients: {
        label: 'Patients',
        dateOf: function (p) { return p.createdAt; },
        recs: function () { return DB.all('patients'); },
        cols: [
          { key: 'name', label: 'Name', get: function (p) { return p.name || '—'; } },
          { key: 'phone', label: 'Phone', get: function (p) { return p.phone || '—'; } },
          { key: 'agesex', label: 'Age/Sex', get: function (p) { return (p.age ? p.age + 'y' : '—') + ' / ' + (p.gender || '—'); } },
          { key: 'registered', label: 'Registered', get: function (p) { return App.d(p.createdAt); } }
        ]
      }
    };

    /* tiny self-contained CSV escaper (quotes + embedded-quote doubling) */
    function builderCsvEsc(v) {
      var s = (v === null || v === undefined) ? '' : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    }

    /* modal-driven ad-hoc report builder: pick source + columns + range, preview, export full CSV */
    function openBuilder() {
      var srcKeys = Object.keys(builderSources);
      var body = ''
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px">'
        + '<div><label class="label">Data source</label><select class="input" id="rbSrc">'
        + srcKeys.map(function (k) { return '<option value="' + k + '">' + builderSources[k].label + '</option>'; }).join('')
        + '</select></div>'
        + '<div><label class="label">From</label><input class="input" type="date" id="rbFrom" value="' + App.esc(from) + '"></div>'
        + '<div><label class="label">To</label><input class="input" type="date" id="rbTo" value="' + App.esc(to) + '"></div>'
        + '<div style="flex:1;min-width:160px"><label class="label">Search</label><input class="input" id="rbQ" placeholder="Type to filter rows..." style="width:100%"></div>'
        + '<button class="btn btn-primary" id="rbPreview">Preview</button>'
        + '<button class="btn btn-ghost" id="rbCsv">' + DL_ICON + ' Export CSV</button>'
        + '</div>'
        + '<div id="rbCols" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px"></div>'
        + '<div id="rbCount" class="muted" style="margin-bottom:8px;font-size:13px"></div>'
        + '<div class="tbl-wrap" style="max-height:320px;overflow:auto"><table class="table" id="rbTable"></table></div>';
      App.modal('Custom Report Builder', body, { wide: true, onOpen: function (ov, close) {
        var srcEl = document.getElementById('rbSrc');
        var fromEl = document.getElementById('rbFrom');
        var toEl = document.getElementById('rbTo');
        var qEl = document.getElementById('rbQ');
        function srcCfg() { return builderSources[srcEl.value]; }
        function selCols() {
          var cfg = srcCfg(), on = {};
          document.querySelectorAll('#rbCols [data-rbcol]').forEach(function (cb) {
            if (cb.checked) on[cb.getAttribute('data-rbcol')] = true;
          });
          return cfg.cols.filter(function (c) { return on[c.key]; });
        }
        function runRows() {
          var cfg = srcCfg();
          var f = fromEl.value, t = toEl.value;
          var q = qEl.value.trim().toLowerCase();
          return cfg.recs()
            .filter(function (rec) { return inRange(toDay(cfg.dateOf(rec)), f, t); })
            .filter(function (rec) {
              if (!q) return true;
              return cfg.cols.some(function (c) { return String(c.get(rec)).toLowerCase().indexOf(q) > -1; });
            })
            .map(function (rec) {
              return cfg.cols.map(function (c) { return c.get(rec); });
            });
        }
        function paintCols() {
          var cfg = srcCfg();
          document.getElementById('rbCols').innerHTML = cfg.cols.map(function (c) {
            return '<label style="display:inline-flex;gap:6px;align-items:center;font-size:13px;cursor:pointer">'
              + '<input type="checkbox" data-rbcol="' + c.key + '" checked> ' + App.esc(c.label) + '</label>';
          }).join('');
        }
        function cellHtml(v) { return App.esc(v === null || v === undefined ? '' : String(v)); }
        function preview() {
          var cfg = srcCfg();
          var cols = selCols();
          var idx = {};
          cfg.cols.forEach(function (c, i) { idx[c.key] = i; });
          var rows = runRows();
          document.getElementById('rbCount').textContent = rows.length + ' rows match';
          document.getElementById('rbTable').innerHTML =
            '<thead><tr>' + cols.map(function (c) { return '<th>' + App.esc(c.label) + '</th>'; }).join('') + '</tr></thead>'
            + '<tbody>'
            + (rows.length
                ? rows.slice(0, 50).map(function (r) {
                    return '<tr>' + cols.map(function (c) { return '<td>' + cellHtml(r[idx[c.key]]) + '</td>'; }).join('') + '</tr>';
                  }).join('')
                : '<tr><td colspan="' + Math.max(cols.length, 1) + '">No matching rows.</td></tr>')
            + '</tbody>';
        }
        function exportCsv() {
          try {
            var cfg = srcCfg();
            var cols = selCols();
            if (!cols.length) return App.toast('Select at least one column.', 'err');
            var idx = {};
            cfg.cols.forEach(function (c, i) { idx[c.key] = i; });
            var L = [cols.map(function (c) { return builderCsvEsc(c.label); }).join(',')];
            runRows().forEach(function (r) {
              L.push(cols.map(function (c) { return builderCsvEsc(r[idx[c.key]]); }).join(','));
            });
            var blob = new Blob([L.join('\r\n')], { type: 'text/csv' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'custom-report-' + srcEl.value + '-' + fromEl.value + '-to-' + toEl.value + '.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
            App.toast('Report exported.');
          } catch (e) { App.toast('Export failed: ' + e.message, 'err'); }
        }
        srcEl.addEventListener('change', function () { paintCols(); preview(); });
        fromEl.addEventListener('change', preview);
        toEl.addEventListener('change', preview);
        qEl.addEventListener('input', preview);
        document.getElementById('rbCols').addEventListener('change', preview);
        document.getElementById('rbPreview').addEventListener('click', preview);
        document.getElementById('rbCsv').addEventListener('click', exportCsv);
        paintCols();
        preview();
      } });
    }
    /* ---- report templates (worker 8): saved {type,from,to,preset} presets ---- */
    var REP_PRESET_LBL = { today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', thisMonth: 'This month', lastMonth: 'Last month', custom: 'Custom range' };
    var REP_TYPE_LBL = { all: 'All', tests: 'Tests', finance: 'Finance', dues: 'Dues', patients: 'Patients', labs: 'Labs' };
    function repTplList() { return DB.all('report_templates') || []; }
    function repTplDesc(t) {
      var tl = REP_TYPE_LBL[t.type] || 'All';
      var pl = REP_PRESET_LBL[t.preset] || ((t.from && t.to) ? App.d(t.from) + ' to ' + App.d(t.to) : 'Custom range');
      return tl + ' · ' + pl;
    }
    function repTplSave() {
      var inp = document.getElementById('repTplName');
      var name = inp ? inp.value.trim() : '';
      if (!name) { App.toast('Enter a template name first.', 'err'); if (inp) inp.focus(); return; }
      if (!rep.type) { App.toast('Choose a report type first, then save it as a template.', 'err'); return; }
      var dup = repTplList().some(function (t) { return String(t.name).toLowerCase() === name.toLowerCase(); });
      DB.insert('report_templates', { name: name, type: rep.type, from: rep.from, to: rep.to, preset: rep.preset, createdAt: new Date().toISOString() });
      if (inp) inp.value = '';
      App.toast(dup ? 'Template saved (duplicate name).' : 'Template saved.');
      renderReports();
    }
    function repTplSelId() {
      var sel = document.getElementById('repTplSel');
      return sel ? sel.value : '';
    }
    function repTplApply() {
      var id = repTplSelId();
      if (!id) { App.toast('Select a template first.', 'err'); return; }
      var t = repTplList().filter(function (x) { return String(x.id) === String(id); })[0];
      if (!t) { App.toast('Template not found.', 'err'); return; }
      rep.type = t.type || 'all';
      rep.from = t.from || rep.from;
      rep.to = t.to || rep.to;
      rep.preset = t.preset || 'custom';
      renderReports();
    }
    function repTplDel() {
      var id = repTplSelId();
      if (!id) { App.toast('Select a template first.', 'err'); return; }
      DB.remove('report_templates', id);
      App.toast('Template deleted.');
      renderReports();
    }

    /* ---- multi-lab comparison (read-only: never calls DB.useLab()) ----
       Each lab's store is read straight from localStorage ('labpos_db_' + id)
       inside try/catch; missing/corrupt stores are skipped. */
    function labCsvEsc(v) {
      var s = (v === null || v === undefined) ? '' : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var labCmpRows = [], labCmpFrom = from, labCmpTo = to;
    var _curLabId = null;
    try { _curLabId = DB.currentLabId(); } catch (eLab1) { _curLabId = null; }
    var _labList = [];
    try { _labList = DB.labs() || []; } catch (eLab2) { _labList = []; }
    _labList.forEach(function (lab) {
      var store = null;
      try { store = JSON.parse(localStorage.getItem('labpos_db_' + lab.id)); }
      catch (eLab3) { store = null; }
      if (!store || typeof store !== 'object') return;
      var lInv = (store.invoices || []).filter(function (iv) { return inRange(toDay(iv.createdAt), from, to); });
      var lPay = (store.payments || []).filter(function (p) { return inRange(toDay(p.date || p.createdAt), from, to); });
      var lExp = (store.expenses || []).filter(function (e) { return inRange(toDay(e.date), from, to); });
      var lBilled = lInv.reduce(function (s, iv) { return s + (+iv.total || 0); }, 0);
      var lColl = lPay.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
      var lExpT = lExp.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
      labCmpRows.push({
        name: lab.name || lab.id,
        current: lab.id === _curLabId,
        bills: lInv.length,
        billed: lBilled,
        collected: lColl,
        expenses: lExpT,
        net: lColl - lExpT,
        tests: lInv.reduce(function (s, iv) { return s + ((iv.items || []).length); }, 0)
      });
    });
    var labCmpTableRows = labCmpRows.map(function (r) {
      return '<tr' + (r.current ? ' style="background:rgba(83,146,186,.12)"' : '') + '>'
        + '<td><strong>' + App.esc(r.name) + '</strong>' + (r.current ? ' <span class="muted" style="font-size:11px">(current)</span>' : '') + '</td>'
        + '<td style="text-align:right">' + r.bills + '</td>'
        + '<td style="text-align:right">' + App.esc(App.money(r.billed)) + '</td>'
        + '<td style="text-align:right">' + App.esc(App.money(r.collected)) + '</td>'
        + '<td style="text-align:right">' + App.esc(App.money(r.expenses)) + '</td>'
        + '<td style="text-align:right;font-weight:700;color:' + (r.net < 0 ? '#c0392b' : '#1e7e46') + '">' + App.esc(App.money(r.net)) + '</td>'
        + '<td style="text-align:right">' + r.tests + '</td></tr>';
    }).join('');
    var labCmpNote = labCmpRows.length === 1
      ? '<p class="muted" style="margin:12px 0 0;font-size:13px">Only one lab registered — add labs from the login screen to compare.</p>'
      : (labCmpRows.length === 0
        ? '<p class="muted" style="margin:12px 0 0;font-size:13px">No lab data found.</p>' : '');
    var labsCardHtml = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-h" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<h3 style="margin:0">Lab Comparison</h3>'
      + '<span class="muted" style="font-weight:500;font-size:13px">' + App.esc(App.d(from)) + ' – ' + App.esc(App.d(to)) + '</span>'
      + '<button class="btn btn-ghost btn-sm" id="labCmpCsv" style="margin-left:auto">Export CSV</button>'
      + '</div><div class="card-b">'
      + (labCmpTableRows
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Lab</th><th style="text-align:right">Bills</th><th style="text-align:right">Billed</th><th style="text-align:right">Collected</th><th style="text-align:right">Expenses</th><th style="text-align:right">Net</th><th style="text-align:right">Tests</th></tr></thead><tbody>'
          + labCmpTableRows + '</tbody></table></div>'
        : App.empty('No lab data available for this period.'))
      + labCmpNote
      + '</div></div>';
    function labCmpExportCsv() {
      var lines = ['Lab,Bills,Billed,Collected,Expenses,Net,Tests'];
      labCmpRows.forEach(function (r) {
        lines.push([r.name, r.bills, r.billed, r.collected, r.expenses, r.net, r.tests].map(labCsvEsc).join(','));
      });
      var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'lab-comparison-' + labCmpFrom + '-to-' + labCmpTo + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
    }

    /* ---- Scheduled email reports (worker 6) ----
       NOTE: true unattended sending needs a server-side cron on the VPS —
       this app is client-side (localStorage via db.js) and has no mail
       server. What IS fully functional here: the data model
       (report_schedules), this UI, and manual "Run now", which opens the
       user's email client with the report pre-composed via mailto:. */
    var SCHED_PRESETS = { today: 'Today', last7: 'Last 7 days', last30: 'Last 30 days', thisMonth: 'This Month', lastMonth: 'Last Month' };
    var SCHED_TYPES = { all: 'All Reports', tests: 'Test Reports', finance: 'Finance', dues: 'Dues', patients: 'Patient Reports' };
    var SCHED_FREQ = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
    var SCHED_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function schedList() { return DB.all('report_schedules'); }

    /* period math mirrors setPreset() so "Run now" covers the same range */
    function schedPeriod(preset) {
      var t = App.today(), f, to;
      if (preset === 'today') { f = t; to = t; }
      else if (preset === 'last7') { f = addDays(t, -6); to = t; }
      else if (preset === 'last30') { f = addDays(t, -29); to = t; }
      else if (preset === 'thisMonth') { f = t.slice(0, 8) + '01'; to = t; }
      else if (preset === 'lastMonth') {
        var pe = addDays(t.slice(0, 8) + '01', -1);
        f = pe.slice(0, 8) + '01'; to = pe;
      }
      else { f = t; to = t; }
      return { from: f, to: to };
    }

    function schedNextRun(s) {
      var t = App.today();
      if (s.frequency === 'daily') return addDays(t, 1);
      if (s.frequency === 'weekly') return addDays(t, 7);
      if (s.frequency === 'monthly') {
        var y = +t.slice(0, 4), m = +t.slice(5, 7);
        if (m === 12) { y += 1; m = 1; } else { m += 1; }
        return y + '-' + String(m).padStart(2, '0') + '-01';
      }
      return t;
    }

    /* finance aggregates for an arbitrary period (same math as renderReports) */
    function schedAggregate(from, to) {
      var inv = DB.all('invoices').filter(function (iv) { return inRange(toDay(iv.createdAt), from, to); });
      var pay = DB.all('payments').filter(function (p) { return inRange(toDay(p.date || p.createdAt), from, to); });
      var exp = DB.all('expenses').filter(function (e) { return inRange(toDay(e.date), from, to); });
      var billed = inv.reduce(function (s, iv) { return s + (+iv.total || 0); }, 0);
      var collected = pay.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
      var due = inv.reduce(function (s, iv) { return s + (+iv.due || 0); }, 0);
      var expTotal = exp.reduce(function (s, e) { return s + (+e.amount || 0); }, 0);
      return { invoices: inv.length, billed: billed, payments: pay.length, collected: collected, due: due, expenses: exp.length, expTotal: expTotal, net: collected - expTotal };
    }

    function runScheduleNow(id) {
      var s = DB.get('report_schedules', id);
      if (!s) return App.toast('Schedule not found.', 'err');
      var per = schedPeriod(s.preset);
      var a = schedAggregate(per.from, per.to);
      var lab = ((DB.get('settings', 'main') || {}).labName) || 'Lab';
      var lines = [
        lab + ' — ' + (SCHED_TYPES[s.type] || s.type) + ' Report',
        'Period: ' + per.from + ' to ' + per.to + ' (' + (SCHED_PRESETS[s.preset] || s.preset) + ')',
        '',
        'Invoices: ' + a.invoices + '  |  Billed: ' + App.money(a.billed),
        'Payments: ' + a.payments + '  |  Collected: ' + App.money(a.collected),
        'Outstanding due: ' + App.money(a.due),
        'Expenses: ' + a.expenses + '  |  Total: ' + App.money(a.expTotal),
        'Net collection: ' + App.money(a.net)
      ];
      var subject = lab + ' report — ' + (SCHED_TYPES[s.type] || s.type) + ' (' + per.from + ' to ' + per.to + ')';
      window.location.href = 'mailto:' + s.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
      App.toast('Opening email client…');
    }

    function schedOpts(map, sel) {
      return Object.keys(map).map(function (k) {
        return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + App.esc(map[k]) + '</option>';
      }).join('');
    }

    function schedModalBody() {
      var rows = schedList().map(function (s) {
        return '<tr>'
          + '<td><strong>' + App.esc(s.name) + '</strong><div class="muted" style="font-size:12px">'
          + App.esc(SCHED_PRESETS[s.preset] || s.preset) + ' · next run ' + App.d(schedNextRun(s)) + '</div></td>'
          + '<td>' + App.esc(SCHED_TYPES[s.type] || s.type) + '</td>'
          + '<td>' + App.esc(SCHED_FREQ[s.frequency] || s.frequency) + '</td>'
          + '<td>' + App.esc(s.email) + '</td>'
          + '<td style="text-align:center"><button class="btn btn-ghost btn-sm" data-sched-toggle="' + App.esc(s.id) + '">'
          + (s.active ? '🟢 On' : '⚪ Off') + '</button></td>'
          + '<td style="text-align:right;white-space:nowrap">'
          + '<button class="btn btn-ghost btn-sm" data-sched-run="' + App.esc(s.id) + '">▶ Run now</button> '
          + '<button class="btn btn-ghost btn-sm" data-sched-del="' + App.esc(s.id) + '" style="color:var(--red)">Delete</button>'
          + '</td></tr>';
      }).join('');
      return '<div class="tbl-wrap" style="margin-bottom:18px"><table class="table"><thead><tr>'
        + '<th>Name</th><th>Type</th><th>Frequency</th><th>Email</th><th style="text-align:center">Active</th><th style="text-align:right">Actions</th>'
        + '</tr></thead><tbody>'
        + (rows || '<tr><td colspan="6">No schedules yet — add one below.</td></tr>')
        + '</tbody></table></div>'
        + '<h4 style="margin:0 0 10px">Add schedule</h4>'
        + '<div class="form-grid">'
        + '<div><label class="label">Name *</label><input class="input" id="schedName" placeholder="e.g. Daily finance digest"></div>'
        + '<div><label class="label">Report type</label><select class="select" id="schedType">' + schedOpts(SCHED_TYPES) + '</select></div>'
        + '<div><label class="label">Period</label><select class="select" id="schedPreset">' + schedOpts(SCHED_PRESETS) + '</select></div>'
        + '<div><label class="label">Frequency</label><select class="select" id="schedFreq">' + schedOpts(SCHED_FREQ) + '</select></div>'
        + '<div style="grid-column:1/-1"><label class="label">Email *</label><input class="input" id="schedEmail" type="email" placeholder="you@example.com"></div>'
        + '</div>'
        + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'
        + '<button class="btn btn-ghost" id="schedCancel">Close</button>'
        + '<button class="btn btn-primary" id="schedAdd">Add Schedule</button></div>';
    }

    function schedBind(ov) {
      function refresh() {
        renderReports(); /* keep the "Scheduled Reports" card behind the modal in sync */
        ov.querySelector('.modal-b').innerHTML = schedModalBody();
        schedBind(ov);
      }
      document.getElementById('schedCancel').addEventListener('click', function () { ov.querySelector('.modal-x').click(); });
      document.getElementById('schedAdd').addEventListener('click', function () {
        var name = document.getElementById('schedName').value.trim();
        var email = document.getElementById('schedEmail').value.trim();
        if (!name) return App.toast('Name is required.', 'err');
        if (!SCHED_EMAIL_RE.test(email)) return App.toast('Enter a valid email address.', 'err');
        DB.insert('report_schedules', {
          name: name,
          type: document.getElementById('schedType').value,
          preset: document.getElementById('schedPreset').value,
          email: email,
          frequency: document.getElementById('schedFreq').value,
          active: true,
          createdAt: new Date().toISOString()
        });
        App.toast('Schedule added.');
        refresh();
      });
      Array.prototype.forEach.call(ov.querySelectorAll('[data-sched-toggle]'), function (b) {
        b.addEventListener('click', function () {
          var s = DB.get('report_schedules', b.getAttribute('data-sched-toggle'));
          if (s) { DB.update('report_schedules', s.id, { active: !s.active }); App.toast(s.active ? 'Schedule paused.' : 'Schedule activated.'); }
          refresh();
        });
      });
      Array.prototype.forEach.call(ov.querySelectorAll('[data-sched-run]'), function (b) {
        b.addEventListener('click', function () { runScheduleNow(b.getAttribute('data-sched-run')); });
      });
      Array.prototype.forEach.call(ov.querySelectorAll('[data-sched-del]'), function (b) {
        b.addEventListener('click', function () {
          DB.remove('report_schedules', b.getAttribute('data-sched-del'));
          App.toast('Schedule deleted.');
          refresh();
        });
      });
    }

    function openSchedModal() {
      App.modal('⏰ Scheduled Reports', schedModalBody(), {
        wide: true,
        onOpen: function (ov) { schedBind(ov); }
      });
    }

    function schedCardHTML() {
      var list = schedList();
      var act = list.filter(function (s) { return s.active; });
      var hint = act.length
        ? act.map(function (s) { return App.esc(s.name) + ' → next run ' + App.d(schedNextRun(s)); }).join('<br>')
        : 'No active schedules yet.';
      return '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3 style="margin:0">⏰ Scheduled Reports</h3>'
        + '<span class="muted" style="font-weight:500;font-size:13px">' + act.length + ' of ' + list.length + ' active</span></div>'
        + '<div class="card-b"><div style="margin-bottom:12px">' + hint + '</div>'
        + '<button class="btn btn-ghost" id="repSchedCardBtn">⏰ Manage Schedules</button>'
        + '<div class="muted" style="font-size:12px;margin-top:10px">Note: true unattended email sending needs a server-side cron on the VPS — this app is client-side, so schedules run manually via “Run now”, which opens your email client with the report pre-composed.</div>'
        + '</div></div>';
    }

    function statCard(label, val, ic, bg, fg) {
      return '<div class="stat"><div class="stat-ic" style="background:' + bg + ';color:' + fg + '">' + ic + '</div>'
        + '<div><div class="stat-num">' + val + '</div><div class="stat-lbl">' + label + '</div></div></div>';
    }

    function presetBtn(p, label) {
      return '<button class="btn ' + (rep.preset === p ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-preset="' + p + '" style="font-weight:600">'
        + label + '</button>';
    }
    var filterCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-b">'
      +   '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'
      +     '<div style="display:flex;gap:8px;align-items:center">'
      +       '<span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Dates:</span>'
      +       '<input class="input" type="date" id="repFrom" value="' + App.esc(from) + '" style="width:auto;padding:6px 10px;font-size:13px">'
      +       '<span style="color:var(--muted);font-weight:700">–</span>'
      +       '<input class="input" type="date" id="repTo" value="' + App.esc(to) + '" style="width:auto;padding:6px 10px;font-size:13px">'
      +     '</div>'
      +     '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      +       presetBtn('today', 'Today')
      +       presetBtn('yesterday', 'Yesterday')
      +       presetBtn('last7', 'Last 7 days')
      +       presetBtn('last30', 'Last 30 days')
      +       presetBtn('thisMonth', 'This Month')
      +       presetBtn('lastMonth', 'Last Month')
      +       (rep.preset === 'custom' ? '<span class="muted" style="font-size:12px;font-weight:600">Custom range</span>' : '')
      +     '</div>'
      +     '<div style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap;align-items:center">'
      +       '<button class="btn btn-ghost btn-sm" id="repCsv">' + DL_ICON + ' Export CSV</button>'
      +       '<button class="btn btn-ghost btn-sm" id="repBuilder">🛠 Builder</button>'
      +       '<button class="btn btn-ghost btn-sm" id="repSchedBtn">⏰ Schedules</button>'
      +       '<button class="btn btn-primary btn-sm" id="repPrint">' + PRINT_ICON + ' Print Report</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';

    /* ---- Finalized Patient Reports archive ----
       Every report finalized (status='ready') in Lab Results is saved here.
       Shown for 'all' and 'patients' types. */
    var finByInv = {};
    DB.all('results').filter(function (r) { return r.status === 'ready'; }).forEach(function (r) {
      (finByInv[r.invoiceId] = finByInv[r.invoiceId] || []).push(r);
    });
    var finList = Object.keys(finByInv).map(function (invId) {
      var inv = DB.get('invoices', invId);
      if (!inv) return null;
      var rs = finByInv[invId];
      var pat = DB.get('patients', inv.patientId);
      var maxRep = '';
      rs.forEach(function (r) { if (r.reportedAt && r.reportedAt > maxRep) maxRep = r.reportedAt; });
      var names = rs.map(function (r) {
        var t = r.testId ? DB.get('tests', r.testId) : null;
        return t ? (t.code || t.name) : 'Test';
      });
      var shown = names.slice(0, 3).join(', ');
      if (names.length > 3) shown += ' +' + (names.length - 3);
      return { inv: inv, patName: pat ? pat.name : 'Walk-in', tests: shown, n: rs.length, reported: maxRep };
    }).filter(Boolean).sort(function (a, b) { return (b.reported || '').localeCompare(a.reported || ''); });
    var finRows = finList.map(function (f) {
      return '<tr>' +
        '<td>' + App.esc(f.reported ? App.d(f.reported) : '—') + '</td>' +
        '<td><strong>' + App.esc(f.inv.no || f.inv.id) + '</strong></td>' +
        '<td>' + App.esc(f.patName) + '</td>' +
        '<td>' + App.esc(f.tests) + ' <span class="muted">(' + f.n + ')</span></td>' +
        '<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-finrep="' + App.esc(f.inv.id) + '">View</button></td>' +
      '</tr>';
    }).join('');
    var finCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3 style="margin:0">Finalized Patient Reports</h3>'
      + '<span class="muted" style="font-weight:500;font-size:13px">Finalized reports are saved here</span></div><div class="card-b">'
      + '<div style="margin-bottom:12px"><input class="input search" id="finSearch" placeholder="Search by patient name, invoice no, or test..." style="max-width:320px"></div>'
      + (finRows
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Reported</th><th>Invoice</th><th>Patient</th><th>Tests</th><th></th></tr></thead><tbody id="finTbody">' + finRows + '</tbody></table></div>'
        : App.empty('No finalized reports yet. Finalize a patient report from Lab Results and it will be saved here.'))
      + '</div></div>';

    /* ---- comparison badges: for expenses, down is good (invert) ---- */
    function cmpBadge(label, cur, prev, invert) {
      var c = pctChg(cur, prev);
      var good = invert ? (c.up === false) : (c.up === true);
      var col = c.up === null ? '#64748b' : (good ? '#15803d' : '#b91c1c');
      var bgc = c.up === null ? '#f1f5f9' : (good ? '#dcfce7' : '#fee2e2');
      var arrow = c.up === null ? '•' : (c.up ? '▲' : '▼');
      return '<span style="display:inline-flex;align-items:center;gap:6px;background:' + bgc
        + ';color:' + col + ';border:1px solid ' + col + ';border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700">'
        + label + ' <span>' + arrow + ' ' + c.txt + '</span></span>';
    }

    var cmpCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-b" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
      + '<span class="muted" style="font-size:13px;font-weight:600;white-space:nowrap">vs previous period (' + App.esc(pFrom) + ' – ' + App.esc(pTo) + ')</span>'
      + cmpBadge('Billed', billed, pBilled, false)
      + cmpBadge('Collected', collected, pCollected, false)
      + cmpBadge('Expenses', expTotal, pExpTotal, true)
      + cmpBadge('Net', net, pNet, false)
      + '</div></div>';

    /* ---- on-screen Finance Summary card (same rows as the print handler) ---- */
    var finSumCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3 style="margin:0">Finance Summary</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><tbody>'
      + '<tr><td>Total Billed (' + invoices.length + ' bills)</td><td style="text-align:right"><strong>' + App.money(billed) + '</strong></td></tr>'
      + '<tr><td>Discounts Given</td><td style="text-align:right">' + App.money(discounts) + '</td></tr>'
      + '<tr><td>Collected (Cash ' + App.money(methods.Cash) + ' / Bank ' + App.money(methods.Bank) + ' / Card ' + App.money(methods.Card) + ')</td><td style="text-align:right"><strong>' + App.money(collected) + '</strong></td></tr>'
      + '<tr><td>Outstanding Due</td><td style="text-align:right">' + App.money(due) + '</td></tr>'
      + '<tr><td>Expenses</td><td style="text-align:right">' + App.money(expTotal) + '</td></tr>'
      + '<tr><td><strong>Net Collection</strong></td><td style="text-align:right"><strong>' + App.money(net) + '</strong></td></tr>'
      + '</tbody></table></div></div></div>';

    /* ---- Dues section: aging buckets (by invoice createdAt) + unpaid invoices ---- */
    var duesUnpaid = DB.all('invoices').filter(function (iv) { return (+iv.due || 0) > 0; });
    var buckets = [
      { label: 'Current 0–30d', min: 0, max: 30, total: 0, count: 0 },
      { label: '31–60 days', min: 31, max: 60, total: 0, count: 0 },
      { label: '61–90 days', min: 61, max: 90, total: 0, count: 0 },
      { label: '90+ days', min: 91, max: 1e9, total: 0, count: 0 }
    ];
    var todayMs = new Date(App.today()).getTime();
    duesUnpaid.forEach(function (iv) {
      var age = Math.max(0, Math.round((todayMs - new Date(toDay(iv.createdAt)).getTime()) / 86400000));
      for (var bi = 0; bi < buckets.length; bi++) {
        if (age >= buckets[bi].min && age <= buckets[bi].max) { buckets[bi].total += (+iv.due || 0); buckets[bi].count++; break; }
      }
    });
    var duesRowsHtml = !duesUnpaid.length
      ? '<tr><td colspan="6">' + App.empty('No outstanding dues.') + '</td></tr>'
      : duesUnpaid.slice().sort(function (a, b) { return (+b.due || 0) - (+a.due || 0); }).map(function (iv) {
          var pat = DB.get('patients', iv.patientId);
          var paid = (+iv.total || 0) - (+iv.due || 0);
          return '<tr>'
            + '<td><strong>' + App.esc(iv.no || iv.id) + '</strong></td>'
            + '<td>' + App.esc(pat ? pat.name : 'Walk-in') + '</td>'
            + '<td>' + App.esc(App.d(iv.createdAt)) + '</td>'
            + '<td style="text-align:right">' + App.money(+iv.total || 0) + '</td>'
            + '<td style="text-align:right">' + App.money(paid) + '</td>'
            + '<td style="text-align:right;font-weight:700">' + App.money(+iv.due || 0) + '</td>'
            + '</tr>';
        }).join('');
    var duesCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3 style="margin:0">Dues Aging</h3>'
      + '<span class="muted" style="font-weight:500;font-size:13px">by invoice age</span></div><div class="card-b">'
      + '<div class="kpi-grid" style="margin-bottom:16px">'
      + kpi('t-navy', CLOCK, buckets[0].label, App.money(buckets[0].total), buckets[0].count + ' bill(s)')
      + kpi('t-amber', ALERT, buckets[1].label, App.money(buckets[1].total), buckets[1].count + ' bill(s)')
      + kpi('t-purple', ALERT, buckets[2].label, App.money(buckets[2].total), buckets[2].count + ' bill(s)')
      + kpi('t-red', X_ICON, buckets[3].label, App.money(buckets[3].total), buckets[3].count + ' bill(s)')
      + '</div>'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Patient</th><th>Date</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Due</th></tr></thead><tbody>'
      + duesRowsHtml + '</tbody></table></div>'
      + '</div></div>';

    /* ---- Patient section: stats + new-vs-returning in the selected period ---- */
    var allPatients = DB.all('patients');
    var mNewCount = allPatients.filter(function (p) {
      var d = p.createdAt ? toDay(p.createdAt) : null;
      return d && inRange(d, mFrom, mTo);
    }).length;
    var invByPat = {};
    DB.all('invoices').forEach(function (iv) {
      if (!iv.patientId) return;
      var d = toDay(iv.createdAt);
      if (!invByPat[iv.patientId] || d < invByPat[iv.patientId]) invByPat[iv.patientId] = d;
    });
    var periodNew = 0, periodReturning = 0;
    allPatients.forEach(function (p) {
      var newDay = p.createdAt ? toDay(p.createdAt) : invByPat[p.id];
      if (!newDay) return;
      if (inRange(newDay, from, to)) periodNew++; else periodReturning++;
    });
    var patCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3 style="margin:0">Patient Overview</h3></div><div class="card-b">'
      + '<div class="kpi-grid" style="margin-bottom:16px">'
      + kpi('t-navy', USERS, 'Total Patients', allPatients.length, 'all registered')
      + kpi('t-green', USERS, 'New This Month', mNewCount, 'registered this month')
      + kpi('t-amber', USERS, 'New in Period', periodNew, 'first visit in period')
      + kpi('t-purple', USERS, 'Returning in Period', periodReturning, 'repeat visits in period')
      + '</div>'
      + '<p class="muted" style="margin:12px 0 0">New = first visit within ' + App.esc(App.d(from)) + ' – ' + App.esc(App.d(to)) + '.</p>'
      + '</div></div>';

    /* ---- pre-built row HTML for the test/doctor/category tables ---- */
    var twRowsHtml = !twRows.length
      ? '<tr><td colspan="3">' + App.empty('No tests billed in this period.') + '</td></tr>'
      : twRows.map(function (r) {
          return '<tr><td><strong>' + App.esc(r.code) + '</strong> <span class="muted">' + App.esc(r.name) + '</span></td>'
            + '<td style="text-align:right">' + r.count + '</td>'
            + '<td style="text-align:right;font-weight:700">' + App.money(r.revenue) + '</td></tr>';
        }).join('');
    var dwRowsHtml = !dwRows.length
      ? '<tr><td colspan="4">' + App.empty('No doctor referrals in this period.') + '</td></tr>'
      : dwRows.map(function (r) {
          var comm = Math.round(r.comm || 0);
          return '<tr><td><strong>' + App.esc(r.name) + '</strong> <span class="muted">(' + r.pct + '%)</span></td>'
            + '<td style="text-align:right">' + r.referrals + '</td>'
            + '<td style="text-align:right">' + App.money(r.billed) + '</td>'
            + '<td style="text-align:right;font-weight:700;color:var(--amber)">' + App.money(comm) + '</td></tr>';
        }).join('');
    var catRowsHtml = !catRows.length
      ? '<tr><td colspan="2">' + App.empty('No category revenue in this period.') + '</td></tr>'
      : catRows.map(function (c) {
          return '<tr><td><strong>' + App.esc(c.cat) + '</strong></td>'
            + '<td style="text-align:right;font-weight:700">' + App.money(c.revenue) + '</td></tr>';
        }).join('');
    var top5Html = !top5.length
      ? '<tr><td colspan="3">' + App.empty('No tests billed in this period.') + '</td></tr>'
      : top5.map(function (r) {
          return '<tr><td><strong>' + App.esc(r.code) + '</strong> <span class="muted">' + App.esc(r.name) + '</span></td>'
            + '<td style="text-align:right">' + r.count + '</td>'
            + '<td style="text-align:right;font-weight:700">' + App.money(r.revenue) + '</td></tr>';
        }).join('');

    /* ---- feature extension slots (workers 5-9 assign their cards here) ---- */
    var repSlotSchedules = '';
    var repSlotBuilder = '';
    var repSlotTemplates = (function () {
      var tpls = repTplList();
      var opts = '<option value="">-- select template --</option>' + tpls.map(function (t) {
        return '<option value="' + App.esc(String(t.id)) + '">' + App.esc(t.name) + ' — ' + App.esc(repTplDesc(t)) + '</option>';
      }).join('');
      return '<div class="card" style="margin-bottom:16px"><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
        + '<span style="font-weight:700;margin-right:8px">Report Templates:</span>'
        + '<select class="input" id="repTplSel" style="max-width:320px">' + opts + '</select>'
        + '<button type="button" class="btn btn-sm btn-primary" id="tplApply">Apply</button>'
        + '<button type="button" class="btn btn-sm btn-ghost" id="tplDel">Delete</button>'
        + '<input class="input" id="repTplName" placeholder="Template name…" style="max-width:220px">'
        + '<button type="button" class="btn btn-sm btn-ghost" id="tplSave">💾 Save current</button>'
        + '</div></div>';
    })();
    var repSlotLabs = (rep.type === 'labs') ? labsCardHtml : '';

    /* ---- contextual KPI cards (4 unified cards for the selected report type) ---- */
    var testsCount = invoices.reduce(function (s, iv) { return s + ((iv.items || []).length); }, 0);
    var repKpis = '';
    if (rep.type === 'dues') {
      repKpis = '<div class="kpi-grid" style="margin-bottom:18px">'
        + kpi('t-red', ALERT, 'Total Due', App.money(due), duesUnpaid.length + ' unpaid bills')
        + kpi('t-navy', CLOCK, 'Current (0–30d)', App.money(buckets[0].total), buckets[0].count + ' bills')
        + kpi('t-amber', ALERT, 'Overdue (31–60d)', App.money(buckets[1].total), buckets[1].count + ' bills')
        + kpi('t-purple', X_ICON, 'Old Dues (60d+)', App.money(buckets[2].total + buckets[3].total), (buckets[2].count + buckets[3].count) + ' bills')
        + '</div>';
    } else if (rep.type === 'patients') {
      repKpis = '<div class="kpi-grid" style="margin-bottom:18px">'
        + kpi('t-navy', USERS, 'Total Patients', allPatients.length, 'all registered')
        + kpi('t-green', USERS, 'Visited in Period', repPatientCount, 'patients with bills')
        + kpi('t-amber', USERS, 'New Patients', periodNew, 'first visit in period')
        + kpi('t-purple', USERS, 'Returning', periodReturning, 'repeat visits in period')
        + '</div>';
    } else if (rep.type === 'tests') {
      var topTest = top5[0] || { name: '—', count: 0 };
      repKpis = '<div class="kpi-grid" style="margin-bottom:18px">'
        + kpi('t-blue', FLASK, 'Tests Billed', testsCount, invoices.length + ' invoices')
        + kpi('t-navy', RECEIPT, 'Test Revenue', App.money(billed), 'gross billed')
        + kpi('t-green', TREND, 'Top Conducted', App.esc(topTest.name || topTest.code), topTest.count + ' tests')
        + kpi('t-amber', USERS, 'Doctor Referrals', dwRows.length, 'referring doctors')
        + '</div>';
    } else {
      /* all or finance or labs */
      repKpis = '<div class="kpi-grid" style="margin-bottom:18px">'
        + kpi('t-navy', RECEIPT, 'Total Billed', App.money(billed), invoices.length + ' bills · ' + testsCount + ' tests')
        + kpi('t-green', CASH, 'Collected', App.money(collected), payments.length + ' payments received')
        + kpi('t-red', ALERT, 'Total Expenses', App.money(expTotal), expenses.length + ' expense entries')
        + kpi(net >= 0 ? 't-blue' : 't-amber', TREND, 'Net Collection', App.money(net), net >= 0 ? 'net surplus' : 'net deficit')
        + '</div>';
    }

    /* report type selector: always visible at the top of the page */
    var typeCardHtml = ''
      + '<div class="card" style="margin-bottom:16px"><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<span style="font-weight:700;margin-right:8px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Report Type:</span>'
      + ['all', 'tests', 'finance', 'dues', 'patients', 'labs'].map(function (t) {
          var lbl = { all: 'All Reports', tests: 'Test Reports', finance: 'Finance', dues: 'Dues', patients: 'Patient Reports', labs: 'Lab Comparison' }[t];
          var active = rep.type === t;
          return '<button type="button" class="btn ' + (active ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-reptype="' + t + '" style="font-weight:600">' + lbl + '</button>';
        }).join('')
      + '<a class="btn btn-sm btn-ghost" id="repFinance" href="#/finance/profit" style="margin-left:auto;color:var(--brand-d);font-weight:600">Profit &amp; Loss / Cash Closing &rarr;</a>'
      + '</div></div>';

    var repChosen = true;
    var html = ''
      + '<style>' + ADM_STAT_CSS + '</style>'
      + typeCardHtml
      + repKpis
      + filterCard
      + cmpCard
      + repSlotSchedules + repSlotBuilder + repSlotTemplates + repSlotLabs
      + (showPatients ? finCard : '')
      + (showFinance ? finSumCard : '')
      + (showDues ? duesCard : '')
      + (showPatients ? patCard : '')
      + (showTests ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px" class="rep-cols">'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Test-wise Performance</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>'
      + twRowsHtml
      + '</tbody></table></div></div></div>'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Doctor-wise Referrals</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Doctor</th><th style="text-align:right">Referrals</th><th style="text-align:right">Billed</th><th style="text-align:right">Commission</th></tr></thead><tbody>'
      + dwRowsHtml
      + '</tbody></table></div></div></div></div>' : '')
      + (showTests ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px" class="rep-cols">'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Revenue by Test Category</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Category</th><th style="text-align:right">Revenue</th></tr></thead><tbody>'
      + catRowsHtml
      + '</tbody></table></div></div></div>'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Top 5 Tests by Count</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>'
      + top5Html
      + '</tbody></table></div></div></div></div>' : '');

    document.getElementById('view').innerHTML = html;
    admCountUp();

    /* report type selector: rendered in both the empty and chosen states */
    document.querySelectorAll('[data-reptype]').forEach(function (b) {
      b.addEventListener('click', function () { rep.type = b.getAttribute('data-reptype'); renderReports(); });
    });

    /* multi-lab comparison: own CSV export button inside the labs card */
    var labCmpBtn = document.getElementById('labCmpCsv');
    if (labCmpBtn) labCmpBtn.addEventListener('click', labCmpExportCsv);

    /* finalized reports archive: open the full report view (loads the results module on demand) */
    document.querySelectorAll('[data-finrep]').forEach(function (b) {
      b.addEventListener('click', function () {
        var invId = b.getAttribute('data-finrep');
        function go() {
          if (App.viewLabReport) App.viewLabReport(invId);
          else App.toast('Report viewer failed to load', 'err');
        }
        if (App.viewLabReport) go();
        else App.loadScript('assets/js/mod-results.js').then(go, function () { App.toast('Could not load report viewer', 'err'); });
      });
    });
    /* search filter for finalized reports */
    var finSearch = document.getElementById('finSearch');
    if (finSearch) finSearch.addEventListener('input', function () {
      var q = finSearch.value.trim().toLowerCase();
      var tb = document.getElementById('finTbody');
      if (!tb) return;
      Array.prototype.forEach.call(tb.rows, function (tr) {
        var txt = tr.textContent.toLowerCase();
        tr.style.display = !q || txt.indexOf(q) > -1 ? '' : 'none';
      });
    });

    /* the controls below only exist after a report type is explicitly chosen */
    if (repChosen) {
    document.getElementById('repFrom').addEventListener('change', function (e) { rep.from = e.target.value; rep.preset = 'custom'; renderReports(); });
    document.getElementById('repTo').addEventListener('change', function (e) { rep.to = e.target.value; rep.preset = 'custom'; renderReports(); });
    /* report templates (worker 8) */
    document.getElementById('tplApply').addEventListener('click', repTplApply);
    document.getElementById('tplDel').addEventListener('click', repTplDel);
    document.getElementById('tplSave').addEventListener('click', repTplSave);
    document.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () { setPreset(b.getAttribute('data-preset')); });
    });
    document.getElementById('repBuilder').addEventListener('click', function () { openBuilder(); });
    document.getElementById('repCsv').addEventListener('click', function () {
      try {
        var L = [];
        function sec(t) { L.push(t); }
        function row(a) { L.push(a.map(csvEsc).join(',')); }
        sec('Optix Medical Sync');
        row(['Report Type', repTypeLbl]);
        row(['Period', App.d(from) + ' to ' + App.d(to)]);
        L.push('');
        if (repSecs.finance) {
          sec('Finance Summary');
          row(['Metric', 'Amount']);
          row(['Total Billed (' + invoices.length + ' bills)', billed]);
          row(['Discounts Given', discounts]);
          row(['Collected', collected]);
          row(['Outstanding Due', due]);
          row(['Expenses', expTotal]);
          row(['Net Collection', net]);
          L.push('');
        }
        if (repSecs.tests) {
          sec('Test-wise Performance');
          row(['Test', 'Count', 'Revenue']);
          twRows.forEach(function (r) { row([r.code + ' ' + r.name, r.count, r.revenue]); });
          L.push('');
        }
        if (repSecs.doctors) {
          sec('Doctor-wise Referrals');
          row(['Doctor', 'Referrals', 'Billed', 'Commission']);
          dwRows.forEach(function (r) { row([r.name, r.referrals, r.billed, Math.round(r.comm || 0)]); });
          L.push('');
        }
        if (repSecs.dues) {
          sec('Unpaid Invoices');
          row(['Invoice', 'Patient', 'Date', 'Due']);
          repUnpaid.forEach(function (iv) {
            var pat = iv.patientId ? DB.get('patients', iv.patientId) : null;
            row([iv.no || iv.id, pat ? pat.name : 'Walk-in', App.d(iv.createdAt), (+iv.due || 0)]);
          });
          L.push('');
        }
        if (repSecs.patients) {
          sec('Patient Summary');
          row(['Metric', 'Count']);
          row(['Patients Billed', repPatientCount]);
          row(['Invoices', invoices.length]);
          row(['Finalized Reports', finList.length]);
          L.push('');
        }
        var csv = L.join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'report-' + rep.type + '-' + from + '-to-' + to + '.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        App.toast('Report exported.');
      } catch (e) { App.toast('Export failed: ' + e.message, 'err'); }
    });
    ['repSchedBtn', 'repSchedCardBtn'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener('click', openSchedModal);
    });
    document.getElementById('repPrint').addEventListener('click', function () {
      var ph = '<p><strong>Type:</strong> ' + App.esc(repTypeLbl) + '<br><strong>Period:</strong> ' + App.esc(App.d(from)) + ' – ' + App.esc(App.d(to)) + '</p>';
      if (repSecs.finance) {
        ph += '<h3>Finance Summary</h3><table class="table"><tbody>'
        + '<tr><td>Total Billed (' + invoices.length + ' bills)</td><td style="text-align:right"><strong>' + App.money(billed) + '</strong></td></tr>'
        + '<tr><td>Discounts Given</td><td style="text-align:right">' + App.money(discounts) + '</td></tr>'
        + '<tr><td>Collected (Cash ' + App.money(methods.Cash) + ' / Bank ' + App.money(methods.Bank) + ' / Card ' + App.money(methods.Card) + ')</td><td style="text-align:right"><strong>' + App.money(collected) + '</strong></td></tr>'
        + '<tr><td>Outstanding Due</td><td style="text-align:right">' + App.money(due) + '</td></tr>'
        + '<tr><td>Expenses</td><td style="text-align:right">' + App.money(expTotal) + '</td></tr>'
        + '<tr><td><strong>Net Collection</strong></td><td style="text-align:right"><strong>' + App.money(net) + '</strong></td></tr>'
        + '</tbody></table>';
      }
      if (repSecs.tests) {
        ph += '<h3>Test-wise</h3><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>'
        + twRows.map(function (r) { return '<tr><td>' + App.esc(r.code + ' ' + r.name) + '</td><td style="text-align:right">' + r.count + '</td><td style="text-align:right">' + App.money(r.revenue) + '</td></tr>'; }).join('')
        + '</tbody></table>';
      }
      if (repSecs.doctors) {
        ph += '<h3>Doctor-wise</h3><table class="table"><thead><tr><th>Doctor</th><th style="text-align:right">Referrals</th><th style="text-align:right">Billed</th><th style="text-align:right">Commission</th></tr></thead><tbody>'
        + dwRows.map(function (r) { return '<tr><td>' + App.esc(r.name) + '</td><td style="text-align:right">' + r.referrals + '</td><td style="text-align:right">' + App.money(r.billed) + '</td><td style="text-align:right">' + App.money(Math.round(r.comm || 0)) + '</td></tr>'; }).join('')
        + '</tbody></table>';
      }
      if (repSecs.dues) {
        ph += '<h3>Unpaid Invoices</h3><table class="table"><thead><tr><th>Invoice</th><th>Patient</th><th>Date</th><th style="text-align:right">Due</th></tr></thead><tbody>'
        + (repUnpaid.length ? repUnpaid.map(function (iv) {
            var pat = iv.patientId ? DB.get('patients', iv.patientId) : null;
            return '<tr><td>' + App.esc(iv.no || iv.id) + '</td><td>' + App.esc(pat ? pat.name : 'Walk-in') + '</td><td>' + App.esc(App.d(iv.createdAt)) + '</td><td style="text-align:right">' + App.money(+iv.due || 0) + '</td></tr>';
          }).join('') : '<tr><td colspan="4">No unpaid invoices in this period.</td></tr>')
        + '</tbody></table>';
      }
      if (repSecs.patients) {
        ph += '<h3>Patient Summary</h3><table class="table"><tbody>'
        + '<tr><td>Patients Billed</td><td style="text-align:right"><strong>' + repPatientCount + '</strong></td></tr>'
        + '<tr><td>Invoices</td><td style="text-align:right">' + invoices.length + '</td></tr>'
        + '<tr><td>Finalized Reports</td><td style="text-align:right">' + finList.length + '</td></tr>'
        + '</tbody></table>';
      }
      App.print('Collection Report — ' + repTypeLbl + ' (' + App.d(from) + ' – ' + App.d(to) + ')', ph);
    });
    } /* end if (repChosen) */
  }

  App.route('#/reports', renderReports);

  /* ============================================================
     SETTINGS  (#/settings) — admin only
     Tabs: Lab Profile | My Account | Users | Backup | Danger Zone
     ============================================================ */
  var settingsTab = 'profile';

  function renderSettings() {
    if (role() !== 'admin') return denied();
    var tabs = [
      { id: 'profile', label: 'Edit Report Form' },
      { id: 'account', label: 'My Account' },
      { id: 'templates', label: 'Report Templates' },
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'sharing', label: 'Email & Slack' },
      { id: 'portal', label: 'Patient portal' },
      { id: 'users', label: 'Users & Roles' },
      { id: 'backup', label: 'Backup' },
      { id: 'danger', label: 'Danger Zone' }
    ];
    /* the sections are sidebar sub-menu items now (#/settings, #/settings/account, …); the card only labels the open one */
    var cur = tabs.filter(function (t) { return t.id === settingsTab; })[0] || tabs[0];
    var html = ''
      + '<div class="card"><div class="card-b">'
      + '<div style="margin-bottom:18px;border-bottom:1px solid var(--line);padding-bottom:12px"><b style="font-size:17px;color:' + (cur.id === 'danger' ? 'var(--red)' : 'var(--brand)') + '">' + cur.label + '</b></div>'
      + '<div id="setBody"></div>'
      + '</div></div>';
    document.getElementById('view').innerHTML = html;
    if (settingsTab === 'profile') renderSetProfile();
    else if (settingsTab === 'account') renderSetAccount();
    else if (settingsTab === 'templates') renderSetTemplates();
    else if (settingsTab === 'whatsapp') renderSetWhatsapp();
    else if (settingsTab === 'sharing') renderSetSharing();
    else if (settingsTab === 'portal') renderSetPortal();
    else if (settingsTab === 'users') renderSetUsers();
    else if (settingsTab === 'backup') renderSetBackup();
    else renderSetDanger();
  }

  /* deep-link into the WhatsApp settings tab (used by report-view send buttons
     when the WhatsApp API is not configured yet) */
  App.openWaSettingsTab = function () { App.nav('#/settings/whatsapp'); };

  /* ---- Lab Profile ---- */
  function renderSetProfile() {
    var s = DB.get('settings', 'main') || {};
    /* Sample custom header/footer HTML: realistic dummy content (passes mod-results.js hasRealHtml()).
       Used to pre-fill the textareas when nothing is saved, and by the Load Sample buttons. */
    var HEADER_SAMPLE =
      '<div style="text-align:center;border-bottom:2px solid #131845;padding-bottom:10px;margin-bottom:10px">\n' +
      '  <div style="font-size:24px;font-weight:800;color:#131845;letter-spacing:.5px">Optxic LAB</div>\n' +
      '  <div style="color:#5392ba;font-size:13px;font-weight:600;margin-top:2px">Diagnostics &amp; Clinical Research</div>\n' +
      '  <div style="color:#666;font-size:12px;margin-top:6px">154-A-HBFC, Opposite Jinnah Hospital, Lahore &nbsp;&bull;&nbsp; Ph: 0322-8441899 &nbsp;&bull;&nbsp; Call Center: 0311-1141899</div>\n' +
      '</div>';
    var FOOTER_SAMPLE =
      '<div style="text-align:center;margin-top:18px">\n' +
      '  <div style="font-weight:700;font-size:13px">Electronically verified report. No signatures necessary.</div>\n' +
      '  <div style="font-size:12px;margin-top:4px">Lab reports should be interpreted by a physician in correlation with clinical and radiologic findings.</div>\n' +
      '  <hr style="border:none;border-top:1px solid #131845;margin:10px 0">\n' +
      '  <div style="display:flex;justify-content:space-around;font-size:12px">\n' +
      '    <div><b>Dr. Ayesha Khan</b><br>MBBS, M.Phil<br>Consultant Pathologist</div>\n' +
      '    <div><b>Dr. Bilal Ahmed</b><br>MBBS, FCPS<br>Consultant Microbiologist</div>\n' +
      '  </div>\n' +
      '  <div style="font-size:12px;margin-top:8px"><b>Head Office:</b> DHA Phase-1 F22 Commercial Lahore. <b>Call Center:</b> 0311-1141899<br><b>Main Lab:</b> 154-A-HBFC Opposite Jinnah Hospital, Lahore. <b>Ph:</b> 0322-8441899</div>\n' +
      '</div>';
    var html =
      '<style>' +
      '.sp-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}' +
      '.sp-preview{position:sticky;top:16px}' +
      '.sp-preview-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}' +
      '.sp-preview-head h3{margin:0;font-size:15px}' +
      '.sp-preview-doc{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px;box-shadow:0 2px 14px rgba(15,30,60,.07);font-size:12px;max-height:calc(100vh - 140px);overflow:auto}' +
      '@media(max-width:1100px){.sp-layout{grid-template-columns:1fr}.sp-preview{position:static}}' +
      '</style>' +
      '<div class="sp-layout">' +
      '<div class="sp-form"><div class="form-grid">'
      + '<div><label class="label">Lab Name *</label><input class="input" id="spName" value="' + App.esc(s.labName || '') + '"></div>'
      + '<div><label class="label">Tagline</label><input class="input" id="spTag" value="' + App.esc(s.tagline || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Address</label><input class="input" id="spAddr" value="' + App.esc(s.address || '') + '"></div>'
      + '<div><label class="label">Phone</label><input class="input" id="spPhone" value="' + App.esc(s.phone || '') + '"></div>'
      + '<div><label class="label">Email</label><input class="input" id="spEmail" value="' + App.esc(s.email || '') + '"></div>'
      + '<div><label class="label">Invoice Prefix *</label><input class="input" id="spPref" value="' + App.esc(s.invoicePrefix || 'INV') + '" style="max-width:140px"></div>'
      + '<div><label class="label">Font</label><select class="select" id="spFont">'
      + '<option value="inter"' + ((!s.font || s.font === 'inter') ? ' selected' : '') + '>Inter (Default)</option>'
      + '<option value="jakarta"' + (s.font === 'jakarta' ? ' selected' : '') + '>Plus Jakarta Sans</option>'
      + '<option value="roboto"' + (s.font === 'roboto' ? ' selected' : '') + '>Roboto</option>'
      + '<option value="poppins"' + (s.font === 'poppins' ? ' selected' : '') + '>Poppins</option>'
      + '<option value="opensans"' + (s.font === 'opensans' ? ' selected' : '') + '>Open Sans</option>'
      + '<option value="lato"' + (s.font === 'lato' ? ' selected' : '') + '>Lato</option>'
      + '<option value="montserrat"' + (s.font === 'montserrat' ? ' selected' : '') + '>Montserrat</option>'
      + '</select></div>'
      + '<div style="grid-column:1/-1;margin-top:4px"><div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:8px">Sample Tracking</div></div>'
      + '<div style="grid-column:1/-1"><label class="check" for="spReqSmp" style="align-items:flex-start"><input type="checkbox" id="spReqSmp"' + (s.requireSampleCollected ? ' checked' : '') + ' style="margin-top:2px">'
      + '<span>Require sample to be collected before result entry<span class="muted" style="display:block;font-weight:500;font-size:12px;margin-top:2px">When ON, results cannot be entered for a test whose sample tube is still &ldquo;To collect&rdquo; or was rejected (Samples page). Default OFF &mdash; the Lab Results page only shows a warning.</span></span></label></div>'
      + '<div style="grid-column:1/-1;margin-top:4px"><div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:8px">Report Appearance</div></div>'
      + '<div><label class="label">Report Title</label><input class="input" id="spReportTitle" placeholder="e.g. LABORATORY REPORT" value="' + App.esc(s.reportTitle || '') + '"></div>'
      + '<div><label class="label">Accent Color</label><input type="color" id="spAccent" value="' + App.esc(s.accent || '#1b1b6e') + '" style="width:56px;height:36px;padding:3px;border:1px solid #dfe6f2;border-radius:8px;background:#fff;cursor:pointer"></div>'
      + '<div><label class="label">Lab Name Color</label><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<input type="color" id="spNameColor" value="' + App.esc(s.labNameColor || '#000000') + '" data-touched="' + (s.labNameColor ? '1' : '') + '" style="width:56px;height:36px;padding:3px;border:1px solid #dfe6f2;border-radius:8px;background:#fff;cursor:pointer">'
      + ['#000000', '#131845', '#1d4ed8', '#047857', '#9f1239', '#b45309'].map(function (c) { return '<button type="button" class="spNameSw" data-c="' + c + '" title="' + c + '" style="width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;background:' + c + ';cursor:pointer;padding:0"></button>'; }).join('')
      + '<button type="button" class="btn btn-ghost btn-sm" id="spNameReset">Reset</button></div>'
      + '<div class="muted" style="font-size:12px;margin-top:4px">Colour of the lab name at the top of reports and receipts. Default: black.</div></div>'
      + '<div><label class="label">Report Font Size</label><select class="select" id="spFontSize">'
      + '<option value="small"' + (s.reportFontSize === 'small' ? ' selected' : '') + '>Small</option>'
      + '<option value="medium"' + ((!s.reportFontSize || s.reportFontSize === 'medium') ? ' selected' : '') + '>Medium</option>'
      + '<option value="large"' + (s.reportFontSize === 'large' ? ' selected' : '') + '>Large</option>'
      + '</select></div>'
      + '<div><label class="label" for="spShowQr">Show QR Code</label><input type="checkbox" id="spShowQr"' + (s.showQr === false ? '' : ' checked') + ' style="width:20px;height:20px;accent-color:var(--brand)"></div>'
      + '<div><label class="label" for="spShowTagline">Show Tagline</label><input type="checkbox" id="spShowTagline"' + (s.showTagline === false ? '' : ' checked') + ' style="width:20px;height:20px;accent-color:var(--brand)"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Report / Receipt Footer Note</label><input class="input" id="spFoot" value="' + App.esc(s.footerNote || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Lab Logo</label>'
      + '<div style="display:flex;align-items:center;gap:14px">'
      + '<img id="spLogoPrev" src="' + App.esc(s.logo || '') + '" alt="Lab logo" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:1px solid #e3ecf7;background:#f4f7fc;flex:none"' + (s.logo ? '' : ' hidden') + '>'
      + '<div><input type="file" id="spLogo" accept="image/*">'
      + '<div class="muted" style="font-size:12px;margin-top:6px">Shown on the login page, sidebar and print headers.</div></div>'
      + '<button class="btn btn-ghost" type="button" id="spLogoRm"' + (s.logo ? '' : ' hidden') + '>Remove</button>'
      + '</div></div>'
      + '<div><label class="label">Website</label><input class="input" id="spWeb" placeholder="www.example.com" value="' + App.esc(s.website || '') + '"></div>'
      + '<div><label class="label">Call Center Phone</label><input class="input" id="spCall" value="' + App.esc(s.callCenter || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Head Office</label><input class="input" id="spHead" placeholder="Head Office address" value="' + App.esc(s.headOffice || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Main Lab</label><input class="input" id="spMainLab" placeholder="Main Lab address" value="' + App.esc(s.mainLab || '') + '"></div>'
      + '<div><label class="label">Main Lab Phone</label><input class="input" id="spMainPhone" value="' + App.esc(s.mainLabPhone || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Verification Note</label><textarea class="input" id="spVerNote" rows="2" maxlength="500">' + App.esc(s.verNote || 'Electronically verified report. No signatures necessary.') + '</textarea></div>'
      + '<div style="grid-column:1/-1"><label class="label">Signatory Doctors <span class="muted" style="font-weight:400">(shown on lab reports)</span></label>'
      + '<div id="spSigList"></div>'
      + '<button class="btn btn-ghost" type="button" id="spSigAdd" style="margin-top:8px">+ Add Signatory</button></div>'
      + '<div style="grid-column:1/-1"><label class="label">Header text <span class="muted" style="font-weight:400">(shown under the lab name on every report — type anything, e.g. address, phone, timings)</span></label>'
      + '<textarea class="input" id="spHeadText" rows="3" maxlength="600" placeholder="Type the text you want in the report header">' + App.esc(s.headerText || '') + '</textarea></div>'
      + '<div style="grid-column:1/-1"><label class="label">Footer text <span class="muted" style="font-weight:400">(shown at the bottom of every report — e.g. thanks note, branch address, complaint number)</span></label>'
      + '<textarea class="input" id="spFootText" rows="3" maxlength="600" placeholder="Type the text you want in the report footer">' + App.esc(s.footerText || '') + '</textarea></div>'
      + '<details style="grid-column:1/-1"><summary style="cursor:pointer;font-weight:700;color:var(--muted)">Advanced: edit the full header / footer as HTML (most labs do not need this)</summary><div class="form-grid" style="margin-top:10px">'
      + '<div style="grid-column:1/-1"><label class="label">Custom Report Header <span class="muted" style="font-weight:400">(this is your current header — edit anything you want; <code>{{logo}}</code> <code>{{qr}}</code> <code>{{lab_barcode}}</code> <code>{{lab_no}}</code> (INV #) <code>{{case_number_barcode}}</code> <code>{{case_number}}</code> (P #) are filled in for every report)</span></label>'
      + '<div style="display:flex;gap:8px;margin-bottom:6px"><button type="button" class="btn btn-ghost btn-sm" id="spHeadSample">Load Sample</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" id="spHeadClear">Reset to automatic</button></div>'
      + '<textarea class="input" id="spHeadHtml" rows="9" spellcheck="false" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px" placeholder="Leave empty for automatic header">' + App.esc(s.headerHtml || '') + '</textarea></div>'
      + '<div style="grid-column:1/-1"><label class="label">Custom Report Footer <span class="muted" style="font-weight:400">(this is your current footer — edit anything you want)</span></label>'
      + '<div style="display:flex;gap:8px;margin-bottom:6px"><button type="button" class="btn btn-ghost btn-sm" id="spFootSample">Load Sample</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" id="spFootClear">Reset to automatic</button></div>'
      + '<textarea class="input" id="spFootHtml" rows="9" spellcheck="false" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px" placeholder="Leave empty for automatic footer">' + App.esc(s.footerHtml || '') + '</textarea></div>'
      + '</div></details>'
      + '<div style="grid-column:1/-1;margin-top:4px"><div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:8px">Online Payments</div></div>'
      + '<div style="grid-column:1/-1"><label class="check" for="opEnabled" style="align-items:flex-start"><input type="checkbox" id="opEnabled"' + (s.opEnabled ? ' checked' : '') + ' style="margin-top:2px;width:20px;height:20px;accent-color:var(--brand)">'
      + '<span>Enable online payments<span class="muted" style="display:block;font-weight:500;font-size:12px;margin-top:2px">When ON, patients are shown the payment options below and can share their transaction ID after paying.</span></span></label></div>'
      + '<div><label class="label">JazzCash number</label><input class="input" id="opJazzcashNo" placeholder="e.g. 0300-1234567" value="' + App.esc(s.opJazzcashNo || '') + '"></div>'
      + '<div><label class="label">JazzCash account title</label><input class="input" id="opJazzcashTitle" value="' + App.esc(s.opJazzcashTitle || '') + '"></div>'
      + '<div><label class="label">Easypaisa number</label><input class="input" id="opEasypaisaNo" placeholder="e.g. 0300-1234567" value="' + App.esc(s.opEasypaisaNo || '') + '"></div>'
      + '<div><label class="label">Easypaisa account title</label><input class="input" id="opEasypaisaTitle" value="' + App.esc(s.opEasypaisaTitle || '') + '"></div>'
      + '<div><label class="label">Bank name</label><input class="input" id="opBankName" value="' + App.esc(s.opBankName || '') + '"></div>'
      + '<div><label class="label">IBAN</label><input class="input" id="opIban" placeholder="PK36XXXX0000000000000000" value="' + App.esc(s.opIban || '') + '"></div>'
      + '<div><label class="label">Raast ID</label><input class="input" id="opRaastId" value="' + App.esc(s.opRaastId || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Instructions shown to patients</label><textarea class="input" id="opInstructions" rows="2" maxlength="500" placeholder="Send payment and share the TID">' + App.esc(s.opInstructions || '') + '</textarea></div>'
      + '</div>'
      + '<div style="margin-top:18px;display:flex;gap:10px"><button class="btn btn-primary" id="spSave">Save Profile</button>' +
        '<button class="btn btn-ghost" id="spPreviewBtn">👁 Preview Report</button></div>'
      + '</div>'
      + '<div class="sp-preview">'
      + '<div class="sp-preview-head"><h3>Print Preview</h3><span class="muted" style="font-size:12px">Live — updates as you type</span></div>'
      + '<div class="sp-preview-doc" id="spPreviewDoc"><div class="muted" style="padding:40px 20px;text-align:center">Loading preview…</div></div>'
      + '</div>'
      + '</div>';
    document.getElementById('setBody').innerHTML = html;
    /* lab logo upload: downscale to max 256px PNG, keep in memory until Save */
    var _logoData = s.logo || '';
    var _logoPrev = document.getElementById('spLogoPrev');
    var _logoRm = document.getElementById('spLogoRm');
    var _logoInput = document.getElementById('spLogo');
    function _paintLogo() {
      if (_logoPrev) { _logoPrev.src = _logoData || ''; _logoPrev.hidden = !_logoData; }
      if (_logoRm) _logoRm.hidden = !_logoData;
      if (typeof _schedulePreview === 'function') _schedulePreview();
    }
    if (_logoInput) _logoInput.addEventListener('change', function () {
      var f = _logoInput.files && _logoInput.files[0];
      if (!f) return;
      try {
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var im = new Image();
            im.onload = function () {
              try {
                var max = 256, w = im.width || max, h = im.height || max;
                var sc = Math.min(1, max / Math.max(w, h));
                var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
                var cv = document.createElement('canvas');
                cv.width = cw; cv.height = ch;
                cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
                _logoData = cv.toDataURL('image/png');
                _paintLogo();
              } catch (e2) { App.toast('Could not process that image.', 'err'); }
            };
            im.onerror = function () { App.toast('Could not read that image.', 'err'); };
            im.src = rd.result;
          } catch (e1) { App.toast('Could not read that image.', 'err'); }
        };
        rd.onerror = function () { App.toast('Could not read that image.', 'err'); };
        rd.readAsDataURL(f);
      } catch (e0) { App.toast('Logo upload is not supported here.', 'err'); }
    });
    if (_logoRm) _logoRm.addEventListener('click', function () {
      _logoData = '';
      if (_logoInput) _logoInput.value = '';
      _paintLogo();
    });
    /* signatory doctors: dynamic rows (add / remove) */
    var _sigList = document.getElementById('spSigList');
    function _sigRowHTML(sig) {
      sig = sig || {};
      return '<div class="sp-sig-row" style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto auto;gap:8px;margin-bottom:8px;align-items:center">'
        + '<input class="input sp-sig-name" placeholder="Name" maxlength="80" value="' + App.esc(sig.name || '') + '">'
        + '<input class="input sp-sig-qual" placeholder="Qualification" maxlength="80" value="' + App.esc(sig.qual || '') + '">'
        + '<input class="input sp-sig-title" placeholder="Title (e.g. Consultant Pathologist)" maxlength="80" value="' + App.esc(sig.title || '') + '">'
        + '<button class="btn btn-ghost sp-sig-up" type="button" title="Move up">↑</button>'
        + '<button class="btn btn-ghost sp-sig-dn" type="button" title="Move down">↓</button>'
        + '<button class="btn btn-ghost sp-sig-rm" type="button" title="Remove signatory">✕</button></div>';
    }
    function _syncSigs() {
      var out = [];
      if (!_sigList) return out;
      var rows = _sigList.querySelectorAll('.sp-sig-row');
      for (var i = 0; i < rows.length; i++) {
        var nm = rows[i].querySelector('.sp-sig-name'), ql = rows[i].querySelector('.sp-sig-qual'), tt = rows[i].querySelector('.sp-sig-title');
        var rec = {
          name: nm ? nm.value.trim() : '',
          qual: ql ? ql.value.trim() : '',
          title: tt ? tt.value.trim() : ''
        };
        if (rec.name || rec.qual || rec.title) out.push(rec);
      }
      return out;
    }
    if (_sigList) {
      _sigList.innerHTML = ((s.signatories && s.signatories.length) ? s.signatories : [
        { name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist' },
        { name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP', title: '' },
        { name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist' },
        { name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Lab Technologist' }
      ]).map(_sigRowHTML).join('');
      /* delegated: remove, move up, move down */
      _sigList.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn) return;
        var row = btn.closest('.sp-sig-row');
        if (!row || !row.parentNode) return;
        if (btn.classList.contains('sp-sig-rm')) {
          row.parentNode.removeChild(row);
        } else if (btn.classList.contains('sp-sig-up')) {
          var prev = row.previousElementSibling;
          if (prev) row.parentNode.insertBefore(row, prev);
        } else if (btn.classList.contains('sp-sig-dn')) {
          var next = row.nextElementSibling;
          if (next) row.parentNode.insertBefore(next, row);
        }
      });
    }
    var _sigAdd = document.getElementById('spSigAdd');
    if (_sigAdd) _sigAdd.addEventListener('click', function () {
      if (_sigList) _sigList.insertAdjacentHTML('beforeend', _sigRowHTML({}));
    });
    /* sample header/footer loaders */
    var headSampleBtn = document.getElementById('spHeadSample');
    if (headSampleBtn) headSampleBtn.addEventListener('click', function () {
      document.getElementById('spHeadHtml').value = HEADER_SAMPLE;
      if (typeof _schedulePreview === 'function') _schedulePreview();
    });
    var headClearBtn = document.getElementById('spHeadClear');
    if (headClearBtn) headClearBtn.addEventListener('click', function () {
      document.getElementById('spHeadHtml').value = '';
      _fillTpl(true);
      if (typeof _schedulePreview === 'function') _schedulePreview();
    });
    var footSampleBtn = document.getElementById('spFootSample');
    if (footSampleBtn) footSampleBtn.addEventListener('click', function () {
      document.getElementById('spFootHtml').value = FOOTER_SAMPLE;
      if (typeof _schedulePreview === 'function') _schedulePreview();
    });
    var footClearBtn = document.getElementById('spFootClear');
    if (footClearBtn) footClearBtn.addEventListener('click', function () {
      document.getElementById('spFootHtml').value = '';
      _fillTpl(true);
      if (typeof _schedulePreview === 'function') _schedulePreview();
    });
    /* pre-fill the Custom Header / Footer boxes with the current automatic ones, so they can be edited in place.
       While a box still holds the untouched automatic text it is saved as "empty" (= keep following the profile fields). */
    var _tplHead = '', _tplFoot = '';
    function _fillTpl(force) {
      var run = function () {
        var base = _collectPreviewSettings(); base.headerHtml = ''; base.footerHtml = '';
        var h = document.getElementById('spHeadHtml'), f = document.getElementById('spFootHtml');
        if (!h || !f || !App.reportHeaderTemplate) return;
        var nh = App.reportHeaderTemplate(base), nf = App.reportFooterTemplate(base);
        if (force || !h.value.trim() || h.value === _tplHead) { h.value = nh; _tplHead = nh; }
        if (force || !f.value.trim() || f.value === _tplFoot) { f.value = nf; _tplFoot = nf; }
      };
      if (App.reportHeaderTemplate) run(); else App.loadScript('assets/js/mod-results.js').then(run, function () {});
    }
    window.__spAutoTpl = function () { return { head: _tplHead, foot: _tplFoot }; };
    _fillTpl(false);
    (function () { /* lab-name colour: colour picker, quick swatches, reset to default black */
      var ci = document.getElementById('spNameColor'); if (!ci) return;
      function touch(v) { ci.value = v; ci.setAttribute('data-touched', '1'); if (typeof _schedulePreview === 'function') _schedulePreview(); }
      ci.addEventListener('input', function () { touch(ci.value); });
      Array.prototype.forEach.call(document.querySelectorAll('.spNameSw'), function (b) { b.addEventListener('click', function () { touch(b.getAttribute('data-c')); }); });
      document.getElementById('spNameReset').addEventListener('click', function () { ci.value = '#000000'; ci.removeAttribute('data-touched'); if (typeof _schedulePreview === 'function') _schedulePreview(); });
    })();
    document.getElementById('spPreviewBtn').addEventListener('click', function () {
      var ps = _collectPreviewSettings();
      App.loadScript('assets/js/mod-results.js').then(function () {
        var html = App.sampleReportPreview(ps);
        /* inject a sample QR code in the preview so the user sees the layout */
        if (ps.showQr !== false && App.qrDataUrlFor) {
          try {
            var qrSrc = App.qrDataUrlFor('https://optix-lab-medsync.pages.dev/sample-report');
            if (qrSrc) {
              /* replace ALL data-qr images, not just the first */
              html = html.split('data-qr="1"').join('data-qr="1" src="' + qrSrc + '"');
            }
          } catch (e) {}
        }
        /* full-page PDF-like preview: A4-proportioned sheet on a grey backdrop */
        /* mirror the font selected in the form so the preview matches the report */
        var ff = "'Inter',-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
        try {
          var fams = { inter: ff, jakarta: "'Plus Jakarta Sans','Inter',sans-serif",
            roboto: "'Roboto','Inter',sans-serif", poppins: "'Poppins','Inter',sans-serif",
            opensans: "'Open Sans','Inter',sans-serif", lato: "'Lato','Inter',sans-serif",
            montserrat: "'Montserrat','Inter',sans-serif" };
          ff = fams[ps.font] || ff;
        } catch (e) {}
        var fullHtml =
          '<div style="background:#525659;margin:-22px;padding:28px 20px;border-radius:0 0 18px 18px;min-height:60vh">' +
          '<div style="background:#fff;color:#111;max-width:794px;width:100%;margin:0 auto;padding:46px 50px;box-shadow:0 8px 34px rgba(0,0,0,.45);font-family:' + ff + ';font-size:14px;line-height:1.55">' +
          html +
          '</div>' +
          '<div style="text-align:center;margin-top:20px"><button class="btn btn-primary" id="spPrevPrint">🖨 Print This Preview</button></div>' +
          '</div>';
        App.modal('Report Preview — Full Page', fullHtml, { wide: true, onOpen: function (ov) {
          var pb = ov.querySelector('#spPrevPrint');
          if (pb) pb.addEventListener('click', function () {
            App.print('Lab Report Preview', html, { noHeader: true });
          });
        }});
      });
    });
    document.getElementById('spSave').addEventListener('click', function () {
      var name = document.getElementById('spName').value.trim();
      var pref = document.getElementById('spPref').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'INV';
      if (!name) return App.toast('Lab name is required.', 'err');
      DB.update('settings', 'main', {
        labName: name,
        tagline: document.getElementById('spTag').value.trim(),
        address: document.getElementById('spAddr').value.trim(),
        phone: document.getElementById('spPhone').value.trim(),
        email: document.getElementById('spEmail').value.trim(),
        invoicePrefix: pref,
        footerNote: document.getElementById('spFoot').value.trim(),
        headerText: document.getElementById('spHeadText').value.trim(),
        footerText: document.getElementById('spFootText').value.trim(),
        logo: _logoData,
        website: document.getElementById('spWeb').value.trim(),
        headOffice: document.getElementById('spHead').value.trim(),
        mainLab: document.getElementById('spMainLab').value.trim(),
        callCenter: document.getElementById('spCall').value.trim(),
        mainLabPhone: document.getElementById('spMainPhone').value.trim(),
        verNote: document.getElementById('spVerNote').value.trim(),
        signatories: _syncSigs(),
        font: document.getElementById('spFont').value,
        reportTitle: document.getElementById('spReportTitle').value.trim(),
        accent: document.getElementById('spAccent').value,
        labNameColor: (document.getElementById('spNameColor').getAttribute('data-touched') ? document.getElementById('spNameColor').value : ''),
        showQr: document.getElementById('spShowQr').checked,
        showTagline: document.getElementById('spShowTagline').checked,
        requireSampleCollected: document.getElementById('spReqSmp').checked,
        reportFontSize: document.getElementById('spFontSize').value,
        headerHtml: (document.getElementById('spHeadHtml').value === _tplHead ? '' : document.getElementById('spHeadHtml').value.trim()),
        footerHtml: (document.getElementById('spFootHtml').value === _tplFoot ? '' : document.getElementById('spFootHtml').value.trim()),
        opEnabled: document.getElementById('opEnabled').checked,
        opJazzcashNo: document.getElementById('opJazzcashNo').value.trim(),
        opJazzcashTitle: document.getElementById('opJazzcashTitle').value.trim(),
        opEasypaisaNo: document.getElementById('opEasypaisaNo').value.trim(),
        opEasypaisaTitle: document.getElementById('opEasypaisaTitle').value.trim(),
        opBankName: document.getElementById('opBankName').value.trim(),
        opIban: document.getElementById('opIban').value.trim(),
        opRaastId: document.getElementById('opRaastId').value.trim(),
        opInstructions: document.getElementById('opInstructions').value.trim()
      });
      App.toast('Report form saved.');
      if (App.renderShell) App.renderShell();
      if (App.applyFont) App.applyFont();
    });

    /* ---- live print preview (right panel) ---- */
    var _pvTimer = null;
    function _collectPreviewSettings() {
      function gv(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
      function gc(id) { var e = document.getElementById(id); return e ? e.checked : false; }
      var sigs = _syncSigs();
      /* fallback to default doctors if none entered */
      if (!sigs.length) {
        sigs = [
          { name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist' },
          { name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP', title: '' },
          { name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist' },
          { name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Lab Technologist' }
        ];
      }
      return {
        labName: gv('spName'), tagline: gv('spTag'), address: gv('spAddr'),
        phone: gv('spPhone'), email: gv('spEmail'), footerNote: gv('spFoot'), headerText: gv('spHeadText'), footerText: gv('spFootText'),
        logo: _logoData, website: gv('spWeb'), headOffice: gv('spHead'),
        mainLab: gv('spMainLab'), callCenter: gv('spCall'), mainLabPhone: gv('spMainPhone'),
        verNote: gv('spVerNote'), signatories: sigs, font: gv('spFont'),
        reportTitle: gv('spReportTitle'), accent: gv('spAccent'),
        labNameColor: (function () { var e = document.getElementById('spNameColor'); return e && e.getAttribute('data-touched') ? e.value : ''; })(),
        showQr: gc('spShowQr'), showTagline: gc('spShowTagline'),
        reportFontSize: gv('spFontSize'),
        headerHtml: (gv('spHeadHtml') === _tplHead ? '' : gv('spHeadHtml')), footerHtml: (gv('spFootHtml') === _tplFoot ? '' : gv('spFootHtml'))
      };
    }
    function _paintPreview() {
      var box = document.getElementById('spPreviewDoc');
      if (!box) return;
      function go() {
        try {
          var ps = _collectPreviewSettings();
          var html = App.sampleReportPreview(ps);
          /* show a sample QR in the live preview too (it was an empty image box) */
          if (ps.showQr !== false && App.qrDataUrlFor) { try { var qs = App.qrDataUrlFor('https://optix-lab-medsync.pages.dev/sample-report'); if (qs) html = html.split('data-qr="1"').join('data-qr="1" src="' + qs + '"'); } catch (e) {} }
          // apply the selected font to the preview
          var ff = "'Inter',sans-serif";
          try {
            if (App.applyFont) {
              var fk = ps.font || 'inter';
              var families = { inter: "'Inter',sans-serif", jakarta: "'Plus Jakarta Sans',sans-serif",
                roboto: "'Roboto',sans-serif", poppins: "'Poppins',sans-serif",
                opensans: "'Open Sans',sans-serif", lato: "'Lato',sans-serif", montserrat: "'Montserrat',sans-serif" };
              ff = families[fk] || families.inter;
            }
          } catch (e) {}
          box.style.fontFamily = ff;
          box.innerHTML = html;
        } catch (e) {
          box.innerHTML = '<div class="muted" style="padding:30px;text-align:center">Preview unavailable.<br><small style="color:#c00">' + App.esc(e.message || e) + '</small></div>';
        }
      }
      if (App.sampleReportPreview) go();
      else App.loadScript('assets/js/mod-results.js').then(go, function () {
        box.innerHTML = '<div class="muted" style="padding:30px;text-align:center">Could not load preview.</div>';
      });
    }
    function _schedulePreview() {
      try { _fillTpl(false); } catch (e) {}
      if (_pvTimer) clearTimeout(_pvTimer);
      _pvTimer = setTimeout(_paintPreview, 350);
    }
    // re-render preview on any form input (debounced)
    var _spForm = document.querySelector('.sp-form');
    if (_spForm) {
      _spForm.addEventListener('input', _schedulePreview);
      _spForm.addEventListener('change', _schedulePreview);
    }
    // logo changes also refresh the preview
    _paintPreview();
  }

  /* ---- My Account — change own username / password ---- */
  function renderSetAccount() {
    var me = sess();
    var u = me ? DB.get('users', me.userId) : null;
    if (!u) { document.getElementById('setBody').innerHTML = App.empty('Account not found. Please log in again.'); return; }
    var html = '<div class="form-grid" style="max-width:560px">'
      + '<div><label class="label">Full Name</label><input class="input" id="maName" value="' + App.esc(u.name || '') + '"></div>'
      + '<div><label class="label">Username *</label><input class="input" id="maUser" value="' + App.esc(u.username || '') + '"></div>'
      + '<div><label class="label">New Password</label><input class="input" id="maPass" type="password" placeholder="min 4 characters"></div>'
      + '<div><label class="label">Confirm New Password</label><input class="input" id="maPass2" type="password" placeholder="repeat new password"></div>'
      + '</div>'
      + '<p class="muted" style="font-size:12.5px;margin-top:10px">Leave the password fields blank to keep your current password.</p>'
      + '<div style="margin-top:14px"><button class="btn btn-primary" id="maSave">Save Changes</button></div>';
    document.getElementById('setBody').innerHTML = html;
    document.getElementById('maSave').addEventListener('click', function () {
      var name = document.getElementById('maName').value.trim();
      var username = document.getElementById('maUser').value.trim();
      var p1 = document.getElementById('maPass').value;
      var p2 = document.getElementById('maPass2').value;
      if (username.length < 3) return App.toast('Username must be at least 3 characters.', 'err');
      var clash = DB.all('users').some(function (x) {
        return x.id !== u.id && String(x.username || '').toLowerCase() === username.toLowerCase();
      });
      if (clash) return App.toast('That username is already taken.', 'err');
      var patch = { username: username, name: name || u.name };
      if (p1 || p2) {
        if (p1.length < 4) return App.toast('New password must be at least 4 characters.', 'err');
        if (p1 !== p2) return App.toast('Passwords do not match.', 'err');
        patch.password = p1;
      }
      DB.update('users', u.id, patch);
      try {
        var s = sess() || {};
        s.name = patch.name;
        localStorage.setItem('labpos_session', JSON.stringify(s));
      } catch (e) {}
      App.toast('Account updated.');
      if (App.renderShell) App.renderShell();
      renderSettings();
    });
  }

  /* ---- Report Templates — per-test report fields (admin only) ----
     Each test's template defines the fields shown when entering results
     and printed on the lab report. The lab header/footer stay the same. */
  function renderSetTemplates() {
    var tests = DB.all('tests').filter(function (t) { return t.active !== false; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    if (!tests.length) {
      document.getElementById('setBody').innerHTML = App.empty('No tests in the catalog yet.');
      return;
    }
    var opts = tests.map(function (t) {
      var n = (t.params || []).length;
      return '<option value="' + App.esc(t.id) + '">' +
        App.esc((t.code ? t.code + ' — ' : '') + t.name) + (n ? '  (' + n + ' fields)' : '') + '</option>';
    }).join('');
    var html = '<div style="max-width:1100px">'
      + '<p class="muted" style="margin-top:0">Design the printed report for each test. Fields you add here appear when entering results and on the printed report / PDF. The lab header and footer stay the same for every test.</p>'
      + '<div style="max-width:420px;margin-bottom:14px"><label class="label">Test</label>'
      + '<select class="input" id="rtTest">' + opts + '</select></div>'
      + '<div class="rt-cols" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">'
      + '<div><div class="label" style="margin-bottom:6px">Report fields</div>'
      + '<div id="rtFields"></div>'
      + '<button class="btn btn-ghost btn-sm" id="rtAdd">+ Add Field</button></div>'
      + '<div><div class="label" style="margin-bottom:6px">Live preview — printed report</div>'
      + '<div id="rtPreview" style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(15,30,46,.06)"></div></div>'
      + '</div>'
      + '<style>@media(max-width:900px){.rt-cols{grid-template-columns:1fr!important}}</style>'
      + '<div style="margin-top:16px;display:flex;gap:10px;align-items:center">'
      + '<button class="btn btn-primary" id="rtSave">Save Template</button>'
      + '<button class="btn btn-ghost" id="rtClear">Clear Template</button>'
      + '</div></div>';
    document.getElementById('setBody').innerHTML = html;
    var box = document.getElementById('rtFields');

    function fieldRow(p) {
      p = p || {};
      var isNum = p.type === 'number';
      return '<div class="rt-frow" style="display:grid;grid-template-columns:1fr 110px 1fr 110px 36px;gap:8px;margin-bottom:8px">'
        + '<input class="input rt-fn" placeholder="Field label (e.g. Hemoglobin)" value="' + App.esc(p.name || '') + '">'
        + App.unitSelect('rt-fu', p.unit)
        + '<div style="display:flex;gap:4px"><input class="input rt-fr" style="min-width:0" placeholder="Reference range" value="' + App.esc(p.ref || '') + '">' + App.refPresetSelect() + '</div>'
        + '<select class="input rt-ft"><option value="text"' + (isNum ? '' : ' selected') + '>Text</option>'
        + '<option value="number"' + (isNum ? ' selected' : '') + '>Number</option></select>'
        + '<button type="button" class="btn btn-ghost btn-sm rt-frm" title="Remove">✕</button>'
        + '<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:-2px">'
        +   '<input class="input rt-xm" placeholder="Male range (optional)" value="' + App.esc(p.refMale || '') + '">'
        +   '<input class="input rt-xf" placeholder="Female range (optional)" value="' + App.esc(p.refFemale || '') + '">'
        +   '<input class="input rt-xc" placeholder="Child &lt; 13 yrs (optional)" value="' + App.esc(p.refChild || '') + '">'
        + '</div></div>';
    }
    function wireRemovals() {
      box.querySelectorAll('.rt-frm').forEach(function (b) {
        b.onclick = function () { b.closest('.rt-frow').remove(); paintPreview(); };
      });
    }
    /* Live preview of the printed report section, mirroring reportHtml() in mod-results.js */
    function curFields() {
      var out = [];
      box.querySelectorAll('.rt-frow').forEach(function (row) {
        var n = row.querySelector('.rt-fn').value.trim();
        if (!n) return;
        var o = {
          name: n,
          unit: row.querySelector('.rt-fu').value.trim(),
          ref: row.querySelector('.rt-fr').value.trim()
        };
        [['.rt-xm', 'refMale'], ['.rt-xf', 'refFemale'], ['.rt-xc', 'refChild']].forEach(function (x) { var v = row.querySelector(x[0]).value.trim(); if (v) o[x[1]] = v; });
        out.push(o);
      });
      return out;
    }
    function paintPreview() {
      var pv = document.getElementById('rtPreview');
      if (!pv) return;
      var t = DB.get('tests', document.getElementById('rtTest').value);
      var s = DB.get('settings', 'main') || {};
      var fields = curFields();
      var h = '<div style="border-bottom:3px solid #131845;padding-bottom:10px;margin-bottom:12px">'
        + '<div style="font-size:17px;font-weight:800;color:#131845">' + App.esc(s.labName || 'Lab') + '</div>'
        + '<div style="color:#64748b;font-size:12px">' + App.esc(s.address || '') + ' • ' + App.esc(s.phone || '') + '</div></div>'
        + '<div style="text-align:center;font-weight:700;font-size:13px;margin-bottom:10px;letter-spacing:.04em">LABORATORY REPORT</div>'
        + '<div style="font-size:15px;font-weight:800;margin:0 0 6px">' + App.esc(t ? t.name : '')
        + (t && t.code ? ' <span style="color:#64748b;font-weight:500">(' + App.esc(t.code) + ')</span>' : '') + '</div>';
      if (!fields.length) {
        h += '<p class="muted" style="font-size:13px;margin:8px 0 0">No template — this test prints a single free-text Result box.</p>';
      } else {
        h += '<table class="table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead><tbody>'
          + fields.map(function (p) {
            return '<tr><td>' + App.esc(p.name) + '</td><td></td><td>' + App.esc(p.unit) + '</td><td>' + App.esc(p.ref) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      h += '<p style="color:#64748b;font-size:11.5px;margin:12px 0 2px"><em>' + App.esc(s.footerNote || '') + '</em></p>'
        + '<p style="color:#999;font-size:10.5px;text-align:center;margin:0">Powered by System Optix</p>';
      pv.innerHTML = h;
    }
    function paint(testId) {
      var t = DB.get('tests', testId);
      var params = (t && t.params) || [];
      if (params.length) { box.innerHTML = params.map(fieldRow).join(''); }
      else {
        box.innerHTML = '<p class="muted" style="border:1px dashed var(--line);border-radius:10px;padding:12px 14px">'
          + 'No fields yet — this test prints a single free-text Result box. Add fields above to build its report form.</p>';
      }
      wireRemovals();
      paintPreview();
    }
    document.getElementById('rtTest').addEventListener('change', function (e) { paint(e.target.value); });
    box.addEventListener('input', paintPreview);
    document.getElementById('rtAdd').addEventListener('click', function () {
      if (!box.querySelector('.rt-frow')) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', fieldRow(null));
      wireRemovals();
      paintPreview();
      var last = box.querySelector('.rt-frow:last-child .rt-fn');
      if (last) last.focus();
    });
    document.getElementById('rtSave').addEventListener('click', function () {
      var tid = document.getElementById('rtTest').value;
      var params = [];
      box.querySelectorAll('.rt-frow').forEach(function (row) {
        var n = row.querySelector('.rt-fn').value.trim();
        if (!n) return;
        var po = {
          name: n,
          unit: row.querySelector('.rt-fu').value.trim(),
          ref: row.querySelector('.rt-fr').value.trim(),
          type: row.querySelector('.rt-ft').value === 'number' ? 'number' : 'text'
        };
        [['.rt-xm', 'refMale'], ['.rt-xf', 'refFemale'], ['.rt-xc', 'refChild']].forEach(function (x) { var v = row.querySelector(x[0]).value.trim(); if (v) po[x[1]] = v; });
        params.push(po);
      });
      DB.update('tests', tid, { params: params });
      App.toast('Report template saved — ' + params.length + ' field(s).');
      renderSettings();
    });
    document.getElementById('rtClear').addEventListener('click', function () {
      var tid = document.getElementById('rtTest').value;
      App.confirm('Remove all fields from this test\'s template? It will print a single free-text Result box.').then(function (ok) {
        if (!ok) return;
        DB.update('tests', tid, { params: [] });
        App.toast('Template cleared.');
        renderSettings();
      });
    });
    paint(tests[0].id);
  }

  /* ---- WhatsApp API (admin only) ---- */
  function waDefaults() {
    return { provider: 'ultramsg', instanceId: '', token: '', baseUrl: '', labNumber: '', autoPatient: true, autoDoctor: false, autoCritical: true, autoReceipt: false, autoDueReminder: false, dueReminderDay: 1, autoOwnerSummary: false, ownerSummaryHour: 21, ownerNumber: '', autoFeedback: false, googleReviewUrl: '', autoRetest: false };
  }
  /* ---- Link the lab's own WhatsApp number with a QR code (the server then sends from it) ---- */
  function wireGateway() {
    var box = document.getElementById('waGwBox'); if (!box) return;
    if (!(DB.isCloud && DB.isCloud()) || (window.labposDesktop && window.labposDesktop.isDesktop)) { box.remove(); return; }
    var timer = null, last = '';
    function setCfg(patch) { var st = DB.get('settings', 'main') || {}, ww = Object.assign(waDefaults(), st.whatsapp || {}); Object.assign(ww, patch); st.whatsapp = ww; DB.update('settings', 'main', st); }
    function qrImg(str) { try { var q = qrcode(0, 'L'); q.addData(str); q.make(); return q.createDataURL(5, 4); } catch (e) { return ''; } }
    function draw(st) {
      var sig = JSON.stringify([st.state, st.qr, st.number, st.err]); if (sig === last) return; last = sig;
      var w = (DB.get('settings', 'main') || {}).whatsapp || {};
      var head = '<div class="card" style="max-width:640px;margin-bottom:14px"><div class="card-h"><h3>Connect your WhatsApp number</h3><span class="badge ' + (st.state === 'open' ? 'b-ready' : 'b-pending') + '" style="margin-left:8px">' + (st.state === 'open' ? 'CONNECTED' : 'NOT CONNECTED') + '</span></div><div class="card-b">';
      var body = '';
      if (st.enabled === false) body = '<p class="muted" style="margin:0">Linking a WhatsApp number is not available on this server.</p>';
      else if (st.state === 'open') {
        body = '<p style="margin-top:0">Connected: <b>+' + App.esc(st.number) + '</b>. These messages are now sent from this number:</p>' +
          '<ul style="margin:0 0 12px;padding-left:18px;line-height:1.75;font-size:13.5px"><li><b>Report ready</b> to the patient (and, if switched on below, the referring doctor)</li><li><b>Balance pending</b> note to the patient</li><li><b>Critical result</b> alert to the referring doctor and your lab number</li><li><b>Sign-in code and link</b> when a patient or doctor opens the reports portal</li><li><b>Doctor statements</b>, when you press Send on WhatsApp</li></ul>' +
          '<div style="margin:0 0 12px"><label class="label" for="gwGap">Sending speed (protects your number from being blocked)</label><select class="select" id="gwGap" style="max-width:380px">' +
          [[30, 'One message every 30 seconds'], [60, 'One message every minute (recommended)'], [120, 'One message every 2 minutes'], [300, 'One message every 5 minutes']].map(function (o) { return '<option value="' + o[0] + '"' + ((+w.gapSeconds || 60) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<div class="muted" style="font-size:12.5px;margin-top:5px">When many reports are sent together they wait in a line and leave one by one. <b>Sign-in codes and critical alerts are never delayed.</b></div></div>' +
          '<p class="muted" style="margin:0 0 12px;font-size:13px">You can change the wording in <b>WhatsApp → Templates &amp; rules</b>. Messages go only to people with a phone number saved in your records.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="gwTest">Send a test message to this number</button><button class="btn btn-ghost" id="gwOff" style="margin-left:auto;color:#b91c1c">Disconnect</button></div><p class="muted" id="gwMsg" style="margin:10px 0 0;font-size:13px"></p>';
      } else if (st.state === 'qr' && st.qr) {
        body = '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start"><img alt="QR" style="width:230px;height:230px;border:1px solid var(--line);border-radius:12px;padding:6px;background:#fff" src="' + qrImg(st.qr) + '">' +
          '<ol style="margin:0;padding-left:18px;line-height:1.9;font-size:14px;flex:1;min-width:210px"><li>Open <b>WhatsApp</b> on the lab\'s phone</li><li>Tap <b>Settings → Linked devices</b></li><li>Tap <b>Link a device</b> and scan this code</li></ol></div><p class="muted" style="margin:10px 0 0;font-size:13px">Waiting for the scan… the code refreshes by itself.</p>';
      } else if (st.state === 'connecting') {
        body = '<p class="muted" style="margin:0">Connecting to WhatsApp…</p>';
      } else {
        body = '<p class="muted" style="margin-top:0">Link <b>your lab\'s own WhatsApp number</b> by scanning a QR code, just like WhatsApp Web. After that, report links and sign-in codes go out from your number automatically. No paid API needed.</p>' +
          '<div style="background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.55;margin-bottom:12px"><b>Please note:</b> this works like WhatsApp Web, it is not the official WhatsApp Business API. Use a <b>separate number kept for the lab</b>, message only your own patients, and avoid bulk or promotional messages, otherwise WhatsApp can block the number.</div>' +
          (st.err ? '<p style="color:#b45309;margin:0 0 10px;font-size:13.5px">' + App.esc(st.err) + '</p>' : '') + '<button class="btn btn-primary" id="gwOn">Link my WhatsApp number</button>';
      }
      box.innerHTML = head + body + '</div></div>';
      var on = document.getElementById('gwOn'); if (on) on.addEventListener('click', function () { on.disabled = true; last = ''; DB.waGw('POST', 'connect', {}).then(function (s) { draw(s); poll(); }, function (e) { on.disabled = false; App.toast(e.message, 'err'); }); });
      var gp = document.getElementById('gwGap'); if (gp) gp.addEventListener('change', function () { setCfg({ gapSeconds: +gp.value }); App.toast('Sending speed saved: one message every ' + (+gp.value >= 60 ? (gp.value / 60) + ' min' : gp.value + ' seconds')); });
      var test = document.getElementById('gwTest'); if (test) test.addEventListener('click', function () { test.disabled = true; DB.waGw('POST', 'send', { to: st.number, text: '*' + ((DB.get('settings', 'main') || {}).labName || 'Your lab') + '*\n\nThis is a test message. Your WhatsApp number is linked and ready to send reports.' }).then(function () { document.getElementById('gwMsg').textContent = 'Sent! Check WhatsApp (it may appear in "Message yourself").'; test.disabled = false; }, function (e) { document.getElementById('gwMsg').textContent = e.message; document.getElementById('gwMsg').style.color = '#b91c1c'; test.disabled = false; }); });
      var off = document.getElementById('gwOff'); if (off) off.addEventListener('click', function () { App.confirm('Disconnect this WhatsApp number? Reports will stop going out on WhatsApp until you link a number again.').then(function (ok) { if (!ok) return; DB.waGw('POST', 'disconnect', {}).then(function () { setCfg({ provider: (w.instanceId && w.token) ? 'ultramsg' : '', gatewayNumber: '' }); last = ''; draw({ enabled: true, state: 'idle', qr: '', number: '', err: '' }); }, function (e) { App.toast(e.message, 'err'); }); }); });
    }
    function poll() {
      clearInterval(timer);
      timer = setInterval(function () {
        if (!document.getElementById('waGwBox')) { clearInterval(timer); return; }
        DB.waGw('GET', 'status').then(function (st) {
          var w = (DB.get('settings', 'main') || {}).whatsapp || {};
          if (st.state === 'open' && (w.provider !== 'gateway' || w.gatewayNumber !== st.number)) { setCfg({ provider: 'gateway', gatewayNumber: st.number, labNumber: w.labNumber || st.number }); App.toast('WhatsApp number linked'); }
          draw(st); if (st.state === 'open' || st.state === 'idle' || st.state === 'loggedout') clearInterval(timer);
        }, function () {});
      }, 2000);
    }
    DB.waGw('GET', 'status').then(function (st) {
      var w = (DB.get('settings', 'main') || {}).whatsapp || {};
      if (st.state === 'open' && (w.provider !== 'gateway' || w.gatewayNumber !== st.number)) setCfg({ provider: 'gateway', gatewayNumber: st.number, labNumber: w.labNumber || st.number });
      if (st.state === 'loggedout' && w.provider === 'gateway') setCfg({ provider: (w.instanceId && w.token) ? 'ultramsg' : '', gatewayNumber: '' });
      draw(st); if (st.state === 'qr' || st.state === 'connecting') poll();
    }, function (e) { box.innerHTML = ''; });
  }
  /* ---- WhatsApp: admin only sees/edits their lab number; API hidden ---- */
  /* ---- Patient & doctor portal: switch, link / QR to share, and "prepare old reports" ---- */
  function renderSetPortal() {
    var s = DB.get('settings', 'main') || {}, box = document.getElementById('setBody');
    var cloud = !!(DB.isCloud && DB.isCloud()) && !(window.labposDesktop && window.labposDesktop.isDesktop);
    if (!cloud) { box.innerHTML = '<p class="muted">The patient portal works for cloud labs (web / Android). Open your lab in the browser to set it up.</p>'; return; }
    box.innerHTML = '<p class="muted">Loading…</p>';
    DB.saas('GET', 'me').then(function (me) {
      var slug = me.lab.slug, link = location.href.split('#')[0].replace(/index\.html$/, '') + '#/portal/' + slug;
      var w = s.whatsapp || {}, waOn = !!(w.token && (w.provider === 'custom' ? w.baseUrl : w.instanceId));
      var ready = 0, withPdf = 0;
      try { DB.all('invoices').forEach(function (i) { var rs = DB.all('results').filter(function (r) { return r.invoiceId === i.id; }); if (rs.length && rs.every(function (r) { return r.status === 'ready'; })) { ready++; if (i.reportPdfKey) withPdf++; } }); } catch (e) {}
      box.innerHTML =
        '<div class="card" style="max-width:720px"><div class="card-h"><h3>Patient &amp; doctor portal</h3><span class="badge ' + (s.portalOn ? 'b-ready' : 'b-pending') + '" style="margin-left:8px">' + (s.portalOn ? 'ON' : 'OFF') + '</span></div><div class="card-b">' +
        '<p class="muted" style="margin-top:0">Patients open one link, type their mobile number, get a <b>6-digit code</b> and see <b>all their reports</b>. Doctors who are on your Doctors list see the reports of the patients they referred and their monthly commission. Nobody else can see anything.</p>' +
        '<label class="check" style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" id="ptOn"' + (s.portalOn ? ' checked' : '') + '> Switch the portal ON</label>' +
        '<div id="ptBody" style="margin-top:14px;' + (s.portalOn ? '' : 'opacity:.55') + '">' +
        '<label class="label">Link to share (put it on invoices, WhatsApp, or print the QR)</label><div style="display:flex;gap:8px"><input class="input" id="ptLink" readonly value="' + App.esc(link) + '"><button class="btn" id="ptCopy">Copy</button></div>' +
        '<div id="ptQr" style="margin:12px 0"></div>' +
        '<div style="background:#f6f8fd;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6"><b>How the code is sent:</b> ' + (waOn ? 'on <b>WhatsApp</b>, from your lab\'s WhatsApp number (the one set up in Settings → WhatsApp).' : '<span style="color:#b45309">your WhatsApp is not set up yet, so codes go <b>by email</b> to people who have an email address on file. Set up Settings → WhatsApp for the best experience.</span>') +
        '<br>Make sure patients\' and doctors\' <b>phone numbers</b> are saved correctly; that is how they are recognised.</div>' +
        '<div style="margin-top:16px"><b>Reports ready for the portal:</b> ' + withPdf + ' of ' + ready + ' finished reports<div class="muted" style="font-size:12.5px;margin:4px 0 8px">New reports are prepared automatically. Use the button for the older ones.</div>' +
        '<button class="btn btn-primary" id="ptPrep"' + (ready > withPdf ? '' : ' disabled') + '>Prepare ' + (ready - withPdf) + ' older report' + (ready - withPdf === 1 ? '' : 's') + '</button> <span class="muted" id="ptProg" style="font-size:13px"></span></div></div></div></div>';
      if (App.qrDataUrlFor) { try { var q = App.qrDataUrlFor(link); if (q) document.getElementById('ptQr').innerHTML = '<img src="' + q + '" alt="QR" style="width:150px;height:150px;border:1px solid var(--line);border-radius:10px;padding:6px;background:#fff">'; } catch (e) {} }
      else App.loadScript('assets/js/mod-results.js').then(function () { try { var q2 = App.qrDataUrlFor && App.qrDataUrlFor(link); var el = document.getElementById('ptQr'); if (q2 && el) el.innerHTML = '<img src="' + q2 + '" alt="QR" style="width:150px;height:150px;border:1px solid var(--line);border-radius:10px;padding:6px;background:#fff">'; } catch (e) {} });
      document.getElementById('ptOn').addEventListener('change', function (e) { DB.update('settings', 'main', { portalOn: e.target.checked }); App.toast(e.target.checked ? 'Portal is ON' : 'Portal is OFF'); renderSetPortal(); });
      document.getElementById('ptCopy').addEventListener('click', function () { var i = document.getElementById('ptLink'); i.select(); try { document.execCommand('copy'); App.toast('Link copied'); } catch (e) { App.toast('Select the link and copy it', 'err'); } });
      var pb = document.getElementById('ptPrep'); if (pb) pb.addEventListener('click', function () {
        pb.disabled = true;
        var go = function () { App.preparePortalReports(function (d, t) { document.getElementById('ptProg').textContent = 'Preparing ' + d + ' of ' + t + '…'; }).then(function (n) { App.toast(n + ' report' + (n === 1 ? '' : 's') + ' prepared'); renderSetPortal(); }, function (e) { pb.disabled = false; App.toast((e && e.message) || 'Could not prepare', 'err'); }); };
        if (App.preparePortalReports) go(); else App.loadScript('assets/js/mod-results.js').then(go, function () { pb.disabled = false; App.toast('Could not load', 'err'); });
      });
    }, function (e) { box.innerHTML = '<p style="color:#b91c1c">' + App.esc(e.message) + '</p>'; });
  }

  /* ---- Email & Slack: how finished reports leave the lab besides WhatsApp ---- */
  function renderSetSharing() {
    var s = DB.get('settings', 'main') || {}, box = document.getElementById('setBody');
    var cloud = !!(DB.isCloud && DB.isCloud()) && !(window.labposDesktop && window.labposDesktop.isDesktop);
    if (!cloud) { box.innerHTML = '<p class="muted">Email and Slack sharing work in the web / Android app (cloud). Open your lab in the browser to use them.</p>'; return; }
    box.innerHTML = '<p class="muted">Loading…</p>';
    DB.share('GET', 'status').then(function (st) {
      var tail = st.slackTail ? '…' + App.esc(st.slackTail) : '';
      box.innerHTML =
        '<div class="card" style="max-width:720px"><div class="card-h"><h3>Email reports</h3><span class="badge ' + (st.email ? 'b-ready' : 'b-pending') + '" style="margin-left:8px">' + (st.email ? 'ON' : 'NOT SET UP') + '</span></div><div class="card-b">' +
        (st.email
          ? '<p class="muted" style="margin-top:0">Open any report and press <b>Email Patient</b> or <b>Email Doctor</b>. The PDF is attached, with a link to open it on a phone. Mail shows your lab\'s name as the sender' + (s.email ? ' and replies go to <b>' + App.esc(s.email) + '</b>' : '') + '. Limit: <b>' + st.perDay + ' report emails per day</b> for your lab.</p>' +
            (s.email ? '' : '<p style="color:#b45309;font-size:13px">Tip: add your lab\'s <b>Email</b> in Edit Report Form, so patients can reply to you.</p>')
          : '<p class="muted" style="margin-top:0">Email sending is not set up on this server yet. The system owner can set it up in the superadmin console (Email sender).</p>') +
        (st.email ? '<div style="margin:12px 0 4px;display:grid;gap:8px"><label class="check" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="emAutoPat"' + (s.emailAuto ? ' checked' : '') + '> Email every report to the <b>patient</b> automatically when it is ready</label>' +
          '<label class="check" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="emAutoDoc"' + (s.emailAutoDoctor ? ' checked' : '') + '> Also email it to the <b>referring doctor</b></label>' +
          '<span class="muted" style="font-size:12.5px">Only patients / doctors who have an email address on file get it. A report with an unpaid balance waits until it is paid (same rule as WhatsApp).</span></div>' : '') +
        '<p class="muted" style="font-size:12.5px;margin-bottom:0">Patient and doctor email addresses are saved on their records (Patients, Doctors).</p></div></div>' +
        '<div class="card" style="max-width:720px;margin-top:14px"><div class="card-h"><h3>Slack</h3><span class="badge ' + (st.slack ? 'b-ready' : 'b-pending') + '" style="margin-left:8px">' + (st.slack ? 'CONNECTED' : 'NOT CONNECTED') + '</span></div><div class="card-b">' +
        '<p class="muted" style="margin-top:0">Post a message with the report link to a Slack channel (for your team or a doctor group). Only the patient name, invoice number, test names and the report link are sent.</p>' +
        '<ol class="muted" style="margin:0 0 12px 18px;padding:0;line-height:1.8;font-size:13px"><li>Open <b>api.slack.com/apps</b> → <b>Create New App</b> → From scratch → pick your workspace.</li><li><b>Incoming Webhooks</b> → turn it <b>On</b> → <b>Add New Webhook to Workspace</b> → choose the channel.</li><li>Copy the <b>Webhook URL</b> (starts with <code>https://hooks.slack.com/services/</code>) and paste it here.</li></ol>' +
        '<label class="label" for="skUrl">Webhook URL</label><input class="input" id="skUrl" autocomplete="off" placeholder="' + (st.slack ? 'saved (' + tail + ') — paste a new one to replace it' : 'https://hooks.slack.com/services/…') + '">' +
        '<label class="check" style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="skAuto"' + (st.slackAuto ? ' checked' : '') + '> Post to Slack automatically when a report becomes ready</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-primary" id="skSave">Save</button>' +
        (st.slack ? '<button class="btn" id="skTest">Send test message</button><button class="btn btn-ghost" id="skClear" style="margin-left:auto">Remove</button>' : '') + '</div>' +
        '<p class="muted" id="skMsg" style="margin:10px 0 0;font-size:13px"></p></div></div>';
      var ea = document.getElementById('emAutoPat'), ed = document.getElementById('emAutoDoc');
      if (ea) ea.addEventListener('change', function () { DB.update('settings', 'main', { emailAuto: ea.checked }); App.toast(ea.checked ? 'Automatic email to patients is ON' : 'Automatic email to patients is OFF'); });
      if (ed) ed.addEventListener('change', function () { DB.update('settings', 'main', { emailAutoDoctor: ed.checked }); App.toast(ed.checked ? 'Automatic email to doctors is ON' : 'Automatic email to doctors is OFF'); });
      var msg = function (t, bad) { var e = document.getElementById('skMsg'); if (e) { e.textContent = t; e.style.color = bad ? '#b91c1c' : '#047857'; } };
      document.getElementById('skSave').addEventListener('click', function () {
        var url = document.getElementById('skUrl').value.trim(), auto = document.getElementById('skAuto').checked;
        if (!url && !st.slack) { msg('Paste the Slack webhook URL first.', true); return; }
        DB.share('PUT', 'slack', { webhook: url || undefined, auto: auto }).then(function () { if (App.shareStatus) App.shareStatus(true); App.toast('Slack settings saved.'); renderSetSharing(); }, function (e) { msg(e.message, true); });
      });
      var t = document.getElementById('skTest'); if (t) t.addEventListener('click', function () {
        t.disabled = true; msg('Sending…');
        DB.share('POST', 'slack/test', {}).then(function () { t.disabled = false; msg('Sent! Check your Slack channel.'); }, function (e) { t.disabled = false; msg(e.message, true); });
      });
      var c = document.getElementById('skClear'); if (c) c.addEventListener('click', function () {
        App.confirm('Disconnect Slack?').then(function (ok) { if (!ok) return; DB.share('PUT', 'slack', { clear: true }).then(function () { if (App.shareStatus) App.shareStatus(true); renderSetSharing(); }, function (e) { msg(e.message, true); }); });
      });
    }, function (e) { box.innerHTML = '<p style="color:#b91c1c">' + App.esc(e.message) + '</p>'; });
  }

  function renderSetWhatsapp() {
    var s = DB.get('settings', 'main') || {};
    var w = Object.assign(waDefaults(), s.whatsapp || {});
    var autoPat = w.autoPatient !== false;  /* default ON */
    var autoDoc = w.autoDoctor === true;    /* default OFF */
    var html =
      '<div class="card" style="max-width:640px"><div class="card-h"><h3>Lab WhatsApp Number</h3></div>' +
      '<div class="card-b">' +
      '<p class="muted" style="font-size:13px;margin-top:0">This is your lab\'s WhatsApp number — used when sharing reports with patients.</p>' +
      '<div style="display:flex;gap:10px">' +
      '<input class="input" id="waLabNum" placeholder="e.g. 0300-1234567" value="' + App.esc(w.labNumber || '') + '" style="flex:1">' +
      '<button class="btn btn-primary" id="waLabNumSave">Save</button>' +
      '</div></div></div>' +
      '<div class="card" style="max-width:640px;margin-top:14px"><div class="card-h"><h3>Auto-send Reports</h3></div>' +
      '<div class="card-b">' +
      '<p class="muted" style="font-size:13px;margin-top:0">Automatically send the report on WhatsApp (via your UltraMsg number) when an invoice becomes ready. ' +
      'A history of every auto-send is kept in the WhatsApp log.</p>' +
      '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;margin-bottom:10px">' +
      '<input type="checkbox" id="waAutoPatient"' + (autoPat ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--green)"> ' +
      'Auto-send report to <strong>patient</strong> on ready</label>' +
      '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px">' +
      '<input type="checkbox" id="waAutoDoctor"' + (autoDoc ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--green)"> ' +
      'Auto-send report to <strong>referring doctor</strong> on ready</label>' +
      '</div></div>' +
      '<div class="card" style="max-width:640px;margin-top:14px"><div class="card-h"><h3>Critical Value Alerts</h3></div>' +
      '<div class="card-b">' +
      '<p class="muted" style="font-size:13px;margin-top:0">When a saved result is far outside the normal range, show a red alert to the technician and send a WhatsApp ' +
      'to the <strong>referring doctor</strong> and to your <strong>lab number</strong> above, right away.</p>' +
      '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px">' +
      '<input type="checkbox" id="waAutoCritical"' + (w.autoCritical !== false ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--red)"> ' +
      'Send <strong>critical value</strong> alerts on WhatsApp</label>' +
      '</div></div>';
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var hours = [18, 19, 20, 21, 22, 23].map(function (h) { return '<option value="' + h + '"' + ((+w.ownerSummaryHour || 21) === h ? ' selected' : '') + '>' + (h - 12) + ':00 PM</option>'; }).join('');
    function tick(id, on, title, desc, extra) {
      return '<div style="padding:12px 0;border-top:1px solid var(--line)"><label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:14px">' +
        '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' style="width:18px;height:18px;margin-top:2px;accent-color:var(--green)"> <span><strong>' + title + '</strong><span class="muted" style="display:block;font-size:12.5px;margin-top:2px">' + desc + '</span></span></label>' + (extra ? '<div style="margin:8px 0 0 28px">' + extra + '</div>' : '') + '</div>';
    }
    html +=
      '<div class="card" style="max-width:640px;margin-top:14px"><div class="card-h"><h3>Automatic messages</h3></div><div class="card-b" style="padding-top:4px">' +
      '<p class="muted" style="font-size:13px;margin:8px 0 6px">Tick a box and it starts working by itself &mdash; no need to press anything. Needs your WhatsApp number to be <b>connected</b> above. All messages leave one by one at your sending speed, and only go to people who have a phone number saved.</p>' +
      tick('waAutoReceipt', w.autoReceipt === true, 'Receipt after billing', 'A few minutes after an invoice is made, the patient gets a receipt: invoice no., total, paid and balance.') +
      tick('waAutoDue', w.autoDueReminder === true, 'Weekly balance reminder', 'Once a week, patients who still owe money get a polite reminder with the amount (at most 4 times per invoice).',
        '<label class="label" for="waDueDay" style="margin-bottom:3px">Send on</label><select class="select" id="waDueDay" style="max-width:200px">' + days.map(function (d, i) { return '<option value="' + i + '"' + ((+w.dueReminderDay === i) ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>') +
      tick('waAutoOwner', w.autoOwnerSummary === true, 'Daily summary to the owner', 'Every evening you get one message: today\'s patients, billing, money collected and total dues.',
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><div><label class="label" for="waOwnerHour" style="margin-bottom:3px">Time</label><select class="select" id="waOwnerHour">' + hours + '</select></div>' +
        '<div style="flex:1;min-width:190px"><label class="label" for="waOwnerNum" style="margin-bottom:3px">Owner\'s WhatsApp number</label><input class="input" id="waOwnerNum" placeholder="blank = lab number above" value="' + App.esc(w.ownerNumber || '') + '"></div>' +
        '<button class="btn btn-ghost btn-sm" id="waOwnerTest" type="button">Send me today\'s summary now</button></div>') +
      tick('waAutoFeedback', w.autoFeedback === true, 'Feedback &amp; Google review request', 'A day after a fully-paid report, the patient is thanked and asked how the visit was. Each patient is asked at most once a month.',
        '<label class="label" for="waReviewUrl" style="margin-bottom:3px">Google review link <span class="muted" style="font-weight:400">(optional)</span></label><input class="input" id="waReviewUrl" placeholder="https://g.page/r/..." value="' + App.esc(w.googleReviewUrl || '') + '">') +
      tick('waAutoRetest', w.autoRetest === true, 'Repeat-test reminder', 'Patients are reminded a few days before a test is due again (e.g. HbA1c after 3 months). Set the days on each test, or use the button.',
        '<button class="btn btn-ghost btn-sm" id="waRetestFill" type="button">Set common repeat days on my tests</button> <span class="muted" id="waRetestMsg" style="font-size:12.5px"></span>') +
      '<div style="margin-top:12px;display:flex;align-items:center;gap:10px"><button class="btn btn-primary" id="waAutoSave">Save automatic messages</button><span class="muted" style="font-size:12.5px">Times are in Pakistan time.</span></div>' +
      '</div></div>';
    document.getElementById('setBody').innerHTML = '<div id="waGwBox"></div>' + html;
    wireGateway();
    function autoPatch() {
      var st = DB.get('settings', 'main') || {}, ww = Object.assign(waDefaults(), st.whatsapp || {});
      var g = function (id) { return document.getElementById(id); };
      ww.autoReceipt = g('waAutoReceipt').checked; ww.autoDueReminder = g('waAutoDue').checked; ww.dueReminderDay = +g('waDueDay').value;
      ww.autoOwnerSummary = g('waAutoOwner').checked; ww.ownerSummaryHour = +g('waOwnerHour').value; ww.ownerNumber = g('waOwnerNum').value.trim();
      ww.autoFeedback = g('waAutoFeedback').checked; ww.googleReviewUrl = g('waReviewUrl').value.trim(); ww.autoRetest = g('waAutoRetest').checked;
      if (ww.googleReviewUrl && !/^https:\/\//i.test(ww.googleReviewUrl)) { App.toast('Google review link must start with https://'); return false; }
      st.whatsapp = ww; DB.update('settings', 'main', st); return true;
    }
    document.getElementById('waAutoSave').addEventListener('click', function () { if (autoPatch()) App.toast('Automatic messages saved'); });
    ['waAutoReceipt', 'waAutoDue', 'waAutoOwner', 'waAutoFeedback', 'waAutoRetest'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        if (autoPatch()) App.toast((this.checked ? 'Switched ON' : 'Switched OFF') + ' — saved');
      });
    });
    document.getElementById('waOwnerTest').addEventListener('click', function () {
      var b = this; if (!autoPatch()) return; b.disabled = true;
      DB.waGw('POST', 'auto/test', {}).then(function () { b.disabled = false; App.toast('Summary sent to the owner number'); }, function (e) { b.disabled = false; App.toast(e && e.message ? e.message : 'Could not send — is WhatsApp connected?'); });
    });
    document.getElementById('waRetestFill').addEventListener('click', function () {
      var rules = [[/hba1c|glycosylated|glycated/i, 90], [/lipid|cholesterol/i, 180], [/tsh|thyroid|\bt3\b|\bt4\b/i, 180], [/vitamin\s*d|25.?oh/i, 180], [/vitamin\s*b.?12|b12/i, 180], [/ferritin|iron/i, 180], [/\bhb\b|cbc|complete blood/i, 0], [/creatinine|urea|kft|rft|renal/i, 180], [/lft|liver|alt|sgpt/i, 180], [/psa/i, 365]];
      var n = 0;
      DB.all('tests').forEach(function (t) {
        if (+t.retestDays > 0 || t.isPackage) return;
        for (var i = 0; i < rules.length; i++) if (rules[i][1] && rules[i][0].test(t.name || '')) { DB.update('tests', t.id, Object.assign({}, t, { retestDays: rules[i][1] })); n++; break; }
      });
      document.getElementById('waRetestMsg').textContent = n ? n + ' test(s) updated (HbA1c 3 months; lipid, thyroid, vitamin D/B12, kidney, liver 6 months).' : 'Nothing to change — matching tests already have repeat days.';
    });
    document.getElementById('waLabNumSave').addEventListener('click', function () {
      var num = document.getElementById('waLabNum').value.trim();
      var st = DB.get('settings', 'main') || {};
      var ww = Object.assign(waDefaults(), st.whatsapp || {});
      ww.labNumber = num;
      ww.autoPatient = document.getElementById('waAutoPatient').checked;
      ww.autoDoctor = document.getElementById('waAutoDoctor').checked;
      ww.autoCritical = document.getElementById('waAutoCritical').checked;
      st.whatsapp = ww;
      DB.update('settings', 'main', st);
      App.toast('WhatsApp settings saved');
      renderSetWhatsapp();
    });
  }


  /* ---- Dropdown Lists: the admin edits the choices that appear in forms ---- */
  function renderSetLists() {
    var st = DB.get('settings', 'main') || {}, work = {};
    App.LIST_DEFS.forEach(function (d) { work[d.key] = App.listOptions(d.key).slice(); });
    function cardHtml(d) {
      var rows = work[d.key].map(function (v, i) {
        var lock = (d.locked || []).indexOf(v) >= 0;
        return '<div class="dl-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input class="input dl-in" data-k="' + d.key + '" data-i="' + i + '" value="' + App.esc(v) + '"' + (lock ? ' disabled' : '') + ' maxlength="60" style="flex:1;min-width:0">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-up="' + d.key + ':' + i + '" title="Move up"' + (i === 0 || lock ? ' disabled' : '') + '>&uarr;</button><button type="button" class="btn btn-ghost btn-sm" data-down="' + d.key + ':' + i + '" title="Move down"' + (i === work[d.key].length - 1 || lock ? ' disabled' : '') + '>&darr;</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-del="' + d.key + ':' + i + '" title="Remove"' + (lock ? ' disabled' : '') + ' style="color:#b91c1c">&times;</button></div>';
      }).join('');
      return '<div class="card" style="margin:0" data-card="' + d.key + '"><div class="card-h"><h3>' + App.esc(d.label) + '</h3></div><div class="card-b"><p class="muted" style="font-size:12.5px;margin:0 0 10px">' + App.esc(d.hint) + '</p>' + (rows || '<p class="muted" style="font-size:13px;margin:0 0 8px">Empty. Add the first one below.</p>') +
        '<div style="display:flex;gap:6px;margin-top:8px"><input class="input dl-new" data-k="' + d.key + '" placeholder="Add a new one…" maxlength="60" style="flex:1;min-width:0"><button type="button" class="btn btn-ghost btn-sm" data-add="' + d.key + '">+ Add</button></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn btn-primary btn-sm" data-save="' + d.key + '">Save</button><button type="button" class="btn btn-ghost btn-sm" data-reset="' + d.key + '">Reset to default</button></div></div></div>';
    }
    function doctorsHtml() {
      var docs = DB.all('doctors').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      return '<div class="card" style="margin:0"><div class="card-h"><h3>Consultant (doctors)</h3></div><div class="card-b"><p class="muted" style="font-size:12.5px;margin:0 0 10px">The doctors in the "Consultant" menu. Rename one here, or add a new one. Commission, clinic and statements are in the full <a href="#/doctors">Doctors page</a>.</p>' +
        docs.map(function (d) { return '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input class="input dl-doc" data-id="' + App.esc(d.id) + '" value="' + App.esc(d.name || '') + '" maxlength="80" style="flex:1;min-width:0"><button type="button" class="btn btn-ghost btn-sm" data-docsave="' + App.esc(d.id) + '">Save name</button></div>'; }).join('') +
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><input class="input" id="dlDocNew" placeholder="New doctor name…" maxlength="80" style="flex:1;min-width:160px"><input class="input" id="dlDocPct" type="number" min="0" max="100" step="0.5" placeholder="Commission %" style="width:130px"><button type="button" class="btn btn-ghost btn-sm" id="dlDocAdd">+ Add doctor</button></div></div></div>';
    }
    function paint() {
      var keep = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-k') + '|' + (document.activeElement.getAttribute('data-i') || 'new') : '';
      document.getElementById('setBody').innerHTML = '<p class="muted" style="margin:0 0 14px;font-size:13.5px">The choices that appear in your forms. Change a name, add a new choice, remove one or move it up/down, then press <b>Save</b> on that list. Records already saved keep what they had.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;align-items:start">' + doctorsHtml() + App.LIST_DEFS.map(cardHtml).join('') + '</div>';
      wire();
    }
    function readInputs() { document.querySelectorAll('.dl-in').forEach(function (e) { var k = e.getAttribute('data-k'), i = +e.getAttribute('data-i'); if (work[k] && work[k][i] != null && !e.disabled) work[k][i] = e.value; }); }
    function wire() {
      var b = document.getElementById('setBody');
      b.querySelectorAll('[data-add]').forEach(function (x) { x.addEventListener('click', function () { var k = x.getAttribute('data-add'), inp = b.querySelector('.dl-new[data-k="' + k + '"]'), v = inp.value.trim(); if (!v) return; readInputs(); if (work[k].some(function (y) { return y.toLowerCase() === v.toLowerCase(); })) return App.toast('That is already in the list.', 'err'); work[k].push(v); paint(); }); });
      b.querySelectorAll('.dl-new').forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); b.querySelector('[data-add="' + inp.getAttribute('data-k') + '"]').click(); } }); });
      function move(attr, delta) { b.querySelectorAll('[' + attr + ']').forEach(function (x) { x.addEventListener('click', function () { var p2 = x.getAttribute(attr).split(':'), k = p2[0], i = +p2[1], j = i + delta; readInputs(); if (j < 0 || j >= work[k].length) return; var t = work[k][i]; work[k][i] = work[k][j]; work[k][j] = t; paint(); }); }); }
      move('data-up', -1); move('data-down', 1);
      b.querySelectorAll('[data-del]').forEach(function (x) { x.addEventListener('click', function () { var p2 = x.getAttribute('data-del').split(':'); readInputs(); work[p2[0]].splice(+p2[1], 1); paint(); }); });
      b.querySelectorAll('[data-save]').forEach(function (x) { x.addEventListener('click', function () {
        var k = x.getAttribute('data-save'); readInputs(); var out = [], seen = {};
        work[k].forEach(function (v) { v = String(v).trim(); if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); } });
        if (k === 'paymentMethod' && !seen['cash']) out.unshift('Cash');
        if (!out.length && k !== 'regLocation' && k !== 'destLocation') return App.toast('Keep at least one choice in this list.', 'err');
        var cur = DB.get('settings', 'main') || {}, fl = Object.assign({}, cur.formLists || {}); fl[k] = out; DB.update('settings', 'main', Object.assign({}, cur, { formLists: fl })); work[k] = out.slice(); App.toast('Saved.'); paint();
      }); });
      b.querySelectorAll('[data-reset]').forEach(function (x) { x.addEventListener('click', function () {
        var k = x.getAttribute('data-reset'); App.confirm('Put this list back to the original choices?').then(function (ok) { if (!ok) return; var cur = DB.get('settings', 'main') || {}, fl = Object.assign({}, cur.formLists || {}); delete fl[k]; DB.update('settings', 'main', Object.assign({}, cur, { formLists: fl })); work[k] = App.listOptions(k).slice(); App.toast('Back to the original list.'); paint(); });
      }); });
      b.querySelectorAll('[data-docsave]').forEach(function (x) { x.addEventListener('click', function () { var id = x.getAttribute('data-docsave'), v = b.querySelector('.dl-doc[data-id="' + id + '"]').value.trim(); if (!v) return App.toast('A doctor needs a name.', 'err'); DB.update('doctors', id, { name: v }); App.toast('Name saved.'); }); });
      var da = document.getElementById('dlDocAdd'); if (da) da.addEventListener('click', function () {
        var n = document.getElementById('dlDocNew').value.trim(), c = parseFloat(document.getElementById('dlDocPct').value); if (!n) return App.toast('Type the doctor name.', 'err');
        if (DB.all('doctors').some(function (d) { return String(d.name).toLowerCase() === n.toLowerCase(); })) return App.toast('This doctor already exists.', 'err');
        DB.insert('doctors', { name: n, clinic: '', phone: '', whatsapp: '', email: '', commissionPct: isNaN(c) ? 0 : Math.min(100, Math.max(0, c)) }); App.toast('Doctor added.'); paint();
      });
    }
    paint();
  }

  /* ---- Users (admin only) ---- */
  function roleBadge(r, u) {
    if (r === 'custom') { var d = (((DB.get('settings', 'main') || {}).customRoles) || []).filter(function (x) { return u && x.id === u.roleId; })[0]; return '<span class="badge b-ready">' + App.esc(d ? d.name : 'custom (missing)') + '</span>'; }
    var cls = r === 'admin' ? 'b-paid' : (r === 'reception' ? 'b-ready' : (r === 'doctor' ? 'b-pending' : 'b-partial'));
    return '<span class="badge ' + cls + '">' + App.esc(r) + '</span>';
  }

  function renderSetUsers() {
    var users = DB.all('users').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var me = sess();
    var html = '<div class="toolbar" style="margin-bottom:12px">'
      + '<button class="btn btn-ghost btn-sm" id="uAddDoc" style="margin-left:auto">+ Doctor login</button> <button class="btn btn-primary btn-sm" id="uAdd">+ Add User</button></div>'
      + '<div class="tbl-wrap"><table class="table"><thead><tr>'
      + '<th>Name</th><th>Username</th><th>Role</th><th>Status</th><th style="text-align:right">Actions</th>'
      + '</tr></thead><tbody>';
    users.forEach(function (u) {
      var isMe = me && u.id === me.userId;
      html += '<tr>'
        + '<td><strong>' + App.esc(u.name) + '</strong>' + (isMe ? ' <span class="badge b-ready">you</span>' : '') + '</td>'
        + '<td>' + App.esc(u.username) + '</td>'
        + '<td>' + roleBadge(u.role, u) + (u.role === 'doctor' ? '<div class="muted" style="font-size:12px;margin-top:3px">' + App.esc(((DB.get('doctors', u.doctorId) || {}).name) || 'no doctor linked') + '</div>' : '') + '</td>'
        + '<td>' + (u.active ? '<span class="badge b-paid">active</span>' : '<span class="badge b-unpaid">inactive</span>') + '</td>'
        + '<td style="text-align:right;white-space:nowrap" class="actions">'
        + '<button class="btn btn-ghost btn-sm" data-uedit="' + App.esc(u.id) + '">Edit</button> '
        + '<button class="btn btn-ghost btn-sm" data-upw="' + App.esc(u.id) + '">Password</button> '
        + '<button class="btn btn-ghost btn-sm" data-utoggle="' + App.esc(u.id) + '"' + (isMe ? ' disabled style="opacity:.4"' : '') + '>'
        + (u.active ? 'Deactivate' : 'Activate') + '</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:16px">'
      + [['admin', 'Admin', 'Everything: settings, users, reports, backup, billing.'], ['reception', 'Reception', 'Patients, invoices, dues, expenses, doctors, WhatsApp and email.'], ['technician', 'Technician', 'Samples, lab results, stock and tests. No billing.'], ['doctor', 'Doctor', 'Own login: sees only the reports of the patients he referred and his commission. Cannot see anything else.']]
        .map(function (r) { return '<div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px"><div>' + roleBadge(r[0]) + '</div><div class="muted" style="font-size:12.5px;margin-top:6px;line-height:1.5">' + r[2] + '</div></div>'; }).join('')
      + '</div>'
      + customRolesHtml()
      + '<p class="muted" style="font-size:12.5px;margin-top:10px">A <strong>doctor login</strong> does not use up one of your staff seats. Create it with <b>+ Doctor login</b>, then give the doctor your <b>Lab ID</b>, his username and password. He signs in on the normal sign-in page (web or Android app).</p>';
    document.getElementById('setBody').innerHTML = html;

    document.getElementById('crNew').addEventListener('click', function () { openRoleModal(null); });
    document.querySelectorAll('[data-cr-edit]').forEach(function (b) { b.addEventListener('click', function () { openRoleModal(b.getAttribute('data-cr-edit')); }); });
    document.querySelectorAll('[data-cr-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-cr-del'), r = getRoles().filter(function (x) { return x.id === id; })[0]; if (!r) return;
        var used = DB.all('users').filter(function (u) { return u.role === 'custom' && u.roleId === id; });
        if (used.length) return App.toast(used.length + ' user(s) still have this role. Change their role first.', 'err');
        App.confirm('Delete the role "' + r.name + '"?').then(function (ok) { if (!ok) return; saveRoles(getRoles().filter(function (x) { return x.id !== id; })); App.toast('Role deleted.'); renderSettings(); });
      });
    });
    document.getElementById('uAdd').addEventListener('click', function () { openUserModal(null); });
    document.getElementById('uAddDoc').addEventListener('click', function () { openUserModal(null, 'doctor'); });
    document.querySelectorAll('[data-uedit]').forEach(function (b) {
      b.addEventListener('click', function () { openUserModal(DB.get('users', b.getAttribute('data-uedit'))); });
    });
    document.querySelectorAll('[data-upw]').forEach(function (b) {
      b.addEventListener('click', function () { openPasswordModal(DB.get('users', b.getAttribute('data-upw'))); });
    });
    document.querySelectorAll('[data-utoggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = DB.get('users', b.getAttribute('data-utoggle'));
        if (!u) return;
        var me2 = sess();
        if (me2 && u.id === me2.userId) return App.toast('You cannot deactivate your own account.', 'err');
        if (u.active && u.role === 'admin') {
          var admins = DB.all('users').filter(function (x) { return x.active && x.role === 'admin' && x.id !== u.id; });
          if (!admins.length) return App.toast('Cannot deactivate the last active admin.', 'err');
        }
        var action = u.active ? 'deactivate' : 'activate';
        App.confirm((u.active ? 'Deactivate' : 'Activate') + ' user "' + u.name + '"?').then(function (ok) {
          if (!ok) return;
          DB.update('users', u.id, { active: !u.active });
          App.toast('User ' + action + 'd.');
          renderSettings();
        });
      });
    });
  }

  /* ---- custom roles: the admin ticks which pages a role may open (saved in settings.customRoles) ---- */
  function getRoles() { return ((DB.get('settings', 'main') || {}).customRoles || []).slice(); }
  function saveRoles(list) { var st = DB.get('settings', 'main') || {}; st.customRoles = list; DB.update('settings', 'main', st); }
  function customRolesHtml() {
    var roles = getRoles(), pages = {}; App.ROLE_PAGES.forEach(function (p) { pages[p[0]] = p[1]; });
    return '<div style="margin-top:22px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0;font-size:16px">Your own roles</h3><span class="muted" style="font-size:13px">Decide yourself who can see what.</span>'
      + '<button class="btn btn-primary btn-sm" id="crNew" style="margin-left:auto">+ New role</button></div>'
      + (roles.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:12px">' + roles.map(function (r) {
        var n = DB.all('users').filter(function (u) { return u.role === 'custom' && u.roleId === r.id; }).length;
        return '<div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px"><div style="display:flex;align-items:center;gap:8px"><span class="badge b-ready">' + App.esc(r.name) + '</span><span class="muted" style="font-size:12px">' + n + ' user' + (n === 1 ? '' : 's') + '</span>'
          + '<span style="margin-left:auto"><button class="btn btn-ghost btn-sm" data-cr-edit="' + App.esc(r.id) + '">Edit</button> <button class="btn btn-ghost btn-sm" data-cr-del="' + App.esc(r.id) + '" style="color:#b91c1c">Delete</button></span></div>'
          + '<div class="muted" style="font-size:12.5px;margin-top:8px;line-height:1.55">' + ((r.pages || []).map(function (k) { return pages[k] || k; }).join(', ') || 'No pages ticked') + '</div>'
          + '<div class="muted" style="font-size:12px;margin-top:6px">' + (r.money === false ? 'Money totals are hidden.' : 'Can see money totals.') + '</div></div>';
      }).join('') + '</div>' : '<p class="muted" style="font-size:13px;margin:10px 0 0">No custom roles yet. Example: <b>Front desk</b> (patients and invoices only) or <b>Phlebotomist</b> (samples only). Create one, then choose it when you add a user.</p>')
      + '</div>';
  }
  function openRoleModal(id) {
    var r = id ? getRoles().filter(function (x) { return x.id === id; })[0] : null;
    r = r || { id: '', name: '', pages: ['dashboard', 'patients'], money: true };
    var body = '<div><label class="label">Role name *</label><input class="input" id="crName" maxlength="40" placeholder="e.g. Front desk" value="' + App.esc(r.name) + '"></div>'
      + '<div style="margin-top:12px"><label class="label">This role can open</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px 14px">'
      + App.ROLE_PAGES.map(function (p) { return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px"><input type="checkbox" class="crPg" value="' + p[0] + '"' + ((r.pages || []).indexOf(p[0]) >= 0 ? ' checked' : '') + ' style="width:17px;height:17px;accent-color:var(--green)"> ' + p[1] + '</label>'; }).join('') + '</div></div>'
      + '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px"><label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:14px"><input type="checkbox" id="crMoney"' + (r.money === false ? '' : ' checked') + ' style="width:17px;height:17px;margin-top:2px;accent-color:var(--green)"> <span><b>Can see money totals</b><span class="muted" style="display:block;font-size:12.5px">Untick to show counts instead of money amounts on the dashboard and the summary cards (like a technician).</span></span></label></div>'
      + '<p class="muted" style="font-size:12.5px;margin:12px 0 0">Settings, Users &amp; Roles, Audit log and Subscription always stay for the admin only. A role cannot change data in a page it has not been given, even if someone tries.</p>'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn btn-ghost" id="crCancel">Cancel</button><button class="btn btn-primary" id="crSave">' + (id ? 'Save role' : 'Create role') + '</button></div>';
    App.modal(id ? 'Edit role' : 'New role', body, { wide: true, onOpen: function (ov, close) {
      document.getElementById('crCancel').addEventListener('click', close);
      document.getElementById('crSave').addEventListener('click', function () {
        var name = document.getElementById('crName').value.trim();
        if (!name) return App.toast('Give the role a name.', 'err');
        var list = getRoles();
        if (list.some(function (x) { return x.id !== id && x.name.toLowerCase() === name.toLowerCase(); }) || ['admin', 'reception', 'technician', 'doctor'].indexOf(name.toLowerCase()) >= 0) return App.toast('A role with this name already exists.', 'err');
        var pages = Array.prototype.map.call(document.querySelectorAll('.crPg:checked'), function (c) { return c.value; });
        if (!pages.length) return App.toast('Tick at least one page.', 'err');
        var rec = { id: id || 'R-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name, pages: pages, money: document.getElementById('crMoney').checked };
        if (id) list = list.map(function (x) { return x.id === id ? rec : x; }); else list.push(rec);
        saveRoles(list); App.toast(id ? 'Role saved.' : 'Role created. Choose it when you add a user.'); close(); renderSettings();
      });
    } });
  }

  function openUserModal(u, presetRole) {
    var isEdit = !!u;
    u = u || { name: '', username: '', role: presetRole || 'reception', active: true };
    var allDocs = DB.all('doctors').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var body = '<div class="form-grid">'
      + '<div><label class="label">Full Name *</label><input class="input" id="ufName" value="' + App.esc(u.name) + '"></div>'
      + '<div><label class="label">Username *</label><input class="input" id="ufUser" value="' + App.esc(u.username) + '"' + (isEdit ? ' disabled' : '') + '></div>'
      + (isEdit ? '' : '<div><label class="label">Password *</label><input class="input" id="ufPass" type="password" placeholder="min 4 characters"></div>')
      + '<div><label class="label">Role *</label><select class="select" id="ufRole">'
      + ['admin', 'reception', 'technician', 'doctor'].map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('')
      + getRoles().map(function (r) { return '<option value="c:' + App.esc(r.id) + '"' + (u.role === 'custom' && u.roleId === r.id ? ' selected' : '') + '>' + App.esc(r.name) + ' (your role)</option>'; }).join('')
      + '</select></div>'
      + '<div id="ufDocBox" style="' + (u.role === 'doctor' ? '' : 'display:none') + '"><label class="label">Which doctor? *</label><select class="select" id="ufDoc"><option value="">— choose —</option>'
      + allDocs.map(function (d) { return '<option value="' + App.esc(d.id) + '"' + (u.doctorId === d.id ? ' selected' : '') + '>' + App.esc(d.name) + (d.clinic ? ' — ' + App.esc(d.clinic) : '') + '</option>'; }).join('')
      + '</select></div>'
      + '</div>'
      + '<p class="muted" id="ufRoleNote" style="font-size:12.5px;margin:10px 0 0"></p>'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'
      + '<button class="btn btn-ghost" id="ufCancel">Cancel</button>'
      + '<button class="btn btn-primary" id="ufSave">' + (isEdit ? 'Save Changes' : 'Add User') + '</button></div>';
    var close = App.modal(isEdit ? 'Edit User' : 'Add User', body, {
      onOpen: function (ov, close) {
        document.getElementById('ufCancel').addEventListener('click', close);
        var roleNote = { custom: 'Sees only the pages ticked in this role (set under Your own roles).', admin: 'Full access to everything in the lab.', reception: 'Patients, billing, invoices, dues, doctors, WhatsApp and email. No settings.', technician: 'Samples, lab results, stock and tests. No billing.', doctor: 'Signs in with this username and password and sees ONLY his own dashboard: reports of the patients he referred and his commission. Nothing else.' };
        function syncRole() {
          var rv = document.getElementById('ufRole').value; document.getElementById('ufDocBox').style.display = rv === 'doctor' ? '' : 'none';
          document.getElementById('ufRoleNote').textContent = roleNote[rv.indexOf('c:') === 0 ? 'custom' : rv] || '';
        }
        document.getElementById('ufRole').addEventListener('change', syncRole);
        document.getElementById('ufDoc').addEventListener('change', function () { var d = DB.get('doctors', this.value), n = document.getElementById('ufName'); if (d && !n.value.trim()) n.value = d.name; });
        syncRole();
        document.getElementById('ufSave').addEventListener('click', function () {
          var name = document.getElementById('ufName').value.trim();
          var username = document.getElementById('ufUser').value.trim().toLowerCase();
          var roleV = document.getElementById('ufRole').value, docId = document.getElementById('ufDoc').value, roleId = null;
          if (roleV.indexOf('c:') === 0) { roleId = roleV.slice(2); roleV = 'custom'; }
          if (!name) return App.toast('Name is required.', 'err');
          if (!username) return App.toast('Username is required.', 'err');
          if (roleV === 'doctor' && !docId) return App.toast('Choose which doctor this login is for.', 'err');
          if (isEdit) {
            DB.update('users', u.id, roleV === 'doctor' ? { name: name, role: roleV, doctorId: docId, roleId: null } : { name: name, role: roleV, doctorId: null, roleId: roleId });
            App.toast('User updated.');
          } else {
            var pass = document.getElementById('ufPass').value;
            if (pass.length < 6 && roleV === 'doctor') return App.toast('Give the doctor a password of at least 6 characters.', 'err');
            if (pass.length < 4) return App.toast('Password must be at least 4 characters.', 'err');
            var dup = DB.all('users').some(function (x) { return x.username.toLowerCase() === username; });
            if (dup) return App.toast('Username already exists.', 'err');
            if (roleV !== 'doctor' && App.limitHit && App.limitHit('users')) return;
            var rec = { name: name, username: username, password: pass, role: roleV, active: true }; if (roleV === 'doctor') rec.doctorId = docId; if (roleV === 'custom') rec.roleId = roleId;
            DB.insert('users', rec);
            App.toast(roleV === 'doctor' ? 'Doctor login created. Give him the Lab ID, this username and the password.' : 'User added.');
          }
          close();
          renderSettings();
        });
      }
    });
  }

  function openPasswordModal(u) {
    var body = '<p class="muted">Set a new password for <strong>' + App.esc(u.name) + '</strong> (' + App.esc(u.username) + ').</p>'
      + '<label class="label">New Password *</label><input class="input" id="pwNew" type="password" placeholder="min 4 characters">'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'
      + '<button class="btn btn-ghost" id="pwCancel">Cancel</button>'
      + '<button class="btn btn-primary" id="pwSave">Set Password</button></div>';
    var close = App.modal('Reset Password', body, {
      onOpen: function (ov, close) {
        document.getElementById('pwCancel').addEventListener('click', close);
        document.getElementById('pwSave').addEventListener('click', function () {
          var p = document.getElementById('pwNew').value;
          if (p.length < 4) return App.toast('Password must be at least 4 characters.', 'err');
          DB.update('users', u.id, { password: p });
          App.toast('Password updated.');
          close();
        });
      }
    });
  }

  /* ---- Backup ---- */
  function renderSetBackup() {
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:860px" class="rep-cols">'
      + '<div class="card" style="margin:0"><div class="card-b">'
      + '<h3 style="margin-top:0">Export Backup</h3>'
      + '<p class="muted">Download the complete database (patients, invoices, tests, users, settings) as a JSON file. Keep it safe.</p>'
      + '<button class="btn btn-primary" id="bkExport">Download Backup</button>'
      + '</div></div>'
      + '<div class="card" style="margin:0"><div class="card-b">'
      + '<h3 style="margin-top:0">Import Backup</h3>'
      + '<p class="muted">Restore from a previously exported JSON file. This replaces all current data.</p>'
      + '<input type="file" id="bkFile" accept="application/json" style="display:none">'
      + '<button class="btn btn-ghost" id="bkImport">Choose File & Restore</button>'
      + '</div></div></div>';
    document.getElementById('setBody').innerHTML = html;

    document.getElementById('bkExport').addEventListener('click', function () {
      var raw = DB.export(); /* JSON string */
      var pretty = raw;
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) {}
      var blob = new Blob([pretty], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'optix-lab-medsync-backup-' + App.today() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      App.toast('Backup downloaded.');
    });
    document.getElementById('bkImport').addEventListener('click', function () {
      document.getElementById('bkFile').click();
    });
    document.getElementById('bkFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var data;
        try { data = JSON.parse(rd.result); }
        catch (err) { return App.toast('Invalid backup file.', 'err'); }
        if (!data || typeof data !== 'object') return App.toast('Invalid backup file.', 'err');
        var chk = (data.tables && typeof data.tables === 'object') ? data.tables : data;
        if (!chk.settings || !Array.isArray(chk.invoices) || !Array.isArray(chk.patients))
          return App.toast('This file is not an Optix Medical Sync backup.', 'err');
        App.confirm('Restore backup? ALL current data will be replaced.').then(function (ok) {
          if (!ok) return;
          Promise.resolve(DB.import(data)).then(function () {
            App.toast('Backup restored. Reloading...');
            setTimeout(function () { location.reload(); }, 800);
          }, function (err) {
            App.toast('Restore failed: ' + (err && err.message ? err.message : err), 'err');
          });
        });
      };
      rd.readAsText(f);
      e.target.value = '';
    });
  }

  /* ---- Danger Zone ---- */
  function renderSetDanger() {
    if (App.saasOn && App.saasOn()) { /* cloud labs cannot reset to the shipped demo data; a backup restore is the supported way */
      document.getElementById('setBody').innerHTML = '<div class="card" style="max-width:720px;margin:0"><div class="card-b"><h3 style="margin-top:0">Reset is not available</h3><p class="muted">Cloud labs cannot be reset to demo data. To go back to an earlier state, restore a backup file from <strong>Settings &rarr; Backup</strong>.</p></div></div>';
      return;
    }
    var html = '<div class="card" style="border:1px solid var(--red);max-width:720px;margin:0"><div class="card-b">'
      + '<h3 style="margin-top:0;color:var(--red)">Reset Demo Data</h3>'
      + '<p class="muted">This wipes <strong>everything</strong> — patients, invoices, payments, expenses, results — and restores the original demo dataset. Your user accounts are kept. You will be logged out.</p>'
      + '<button class="btn btn-danger" id="dzReset">Reset All Data</button>'
      + '</div></div>';
    document.getElementById('setBody').innerHTML = html;
    document.getElementById('dzReset').addEventListener('click', function () {
      App.confirm('Reset ALL data to demo defaults? This cannot be undone.').then(function (ok1) {
        if (!ok1) return;
        App.confirm('Final confirmation: wipe everything and reseed demo data?').then(function (ok2) {
          if (!ok2) return;
          Promise.resolve(DB.reset()).then(function () {
            try { localStorage.removeItem('labpos_session'); } catch (e) {}
            App.toast('Data reset. Redirecting to login...');
            setTimeout(function () { location.hash = '#/login'; location.reload(); }, 800);
          }, function (err) {
            App.toast('Reset failed: ' + (err && err.message ? err.message : err), 'err');
          });
        });
      });
    });
  }

  var SET_TABS = ['profile', 'account', 'templates', 'whatsapp', 'sharing', 'portal', 'users', 'backup', 'danger'];
  /* Dropdown Lists live under Patients now (#/patients/lists); the old Settings address still works */
  App.route('#/patients/lists', function () {
    if (role() !== 'admin') return denied();
    document.getElementById('view').innerHTML = '<div class="page-head"><div><h1>Edit Patient Form</h1><p class="muted" style="margin:2px 0 0">The choices (dropdown menus) in your patient and bill forms: registration and destination location, reference, blood group, referred-by doctors and more.</p></div></div><div class="card"><div class="card-b"><div id="setBody"></div></div></div>';
    renderSetLists();
  });
  App.route('#/settings/lists', function () { App.nav('#/patients/lists'); });
  App.route('#/settings', function () { settingsTab = 'profile'; renderSettings(); });
  App.route('#/settings/:tab', function (p) { settingsTab = (p && SET_TABS.indexOf(p.tab) >= 0) ? p.tab : 'profile'; renderSettings(); });

})();
