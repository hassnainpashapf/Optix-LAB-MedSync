/* Optix Medical Sync — Invoices & Dues module
   Routes: #/invoices, #/invoice/:id, #/dues
   Depends on: DB (db.js), App (app.js) as specified in SPEC.md */
(function () {
  'use strict';

  /* ---------- dashboard-style stat cards: shared compact CSS now in app.css ---------- */
  var SC_STYLE = '';
  var SC_ICONS = {
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
  };
  function scIsTech() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      return !!(s && (s.role === 'technician' || (window.App && App.hideMoney && App.hideMoney())));
    } catch (e) { return false; }
  }
  var STAT_TINTS = {
    brand: { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    navy:  { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#a9c9ec', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e9cb96', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#9fd8b8', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e6aaaa', soft: '#fdecec', circle: '#fad2d2' }
  };

  function kpiCard(icon, tint, label, value, sub) {
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:1.5px solid ' + c.line + ' !important;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
      '<div style="position:absolute;top:-30px;right:-30px;width:90px;height:90px;border-radius:50%;background:' + c.circle + ';opacity:0.65;pointer-events:none"></div>' +
      '<div class="stat-ico" style="position:relative;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:' + c.sc + ';background:linear-gradient(135deg,' + c.soft + ' 0%,#ffffff 160%);box-shadow:inset 0 0 0 1px ' + c.line + ',0 1px 3px rgba(15,30,46,.06);margin-bottom:6px;flex:0 0 auto">' + icon + '</div>' +
      '<div class="lb" style="position:relative;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;flex:0 0 auto">' + App.esc(label) + '</div>' +
      '<div class="vl" style="position:relative;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 0 4px 0;flex:0 0 auto">' + value + '</div>' +
      '<div class="dl" style="position:relative;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">' + sub + '</div>' +
      '</div>';
  }

  /* ---------- shared helpers ---------- */
  var F = { q: '', date: 'all', status: 'all' };
  var refreshCurrent = null;

  function setRefresh(fn) { refreshCurrent = fn; }
  function refresh() { if (refreshCurrent) refreshCurrent(); }

  function sessUser() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (!s) return 'system';
      var u = s.userId ? DB.get('users', s.userId) : null;
      return (u && u.username) || s.name || 'system';
    } catch (e) { return 'system'; }
  }

  function dayKey(v) {
    var d = new Date(v);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function addDays(key, n) {
    var d = new Date(key + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function patientOf(inv) { return inv && inv.patientId ? DB.get('patients', inv.patientId) : null; }
  function doctorOf(inv) { return inv && inv.doctorId ? DB.get('doctors', inv.doctorId) : null; }
  function paymentsOf(invId) {
    return DB.all('payments').filter(function (p) { return p.invoiceId === invId; })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  }

  function panelChip(inv) {
    if (!inv || !inv.panelId) return '';
    var pn = DB.get('panels', inv.panelId);
    return ' <span class="badge b-ready" title="Billed to a company account (nothing to collect from the patient)">' + App.esc(pn ? pn.name : 'Corporate') + '</span>';
  }
  function statusOf(paid, total) {
    var due = r2(total - paid);
    if (due <= 0) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  }

  /* ---------- payment collection (shared) ---------- */
  function recordPayment(invoiceId, amount, method, note) {
    var inv = DB.get('invoices', invoiceId);
    if (!inv) return false;
    amount = r2(amount);
    if (!(amount > 0)) { App.toast('Enter a valid amount', 'err'); return false; }
    if (amount > r2(inv.due) + 0.009) { App.toast('Amount cannot exceed due (' + App.money(inv.due) + ')', 'err'); return false; }
    DB.insert('payments', {
      invoiceId: invoiceId,
      amount: amount,
      method: method || 'Cash',
      date: new Date().toISOString(),
      note: note || '',
      createdBy: sessUser()
    });
    var paid = r2(inv.paid + amount);
    var due = r2(inv.total - paid);
    DB.update('invoices', invoiceId, { paid: paid, due: due < 0.01 ? 0 : due, status: statusOf(paid, inv.total) });
    App.toast(App.money(amount) + ' collected for ' + inv.no);
    /* a finished report that was waiting for this payment goes out on WhatsApp now */
    try {
      if (due < 0.01) {
        if (App.waOnPaid) App.waOnPaid(invoiceId);
        else if (App.session && DB.all('results').some(function (r) { return r.invoiceId === invoiceId; })) App.loadScript('assets/js/mod-results.js').then(function () { if (App.waOnPaid) App.waOnPaid(invoiceId); }, function () {});
      }
    } catch (e) {}
    return true;
  }

  function openPaymentModal(invoiceId) {
    var inv = DB.get('invoices', invoiceId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    if (r2(inv.due) <= 0) { App.toast('No due remaining on ' + inv.no, 'err'); return; }
    var p = patientOf(inv);
    var body =
      '<div class="form-grid">' +
        '<div><label class="label">Invoice</label><div style="font-weight:700">' + App.esc(inv.no) + '</div>' +
        '<div style="color:var(--muted);font-size:13px">' + App.esc(p ? p.name : 'Walk-in') + '</div></div>' +
        '<div><label class="label">Total Due</label><div style="font-weight:800;font-size:18px;color:var(--red)">' + App.money(inv.due) + '</div></div>' +
        '<div><label class="label">Amount Received *</label>' +
        '<input id="pm-amount" class="input" type="number" min="1" step="any" value="' + inv.due + '"></div>' +
        '<div><label class="label">Payment Method</label>' +
        '<select id="pm-method" class="select">' + App.optionsHtml('paymentMethod', 'Cash') + '</select></div>' +
        '<div style="grid-column:1/-1"><label class="label">Note (optional)</label>' +
        '<input id="pm-note" class="input" placeholder="e.g. partial payment, jazzcash ref..."></div>' +
      '</div>' +
      '<div class="actions" style="margin-top:18px">' +
        '<button class="btn btn-ghost" id="pm-cancel">Cancel</button>' +
        '<button class="btn btn-primary" id="pm-save">Mark as Paid</button>' +
      '</div>';
    var close = App.modal('Collect Payment', body, {
      onOpen: function (root, close) {
        var amtEl = root.querySelector('#pm-amount');
        var saveBtn = root.querySelector('#pm-save');
        function syncLabel() {
          var v = parseFloat(amtEl.value);
          saveBtn.textContent = (v >= r2(inv.due) - 0.009) ? 'Mark as Paid' : 'Collect Payment';
        }
        amtEl.addEventListener('input', syncLabel);
        syncLabel();
        root.querySelector('#pm-cancel').addEventListener('click', close);
        saveBtn.addEventListener('click', function () {
          var amount = parseFloat(amtEl.value);
          var method = root.querySelector('#pm-method').value;
          var note = root.querySelector('#pm-note').value.trim();
          var cur = DB.get('invoices', invoiceId); // re-read in case of double clicks
          if (!cur || r2(cur.due) <= 0) { close(); refresh(); return; }
          if (recordPayment(invoiceId, amount, method, note)) { close(); refresh(); }
        });
      }
    });
  }

  /* ---------- online payment claim (feat/online-payments) ---------- */
  function openOnlinePayModal(invoiceId) {
    var inv = DB.get('invoices', invoiceId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    if (r2(inv.due) <= 0) { App.toast('No due remaining on ' + inv.no, 'err'); return; }
    var p = patientOf(inv);
    var body =
      '<div class="form-grid">' +
        '<div><label class="label">Invoice</label><div style="font-weight:700">' + App.esc(inv.no) + '</div>' +
        '<div style="color:var(--muted);font-size:13px">' + App.esc(p ? p.name : 'Walk-in') + '</div></div>' +
        '<div><label class="label">Total Due</label><div style="font-weight:800;font-size:18px;color:var(--red)">' + App.money(inv.due) + '</div></div>' +
        '<div><label class="label">Method *</label>' +
        '<select id="opc-method" class="select">' +
          '<option value="JazzCash">JazzCash</option>' +
          '<option value="Easypaisa">Easypaisa</option>' +
          '<option value="Bank">Bank</option>' +
        '</select></div>' +
        '<div><label class="label">Transaction ID (TID) *</label>' +
        '<input id="opc-tid" class="input" placeholder="e.g. 03451234567 or bank ref"></div>' +
        '<div><label class="label">Amount Paid *</label>' +
        '<input id="opc-amount" class="input" type="number" min="1" step="any" value="' + inv.due + '"></div>' +
        '<div><label class="label">Sender Name</label>' +
        '<input id="opc-sendername" class="input" placeholder="Name on the account"></div>' +
        '<div style="grid-column:1/-1"><label class="label">Sender Mobile</label>' +
        '<input id="opc-sendernum" class="input" placeholder="Mobile number used for the transfer"></div>' +
        '<div id="opc-err" style="grid-column:1/-1;color:var(--red);font-size:13px;font-weight:600"></div>' +
      '</div>' +
      '<div class="actions" style="margin-top:18px">' +
        '<button class="btn btn-ghost" id="opc-cancel">Cancel</button>' +
        '<button class="btn btn-primary" id="opc-save">Record Payment Claim</button>' +
      '</div>';
    App.modal('Record Online Payment', body, {
      onOpen: function (root, close) {
        var errEl = root.querySelector('#opc-err');
        root.querySelector('#opc-cancel').addEventListener('click', close);
        root.querySelector('#opc-save').addEventListener('click', function () {
          errEl.textContent = '';
          var cur = DB.get('invoices', invoiceId); // re-read in case of double clicks
          if (!cur || r2(cur.due) <= 0) { close(); refresh(); return; }
          var method = root.querySelector('#opc-method').value;
          var tid = root.querySelector('#opc-tid').value.trim();
          var amount = r2(parseFloat(root.querySelector('#opc-amount').value));
          var senderName = root.querySelector('#opc-sendername').value.trim();
          var senderNumber = root.querySelector('#opc-sendernum').value.trim();
          if (!tid) {
            errEl.textContent = 'Transaction ID is required.'; App.toast('Transaction ID is required', 'err'); return;
          }
          if (!(amount > 0)) {
            errEl.textContent = 'Enter a valid amount greater than 0.'; App.toast('Enter a valid amount', 'err'); return;
          }
          if (amount > r2(cur.due) + 0.009) {
            errEl.textContent = 'Amount cannot exceed due (' + App.money(cur.due) + ').';
            App.toast('Amount cannot exceed due (' + App.money(cur.due) + ')', 'err'); return;
          }
          var claim = {
            id: 'OPC-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            invoiceId: invoiceId,
            patientId: cur.patientId || null,
            patientName: p ? p.name : 'Walk-in',
            method: method,
            tid: tid,
            amount: amount,
            senderName: senderName,
            senderNumber: senderNumber,
            status: 'pending',
            rejectReason: '',
            createdAt: Date.now(),
            createdBy: sessUser()
          };
          DB.insert('onlinepay_claims', claim);
          close();
          App.toast('Payment claim recorded — pending verification');
          refresh();
        });
      }
    });
  }

  /* ---------- delete invoice ---------- */
  function deleteInvoice(id) {
    var inv = DB.get('invoices', id);
    if (!inv) return;
    App.confirm('Delete invoice ' + inv.no + '? This will permanently remove its payments and lab results.').then(function (ok) {
      if (!ok) return;
      paymentsOf(id).forEach(function (p) { DB.remove('payments', p.id); });
      DB.all('results').filter(function (r) { return r.invoiceId === id; })
        .forEach(function (r) { DB.remove('results', r.id); });
      try { if (window.Samples) Samples.removeForInvoice(id); } catch (e) {}
      DB.remove('invoices', id);
      App.toast('Invoice ' + inv.no + ' deleted');
      /* from the invoice page go back to the list; from a list (invoices / dues) just refresh it in place */
      if (/^#\/invoice\//.test(location.hash) || !refreshCurrent) App.nav('#/invoices'); else refresh();
    });
  }

  /* ---------- WhatsApp helpers ---------- */
  function waPhone(p) {
    return App.normWa(p); /* shared helper (app.js) */
  }
  function shareInvoiceWhatsApp(id) {
    var inv = DB.get('invoices', id);
    if (!inv) return;
    var p = patientOf(inv);
    var ph = waPhone(p && (p.whatsapp || p.phone)); /* dedicated WhatsApp no., else phone */
    if (!ph) { App.toast('No WhatsApp number on patient record', 'err'); return; }
    var s = DB.get('settings', 'main') || {};
    var tests = (inv.items || []).map(function (it) { return it.name; }).join(', ');
    var msg = (s.labName || 'Lab') + '\nInvoice ' + inv.no + ' (' + App.d(inv.createdAt) + ')\n' +
      'Patient: ' + (p ? p.name : 'Walk-in') + '\n' +
      'Tests: ' + tests + '\n' +
      'Total: ' + App.money(inv.total) + ' | Paid: ' + App.money(inv.paid) + ' | Due: ' + App.money(inv.due);
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), '_blank');
  }

  /* ---------- void payment ---------- */
  function voidPayment(paymentId) {
    var py = DB.get('payments', paymentId);
    if (!py) return;
    var inv = DB.get('invoices', py.invoiceId);
    App.confirm('Void payment of ' + App.money(py.amount) + ' on ' + (inv ? inv.no : '') + '?').then(function (ok) {
      if (!ok) return;
      DB.remove('payments', paymentId);
      if (inv) {
        var paid = r2(paymentsOf(inv.id).reduce(function (a, x) { return a + (+x.amount || 0); }, 0));
        var due = r2(inv.total - paid);
        DB.update('invoices', inv.id, { paid: paid, due: due < 0.01 ? 0 : due, status: statusOf(paid, inv.total) });
      }
      App.toast('Payment voided');
      refresh();
    });
  }

  /* ---------- payment receipt print ---------- */
  function printReceipt(paymentId) {
    var py = DB.get('payments', paymentId);
    if (!py) return;
    var inv = DB.get('invoices', py.invoiceId);
    var s = DB.get('settings', 'main') || {};
    var p = inv ? patientOf(inv) : null;
    var html =
      '<div style="font-size:20px;font-weight:800;border-top:2px solid #131845;border-bottom:2px solid #131845;padding:10px 0;margin-bottom:16px">PAYMENT RECEIPT</div>' +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:16px">' +
        '<tr><td style="padding:6px;color:#555">Receipt No</td><td style="padding:6px;font-weight:700">' + App.esc(py.id) + '</td></tr>' +
        '<tr><td style="padding:6px;color:#555">Date</td><td style="padding:6px">' + (String(py.date || '').length > 10 ? App.dt(py.date) : App.d(py.date)) + '</td></tr>' +
        '<tr><td style="padding:6px;color:#555">Invoice</td><td style="padding:6px;font-weight:700">' + App.esc(inv ? inv.no : '—') + '</td></tr>' +
        '<tr><td style="padding:6px;color:#555">Patient</td><td style="padding:6px">' + App.esc(p ? p.name : 'Walk-in') + '</td></tr>' +
        '<tr><td style="padding:6px;color:#555">Method</td><td style="padding:6px">' + App.esc(py.method) + '</td></tr>' +
        (py.note ? '<tr><td style="padding:6px;color:#555">Note</td><td style="padding:6px">' + App.esc(py.note) + '</td></tr>' : '') +
        '<tr><td style="padding:10px 6px;font-size:18px;font-weight:800">Amount Received</td><td style="padding:10px 6px;font-size:18px;font-weight:800">' + App.money(py.amount) + '</td></tr>' +
        (inv ? '<tr><td style="padding:6px;color:#555">Invoice Balance Due</td><td style="padding:6px;font-weight:700;color:#dc2626">' + App.money(inv.due) + '</td></tr>' : '') +
      '</table>' +
      '<div style="font-size:12px;color:#555;text-align:center;margin-bottom:6px">' + App.esc(s.footerNote || '') + '</div>' +
      '<div style="font-size:11px;color:#999;text-align:center;margin-bottom:24px">Powered by System Optix</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:32px">' +
        '<div>Received by: __________________</div><div>Patient signature: __________________</div>' +
      '</div>';
    App.print('Receipt ' + py.id, html);
  }

  /* ---------- edit invoice ---------- */
  function openEditInvoice(id) {
    var inv = DB.get('invoices', id);
    if (!inv) return;
    var items = (inv.items || []).map(function (it) {
      return { testId: it.testId, code: it.code, name: it.name, price: +it.price || 0, includes: it.includes || null };
    });
    var oldIds = items.map(function (it) { return it.testId; });
    var discount = +(inv.discount || 0);
    var doctorId = inv.doctorId || '';

    function expandedIds(list) {
      var out = [];
      list.forEach(function (it) {
        if (it.includes && it.includes.length) it.includes.forEach(function (tid) { out.push(tid); });
        else out.push(it.testId);
      });
      return out;
    }

    var body =
      '<div class="label" style="margin-bottom:6px">Tests</div>' +
      '<div id="ei-items" style="margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px">' +
        '<input id="ei-search" class="input" placeholder="Search test to add..." style="flex:1">' +
        '<div id="ei-pick" style="position:relative"></div>' +
      '</div>' +
      '<div class="form-grid">' +
        '<div><label class="label">Discount (Rs)</label><input id="ei-disc" class="input" type="number" min="0" step="any" value="' + discount + '"></div>' +
        '<div><label class="label">Consultant</label><select id="ei-doc" class="select"><option value="">Self / walk-in</option>' +
          DB.all('doctors').map(function (d) {
            return '<option value="' + App.esc(d.id) + '"' + (d.id === doctorId ? ' selected' : '') + '>' + App.esc(d.name) + '</option>';
          }).join('') + '</select></div>' +
        '<div><label class="label">Registration date &amp; time</label><input id="ei-regdate" class="input" type="datetime-local" value="' + App.toLocalInput(inv.createdAt) + '"></div>' +
        '<div><label class="label">Registration location</label><input id="ei-regloc" list="ei-regloc-dl" class="input" maxlength="120" value="' + App.esc(inv.regLocation != null && inv.regLocation !== '' ? inv.regLocation : App.visitDefaults().regLocation) + '">' + App.datalistHtml('ei-regloc-dl', 'regLocation', App.visitDefaults().regLocation) + '</div>' +
        '<div><label class="label">Destination location</label><input id="ei-destloc" list="ei-destloc-dl" class="input" maxlength="120" value="' + App.esc(inv.destLocation != null && inv.destLocation !== '' ? inv.destLocation : App.visitDefaults().destLocation) + '">' + App.datalistHtml('ei-destloc-dl', 'destLocation', App.visitDefaults().destLocation) + '</div>' +
        '<div><label class="label">Reference</label><select id="ei-ref" class="select">' + App.optionsHtml('reference', inv.reference || App.listOptions('reference')[0] || '') + '</select></div>' +
      '</div>' +
      '<div id="ei-total" style="text-align:right;font-weight:800;margin:12px 0"></div>' +
      '<div class="actions"><button class="btn btn-ghost" id="ei-cancel">Cancel</button>' +
      '<button class="btn btn-primary" id="ei-save">Save Changes</button></div>';

    function paintItems(root) {
      root.querySelector('#ei-items').innerHTML = items.length ? items.map(function (it, i) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px">' +
          '<div style="flex:1"><strong>' + App.esc(it.name) + '</strong>' +
          '<div style="font-size:12px;color:var(--muted)">' + App.esc(it.code || '') + (it.includes ? ' &nbsp;•&nbsp; Package (' + it.includes.length + ' tests)' : '') + '</div></div>' +
          '<div style="font-weight:700">' + App.money(it.price) + '</div>' +
          '<button class="btn btn-sm btn-ghost" data-rm="' + i + '">Remove</button></div>';
      }).join('') : App.empty('No tests — add at least one.');
      root.querySelectorAll('[data-rm]').forEach(function (b) {
        b.addEventListener('click', function () { items.splice(+b.getAttribute('data-rm'), 1); paintItems(root); paintTotal(root); });
      });
    }
    function calcTotal() {
      var sub = r2(items.reduce(function (a, it) { return a + (+it.price || 0); }, 0));
      var disc = Math.min(r2(discount), sub);
      return { sub: sub, disc: disc, total: r2(sub - disc) };
    }
    function paintTotal(root) {
      var t = calcTotal();
      root.querySelector('#ei-total').textContent = 'Subtotal ' + App.money(t.sub) + '  −  Discount ' + App.money(t.disc) + '  =  Total ' + App.money(t.total);
    }

    var close = App.modal('Edit Invoice ' + inv.no, body, {
      onOpen: function (root, close) {
        paintItems(root); paintTotal(root);
        root.querySelector('#ei-cancel').addEventListener('click', close);
        root.querySelector('#ei-disc').addEventListener('input', function (e) {
          discount = Math.max(0, parseFloat(e.target.value) || 0); paintTotal(root);
        });
        root.querySelector('#ei-doc').addEventListener('change', function (e) { doctorId = e.target.value; });
        /* test picker */
        var search = root.querySelector('#ei-search'), pick = root.querySelector('#ei-pick');
        function renderPick() {
          var q = search.value.trim().toLowerCase();
          var tests = DB.all('tests').filter(function (t) { return t.active !== false; })
            .filter(function (t) { return !q || (t.name + ' ' + t.code).toLowerCase().indexOf(q) >= 0; })
            .slice(0, 8);
          pick.innerHTML = q ? '<div style="position:absolute;right:0;top:0;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:var(--sh-md);z-index:5;min-width:280px;max-height:260px;overflow:auto">' +
            (tests.length ? tests.map(function (t) {
              var added = items.some(function (it) { return it.testId === t.id; });
              return '<button class="btn btn-ghost btn-sm" style="display:flex;width:100%;justify-content:space-between;gap:8px;border-radius:0" data-add="' + App.esc(t.id) + '"' + (added ? ' disabled' : '') + '>' +
                '<span>' + App.esc(t.name) + (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') + '</span><span>' + App.money(t.price) + '</span></button>';
            }).join('') : '<div style="padding:12px;color:var(--muted)">No matches</div>') + '</div>' : '';
          pick.querySelectorAll('[data-add]').forEach(function (b) {
            b.addEventListener('click', function () {
              var t = DB.get('tests', b.getAttribute('data-add'));
              if (!t) return;
              items.push({ testId: t.id, code: t.code, name: t.name, price: inv.panelId && DB.get('panels', inv.panelId) ? App.panelPrice(DB.get('panels', inv.panelId), t) : (+t.price || 0), includes: t.isPackage ? (t.includes || []) : null });
              search.value = ''; renderPick(); paintItems(root); paintTotal(root);
            });
          });
        }
        search.addEventListener('input', renderPick);
        root.querySelector('#ei-save').addEventListener('click', function () {
          if (!items.length) { App.toast('Add at least one test', 'err'); return; }
          /* block removing tests that already have ready results */
          var newExp = expandedIds(items);
          var oldExp = expandedIds(oldIds.map(function (tid) {
            var o = (inv.items || []).filter(function (x) { return x.testId === tid; })[0] || {};
            return { testId: tid, includes: o.includes || null };
          }));
          var removed = oldExp.filter(function (tid) { return newExp.indexOf(tid) < 0; });
          var readyRes = DB.all('results').filter(function (r) { return r.invoiceId === id && r.status === 'ready'; });
          var blocked = removed.filter(function (tid) { return readyRes.some(function (r) { return r.testId === tid; }); });
          if (blocked.length) {
            var names = blocked.map(function (tid) { var t = DB.get('tests', tid); return t ? t.name : tid; }).join(', ');
            App.toast('Cannot remove (results ready): ' + names, 'err'); return;
          }
          /* sync results rows */
          DB.all('results').filter(function (r) { return r.invoiceId === id; }).forEach(function (r) {
            if (removed.indexOf(r.testId) >= 0) DB.remove('results', r.id);
          });
          var added = newExp.filter(function (tid) { return oldExp.indexOf(tid) < 0; });
          added.forEach(function (tid) {
            DB.insert('results', { invoiceId: id, testId: tid, values: {}, status: 'pending' });
          });
          var t = calcTotal();
          var due = r2(t.total - (+inv.paid || 0));
          var visit = { regLocation: root.querySelector('#ei-regloc').value.trim(), destLocation: root.querySelector('#ei-destloc').value.trim(), reference: root.querySelector('#ei-ref').value };
          if (root.querySelector('#ei-regdate').value && root.querySelector('#ei-regdate').value !== App.toLocalInput(inv.createdAt)) { visit.createdAt = App.fromLocalInput(root.querySelector('#ei-regdate').value); var vd = function (x) { var q = new Date(x); return q.getFullYear() + '-' + q.getMonth() + '-' + q.getDate(); }; if (vd(visit.createdAt) !== vd(inv.createdAt)) visit.caseNo = App.nextVisitNos(visit.createdAt, inv.id).caseNo; }
          DB.update('invoices', id, Object.assign(visit, inv.panelId ? {   /* a company's bill is never collected from the patient: it always stays paid, the account just changes */
            items: items, subtotal: t.sub, discount: t.disc, total: t.total, paid: t.total, due: 0, status: 'paid', doctorId: doctorId || null
          } : {
            items: items, subtotal: t.sub, discount: t.disc, total: t.total,
            due: due < 0.01 ? 0 : due, status: statusOf(+inv.paid || 0, t.total),
            doctorId: doctorId || null
          }));
          try { if (window.Samples) Samples.syncInvoice(DB.get('invoices', id)); } catch (e) { if (window.console) console.error(e); }
          try { App.outsourceSync(id, true); } catch (e) { if (window.console) console.error(e); }
          App.toast('Invoice ' + inv.no + ' updated');
          close(); refresh();
        });
      }
    });
  }

  /* the same two barcodes and QR the report carries: INV # (count, month/year) and P # (count of the day, day/month); the QR holds the invoice and patient details */
  function codesHTML(inv, p) {
    var vn = App.visitNos(inv), s = DB.get('settings', 'main') || {}, bc = App.barcodeHtml;
    var qrText = [inv.no || inv.id, 'Patient ' + String(App.visitNos(inv).cas), (p && p.id) || '', s.labName || '', App.d(inv.createdAt)].filter(Boolean).join(' | '), qr = '';
    try { if (typeof qrcode !== 'undefined') { var q = qrcode(0, 'M'); q.addData(qrText); q.make(); qr = q.createDataURL(4, 4); } } catch (e) { qr = ''; }
    var line = 'font-weight:700;letter-spacing:1px;font-size:11px;margin-top:3px;line-height:1.2;white-space:nowrap;font-family:Arial,sans-serif';
    return '<div style="display:flex;align-items:flex-start;gap:12px;color:#000"><div style="text-align:left">' +
      '<div>' + (bc ? bc(vn.labCode, '100%', '15px').replace('margin:0 auto', 'margin:0') : '') + '<div style="' + line + '">' + App.esc(vn.labText) + '</div></div>' +
      '<div style="margin-top:7px">' + (bc ? bc(vn.caseCode, '100%', '15px').replace('margin:0 auto', 'margin:0') : '') + '<div style="' + line + '">' + App.esc(vn.caseText) + '</div></div></div>' +
      (qr ? '<img src="' + qr + '" style="width:72px;height:72px" alt="QR">' : '') + '</div>';
  }

  function invoicePrintHTML(inv) {
    var s = DB.get('settings', 'main') || {};
    var p = patientOf(inv);
    var d = doctorOf(inv);
    var pays = paymentsOf(inv.id);
    var itemRows = (inv.items || []).map(function (it, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + App.esc(it.code || '') + '</td><td>' +
        App.esc(it.name) + '</td><td style="text-align:right">' + App.money(it.price) + '</td></tr>';
    }).join('');
    var payRows = pays.length ? pays.map(function (py, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + App.d(py.date) + '</td><td>' + App.esc(py.method) +
        '</td><td>' + App.esc(py.note || '—') + '</td><td style="text-align:right">' + App.money(py.amount) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:#888">No payments recorded</td></tr>';
    var opBox = (function () { /* worker 7/15: online-payments Pay Online block for the printed invoice */
      var due = Number(inv.due || 0);
      if (!s.opEnabled || !(due > 0)) return '';
      var lines = [];
      if (s.opJazzcashNo) lines.push('<div>JazzCash: <strong>' + App.esc(s.opJazzcashNo) + '</strong>' + (s.opJazzcashTitle ? ' (' + App.esc(s.opJazzcashTitle) + ')' : '') + '</div>');
      if (s.opEasypaisaNo) lines.push('<div>Easypaisa: <strong>' + App.esc(s.opEasypaisaNo) + '</strong>' + (s.opEasypaisaTitle ? ' (' + App.esc(s.opEasypaisaTitle) + ')' : '') + '</div>');
      if (s.opBankName || s.opIban || s.opRaastId) lines.push('<div>Bank: <strong>' + App.esc(s.opBankName || '') + '</strong>' + (s.opIban ? ', IBAN: ' + App.esc(s.opIban) : '') + (s.opRaastId ? ', Raast ID: ' + App.esc(s.opRaastId) : '') + '</div>');
      if (!lines.length && !s.opInstructions) return '';
      var qr = '';
      if (App.qrDataUrlFor && (s.opRaastId || s.opIban)) {
        try {
          var q = App.qrDataUrlFor('Raast: ' + (s.opRaastId || '—') + ' | IBAN: ' + (s.opIban || '—') + ' | Invoice: ' + (inv.no || inv.id) + ' | Amount: Rs ' + due);
          if (q) qr = '<img src="' + q + '" style="width:56px;height:56px;margin-left:10px;flex:0 0 auto" alt="Pay QR">';
        } catch (e) {}
      }
      return '<div style="border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;margin-bottom:16px;font-size:12.5px;line-height:1.55;display:flex;align-items:center">' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:13px;margin-bottom:2px">Pay Online</div>' + lines.join('') +
        (s.opInstructions ? '<div style="color:#64748b;font-size:11.5px;margin-top:2px">' + App.esc(s.opInstructions) + '</div>' : '') + '</div>' + qr + '</div>';
    })();
    return '' +   /* the lab header (logo, name, address, phone, email) is printed once, by App.print */
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-top:2px solid #131845;border-bottom:2px solid #131845;padding:10px 0;margin-bottom:16px">' +
        '<div><div style="font-size:20px;font-weight:800">INVOICE</div>' +
          '<div style="font-size:13.5px;margin-top:6px"><strong>Invoice No:</strong> ' + App.esc(inv.no || inv.id) + '</div>' +
          '<div style="font-size:13.5px"><strong>Patient No:</strong> ' + (function () { var n = App.visitNos(inv).cas; return n < 10 ? '0' + n : String(n); })() + ' <span style="color:#666;font-size:12px">(today)</span>' + ((p && p.id) ? ' &nbsp;<span style="color:#666;font-size:12px">ID: ' + App.esc(p.id) + '</span>' : '') + '</div>' +
          '<div style="font-size:13px;color:#555;margin-top:4px">Date: ' + App.dt(inv.createdAt) + '</div>' +
          '<div style="font-size:13px">Status: <strong>' + inv.status.toUpperCase() + '</strong></div></div>' +
        codesHTML(inv, p) +
      '</div>' +
      '<div style="display:flex;gap:32px;margin-bottom:16px;font-size:14px">' +
        '<div><strong>Patient:</strong> ' + App.esc(p ? p.name : 'Walk-in') +
        (p ? ' &nbsp;(' + App.esc(String(p.age || '')) + ' / ' + App.esc(p.gender || '') + ')' : '') +
        '<br><strong>Phone:</strong> ' + App.esc((p && p.phone) || '—') +
        (p && p.address ? '<br><strong>Address:</strong> ' + App.esc(p.address) : '') + '</div>' +
        '<div><strong>Consultant:</strong> ' + App.esc(d ? d.name : 'Self') +
        (d ? '<br><span style="color:#555;font-size:12px">' + App.esc(d.clinic || '') + '</span>' : '') +
        (inv.panelId && DB.get('panels', inv.panelId) ? '<br><strong>Billed to:</strong> ' + App.esc(DB.get('panels', inv.panelId).name) + (p && p.panelRef ? '<br><span style="color:#555;font-size:12px">ID: ' + App.esc(p.panelRef) + '</span>' : '') : '') + '</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">' +
        '<thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:8px;border:1px solid #ddd">#</th>' +
        '<th style="text-align:left;padding:8px;border:1px solid #ddd">Code</th>' +
        '<th style="text-align:left;padding:8px;border:1px solid #ddd">Test</th>' +
        '<th style="text-align:right;padding:8px;border:1px solid #ddd">Price</th></tr></thead>' +
        '<tbody>' + itemRows + '</tbody>' +
      '</table>' +
      '<div style="text-align:right;font-size:14px;margin-bottom:16px">' +
        '<div>Subtotal: ' + App.money(inv.subtotal) + '</div>' +
        '<div style="font-size:18px;font-weight:800">Total: ' + App.money(inv.total) + '</div>' +
        (inv.panelId ? '<div style="font-weight:700;color:#334155">Charged to the company account</div>' : '<div>Paid: ' + App.money(inv.paid) + '</div>' +
        '<div style="font-weight:800;color:#dc2626">Due: ' + App.money(inv.due) + '</div>') +
      '</div>' +
      opBox +
      '<div style="font-weight:700;margin-bottom:6px">Payments Received</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">' +
        '<thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:8px;border:1px solid #ddd">#</th>' +
        '<th style="text-align:left;padding:8px;border:1px solid #ddd">Date</th>' +
        '<th style="text-align:left;padding:8px;border:1px solid #ddd">Method</th>' +
        '<th style="text-align:left;padding:8px;border:1px solid #ddd">Note</th>' +
        '<th style="text-align:right;padding:8px;border:1px solid #ddd">Amount</th></tr></thead>' +
        '<tbody>' + payRows + '</tbody>' +
      '</table>' +
      '<div style="font-size:12px;color:#555;text-align:center;margin-bottom:6px">' + App.esc(s.footerNote || '') + '</div>' +
      '<div style="font-size:11px;color:#999;text-align:center;margin-bottom:24px">Powered by System Optix</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:32px">' +
        '<div>Received by: __________________</div><div>Authorised signature: __________________</div>' +
      '</div>';
  }

  function printInvoice(id) {
    var inv = DB.get('invoices', id);
    if (!inv) return;
    App.print('Invoice ' + inv.no, invoicePrintHTML(inv));
  }

  /* ---------- filtering ---------- */
  function filteredInvoices() {
    var list = DB.all('invoices').slice();
    list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var q = F.q.trim().toLowerCase();
    if (q) {
      list = list.filter(function (inv) {
        var p = patientOf(inv);
        var hay = (inv.no + ' ' + (p ? p.name + ' ' + (p.phone || '') : '')).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    if (F.date !== 'all') {
      var t = App.today();
      list = list.filter(function (inv) {
        var k = dayKey(inv.createdAt);
        if (F.date === 'today') return k === t;
        if (F.date === 'yesterday') return k === addDays(t, -1);
        if (F.date === 'last7') return k >= addDays(t, -6) && k <= t;
        return true;
      });
    }
    if (F.status !== 'all') list = list.filter(function (inv) { return inv.status === F.status; });
    return list;
  }

  /* sample-status chip (Samples module); the summary map is rebuilt once per list render */
  var smpMap = {};
  function smpChip(invId) { return window.Samples ? Samples.chipHTML(smpMap[invId]) : ''; }
  function invoiceRows(list) {
    try { smpMap = window.Samples ? Samples.summaryMap() : {}; } catch (e) { smpMap = {}; }
    if (!list.length) return '<tr><td colspan="9">' + App.empty('No invoices found. Adjust filters or create a new bill.') + '</td></tr>';
    return list.map(function (inv) {
      var p = patientOf(inv);
      return '<tr>' +
        '<td><a href="#/invoice/' + App.esc(inv.id) + '" style="font-weight:700;color:var(--brand-d)">' + App.esc(inv.no) + '</a></td>' +
        '<td>' + App.d(inv.createdAt) + '</td>' +
        '<td>' + App.esc(p ? p.name : 'Walk-in') +
          (p && p.phone ? '<div style="font-size:12px;color:var(--muted)">' + App.esc(p.phone) + '</div>' : '') + '</td>' +
        '<td style="text-align:center">' + (inv.items ? inv.items.length : 0) + '</td>' +
        '<td style="text-align:right">' + App.money(inv.total) + '</td>' +
        '<td style="text-align:right;color:var(--green)">' + App.money(inv.paid) + '</td>' +
        '<td style="text-align:right;font-weight:700;color:' + (inv.due > 0 ? 'var(--red)' : 'var(--muted)') + '">' + App.money(inv.due) + '</td>' +
        '<td>' + App.badge(inv.status) + panelChip(inv) + smpChip(inv.id) + '</td>' +
        '<td class="actions"><a class="btn btn-sm btn-ghost" href="#/invoice/' + App.esc(inv.id) + '">View</a>' +
        ' <button class="btn btn-sm btn-ghost" data-stickers="' + App.esc(inv.id) + '" title="Print 50×25mm Tube Stickers">🏷️ Stickers</button>' +
        (r2(inv.due) > 0 ? ' <button class="btn btn-sm btn-primary" data-collect="' + App.esc(inv.id) + '">Collect</button>' : '') +
        ' <button class="btn btn-sm btn-ghost" data-edit="' + App.esc(inv.id) + '">Edit</button>' +
        ' <button class="btn btn-sm btn-danger" data-del="' + App.esc(inv.id) + '">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  /* ---------- route: #/invoices ---------- */
  function renderInvoices() {
    setRefresh(renderInvoices);
    var view = document.getElementById('view');

    /* stat cards: month overview (static, not affected by filters) */
    var ivIsTech = scIsTech();
    var ivMonthKey = App.today().slice(0, 7);
    var ivAll = DB.all('invoices');
    var ivMonth = ivAll.filter(function (i) { return String(i.createdAt || '').slice(0, 7) === ivMonthKey; });
    var ivMonthPays = DB.all('payments').filter(function (p) { return String(p.date || '').slice(0, 7) === ivMonthKey; });
    var ivBilled = ivMonth.reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var ivCollected = ivMonthPays.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
    var ivDueAll = ivAll.filter(function (i) { return i.status !== 'paid'; });
    var ivOutstanding = ivDueAll.reduce(function (s, i) { return s + (+i.due || 0); }, 0);
    var invStats =
      kpiCard(SC_ICONS.doc, 'brand', 'Invoices This Month', String(ivMonth.length), 'invoices created') +
      kpiCard(SC_ICONS.cash, 'green', 'Billed This Month',
        ivIsTech ? String(ivMonth.length) : App.money(ivBilled),
        ivIsTech ? 'invoices this month' : 'total invoiced value') +
      kpiCard(SC_ICONS.cal, 'blue', 'Collected This Month',
        ivIsTech ? String(ivMonthPays.length) : App.money(ivCollected),
        ivIsTech ? 'payments this month' : 'payments received') +
      kpiCard(SC_ICONS.clock, 'amber', 'Outstanding Dues',
        ivIsTech ? String(ivDueAll.length) : App.money(ivOutstanding),
        ivIsTech ? 'invoices with dues' : 'yet to collect');

    view.innerHTML =
      '<div class="card"><div class="card-b">' +
        SC_STYLE +
        '<div class="stat-grid">' + invStats + '</div>' +
        '<div class="toolbar" style="margin:0 0 12px;gap:8px;flex-wrap:nowrap">' +
          '<input id="f-q" class="input" style="flex:1;min-width:0;width:auto;padding:8px 12px;font-size:13px" placeholder="Search invoice no, patient, phone..." value="' + App.esc(F.q) + '">' +
          '<select id="f-date" class="select" style="width:auto;flex:0 0 auto;padding:8px 10px;font-size:13px">' +
            '<option value="all">All dates</option>' +
            '<option value="today"' + (F.date === 'today' ? ' selected' : '') + '>Today</option>' +
            '<option value="yesterday"' + (F.date === 'yesterday' ? ' selected' : '') + '>Yesterday</option>' +
            '<option value="last7"' + (F.date === 'last7' ? ' selected' : '') + '>Last 7 days</option>' +
          '</select>' +
          '<select id="f-status" class="select" style="width:auto;flex:0 0 auto;padding:8px 10px;font-size:13px">' +
            '<option value="all">All statuses</option>' +
            '<option value="paid"' + (F.status === 'paid' ? ' selected' : '') + '>Paid</option>' +
            '<option value="partial"' + (F.status === 'partial' ? ' selected' : '') + '>Partial</option>' +
            '<option value="unpaid"' + (F.status === 'unpaid' ? ' selected' : '') + '>Unpaid</option>' +
          '</select>' +
          '<a class="btn btn-ghost" href="#/samples/stickers" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:8px 12px;white-space:nowrap">' + App.icon('tube', 14) + ' Tube Stickers</a>' +
        '</div>' +
        '<div class="tbl-wrap"><table class="table"><thead><tr>' +
          '<th>Invoice No</th><th>Date</th><th>Patient</th><th style="text-align:center">Tests</th>' +
          '<th style="text-align:right">Total</th><th style="text-align:right">Paid</th>' +
          '<th style="text-align:right">Due</th><th>Status</th><th>Actions</th>' +
        '</tr></thead><tbody id="inv-rows"></tbody></table></div>' +
      '</div></div>';

    function update() {
      var list = filteredInvoices();
      document.getElementById('inv-rows').innerHTML = invoiceRows(list);
      view.querySelectorAll('[data-stickers]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var invId = btn.getAttribute('data-stickers');
          App.loadScript('assets/js/mod-samples.js').then(function () {
            var smps = window.Samples ? Samples.forInvoice(invId) : [];
            if (!smps.length && window.Samples) {
              var inv = DB.get('invoices', invId);
              if (inv) smps = Samples.createForInvoice(inv);
            }
            if (smps.length && App.openLabelDialog) {
              App.openLabelDialog(smps.map(function (s) { return s.id; }));
            } else {
              App.toast('No specimen tube stickers for this invoice', 'info');
            }
          });
        });
      });
      view.querySelectorAll('[data-collect]').forEach(function (btn) {
        btn.addEventListener('click', function () { openPaymentModal(btn.getAttribute('data-collect')); });
      });
      view.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () { openEditInvoice(btn.getAttribute('data-edit')); });
      });
      view.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteInvoice(btn.getAttribute('data-del')); });
      });
    }
    document.getElementById('f-q').addEventListener('input', function (e) { F.q = e.target.value; update(); });
    document.getElementById('f-date').addEventListener('change', function (e) { F.date = e.target.value; update(); });
    document.getElementById('f-status').addEventListener('change', function (e) { F.status = e.target.value; update(); });
    update();
  }

  /* ---------- route: #/invoice/:id ---------- */
  function renderInvoiceDetail(params) {
    var id = (params && params.id) || (location.hash.split('/').pop() || '');
    var inv = DB.get('invoices', id);
    if (!inv) { App.toast('Invoice not found', 'err'); App.nav('#/invoices'); return; }
    setRefresh(function () { renderInvoiceDetail({ id: id }); });

    var s = DB.get('settings', 'main') || {};
    var p = patientOf(inv);
    var d = doctorOf(inv);
    var pays = paymentsOf(inv.id);
    var view = document.getElementById('view');

    var itemRows = (inv.items || []).map(function (it, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + App.esc(it.code || '—') + '</td><td>' +
        App.esc(it.name) + '</td><td style="text-align:right">' + App.money(it.price) + '</td></tr>';
    }).join('');

    var payRows = pays.length ? pays.map(function (py, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + App.d(py.date) + '</td>' +
        '<td style="text-align:right;font-weight:700">' + App.money(py.amount) + '</td>' +
        '<td>' + App.esc(py.method) + '</td><td>' + App.esc(py.note || '—') + '</td>' +
        '<td style="color:var(--muted);font-size:12px">' + App.esc(py.createdBy || '') + '</td>' +
        '<td class="actions" style="white-space:nowrap"><button class="btn btn-sm btn-ghost" data-receipt="' + App.esc(py.id) + '">Receipt</button> ' +
        '<button class="btn btn-sm btn-ghost" data-void="' + App.esc(py.id) + '" style="color:var(--red)">Void</button></td></tr>';
    }).join('') : '<tr><td colspan="7">' + App.empty('No payments recorded yet.') + '</td></tr>';

    var smpList = [];
    try { if (window.Samples) smpList = Samples.forInvoice(inv.id).sort(function (a, b) { return String(a.barcode).localeCompare(String(b.barcode), undefined, { numeric: true }); }); } catch (e) {}
    var smpSum = window.Samples ? Samples.summaryMap(smpList)[inv.id] : null;
    var smpCard = !window.Samples ? '' :
      '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3>Samples' + (smpList.length ? ' (' + smpList.length + ')' : '') + '</h3><div class="sp"></div>' +
        (smpList.length
          ? '<button class="btn btn-sm btn-ghost" id="iv-smp-print">' + SC_ICONS.printer + ' Print labels</button><a class="btn btn-sm btn-ghost" href="#/samples" id="iv-smp-open">Open Samples</a>'
          : '<button class="btn btn-sm btn-primary" id="iv-smp-gen">Generate samples</button>') +
      '</div>' +
      (smpList.length
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Barcode</th><th>Tube</th><th>Tests</th><th>Status</th></tr></thead><tbody>' +
          smpList.map(function (s) {
            return '<tr><td><span class="mono" style="font-weight:700">' + App.esc(s.barcode) + '</span></td>' +
              '<td>' + Samples.tubeDot(s.tube) + App.esc(s.tube) + '</td>' +
              '<td>' + App.esc((s.testNames || []).join(', ')) + '</td>' +
              '<td>' + Samples.badge(s.status) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="card-b"><div style="color:var(--muted);font-size:13.5px">No sample tubes were created for this invoice (it was billed before sample tracking was enabled).</div></div>') +
      '</div>';

    // Online payments (shown only when opEnabled in settings AND there is a due amount)
    var opPayCard = '';
    if (s.opEnabled && r2(inv.due) > 0) {
      var opRows = '';
      if (s.opJazzcashNo) opRows += '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed var(--line)"><span style="font-weight:700">JazzCash</span><span style="text-align:right">' + App.esc(s.opJazzcashNo) + (s.opJazzcashTitle ? '<br><span style="color:var(--muted);font-size:12px">' + App.esc(s.opJazzcashTitle) + '</span>' : '') + '</span></div>';
      if (s.opEasypaisaNo) opRows += '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed var(--line)"><span style="font-weight:700">Easypaisa</span><span style="text-align:right">' + App.esc(s.opEasypaisaNo) + (s.opEasypaisaTitle ? '<br><span style="color:var(--muted);font-size:12px">' + App.esc(s.opEasypaisaTitle) + '</span>' : '') + '</span></div>';
      if (s.opBankName || s.opIban || s.opRaastId) opRows += '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed var(--line)"><span style="font-weight:700">Bank</span><span style="text-align:right">' + (s.opBankName ? App.esc(s.opBankName) : '') + (s.opIban ? '<br><span class="mono">IBAN: ' + App.esc(s.opIban) + '</span>' : '') + (s.opRaastId ? '<br><span class="mono">Raast ID: ' + App.esc(s.opRaastId) + '</span>' : '') + '</span></div>';
      var opQrHtml = '';
      try {
        if (App.qrDataUrlFor) {
          var opQr = App.qrDataUrlFor('Raast: ' + (s.opRaastId || '') + ' | IBAN: ' + (s.opIban || '') + ' | Invoice: ' + inv.no + ' | Amount: Rs ' + r2(inv.due));
          if (opQr) opQrHtml = '<div style="margin:10px 0;text-align:center"><img src="' + opQr + '" alt="Payment QR" style="width:140px;height:140px;border:1px solid var(--line);border-radius:10px;padding:6px;background:#fff"><div style="font-size:12px;color:var(--muted);margin-top:4px">Scan to pay ' + App.money(inv.due) + '</div></div>';
        }
      } catch (e) {}
      opPayCard =
        '<div class="card" style="margin-bottom:18px"><div class="card-h">Pay Online</div><div class="card-b">' +
          opRows +
          opQrHtml +
          (s.opInstructions ? '<div style="font-size:13px;color:var(--muted);margin-top:8px;white-space:pre-wrap">' + App.esc(s.opInstructions) + '</div>' : '') +
          '<div style="margin-top:10px"><button class="btn btn-primary" id="iv-onlinepay">I have paid — record TID</button></div>' +
        '</div></div>';
    }

    view.innerHTML =
      '<div class="toolbar">' +
        '<a class="btn btn-ghost" href="#/invoices">← Back to Invoices</a>' +
        '<div style="flex:1"></div>' +
        '<button class="btn btn-ghost" id="iv-stickers">🏷️ Tube Stickers (50×25mm)</button>' +
        '<button class="btn btn-ghost" id="iv-print">' + SC_ICONS.printer + ' Print Invoice</button>' +
        '<button class="btn btn-ghost" id="iv-edit">Edit</button>' +
        '<button class="btn btn-ghost" id="iv-wa">WhatsApp</button>' +
        (r2(inv.due) > 0 ? '<button class="btn btn-primary" id="iv-collect">Collect Payment</button>' : '') +
        '<button class="btn btn-danger" id="iv-del">Delete</button>' +
      '</div>' +

      '<div class="card" style="margin-bottom:18px"><div class="card-b">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">' +
          '<div>' +
            '<div style="font-size:12px;letter-spacing:.1em;color:var(--muted);font-weight:700">' + App.esc(s.labName || 'Lab').toUpperCase() + '</div>' +
            '<h2 style="margin:4px 0">Invoice ' + App.esc(inv.no) + '</h2>' +
            '<div style="color:var(--muted);font-size:13px">' + App.esc(s.address || '') + ' &nbsp;•&nbsp; ' + App.esc(s.phone || '') + '</div>' +
          '</div>' +
          '<div style="text-align:right">' + App.badge(inv.status) + panelChip(inv) + (smpSum ? Samples.chipHTML(smpSum) : '') +
            '<div style="margin-top:8px;font-size:13px;color:var(--muted)">Date: <strong style="color:var(--ink)">' + App.d(inv.createdAt) + '</strong></div>' +
            (inv.createdBy ? '<div style="font-size:12px;color:var(--muted)">By: ' + App.esc(inv.createdBy) + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div></div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">' +
        '<div class="card"><div class="card-h">Patient</div><div class="card-b">' +
          '<div style="font-size:17px;font-weight:800">' + App.esc(p ? p.name : 'Walk-in') + '</div>' +
          (p ? '<div style="color:var(--muted);font-size:13px;margin-top:4px">' +
            App.esc(String(p.age || '')) + (p.age ? ' yrs' : '') + ' &nbsp;•&nbsp; ' + App.esc(p.gender || '') +
            (p.phone ? ' &nbsp;•&nbsp; ' + App.esc(p.phone) : '') + '</div>' +
            (p.address ? '<div style="font-size:13px;margin-top:4px">' + App.esc(p.address) + '</div>' : '') +
            '<div style="margin-top:10px"><a class="btn btn-sm btn-ghost" href="#/patient/' + App.esc(p.id) + '">View Patient</a></div>'
            : '<div style="color:var(--muted);font-size:13px">No patient record linked.</div>') +
        '</div></div>' +
        '<div class="card"><div class="card-h">Consultant</div><div class="card-b">' +
          (d ? '<div style="font-size:16px;font-weight:700">' + App.esc(d.name) + '</div>' +
            '<div style="color:var(--muted);font-size:13px;margin-top:4px">' + App.esc(d.clinic || '') +
            (d.phone ? ' &nbsp;•&nbsp; ' + App.esc(d.phone) : '') + '</div>' +
            '<div style="font-size:13px;margin-top:4px">Commission: <strong>' + ((d.commissionRules || []).length ? App.money(App.commissionOf(inv, d, App.testsById())) + '</strong> (special rates)' : (Number(d.commissionPct) || 0) + '%</strong>') + '</div>'
            : '<div style="color:var(--muted)">Self / walk-in (no referral)</div>') +
        '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:18px"><div class="card-h">Tests (' + (inv.items ? inv.items.length : 0) + ')</div>' +
        '<div class="tbl-wrap"><table class="table"><thead><tr><th>#</th><th>Code</th><th>Test</th>' +
        '<th style="text-align:right">Price</th></tr></thead><tbody>' + itemRows + '</tbody></table></div>' +
        '<div class="card-b" style="display:flex;justify-content:flex-end">' +
          '<div style="min-width:260px;font-size:14px">' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0"><span>Subtotal</span><span>' + App.money(inv.subtotal) + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0"><span>Discount</span><span>' + App.money(inv.discount || 0) + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:18px;font-weight:800;border-top:1px solid var(--line);margin-top:4px"><span>Total</span><span>' + App.money(inv.total) + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--green)"><span>Paid</span><span>' + App.money(inv.paid) + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:800;color:' + (inv.due > 0 ? 'var(--red)' : 'var(--muted)') + '"><span>Due</span><span>' + App.money(inv.due) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      opPayCard +

      smpCard +

      '<div class="card"><div class="card-h">Payment History</div>' +
        '<div class="tbl-wrap"><table class="table"><thead><tr><th>#</th><th>Date</th>' +
        '<th style="text-align:right">Amount</th><th>Method</th><th>Note</th><th>By</th><th>Actions</th></tr></thead>' +
        '<tbody>' + payRows + '</tbody></table></div></div>';

    document.getElementById('iv-print').addEventListener('click', function () { printInvoice(inv.id); });
    var stkBtn = document.getElementById('iv-stickers');
    if (stkBtn) stkBtn.addEventListener('click', function () {
      App.loadScript('assets/js/mod-samples.js').then(function () {
        var smps = window.Samples ? Samples.forInvoice(inv.id) : [];
        if (!smps.length && window.Samples) smps = Samples.createForInvoice(inv);
        if (smps.length && App.openLabelDialog) {
          App.openLabelDialog(smps.map(function (s) { return s.id; }));
        } else {
          App.toast('No specimen tube stickers for this invoice', 'info');
        }
      });
    });
    document.getElementById('iv-edit').addEventListener('click', function () { openEditInvoice(inv.id); });
    document.getElementById('iv-wa').addEventListener('click', function () { shareInvoiceWhatsApp(inv.id); });
    var cBtn = document.getElementById('iv-collect');
    if (cBtn) cBtn.addEventListener('click', function () { openPaymentModal(inv.id); });
    var opBtn = document.getElementById('iv-onlinepay');
    if (opBtn) opBtn.addEventListener('click', function () { openOnlinePayModal(inv.id); });
    document.getElementById('iv-del').addEventListener('click', function () { deleteInvoice(inv.id); });
    var spBtn = document.getElementById('iv-smp-print');
    if (spBtn) spBtn.addEventListener('click', function () { Samples.printLabels(smpList.map(function (s) { return s.id; })); });
    var soBtn = document.getElementById('iv-smp-open');
    if (soBtn) soBtn.addEventListener('click', function () { try { sessionStorage.setItem('labpos_smp_q', inv.no || inv.id); } catch (e) {} });
    var sgBtn = document.getElementById('iv-smp-gen');
    if (sgBtn) sgBtn.addEventListener('click', function () {
      var made = Samples.createForInvoice(inv);
      App.toast(made.length ? made.length + ' sample(s) generated' : 'No samples could be generated', made.length ? 'ok' : 'err');
      refresh();
    });
    view.querySelectorAll('[data-receipt]').forEach(function (b) {
      b.addEventListener('click', function () { printReceipt(b.getAttribute('data-receipt')); });
    });
    view.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () { voidPayment(b.getAttribute('data-void')); });
    });
  }

  /* ---------- route: #/dues ---------- */
  function renderDues() {
    setRefresh(renderDues);
    var list = DB.all('invoices')
      .filter(function (inv) { return inv.status !== 'paid'; })
      .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); }); // oldest first
    var totalDue = list.reduce(function (s, inv) { return s + inv.due; }, 0);

    /* stat cards: outstanding overview */
    var duesIsTech = scIsTech();
    var duesMonthKey = App.today().slice(0, 7);
    var duesMonthPays = DB.all('payments').filter(function (p) { return String(p.date || '').slice(0, 7) === duesMonthKey; });
    var duesCollected = duesMonthPays.reduce(function (s, p) { return s + (+p.amount || 0); }, 0);
    var duesUnpaid = list.filter(function (i) { return i.status === 'unpaid'; });
    var cutD = new Date(new Date(App.today() + 'T12:00:00').getTime() - 30 * 864e5);
    var cutKey = cutD.getFullYear() + '-' + String(cutD.getMonth() + 1).padStart(2, '0') + '-' + String(cutD.getDate()).padStart(2, '0');
    var duesOverdue = list.filter(function (i) { return String(i.createdAt || '').slice(0, 10) <= cutKey; });
    var duesOverdueAmt = duesOverdue.reduce(function (s, i) { return s + (+i.due || 0); }, 0);
    var duesStats =
      kpiCard(SC_ICONS.cash, 'brand', 'Total Outstanding',
        duesIsTech ? String(list.length) : App.money(totalDue),
        duesIsTech ? 'invoices with dues' : list.length + ' unpaid invoice(s)') +
      kpiCard(SC_ICONS.doc, 'blue', 'Unpaid Invoices', String(duesUnpaid.length), 'zero payment received') +
      kpiCard(SC_ICONS.clock, 'amber', 'Overdue 30+ Days',
        duesIsTech ? String(duesOverdue.length) : App.money(duesOverdueAmt),
        duesIsTech ? 'invoices overdue' : duesOverdue.length + ' invoice(s) overdue') +
      kpiCard(SC_ICONS.cal, 'green', 'Collected This Month',
        duesIsTech ? String(duesMonthPays.length) : App.money(duesCollected),
        duesIsTech ? 'payments this month' : 'payments received');

    var rows = list.length ? list.map(function (inv) {
      var p = patientOf(inv);
      return '<tr>' +
        '<td><a href="#/invoice/' + App.esc(inv.id) + '" style="font-weight:700;color:var(--brand-d)">' + App.esc(inv.no) + '</a></td>' +
        '<td>' + App.d(inv.createdAt) + '</td>' +
        '<td>' + App.esc(p ? p.name : 'Walk-in') +
          (p && p.phone ? '<div style="font-size:12px;color:var(--muted)">' + App.esc(p.phone) + '</div>' : '') + '</td>' +
        '<td style="text-align:right">' + App.money(inv.total) + '</td>' +
        '<td style="text-align:right;color:var(--green)">' + App.money(inv.paid) + '</td>' +
        '<td style="text-align:right;font-weight:800;color:var(--red)">' + App.money(inv.due) + '</td>' +
        '<td>' + App.badge(inv.status) + panelChip(inv) + '</td>' +
        '<td class="actions"><button class="btn btn-sm btn-primary" data-collect="' + App.esc(inv.id) + '">Collect</button> ' +
        '<a class="btn btn-sm btn-ghost" href="#/invoice/' + App.esc(inv.id) + '">View</a> ' +
        '<button class="btn btn-sm btn-ghost" data-edit="' + App.esc(inv.id) + '">Edit</button> ' +
        '<button class="btn btn-sm btn-danger" data-del="' + App.esc(inv.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="8">' + App.empty('🎉 No outstanding dues. All invoices are paid.') + '</td></tr>';

    /* pending online-payment claims indicator (worker 9/15: DUES BADGE) */
    var pendingClaims = (DB.all('onlinepay_claims') || []).filter(function (c) { return c.status === 'pending'; }).length;
    var pendingBadge = pendingClaims > 0
      ? '<div style="margin-bottom:12px"><a href="#/online-payments" class="badge b-pending" style="text-decoration:none">' + pendingClaims + ' online payment(s) pending verification</a></div>'
      : '';

    document.getElementById('view').innerHTML =
      SC_STYLE +
      pendingBadge +
      '<div class="stat-grid">' + duesStats + '</div>' +
      '<div class="card"><div class="card-b"><div class="tbl-wrap"><table class="table"><thead><tr>' +
        '<th>Invoice No</th><th>Date</th><th>Patient</th><th style="text-align:right">Total</th>' +
        '<th style="text-align:right">Paid</th><th style="text-align:right">Due</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';

    document.getElementById('view').querySelectorAll('[data-collect]').forEach(function (btn) {
      btn.addEventListener('click', function () { openPaymentModal(btn.getAttribute('data-collect')); });
    });
    document.getElementById('view').querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditInvoice(btn.getAttribute('data-edit')); });
    });
    document.getElementById('view').querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteInvoice(btn.getAttribute('data-del')); });
    });
  }

  function renderDiscounts() {
    setRefresh(renderDiscounts);
    var all = DB.all('invoices')
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }); // newest first
    var disc = function (inv) { return +inv.discount || 0; };
    var isTech = scIsTech();
    var monthKey = App.today().slice(0, 7);
    var totalDisc = all.reduce(function (s, inv) { return s + disc(inv); }, 0);
    var monthDisc = all.filter(function (inv) { return String(inv.createdAt || '').slice(0, 7) === monthKey; })
      .reduce(function (s, inv) { return s + disc(inv); }, 0);
    var withDisc = all.filter(function (inv) { return disc(inv) > 0; });
    var biggest = all.reduce(function (m, inv) { return Math.max(m, disc(inv)); }, 0);
    var discStats =
      kpiCard(SC_ICONS.cash, 'brand', 'Total Discount Given',
        isTech ? String(withDisc.length) : App.money(totalDisc),
        isTech ? 'invoices with discount' : withDisc.length + ' discounted invoice(s)') +
      kpiCard(SC_ICONS.cal, 'green', 'Discounts This Month',
        isTech ? String(withDisc.length) : App.money(monthDisc),
        isTech ? 'invoices with discount' : 'given this month') +
      kpiCard(SC_ICONS.doc, 'blue', 'Invoices With Discount', String(withDisc.length), 'have a discount') +
      kpiCard(SC_ICONS.cash, 'amber', 'Biggest Discount',
        isTech ? String(withDisc.length) : App.money(biggest),
        isTech ? 'invoices with discount' : 'on a single invoice');

    var rows = all.length ? all.map(function (inv) {
      var p = patientOf(inv);
      return '<tr>' +
        '<td><a href="#/invoice/' + App.esc(inv.id) + '" style="font-weight:700;color:var(--brand-d)">' + App.esc(inv.no) + '</a></td>' +
        '<td>' + App.d(inv.createdAt) + '</td>' +
        '<td>' + App.esc(p ? p.name : 'Walk-in') +
          (p && p.phone ? '<div style="font-size:12px;color:var(--muted)">' + App.esc(p.phone) + '</div>' : '') + '</td>' +
        '<td style="text-align:right">' + App.money(inv.total) + '</td>' +
        '<td style="text-align:right">' + App.money(disc(inv)) + '</td>' +
        '<td style="text-align:right;color:var(--green)">' + App.money(inv.paid) + '</td>' +
        '<td style="text-align:right;font-weight:800;color:var(--red)">' + App.money(inv.due) + '</td>' +
        '<td>' + App.badge(inv.status) + panelChip(inv) + '</td>' +
        '<td class="actions"><a class="btn btn-sm btn-ghost" href="#/invoice/' + App.esc(inv.id) + '">View</a> ' +
        '<button class="btn btn-sm btn-ghost" data-edit="' + App.esc(inv.id) + '">Edit</button></td></tr>';
    }).join('') : '<tr><td colspan="9">' + App.empty('No invoices yet. Discounts will appear here.') + '</td></tr>';

    document.getElementById('view').innerHTML =
      SC_STYLE +
      '<div class="stat-grid">' + discStats + '</div>' +
      '<div class="card"><div class="card-b"><div class="tbl-wrap"><table class="table"><thead><tr>' +
        '<th>Invoice No</th><th>Date</th><th>Patient</th><th style="text-align:right">Total</th>' +
        '<th style="text-align:right">Discount</th><th style="text-align:right">Paid</th>' +
        '<th style="text-align:right">Due</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';

    document.getElementById('view').querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditInvoice(btn.getAttribute('data-edit')); });
    });
  }

  /* ---------- register ---------- */
  /* the barcode drawing lives in the results module; load it ahead so printing never has to wait */
  if (!App.barcodeHtml && App.loadScript) App.loadScript('assets/js/mod-results.js').catch(function () {});
  App.route('#/invoices', renderInvoices);
  App.route('#/invoice/:id', renderInvoiceDetail);
  App.route('#/dues', renderDues);
  App.route('#/discounts', renderDiscounts);
})();
