/* ============================================================
   Optix LAB MedSync — Admin module (Agent 10)
   Routes: #/expenses, #/reports, #/settings
   Depends on: window.DB, window.App (per SPEC.md)
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  var PRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
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

  var EXP_CATS = ['Rent', 'Salaries', 'Reagents', 'Utilities', 'Other'];

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
  function admStat(icon, tint, label, value, sub, raw, isMoney, vlStyle) {
    var countAttrs = (typeof raw === 'number' && isFinite(raw))
      ? ' data-count="' + raw + '" data-money="' + (isMoney ? '1' : '0') + '"'
      : '';
    return '<div class="stat" data-tint="' + tint + '" style="--sc:var(--' + tint + ')">' +
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
    if (role() !== 'admin' && role() !== 'reception') return denied();
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
      + EXP_CATS.map(function (c) { return '<option value="' + c + '"' + (exp.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('')
      + '</select></div>'
      + '<div><label class="label">Amount (Rs) *</label><input class="input" id="exfAmt" type="number" min="1" step="any" value="' + App.esc(exp.amount) + '" placeholder="0"></div>'
      + '<div><label class="label">Date *</label><input class="input" id="exfDate" type="date" value="' + App.esc(toDay(exp.date) || App.today()) + '"></div>'
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
          var data = { title: title, category: cat, amount: amt, date: date, note: note, createdBy: userName() };
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
  var rep = { from: null, to: null };
  function repInit() {
    if (!rep.from) {
      var t = App.today();
      rep.from = t.slice(0, 8) + '01'; // first of month
      rep.to = t;
    }
  }
  function setPreset(p) {
    var t = App.today();
    if (p === 'today') { rep.from = t; rep.to = t; }
    else if (p === 'yesterday') { var y = addDays(t, -1); rep.from = y; rep.to = y; }
    else if (p === 'week') { rep.from = addDays(t, -6); rep.to = t; }
    else if (p === 'month') { rep.from = t.slice(0, 8) + '01'; rep.to = t; }
    renderReports();
  }

  function renderReports() {
    if (role() !== 'admin') return denied();
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
    var repStats =
      admStat(AICONS.cash, 'green', 'Month Collection', App.money(mColl), 'collected in ' + mShort, mColl, true) +
      admStat(AICONS.receipt, 'red', 'Month Expenses', App.money(mExpT), mExpenses.length + ' entries in ' + mShort, mExpT, true) +
      admStat(AICONS.trend, 'brand', 'Net (This Month)', App.money(mNet), mNet >= 0 ? 'surplus so far' : 'deficit so far', mNet, true) +
      admStat(AICONS.flask, 'blue', 'Tests Billed', mTests, mInvoices.length + ' bills in ' + mShort, mTests, false);

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

    // doctor-wise
    var dw = {};
    invoices.forEach(function (iv) {
      if (!iv.doctorId) return;
      var doc = DB.get('doctors', iv.doctorId);
      var nm = doc ? doc.name : 'Unknown doctor';
      if (!dw[iv.doctorId]) dw[iv.doctorId] = { name: nm, referrals: 0, billed: 0, pct: doc ? (+doc.commissionPct || 0) : 0 };
      dw[iv.doctorId].referrals++;
      dw[iv.doctorId].billed += (+iv.total || 0);
    });
    var dwRows = Object.keys(dw).map(function (k) { return dw[k]; })
      .sort(function (a, b) { return b.billed - a.billed; });

    function statCard(label, val, ic, bg, fg) {
      return '<div class="stat"><div class="stat-ic" style="background:' + bg + ';color:' + fg + '">' + ic + '</div>'
        + '<div><div class="stat-num">' + val + '</div><div class="stat-lbl">' + label + '</div></div></div>';
    }

    var filterCard = ''
      + '<div class="card" style="margin-bottom:18px"><div class="card-b">'
      +   '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">'
      +     '<div><label class="label">From</label><input class="input" type="date" id="repFrom" value="' + App.esc(from) + '"></div>'
      +     '<div><label class="label">To</label><input class="input" type="date" id="repTo" value="' + App.esc(to) + '"></div>'
      +     '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +       '<button class="btn btn-ghost btn-sm" data-preset="today">Today</button>'
      +       '<button class="btn btn-ghost btn-sm" data-preset="yesterday">Yesterday</button>'
      +       '<button class="btn btn-ghost btn-sm" data-preset="week">Last 7 days</button>'
      +       '<button class="btn btn-ghost btn-sm" data-preset="month">This month</button>'
      +     '</div>'
      +     '<button class="btn btn-ghost" id="repPrint" style="margin-left:auto">' + PRINT_ICON + ' Print Report</button>'
      +   '</div>'
      + '</div></div>';

    var html = ''
      + '<style>' + ADM_STAT_CSS + '</style>'
      + '<div class="stat-grid">' + repStats + '</div>'

      + '<h3 style="margin:0 0 12px">Collection Summary <span class="muted" style="font-weight:500;font-size:13px">(' + App.esc(App.d(from)) + ' – ' + App.esc(App.d(to)) + ')</span></h3>'
      + '<div class="stat-grid" style="margin-bottom:18px">'
      +   statCard('Total Billed (' + invoices.length + ' bills)', App.money(billed), '₨', 'var(--blue-soft)', 'var(--blue)')
      +   statCard('Discounts Given', App.money(discounts), '%', 'var(--amber-soft)', 'var(--amber)')
      +   statCard('Collected', App.money(collected), '✓', 'var(--green-soft)', 'var(--green)')
      +   statCard('Outstanding Due', App.money(due), '!', 'var(--red-soft)', 'var(--red)')
      +   statCard('Expenses', App.money(expTotal), '−', 'var(--red-soft)', 'var(--red)')
      +   statCard('Net Collection', App.money(net), '=', 'var(--brand-soft)', 'var(--brand-d)')
      + '</div>'

      + filterCard

      + '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3 style="margin:0">Payment Methods</h3></div><div class="card-b">'
      +   '<div class="stat-grid">'
      +   statCard('Cash', App.money(methods.Cash), '₨', 'var(--green-soft)', 'var(--green)')
      +   statCard('Bank Transfer', App.money(methods.Bank), '▭', 'var(--blue-soft)', 'var(--blue)')
      +   statCard('Card', App.money(methods.Card), '▭', 'var(--amber-soft)', 'var(--amber)')
      +   (methods.Other ? statCard('Other', App.money(methods.Other), '•', 'var(--brand-soft)', 'var(--brand-d)') : '')
      +   '</div></div></div>'

      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px" class="rep-cols">'
      + '<div class="card"><div class="card-h"><h3 style="margin:0">Test-wise Performance</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>';
    if (!twRows.length) html += '<tr><td colspan="3">' + App.empty('No tests billed in this period.') + '</td></tr>';
    twRows.forEach(function (r) {
      html += '<tr><td><strong>' + App.esc(r.code) + '</strong> <span class="muted">' + App.esc(r.name) + '</span></td>'
        + '<td style="text-align:right">' + r.count + '</td>'
        + '<td style="text-align:right;font-weight:700">' + App.money(r.revenue) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>'

      + '<div class="card"><div class="card-h"><h3 style="margin:0">Doctor-wise Referrals</h3></div><div class="card-b">'
      + '<div class="tbl-wrap"><table class="table"><thead><tr><th>Doctor</th><th style="text-align:right">Referrals</th><th style="text-align:right">Billed</th><th style="text-align:right">Commission</th></tr></thead><tbody>';
    if (!dwRows.length) html += '<tr><td colspan="4">' + App.empty('No doctor referrals in this period.') + '</td></tr>';
    dwRows.forEach(function (r) {
      var comm = Math.round(r.billed * r.pct / 100);
      html += '<tr><td><strong>' + App.esc(r.name) + '</strong> <span class="muted">(' + r.pct + '%)</span></td>'
        + '<td style="text-align:right">' + r.referrals + '</td>'
        + '<td style="text-align:right">' + App.money(r.billed) + '</td>'
        + '<td style="text-align:right;font-weight:700;color:var(--amber)">' + App.money(comm) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div></div>';

    document.getElementById('view').innerHTML = html;
    admCountUp();

    document.getElementById('repFrom').addEventListener('change', function (e) { rep.from = e.target.value; renderReports(); });
    document.getElementById('repTo').addEventListener('change', function (e) { rep.to = e.target.value; renderReports(); });
    document.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () { setPreset(b.getAttribute('data-preset')); });
    });
    document.getElementById('repPrint').addEventListener('click', function () {
      var ph = '<p><strong>Period:</strong> ' + App.esc(App.d(from)) + ' – ' + App.esc(App.d(to)) + '</p>'
        + '<table class="table"><tbody>'
        + '<tr><td>Total Billed (' + invoices.length + ' bills)</td><td style="text-align:right"><strong>' + App.money(billed) + '</strong></td></tr>'
        + '<tr><td>Discounts Given</td><td style="text-align:right">' + App.money(discounts) + '</td></tr>'
        + '<tr><td>Collected (Cash ' + App.money(methods.Cash) + ' / Bank ' + App.money(methods.Bank) + ' / Card ' + App.money(methods.Card) + ')</td><td style="text-align:right"><strong>' + App.money(collected) + '</strong></td></tr>'
        + '<tr><td>Outstanding Due</td><td style="text-align:right">' + App.money(due) + '</td></tr>'
        + '<tr><td>Expenses</td><td style="text-align:right">' + App.money(expTotal) + '</td></tr>'
        + '<tr><td><strong>Net Collection</strong></td><td style="text-align:right"><strong>' + App.money(net) + '</strong></td></tr>'
        + '</tbody></table>'
        + '<h3>Test-wise</h3><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>'
        + twRows.map(function (r) { return '<tr><td>' + App.esc(r.code + ' ' + r.name) + '</td><td style="text-align:right">' + r.count + '</td><td style="text-align:right">' + App.money(r.revenue) + '</td></tr>'; }).join('')
        + '</tbody></table>'
        + '<h3>Doctor-wise</h3><table class="table"><thead><tr><th>Doctor</th><th style="text-align:right">Referrals</th><th style="text-align:right">Billed</th><th style="text-align:right">Commission</th></tr></thead><tbody>'
        + dwRows.map(function (r) { return '<tr><td>' + App.esc(r.name) + '</td><td style="text-align:right">' + r.referrals + '</td><td style="text-align:right">' + App.money(r.billed) + '</td><td style="text-align:right">' + App.money(Math.round(r.billed * r.pct / 100)) + '</td></tr>'; }).join('')
        + '</tbody></table>';
      App.print('Collection Report', ph);
    });
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
      { id: 'profile', label: 'Lab Profile' },
      { id: 'account', label: 'My Account' },
      { id: 'templates', label: 'Report Templates' },
      { id: 'whatsapp', label: 'WhatsApp' },
      { id: 'users', label: 'Users' },
      { id: 'backup', label: 'Backup' },
      { id: 'danger', label: 'Danger Zone' }
    ];
    var html = ''
      + '<div class="card"><div class="card-b">'
      + '<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px">'
      + tabs.map(function (t) {
          return '<button class="btn btn-sm ' + (settingsTab === t.id ? 'btn-primary' : 'btn-ghost') + '" data-stab="' + t.id + '"'
            + (t.id === 'danger' && settingsTab !== 'danger' ? ' style="color:var(--red)"' : '') + '>' + t.label + '</button>';
        }).join('')
      + '</div><div id="setBody"></div>'
      + '</div></div>';
    document.getElementById('view').innerHTML = html;
    document.querySelectorAll('[data-stab]').forEach(function (b) {
      b.addEventListener('click', function () { settingsTab = b.getAttribute('data-stab'); renderSettings(); });
    });
    if (settingsTab === 'profile') renderSetProfile();
    else if (settingsTab === 'account') renderSetAccount();
    else if (settingsTab === 'templates') renderSetTemplates();
    else if (settingsTab === 'whatsapp') renderSetWhatsapp();
    else if (settingsTab === 'users') renderSetUsers();
    else if (settingsTab === 'backup') renderSetBackup();
    else renderSetDanger();
  }

  /* ---- Lab Profile ---- */
  function renderSetProfile() {
    var s = DB.get('settings', 'main') || {};
    var html = '<div class="form-grid" style="max-width:720px">'
      + '<div><label class="label">Lab Name *</label><input class="input" id="spName" value="' + App.esc(s.labName || '') + '"></div>'
      + '<div><label class="label">Tagline</label><input class="input" id="spTag" value="' + App.esc(s.tagline || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Address</label><input class="input" id="spAddr" value="' + App.esc(s.address || '') + '"></div>'
      + '<div><label class="label">Phone</label><input class="input" id="spPhone" value="' + App.esc(s.phone || '') + '"></div>'
      + '<div><label class="label">Email</label><input class="input" id="spEmail" value="' + App.esc(s.email || '') + '"></div>'
      + '<div><label class="label">Invoice Prefix *</label><input class="input" id="spPref" value="' + App.esc(s.invoicePrefix || 'INV') + '" style="max-width:140px"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Report / Receipt Footer Note</label><input class="input" id="spFoot" value="' + App.esc(s.footerNote || '') + '"></div>'
      + '<div style="grid-column:1/-1"><label class="label">Desktop App Download URL</label><input class="input" id="spDl" placeholder="https://your-server/releases/Optix-LAB-MedSync-Setup-1.0.0.exe" value="' + App.esc(s.installerUrl || '') + '"></div>'
      + '</div>'
      + '<div style="margin-top:18px"><button class="btn btn-primary" id="spSave">Save Profile</button></div>';
    document.getElementById('setBody').innerHTML = html;
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
        installerUrl: document.getElementById('spDl').value.trim()
      });
      App.toast('Lab profile saved.');
      if (App.renderShell) App.renderShell();
    });
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
    var html = '<div style="max-width:860px">'
      + '<p class="muted" style="margin-top:0">Design the printed report for each test. Fields you add here appear when entering results and on the printed report / PDF. The lab header and footer stay the same for every test.</p>'
      + '<div style="max-width:420px;margin-bottom:14px"><label class="label">Test</label>'
      + '<select class="input" id="rtTest">' + opts + '</select></div>'
      + '<div class="label" style="margin-bottom:6px">Report fields</div>'
      + '<div id="rtFields"></div>'
      + '<button class="btn btn-ghost btn-sm" id="rtAdd">+ Add Field</button>'
      + '<div style="margin-top:16px;display:flex;gap:10px;align-items:center">'
      + '<button class="btn btn-primary" id="rtSave">Save Template</button>'
      + '<button class="btn btn-ghost" id="rtClear">Clear Template</button>'
      + '</div></div>';
    document.getElementById('setBody').innerHTML = html;
    var box = document.getElementById('rtFields');

    function fieldRow(p) {
      p = p || {};
      var isNum = p.type === 'number';
      return '<div class="rt-frow" style="display:grid;grid-template-columns:1fr 90px 1fr 110px 36px;gap:8px;margin-bottom:8px">'
        + '<input class="input rt-fn" placeholder="Field label (e.g. Hemoglobin)" value="' + App.esc(p.name || '') + '">'
        + '<input class="input rt-fu" placeholder="Unit" value="' + App.esc(p.unit || '') + '">'
        + '<input class="input rt-fr" placeholder="Reference range" value="' + App.esc(p.ref || '') + '">'
        + '<select class="input rt-ft"><option value="text"' + (isNum ? '' : ' selected') + '>Text</option>'
        + '<option value="number"' + (isNum ? ' selected' : '') + '>Number</option></select>'
        + '<button type="button" class="btn btn-ghost btn-sm rt-frm" title="Remove">✕</button></div>';
    }
    function wireRemovals() {
      box.querySelectorAll('.rt-frm').forEach(function (b) {
        b.onclick = function () { b.closest('.rt-frow').remove(); };
      });
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
    }
    document.getElementById('rtTest').addEventListener('change', function (e) { paint(e.target.value); });
    document.getElementById('rtAdd').addEventListener('click', function () {
      if (!box.querySelector('.rt-frow')) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', fieldRow(null));
      wireRemovals();
      var last = box.querySelector('.rt-frow:last-child .rt-fn');
      if (last) last.focus();
    });
    document.getElementById('rtSave').addEventListener('click', function () {
      var tid = document.getElementById('rtTest').value;
      var params = [];
      box.querySelectorAll('.rt-frow').forEach(function (row) {
        var n = row.querySelector('.rt-fn').value.trim();
        if (!n) return;
        params.push({
          name: n,
          unit: row.querySelector('.rt-fu').value.trim(),
          ref: row.querySelector('.rt-fr').value.trim(),
          type: row.querySelector('.rt-ft').value === 'number' ? 'number' : 'text'
        });
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
    return { provider: 'ultramsg', instanceId: '', token: '', baseUrl: '', labNumber: '' };
  }
  /* ---- WhatsApp API: managed by the Superadmin console (read-only here) ---- */
  function renderSetWhatsapp() {
    var s = DB.get('settings', 'main') || {};
    var w = Object.assign(waDefaults(), s.whatsapp || {});
    var masked = w.token ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '\u2014';
    var rows =
      row('API Provider', w.provider === 'custom' ? 'Custom' : 'Ultramsg') +
      row('Instance ID', w.instanceId || '\u2014') +
      row('API Token', masked) +
      (w.provider === 'custom' ? row('API Base URL', w.baseUrl || '\u2014') : '') +
      row('Lab WhatsApp Number', w.labNumber || '\u2014');
    function row(k, v) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)">' +
        '<span style="color:var(--muted);font-size:13px">' + App.esc(k) + '</span>' +
        '<strong style="font-size:13px;word-break:break-all;text-align:right">' + App.esc(v) + '</strong></div>';
    }
    var html =
      '<div style="max-width:640px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 16px;margin-bottom:16px">' +
      '<div style="font-weight:700;font-size:14px;margin-bottom:4px">Managed by Superadmin</div>' +
      '<div style="font-size:13px;color:var(--muted)">The WhatsApp API is configured in the Superadmin console. ' +
      'These settings are read-only here — contact your superadmin to change them.</div>' +
      '<div style="margin-top:10px"><a class="btn btn-sm" href="../superadmin/">Open Superadmin Console</a></div></div>' +
      '<div style="max-width:640px">' + rows + '</div>';
    document.getElementById('setBody').innerHTML = html;
  }

  /* ---- Users (admin only) ---- */
  function roleBadge(r) {
    var cls = r === 'admin' ? 'b-paid' : (r === 'reception' ? 'b-ready' : 'b-partial');
    return '<span class="badge ' + cls + '">' + App.esc(r) + '</span>';
  }

  function renderSetUsers() {
    var users = DB.all('users').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var me = sess();
    var html = '<div class="toolbar" style="margin-bottom:12px">'
      + '<button class="btn btn-primary btn-sm" id="uAdd" style="margin-left:auto">+ Add User</button></div>'
      + '<div class="tbl-wrap"><table class="table"><thead><tr>'
      + '<th>Name</th><th>Username</th><th>Role</th><th>Status</th><th style="text-align:right">Actions</th>'
      + '</tr></thead><tbody>';
    users.forEach(function (u) {
      var isMe = me && u.id === me.userId;
      html += '<tr>'
        + '<td><strong>' + App.esc(u.name) + '</strong>' + (isMe ? ' <span class="badge b-ready">you</span>' : '') + '</td>'
        + '<td>' + App.esc(u.username) + '</td>'
        + '<td>' + roleBadge(u.role) + '</td>'
        + '<td>' + (u.active ? '<span class="badge b-paid">active</span>' : '<span class="badge b-unpaid">inactive</span>') + '</td>'
        + '<td style="text-align:right;white-space:nowrap" class="actions">'
        + '<button class="btn btn-ghost btn-sm" data-uedit="' + App.esc(u.id) + '">Edit</button> '
        + '<button class="btn btn-ghost btn-sm" data-upw="' + App.esc(u.id) + '">Password</button> '
        + '<button class="btn btn-ghost btn-sm" data-utoggle="' + App.esc(u.id) + '"' + (isMe ? ' disabled style="opacity:.4"' : '') + '>'
        + (u.active ? 'Deactivate' : 'Activate') + '</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>'
      + '<p class="muted" style="font-size:12.5px;margin-top:12px">Roles — <strong>admin</strong>: everything · <strong>reception</strong>: billing, invoices, dues, patients, doctors, expenses · <strong>technician</strong>: results, tests & patients (view).</p>';
    document.getElementById('setBody').innerHTML = html;

    document.getElementById('uAdd').addEventListener('click', function () { openUserModal(null); });
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

  function openUserModal(u) {
    var isEdit = !!u;
    u = u || { name: '', username: '', role: 'reception', active: true };
    var body = '<div class="form-grid">'
      + '<div><label class="label">Full Name *</label><input class="input" id="ufName" value="' + App.esc(u.name) + '"></div>'
      + '<div><label class="label">Username *</label><input class="input" id="ufUser" value="' + App.esc(u.username) + '"' + (isEdit ? ' disabled' : '') + '></div>'
      + (isEdit ? '' : '<div><label class="label">Password *</label><input class="input" id="ufPass" type="password" placeholder="min 4 characters"></div>')
      + '<div><label class="label">Role *</label><select class="select" id="ufRole">'
      + ['admin', 'reception', 'technician'].map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('')
      + '</select></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">'
      + '<button class="btn btn-ghost" id="ufCancel">Cancel</button>'
      + '<button class="btn btn-primary" id="ufSave">' + (isEdit ? 'Save Changes' : 'Add User') + '</button></div>';
    var close = App.modal(isEdit ? 'Edit User' : 'Add User', body, {
      onOpen: function (ov, close) {
        document.getElementById('ufCancel').addEventListener('click', close);
        document.getElementById('ufSave').addEventListener('click', function () {
          var name = document.getElementById('ufName').value.trim();
          var username = document.getElementById('ufUser').value.trim().toLowerCase();
          var roleV = document.getElementById('ufRole').value;
          if (!name) return App.toast('Name is required.', 'err');
          if (!username) return App.toast('Username is required.', 'err');
          if (isEdit) {
            DB.update('users', u.id, { name: name, role: roleV });
            App.toast('User updated.');
          } else {
            var pass = document.getElementById('ufPass').value;
            if (pass.length < 4) return App.toast('Password must be at least 4 characters.', 'err');
            var dup = DB.all('users').some(function (x) { return x.username.toLowerCase() === username; });
            if (dup) return App.toast('Username already exists.', 'err');
            DB.insert('users', { name: name, username: username, password: pass, role: roleV, active: true });
            App.toast('User added.');
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
          return App.toast('This file is not an Optix LAB MedSync backup.', 'err');
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
    var html = '<div class="card" style="border:1px solid var(--red);max-width:720px;margin:0"><div class="card-b">'
      + '<h3 style="margin-top:0;color:var(--red)">Reset Demo Data</h3>'
      + '<p class="muted">This wipes <strong>everything</strong> — patients, invoices, payments, expenses, results, users — and restores the original demo dataset. You will be logged out.</p>'
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

  App.route('#/settings', renderSettings);

})();
