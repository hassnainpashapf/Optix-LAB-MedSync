/* Optix Medical Sync — Invoices & Dues module
   Routes: #/invoices, #/invoice/:id, #/dues
   Depends on: DB (db.js), App (app.js) as specified in SPEC.md */
(function () {
  'use strict';

  /* ---------- dashboard-style stat cards: shared compact CSS now in app.css ---------- */
  var SC_STYLE = '';
  var SC_ICONS = {
    doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;max-width:20px;max-height:20px;flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    cash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;max-width:20px;max-height:20px;flex-shrink:0"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    cal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;max-width:20px;max-height:20px;flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;max-width:20px;max-height:20px;flex-shrink:0"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    printer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;max-width:20px;max-height:20px;flex-shrink:0"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
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
  function recordPayment(invoiceId, amount, method, note, discountAmount, discountNote) {
    var inv = DB.get('invoices', invoiceId);
    if (!inv) return false;
    amount = r2(amount || 0);
    discountAmount = r2(discountAmount || 0);
    if (discountAmount < 0) discountAmount = 0;
    if (amount < 0) amount = 0;

    if (amount === 0 && discountAmount === 0) {
      App.toast('Enter an amount received or discount', 'err');
      return false;
    }

    var currentDue = r2(inv.due);
    if (discountAmount > currentDue + 0.009) {
      App.toast('Discount cannot exceed remaining due (' + App.money(currentDue) + ')', 'err');
      return false;
    }

    var dueAfterDisc = r2(currentDue - discountAmount);
    if (amount > dueAfterDisc + 0.009) {
      App.toast('Amount cannot exceed remaining payable (' + App.money(dueAfterDisc) + ')', 'err');
      return false;
    }

    var subtotal = (inv.subtotal != null && !isNaN(inv.subtotal)) ? r2(inv.subtotal) : r2((inv.total || 0) + (inv.discount || 0));
    var oldDiscount = r2(inv.discount || 0);
    var newDiscount = r2(oldDiscount + discountAmount);
    var newTotal = Math.max(0, r2(subtotal - newDiscount));

    if (amount > 0) {
      var payNote = note || '';
      if (discountAmount > 0) {
        var discTag = 'Concession: ' + App.money(discountAmount) + (discountNote ? ' (' + discountNote + ')' : '');
        payNote = payNote ? (payNote + ' | ' + discTag) : discTag;
      }
      DB.insert('payments', {
        invoiceId: invoiceId,
        amount: amount,
        method: method || 'Cash',
        date: new Date().toISOString(),
        note: payNote,
        createdBy: sessUser()
      });
    }

    var newPaid = r2(paymentsOf(invoiceId).reduce(function (a, x) { return a + (+x.amount || 0); }, 0));
    var newDue = Math.max(0, r2(newTotal - newPaid));
    var newStatus = statusOf(newPaid, newTotal);

    var invUpdates = {
      subtotal: subtotal,
      discount: newDiscount,
      total: newTotal,
      paid: newPaid,
      due: newDue < 0.01 ? 0 : newDue,
      status: newStatus
    };
    if (discountAmount > 0 && discountNote) {
      invUpdates.discountReason = discountNote;
    }
    DB.update('invoices', invoiceId, invUpdates);

    if (amount > 0 && discountAmount > 0) {
      App.toast(App.money(amount) + ' collected & ' + App.money(discountAmount) + ' concession applied for ' + inv.no);
    } else if (amount > 0) {
      App.toast(App.money(amount) + ' collected for ' + inv.no);
    } else {
      App.toast('Concession of ' + App.money(discountAmount) + ' applied to ' + inv.no);
    }

    /* a finished report that was waiting for this payment goes out on WhatsApp now */
    try {
      if (newDue < 0.01) {
        if (App.waOnPaid) App.waOnPaid(invoiceId);
        else if (App.session && DB.all('results').some(function (r) { return r.invoiceId === invoiceId; })) {
          App.loadScript('assets/js/mod-results.js').then(function () {
            if (App.waOnPaid) App.waOnPaid(invoiceId);
          }, function () {});
        }
      }
    } catch (e) {}
    return true;
  }

  function openPaymentModal(invoiceId, focusDiscount) {
    var inv = DB.get('invoices', invoiceId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    if (r2(inv.due) <= 0) { App.toast('No due remaining on ' + inv.no, 'err'); return; }
    var p = patientOf(inv);
    var existingSubtotal = (inv.subtotal != null && !isNaN(inv.subtotal)) ? r2(inv.subtotal) : r2((inv.total || 0) + (inv.discount || 0));
    var existingDiscount = r2(inv.discount || 0);
    var initialDue = r2(inv.due);

    var body =
      '<div style="margin-bottom:14px;padding:10px 14px;background:var(--subtle);border:1px solid var(--line);border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-weight:800;font-size:15px;color:var(--brand-d)">Invoice ' + App.esc(inv.no) + '</div>' +
          '<div style="color:var(--ink);font-weight:600;font-size:13px">' + App.esc(p ? p.name : 'Walk-in') + (p && p.phone ? ' &bull; ' + App.esc(p.phone) : '') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700">Remaining Due</div>' +
          '<div id="pm-cur-due-badge" style="font-weight:900;font-size:20px;color:var(--red)">' + App.money(initialDue) + '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Discount / Concession Section -->' +
      '<div style="border:1.5px solid #fde68a;background:#fffdf5;border-radius:10px;padding:12px 14px;margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">' +
          '<label class="label" style="margin:0;font-weight:700;color:#92400e;display:inline-flex;align-items:center;gap:5px">' +
            '🏷️ Discount / Concession' +
            (existingDiscount > 0 ? '<span style="font-size:11px;font-weight:500;color:var(--muted);margin-left:4px">(Prev: ' + App.money(existingDiscount) + ')</span>' : '') +
          '</label>' +
          '<div style="display:inline-flex;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;background:#fff">' +
            '<button type="button" id="pm-mode-rs" class="btn btn-xs" style="padding:2px 10px;font-size:11px;font-weight:700;border:none;border-radius:0;background:var(--brand);color:#fff">Rs (PKR)</button>' +
            '<button type="button" id="pm-mode-pct" class="btn btn-xs btn-ghost" style="padding:2px 10px;font-size:11px;font-weight:700;border:none;border-radius:0;color:var(--muted)">% (Pct)</button>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
          '<div style="position:relative;flex:1">' +
            '<input id="pm-disc" class="input" type="number" min="0" max="' + initialDue + '" step="any" placeholder="0" style="padding-right:32px;font-weight:700;font-size:15px">' +
            '<span id="pm-mode-unit" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--muted);pointer-events:none;font-weight:700">Rs</span>' +
          '</div>' +
          '<button type="button" id="pm-waive-btn" class="btn btn-sm btn-ghost" style="color:#b45309;background:#fef3c7;border:1px solid #fde68a;font-weight:700;white-space:nowrap" title="Waive 100% of the remaining due">Waive Full Due</button>' +
        '</div>' +

        '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px">' +
          '<span style="font-size:11px;color:var(--muted);font-weight:600">Quick:</span>' +
          '<button type="button" class="btn btn-xs btn-ghost pm-chip" data-pct="5" style="border-radius:12px;padding:2px 8px;font-size:11px">5%</button>' +
          '<button type="button" class="btn btn-xs btn-ghost pm-chip" data-pct="10" style="border-radius:12px;padding:2px 8px;font-size:11px">10%</button>' +
          '<button type="button" class="btn btn-xs btn-ghost pm-chip" data-pct="15" style="border-radius:12px;padding:2px 8px;font-size:11px">15%</button>' +
          '<button type="button" class="btn btn-xs btn-ghost pm-chip" data-pct="20" style="border-radius:12px;padding:2px 8px;font-size:11px">20%</button>' +
          '<button type="button" class="btn btn-xs btn-ghost pm-chip" data-pct="25" style="border-radius:12px;padding:2px 8px;font-size:11px">25%</button>' +
          '<button type="button" class="btn btn-xs btn-ghost pm-chip" data-pct="50" style="border-radius:12px;padding:2px 8px;font-size:11px">50%</button>' +
          '<button type="button" id="pm-disc-clear" class="btn btn-xs btn-ghost" style="border-radius:12px;padding:2px 8px;font-size:11px;color:var(--red)" title="Reset discount">✕ Reset</button>' +
        '</div>' +

        '<input id="pm-disc-note" class="input" style="font-size:12px;padding:6px 10px" placeholder="Concession note / reason (e.g. Doctor recommendation, relative, needy...)">' +

        '<div id="pm-summary-bar" style="margin-top:10px;padding:8px 12px;background:#fff;border:1px dashed #f59e0b;border-radius:8px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">' +
          '<span>Due: <strong style="color:var(--ink)">' + App.money(initialDue) + '</strong></span>' +
          '<span style="color:#b45309">Discount: <strong id="pm-sum-disc">- Rs 0</strong></span>' +
          '<span>Net Payable: <strong id="pm-sum-net" style="color:var(--brand-d);font-size:14px">' + App.money(initialDue) + '</strong></span>' +
        '</div>' +
      '</div>' +

      '<!-- Payment Collection Section -->' +
      '<div class="form-grid">' +
        '<div>' +
          '<label class="label">Amount Received (Cash / Bank) *</label>' +
          '<input id="pm-amount" class="input" type="number" min="0" step="any" value="' + initialDue + '" style="font-weight:700;font-size:15px">' +
        '</div>' +
        '<div>' +
          '<label class="label">Payment Method</label>' +
          '<select id="pm-method" class="select">' + App.optionsHtml('paymentMethod', 'Cash') + '</select>' +
        '</div>' +
        '<div style="grid-column:1/-1">' +
          '<label class="label">Payment Note (optional)</label>' +
          '<input id="pm-note" class="input" placeholder="e.g. counter payment, TID / receipt ref...">' +
        '</div>' +
      '</div>' +

      '<div class="actions" style="margin-top:18px">' +
        '<button class="btn btn-ghost" id="pm-cancel">Cancel</button>' +
        '<button class="btn btn-primary" id="pm-save">Mark as Paid</button>' +
      '</div>';

    var close = App.modal('Collect Payment & Concession', body, {
      onOpen: function (root, close) {
        var discInput = root.querySelector('#pm-disc');
        var amtInput = root.querySelector('#pm-amount');
        var saveBtn = root.querySelector('#pm-save');
        var sumDiscEl = root.querySelector('#pm-sum-disc');
        var sumNetEl = root.querySelector('#pm-sum-net');
        var modeBtnRs = root.querySelector('#pm-mode-rs');
        var modeBtnPct = root.querySelector('#pm-mode-pct');
        var modeUnit = root.querySelector('#pm-mode-unit');

        var mode = 'rs'; // 'rs' or 'pct'
        var userEditedAmount = false;

        function getEffectiveDiscount() {
          var raw = parseFloat(discInput.value) || 0;
          if (raw < 0) raw = 0;
          var discRs = 0;
          if (mode === 'pct') {
            discRs = r2(initialDue * (Math.min(100, raw) / 100));
          } else {
            discRs = r2(Math.min(initialDue, raw));
          }
          return discRs;
        }

        function syncUI() {
          var discRs = getEffectiveDiscount();
          var netDue = Math.max(0, r2(initialDue - discRs));
          sumDiscEl.textContent = '- ' + App.money(discRs);
          sumNetEl.textContent = App.money(netDue);

          if (!userEditedAmount) {
            amtInput.value = netDue > 0 ? netDue : 0;
          }

          var amtVal = parseFloat(amtInput.value) || 0;
          if (amtVal < 0) amtVal = 0;

          if (netDue <= 0.009) {
            if (amtVal <= 0.009) {
              saveBtn.textContent = 'Waive Due & Mark as Paid';
            } else {
              saveBtn.textContent = 'Mark as Paid';
            }
          } else if (amtVal >= netDue - 0.009) {
            saveBtn.textContent = 'Mark as Paid';
          } else if (amtVal > 0) {
            saveBtn.textContent = 'Collect ' + App.money(amtVal) + ' (Partial)';
          } else if (discRs > 0) {
            saveBtn.textContent = 'Apply ' + App.money(discRs) + ' Discount';
          } else {
            saveBtn.textContent = 'Collect Payment';
          }
        }

        function setMode(newMode) {
          if (mode === newMode) return;
          var curDiscRs = getEffectiveDiscount();
          mode = newMode;
          if (mode === 'rs') {
            modeBtnRs.style.background = 'var(--brand)';
            modeBtnRs.style.color = '#fff';
            modeBtnPct.style.background = 'transparent';
            modeBtnPct.style.color = 'var(--muted)';
            modeUnit.textContent = 'Rs';
            discInput.value = curDiscRs > 0 ? curDiscRs : '';
            discInput.max = String(initialDue);
          } else {
            modeBtnPct.style.background = 'var(--brand)';
            modeBtnPct.style.color = '#fff';
            modeBtnRs.style.background = 'transparent';
            modeBtnRs.style.color = 'var(--muted)';
            modeUnit.textContent = '%';
            var pctVal = initialDue > 0 ? r2((curDiscRs / initialDue) * 100) : 0;
            discInput.value = pctVal > 0 ? pctVal : '';
            discInput.max = '100';
          }
          syncUI();
        }

        modeBtnRs.addEventListener('click', function () { setMode('rs'); });
        modeBtnPct.addEventListener('click', function () { setMode('pct'); });

        discInput.addEventListener('input', function () {
          userEditedAmount = false;
          syncUI();
        });

        amtInput.addEventListener('input', function () {
          userEditedAmount = true;
          syncUI();
        });

        root.querySelectorAll('.pm-chip').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var pct = parseFloat(btn.getAttribute('data-pct')) || 0;
            if (mode === 'pct') {
              discInput.value = pct;
            } else {
              discInput.value = r2(initialDue * (pct / 100));
            }
            userEditedAmount = false;
            syncUI();
          });
        });

        root.querySelector('#pm-waive-btn').addEventListener('click', function () {
          if (mode === 'pct') {
            discInput.value = 100;
          } else {
            discInput.value = initialDue;
          }
          userEditedAmount = false;
          syncUI();
        });

        root.querySelector('#pm-disc-clear').addEventListener('click', function () {
          discInput.value = '';
          userEditedAmount = false;
          syncUI();
        });

        root.querySelector('#pm-cancel').addEventListener('click', close);

        saveBtn.addEventListener('click', function () {
          var discRs = getEffectiveDiscount();
          var rawAmt = parseFloat(amtInput.value);
          var amount = isNaN(rawAmt) ? 0 : Math.max(0, rawAmt);
          var method = root.querySelector('#pm-method').value;
          var note = root.querySelector('#pm-note').value.trim();
          var discNote = root.querySelector('#pm-disc-note').value.trim();

          var cur = DB.get('invoices', invoiceId);
          if (!cur || r2(cur.due) <= 0) { close(); refresh(); return; }

          if (discRs <= 0 && amount <= 0) {
            App.toast('Enter an amount received or discount', 'err');
            return;
          }

          if (recordPayment(invoiceId, amount, method, note, discRs, discNote)) {
            close();
            refresh();
          }
        });

        syncUI();

        if (focusDiscount) {
          setTimeout(function () {
            discInput.focus();
            discInput.select();
          }, 150);
        }
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
      '<div style="margin-top:7px">' + (bc ? bc(vn.caseCode, '100%', '15px').replace('margin:0 auto', 'margin:0') : '') + '<div style="' + line + '">' + App.esc(/^P\s*#/i.test(String(vn.caseText || '')) ? vn.caseText : ('P # ' + vn.caseText)) + '</div></div></div>' +
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
    var css =
      '<style>' +
      '@media print {' +
        '@page { size: A4 portrait; margin: 12mm; }' +
        'html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; }' +
        '.inv-page { display: flex !important; flex-direction: column !important; min-height: 228mm !important; width: 100% !important; max-width: 186mm !important; margin: 0 auto !important; box-sizing: border-box !important; }' +
        '.inv-body { flex: 1 0 auto !important; }' +
        '.inv-footer { margin-top: auto !important; flex: none !important; break-inside: avoid !important; page-break-inside: avoid !important; padding-top: 14px !important; }' +
        'table tr { break-inside: avoid !important; page-break-inside: avoid !important; }' +
      '}' +
      '@media screen {' +
        '.inv-page { display: flex; flex-direction: column; min-height: 228mm; width: 100%; max-width: 800px; margin: 0 auto; box-sizing: border-box; }' +
        '.inv-body { flex: 1 0 auto; }' +
        '.inv-footer { margin-top: auto; padding-top: 14px; }' +
      '}' +
      '</style>';

    var addrParts = [];
    if (s.address) addrParts.push(App.esc(s.address));
    if (s.phone) addrParts.push('Phone: ' + App.esc(s.phone));
    if (s.email) addrParts.push('Email: ' + App.esc(s.email));
    var addrLine = addrParts.length ? '<div style="border-top:1px solid #000;margin:4px 0 2px;padding-top:4px;text-align:center;font-size:11px;color:#222;line-height:1.5">' + addrParts.join(' &nbsp;•&nbsp; ') + '</div>' : '';

    var _fn = (s.footerNote && s.footerNote !== 'Get well soon. Reports available on counter & phone.') ? s.footerNote : '';
    var noteLine = _fn ? '<div style="font-size:11.5px;color:#555;text-align:center;margin:3px 0 2px">' + App.esc(_fn) + '</div>' : '';

    return css +
      '<div class="inv-page">' +
        '<div class="inv-body">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-top:2px solid #131845;border-bottom:2px solid #131845;padding:10px 0;margin-bottom:14px">' +
            '<div><div style="font-size:20px;font-weight:800;letter-spacing:0.5px">INVOICE</div>' +
              '<div style="font-size:13.5px;margin-top:4px"><strong>Invoice No:</strong> ' + App.esc(inv.no || inv.id) + '</div>' +
              '<div style="font-size:13.5px"><strong>Patient No:</strong> ' + (function () { var n = App.visitNos(inv).cas; return n < 10 ? '0' + n : String(n); })() + ' <span style="color:#666;font-size:12px">(today)</span>' + ((p && p.id) ? ' &nbsp;<span style="color:#666;font-size:12px">ID: ' + App.esc(p.id) + '</span>' : '') + '</div>' +
              '<div style="font-size:13px;color:#555;margin-top:3px">Date: ' + App.dt(inv.createdAt) + '</div>' +
              '<div style="font-size:13px">Status: <strong style="color:' + (inv.status === 'paid' ? '#16a34a' : '#dc2626') + '">' + inv.status.toUpperCase() + '</strong></div></div>' +
            codesHTML(inv, p) +
          '</div>' +
          '<div style="display:flex;gap:32px;margin-bottom:14px;font-size:13.5px">' +
            '<div><strong>Patient:</strong> ' + App.esc(p ? p.name : 'Walk-in') +
            (p ? ' &nbsp;(' + App.esc(String(p.age || '')) + ' / ' + App.esc(p.gender || '') + ')' : '') +
            '<br><strong>Phone:</strong> ' + App.esc((p && p.phone) || '—') +
            (p && p.address ? '<br><strong>Address:</strong> ' + App.esc(p.address) : '') + '</div>' +
            '<div><strong>Consultant:</strong> ' + App.esc(d ? d.name : 'Self') +
            (d ? '<br><span style="color:#555;font-size:12px">' + App.esc(d.clinic || '') + '</span>' : '') +
            (inv.panelId && DB.get('panels', inv.panelId) ? '<br><strong>Billed to:</strong> ' + App.esc(DB.get('panels', inv.panelId).name) + (p && p.panelRef ? '<br><span style="color:#555;font-size:12px">ID: ' + App.esc(p.panelRef) + '</span>' : '') : '') + '</div>' +
          '</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px">' +
            '<thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:7px 8px;border:1px solid #ddd">#</th>' +
            '<th style="text-align:left;padding:7px 8px;border:1px solid #ddd">Code</th>' +
            '<th style="text-align:left;padding:7px 8px;border:1px solid #ddd">Test Description</th>' +
            '<th style="text-align:right;padding:7px 8px;border:1px solid #ddd">Price</th></tr></thead>' +
            '<tbody>' + itemRows + '</tbody>' +
          '</table>' +
          '<div style="text-align:right;font-size:13.5px;margin-bottom:14px;line-height:1.6">' +
            '<div>Subtotal: ' + App.money(inv.subtotal) + '</div>' +
            (inv.discount ? '<div style="color:#b45309">Discount: -' + App.money(inv.discount) + '</div>' : '') +
            '<div style="font-size:16px;font-weight:800;border-top:1px solid #ccc;padding-top:4px;margin-top:2px">Total: ' + App.money(inv.total) + '</div>' +
            (inv.panelId ? '<div style="font-weight:700;color:#334155">Charged to the company account</div>' : '<div>Paid: ' + App.money(inv.paid) + '</div>' +
            '<div style="font-weight:800;color:#dc2626">Due: ' + App.money(inv.due) + '</div>') +
          '</div>' +
          opBox +
          (pays.length ?
            '<div style="font-weight:700;margin-bottom:6px;font-size:13px">Payments Received</div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:14px">' +
              '<thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:6px 8px;border:1px solid #ddd">#</th>' +
              '<th style="text-align:left;padding:6px 8px;border:1px solid #ddd">Date</th>' +
              '<th style="text-align:left;padding:6px 8px;border:1px solid #ddd">Method</th>' +
              '<th style="text-align:left;padding:6px 8px;border:1px solid #ddd">Note</th>' +
              '<th style="text-align:right;padding:6px 8px;border:1px solid #ddd">Amount</th></tr></thead>' +
              '<tbody>' + payRows + '</tbody>' +
            '</table>' : '') +
        '</div>' +
        '<div class="inv-footer">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:12.5px;margin-bottom:12px;padding:0 2px">' +
            '<div>Received by: __________________</div><div>Authorised signature: __________________</div>' +
          '</div>' +
          addrLine +
          noteLine +
          '<div style="font-size:10.5px;color:#777;text-align:center;margin-top:3px">Powered by System Optix</div>' +
        '</div>' +
      '</div>';
  }

  function printInvoice(id) {
    var inv = DB.get('invoices', id);
    if (!inv) return;
    App.print('Invoice ' + inv.no, invoicePrintHTML(inv), { noNote: true });
  }

  /* ---------- 80mm & 58mm POS thermal counter receipt ---------- */
  function thermalReceiptHTML(inv, opts) {
    var width = (opts && opts.width) || 80;
    var s = DB.get('settings', 'main') || {};
    var p = patientOf(inv);
    var d = doctorOf(inv);
    var visitNos = App.visitNos(inv);
    var tokenNo = visitNos.cas;

    var mmW = width === 58 ? 58 : 80;
    var printW = width === 58 ? '52mm' : '74mm';
    var fontSize = width === 58 ? '10px' : '11.5px';

    var items = inv.items || [];
    var itemRows = items.map(function (it, idx) {
      return '<tr>' +
        '<td style="padding:2px 0;text-align:left;word-break:break-word">' + (idx + 1) + '. ' + App.esc(it.name) + '</td>' +
        '<td style="padding:2px 0;text-align:right;white-space:nowrap;font-weight:700">' + App.money(it.price) + '</td>' +
      '</tr>';
    }).join('');

    var bcSvg = '';
    try {
      if (App.barcodeSvg && inv.no) {
        bcSvg = App.barcodeSvg(inv.no, { height: 8, quiet: 2, cssHeight: '26px' });
      }
    } catch (e) {}

    var qrImg = '';
    try {
      if (App.qrDataUrlFor) {
        var qrData = 'INV:' + inv.no + '|PAT:' + (p ? p.name : '') + '|TOTAL:' + inv.total;
        var qUrl = App.qrDataUrlFor(qrData);
        if (qUrl) qrImg = '<div style="text-align:center;margin:6px 0"><img src="' + qUrl + '" style="width:72px;height:72px;display:inline-block"></div>';
      }
    } catch (e) {}

    var css =
      '<style>' +
      '@page { size: ' + mmW + 'mm auto; margin: 0; }' +
      'body, html { margin: 0; padding: 0; background: #fff; font-family: "Courier New", Courier, monospace, -apple-system, sans-serif; font-size: ' + fontSize + '; color: #000; line-height: 1.35; }' +
      '.pos-slip { width: ' + printW + '; margin: 0 auto; padding: 2mm 1mm; box-sizing: border-box; }' +
      '.pos-hdr { text-align: center; margin-bottom: 6px; }' +
      '.pos-title { font-size: 15px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 2px; }' +
      '.pos-sub { font-size: 10.5px; margin-bottom: 2px; }' +
      '.pos-token { text-align: center; border: 2px dashed #000; padding: 4px; margin: 6px 0; font-size: 13.5px; font-weight: 900; letter-spacing: 0.5px; }' +
      '.pos-sep { border-top: 1px dashed #000; margin: 5px 0; }' +
      '.pos-table { width: 100%; border-collapse: collapse; font-size: inherit; }' +
      '.pos-tot-row { display: flex; justify-content: space-between; padding: 1.5px 0; }' +
      '.pos-net { font-size: 13.5px; font-weight: 900; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; margin: 3px 0; }' +
      '.pos-due { font-weight: 900; color: #000; }' +
      '.pos-ftr { text-align: center; font-size: 10px; margin-top: 7px; line-height: 1.3; }' +
      '</style>';

    return css +
      '<div class="pos-slip">' +
        '<div class="pos-hdr">' +
          '<div class="pos-title">' + App.esc(s.labName || 'OPTIX LAB & DIAGNOSTICS') + '</div>' +
          (s.tagline ? '<div class="pos-sub">' + App.esc(s.tagline) + '</div>' : '') +
          (s.address ? '<div class="pos-sub">' + App.esc(s.address) + '</div>' : '') +
          (s.phone ? '<div class="pos-sub">Tel: ' + App.esc(s.phone) + '</div>' : '') +
        '</div>' +
        '<div class="pos-token">TOKEN / VISIT #: ' + (tokenNo < 10 ? '0' + tokenNo : tokenNo) + '</div>' +
        '<div class="pos-sep"></div>' +
        '<div><b>Invoice:</b> ' + App.esc(inv.no) + '</div>' +
        '<div><b>Date:</b> ' + App.dt(inv.createdAt) + '</div>' +
        '<div><b>Patient:</b> ' + App.esc(p ? p.name : 'Walk-in') + (p && p.age ? ' (' + p.age + 'Y/' + (p.gender || '') + ')' : '') + '</div>' +
        (p && p.id ? '<div><b>MR No:</b> ' + App.esc(p.id) + '</div>' : '') +
        (p && p.phone ? '<div><b>Phone:</b> ' + App.esc(p.phone) + '</div>' : '') +
        (d ? '<div><b>Ref By:</b> ' + App.esc(d.name) + '</div>' : '') +
        '<div class="pos-sep"></div>' +
        '<table class="pos-table">' +
          '<thead><tr style="border-bottom:1px dashed #000">' +
            '<th style="text-align:left;padding-bottom:3px">Test Description</th>' +
            '<th style="text-align:right;padding-bottom:3px">Amount</th>' +
          '</tr></thead>' +
          '<tbody>' + itemRows + '</tbody>' +
        '</table>' +
        '<div class="pos-sep"></div>' +
        '<div class="pos-tot-row"><span>Subtotal:</span><span>' + App.money(inv.subtotal) + '</span></div>' +
        (inv.discount ? '<div class="pos-tot-row"><span>Discount:</span><span>-' + App.money(inv.discount) + '</span></div>' : '') +
        '<div class="pos-tot-row pos-net"><span>TOTAL AMOUNT:</span><span>' + App.money(inv.total) + '</span></div>' +
        '<div class="pos-tot-row"><span>Paid Amount:</span><span style="font-weight:700">' + App.money(inv.paid) + '</span></div>' +
        '<div class="pos-tot-row pos-due"><span>BALANCE DUE:</span><span>' + App.money(inv.due) + '</span></div>' +
        '<div class="pos-sep"></div>' +
        (bcSvg ? '<div style="text-align:center;margin:6px 0 2px">' + bcSvg + '<div style="font-size:9.5px;font-weight:700">' + App.esc(inv.no) + '</div></div>' : '') +
        qrImg +
        '<div class="pos-ftr">' +
          '<div><b>Expected Report Time:</b> Today by ' + (function () { var dt = new Date(); dt.setHours(dt.getHours() + 4); return App.t ? App.t(dt) : '6:00 PM'; })() + '</div>' +
          '<div style="margin-top:4px">* Please present this slip to collect reports *</div>' +
          '<div style="margin-top:2px">Billed by: ' + App.esc(inv.createdBy || 'Reception') + '</div>' +
          '<div style="margin-top:4px;font-size:9.5px;color:#555">Powered by System Optix</div>' +
        '</div>' +
      '</div>';
  }

  function printThermalSlip(invId, width) {
    var inv = DB.get('invoices', invId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    var w = width || 80;
    var html = thermalReceiptHTML(inv, { width: w });
    App.print('Counter Slip ' + inv.no, html, { noHeader: true });
  }
  App.printThermalSlip = printThermalSlip;
  App.thermalReceiptHTML = thermalReceiptHTML;

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
        ' <button class="btn btn-sm btn-ghost" data-slip="' + App.esc(inv.id) + '" title="Print 80mm POS Counter Slip">🧾 Slip</button>' +
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
          '<a class="btn btn-ghost" href="#/receipts" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:8px 12px;white-space:nowrap">' + App.icon('printer', 14) + ' POS Slips</a>' +
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
      view.querySelectorAll('[data-slip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          printThermalSlip(btn.getAttribute('data-slip'), 80);
        });
      });
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
        '<button class="btn btn-ghost" id="iv-thermal">🧾 Print POS Slip (80mm)</button>' +
        '<button class="btn btn-ghost" id="iv-stickers">🏷️ Tube Stickers (50×25mm)</button>' +
        '<button class="btn btn-ghost" id="iv-print">' + SC_ICONS.printer + ' Print Invoice</button>' +
        '<button class="btn btn-ghost" id="iv-edit">Edit</button>' +
        '<button class="btn btn-ghost" id="iv-wa">WhatsApp</button>' +
        (r2(inv.due) > 0 ? '<button class="btn btn-ghost" id="iv-discount" style="color:#b45309;background:#fffbeb;border:1.5px solid #fde68a;font-weight:700">🏷️ Discount</button><button class="btn btn-primary" id="iv-collect">Collect Payment</button>' : '') +
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
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0"><span>Discount</span><span>' + App.money(inv.discount || 0) + (r2(inv.due) > 0 ? ' <button class="btn btn-xs btn-ghost" id="iv-quick-disc" style="padding:1px 8px;font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;cursor:pointer;margin-left:6px;font-weight:600">+ Concession</button>' : '') + '</span></div>' +
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
    var thmBtn = document.getElementById('iv-thermal');
    if (thmBtn) thmBtn.addEventListener('click', function () { printThermalSlip(inv.id, 80); });
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
    var dBtn = document.getElementById('iv-discount');
    if (dBtn) dBtn.addEventListener('click', function () { openPaymentModal(inv.id, true); });
    var qdBtn = document.getElementById('iv-quick-disc');
    if (qdBtn) qdBtn.addEventListener('click', function () { openPaymentModal(inv.id, true); });
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

  /* ==========================================================================
     DEDICATED DASHBOARD: POS THERMAL SLIP & COUNTER CENTER (#/receipts)
     Fast 80mm & 58mm Thermal Receipt Printing, Counter Tokens & Reception POS
     ========================================================================== */
  var RCP = {
    q: '',
    date: 'today',
    pickDate: App.today(),
    status: 'all',
    selectedId: null,
    width: 80,
    page: 0
  };

  function renderReceiptsDashboard() {
    setRefresh(renderReceiptsDashboard);
    var view = document.getElementById('view');
    if (!view) return;

    var s = DB.get('settings', 'main') || {};
    var all = DB.all('invoices').slice();
    all.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    function getFilteredList() {
      var q = RCP.q.trim().toLowerCase();
      var t = App.today();
      return all.filter(function (inv) {
        if (RCP.date !== 'all') {
          var k = dayKey(inv.createdAt);
          if (RCP.date === 'today' && k !== t) return false;
          if (RCP.date === 'yesterday' && k !== addDays(t, -1)) return false;
          if (RCP.date === 'last7' && (k < addDays(t, -6) || k > t)) return false;
          if (RCP.date === 'pick' && k !== (RCP.pickDate || t)) return false;
        }
        if (RCP.status === 'paid' && inv.status !== 'paid') return false;
        if (RCP.status === 'due' && inv.due <= 0) return false;
        if (q) {
          var p = patientOf(inv);
          var hay = (inv.no + ' ' + (p ? p.name + ' ' + (p.phone || '') + ' ' + (p.id || '') : '')).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
    }

    function computeStats() {
      var t = App.today();
      var todayInvs = all.filter(function (i) { return dayKey(i.createdAt) === t; });
      var todayCash = todayInvs.reduce(function (sum, i) { return sum + (+i.paid || 0); }, 0);
      var todayDues = todayInvs.filter(function (i) { return i.due > 0; }).length;
      return {
        count: todayInvs.length,
        cash: todayCash,
        dues: todayDues,
        width: RCP.width
      };
    }

    function renderUI() {
      var st = computeStats();
      var list = getFilteredList();

      if (!RCP.selectedId && list.length) RCP.selectedId = list[0].id;
      if (RCP.selectedId && !list.some(function (x) { return x.id === RCP.selectedId; })) {
        RCP.selectedId = list.length ? list[0].id : null;
      }
      var curInv = RCP.selectedId ? DB.get('invoices', RCP.selectedId) : null;

      var kpiHtml =
        '<div class="kpi-grid" style="margin-bottom:16px">' +
          '<div class="kpi t-navy"><div class="kpi-ic">' + SC_ICONS.doc + '</div><div class="kpi-lb">TODAY\'S BILLED SLIPS</div><div class="kpi-nm">' + st.count + '</div><div class="kpi-sb">counter invoices today</div></div>' +
          '<div class="kpi t-green"><div class="kpi-ic">' + SC_ICONS.cash + '</div><div class="kpi-lb">CASH COLLECTED TODAY</div><div class="kpi-nm">' + App.money(st.cash) + '</div><div class="kpi-sb">received at counter</div></div>' +
          '<div class="kpi t-amber"><div class="kpi-ic">' + SC_ICONS.clock + '</div><div class="kpi-lb">INVOICES WITH DUES</div><div class="kpi-nm">' + st.dues + '</div><div class="kpi-sb">partial / pending payment</div></div>' +
          '<div class="kpi t-blue"><div class="kpi-ic">' + SC_ICONS.printer + '</div><div class="kpi-lb">THERMAL PAPER FORMAT</div><div class="kpi-nm">' + RCP.width + 'mm</div><div class="kpi-sb">' + (RCP.width === 80 ? 'Standard POS Roll' : 'Mini 58mm Roll') + '</div></div>' +
        '</div>';

      var PAGE_SIZE = 30;
      var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (RCP.page >= totalPages) RCP.page = totalPages - 1;
      var from = RCP.page * PAGE_SIZE;
      var slice = list.slice(from, from + PAGE_SIZE);

      var tableRows = '';
      if (!slice.length) {
        tableRows = '<tr><td colspan="7">' + App.empty('No invoices found matching current filter.') + '</td></tr>';
      } else {
        tableRows = slice.map(function (inv) {
          var p = patientOf(inv);
          var isCur = curInv && curInv.id === inv.id;
          var vNos = App.visitNos(inv);
          return '<tr class="' + (isCur ? 'is-sel' : '') + '" style="cursor:pointer" data-rcp-row="' + App.esc(inv.id) + '">' +
            '<td><span class="badge" style="font-weight:900;background:#f1f5f9;color:var(--brand-d)">#' + (vNos.cas < 10 ? '0' + vNos.cas : vNos.cas) + '</span></td>' +
            '<td><b style="color:var(--brand-d)">' + App.esc(inv.no) + '</b><div style="font-size:11.5px;color:var(--muted)">' + App.d(inv.createdAt) + '</div></td>' +
            '<td><div style="font-weight:700">' + App.esc(p ? p.name : 'Walk-in') + '</div><div style="font-size:11.5px;color:var(--muted)">' + (p && p.phone ? App.esc(p.phone) : '') + (p && p.id ? ' &middot; MR: ' + App.esc(p.id) : '') + '</div></td>' +
            '<td style="text-align:center">' + (inv.items ? inv.items.length : 0) + '</td>' +
            '<td style="text-align:right"><div><b>' + App.money(inv.total) + '</b></div><div style="font-size:11.5px;color:var(--green)">Paid ' + App.money(inv.paid) + '</div></td>' +
            '<td>' + (inv.due > 0 ? '<span style="color:var(--red);font-weight:800">' + App.money(inv.due) + '</span>' : '<span style="color:var(--green);font-weight:700">Paid</span>') + '</td>' +
            '<td class="actions" style="text-align:right;white-space:nowrap">' +
              '<button class="btn btn-sm btn-primary rcp-btn-print" data-id="' + App.esc(inv.id) + '" title="Print 80mm Counter Slip" onclick="event.stopPropagation()">' + SC_ICONS.printer + ' 80mm</button> ' +
              '<button class="btn btn-sm btn-ghost rcp-btn-print58" data-id="' + App.esc(inv.id) + '" title="Print 58mm Counter Slip" onclick="event.stopPropagation()">58mm</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      }

      var slipPreview = '';
      if (curInv) {
        slipPreview =
          '<div style="background:#fff;border:1px dashed #475569;border-radius:8px;padding:14px;box-shadow:0 4px 16px rgba(0,0,0,.08);max-height:58vh;overflow:auto">' +
            thermalReceiptHTML(curInv, { width: RCP.width }) +
          '</div>' +
          '<div style="margin-top:14px">' +
            '<button class="btn btn-primary" id="rcpPrintCur" style="width:100%;justify-content:center;font-weight:800;padding:11px">' +
              SC_ICONS.printer + ' Print Counter Slip (' + RCP.width + 'mm)' +
            '</button>' +
          '</div>';
      } else {
        slipPreview = '<div style="padding:40px 10px;text-align:center;color:var(--muted)">Select an invoice from the list to preview the thermal slip.</div>';
      }

      view.innerHTML =
        '<style>' +
        '.rcp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;flex-wrap:wrap}' +
        '.rcp-head h2{margin:0 0 4px;font-size:20px;font-weight:800;color:var(--brand-d);display:flex;align-items:center;gap:8px}' +
        '.rcp-head h2 svg{width:22px;height:22px;max-width:22px;max-height:22px;flex-shrink:0}' +
        '.rcp-head p{margin:0;font-size:13px;color:var(--muted)}' +
        '.rcp-layout{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:18px;align-items:start}' +
        '@media(max-width:980px){.rcp-layout{grid-template-columns:1fr}}' +
        '.rcp-prev-box{position:sticky;top:16px;background:#f8fafc;border:1px solid var(--bd);border-radius:14px;padding:16px;box-shadow:var(--sh-sm)}' +
        '.rcp-prev-box h3 svg{width:18px;height:18px;max-width:18px;max-height:18px;flex-shrink:0}' +
        '.rcp-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}' +
        '.rcp-toolbar .input.search{flex:1 1 200px;min-width:160px;width:auto;padding:7px 12px;font-size:13px;height:36px;border-radius:8px}' +
        '.rcp-toolbar .select{width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px}' +
        '.rcp-toolbar input[type="date"]{width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px}' +
        '</style>' +
        '<div class="rcp-head">' +
        '<div>' +
          '<h2 style="display:flex;align-items:center;gap:8px">' + SC_ICONS.printer + ' POS Thermal Slip &amp; Counter Center</h2>' +
          '<p style="color:var(--muted);font-size:13px;margin:2px 0 0">Dedicated 80mm &amp; 58mm Thermal Counter Slips, Patient Tokens, and Direct Thermal Printing for Reception Desks</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<button class="btn btn-primary" id="rcpPrintAllToday">' + SC_ICONS.printer + ' Print All Today\'s Slips</button>' +
          '<a class="btn btn-ghost" href="#/invoices">All Invoices</a>' +
        '</div>' +
        '</div>' +
        kpiHtml +
        '<div class="rcp-layout">' +
          '<div class="card"><div class="card-b">' +
            '<div class="rcp-toolbar">' +
              '<input class="input search" id="rcpSearch" placeholder="Search invoice no, patient, phone, MR#..." value="' + App.esc(RCP.q) + '" style="flex:1 1 200px;min-width:160px;width:auto;padding:7px 12px;font-size:13px;height:36px;border-radius:8px">' +
              '<select class="select" id="rcpDate" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px">' +
                [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['all', 'All dates'], ['pick', 'Pick date...']].map(function (o) {
                  return '<option value="' + o[0] + '"' + (RCP.date === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
                }).join('') +
              '</select>' +
              '<input type="date" class="input" id="rcpPickDate" value="' + App.esc(RCP.pickDate) + '" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px" ' + (RCP.date === 'pick' ? '' : 'hidden') + '>' +
              '<select class="select" id="rcpStatus" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px">' +
                '<option value="all">All Payments</option>' +
                '<option value="paid"' + (RCP.status === 'paid' ? ' selected' : '') + '>Fully Paid</option>' +
                '<option value="due"' + (RCP.status === 'due' ? ' selected' : '') + '>Has Due Balance</option>' +
              '</select>' +
              '<select class="select" id="rcpWidthFilter" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px">' +
                '<option value="80"' + (RCP.width === 80 ? ' selected' : '') + '>80mm POS Width</option>' +
                '<option value="58"' + (RCP.width === 58 ? ' selected' : '') + '>58mm Mini Width</option>' +
              '</select>' +
            '</div>' +
            '<div class="tbl-wrap"><table class="table smp-table"><thead><tr>' +
              '<th>Token</th><th>Invoice</th><th>Patient &amp; Phone</th><th style="text-align:center">Tests</th><th style="text-align:right">Total</th><th>Due</th><th style="text-align:right">Print Slip</th>' +
            '</tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
            '<div class="smp-pager">' +
              (list.length > PAGE_SIZE
                ? '<span class="muted">' + (from + 1) + '–' + Math.min(from + PAGE_SIZE, list.length) + ' of ' + list.length + ' invoices</span>' +
                  '<button class="btn btn-sm" id="rcpPrev"' + (RCP.page === 0 ? ' disabled' : '') + '>&larr; Prev</button>' +
                  '<button class="btn btn-sm" id="rcpNext"' + (RCP.page >= totalPages - 1 ? ' disabled' : '') + '>Next &rarr;</button>'
                : (list.length ? '<span class="muted">' + list.length + ' counter slip' + (list.length === 1 ? '' : 's') + '</span>' : '')) +
            '</div>' +
          '</div></div>' +
          '<div class="rcp-prev-box">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
              '<h3 style="margin:0;font-size:15px;font-weight:800;display:flex;align-items:center;gap:6px">' + SC_ICONS.printer + ' Live Slip Preview</h3>' +
              '<div style="display:flex;gap:4px">' +
                '<button class="btn btn-sm ' + (RCP.width === 80 ? 'btn-primary' : 'btn-ghost') + '" id="rcpSw80">80mm</button>' +
                '<button class="btn btn-sm ' + (RCP.width === 58 ? 'btn-primary' : 'btn-ghost') + '" id="rcpSw58">58mm</button>' +
              '</div>' +
            '</div>' +
            slipPreview +
            '<div style="margin-top:14px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:11.5px;color:var(--muted);line-height:1.45">' +
              '<label class="check" style="font-weight:700;color:var(--ink);margin-bottom:6px">' +
                '<input type="checkbox" id="rcpAutoPrint"' + (s.autoPrintThermalSlip ? ' checked' : '') + '> Auto-print slip when new bill is created' +
              '</label>' +
              '<b>Receipt Printers:</b> Compatible with all Epson, Xprinter, Sunmi, Rongta, Bixolon, Black Copper 80mm &amp; 58mm thermal printers.<br>' +
              'Set printer margin to <b>None</b> for seamless continuous feed.' +
            '</div>' +
          '</div>' +
        '</div>';

      // Attach handlers
      document.getElementById('rcpSearch').addEventListener('input', function () { RCP.q = this.value; RCP.page = 0; renderUI(); });
      document.getElementById('rcpDate').addEventListener('change', function () {
        RCP.date = this.value; RCP.page = 0;
        document.getElementById('rcpPickDate').hidden = RCP.date !== 'pick';
        renderUI();
      });
      var pdEl = document.getElementById('rcpPickDate');
      if (pdEl) pdEl.addEventListener('change', function () { RCP.pickDate = this.value; RCP.page = 0; renderUI(); });
      document.getElementById('rcpStatus').addEventListener('change', function () { RCP.status = this.value; RCP.page = 0; renderUI(); });
      document.getElementById('rcpWidthFilter').addEventListener('change', function () {
        RCP.width = parseInt(this.value, 10); renderUI();
      });

      document.getElementById('rcpSw80').addEventListener('click', function () { RCP.width = 80; renderUI(); });
      document.getElementById('rcpSw58').addEventListener('click', function () { RCP.width = 58; renderUI(); });

      var autoEl = document.getElementById('rcpAutoPrint');
      if (autoEl) {
        autoEl.addEventListener('change', function () {
          DB.update('settings', 'main', { autoPrintThermalSlip: this.checked });
          App.toast('Auto-print preference updated.', 'ok');
        });
      }

      var bPrCur = document.getElementById('rcpPrintCur');
      if (bPrCur && curInv) {
        bPrCur.addEventListener('click', function () { printThermalSlip(curInv.id, RCP.width); });
      }

      view.querySelectorAll('[data-rcp-row]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          RCP.selectedId = this.getAttribute('data-rcp-row');
          renderUI();
        });
      });

      view.querySelectorAll('.rcp-btn-print').forEach(function (btn) {
        btn.addEventListener('click', function () {
          printThermalSlip(btn.getAttribute('data-id'), 80);
        });
      });

      view.querySelectorAll('.rcp-btn-print58').forEach(function (btn) {
        btn.addEventListener('click', function () {
          printThermalSlip(btn.getAttribute('data-id'), 58);
        });
      });

      var pPrev = document.getElementById('rcpPrev');
      if (pPrev) pPrev.addEventListener('click', function () { RCP.page = Math.max(0, RCP.page - 1); renderUI(); });
      var pNext = document.getElementById('rcpNext');
      if (pNext) pNext.addEventListener('click', function () { RCP.page++; renderUI(); });

      document.getElementById('rcpPrintAllToday').addEventListener('click', function () {
        var t = App.today();
        var todayList = all.filter(function (i) { return dayKey(i.createdAt) === t; });
        if (!todayList.length) { App.toast('No counter slips billed today', 'info'); return; }
        App.confirm('Print all ' + todayList.length + ' today\'s counter slips sequentially?').then(function (ok) {
          if (!ok) return;
          var combined = todayList.map(function (inv) {
            return '<div style="page-break-after:always;break-after:page">' + thermalReceiptHTML(inv, { width: RCP.width }) + '</div>';
          }).join('');
          App.print('All Today Slips (' + todayList.length + ')', combined, { noHeader: true });
        });
      });
    }

    renderUI();
  }

  /* ---------- register ---------- */
  /* the barcode drawing lives in the results module; load it ahead so printing never has to wait */
  if (!App.barcodeHtml && App.loadScript) App.loadScript('assets/js/mod-results.js').catch(function () {});
  App.route('#/invoices', renderInvoices);
  App.route('#/invoice/:id', renderInvoiceDetail);
  App.route('#/dues', renderDues);
  App.route('#/discounts', renderDiscounts);
  App.route('#/receipts', renderReceiptsDashboard);
})();
