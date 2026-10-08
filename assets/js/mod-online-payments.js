/* Optix Medical Sync — Online Payments verification queue (feat/online-payments)
   Route: #/online-payments
   Claims table: onlinepay_claims {id, invoiceId, patientId, patientName, method, tid,
   amount, senderName, senderNumber, status, rejectReason, createdAt, createdBy,
   verifiedBy, verifiedAt}; statuses pending|approved|rejected.
   Depends on: DB (db.js), App (app.js). Worker 5/15: queue page + nav + route. */
(function () {
  'use strict';

  var F = { status: 'all' }; /* status filter tab: all|pending|approved|rejected */

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function sessUser() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (!s) return 'system';
      var u = s.userId ? DB.get('users', s.userId) : null;
      return (u && u.username) || s.name || 'system';
    } catch (e) { return 'system'; }
  }

  function statusOf(paid, total) {
    var due = r2(total - paid);
    if (due <= 0) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  }

  function claimStatusBadge(st) {
    /* b-paid = green (approved), b-unpaid = red (rejected), b-pending = amber */
    var cls = st === 'approved' ? 'b-paid' : (st === 'rejected' ? 'b-unpaid' : 'b-pending');
    var lb = st === 'approved' ? 'Approved' : (st === 'rejected' ? 'Rejected' : 'Pending');
    return '<span class="badge ' + cls + '">' + lb + '</span>';
  }

  /* ---------- approve: mirrors mod-invoices.js recordPayment (lines 79-105) exactly,
     then marks the claim approved ---------- */
  function approveClaim(id) {
    var claim = DB.get('onlinepay_claims', id);
    if (!claim) { App.toast('Claim not found', 'err'); return; }
    if (claim.status !== 'pending') { App.toast('This claim is no longer pending', 'err'); return; }
    var inv = DB.get('invoices', claim.invoiceId);
    if (!inv) { App.toast('Invoice no longer exists', 'err'); return; }
    var amount = r2(claim.amount);
    if (!(amount > 0)) { App.toast('Enter a valid amount', 'err'); return; }
    if (amount > r2(inv.due) + 0.009) {
      App.toast('Amount cannot exceed due (' + App.money(inv.due) + ')', 'err'); return;
    }
    DB.insert('payments', {
      invoiceId: inv.id,
      amount: amount,
      method: 'Online-' + claim.method,
      date: new Date().toISOString(),
      note: 'TID ' + claim.tid,
      createdBy: sessUser()
    });
    var paid = r2(inv.paid + amount);
    var due = r2(inv.total - paid);
    DB.update('invoices', inv.id, { paid: paid, due: due < 0.01 ? 0 : due, status: statusOf(paid, inv.total) });
    DB.update('onlinepay_claims', claim.id, { status: 'approved', verifiedBy: sessUser(), verifiedAt: Date.now() });
    App.toast(App.money(amount) + ' collected for ' + inv.no);
    /* a finished report that was waiting for this payment goes out on WhatsApp now */
    try {
      if (due < 0.01) {
        if (App.waOnPaid) App.waOnPaid(inv.id);
        else if (App.session && DB.all('results').some(function (r) { return r.invoiceId === inv.id; })) App.loadScript('assets/js/mod-results.js').then(function () { if (App.waOnPaid) App.waOnPaid(inv.id); }, function () {});
      }
    } catch (e) {}
  }

  /* ---------- reject: marks the claim rejected with a reason ---------- */
  function openRejectModal(id) {
    var claim = DB.get('onlinepay_claims', id);
    if (!claim) { App.toast('Claim not found', 'err'); return; }
    if (claim.status !== 'pending') { App.toast('This claim is no longer pending', 'err'); return; }
    var inv = DB.get('invoices', claim.invoiceId);
    var body =
      '<p style="margin:0 0 12px;font-size:14px">Reject the online payment claim of <b>' + App.money(claim.amount) + '</b> for ' +
        '<b>' + App.esc(inv ? inv.no : '') + '</b> (' + App.esc(claim.patientName || 'Walk-in') + ')? The payment will NOT be applied.</p>' +
      '<div><label class="label">Reason for rejection *</label>' +
      '<textarea id="opq-reason" class="input" rows="3" style="resize:vertical" placeholder="e.g. no payment received for this TID"></textarea></div>' +
      '<div id="opq-err" style="color:var(--red);font-size:13px;font-weight:600;margin-top:8px"></div>' +
      '<div class="actions" style="margin-top:18px">' +
        '<button class="btn btn-ghost" id="opq-cancel">Cancel</button>' +
        '<button class="btn btn-danger" id="opq-save">Reject Claim</button>' +
      '</div>';
    App.modal('Reject Payment Claim', body, {
      onOpen: function (root, close) {
        root.querySelector('#opq-cancel').addEventListener('click', close);
        root.querySelector('#opq-save').addEventListener('click', function () {
          var reason = root.querySelector('#opq-reason').value.trim();
          if (!reason) {
            root.querySelector('#opq-err').textContent = 'A rejection reason is required.';
            return;
          }
          var cur = DB.get('onlinepay_claims', id);
          if (!cur || cur.status !== 'pending') { close(); renderOnlinePayments(); return; }
          DB.update('onlinepay_claims', id, {
            status: 'rejected', rejectReason: reason,
            verifiedBy: sessUser(), verifiedAt: Date.now()
          });
          App.toast('Claim rejected');
          close();
          renderOnlinePayments();
        });
      }
    });
  }

  /* ---------- queue page ---------- */
  function renderOnlinePayments() {
    var all = (DB.all('onlinepay_claims') || []).slice()
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); /* newest first */
    var counts = { all: all.length, pending: 0, approved: 0, rejected: 0 };
    var sums = { pending: 0, approved: 0 };
    all.forEach(function (c) {
      if (counts[c.status] !== undefined) counts[c.status]++;
      var amt = Number(c.amount) || 0;
      if (c.status === 'pending') sums.pending += amt;
      if (c.status === 'approved') sums.approved += amt;
    });
    var list = (F.status === 'all') ? all : all.filter(function (c) { return c.status === F.status; });

    var CARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
    var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';
    var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
    function kpi(cls, icon, label, num, sub, tabKey) {
      return '<div class="kpi ' + cls + '" data-opq-tab="' + tabKey + '" style="cursor:pointer" title="Filter by ' + label + '"><div class="kpi-ic">' + icon + '</div><div class="kpi-lb">' + label + '</div><div class="kpi-nm">' + num + '</div><div class="kpi-sb">' + sub + '</div></div>';
    }
    var statGrid = '<div class="kpi-grid" style="margin-bottom:16px">' +
      kpi('t-navy', CARD, 'ALL CLAIMS', all.length, 'all online payments', 'all') +
      kpi('t-amber', CLOCK, 'PENDING', counts.pending, sums.pending ? App.money(sums.pending) + ' to verify' : 'awaiting verification', 'pending') +
      kpi('t-green', CHECK, 'APPROVED', counts.approved, sums.approved ? App.money(sums.approved) + ' collected' : 'verified & applied', 'approved') +
      kpi('t-red', X, 'REJECTED', counts.rejected, 'rejected claims', 'rejected') +
      '</div>';

    var tabs = ['all', 'pending', 'approved', 'rejected'].map(function (st) {
      var lb = st.charAt(0).toUpperCase() + st.slice(1);
      return '<button type="button" class="tab' + (F.status === st ? ' on' : '') + '" data-opq-tab="' + st + '">' +
        lb + ' (' + counts[st] + ')</button>';
    }).join('');

    var rows = list.length ? list.map(function (c) {
      var inv = DB.get('invoices', c.invoiceId);
      var sender = (c.senderName || '') + (c.senderNumber ? '<div style="font-size:12px;color:var(--muted)">' + App.esc(c.senderNumber) + '</div>' : '');
      var acts = c.status === 'pending'
        ? '<button class="btn btn-sm btn-primary" data-opq-approve="' + App.esc(c.id) + '">Verify &amp; Approve</button> ' +
          '<button class="btn btn-sm btn-danger" data-opq-reject="' + App.esc(c.id) + '">Reject</button>'
        : (c.status === 'rejected' && c.rejectReason
            ? '<span style="font-size:12px;color:var(--muted)" title="Rejection reason">' + App.esc(c.rejectReason) + '</span>'
            : '<span style="font-size:12px;color:var(--muted)">by ' + App.esc(c.verifiedBy || '—') + '</span>');
      return '<tr>' +
        '<td><a href="#/invoice/' + App.esc(c.invoiceId) + '" style="font-weight:700;color:var(--brand-d)">' + App.esc(inv ? inv.no : '—') + '</a></td>' +
        '<td>' + App.esc(c.patientName || 'Walk-in') + '</td>' +
        '<td>' + App.esc(c.method || '—') + '</td>' +
        '<td style="font-family:monospace;font-size:13px">' + App.esc(c.tid || '—') + '</td>' +
        '<td style="text-align:right;font-weight:700">' + App.money(c.amount) + '</td>' +
        '<td>' + (sender || '<span style="color:var(--muted)">—</span>') + '</td>' +
        '<td>' + App.dt(c.createdAt) + '</td>' +
        '<td>' + claimStatusBadge(c.status) + '</td>' +
        '<td class="actions" style="white-space:nowrap">' + acts + '</td></tr>';
    }).join('') : '<tr><td colspan="9">' +
      App.empty(F.status === 'pending'
        ? 'No pending claims. Online payments recorded from an invoice will appear here for verification.'
        : 'No online payment claims yet.') + '</td></tr>';

    document.getElementById('view').innerHTML =
      statGrid +
      '<div class="tabs" style="margin-bottom:16px">' + tabs + '</div>' +
      '<div class="card"><div class="card-b"><div class="tbl-wrap"><table class="table"><thead><tr>' +
        '<th>Invoice No</th><th>Patient</th><th>Method</th><th>TID</th>' +
        '<th style="text-align:right">Amount</th><th>Sender</th><th>Date</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';

    var view = document.getElementById('view');
    view.querySelectorAll('[data-opq-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { F.status = btn.getAttribute('data-opq-tab'); renderOnlinePayments(); });
    });
    view.querySelectorAll('[data-opq-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var claim = DB.get('onlinepay_claims', btn.getAttribute('data-opq-approve'));
        if (!claim || claim.status !== 'pending') { renderOnlinePayments(); return; }
        var inv = DB.get('invoices', claim.invoiceId);
        App.confirm('Verify and approve the online payment of ' + App.money(claim.amount) +
          ' (TID ' + claim.tid + ') for ' + (inv ? inv.no : 'the invoice') + '? This will record it as collected.').then(function (ok) {
          if (!ok) return;
          approveClaim(btn.getAttribute('data-opq-approve'));
          renderOnlinePayments();
        });
      });
    });
    view.querySelectorAll('[data-opq-reject]').forEach(function (btn) {
      btn.addEventListener('click', function () { openRejectModal(btn.getAttribute('data-opq-reject')); });
    });
  }

  /* ---------- register ---------- */
  App.route('#/online-payments', renderOnlinePayments);
})();
