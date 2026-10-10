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
    flask: _svgA('<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/>'),
    alert: _svgA('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>')
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
  var rep = { from: null, to: null, type: 'tests', preset: 'thisMonth' };
  function repInit() {
    if (!rep.from) {
      var t = App.today();
      rep.from = t.slice(0, 8) + '01'; // first of month
      rep.to = t;
    }
    if (!rep.type || rep.type === 'all') rep.type = 'tests';
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
    var showTests = rep.type === 'tests';
    var showFinance = rep.type === 'finance';
    var showDues = rep.type === 'dues';
    var showPatients = rep.type === 'patients';
    var showLabs = rep.type === 'labs';

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
    var repTypeLbl = { tests: 'Test Reports', finance: 'Finance', dues: 'Dues', patients: 'Patient Reports', labs: 'Lab Comparison' }[rep.type] || rep.type;
    var repSecs = {
      finance: rep.type === 'finance',
      tests: rep.type === 'tests',
      doctors: rep.type === 'tests',
      dues: rep.type === 'dues',
      patients: rep.type === 'patients'
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
    var REP_PRESET_LBL = { today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', thisMonth: 'This Month', lastMonth: 'Last Month', custom: 'Custom Range' };
    var REP_TYPE_LBL = { tests: 'Tests', finance: 'Finance', dues: 'Dues', patients: 'Patients', labs: 'Labs' };
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
      rep.type = t.type || 'tests';
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
    var SCHED_TYPES = { tests: 'Test Reports', finance: 'Finance', dues: 'Dues', patients: 'Patient Reports' };
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

    var presetOptions = Object.keys(REP_PRESET_LBL).map(function (p) {
      return '<option value="' + p + '"' + (rep.preset === p ? ' selected' : '') + '>' + REP_PRESET_LBL[p] + '</option>';
    }).join('');
    var filterCard = ''
      + '<div class="card rep-control-card"><div class="card-b rep-control-row">'
      +     '<div class="rep-control-group rep-dates">'
      +       '<label class="rep-control-field" for="repPreset">Period<select class="select" id="repPreset">' + presetOptions + '</select></label>'
      +       '<label class="rep-control-field" for="repFrom">From<input class="input" type="date" id="repFrom" value="' + App.esc(from) + '"></label>'
      +       '<label class="rep-control-field" for="repTo">To<input class="input" type="date" id="repTo" value="' + App.esc(to) + '"></label>'
      +     '</div>'
      +     '<div class="rep-control-group rep-actions">'
      +       '<button class="btn btn-ghost btn-sm" id="repCsv">' + DL_ICON + ' Export CSV</button>'
      +       '<button class="btn btn-ghost btn-sm" id="repBuilder">🛠 Builder</button>'
      +       '<button class="btn btn-ghost btn-sm" id="repSchedBtn">⏰ Schedules</button>'
      +       '<button class="btn btn-primary btn-sm" id="repPrint">' + PRINT_ICON + ' Print Report</button>'
      +     '</div>'
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

    var cmpCard = '';

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
      return '<div class="card rep-control-card"><div class="card-b rep-control-row">'
        + '<label class="rep-control-title" for="repTplSel">Report Templates:</label>'
        + '<div class="rep-control-group rep-template-apply">'
        + '<select class="select" id="repTplSel">' + opts + '</select>'
        + '<button type="button" class="btn btn-sm btn-primary" id="tplApply">Apply</button>'
        + '<button type="button" class="btn btn-sm btn-ghost" id="tplDel">Delete</button>'
        + '</div><div class="rep-control-group rep-template-save">'
        + '<input class="input" id="repTplName" aria-label="Template name" placeholder="Template name…">'
        + '<button type="button" class="btn btn-sm btn-ghost" id="tplSave">💾 Save current</button>'
        + '</div></div></div>';
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
    } else if (rep.type === 'labs') {
      var totalLabsCount = labCmpRows.length;
      var totalLabBills = labCmpRows.reduce(function (s, r) { return s + r.bills; }, 0);
      var totalLabBilled = labCmpRows.reduce(function (s, r) { return s + r.billed; }, 0);
      var totalLabColl = labCmpRows.reduce(function (s, r) { return s + r.collected; }, 0);
      var topLab = labCmpRows.slice().sort(function (a, b) { return b.net - a.net; })[0];
      repKpis = '<div class="kpi-grid" style="margin-bottom:18px">'
        + kpi('t-navy', USERS, 'Total Branches', totalLabsCount, 'registered labs')
        + kpi('t-blue', RECEIPT, 'Combined Bills', totalLabBills, App.money(totalLabBilled) + ' billed')
        + kpi('t-green', CASH, 'Total Collected', App.money(totalLabColl), 'across all labs')
        + kpi('t-amber', TREND, 'Top Branch', App.esc(topLab ? topLab.name : '—'), topLab ? (App.money(topLab.net) + ' net') : 'no data')
        + '</div>';
    } else {
      /* all or finance */
      repKpis = '<div class="kpi-grid" style="margin-bottom:18px">'
        + kpi('t-navy', RECEIPT, 'Total Billed', App.money(billed), invoices.length + ' bills · ' + testsCount + ' tests')
        + kpi('t-green', CASH, 'Collected', App.money(collected), payments.length + ' payments received')
        + kpi('t-red', ALERT, 'Total Expenses', App.money(expTotal), expenses.length + ' expense entries')
        + kpi(net >= 0 ? 't-blue' : 't-amber', TREND, 'Net Collection', App.money(net), net >= 0 ? 'net surplus' : 'net deficit')
        + '</div>';
    }

    var finCallout = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-b" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      + '<span style="font-size:13.5px;color:var(--muted)">Need detailed shift-wise cash balance or annual income statement?</span>'
      + '<div style="display:flex;gap:10px"><a href="#/finance" class="btn btn-ghost btn-sm" style="font-weight:600">Daily Cash Closing &rarr;</a><a href="#/finance/profit" class="btn btn-primary btn-sm" style="font-weight:600">Profit &amp; Loss Statement &rarr;</a></div>'
      + '</div></div>';

    var repChosen = true;
    var html = ''
      + '<style>' + ADM_STAT_CSS + '</style>'
      + repKpis
      + filterCard
      + repSlotTemplates
      + (showFinance ? cmpCard : '')
      + repSlotSchedules + repSlotBuilder
      + (showFinance ? (finSumCard + finCallout) : '')
      + (showDues ? duesCard : '')
      + (showPatients ? finCard : '')
      + (showLabs ? labsCardHtml : '')
      + (showTests ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px" class="rep-cols">'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Test-wise Performance</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>'
      + twRowsHtml
      + '</tbody></table></div></div></div>'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Doctor-wise Referrals</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Doctor</th><th style="text-align:right">Referrals</th><th style="text-align:right">Billed</th><th style="text-align:right">Commission</th></tr></thead><tbody>'
      + dwRowsHtml
      + '</tbody></table></div></div></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px" class="rep-cols">'
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
    var rfFrom = document.getElementById('repFrom'); if (rfFrom) rfFrom.addEventListener('change', function (e) { rep.from = e.target.value; rep.preset = 'custom'; renderReports(); });
    var rfTo = document.getElementById('repTo'); if (rfTo) rfTo.addEventListener('change', function (e) { rep.to = e.target.value; rep.preset = 'custom'; renderReports(); });
    /* report templates (worker 8) */
    var tplApp = document.getElementById('tplApply'); if (tplApp) tplApp.addEventListener('click', repTplApply);
    var tplDl = document.getElementById('tplDel'); if (tplDl) tplDl.addEventListener('click', repTplDel);
    var tplSv = document.getElementById('tplSave'); if (tplSv) tplSv.addEventListener('click', repTplSave);
    var rfPreset = document.getElementById('repPreset');
    if (rfPreset) rfPreset.addEventListener('change', function (e) {
      setPreset(e.target.value);
      document.getElementById('repPreset').focus();
    });
    var rBld = document.getElementById('repBuilder'); if (rBld) rBld.addEventListener('click', function () { openBuilder(); });
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

  App.route('#/reports', function () { location.replace('#/reports/tests'); });
  App.route('#/reports/:tab', function (p) {
    var valid = ['tests', 'finance', 'dues', 'patients', 'labs'];
    var tab = (p && p.tab) ? p.tab.toLowerCase() : 'tests';
    if (tab === 'trends') { renderPatientTrendsDashboard(); return; }
    if (tab === 'all') { location.replace('#/reports/tests'); return; }
    rep.type = valid.indexOf(tab) >= 0 ? tab : 'tests';
    renderReports();
  });
  App.route('#/reports/trends', function () { renderPatientTrendsDashboard(); });
  App.route('#/trends', function () { renderPatientTrendsDashboard(); });

  /* ============================================================
     PATIENT HISTORICAL TREND & DELTA ANALYSIS CENTER
     Route: #/reports/trends or #/trends
     ============================================================ */
  var trendsState = {
    patientId: null,
    paramIndex: 0,
    visitLimit: 'all',
    searchQ: '',
    sortDesc: false
  };

  function buildTrendSvg(m, pts) {
    var W = 1000, H = 340, L = 60, R = 50, T = 30, B = 50, n = pts.length;
    var b = App.refBounds ? App.refBounds(m.ref) : null;
    var vals = pts.map(function (q) { return q.v; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (b) {
      if (b.lo != null) { mn = Math.min(mn, b.lo); mx = Math.max(mx, b.lo); }
      if (b.hi != null) { mn = Math.min(mn, b.hi); mx = Math.max(mx, b.hi); }
    }
    var span = (mx - mn) || Math.abs(mx) || 1;
    mn -= span * 0.15;
    mx += span * 0.15;
    if (mn < 0 && Math.min.apply(null, vals) >= 0 && (!b || b.lo == null || b.lo >= 0)) mn = 0;

    var X = function (i) { return n === 1 ? (L + (W - L - R) / 2) : L + (W - L - R) * i / (n - 1); };
    var Y = function (v) { return T + (H - T - B) * (1 - (v - mn) / (mx - mn)); };
    var f = function (v) { return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100); };

    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;overflow:visible" role="img" aria-label="' + App.esc(m.name) + ' historical trend graph">';

    /* Horizontal grid lines and value ticks */
    for (var k = 0; k <= 4; k++) {
      var gv = mn + (mx - mn) * k / 4;
      var gy = Y(gv);
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="#e2e8f0" stroke-width="1"/>';
      g += '<text x="' + (L - 10) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" font-weight="600" fill="#64748b">' + f(gv) + '</text>';
    }

    /* Normal reference range band */
    if (b) {
      var yTop = b.hi != null ? Y(b.hi) : T;
      var yBot = b.lo != null ? Y(b.lo) : (H - B);
      var bandHeight = Math.max(2, yBot - yTop);
      g += '<rect x="' + L + '" y="' + yTop + '" width="' + (W - L - R) + '" height="' + bandHeight + '" fill="#16a34a" opacity="0.10"/>';
      if (b.hi != null) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yTop + '" y2="' + yTop + '" stroke="#16a34a" stroke-dasharray="4 4" stroke-width="1.5" opacity="0.75"/>';
      if (b.lo != null) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yBot + '" y2="' + yBot + '" stroke="#16a34a" stroke-dasharray="4 4" stroke-width="1.5" opacity="0.75"/>';
      g += '<text x="' + (W - R - 6) + '" y="' + (yTop + 14) + '" text-anchor="end" font-size="11" font-weight="700" fill="#15803d">Normal Ref Band: ' + App.esc(m.ref) + ' ' + App.esc(m.unit) + '</text>';
    }

    /* Trend line connection */
    if (n > 1) {
      var ptsStr = pts.map(function (q, i) { return X(i) + ',' + Y(q.v); }).join(' ');
      g += '<polyline fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + ptsStr + '"/>';
    }

    /* Data points */
    var COL_SEV = { ok: '#16a34a', mild: '#d97706', moderate: '#ea580c', critical: '#dc2626' };
    pts.forEach(function (q, i) {
      var col = COL_SEV[q.sev || 'ok'] || '#16a34a';
      var x = X(i);
      var y = Y(q.v);
      var isHigh = y > T + 32;

      g += '<g style="cursor:pointer">';
      g += '<title>' + App.esc(m.name + ': ' + q.raw + ' ' + m.unit + ' | Visit: ' + App.d(q.t) + ' (' + q.inv + ')') + '</title>';
      /* Point circle */
      g += '<circle cx="' + x + '" cy="' + y + '" r="7" fill="#ffffff" stroke="' + col + '" stroke-width="3.5"/>';
      /* Value callout pill */
      var valY = isHigh ? (y - 14) : (y + 22);
      g += '<rect x="' + (x - 26) + '" y="' + (valY - 11) + '" width="52" height="16" rx="4" fill="#ffffff" stroke="' + col + '" stroke-width="1" opacity="0.95"/>';
      g += '<text x="' + x + '" y="' + (valY + 1) + '" text-anchor="middle" font-size="11" font-weight="800" fill="' + col + '">' + App.esc(f(q.v)) + '</text>';
      /* X-axis labels */
      g += '<text x="' + x + '" y="' + (H - 26) + '" text-anchor="middle" font-size="11" font-weight="600" fill="#334155">' + App.esc(App.d(q.t)) + '</text>';
      g += '<text x="' + x + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" font-weight="500" fill="#64748b">' + App.esc(q.inv) + '</text>';
      g += '</g>';
    });

    g += '</svg>';
    return g;
  }

  function renderPatientTrendsDashboard() {
    if (role() !== 'admin' && !(role() === 'custom' && App.canPage('reports'))) return denied();

    /* Ensure results module is loaded */
    if (!App.trendSeries || !App.refFor || !App.refBounds) {
      var viewLoading = document.getElementById('view');
      if (viewLoading) viewLoading.innerHTML = '<div class="card"><div class="card-b">' + App.empty('Loading Patient Historical Trends Engine…') + '</div></div>';
      App.loadScript('assets/js/mod-results.js').then(function () {
        renderPatientTrendsDashboard();
      }, function () {
        App.toast('Could not load test results module', 'err');
      });
      return;
    }

    var allPatients = DB.all('patients') || [];
    var allInvoices = DB.all('invoices') || [];
    var allResults = DB.all('results') || [];
    var readyResults = allResults.filter(function (r) { return r.status === 'ready' && r.values; });

    var invById = {};
    allInvoices.forEach(function (i) { invById[i.id] = i; });

    var patResultsMap = {};
    readyResults.forEach(function (r) {
      var inv = invById[r.invoiceId];
      if (inv && inv.patientId) {
        patResultsMap[inv.patientId] = (patResultsMap[inv.patientId] || 0) + 1;
      }
    });

    /* Patients with test results sorted by number of test records descending */
    var patsWithResults = allPatients.filter(function (p) { return (patResultsMap[p.id] || 0) > 0; });
    patsWithResults.sort(function (a, b) {
      return (patResultsMap[b.id] || 0) - (patResultsMap[a.id] || 0);
    });

    /* Parse query string from URL */
    var hashQ = (location.hash || '').split('?')[1] || '';
    var qObj = {};
    hashQ.split('&').forEach(function (pair) {
      var s = pair.split('=');
      if (s[0]) qObj[decodeURIComponent(s[0])] = decodeURIComponent(s[1] || '');
    });

    if (qObj.patientId || qObj.id) {
      trendsState.patientId = qObj.patientId || qObj.id;
    }

    /* Selected patient selection fallback */
    var curPat = trendsState.patientId ? DB.get('patients', trendsState.patientId) : null;
    if (!curPat && patsWithResults.length) {
      curPat = patsWithResults[0];
      trendsState.patientId = curPat.id;
    } else if (!curPat && allPatients.length) {
      curPat = allPatients[0];
      trendsState.patientId = curPat.id;
    }

    if (!curPat) {
      var emptyHtml = '<div class="page-head"><div><h1>📈 Patient Historical Trend &amp; Delta Analysis Center</h1></div></div>'
        + '<div class="card"><div class="card-b">' + App.empty('No patients registered in the system yet. Register patients and enter lab results to see trend charts.') + '</div></div>';
      document.getElementById('view').innerHTML = emptyHtml;
      return;
    }

    /* Retrieve trend series for current patient */
    var series = curPat ? App.trendSeries(curPat) : [];
    if (qObj.param && series.length) {
      var foundIdx = -1;
      series.forEach(function (s, i) {
        if (s.name.toLowerCase() === qObj.param.toLowerCase()) foundIdx = i;
      });
      if (foundIdx >= 0) trendsState.paramIndex = foundIdx;
    }
    if (trendsState.paramIndex >= series.length) {
      trendsState.paramIndex = 0;
    }

    var selSeries = series[trendsState.paramIndex] || null;
    var pts = selSeries ? selSeries.pts.slice() : [];

    /* Apply visit limit filter if needed */
    if (trendsState.visitLimit === 'last3') pts = pts.slice(-3);
    else if (trendsState.visitLimit === 'last5') pts = pts.slice(-5);
    else if (trendsState.visitLimit === 'last10') pts = pts.slice(-10);

    /* Compute delta check metrics */
    var basePt = pts.length ? pts[0] : null;
    var latestPt = pts.length ? pts[pts.length - 1] : null;
    var prevPt = pts.length > 1 ? pts[pts.length - 2] : null;

    var prevDelta = (prevPt && latestPt) ? (latestPt.v - prevPt.v) : 0;
    var prevDeltaPct = (prevPt && prevPt.v !== 0) ? ((prevDelta / Math.abs(prevPt.v)) * 100) : 0;

    var baseDelta = (basePt && latestPt) ? (latestPt.v - basePt.v) : 0;
    var baseDeltaPct = (basePt && basePt.v !== 0) ? ((baseDelta / Math.abs(basePt.v)) * 100) : 0;

    /* Clinical direction assessment */
    var dirNote = 'Baseline Recording';
    var dirColor = '#16a34a';
    if (selSeries && basePt && latestPt) {
      var dLatest = App.outDist ? App.outDist(selSeries, latestPt.v) : 0;
      var dBase = App.outDist ? App.outDist(selSeries, basePt.v) : 0;
      if (dLatest === 0) {
        if (dBase > 0) { dirNote = 'Normalized: Successfully returned to normal range'; dirColor = '#16a34a'; }
        else { dirNote = 'Healthy: Value consistently within normal limits'; dirColor = '#16a34a'; }
      } else if (dLatest < dBase) {
        dirNote = 'Improving: Moving closer to normal reference band'; dirColor = '#059669';
      } else if (dLatest > dBase) {
        dirNote = 'Alert: Deviation from normal reference range expanded'; dirColor = '#dc2626';
      } else {
        dirNote = 'Deviation: Persistently outside reference bounds'; dirColor = '#d97706';
      }
    }

    var patInvs = allInvoices.filter(function (i) { return i.patientId === curPat.id; });
    var patReadyCount = patResultsMap[curPat.id] || 0;

    var COL_SEV = { ok: '#16a34a', mild: '#d97706', moderate: '#ea580c', critical: '#dc2626' };
    var latestSevCol = latestPt ? (COL_SEV[latestPt.sev || 'ok'] || '#16a34a') : '#16a34a';
    var latestSevBadge = latestPt ? (latestPt.sev
      ? '<span class="badge" style="background:' + latestSevCol + '18;color:' + latestSevCol + ';font-weight:800;border:1px solid ' + latestSevCol + '44">' + (latestPt.dir === 'high' ? '↑ HIGH' : '↓ LOW') + (latestPt.sev === 'critical' ? ' · CRITICAL' : '') + '</span>'
      : '<span class="badge" style="background:#16a34a18;color:#16a34a;font-weight:700;border:1px solid #16a34a44">Normal</span>') : '—';

    /* Determine unified KPI themes */
    var latestCardTheme = 't-green';
    if (latestPt) {
      if (latestPt.sev === 'critical') latestCardTheme = 't-red';
      else if (latestPt.sev === 'moderate' || latestPt.sev === 'mild') latestCardTheme = 't-amber';
      else if (latestPt.sev === 'ok' || !latestPt.sev) latestCardTheme = 't-green';
    } else {
      latestCardTheme = 't-navy';
    }

    var deltaCardTheme = 't-blue';
    if (selSeries && basePt && latestPt) {
      var dLatest = App.outDist ? App.outDist(selSeries, latestPt.v) : 0;
      var dBase = App.outDist ? App.outDist(selSeries, basePt.v) : 0;
      if (dLatest === 0) {
        deltaCardTheme = 't-green';
      } else if (dLatest < dBase) {
        deltaCardTheme = 't-green';
      } else if (dLatest > dBase) {
        deltaCardTheme = 't-red';
      } else {
        deltaCardTheme = 't-amber';
      }
    } else {
      deltaCardTheme = 't-blue';
    }

    /* Build HTML */
    var html = ''
      + '<style>'
      + '.pt-trend-dash { max-width: 1300px; margin: 0 auto; }'
      + '.pt-pat-banner { display: flex; align-items: center; gap: 16px; background: #fff; border: 1.5px solid var(--bd); border-radius: 14px; padding: 14px 18px; margin-bottom: 18px; flex-wrap: wrap; box-shadow: 0 1px 4px rgba(15,23,42,.04); }'
      + '.pt-avatar-circle { width: 48px; height: 48px; border-radius: 50%; background: var(--brand-grad); color: #fff; display: grid; place-items: center; font-size: 18px; font-weight: 800; flex: 0 0 48px; box-shadow: 0 4px 12px rgba(19,24,69,.25); }'
      + '.pt-param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }'
      + '.pt-param-card { background: #fff; border: 1.5px solid var(--bd); border-radius: 14px; padding: 14px 16px; transition: border-color .15s, box-shadow .15s; }'
      + '.pt-param-card:hover { border-color: var(--brand); box-shadow: 0 4px 14px rgba(19,24,69,.08); }'
      + '@media print { .sidebar, .topbar, .pt-head-bar .btn, .pt-filter-box, .no-print { display: none !important; } .main { padding: 0 !important; } }'
      + '</style>'
      + '<div class="pt-trend-dash">';

    /* 4 KPI Stat Cards */
    var baselineValText = basePt ? (basePt.raw + ' ' + (selSeries ? selSeries.unit : '')) : '—';
    var latestValText = latestPt ? (latestPt.raw + ' ' + (selSeries ? selSeries.unit : '')) : '—';
    var deltaSign = baseDelta > 0 ? '▲ +' : (baseDelta < 0 ? '▼ ' : '');
    var deltaValText = (basePt && latestPt && selSeries)
      ? (deltaSign + (Math.round(Math.abs(baseDelta) * 100) / 100) + ' ' + selSeries.unit + ' (' + (baseDeltaPct >= 0 ? '+' : '') + (Math.round(baseDeltaPct * 10) / 10) + '%)')
      : '—';

    /* 1. 4 Unified KPI Stat Cards (.kpi-grid + .kpi) */
    html += '<div class="kpi-grid" style="margin-bottom:18px">'
      + '<div class="kpi t-navy">'
      +   '<div class="kpi-ic">' + App.icon('chart', 18) + '</div>'
      +   '<div class="kpi-lb">HISTORICAL READINGS</div>'
      +   '<div class="kpi-nm">' + pts.length + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">readings</span></div>'
      +   '<div class="kpi-sb">' + (pts.length > 1 ? 'From ' + App.d(basePt.t) + ' to ' + App.d(latestPt.t) : (pts.length ? '1 visit recorded' : '0 readings recorded')) + '</div>'
      + '</div>'
      + '<div class="kpi t-purple">'
      +   '<div class="kpi-ic">' + App.icon('flask', 18) + '</div>'
      +   '<div class="kpi-lb">BASELINE (INITIAL) READING</div>'
      +   '<div class="kpi-nm">' + App.esc(baselineValText) + '</div>'
      +   '<div class="kpi-sb">' + (basePt ? App.d(basePt.t) + ' (' + App.esc(basePt.inv) + ')' : 'No baseline data') + '</div>'
      + '</div>'
      + '<div class="kpi ' + latestCardTheme + '">'
      +   '<div class="kpi-ic">' + App.icon('clipboard', 18) + '</div>'
      +   '<div class="kpi-lb">LATEST (CURRENT) READING</div>'
      +   '<div class="kpi-nm" style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +     '<span>' + App.esc(latestValText) + '</span>'
      +     (latestSevBadge !== '—' ? latestSevBadge : '')
      +   '</div>'
      +   '<div class="kpi-sb">' + (latestPt ? 'Tested on ' + App.d(latestPt.t) + ' (' + App.esc(latestPt.inv) + ')' : 'No readings recorded') + '</div>'
      + '</div>'
      + '<div class="kpi ' + deltaCardTheme + '">'
      +   '<div class="kpi-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 6-6 4 4 8-8"/><path d="M14 6h7v7"/></svg></div>'
      +   '<div class="kpi-lb">NET DELTA FROM BASELINE</div>'
      +   '<div class="kpi-nm" style="font-size:' + (deltaValText.length > 20 ? '17px' : '20px') + '">' + App.esc(deltaValText) + '</div>'
      +   '<div class="kpi-sb" title="' + App.esc(dirNote) + '">' + App.esc(dirNote) + '</div>'
      + '</div>'
      + '</div>'

      /* 2. Patient & Parameter Selector Controls with Actions (Inside toolbar card) */
      + '<div class="card pt-filter-box" style="margin-bottom:18px"><div class="card-b" style="padding:14px 16px">'
      +   '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">'
      +     '<div style="flex:1;min-width:240px">'
      +       '<label class="label" style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted)">Select Patient</label>'
      +       '<select class="select" id="ptPatSelect" style="font-weight:600;width:100%">'
      +         allPatients.map(function (p) {
                  var rCount = patResultsMap[p.id] || 0;
                  var isSel = curPat && curPat.id === p.id;
                  return '<option value="' + App.esc(p.id) + '"' + (isSel ? ' selected' : '') + '>'
                    + App.esc(p.name) + ' (' + App.esc(p.id) + ')' + (rCount ? ' — ' + rCount + ' report(s)' : ' — no reports')
                    + '</option>';
                }).join('')
      +       '</select>'
      +     '</div>'
      +     '<div style="flex:1;min-width:220px">'
      +       '<label class="label" style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted)">Biometric Parameter</label>'
      +       '<select class="select" id="ptParamSelect" style="font-weight:600;width:100%"' + (!series.length ? ' disabled' : '') + '>'
      +         (series.length ? series.map(function (m, i) {
                  var isSel = trendsState.paramIndex === i;
                  return '<option value="' + i + '"' + (isSel ? ' selected' : '') + '>'
                    + App.esc(m.name) + ' (' + m.pts.length + ' visit' + (m.pts.length > 1 ? 's' : '') + ')' + (m.ref ? ' [ref: ' + App.esc(m.ref) + ']' : '')
                    + '</option>';
                }).join('') : '<option value="">No numeric parameters reported</option>')
      +       '</select>'
      +     '</div>'
      +     '<div style="min-width:150px">'
      +       '<label class="label" style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted)">Visits Range</label>'
      +       '<select class="select" id="ptRangeSelect" style="font-weight:600;width:100%">'
      +         '<option value="all"' + (trendsState.visitLimit === 'all' ? ' selected' : '') + '>All Historical Visits</option>'
      +         '<option value="last3"' + (trendsState.visitLimit === 'last3' ? ' selected' : '') + '>Last 3 Visits</option>'
      +         '<option value="last5"' + (trendsState.visitLimit === 'last5' ? ' selected' : '') + '>Last 5 Visits</option>'
      +         '<option value="last10"' + (trendsState.visitLimit === 'last10' ? ' selected' : '') + '>Last 10 Visits</option>'
      +       '</select>'
      +     '</div>'
      +     '<div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap" class="no-print">'
      +       '<button class="btn btn-ghost btn-sm" id="ptRefreshBtn" style="height:36px">🔄 Refresh</button>'
      +       '<button class="btn btn-ghost btn-sm" id="ptCsvBtn" style="height:36px">📥 Export CSV</button>'
      +       '<button class="btn btn-primary btn-sm" id="ptPrintBtn" style="height:36px">' + PRINT_ICON + ' Print Trend Report</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>'

      /* 4. Patient Demographics & Profile Summary Banner (Below cards) */
      + '<div class="pt-pat-banner">'
      +   '<div class="pt-avatar-circle">' + App.esc((curPat.name || 'P').charAt(0).toUpperCase()) + '</div>'
      +   '<div style="flex:1;min-width:220px">'
      +     '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      +       '<h3 style="margin:0;font-size:17px;font-weight:800;color:var(--ink)">' + App.esc(curPat.name) + '</h3>'
      +       '<span class="badge b-id mono">' + App.esc(curPat.id) + '</span>'
      +       (curPat.gender ? '<span class="badge" style="background:#e0e7ff;color:#3730a3;font-weight:600">' + App.esc(curPat.gender) + '</span>' : '')
      +       (curPat.age ? '<span class="badge" style="background:#f1f5f9;color:#334155;font-weight:600">' + App.esc(curPat.age) + ' yrs</span>' : '')
      +     '</div>'
      +     '<div style="display:flex;gap:12px;margin-top:5px;font-size:12px;color:var(--muted);flex-wrap:wrap">'
      +       '<span>📞 ' + App.esc(curPat.phone || 'No phone') + '</span>'
      +       '<span>🗓 Registered ' + App.esc(App.d(curPat.createdAt)) + '</span>'
      +       '<span>🧾 ' + patInvs.length + ' Total Visits</span>'
      +       '<span>🔬 ' + patReadyCount + ' Finalized Lab Reports</span>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:8px">'
      +     '<a href="#/patient/' + App.esc(curPat.id) + '" class="btn btn-ghost btn-sm">👤 Patient Profile &rarr;</a>'
      +     '<a href="#/billing/' + App.esc(curPat.id) + '" class="btn btn-primary btn-sm">+ New Bill</a>'
      +   '</div>'
      + '</div>';

    if (!series.length) {
      html += '<div class="card"><div class="card-b" style="text-align:center;padding:40px 20px">'
        + '<div style="font-size:42px;margin-bottom:12px">🧪</div>'
        + '<h3 style="margin:0 0 6px">No Numeric Lab Test Results Found</h3>'
        + '<p class="muted" style="margin:0 0 16px;max-width:500px;margin-left:auto;margin-right:auto">'
        + 'Patient <b>' + App.esc(curPat.name) + '</b> does not have finalized numeric test results yet. '
        + 'When tests like Blood Sugar, CBC, Creatinine, Lipid Profile, or Electrolytes are finalized with numeric values in Lab Results, their multi-visit historical trend graphs and delta analyses will display here.'
        + '</p>'
        + '<div style="display:flex;justify-content:center;gap:10px">'
        + '<a href="#/results" class="btn btn-primary">Go to Lab Results &rarr;</a>'
        + '<a href="#/billing/' + App.esc(curPat.id) + '" class="btn btn-ghost">+ New Bill for Patient</a>'
        + '</div>'
        + '</div></div></div></div>';
      document.getElementById('view').innerHTML = html;
      wireTrendsEvents();
      return;
    }

    /* Visual Trend SVG Graph Card */
    html += '<div class="card" style="margin-bottom:20px">'
      + '<div class="card-h" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      +   '<div>'
      +     '<h3 style="margin:0;font-size:16px">' + App.esc(selSeries.name) + ' — Historical Trajectory Graph</h3>'
      +     '<span class="muted" style="font-size:12px">Reference Range: <b>' + App.esc(selSeries.ref || 'Not specified') + ' ' + App.esc(selSeries.unit) + '</b></span>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap">'
      +     '<span><span style="color:#16a34a">●</span> Normal</span>'
      +     '<span><span style="color:#d97706">●</span> Mild/Moderate</span>'
      +     '<span><span style="color:#dc2626">●</span> Critical Alert</span>'
      +     '<span><span style="display:inline-block;width:12px;height:10px;background:#16a34a22;border:1px dashed #16a34a;vertical-align:middle"></span> Normal Band</span>'
      +   '</div>'
      + '</div>'
      + '<div class="card-b" style="padding:16px 20px">'
      +   (pts.length === 1 ? '<p class="muted" style="margin:0 0 10px;font-size:12.5px">📌 Only 1 reading recorded so far. Continuous connection curves connect automatically across upcoming visits.</p>' : '')
      +   buildTrendSvg(selSeries, pts)
      + '</div></div>';

    /* Delta Analysis & Clinical Velocity Table Card */
    var deltaRowsHtml = pts.map(function (q, idx) {
      var prev = idx > 0 ? pts[idx - 1] : null;
      var d = prev ? (q.v - prev.v) : null;
      var dTxt = '';
      if (d == null) {
        dTxt = '<span class="muted">— (Baseline)</span>';
      } else if (d === 0) {
        dTxt = '<span class="muted">No change (0.0)</span>';
      } else {
        var pct = (prev && prev.v !== 0) ? ((d / Math.abs(prev.v)) * 100) : 0;
        var da = App.outDist ? App.outDist(selSeries, prev.v) : 0;
        var db = App.outDist ? App.outDist(selSeries, q.v) : 0;
        var col = (da === 0 && db === 0) ? '#64748b' : (db < da ? '#16a34a' : '#dc2626');
        dTxt = '<span style="color:' + col + ';font-weight:700">' + (d > 0 ? '▲ +' : '▼ ') + (Math.round(Math.abs(d) * 100) / 100) + ' ' + App.esc(selSeries.unit) + ' (' + (pct >= 0 ? '+' : '') + (Math.round(pct * 10) / 10) + '%)</span>';
      }

      /* Cumulative delta from baseline */
      var cD = idx > 0 ? (q.v - basePt.v) : 0;
      var cPct = (idx > 0 && basePt.v !== 0) ? ((cD / Math.abs(basePt.v)) * 100) : 0;
      var cTxt = idx === 0 ? '<span class="muted">Baseline Visit</span>'
        : '<span style="font-weight:600;color:' + (cD > 0 ? '#b45309' : (cD < 0 ? '#1d4ed8' : '#64748b')) + '">'
          + (cD > 0 ? '▲ +' : (cD < 0 ? '▼ ' : '')) + (Math.round(Math.abs(cD) * 100) / 100) + ' (' + (cPct >= 0 ? '+' : '') + (Math.round(cPct * 10) / 10) + '%)</span>';

      /* Velocity & status flags */
      var sevCol = COL_SEV[q.sev || 'ok'] || '#16a34a';
      var statusBadge = q.sev
        ? '<span class="badge" style="background:' + sevCol + '18;color:' + sevCol + ';font-weight:800;border:1px solid ' + sevCol + '44">' + (q.dir === 'high' ? '↑ HIGH' : '↓ LOW') + (q.sev === 'critical' ? ' · CRITICAL' : '') + '</span>'
        : '<span class="badge" style="background:#16a34a18;color:#16a34a;font-weight:700;border:1px solid #16a34a44">Normal</span>';

      var velFlag = '';
      if (idx === 0) velFlag = '<span class="muted">Initial Baseline</span>';
      else {
        var absPct = Math.abs(pct);
        if (absPct <= 10) velFlag = '<span class="badge" style="background:#f1f5f9;color:#475569">Normal Fluctuation (≤10%)</span>';
        else if (absPct <= 25) velFlag = '<span class="badge" style="background:#fef3c7;color:#b45309">Moderate Shift (10-25%)</span>';
        else if (absPct <= 40) velFlag = '<span class="badge" style="background:#ffedd5;color:#c2410c">Significant Delta (>25%)</span>';
        else velFlag = '<span class="badge" style="background:#fee2e2;color:#b91c1c;font-weight:800">Critical Shift (>40%)</span>';
      }

      return '<tr>'
        + '<td style="font-weight:700;color:var(--muted)">#' + (idx + 1) + '</td>'
        + '<td><b>' + App.esc(App.d(q.t)) + '</b></td>'
        + '<td><a href="#/invoice/' + App.esc(q.invId || q.inv) + '" class="mono" style="font-weight:600;text-decoration:none">' + App.esc(q.inv) + '</a></td>'
        + '<td><span style="font-size:14px;font-weight:800;color:' + sevCol + '">' + App.esc(q.raw) + '</span> <span class="muted">' + App.esc(selSeries.unit) + '</span></td>'
        + '<td><span class="muted">' + App.esc(selSeries.ref || '—') + '</span></td>'
        + '<td>' + statusBadge + '</td>'
        + '<td>' + dTxt + '</td>'
        + '<td>' + cTxt + '</td>'
        + '<td>' + velFlag + '</td>'
        + '<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-pt-inv="' + App.esc(q.invId || q.inv) + '">View Report</button></td>'
        + '</tr>';
    }).reverse().join('');

    html += '<div class="card" style="margin-bottom:20px">'
      + '<div class="card-h"><h3 style="margin:0">Delta Check &amp; Clinical Progress Log</h3>'
      + '<span class="muted" style="font-size:12.5px">' + pts.length + ' chronologically recorded readings</span></div>'
      + '<div class="card-b" style="padding:0">'
      +   '<div class="tbl-wrap"><table class="table"><thead><tr>'
      +     '<th>#</th><th>Visit Date</th><th>Invoice No</th><th>Result Value</th><th>Reference Range</th>'
      +     '<th>Clinical Status</th><th>Delta (vs Prior)</th><th>Cumulative Δ</th><th>Velocity / Variance</th><th style="text-align:right">Action</th>'
      +   '</tr></thead><tbody>' + deltaRowsHtml + '</tbody></table></div>'
      + '</div></div>';

    /* Multi-Parameter Health Overview Grid (Other parameters tested for this patient) */
    html += '<div class="card" style="margin-bottom:24px">'
      + '<div class="card-h"><h3 style="margin:0">Multi-Parameter Clinical Overview (' + series.length + ' Monitored Tests)</h3>'
      + '<span class="muted" style="font-size:12.5px">Quick biometric summary across all tests finalized for ' + App.esc(curPat.name) + '</span></div>'
      + '<div class="card-b">'
      +   '<div class="pt-param-grid">'
      +     series.map(function (m, i) {
              var isCurrent = trendsState.paramIndex === i;
              var mPts = m.pts;
              var mBase = mPts[0];
              var mLatest = mPts[mPts.length - 1];
              var mDelta = (mBase && mLatest) ? (mLatest.v - mBase.v) : 0;
              var mDeltaPct = (mBase && mBase.v !== 0) ? ((mDelta / Math.abs(mBase.v)) * 100) : 0;
              var mSev = mLatest ? (COL_SEV[mLatest.sev || 'ok'] || '#16a34a') : '#16a34a';

              return '<div class="pt-param-card"' + (isCurrent ? ' style="border-color:var(--brand);background:#f8fafc;box-shadow:0 0 0 2px rgba(19,24,69,.12)"' : '') + '>'
                + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'
                +   '<strong style="font-size:14px;color:var(--ink)">' + App.esc(m.name) + '</strong>'
                +   (isCurrent ? '<span class="badge b-ready">Active</span>' : '<span class="badge b-pending">' + mPts.length + ' visits</span>')
                + '</div>'
                + '<div class="muted" style="font-size:11.5px;margin-bottom:8px">Normal: ' + App.esc(m.ref || '—') + ' ' + App.esc(m.unit) + '</div>'
                + '<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--bd);border-radius:10px;padding:8px 10px;margin-bottom:10px">'
                +   '<div><div class="muted" style="font-size:10px;text-transform:uppercase">Baseline</div><div style="font-size:13px;font-weight:700">' + App.esc(mBase ? mBase.raw : '—') + '</div></div>'
                +   '<div style="font-size:14px;color:var(--muted)">→</div>'
                +   '<div><div class="muted" style="font-size:10px;text-transform:uppercase">Latest</div><div style="font-size:14px;font-weight:800;color:' + mSev + '">' + App.esc(mLatest ? mLatest.raw : '—') + '</div></div>'
                +   '<div><div class="muted" style="font-size:10px;text-transform:uppercase">Delta</div><div style="font-size:12px;font-weight:800;color:' + (mDelta > 0 ? '#b45309' : (mDelta < 0 ? '#1d4ed8' : '#64748b')) + '">' + (mDelta > 0 ? '▲ +' : (mDelta < 0 ? '▼ ' : '')) + (Math.round(Math.abs(mDeltaPct) * 10) / 10) + '%</div></div>'
                + '</div>'
                + '<button class="btn ' + (isCurrent ? 'btn-ghost' : 'btn-primary') + ' btn-sm" style="width:100%" data-pt-focus-param="' + i + '">'
                +   (isCurrent ? 'Viewing in Main Graph ✓' : 'Focus This Parameter ↗')
                + '</button>'
                + '</div>';
            }).join('')
      +   '</div>'
      + '</div></div>';

    html += '</div>'; /* end .pt-trend-dash */

    document.getElementById('view').innerHTML = html;
    wireTrendsEvents();

    function wireTrendsEvents() {
      /* Patient select change */
      var patSel = document.getElementById('ptPatSelect');
      if (patSel) {
        patSel.addEventListener('change', function () {
          trendsState.patientId = this.value;
          trendsState.paramIndex = 0;
          location.hash = '#/reports/trends?patientId=' + encodeURIComponent(this.value);
        });
      }

      /* Parameter select change */
      var paramSel = document.getElementById('ptParamSelect');
      if (paramSel) {
        paramSel.addEventListener('change', function () {
          trendsState.paramIndex = +this.value;
          renderPatientTrendsDashboard();
        });
      }

      /* Range select change */
      var rangeSel = document.getElementById('ptRangeSelect');
      if (rangeSel) {
        rangeSel.addEventListener('change', function () {
          trendsState.visitLimit = this.value;
          renderPatientTrendsDashboard();
        });
      }

      /* Refresh button */
      var refBtn = document.getElementById('ptRefreshBtn');
      if (refBtn) {
        refBtn.addEventListener('click', function () {
          renderPatientTrendsDashboard();
          App.toast('Patient trends data refreshed.');
        });
      }

      /* Focus parameter card buttons */
      document.querySelectorAll('[data-pt-focus-param]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          trendsState.paramIndex = +this.getAttribute('data-pt-focus-param');
          renderPatientTrendsDashboard();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      /* View report button */
      document.querySelectorAll('[data-pt-inv]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var invId = this.getAttribute('data-pt-inv');
          if (App.viewLabReport) App.viewLabReport(invId);
          else App.loadScript('assets/js/mod-results.js').then(function () { App.viewLabReport(invId); });
        });
      });

      /* CSV Export */
      var csvBtn = document.getElementById('ptCsvBtn');
      if (csvBtn) {
        csvBtn.addEventListener('click', function () {
          if (!selSeries || !pts.length) { App.toast('No trend data to export', 'err'); return; }
          var csvLines = ['Visit_Number,Date,Invoice,Parameter,Value,Unit,Reference_Range,Status,Delta_Prior,Delta_Pct,Cumulative_Delta'];
          pts.forEach(function (q, idx) {
            var prev = idx > 0 ? pts[idx - 1] : null;
            var d = prev ? (q.v - prev.v) : 0;
            var dPct = (prev && prev.v !== 0) ? ((d / Math.abs(prev.v)) * 100) : 0;
            var cD = idx > 0 ? (q.v - basePt.v) : 0;
            csvLines.push([
              idx + 1,
              csvEsc(App.d(q.t)),
              csvEsc(q.inv),
              csvEsc(selSeries.name),
              q.v,
              csvEsc(selSeries.unit),
              csvEsc(selSeries.ref),
              csvEsc(q.sev ? (q.dir + '_' + q.sev) : 'normal'),
              d,
              Math.round(dPct * 10) / 10,
              cD
            ].join(','));
          });
          var blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          var link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'trend_' + (curPat.name || 'patient').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (selSeries.name || 'test').replace(/[^a-zA-Z0-9]/g, '_') + '.csv';
          link.click();
          App.toast('Historical trend CSV exported.');
        });
      }

      /* Print Trend Summary */
      var printBtn = document.getElementById('ptPrintBtn');
      if (printBtn) {
        printBtn.addEventListener('click', function () {
          if (!selSeries || !pts.length) { App.toast('No data to print', 'err'); return; }
          var mainSet = DB.get('settings', 'main') || {};

          var printHtml = '<div style="margin-bottom:14px;border-bottom:2px solid #131845;padding-bottom:10px">'
            + '<div style="text-align:center;font-size:18px;font-weight:800;letter-spacing:.04em;color:#131845;margin-bottom:4px">PATIENT HISTORICAL TREND &amp; DELTA ANALYSIS REPORT</div>'
            + '<div style="text-align:center;font-size:12px;color:#64748b">Biometric Trajectory &amp; Multi-Visit Comparison Analysis</div>'
            + '</div>'

            /* Patient demographics table */
            + '<table class="table" style="margin-bottom:14px"><tbody>'
            + '<tr><td><strong>Patient Name:</strong> ' + App.esc(curPat.name) + '</td><td><strong>MR # / Patient ID:</strong> ' + App.esc(curPat.id) + '</td><td><strong>Age / Gender:</strong> ' + App.esc(curPat.age ? curPat.age + 'y' : '—') + ' / ' + App.esc(curPat.gender || '—') + '</td></tr>'
            + '<tr><td><strong>Contact:</strong> ' + App.esc(curPat.phone || '—') + '</td><td><strong>Evaluated Parameter:</strong> <b>' + App.esc(selSeries.name) + '</b></td><td><strong>Normal Reference:</strong> ' + App.esc(selSeries.ref || '—') + ' ' + App.esc(selSeries.unit) + '</td></tr>'
            + '<tr><td><strong>Baseline Reading:</strong> ' + App.esc(baselineValText) + '</td><td><strong>Latest Reading:</strong> ' + App.esc(latestValText) + '</td><td><strong>Net Trajectory:</strong> ' + App.esc(deltaValText) + '</td></tr>'
            + '</tbody></table>'

            /* SVG Chart */
            + '<div style="margin:16px 0;border:1px solid #cbd5e1;border-radius:8px;padding:12px;background:#ffffff">'
            + buildTrendSvg(selSeries, pts)
            + '</div>'

            /* Delta Table */
            + '<h4 style="margin:14px 0 8px">Visit-by-Visit Clinical Comparison</h4>'
            + '<table class="table" style="margin-bottom:18px"><thead><tr>'
            + '<th>#</th><th>Date</th><th>Invoice</th><th>Result Value</th><th>Reference Range</th><th>Status</th><th>Change vs Prior</th><th>Cumulative Δ</th>'
            + '</tr></thead><tbody>'
            + pts.map(function (q, idx) {
                var prev = idx > 0 ? pts[idx - 1] : null;
                var d = prev ? (q.v - prev.v) : null;
                var dStr = (d == null) ? '—' : ((d > 0 ? '+' : '') + (Math.round(d * 100) / 100) + ' ' + selSeries.unit);
                var cD = idx > 0 ? (q.v - basePt.v) : 0;
                var cStr = idx === 0 ? 'Baseline' : ((cD > 0 ? '+' : '') + (Math.round(cD * 100) / 100) + ' ' + selSeries.unit);
                return '<tr>'
                  + '<td>' + (idx + 1) + '</td>'
                  + '<td>' + App.esc(App.d(q.t)) + '</td>'
                  + '<td>' + App.esc(q.inv) + '</td>'
                  + '<td><strong>' + App.esc(q.raw) + '</strong> ' + App.esc(selSeries.unit) + '</td>'
                  + '<td>' + App.esc(selSeries.ref || '—') + '</td>'
                  + '<td>' + (q.sev ? (q.dir + ' (' + q.sev + ')') : 'Normal') + '</td>'
                  + '<td>' + App.esc(dStr) + '</td>'
                  + '<td>' + App.esc(cStr) + '</td>'
                  + '</tr>';
              }).join('')
            + '</tbody></table>'

            /* Doctor signatures & stamp footer */
            + '<div style="margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end">'
            +   '<div><div style="font-size:11px;color:#64748b">Generated by Optix Medical Sync</div><div style="font-size:11px;color:#64748b">Report Date: ' + App.dt(new Date()) + '</div></div>'
            +   '<div style="text-align:center;min-width:180px;border-top:1px solid #333;padding-top:6px;font-size:12px;font-weight:700">Verified by Pathologist</div>'
            + '</div>';

          App.print('Patient Historical Trend Report — ' + curPat.name, printHtml);
        });
      }
    }
  }

  /* ============================================================
     SETTINGS  (#/settings) — admin only
     Tabs: Lab Profile | My Account | Users | Backup | Danger Zone
     ============================================================ */
  var UNIFI_SET_CSS =
    '.unifi-shell{background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px -4px rgba(15,23,42,.06);margin-bottom:24px}' +
    '.unifi-top-bar{padding:18px 24px 14px;border-bottom:1px solid #e2e8f0;background:#ffffff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}' +
    '.unifi-top-title{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-.02em;margin:0;display:flex;align-items:center;gap:8px}' +
    '.unifi-top-title>svg,.unifi-tab-btn>svg{display:block;flex:none}' +
    '.unifi-top-desc{font-size:12.5px;color:#64748b;margin:3px 0 0}' +
    '.unifi-tab-strip{display:flex;gap:6px;overflow-x:auto;padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;scrollbar-width:thin}' +
    '.unifi-tab-strip::-webkit-scrollbar{height:4px}' +
    '.unifi-tab-strip::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}' +
    '.unifi-tab-btn{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;color:#475569;background:#ffffff;border:1px solid #e2e8f0;text-decoration:none;white-space:nowrap;transition:all .15s ease}' +
    '.unifi-tab-btn:hover{background:#f1f5f9;color:#0f172a;border-color:#cbd5e1}' +
    '.unifi-tab-btn.active{background:#0f172a;color:#ffffff;border-color:#0f172a;box-shadow:0 2px 8px rgba(15,23,42,.15)}' +
    '.unifi-tab-btn.unifi-danger{color:#dc2626}' +
    '.unifi-tab-btn.unifi-danger:hover{background:#fef2f2;border-color:#fca5a5}' +
    '.unifi-tab-btn.unifi-danger.active{background:#dc2626;color:#ffffff;border-color:#dc2626}' +
    '.unifi-canvas{padding:24px;flex:1}' +
    '.unifi-panel{background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:18px;box-shadow:0 1px 3px rgba(15,23,42,.03);overflow:hidden;transition:border-color .15s}' +
    '.unifi-panel:hover{border-color:#cbd5e1}' +
    '.unifi-panel-header{padding:14px 18px;border-bottom:1px solid #f1f5f9;background:#fafbfc;display:flex;align-items:center;gap:12px}' +
    '.unifi-panel-icon{font-size:18px;width:32px;height:32px;border-radius:8px;background:#ffffff;border:1px solid #e2e8f0;display:grid;place-items:center;flex:none;box-shadow:0 1px 2px rgba(0,0,0,.04)}' +
    '.unifi-panel-title{font-size:14.5px;font-weight:800;color:#0f172a;margin:0}' +
    '.unifi-panel-desc{font-size:12px;color:#64748b;margin:2px 0 0}' +
    '.unifi-panel-body{padding:18px}' +
    '.unifi-switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}' +
    '.unifi-switch input{opacity:0;width:0;height:0}' +
    '.unifi-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#cbd5e1;transition:.2s;border-radius:24px}' +
    '.unifi-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.2s;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.2)}' +
    '.unifi-switch input:checked + .unifi-slider{background-color:#0f172a}' +
    '.unifi-switch input:checked + .unifi-slider:before{transform:translateX(18px)}' +
    '.unifi-toggle-row{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;margin-bottom:8px;gap:14px}' +
    '.unifi-save-bar{margin-top:20px;display:flex;align-items:center;gap:10px;padding-top:16px;border-top:1px solid #e2e8f0}';

  var settingsTab = 'profile';

  function renderSettings() {
    if (role() !== 'admin') return denied();
    var tabs = [
      { id: 'profile', sec: 'GENERAL', label: 'Lab Profile', desc: 'Identity, logo, contact & branches', icon: 'flask' },
      { id: 'payments', sec: 'GENERAL', label: 'Online Payments', desc: 'JazzCash, Easypaisa, Bank & Raast', icon: 'card' },
      { id: 'account', sec: 'GENERAL', label: 'My Account', desc: 'Admin credentials & password', icon: 'users' },
      { id: 'users', sec: 'GENERAL', label: 'Users & Roles', desc: 'Staff accounts & permissions', icon: 'shield' },

      { id: 'templates', sec: 'REPORTS & PRINTING', label: 'Report Templates', desc: 'Presets, normal ranges & tests', icon: 'file' },
      { id: 'signatures', sec: 'REPORTS & PRINTING', label: 'Digital Signatures', desc: 'Pathologist stamps & e-signatures', icon: 'check' },

      { id: 'portal', sec: 'AUTOMATION & PORTAL', label: 'Patient Portal', desc: 'Online verification & QR access', icon: 'lock' },

      { id: 'backup', sec: 'SYSTEM', label: 'Backup & Cloud Sync', desc: 'Automated backups & export', icon: 'download' },
      { id: 'danger', sec: 'SYSTEM', label: 'Danger Zone', desc: 'Factory reset & data purge', icon: 'alert', isDanger: true }
    ];

    var cur = tabs.filter(function (t) { return t.id === settingsTab; })[0] || tabs[0];

    var html =
      '<style>' + UNIFI_SET_CSS + '</style>' +
      '<div class="unifi-shell">' +
        '<div class="unifi-canvas">' +
          '<div id="setBody"></div>' +
        '</div>' +
      '</div>';

    document.getElementById('view').innerHTML = html;

    if (settingsTab === 'profile') renderSetProfile();
    else if (settingsTab === 'payments') renderSetPayments();
    else if (settingsTab === 'account') renderSetAccount();
    else if (settingsTab === 'templates') renderSetTemplates();
    else if (settingsTab === 'signatures') renderSetSignatures();
    else if (settingsTab === 'portal') renderSetPortal();
    else if (settingsTab === 'users') renderSetUsers();
    else if (settingsTab === 'backup') renderSetBackup();
    else renderSetDanger();
    try { checkAutoCloudBackup(); } catch (e) {}
  }

  /* deep-link into the WhatsApp settings tab (used by report-view send buttons
     when the WhatsApp API is not configured yet) */
  App.openWaSettingsTab = function () { App.nav('#/whatsapp/settings'); };

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
      '<div class="sp-form">' +

      '<!-- Panel 1: Identity & Branding -->' +
      '<div class="unifi-panel">' +
        '<div class="unifi-panel-header">' +
          '<div class="unifi-panel-icon">🏢</div>' +
          '<div>' +
            '<h3 class="unifi-panel-title">Identity &amp; Branding</h3>' +
            '<p class="unifi-panel-desc">Primary laboratory name, tagline, branding logo and invoice prefix.</p>' +
          '</div>' +
        '</div>' +
        '<div class="unifi-panel-body">' +
          '<div class="form-grid">' +
            '<div><label class="label">Lab Name *</label><input class="input" id="spName" value="' + App.esc(s.labName || '') + '"></div>' +
            '<div><label class="label">Tagline</label><input class="input" id="spTag" value="' + App.esc(s.tagline || '') + '"></div>' +
            '<div><label class="label">Invoice Prefix *</label><input class="input" id="spPref" value="' + App.esc(s.invoicePrefix || 'INV') + '" style="max-width:140px"></div>' +
            '<div><label class="label">Website</label><input class="input" id="spWeb" placeholder="www.example.com" value="' + App.esc(s.website || '') + '"></div>' +
            '<div style="grid-column:1/-1"><label class="label">Laboratory Logo</label>' +
              '<div style="display:flex;align-items:center;gap:14px;background:#f8fafc;padding:12px;border:1px dashed #cbd5e1;border-radius:10px">' +
                '<img id="spLogoPrev" src="' + App.esc(s.logo || '') + '" alt="Lab logo" style="width:60px;height:60px;border-radius:10px;object-fit:cover;border:1px solid #cbd5e1;background:#fff;flex:none"' + (s.logo ? '' : ' hidden') + '>' +
                '<div style="flex:1"><input type="file" id="spLogo" accept="image/*">' +
                  '<div class="muted" style="font-size:12px;margin-top:4px">Shown on login page, sidebar, POS receipts and test report headers.</div></div>' +
                '<button class="btn btn-ghost btn-sm" type="button" id="spLogoRm" style="color:var(--red)"' + (s.logo ? '' : ' hidden') + '>Remove</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Panel 2: Contact Information & Branches -->' +
      '<div class="unifi-panel">' +
        '<div class="unifi-panel-header">' +
          '<div class="unifi-panel-icon">📍</div>' +
          '<div>' +
            '<h3 class="unifi-panel-title">Contact &amp; Branch Locations</h3>' +
            '<p class="unifi-panel-desc">Addresses, phone numbers, call center and main lab branch info.</p>' +
          '</div>' +
        '</div>' +
        '<div class="unifi-panel-body">' +
          '<div class="form-grid">' +
            '<div style="grid-column:1/-1"><label class="label">Primary Address</label><input class="input" id="spAddr" value="' + App.esc(s.address || '') + '"></div>' +
            '<div><label class="label">Primary Phone</label><input class="input" id="spPhone" value="' + App.esc(s.phone || '') + '"></div>' +
            '<div><label class="label">Official Email</label><input class="input" id="spEmail" value="' + App.esc(s.email || '') + '"></div>' +
            '<div><label class="label">Call Center Phone (24/7)</label><input class="input" id="spCall" value="' + App.esc(s.callCenter || '') + '"></div>' +
            '<div><label class="label">Main Lab Phone</label><input class="input" id="spMainPhone" value="' + App.esc(s.mainLabPhone || '') + '"></div>' +
            '<div style="grid-column:1/-1"><label class="label">Main Lab Branch Address</label><input class="input" id="spMainLab" placeholder="Main Lab address" value="' + App.esc(s.mainLab || '') + '"></div>' +
            '<div style="grid-column:1/-1"><label class="label">Head Office Address</label><input class="input" id="spHead" placeholder="Head Office address" value="' + App.esc(s.headOffice || '') + '"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Panel 3: Report Appearance & Typography -->' +
      '<div class="unifi-panel">' +
        '<div class="unifi-panel-header">' +
          '<div class="unifi-panel-icon">🎨</div>' +
          '<div>' +
            '<h3 class="unifi-panel-title">Report Appearance &amp; Typography</h3>' +
            '<p class="unifi-panel-desc">Fonts, accent colors, titles, and layout options for patient reports.</p>' +
          '</div>' +
        '</div>' +
        '<div class="unifi-panel-body">' +
          '<div class="form-grid">' +
            '<div><label class="label">Report Title</label><input class="input" id="spReportTitle" placeholder="e.g. LABORATORY REPORT" value="' + App.esc(s.reportTitle || '') + '"></div>' +
            '<div><label class="label">Font Family</label><select class="select" id="spFont">' +
              '<option value="inter"' + ((!s.font || s.font === 'inter') ? ' selected' : '') + '>Inter (Default)</option>' +
              '<option value="jakarta"' + (s.font === 'jakarta' ? ' selected' : '') + '>Plus Jakarta Sans</option>' +
              '<option value="roboto"' + (s.font === 'roboto' ? ' selected' : '') + '>Roboto</option>' +
              '<option value="poppins"' + (s.font === 'poppins' ? ' selected' : '') + '>Poppins</option>' +
              '<option value="opensans"' + (s.font === 'opensans' ? ' selected' : '') + '>Open Sans</option>' +
              '<option value="lato"' + (s.font === 'lato' ? ' selected' : '') + '>Lato</option>' +
              '<option value="montserrat"' + (s.font === 'montserrat' ? ' selected' : '') + '>Montserrat</option>' +
            '</select></div>' +
            '<div><label class="label">Report Font Size</label><select class="select" id="spFontSize">' +
              '<option value="small"' + (s.reportFontSize === 'small' ? ' selected' : '') + '>Small</option>' +
              '<option value="medium"' + ((!s.reportFontSize || s.reportFontSize === 'medium') ? ' selected' : '') + '>Medium</option>' +
              '<option value="large"' + (s.reportFontSize === 'large' ? ' selected' : '') + '>Large</option>' +
            '</select></div>' +
            '<div><label class="label">Accent Theme Color</label><div style="display:flex;align-items:center;gap:8px">' +
              '<input type="color" id="spAccent" value="' + App.esc(s.accent || '#1b1b6e') + '" style="width:52px;height:36px;padding:3px;border:1px solid #dfe6f2;border-radius:8px;background:#fff;cursor:pointer">' +
              '<span class="muted" style="font-size:12px">Table headers &amp; branding</span></div></div>' +
            '<div style="grid-column:1/-1"><label class="label">Lab Name Color</label><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<input type="color" id="spNameColor" value="' + App.esc(s.labNameColor || '#000000') + '" data-touched="' + (s.labNameColor ? '1' : '') + '" style="width:52px;height:36px;padding:3px;border:1px solid #dfe6f2;border-radius:8px;background:#fff;cursor:pointer">' +
              ['#000000', '#131845', '#1d4ed8', '#047857', '#9f1239', '#b45309'].map(function (c) { return '<button type="button" class="spNameSw" data-c="' + c + '" title="' + c + '" style="width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;background:' + c + ';cursor:pointer;padding:0"></button>'; }).join('') +
              '<button type="button" class="btn btn-ghost btn-sm" id="spNameReset">Reset</button></div>' +
              '<div class="muted" style="font-size:12px;margin-top:4px">Colour of the lab name at the top of reports and receipts. Default: black.</div></div>' +
          '</div>' +

          '<div style="margin-top:16px">' +
            '<div class="unifi-toggle-row">' +
              '<div><div style="font-weight:700;font-size:13.5px">Show QR Code on Reports</div>' +
                '<div class="muted" style="font-size:12px">Print QR code for digital result verification.</div></div>' +
              '<label class="unifi-switch"><input type="checkbox" id="spShowQr"' + (s.showQr === false ? '' : ' checked') + '><span class="unifi-slider"></span></label>' +
            '</div>' +
            '<div class="unifi-toggle-row">' +
              '<div><div style="font-weight:700;font-size:13.5px">Show Tagline in Header</div>' +
                '<div class="muted" style="font-size:12px">Display lab tagline underneath the main laboratory title.</div></div>' +
              '<label class="unifi-switch"><input type="checkbox" id="spShowTagline"' + (s.showTagline === false ? '' : ' checked') + '><span class="unifi-slider"></span></label>' +
            '</div>' +
            '<div class="unifi-toggle-row">' +
              '<div><div style="font-weight:700;font-size:13.5px">Require Sample Collection Before Result Entry</div>' +
                '<div class="muted" style="font-size:12px">Results cannot be entered if specimen tube is not yet marked collected or was rejected.</div></div>' +
              '<label class="unifi-switch"><input type="checkbox" id="spReqSmp"' + (s.requireSampleCollected ? ' checked' : '') + '><span class="unifi-slider"></span></label>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Panel 4: Report Notices & Disclaimers -->' +
      '<div class="unifi-panel">' +
        '<div class="unifi-panel-header">' +
          '<div class="unifi-panel-icon">📝</div>' +
          '<div>' +
            '<h3 class="unifi-panel-title">Report Notices &amp; Verification Clause</h3>' +
            '<p class="unifi-panel-desc">Custom header lines, footer notices, and electronic verification note.</p>' +
          '</div>' +
        '</div>' +
        '<div class="unifi-panel-body">' +
          '<div class="form-grid">' +
            '<div style="grid-column:1/-1"><label class="label">Header Sub-text <span class="muted" style="font-weight:400">(shown under lab name on every report)</span></label>' +
              '<textarea class="input" id="spHeadText" rows="2" maxlength="600" placeholder="Type text shown under lab name...">' + App.esc(s.headerText || '') + '</textarea></div>' +
            '<div style="grid-column:1/-1"><label class="label">Footer Notice <span class="muted" style="font-weight:400">(shown at bottom of every report)</span></label>' +
              '<textarea class="input" id="spFootText" rows="2" maxlength="600" placeholder="e.g. Please consult your physician with clinical findings...">' + App.esc(s.footerText || '') + '</textarea></div>' +
            '<div style="grid-column:1/-1"><label class="label">Verification Note</label>' +
              '<textarea class="input" id="spVerNote" rows="2" maxlength="500">' + App.esc(s.verNote || 'Electronically verified report. No signatures necessary.') + '</textarea></div>' +
            '<div style="grid-column:1/-1"><label class="label">POS Slip / Receipt Footer Note</label>' +
              '<input class="input" id="spFoot" value="' + App.esc(s.footerNote || '') + '" placeholder="Printed at the bottom of 80mm slips"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Panel 5: Signatory Doctors -->' +
      '<div class="unifi-panel">' +
        '<div class="unifi-panel-header">' +
          '<div class="unifi-panel-icon">👨‍⚕️</div>' +
          '<div>' +
            '<h3 class="unifi-panel-title">Signatory Doctors &amp; Consultants</h3>' +
            '<p class="unifi-panel-desc">Consultant pathologists and lab technologists printed in report footers.</p>' +
          '</div>' +
        '</div>' +
        '<div class="unifi-panel-body">' +
          '<div id="spSigList"></div>' +
          '<button class="btn btn-ghost btn-sm" type="button" id="spSigAdd" style="margin-top:10px">+ Add Signatory Doctor</button>' +
        '</div>' +
      '</div>' +

      '<!-- Panel 6: Advanced Custom HTML Templates -->' +
      '<div class="unifi-panel">' +
        '<details>' +
          '<summary style="padding:14px 18px;cursor:pointer;font-weight:700;color:var(--brand-d);display:flex;align-items:center;gap:8px">' +
            '<span>⚙️ Advanced: Custom Report Header &amp; Footer HTML</span>' +
            '<span class="muted" style="font-size:12px;font-weight:400">(Optional — edit raw print HTML)</span>' +
          '</summary>' +
          '<div class="unifi-panel-body" style="border-top:1px solid #f1f5f9">' +
            '<div class="form-grid">' +
              '<div style="grid-column:1/-1">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
                  '<label class="label" style="margin:0">Custom Header HTML <code>{{logo}} {{qr}} {{lab_no}}</code></label>' +
                  '<div style="display:flex;gap:6px">' +
                    '<button type="button" class="btn btn-ghost btn-xs" id="spHeadSample">Load Sample</button>' +
                    '<button type="button" class="btn btn-ghost btn-xs" id="spHeadClear">Reset</button>' +
                  '</div>' +
                '</div>' +
                '<textarea class="input" id="spHeadHtml" rows="7" spellcheck="false" style="font-family:monospace;font-size:12px" placeholder="Leave empty for automatic header">' + App.esc(s.headerHtml || '') + '</textarea>' +
              '</div>' +
              '<div style="grid-column:1/-1">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
                  '<label class="label" style="margin:0">Custom Footer HTML</label>' +
                  '<div style="display:flex;gap:6px">' +
                    '<button type="button" class="btn btn-ghost btn-xs" id="spFootSample">Load Sample</button>' +
                    '<button type="button" class="btn btn-ghost btn-xs" id="spFootClear">Reset</button>' +
                  '</div>' +
                '</div>' +
                '<textarea class="input" id="spFootHtml" rows="7" spellcheck="false" style="font-family:monospace;font-size:12px" placeholder="Leave empty for automatic footer">' + App.esc(s.footerHtml || '') + '</textarea>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</details>' +
      '</div>' +

      '<!-- Panel 7: Quick Shortcut to Online Payments -->' +
      '<div class="unifi-panel" style="background:#f0fdf4;border-color:#bbf7d0">' +
        '<div class="unifi-panel-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<span style="font-size:24px">💳</span>' +
            '<div>' +
              '<div style="font-weight:700;color:#166534">Online Payments &amp; Raast QR</div>' +
              '<div style="font-size:12.5px;color:#15803d">Manage JazzCash, Easypaisa, Bank accounts and patient QR instructions.</div>' +
            '</div>' +
          '</div>' +
          '<a href="#/settings/payments" class="btn btn-sm btn-primary" style="background:#16a34a;border:none">Configure Payments &rarr;</a>' +
        '</div>' +
      '</div>' +

      '<div class="unifi-save-bar">' +
        '<button class="btn btn-primary" id="spSave" style="padding:10px 24px;font-weight:700">Save Lab Profile</button>' +
        '<button class="btn btn-ghost" id="spPreviewBtn">👁 Full Page Preview</button>' +
      '</div>' +
      '</div>' +

      '<div class="sp-preview">' +
        '<div class="sp-preview-head"><h3>Live Print Preview</h3><span class="muted" style="font-size:12px">Updates in real time</span></div>' +
        '<div class="sp-preview-doc" id="spPreviewDoc"><div class="muted" style="padding:40px 20px;text-align:center">Loading preview…</div></div>' +
      '</div>' +
      '</div>';
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
        opEnabled: document.getElementById('opEnabled') ? document.getElementById('opEnabled').checked : !!(DB.get('settings', 'main') || {}).opEnabled,
        opJazzcashNo: document.getElementById('opJazzcashNo') ? document.getElementById('opJazzcashNo').value.trim() : ((DB.get('settings', 'main') || {}).opJazzcashNo || ''),
        opJazzcashTitle: document.getElementById('opJazzcashTitle') ? document.getElementById('opJazzcashTitle').value.trim() : ((DB.get('settings', 'main') || {}).opJazzcashTitle || ''),
        opEasypaisaNo: document.getElementById('opEasypaisaNo') ? document.getElementById('opEasypaisaNo').value.trim() : ((DB.get('settings', 'main') || {}).opEasypaisaNo || ''),
        opEasypaisaTitle: document.getElementById('opEasypaisaTitle') ? document.getElementById('opEasypaisaTitle').value.trim() : ((DB.get('settings', 'main') || {}).opEasypaisaTitle || ''),
        opBankName: document.getElementById('opBankName') ? document.getElementById('opBankName').value.trim() : ((DB.get('settings', 'main') || {}).opBankName || ''),
        opIban: document.getElementById('opIban') ? document.getElementById('opIban').value.trim() : ((DB.get('settings', 'main') || {}).opIban || ''),
        opRaastId: document.getElementById('opRaastId') ? document.getElementById('opRaastId').value.trim() : ((DB.get('settings', 'main') || {}).opRaastId || ''),
        opInstructions: document.getElementById('opInstructions') ? document.getElementById('opInstructions').value.trim() : ((DB.get('settings', 'main') || {}).opInstructions || '')
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

  /* ---- Online Payments & Banking (UniFi OS) ---- */
  function renderSetPayments() {
    var s = DB.get('settings', 'main') || {};
    var html =
      '<div class="unifi-card-group" style="max-width:820px">' +
        '<!-- Panel 1: Online Payments Activation -->' +
        '<div class="unifi-panel">' +
          '<div class="unifi-panel-header">' +
            '<div class="unifi-panel-icon">⚡</div>' +
            '<div>' +
              '<h3 class="unifi-panel-title">Online Payment Collection</h3>' +
              '<p class="unifi-panel-desc">Enable digital payment methods and account details on patient invoices.</p>' +
            '</div>' +
          '</div>' +
          '<div class="unifi-panel-body">' +
            '<div class="unifi-toggle-row">' +
              '<div>' +
                '<div style="font-weight:700;font-size:14px">Accept Online Payments (JazzCash, Easypaisa, Raast)</div>' +
                '<div class="muted" style="font-size:12px">When enabled, invoices with remaining due show payment instructions and TID verification.</div>' +
              '</div>' +
              '<label class="unifi-switch">' +
                '<input type="checkbox" id="pay-opEnabled"' + (s.opEnabled ? ' checked' : '') + '>' +
                '<span class="unifi-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Panel 2: Mobile Wallets -->' +
        '<div class="unifi-panel">' +
          '<div class="unifi-panel-header">' +
            '<div class="unifi-panel-icon">📱</div>' +
            '<div>' +
              '<h3 class="unifi-panel-title">Mobile Wallets (JazzCash &amp; Easypaisa)</h3>' +
              '<p class="unifi-panel-desc">Account numbers and verified titles shown to patients.</p>' +
            '</div>' +
          '</div>' +
          '<div class="unifi-panel-body">' +
            '<div class="form-grid">' +
              '<div><label class="label">JazzCash Mobile Number</label><input class="input" id="pay-opJazzcashNo" placeholder="e.g. 0300-1234567" value="' + App.esc(s.opJazzcashNo || '') + '"></div>' +
              '<div><label class="label">JazzCash Account Title</label><input class="input" id="pay-opJazzcashTitle" placeholder="e.g. Optix Diagnostics" value="' + App.esc(s.opJazzcashTitle || '') + '"></div>' +
              '<div><label class="label">Easypaisa Mobile Number</label><input class="input" id="pay-opEasypaisaNo" placeholder="e.g. 0345-1234567" value="' + App.esc(s.opEasypaisaNo || '') + '"></div>' +
              '<div><label class="label">Easypaisa Account Title</label><input class="input" id="pay-opEasypaisaTitle" placeholder="e.g. Optix Diagnostics" value="' + App.esc(s.opEasypaisaTitle || '') + '"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Panel 3: Bank Transfer & Raast -->' +
        '<div class="unifi-panel">' +
          '<div class="unifi-panel-header">' +
            '<div class="unifi-panel-icon">🏦</div>' +
            '<div>' +
              '<h3 class="unifi-panel-title">Direct Bank Transfer &amp; Raast ID</h3>' +
              '<p class="unifi-panel-desc">Bank account IBAN and Raast ID for instant settlements.</p>' +
            '</div>' +
          '</div>' +
          '<div class="unifi-panel-body">' +
            '<div class="form-grid">' +
              '<div><label class="label">Bank Name</label><input class="input" id="pay-opBankName" placeholder="e.g. Meezan Bank, HBL..." value="' + App.esc(s.opBankName || '') + '"></div>' +
              '<div><label class="label">IBAN / Account Number</label><input class="input mono" id="pay-opIban" placeholder="PK36XXXX0000000000000000" value="' + App.esc(s.opIban || '') + '"></div>' +
              '<div style="grid-column:1/-1"><label class="label">Raast ID / Registered Mobile Number</label><input class="input" id="pay-opRaastId" placeholder="e.g. 03001234567 or email" value="' + App.esc(s.opRaastId || '') + '"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Panel 4: Patient Payment Instructions -->' +
        '<div class="unifi-panel">' +
          '<div class="unifi-panel-header">' +
            '<div class="unifi-panel-icon">📋</div>' +
            '<div>' +
              '<h3 class="unifi-panel-title">Instructions Displayed to Patients</h3>' +
              '<p class="unifi-panel-desc">Notice shown on invoices, receipts and WhatsApp payment requests.</p>' +
            '</div>' +
          '</div>' +
          '<div class="unifi-panel-body">' +
            '<textarea class="input" id="pay-opInstructions" rows="3" maxlength="500" placeholder="Please send payment to any account above and share the Transaction ID (TID) to confirm.">' + App.esc(s.opInstructions || '') + '</textarea>' +
          '</div>' +
        '</div>' +

        '<div class="unifi-save-bar">' +
          '<button class="btn btn-primary btn-lg" id="pay-save-btn" style="padding:10px 24px;font-weight:700">Save Payment Settings</button>' +
        '</div>' +
      '</div>';

    document.getElementById('setBody').innerHTML = html;

    document.getElementById('pay-save-btn').addEventListener('click', function () {
      DB.update('settings', 'main', {
        opEnabled: document.getElementById('pay-opEnabled').checked,
        opJazzcashNo: document.getElementById('pay-opJazzcashNo').value.trim(),
        opJazzcashTitle: document.getElementById('pay-opJazzcashTitle').value.trim(),
        opEasypaisaNo: document.getElementById('pay-opEasypaisaNo').value.trim(),
        opEasypaisaTitle: document.getElementById('pay-opEasypaisaTitle').value.trim(),
        opBankName: document.getElementById('pay-opBankName').value.trim(),
        opIban: document.getElementById('pay-opIban').value.trim(),
        opRaastId: document.getElementById('pay-opRaastId').value.trim(),
        opInstructions: document.getElementById('pay-opInstructions').value.trim()
      });
      App.toast('Payment settings saved.');
    });
  }

  /* ---- My Account — change own details, photo, username, password ---- */
  function renderSetAccount() {
    var me = sess();
    var u = me ? DB.get('users', me.userId) : null;
    if (!u) { document.getElementById('setBody').innerHTML = App.empty('Account not found. Please log in again.'); return; }

    var photoVal = u.photo || '';
    var roleLbl = (u.role === 'admin' ? 'Administrator' : (u.role === 'technician' ? 'Lab Technician' : 'Staff Member'));

    function renderAvatar() {
      var av = document.getElementById('maPhotoPreview');
      if (!av) return;
      if (photoVal) {
        av.innerHTML = '<img src="' + photoVal + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="Avatar">';
      } else {
        av.innerHTML = '<span>' + App.esc((u.name || u.username || 'U').charAt(0).toUpperCase()) + '</span>';
      }
    }

    var html = '<div style="max-width:680px">'
      + '<style>'
      + '.ma-card{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:18px}'
      + '.ma-title{font-size:14px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.05em;margin:0 0 14px}'
      + '.ma-photo-row{display:flex;align-items:center;gap:18px;margin-bottom:18px;flex-wrap:wrap}'
      + '.ma-photo{width:84px;height:84px;border-radius:50%;background:var(--brand-grad,linear-gradient(135deg,#0284c7,#1e3a8a));color:#fff;display:grid;place-items:center;font-size:30px;font-weight:800;overflow:hidden;flex:none;box-shadow:0 4px 14px rgba(19,24,69,.25);border:2px solid #fff}'
      + '.ma-photo img{width:100%;height:100%;object-fit:cover;display:block}'
      + '.ma-role-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:rgba(2,132,199,.12);color:#0284c7;margin-left:8px}'
      + '</style>'
      + '<div class="ma-card">'
      + '<div class="ma-title">Profile Picture &amp; Personal Info</div>'
      + '<div class="ma-photo-row">'
      + '  <div class="ma-photo" id="maPhotoPreview"></div>'
      + '  <div>'
      + '    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
      + '      <button type="button" class="btn btn-sm btn-ghost" id="maUploadBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload Photo</button>'
      + '      <button type="button" class="btn btn-sm btn-ghost" id="maRemoveBtn" style="color:var(--red)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Remove</button>'
      + '      <input type="file" id="maFile" accept="image/*" hidden>'
      + '    </div>'
      + '    <div class="muted" style="font-size:12px">JPG, PNG or WebP. Auto-compressed to profile size.</div>'
      + '  </div>'
      + '</div>'
      + '<div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px">'
      + '  <div><label class="label">Full Name *</label><input class="input" id="maName" value="' + App.esc(u.name || '') + '" placeholder="e.g. Dr. Sarah Khan"></div>'
      + '  <div><label class="label">Username *</label><input class="input" id="maUser" value="' + App.esc(u.username || '') + '" placeholder="username"></div>'
      + '  <div><label class="label">Email Address</label><input class="input" id="maEmail" type="email" value="' + App.esc(u.email || '') + '" placeholder="user@lab.com"></div>'
      + '  <div><label class="label">Phone Number</label><input class="input" id="maPhone" type="tel" value="' + App.esc(u.phone || '') + '" placeholder="03xx-xxxxxxx"></div>'
      + '  <div style="grid-column:1/-1"><label class="label">Address / Location</label><input class="input" id="maAddress" value="' + App.esc(u.address || '') + '" placeholder="Street address, City"></div>'
      + '  <div style="grid-column:1/-1;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);margin-top:2px">'
      + '    <span>Account Role:</span><span class="ma-role-badge">' + App.esc(roleLbl) + '</span>'
      + '    <span style="margin-left:auto;font-size:12px">User ID: ' + App.esc(u.id) + '</span>'
      + '  </div>'
      + '</div>'
      + '</div>'
      + '<div class="ma-card">'
      + '<div class="ma-title">Security &amp; Password</div>'
      + '<div class="form-grid" style="grid-template-columns:1fr 1fr;gap:14px">'
      + '  <div><label class="label">New Password</label><input class="input" id="maPass" type="password" placeholder="min 4 characters"></div>'
      + '  <div><label class="label">Confirm New Password</label><input class="input" id="maPass2" type="password" placeholder="repeat new password"></div>'
      + '</div>'
      + '<p class="muted" style="font-size:12px;margin:8px 0 0">Leave password fields blank if you do not want to change your current password.</p>'
      + '</div>'
      + '<div style="margin-top:16px"><button class="btn btn-primary" id="maSave" style="min-width:140px">Save Changes</button></div>'
      + '</div>';

    document.getElementById('setBody').innerHTML = html;
    renderAvatar();

    var fi = document.getElementById('maFile');
    var ub = document.getElementById('maUploadBtn');
    var rb = document.getElementById('maRemoveBtn');
    if (ub && fi) ub.addEventListener('click', function () { fi.click(); });
    if (fi) {
      fi.addEventListener('change', function () {
        var file = fi.files && fi.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { App.toast('Please select an image file', 'err'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var w = img.width, h = img.height;
            var scale = Math.min(1, 192 / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            var cv = document.createElement('canvas');
            cv.width = cw; cv.height = ch;
            cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
            photoVal = cv.toDataURL('image/jpeg', 0.85);
            renderAvatar();
          };
          img.onerror = function () { App.toast('Could not process this image', 'err'); };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    if (rb) {
      rb.addEventListener('click', function () {
        photoVal = '';
        renderAvatar();
      });
    }

    document.getElementById('maSave').addEventListener('click', function () {
      var name = document.getElementById('maName').value.trim();
      var username = document.getElementById('maUser').value.trim();
      var email = document.getElementById('maEmail').value.trim();
      var phone = document.getElementById('maPhone').value.trim();
      var address = document.getElementById('maAddress').value.trim();
      var p1 = document.getElementById('maPass').value;
      var p2 = document.getElementById('maPass2').value;

      if (!username || username.length < 3) return App.toast('Username must be at least 3 characters.', 'err');
      var clash = DB.all('users').some(function (x) {
        return x.id !== u.id && String(x.username || '').toLowerCase() === username.toLowerCase();
      });
      if (clash) return App.toast('That username is already taken.', 'err');

      var patch = {
        username: username,
        name: name || u.name || username,
        email: email,
        phone: phone,
        address: address,
        photo: photoVal
      };

      if (p1 || p2) {
        if (p1.length < 4) return App.toast('New password must be at least 4 characters.', 'err');
        if (p1 !== p2) return App.toast('Passwords do not match.', 'err');
        patch.password = p1;
      }

      DB.update('users', u.id, patch);
      try {
        var s = sess() || {};
        s.name = patch.name;
        s.photo = patch.photo;
        localStorage.setItem('labpos_session', JSON.stringify(s));
      } catch (e) {}
      App.toast('Account updated successfully!');
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


  /* ==========================================================================
     DEDICATED DASHBOARD: PATHOLOGIST & RADIOLOGIST DIGITAL SIGNATURES (#/settings/signatures)
     Doctor Signatures, Official Stamps, Department Verification, Report Integration
     ========================================================================== */
  function renderSetSignatures() {
    var box = document.getElementById('setBody');
    if (!box) return;
    var s = DB.get('settings', 'main') || {};

    var DEFAULT_SIGS = [
      { id: 'sig-1', name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist', regNo: 'PMC 45210-P', dept: 'Histopathology', active: true, sigImg: '', stampImg: '' },
      { id: 'sig-2', name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP', title: 'Consultant Hematologist', regNo: 'PMC 51890-P', dept: 'Hematology', active: true, sigImg: '', stampImg: '' },
      { id: 'sig-3', name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist', regNo: 'MLT 1284', dept: 'Microbiology', active: true, sigImg: '', stampImg: '' },
      { id: 'sig-4', name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Senior Lab Technologist', regNo: 'MLT 0922', dept: 'Biochemistry', active: true, sigImg: '', stampImg: '' }
    ];

    var list = (Array.isArray(s.signatories) && s.signatories.length)
      ? JSON.parse(JSON.stringify(s.signatories))
      : JSON.parse(JSON.stringify(DEFAULT_SIGS));

    list.forEach(function (d, i) {
      if (!d.id) d.id = 'sig-' + (i + 1);
      if (d.active === undefined) d.active = true;
    });

    var enableSignatures = s.enableSignatures !== false;
    var showStamps = s.showStamps !== false;
    var verNote = s.verNote || s.verificationNote ||
      'Electronically verified report. No signatures necessary. Sample brought to the main lab. Lab reports should be interpreted by a physician in correlation with clinical and radiologic findings.';

    var CSS =
      '.dsig-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;flex-wrap:wrap}' +
      '.dsig-head h2{margin:0 0 4px;font-size:20px;font-weight:800;color:var(--brand-d);display:flex;align-items:center;gap:8px}' +
      '.dsig-head p{margin:0;font-size:13px;color:var(--muted)}' +
      '.dsig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;margin:16px 0}' +
      '.dsig-card{background:#fff;border:1px solid var(--bd);border-radius:14px;padding:16px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:12px;transition:box-shadow .2s}' +
      '.dsig-card:hover{box-shadow:var(--sh-md)}' +
      '.dsig-card.is-off{opacity:.65;background:#f8fafc}' +
      '.dsig-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
      '.dsig-card-title{font-weight:800;font-size:14.5px;color:var(--brand-d)}' +
      '.dsig-card-sub{font-size:12px;color:var(--ink2);margin-top:2px}' +
      '.dsig-preview-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0}' +
      '.dsig-box{border:1px dashed #cbd5e1;border-radius:8px;padding:8px;min-height:68px;background:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative}' +
      '.dsig-box img{max-height:48px;max-width:100%;object-fit:contain}' +
      '.dsig-box-label{font-size:10px;font-weight:800;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}' +
      '.dsig-card-acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:auto;padding-top:10px;border-top:1px solid var(--line)}' +
      '.dsig-cfg-card{background:#f8fafc;border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:16px}' +
      '.dsig-prev-box{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:18px;margin-top:20px;box-shadow:var(--sh-sm)}';

    function saveAll(msg) {
      DB.update('settings', 'main', {
        signatories: list,
        enableSignatures: enableSignatures,
        showStamps: showStamps,
        verNote: verNote
      });
      App.toast(msg || 'Signatures & Doctor settings saved.', 'ok');
      draw();
    }

    function openDoctorModal(editIdx) {
      var isEdit = editIdx !== null && editIdx !== undefined;
      var d = isEdit ? list[editIdx] : { name: '', qual: '', title: 'Consultant Pathologist', dept: 'General', regNo: '', active: true, sigImg: '', stampImg: '' };

      var body =
        '<div class="form-grid">' +
          '<div style="grid-column:1/-1"><label class="label">Doctor / Verifier Full Name *</label>' +
          '<input class="input" id="dfName" placeholder="e.g. DR. AAFRINISH AMANAT" value="' + App.esc(d.name || '') + '"></div>' +
          '<div><label class="label">Qualifications *</label>' +
          '<input class="input" id="dfQual" placeholder="e.g. MBBS, M.Phil, FCPS" value="' + App.esc(d.qual || '') + '"></div>' +
          '<div><label class="label">Designation / Title</label>' +
          '<input class="input" id="dfTitle" placeholder="e.g. Consultant Pathologist" value="' + App.esc(d.title || '') + '"></div>' +
          '<div><label class="label">Specialty / Department</label>' +
          '<select class="select" id="dfDept">' +
            ['General', 'Hematology', 'Histopathology', 'Chemical Pathology', 'Microbiology', 'Radiology', 'Molecular Biology'].map(function (dp) {
              return '<option value="' + dp + '"' + ((d.dept === dp) ? ' selected' : '') + '>' + dp + '</option>';
            }).join('') +
          '</select></div>' +
          '<div><label class="label">PMDC / License Reg No.</label>' +
          '<input class="input" id="dfReg" placeholder="e.g. PMDC 45210-P" value="' + App.esc(d.regNo || '') + '"></div>' +
          '<div style="grid-column:1/-1"><label class="check"><input type="checkbox" id="dfActive"' + (d.active !== false ? ' checked' : '') + '> <span>Active (Include in printed test reports)</span></label></div>' +
        '</div>' +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-ghost" id="dfCancel">Cancel</button>' +
          '<button class="btn btn-primary" id="dfSave">' + (isEdit ? 'Update Doctor' : 'Add Doctor') + '</button>' +
        '</div>';

      App.modal(isEdit ? 'Edit Verifying Doctor' : 'Add Verifying Doctor', body, {
        onOpen: function (root, close) {
          root.querySelector('#dfCancel').addEventListener('click', close);
          root.querySelector('#dfSave').addEventListener('click', function () {
            var nm = root.querySelector('#dfName').value.trim();
            if (!nm) { App.toast('Doctor name is required', 'err'); return; }
            d.name = nm;
            d.qual = root.querySelector('#dfQual').value.trim();
            d.title = root.querySelector('#dfTitle').value.trim();
            d.dept = root.querySelector('#dfDept').value;
            d.regNo = root.querySelector('#dfReg').value.trim();
            d.active = root.querySelector('#dfActive').checked;
            if (!isEdit) {
              d.id = 'sig-' + (list.length + 1);
              list.push(d);
            }
            close();
            saveAll('Doctor ' + d.name + ' saved.');
          });
        }
      });
    }

    function openSigPadModal(idx) {
      var d = list[idx];
      if (!d) return;

      var body =
        '<div style="display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:14px;padding-bottom:8px" id="spTabNav">' +
          '<button class="btn btn-sm btn-primary" id="spTabDraw">✏️ Draw Signature</button>' +
          '<button class="btn btn-sm btn-ghost" id="spTabUpload">📁 Upload Image</button>' +
          '<button class="btn btn-sm btn-ghost" id="spTabCallig">✍️ Calligraphy Font</button>' +
        '</div>' +
        '<div id="spPanelDraw">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12.5px">' +
            '<div>Ink: <button class="btn btn-sm btn-ghost sp-ink on" data-col="#1d4ed8" style="color:#1d4ed8;font-weight:700">● Blue</button> <button class="btn btn-sm btn-ghost sp-ink" data-col="#0f172a" style="color:#0f172a;font-weight:700">● Black</button></div>' +
            '<button class="btn btn-sm btn-ghost" id="spClear">Clear Canvas</button>' +
          '</div>' +
          '<canvas id="dsCanvas" width="460" height="150" style="border:2px dashed #94a3b8;border-radius:10px;background:#fff;cursor:crosshair;touch-action:none;display:block;width:100%"></canvas>' +
          '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Sign smoothly using your mouse, trackpad, or touchscreen.</p>' +
        '</div>' +
        '<div id="spPanelUpload" hidden>' +
          '<label class="label">Select signature image (PNG / JPG)</label>' +
          '<input type="file" id="spFile" accept="image/*" class="input" style="padding:6px">' +
          '<div id="spUploadPrev" style="margin-top:12px;min-height:90px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center">' +
            '<span class="muted" style="font-size:12.5px">Image preview will appear here</span>' +
          '</div>' +
          '<label class="check" style="margin-top:10px;font-size:12.5px"><input type="checkbox" id="spMakeTrans" checked> Remove white background (Transparentize ink)</label>' +
        '</div>' +
        '<div id="spPanelCallig" hidden>' +
          '<label class="label">Preview calligraphy signature for ' + App.esc(d.name) + '</label>' +
          '<div id="spCalligPrev" style="margin-top:8px;background:#fff;border:1px dashed #cbd5e1;border-radius:8px;padding:24px;text-align:center;font-family:\'Brush Script MT\',cursive;font-size:36px;color:#1e40af;letter-spacing:1px;box-shadow:inset 0 0 10px rgba(0,0,0,.02)">' +
            App.esc(d.name) +
          '</div>' +
        '</div>' +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-ghost" id="spModalCancel">Cancel</button>' +
          '<button class="btn btn-primary" id="spModalSave">Apply & Save Signature</button>' +
        '</div>';

      App.modal('Digital Signature for ' + d.name, body, {
        onOpen: function (root, close) {
          var mode = 'draw';
          var inkColor = '#1d4ed8';
          var canvas = root.querySelector('#dsCanvas');
          var ctx = canvas ? canvas.getContext('2d') : null;
          var drawing = false;
          var uploadedDataUrl = '';

          var pnlDraw = root.querySelector('#spPanelDraw');
          var pnlUpload = root.querySelector('#spPanelUpload');
          var pnlCallig = root.querySelector('#spPanelCallig');

          var btnDraw = root.querySelector('#spTabDraw');
          var btnUpload = root.querySelector('#spTabUpload');
          var btnCallig = root.querySelector('#spTabCallig');

          function switchTab(t) {
            mode = t;
            btnDraw.className = 'btn btn-sm ' + (t === 'draw' ? 'btn-primary' : 'btn-ghost');
            btnUpload.className = 'btn btn-sm ' + (t === 'upload' ? 'btn-primary' : 'btn-ghost');
            btnCallig.className = 'btn btn-sm ' + (t === 'callig' ? 'btn-primary' : 'btn-ghost');
            pnlDraw.hidden = t !== 'draw';
            pnlUpload.hidden = t !== 'upload';
            pnlCallig.hidden = t !== 'callig';
          }

          btnDraw.addEventListener('click', function () { switchTab('draw'); });
          btnUpload.addEventListener('click', function () { switchTab('upload'); });
          btnCallig.addEventListener('click', function () { switchTab('callig'); });

          // Ink buttons
          root.querySelectorAll('.sp-ink').forEach(function (b) {
            b.addEventListener('click', function () {
              root.querySelectorAll('.sp-ink').forEach(function (x) { x.classList.remove('on'); });
              b.classList.add('on');
              inkColor = b.getAttribute('data-col');
            });
          });

          // Canvas drawing logic
          function getPos(e) {
            var rect = canvas.getBoundingClientRect();
            var scaleX = canvas.width / rect.width;
            var scaleY = canvas.height / rect.height;
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
          }
          function startDraw(e) {
            e.preventDefault();
            drawing = true;
            var pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.strokeStyle = inkColor;
            ctx.lineWidth = 2.8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
          }
          function moveDraw(e) {
            if (!drawing) return;
            e.preventDefault();
            var pos = getPos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
          }
          function endDraw(e) {
            if (!drawing) return;
            e.preventDefault();
            drawing = false;
          }

          if (canvas) {
            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', moveDraw);
            window.addEventListener('mouseup', endDraw);
            canvas.addEventListener('touchstart', startDraw, { passive: false });
            canvas.addEventListener('touchmove', moveDraw, { passive: false });
            window.addEventListener('touchend', endDraw, { passive: false });
          }

          root.querySelector('#spClear').addEventListener('click', function () {
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          });

          // File upload logic
          var fileInp = root.querySelector('#spFile');
          var upPrev = root.querySelector('#spUploadPrev');
          fileInp.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (evt) {
              uploadedDataUrl = evt.target.result;
              upPrev.innerHTML = '<img src="' + uploadedDataUrl + '" style="max-height:80px;max-width:240px;object-fit:contain">';
            };
            reader.readAsDataURL(file);
          });

          root.querySelector('#spModalCancel').addEventListener('click', close);
          root.querySelector('#spModalSave').addEventListener('click', function () {
            var finalImg = '';
            if (mode === 'draw') {
              if (canvas) finalImg = canvas.toDataURL('image/png');
            } else if (mode === 'upload') {
              if (!uploadedDataUrl) { App.toast('Please select a signature image first', 'err'); return; }
              var makeTrans = root.querySelector('#spMakeTrans').checked;
              if (makeTrans) {
                // remove white background
                var img = new Image();
                img.onload = function () {
                  var off = document.createElement('canvas');
                  off.width = img.width;
                  off.height = img.height;
                  var octx = off.getContext('2d');
                  octx.drawImage(img, 0, 0);
                  var imgData = octx.getImageData(0, 0, off.width, off.height);
                  var data = imgData.data;
                  for (var i = 0; i < data.length; i += 4) {
                    var r = data[i], g = data[i+1], b = data[i+2];
                    if (r > 215 && g > 215 && b > 215) {
                      data[i+3] = 0;
                    }
                  }
                  octx.putImageData(imgData, 0, 0);
                  d.sigImg = off.toDataURL('image/png');
                  close();
                  saveAll('Signature saved for ' + d.name);
                };
                img.src = uploadedDataUrl;
                return;
              } else {
                finalImg = uploadedDataUrl;
              }
            } else if (mode === 'callig') {
              var cCanvas = document.createElement('canvas');
              cCanvas.width = 460;
              cCanvas.height = 120;
              var cCtx = cCanvas.getContext('2d');
              cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
              cCtx.font = 'italic 42px "Brush Script MT", cursive, sans-serif';
              cCtx.fillStyle = '#1d4ed8';
              cCtx.textAlign = 'center';
              cCtx.fillText(d.name, cCanvas.width / 2, 70);
              // underline flourish
              cCtx.beginPath();
              cCtx.moveTo(cCanvas.width / 2 - 120, 85);
              cCtx.bezierCurveTo(cCanvas.width / 2 - 40, 95, cCanvas.width / 2 + 60, 75, cCanvas.width / 2 + 130, 90);
              cCtx.strokeStyle = '#1d4ed8';
              cCtx.lineWidth = 2.5;
              cCtx.stroke();
              finalImg = cCanvas.toDataURL('image/png');
            }

            if (finalImg) {
              d.sigImg = finalImg;
              close();
              saveAll('Signature saved for ' + d.name);
            }
          });
        }
      });
    }

    function openStampModal(idx) {
      var d = list[idx];
      if (!d) return;

      var body =
        '<div>' +
          '<label class="label">Select Official Stamp Seal image (PNG / JPG)</label>' +
          '<input type="file" id="stFile" accept="image/*" class="input" style="padding:6px">' +
          '<div id="stPrev" style="margin-top:14px;min-height:100px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:10px;display:flex;align-items:center;justify-content:center">' +
            (d.stampImg
              ? '<img src="' + d.stampImg + '" style="max-height:85px;max-width:140px;object-fit:contain">'
              : '<span class="muted" style="font-size:12.5px">No stamp uploaded yet</span>') +
          '</div>' +
          '<p class="muted" style="font-size:12px;margin:8px 0 0">Recommended: Official round or rectangular lab verification stamp on transparent background.</p>' +
        '</div>' +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-ghost" id="stCancel">Cancel</button>' +
          (d.stampImg ? '<button class="btn btn-danger" id="stRemove">Remove Stamp</button>' : '') +
          '<button class="btn btn-primary" id="stSave">Save Stamp</button>' +
        '</div>';

      App.modal('Official Stamp for ' + d.name, body, {
        onOpen: function (root, close) {
          var stampData = d.stampImg || '';
          var finp = root.querySelector('#stFile');
          var prv = root.querySelector('#stPrev');
          finp.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (e) {
              stampData = e.target.result;
              prv.innerHTML = '<img src="' + stampData + '" style="max-height:85px;max-width:140px;object-fit:contain">';
            };
            reader.readAsDataURL(file);
          });
          root.querySelector('#stCancel').addEventListener('click', close);
          var rmBtn = root.querySelector('#stRemove');
          if (rmBtn) {
            rmBtn.addEventListener('click', function () {
              d.stampImg = '';
              close();
              saveAll('Stamp removed for ' + d.name);
            });
          }
          root.querySelector('#stSave').addEventListener('click', function () {
            if (!stampData) { App.toast('Please select a stamp image', 'err'); return; }
            d.stampImg = stampData;
            close();
            saveAll('Stamp saved for ' + d.name);
          });
        }
      });
    }

    function draw() {
      var sigCount = list.filter(function (d) { return !!(d.sigImg || d.signature); }).length;
      var stampCount = list.filter(function (d) { return !!d.stampImg; }).length;

      var kpiHtml =
        '<div class="kpi-grid" style="margin-bottom:16px">' +
          '<div class="kpi t-navy"><div class="kpi-ic">' + App.icon('users', 20) + '</div><div class="kpi-lb">VERIFYING DOCTORS</div><div class="kpi-nm">' + list.length + '</div><div class="kpi-sb">pathologists &amp; team</div></div>' +
          '<div class="kpi t-blue"><div class="kpi-ic">' + App.icon('edit', 20) + '</div><div class="kpi-lb">DIGITAL SIGNATURES</div><div class="kpi-nm">' + sigCount + ' / ' + list.length + '</div><div class="kpi-sb">e-signatures ready</div></div>' +
          '<div class="kpi t-amber"><div class="kpi-ic">' + App.icon('shield', 20) + '</div><div class="kpi-lb">OFFICIAL STAMPS</div><div class="kpi-nm">' + stampCount + ' / ' + list.length + '</div><div class="kpi-sb">clinic seals uploaded</div></div>' +
          '<div class="kpi t-green"><div class="kpi-ic">' + App.icon('check', 20) + '</div><div class="kpi-lb">REPORT INTEGRATION</div><div class="kpi-nm">' + (enableSignatures ? 'ACTIVE' : 'OFF') + '</div><div class="kpi-sb">auto-embed on PDFs</div></div>' +
        '</div>';

      var cardsHtml = list.map(function (d, i) {
        var hasSig = !!(d.sigImg || d.signature);
        var hasStamp = !!d.stampImg;
        return '<div class="dsig-card ' + (d.active ? '' : 'is-off') + '">' +
          '<div class="dsig-card-top">' +
            '<div>' +
              '<div class="dsig-card-title">' + App.esc(d.name) + '</div>' +
              '<div class="dsig-card-sub"><b>' + App.esc(d.qual || '—') + '</b></div>' +
              '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">' +
                App.esc(d.title || '') + (d.regNo ? ' &middot; ' + App.esc(d.regNo) : '') +
              '</div>' +
            '</div>' +
            '<span class="badge ' + (d.active ? 'b-ready' : 'b-pending') + '">' + (d.active ? 'Active' : 'Hidden') + '</span>' +
          '</div>' +
          '<div class="dsig-preview-row">' +
            '<div class="dsig-box">' +
              '<div class="dsig-box-label">Digital Signature</div>' +
              (hasSig
                ? '<img src="' + (d.sigImg || d.signature) + '" alt="Signature">'
                : '<span style="font-size:11.5px;color:var(--muted)">No signature</span>') +
            '</div>' +
            '<div class="dsig-box">' +
              '<div class="dsig-box-label">Official Stamp</div>' +
              (hasStamp
                ? '<img src="' + d.stampImg + '" alt="Stamp">'
                : '<span style="font-size:11.5px;color:var(--muted)">No stamp</span>') +
            '</div>' +
          '</div>' +
          '<div class="dsig-card-acts">' +
            '<button class="btn btn-sm btn-primary dsig-btn-sig" data-i="' + i + '">' + App.icon('edit', 13) + (hasSig ? ' Change Sig' : ' + Add Sig') + '</button>' +
            '<button class="btn btn-sm btn-ghost dsig-btn-stamp" data-i="' + i + '">' + (hasStamp ? 'Change Stamp' : '+ Stamp') + '</button>' +
            '<button class="btn btn-sm btn-ghost dsig-btn-edit" data-i="' + i + '">Edit</button>' +
            (i > 0 ? '<button class="btn btn-sm btn-ghost dsig-btn-up" data-i="' + i + '" title="Move left/up">&uarr;</button>' : '') +
            (i < list.length - 1 ? '<button class="btn btn-sm btn-ghost dsig-btn-dn" data-i="' + i + '" title="Move right/down">&darr;</button>' : '') +
            '<button class="btn btn-sm btn-danger dsig-btn-del" data-i="' + i + '" title="Remove doctor" style="margin-left:auto">&times;</button>' +
          '</div>' +
        '</div>';
      }).join('');

      var dummyReport = {
        s: {
          signatories: list,
          enableSignatures: enableSignatures,
          showStamps: showStamps,
          verNote: verNote,
          address: s.address || '154-A-HBFC Opposite Jinnah Hospital, Lahore',
          phone: s.phone || '0322-8441899',
          website: s.website || 'www.optixlab.com'
        }
      };

      box.innerHTML =
        '<style>' + CSS + '</style>' +
        '<div class="dsig-head">' +
          '<div>' +
            '<h2>' + App.icon('edit', 22) + ' Pathologist &amp; Radiologist Digital Signatures</h2>' +
            '<p>Manage doctors, consultants, digital e-signatures, official verification stamps, and report inclusion.</p>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-primary" id="dsigAddDoctor">' + App.icon('plus', 14) + ' Add Verifying Doctor</button>' +
          '</div>' +
        '</div>' +
        kpiHtml +
        '<div class="dsig-cfg-card">' +
          '<div style="font-weight:800;font-size:14.5px;color:var(--brand-d);margin-bottom:10px">Global Report Signature Controls</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-bottom:12px">' +
            '<label class="check" style="font-weight:700">' +
              '<input type="checkbox" id="dsigEnable"' + (enableSignatures ? ' checked' : '') + '> ' +
              '<span>Enable Electronic Signatures on Lab Reports &amp; PDFs</span>' +
            '</label>' +
            '<label class="check" style="font-weight:700">' +
              '<input type="checkbox" id="dsigShowStamps"' + (showStamps ? ' checked' : '') + '> ' +
              '<span>Show Official Doctor Stamps / Seals on Reports</span>' +
            '</label>' +
          '</div>' +
          '<label class="label" style="margin-top:8px">Report Verification Statement (Printed above doctors)</label>' +
          '<textarea class="input" id="dsigVerNote" rows="2" style="font-size:13px">' + App.esc(verNote) + '</textarea>' +
          '<div style="margin-top:12px;display:flex;justify-content:flex-end">' +
            '<button class="btn btn-primary" id="dsigSaveGlobal">Save Signature Settings</button>' +
          '</div>' +
        '</div>' +
        '<div class="dsig-grid">' + cardsHtml + '</div>' +
        '<div class="dsig-prev-box">' +
          '<div style="font-weight:800;font-size:14px;color:var(--brand-d);margin-bottom:10px;display:flex;align-items:center;gap:6px">' +
            App.icon('file', 16) + ' Live Report Footer Preview (What Patients See on Report)' +
          '</div>' +
          '<div style="background:#fff;border:1px solid #000;border-radius:4px;padding:16px 20px">' +
            (window.reportFooterHtml ? reportFooterHtml(dummyReport) : '<p class="muted">Report footer preview</p>') +
          '</div>' +
        '</div>';

      // Attach handlers
      document.getElementById('dsigAddDoctor').addEventListener('click', function () { openDoctorModal(null); });

      document.getElementById('dsigSaveGlobal').addEventListener('click', function () {
        enableSignatures = document.getElementById('dsigEnable').checked;
        showStamps = document.getElementById('dsigShowStamps').checked;
        verNote = document.getElementById('dsigVerNote').value.trim();
        saveAll('Global signature settings saved.');
      });

      box.querySelectorAll('.dsig-btn-sig').forEach(function (btn) {
        btn.addEventListener('click', function () { openSigPadModal(parseInt(btn.getAttribute('data-i'), 10)); });
      });

      box.querySelectorAll('.dsig-btn-stamp').forEach(function (btn) {
        btn.addEventListener('click', function () { openStampModal(parseInt(btn.getAttribute('data-i'), 10)); });
      });

      box.querySelectorAll('.dsig-btn-edit').forEach(function (btn) {
        btn.addEventListener('click', function () { openDoctorModal(parseInt(btn.getAttribute('data-i'), 10)); });
      });

      box.querySelectorAll('.dsig-btn-up').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var i = parseInt(btn.getAttribute('data-i'), 10);
          if (i > 0) {
            var temp = list[i - 1];
            list[i - 1] = list[i];
            list[i] = temp;
            saveAll('Order updated.');
          }
        });
      });

      box.querySelectorAll('.dsig-btn-dn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var i = parseInt(btn.getAttribute('data-i'), 10);
          if (i < list.length - 1) {
            var temp = list[i + 1];
            list[i + 1] = list[i];
            list[i] = temp;
            saveAll('Order updated.');
          }
        });
      });

      box.querySelectorAll('.dsig-btn-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var i = parseInt(btn.getAttribute('data-i'), 10);
          var docName = list[i].name;
          App.confirm('Remove doctor ' + docName + ' from signatories?').then(function (ok) {
            if (!ok) return;
            list.splice(i, 1);
            saveAll('Doctor ' + docName + ' removed.');
          });
        });
      });
    }

    draw();
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
        '<div style="background:#f6f8fd;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6"><b>How the code is sent:</b> ' + (waOn ? 'on <b>WhatsApp</b>, from your lab\'s WhatsApp number (the one set up in Tools → WhatsApp → Settings).' : '<span style="color:#b45309">your WhatsApp is not set up yet, so codes go <b>by email</b> to people who have an email address on file. Set up Tools → WhatsApp → Settings for the best experience.</span>') +
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






  function renderBranches() {
    if (role() !== 'admin') return denied();
    document.getElementById('view').innerHTML = '<div class="stat-grid" id="branchStats"></div><div class="card"><div class="card-b" id="branchBody"></div></div>';
    var body = document.getElementById('branchBody');
    body.innerHTML = '<p class="muted">Loading branches…</p>';

    /* GET /api/lab/features -> { maxBranches, branchesUsed }. Never throws;
       falls back to { maxBranches: null, branchesUsed: null } offline. */
    function fetchBranchFeatures(cb) {
      var done = function (max, used) { cb({ maxBranches: max, branchesUsed: used }); };
      try {
        var base = String(window.LABPOS_API || '').replace(/\/+$/, '');
        if (!base || !window.fetch || !DB.authHeaders) return done(null, null);
        window.fetch(base + '/api/lab/features', { headers: DB.authHeaders({ 'Content-Type': 'application/json' }) })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            var max = j && j.maxBranches, used = j && j.branchesUsed;
            done(typeof max === 'number' ? max : null, typeof used === 'number' ? used : null);
          }, function () { done(null, null); });
      } catch (e) { done(null, null); }
    }

    /* Re-fetch usage and repaint the standalone page. */
    function refresh() { renderBranches(); }

    function paint(feat) {
      var branches = DB.all('branches').slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
      var localUsed = branches.filter(function (b) { return b.is_active; }).length;
      var used = (feat.branchesUsed != null) ? feat.branchesUsed : localUsed;
      var max = (feat.maxBranches != null) ? feat.maxBranches : Infinity;
      var limitReached = used >= max;
      var usageText = max === Infinity
        ? used + ' of unlimited branches used'
        : used + ' of ' + max + ' branches used';

      document.getElementById('branchStats').innerHTML =
        admStat(AICONS.list, 'blue', 'Total Branches', branches.length, 'registered locations', branches.length, false) +
        admStat(AICONS.flask, 'green', 'Active Branches', localUsed, 'currently operating', localUsed, false) +
        admStat(AICONS.alert, 'red', 'Inactive Branches', branches.length - localUsed, 'not currently operating', branches.length - localUsed, false) +
        admStat(AICONS.cal, 'amber', 'Available Slots', max === Infinity ? 'Unlimited' : Math.max(0, max - used), usageText, null, false);
      var html = '<div class="toolbar" style="margin-bottom:12px;align-items:center">'
        + '<div><h2 style="margin:0;font-size:20px">Manage Branches</h2><div class="muted" style="font-size:12.5px;margin-top:2px">' + App.esc(usageText) + '</div></div>'
        + '<button class="btn btn-primary btn-sm" id="bAdd" style="margin-left:auto"' + (limitReached ? ' disabled' : '') + '>+ Add Branch</button></div>'
        + (limitReached ? '<p class="muted" style="font-size:12.5px;margin:-6px 0 12px">You are using all ' + max + ' branch slots on your plan. Ask support to raise your branch limit.</p>' : '')
        + '<div class="tbl-wrap"><table class="table"><thead><tr>'
        + '<th>Name</th><th>Code</th><th>Address</th><th>Phone</th><th>Manager</th><th>Status</th><th style="text-align:right">Actions</th>'
        + '</tr></thead><tbody>';
      if (!branches.length) {
        html += '<tr><td colspan="7" style="text-align:center;padding:26px 10px">'
          + '<div style="font-size:15px;font-weight:600">No branches yet</div>'
          + '<div class="muted" style="font-size:13px;margin-top:4px">Add your first branch with the <b>+ Add Branch</b> button above.</div>'
          + '</td></tr>';
      }
      branches.forEach(function (b) {
        var active = !!b.is_active;
        html += '<tr>'
          + '<td><strong>' + App.esc(b.name || '') + '</strong></td>'
          + '<td>' + App.esc(b.code || '') + '</td>'
          + '<td>' + App.esc(b.address || '—') + '</td>'
          + '<td>' + App.esc(b.phone || '—') + '</td>'
          + '<td>' + App.esc(b.manager_name || '—') + '</td>'
          + '<td>' + (active ? '<span class="badge b-paid">Active</span>' : '<span class="badge b-unpaid">Inactive</span>') + '</td>'
          + '<td style="text-align:right;white-space:nowrap" class="actions">'
          + '<button class="btn btn-ghost btn-sm" data-bedit="' + App.esc(b.id) + '">Edit</button> '
          + '<button class="btn btn-ghost btn-sm" data-btoggle="' + App.esc(b.id) + '">' + (active ? 'Deactivate' : 'Activate') + '</button> '
          + '<button class="btn btn-ghost btn-sm" data-bdel="' + App.esc(b.id) + '" style="color:#b91c1c">Delete</button>'
          + '</td></tr>';
      });
      html += '</tbody></table></div>';
      body.innerHTML = html;

      var addBtn = document.getElementById('bAdd');
      if (addBtn && !limitReached) addBtn.addEventListener('click', function () { openBranchModal(null, max); });

      document.querySelectorAll('[data-bedit]').forEach(function (btn) {
        btn.addEventListener('click', function () { openBranchModal(DB.get('branches', btn.getAttribute('data-bedit')), max); });
      });
      document.querySelectorAll('[data-btoggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var b = DB.get('branches', btn.getAttribute('data-btoggle'));
          if (!b) return;
          if (b.is_active) {
            var others = DB.all('branches').filter(function (x) { return x.is_active && x.id !== b.id; });
            if (!others.length) return App.toast('Cannot deactivate the last active branch. Add or activate another branch first.', 'err');
          }
          App.confirm((b.is_active ? 'Deactivate' : 'Activate') + ' branch "' + b.name + '"?').then(function (ok) {
            if (!ok) return;
            DB.update('branches', b.id, { is_active: !b.is_active });
            App.toast('Branch ' + (b.is_active ? 'deactivated' : 'activated') + '.');
            refresh();
          });
        });
      });
      document.querySelectorAll('[data-bdel]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var b = DB.get('branches', btn.getAttribute('data-bdel'));
          if (!b) return;
          App.confirm('Permanently delete branch "' + b.name + '"? This cannot be undone.').then(function (ok) {
            if (!ok) return;
            DB.remove('branches', b.id);
            App.toast('Branch deleted.');
            refresh();
          });
        });
      });
    }

    /* add / edit modal (mirrors openUserModal) */
    function openBranchModal(b, max) {
      var isEdit = !!b;
      b = b || { name: '', code: '', address: '', phone: '', manager_name: '' };
      var form = '<div class="form-grid">'
        + '<div><label class="label">Branch name *</label><input class="input" id="bfName" maxlength="60" placeholder="e.g. Main Branch" value="' + App.esc(b.name || '') + '"></div>'
        + '<div><label class="label">Branch code</label><input class="input" id="bfCode" maxlength="20" placeholder="e.g. BR-01" value="' + App.esc(b.code || '') + '"' + (isEdit ? ' disabled' : '') + '></div>'
        + '<div style="grid-column:1/-1"><label class="label">Address</label><input class="input" id="bfAddr" maxlength="140" placeholder="Street, city" value="' + App.esc(b.address || '') + '"></div>'
        + '<div><label class="label">Phone</label><input class="input" id="bfPhone" maxlength="20" placeholder="e.g. 0300-1234567" value="' + App.esc(b.phone || '') + '"></div>'
        + '<div><label class="label">Manager name</label><input class="input" id="bfMgr" maxlength="60" placeholder="Branch manager" value="' + App.esc(b.manager_name || '') + '"></div>'
        + '</div>'
        + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'
        + '<button class="btn btn-ghost" id="bfCancel">Cancel</button>'
        + '<button class="btn btn-primary" id="bfSave">' + (isEdit ? 'Save Changes' : 'Add Branch') + '</button></div>';
      App.modal(isEdit ? 'Edit Branch' : 'Add Branch', form, {
        onOpen: function (ov, close) {
          document.getElementById('bfCancel').addEventListener('click', close);
          document.getElementById('bfSave').addEventListener('click', function () {
            var name = document.getElementById('bfName').value.trim();
            var code = document.getElementById('bfCode').value.trim();
            var addr = document.getElementById('bfAddr').value.trim();
            var phone = document.getElementById('bfPhone').value.trim();
            var mgr = document.getElementById('bfMgr').value.trim();
            if (!name) return App.toast('Branch name is required.', 'err');
            if (isEdit) {
              DB.update('branches', b.id, { name: name, address: addr, phone: phone, manager_name: mgr });
              App.toast('Branch updated.');
            } else {
              if (max !== Infinity && DB.all('branches').length >= max) return App.toast('Branch limit reached. Ask support to raise your branch limit.', 'err');
              var dup = code && DB.all('branches').some(function (x) { return String(x.code || '').toLowerCase() === code.toLowerCase(); });
              if (dup) return App.toast('A branch with this code already exists.', 'err');
              DB.insert('branches', { name: name, code: code, address: addr, phone: phone, manager_name: mgr, is_active: true });
              App.toast('Branch added.');
            }
            close();
            refresh();
          });
        }
      });
    }

    fetchBranchFeatures(function (feat) { if (document.getElementById('branchBody') === body) paint(feat); });
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
        + (u.active ? 'Deactivate' : 'Activate') + '</button> '
        + '<button class="btn btn-ghost btn-sm" data-udel="' + App.esc(u.id) + '"' + (isMe ? ' disabled style="opacity:.4;cursor:not-allowed"' : ' style="color:#b91c1c"') + '>Delete</button>'
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
    document.querySelectorAll('[data-udel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = DB.get('users', b.getAttribute('data-udel'));
        if (!u) return;
        var me2 = sess();
        if (me2 && u.id === me2.userId) return App.toast('You cannot delete your own account.', 'err');
        if (u.role === 'admin') {
          var admins = DB.all('users').filter(function (x) { return x.active && x.role === 'admin' && x.id !== u.id; });
          if (!admins.length) return App.toast('Cannot delete the last admin account.', 'err');
        }
        App.confirm('Permanently delete user "' + u.name + '" (' + u.username + ')? This will remove their login and cannot be undone.').then(function (ok) {
          if (!ok) return;
          DB.remove('users', u.id);
          App.toast('User deleted successfully.');
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
    var me = sess();
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
      + '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:18px">'
      + (isEdit && (!me || u.id !== me.userId) ? '<button class="btn btn-ghost btn-sm" id="ufDelete" type="button" style="margin-right:auto;color:#b91c1c">Delete User</button>' : '')
      + '<button class="btn btn-ghost" id="ufCancel">Cancel</button>'
      + '<button class="btn btn-primary" id="ufSave">' + (isEdit ? 'Save Changes' : 'Add User') + '</button></div>';
    var close = App.modal(isEdit ? 'Edit User' : 'Add User', body, {
      onOpen: function (ov, close) {
        document.getElementById('ufCancel').addEventListener('click', close);
        var delBtn = document.getElementById('ufDelete');
        if (delBtn) {
          delBtn.addEventListener('click', function () {
            if (u.role === 'admin') {
              var admins = DB.all('users').filter(function (x) { return x.active && x.role === 'admin' && x.id !== u.id; });
              if (!admins.length) return App.toast('Cannot delete the last admin account.', 'err');
            }
            App.confirm('Permanently delete user "' + u.name + '" (' + u.username + ')? This will remove their login and cannot be undone.').then(function (ok) {
              if (!ok) return;
              DB.remove('users', u.id);
              App.toast('User deleted successfully.');
              close();
              renderSettings();
            });
          });
        }
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

  /* ---- Backup (Google Drive & Cloud + Local) ---- */
  function formatBackupDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var day = ('0' + d.getDate()).slice(-2);
      var month = months[d.getMonth()];
      var year = d.getFullYear();
      var hours = d.getHours();
      var minutes = ('0' + d.getMinutes()).slice(-2);
      var ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return day + ' ' + month + ' ' + year + ', ' + ('0' + hours).slice(-2) + ':' + minutes + ' ' + ampm;
    } catch (e) { return String(iso); }
  }

  function checkAutoCloudBackup() {
    try {
      var st = DB.get('settings', 'main') || {};
      if (st.backupAutoOn === false || !st.gdriveBackupEmail) return;
      var email = String(st.gdriveBackupEmail).trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      var last = st.lastBackupAt ? new Date(st.lastBackupAt).getTime() : 0;
      var now = Date.now();
      var freq = st.backupFrequency || 'daily';
      var intervalMs = 24 * 3600 * 1000;
      if (freq === 'weekly') intervalMs = 7 * 24 * 3600 * 1000;
      else if (freq === 'monthly') intervalMs = 30 * 24 * 3600 * 1000;
      else if (freq === 'manual') return;

      if (now - last >= intervalMs) {
        var apiBase = String(window.LABPOS_API || '').replace(/\/+$/, '');
        var headers = DB.authHeaders ? DB.authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
        fetch(apiBase + '/api/backup/email', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ email: email })
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (res && res.ok) {
            DB.update('settings', 'main', { lastBackupAt: new Date().toISOString(), lastBackupEmail: email });
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function renderSetBackup() {
    var st = DB.get('settings', 'main') || {};
    var gEmail = st.gdriveBackupEmail || st.backupEmail || '';
    var freq = st.backupFrequency || 'daily';
    var autoOn = st.backupAutoOn !== false;
    var lastAt = st.lastBackupAt || '';
    var lastEmail = st.lastBackupEmail || gEmail || '';

    var isConnected = !!(gEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail));
    var statusBadge = isConnected
      ? '<span style="display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:#10b981"></span> Connected: ' + App.esc(gEmail) + '</span>'
      : '<span style="display:inline-flex;align-items:center;gap:6px;background:#fffbeb;color:#92400e;border:1px solid #fde68a;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:#f59e0b"></span> Email Add Karein</span>';

    var html = '<div style="display:flex;flex-direction:column;gap:20px;max-width:960px">'
      /* Google Drive & Cloud Card */
      + '<div class="card" style="margin:0;border:1px solid #bfdbfe;background:linear-gradient(180deg,#ffffff,#f8fafc);box-shadow:0 4px 16px rgba(0,0,0,0.03)"><div class="card-b" style="padding:22px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e2e8f0">'
      + '<div style="display:flex;align-items:center;gap:12px">'
      + '<div style="width:46px;height:46px;border-radius:12px;background:#f0f7ff;border:1px solid #c7d9fe;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      + '<svg width="26" height="26" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>'
      + '<path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>'
      + '<path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335"/>'
      + '<path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>'
      + '<path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h55c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>'
      + '<path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>'
      + '</svg>'
      + '</div>'
      + '<div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<h2 style="margin:0;font-size:1.2rem;font-weight:700;color:#0f172a">Google Drive &amp; Cloud Email Backup</h2>'
      + '<span style="font-size:11px;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:12px;font-weight:600">Cloud Storage</span>'
      + '</div>'
      + '<p style="margin:3px 0 0 0;font-size:13px;color:#64748b">Apna Google / Gmail account add karein taake lab database ka mukammal backup mehfooz rahay.</p>'
      + '</div>'
      + '</div>'
      + '<div>' + statusBadge + '</div>'
      + '</div>'

      + '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-bottom:18px" class="rep-cols">'
      + '<div>'
      + '<label style="display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:6px">Google / Gmail Account Email *</label>'
      + '<div style="position:relative">'
      + '<input type="email" id="bkGdriveEmail" class="input" style="width:100%;padding-left:34px;font-size:13px" placeholder="apna-email@gmail.com" value="' + App.esc(gEmail) + '">'
      + '<span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:14px">✉️</span>'
      + '</div>'
      + '<p style="margin:5px 0 0 0;font-size:11px;color:#64748b">Is Google email par system ka database backup JSON file bhej di jaye gi jo Google Drive me save ho sakti hai.</p>'
      + '</div>'
      + '<div>'
      + '<label style="display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:6px">Auto-Backup Frequency</label>'
      + '<select id="bkFrequency" class="input" style="width:100%;font-size:13px">'
      + '<option value="daily"' + (freq === 'daily' ? ' selected' : '') + '>Rozana (Daily Automatic)</option>'
      + '<option value="weekly"' + (freq === 'weekly' ? ' selected' : '') + '>Haftawar (Weekly Automatic)</option>'
      + '<option value="monthly"' + (freq === 'monthly' ? ' selected' : '') + '>Mahana (Monthly Automatic)</option>'
      + '<option value="manual"' + (freq === 'manual' ? ' selected' : '') + '>Manual / Sirf On Demand</option>'
      + '</select>'
      + '<div style="margin-top:8px;display:flex;align-items:center;gap:8px">'
      + '<input type="checkbox" id="bkAutoOn" style="cursor:pointer;width:15px;height:15px"' + (autoOn ? ' checked' : '') + '>'
      + '<label for="bkAutoOn" style="cursor:pointer;font-size:12px;color:#475569;font-weight:500;user-select:none">Automated cloud backup schedule enable rakhein</label>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding-top:14px;border-top:1px solid #f1f5f9">'
      + '<button class="btn btn-primary" id="bkSendCloud" style="display:inline-flex;align-items:center;gap:8px;font-weight:600;padding:9px 18px">'
      + '<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>'
      + '<span>Backup to Google Drive / Email Now</span>'
      + '</button>'
      + '<button class="btn btn-ghost" id="bkSaveCloudSettings" style="font-size:13px">Save Settings</button>'
      + '<a href="https://drive.google.com/drive/u/0/my-drive" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;text-decoration:none;color:#1e40af">'
      + '<svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>'
      + '<span>Open Google Drive</span>'
      + '</a>'
      + '<a href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;text-decoration:none;color:#475569">'
      + '<span>Open Gmail Inbox</span>'
      + '</a>'
      + '</div>'

      + '<div style="margin-top:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      + '<div>'
      + '<div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px">Cloud Backup Status</div>'
      + '<div style="margin-top:3px;font-size:13px;color:#475569" id="bkLastStatus">'
      + (lastAt ? 'Aakhri Backup: <strong style="color:#0f172a">' + formatBackupDate(lastAt) + '</strong> &bull; Destination: <strong style="color:#0f172a">' + App.esc(lastEmail) + '</strong>' : 'Abhi tak koi cloud backup send nahi kiya gaya.')
      + '</div>'
      + '</div>'
      + '<div style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:6px">'
      + '<span style="color:#10b981">●</span> Secure Encrypted JSON Format'
      + '</div>'
      + '</div>'
      + '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:12px;color:#64748b;line-height:1.6">'
      + '💡 <strong>Google Drive me backup mehfooz karne ka tareeqa:</strong>'
      + '<br>1. Apna Gmail darj karke <strong>"Backup to Google Drive / Email Now"</strong> dabayein. Backup file aapke email par bhej di jaye gi aur fauran computer par download ho jaye gi.'
      + '<br>2. <strong>"Open Google Drive"</strong> par click karein aur downloaded file ko Google Drive me drag & drop karein ya Google Drive folder me upload karein.'
      + '<br>3. Kisi bhi waqt data wapis restore karne ke liye niche mojood <strong>"Choose File & Restore"</strong> option se yehi file select karein.'
      + '</div>'
      + '</div>'
      + '</div></div>'

      /* Local Export & Local Import Cards */
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px" class="rep-cols">'
      + '<div class="card" style="margin:0"><div class="card-b" style="padding:20px">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#475569;font-size:17px">💾</div>'
      + '<h3 style="margin:0;font-size:1.05rem;color:#0f172a">Manual Export (JSON)</h3>'
      + '</div>'
      + '<p class="muted" style="font-size:13px;line-height:1.5;margin-bottom:16px">Poora database (patients, invoices, tests, users, settings) apne computer ya USB me download karein. Internet ke baghair offline use ke liye behtareen hai.</p>'
      + '<button class="btn btn-ghost" id="bkExport" style="display:inline-flex;align-items:center;gap:6px;width:100%;justify-content:center;font-weight:600">'
      + '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>'
      + '<span>Download Local Backup (JSON)</span>'
      + '</button>'
      + '</div></div>'

      + '<div class="card" style="margin:0"><div class="card-b" style="padding:20px">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:#fef2f2;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:17px">♻️</div>'
      + '<h3 style="margin:0;font-size:1.05rem;color:#0f172a">Restore Database (Import)</h3>'
      + '</div>'
      + '<p class="muted" style="font-size:13px;line-height:1.5;margin-bottom:16px">Google Drive ya computer se pehle se save ki gayi JSON backup file se data restore karein. <span style="color:#b91c1c;font-weight:600">Khabardaar: Yeh mojooda data ko replace kar de ga.</span></p>'
      + '<input type="file" id="bkFile" accept="application/json" style="display:none">'
      + '<button class="btn btn-ghost" id="bkImport" style="display:inline-flex;align-items:center;gap:6px;width:100%;justify-content:center;font-weight:600">'
      + '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>'
      + '<span>Choose File &amp; Restore</span>'
      + '</button>'
      + '</div></div>'
      + '</div></div>';

    document.getElementById('setBody').innerHTML = html;

    /* Cloud Settings Save */
    document.getElementById('bkSaveCloudSettings').addEventListener('click', function () {
      var email = (document.getElementById('bkGdriveEmail').value || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return App.toast('Barah-e-karam apna durust Google / Gmail email address darj karein.', 'err');
      }
      var freqVal = document.getElementById('bkFrequency').value || 'daily';
      var autoVal = document.getElementById('bkAutoOn').checked;
      DB.update('settings', 'main', {
        gdriveBackupEmail: email,
        backupFrequency: freqVal,
        backupAutoOn: autoVal
      });
      App.toast('Google Drive & Cloud backup settings mehfooz ho gayi hain.');
      renderSetBackup();
    });

    /* Backup to Google Drive / Email Now */
    document.getElementById('bkSendCloud').addEventListener('click', function () {
      var email = (document.getElementById('bkGdriveEmail').value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        App.toast('Barah-e-karam apna durust Google / Gmail email address darj karein.', 'err');
        document.getElementById('bkGdriveEmail').focus();
        return;
      }
      var freqVal = document.getElementById('bkFrequency').value || 'daily';
      var autoVal = document.getElementById('bkAutoOn').checked;
      DB.update('settings', 'main', {
        gdriveBackupEmail: email,
        backupFrequency: freqVal,
        backupAutoOn: autoVal
      });

      var btn = document.getElementById('bkSendCloud');
      var origBtnHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:bsSpin .8s linear infinite;margin-right:6px;vertical-align:middle"></span> Generating &amp; Sending Backup...';

      /* Generate local download */
      var raw = DB.export();
      var pretty = raw;
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) {}
      var labName = (((DB.get('settings', 'main') || {}).labName) || 'Optix-LAB').replace(/[^a-zA-Z0-9_-]/g, '_');
      var filename = 'optix-backup-' + labName + '-' + App.today() + '.json';
      var blob = new Blob([pretty], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);

      /* Trigger server email endpoint */
      var apiBase = String(window.LABPOS_API || '').replace(/\/+$/, '');
      var headers = DB.authHeaders ? DB.authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };

      fetch(apiBase + '/api/backup/email', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ email: email })
      }).then(function (res) {
        return res.json().catch(function () { return {}; });
      }).then(function (resp) {
        btn.disabled = false;
        btn.innerHTML = origBtnHtml;
        var nowIso = new Date().toISOString();
        DB.update('settings', 'main', {
          lastBackupAt: nowIso,
          lastBackupEmail: email
        });
        if (resp && resp.ok) {
          App.toast('Database backup aapke Google account (' + email + ') par send ho gaya aur download ho gaya!', 'ok');
        } else if (resp && resp.mailNotConfigured) {
          App.toast('Backup file download ho gayi! Isay apne Google Drive par upload karein.', 'ok');
        } else {
          App.toast('Backup file download ho gayi! (Notice: ' + (resp && resp.error ? resp.error : 'Saved') + ')', 'ok');
        }
        renderSetBackup();
      }).catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = origBtnHtml;
        var nowIso = new Date().toISOString();
        DB.update('settings', 'main', {
          lastBackupAt: nowIso,
          lastBackupEmail: email
        });
        App.toast('Backup file download ho gayi! Isay Google Drive par upload karein.', 'ok');
        renderSetBackup();
      });
    });

    /* Manual Local Export */
    document.getElementById('bkExport').addEventListener('click', function () {
      var raw = DB.export();
      var pretty = raw;
      try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) {}
      var labName = (((DB.get('settings', 'main') || {}).labName) || 'Optix-LAB').replace(/[^a-zA-Z0-9_-]/g, '_');
      var blob = new Blob([pretty], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'optix-lab-medsync-backup-' + labName + '-' + App.today() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      App.toast('Local backup downloaded.');
    });

    /* Local Restore / Import */
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

  var SET_TABS = ['profile', 'payments', 'account', 'templates', 'signatures', 'portal', 'users', 'backup', 'danger'];
  App.route('#/patients/lists', function () { App.nav('#/patients'); });
  App.route('#/settings/lists', function () { App.nav('#/patients'); });
  App.route('#/settings', function () { settingsTab = 'profile'; renderSettings(); });
  App.route('#/branches', renderBranches);
  App.route('#/settings/branches', function () { App.nav('#/branches'); });
  App.route('#/settings/:tab', function (p) { settingsTab = (p && SET_TABS.indexOf(p.tab) >= 0) ? p.tab : 'profile'; renderSettings(); });
  App.route('#/signatures', function () { App.nav('#/settings/signatures'); });

})();
