/* ============================================================
   LabPOS — New Bill POS  (route: #/billing)
   Three-column point-of-sale: patient | test picker + cart | bill summary
   ============================================================ */
(function () {
  'use strict';

  function currentUser() {
    try {
      if (window.App && App.session) {
        var as = (typeof App.session === 'function') ? App.session() : App.session;
        if (as && as.name) return as.name;
      }
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (s && s.name) return s.name;
    } catch (e) {}
    return 'system';
  }

  function num(v, d) {
    var n = parseFloat(v);
    if (isNaN(n)) return d || 0;
    return n;
  }

  App.route('#/billing', function () {
    var view = document.getElementById('view');
    var state = {
      patient: null,
      cart: [],            // [{testId, code, name, price}]
      doctorId: '',
      discType: 'rs',      // 'rs' | 'pct'
      discVal: 0,
      method: 'Cash',
      tendered: 0,
      tenderDirty: false,
      cat: 'All',
      q: ''
    };

    var tests = DB.all('tests').filter(function (t) { return t.active !== false; });
    var doctors = DB.all('doctors');
    var cats = ['All'];
    tests.forEach(function (t) { if (t.category && cats.indexOf(t.category) < 0) cats.push(t.category); });

    /* pre-selected test (e.g. "Book" from the test list sends users here) */
    try {
      var preId = sessionStorage.getItem('labpos_pretest');
      if (preId) {
        sessionStorage.removeItem('labpos_pretest');
        var preT = null;
        for (var pi = 0; pi < tests.length; pi++) { if (tests[pi].id === preId) { preT = tests[pi]; break; } }
        if (!preT) preT = DB.get('tests', preId);
        if (preT && preT.active !== false && !state.cart.some(function (l) { return l.testId === preT.id; })) {
          state.cart.push({ testId: preT.id, code: preT.code, name: preT.name, price: preT.price, isPackage: !!preT.isPackage, includes: preT.isPackage ? (preT.includes || []) : null });
        }
      }
    } catch (e) {}

    /* ---------- totals ---------- */
    function totals() {
      var sub = state.cart.reduce(function (a, l) { return a + num(l.price); }, 0);
      var d = num(state.discVal);
      var discAmt = 0;
      if (state.discType === 'pct') { d = Math.min(Math.max(d, 0), 100); discAmt = sub * d / 100; }
      else { d = Math.min(Math.max(d, 0), sub); discAmt = d; }
      var total = Math.max(sub - discAmt, 0);
      var tendered = num(state.tendered);
      var paid = Math.min(tendered, total);
      var due = total - paid;
      var change = Math.max(tendered - total, 0);
      return { sub: sub, discAmt: discAmt, total: total, tendered: tendered, paid: paid, due: due, change: change };
    }

    function paintTotals() {
      var t = totals();
      var $ = function (id) { return document.getElementById(id); };
      if ($('blSub')) $('blSub').textContent = App.money(t.sub);
      if ($('blDisc')) $('blDisc').textContent = '− ' + App.money(t.discAmt);
      if ($('blTotal')) $('blTotal').textContent = App.money(t.total);
      if ($('blCount')) $('blCount').textContent = state.cart.length + (state.cart.length === 1 ? ' test' : ' tests');
      if (!state.tenderDirty && $('blTendered')) $('blTendered').value = t.total > 0 ? t.total : '';
      var cr = $('blChangeRow');
      if (cr) {
        if (t.change > 0) {
          cr.innerHTML = '<span>Change to return</span><strong class="bl-change">' + App.money(t.change) + '</strong>';
        } else if (t.due > 0 && state.cart.length) {
          cr.innerHTML = '<span>Balance due</span><strong class="bl-due">' + App.money(t.due) + '</strong>';
        } else {
          cr.innerHTML = '';
        }
      }
      var sb = $('blSave');
      if (sb) sb.disabled = !(state.patient && state.cart.length);
    }

    /* ---------- patient panel ---------- */
    function paintPatient() {
      var box = document.getElementById('blPatientBox');
      if (!box) return;
      if (state.patient) {
        var p = state.patient;
        box.innerHTML =
          '<div class="bl-pat-card">' +
            '<div class="bl-pat-ava">' + App.esc((p.name || '?').charAt(0).toUpperCase()) + '</div>' +
            '<div class="bl-pat-info">' +
              '<strong>' + App.esc(p.name) + '</strong>' +
              '<span>' + App.esc([p.age ? p.age + ' yrs' : '', p.gender || ''].filter(Boolean).join(' • ') || '—') + '</span>' +
              '<span>' + App.esc(p.phone || 'No phone') + '</span>' +
            '</div>' +
            '<button class="btn btn-ghost btn-sm" id="blPatChange">Change</button>' +
          '</div>';
        document.getElementById('blPatChange').addEventListener('click', function () {
          state.patient = null;
          document.getElementById('blPatSearchWrap').style.display = '';
          paintPatient();
          paintTotals();
        });
      } else {
        box.innerHTML = '<div class="empty">No patient selected.<br>Search above or add a new patient.</div>';
      }
    }

    function paintPatientResults(q) {
      var box = document.getElementById('blPatResults');
      if (!box) return;
      q = (q || '').trim().toLowerCase();
      if (!q) { box.innerHTML = ''; return; }
      var hits = DB.all('patients').filter(function (p) {
        return (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.phone || '').toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      if (!hits.length) { box.innerHTML = '<div class="bl-nores">No matches. Use “+ New Patient”.</div>'; return; }
      box.innerHTML = hits.map(function (p) {
        return '<button class="bl-pick" data-id="' + App.esc(p.id) + '">' +
          '<strong>' + App.esc(p.name) + '</strong>' +
          '<span>' + App.esc(p.phone || '—') + ' • ' + App.esc(p.id) + '</span>' +
        '</button>';
      }).join('');
      box.querySelectorAll('.bl-pick').forEach(function (b) {
        b.addEventListener('click', function () {
          state.patient = DB.get('patients', b.getAttribute('data-id'));
          document.getElementById('blPatSearchWrap').style.display = 'none';
          document.getElementById('blPatSearch').value = '';
          box.innerHTML = '';
          paintPatient();
          paintTotals();
        });
      });
    }

    function openNewPatient() {
      var body =
        '<div class="form-grid">' +
          '<div><label class="label">Full name *</label><input class="input" id="npName" placeholder="e.g. Ali Raza"></div>' +
          '<div class="form-2">' +
            '<div><label class="label">Age</label><input class="input" id="npAge" type="number" min="0" max="130" placeholder="35"></div>' +
            '<div><label class="label">Gender</label><select class="select" id="npGender"><option>Male</option><option>Female</option><option>Other</option></select></div>' +
          '</div>' +
          '<div><label class="label">Phone</label><input class="input" id="npPhone" placeholder="0300-1234567"></div>' +
          '<div><label class="label">Address</label><input class="input" id="npAddress" placeholder="House, street, city"></div>' +
        '</div>' +
        '<div class="bl-modal-foot"><button class="btn btn-ghost" id="npCancel">Cancel</button>' +
        '<button class="btn btn-primary" id="npSave">Save Patient</button></div>';
      var close = App.modal('New Patient', body, {
        onOpen: function () {
          document.getElementById('npCancel').addEventListener('click', close);
          document.getElementById('npName').focus();
          document.getElementById('npSave').addEventListener('click', function () {
            var name = document.getElementById('npName').value.trim();
            if (!name) { App.toast('Patient name is required', 'err'); return; }
            var p = DB.insert('patients', {
              name: name,
              age: num(document.getElementById('npAge').value) || '',
              gender: document.getElementById('npGender').value,
              phone: document.getElementById('npPhone').value.trim(),
              address: document.getElementById('npAddress').value.trim(),
              createdAt: new Date().toISOString()
            });
            state.patient = p;
            document.getElementById('blPatSearchWrap').style.display = 'none';
            var s = document.getElementById('blPatSearch'); if (s) s.value = '';
            var r = document.getElementById('blPatResults'); if (r) r.innerHTML = '';
            paintPatient();
            paintTotals();
            close();
            App.toast('Patient ' + p.id + ' registered');
          });
        }
      });
    }

    /* ---------- test picker + cart ---------- */
    function paintTests() {
      var box = document.getElementById('blTestList');
      if (!box) return;
      var q = state.q.trim().toLowerCase();
      var list = tests.filter(function (t) {
        if (state.cat !== 'All' && t.category !== state.cat) return false;
        if (!q) return true;
        return (t.name || '').toLowerCase().indexOf(q) >= 0 || (t.code || '').toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) { box.innerHTML = App.empty('No tests match your search.'); return; }
      box.innerHTML = list.map(function (t) {
        var inCart = state.cart.some(function (l) { return l.testId === t.id; });
        return '<div class="bl-test' + (inCart ? ' in-cart' : '') + '">' +
          '<div class="bl-test-info"><strong>' + App.esc(t.name) + '</strong>' +
          (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') +
          '<span>' + App.esc(t.code || '') + ' • ' + App.esc(t.category || '') +
          (t.isPackage && t.includes ? ' • ' + t.includes.length + ' tests' : '') + '</span></div>' +
          '<div class="bl-test-right"><strong>' + App.money(t.price) + '</strong>' +
          (inCart
            ? '<span class="badge b-ready">Added</span>'
            : '<button class="btn btn-primary btn-sm" data-add="' + App.esc(t.id) + '">Add</button>') +
          '</div></div>';
      }).join('');
      box.querySelectorAll('[data-add]').forEach(function (b) {
        b.addEventListener('click', function () {
          var t = DB.get('tests', b.getAttribute('data-add'));
          if (!t) return;
          if (state.cart.some(function (l) { return l.testId === t.id; })) { App.toast('Test already in bill', 'err'); return; }
          state.cart.push({ testId: t.id, code: t.code, name: t.name, price: t.price, isPackage: !!t.isPackage, includes: t.isPackage ? (t.includes || []) : null });
          paintTests();
          paintCart();
          paintTotals();
        });
      });
    }

    function paintCart() {
      var box = document.getElementById('blCart');
      if (!box) return;
      if (!state.cart.length) { box.innerHTML = App.empty('Cart is empty.<br>Add tests from the list.'); return; }
      box.innerHTML = state.cart.map(function (l, i) {
        return '<div class="bl-cart-line">' +
          '<div class="bl-cart-info"><strong>' + App.esc(l.name) + '</strong>' +
          (l.isPackage ? ' <span class="badge b-ready">Package</span>' : '') +
          '<span>' + App.esc(l.code || '') + '</span></div>' +
          '<strong>' + App.money(l.price) + '</strong>' +
          '<button class="bl-rm" data-rm="' + i + '" title="Remove">×</button>' +
        '</div>';
      }).join('');
      box.querySelectorAll('[data-rm]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.cart.splice(parseInt(b.getAttribute('data-rm'), 10), 1);
          paintTests();
          paintCart();
          paintTotals();
        });
      });
    }

    /* ---------- save ---------- */
    function saveBill() {
      if (!state.patient) { App.toast('Select a patient first', 'err'); return; }
      if (!state.cart.length) { App.toast('Add at least one test', 'err'); return; }
      var t = totals();
      if (t.tendered < 0) { App.toast('Tendered amount cannot be negative', 'err'); return; }
      var status = t.due <= 0 ? 'paid' : (t.paid > 0 ? 'partial' : 'unpaid');
      var inv = DB.insert('invoices', {
        patientId: state.patient.id,
        doctorId: state.doctorId || null,
        items: state.cart.map(function (l) { return { testId: l.testId, code: l.code, name: l.name, price: l.price, isPackage: !!l.isPackage, includes: l.includes || null }; }),
        subtotal: t.sub,
        discount: t.discAmt,
        total: t.total,
        paid: t.paid,
        due: t.due,
        status: status,
        createdAt: new Date().toISOString(),
        createdBy: currentUser()
      });
      DB.update('invoices', inv.id, { no: inv.id });
      if (t.paid > 0) {
        DB.insert('payments', {
          invoiceId: inv.id,
          amount: t.paid,
          method: state.method,
          date: App.today(),
          note: 'Bill payment',
          createdBy: currentUser()
        });
      }
      state.cart.forEach(function (l) {
        /* packages expand into their included tests for result entry */
        var tids = (l.isPackage && l.includes && l.includes.length) ? l.includes : [l.testId];
        tids.forEach(function (tid) {
          DB.insert('results', {
            invoiceId: inv.id,
            testId: tid,
            values: {},
            status: 'pending',
            reportedAt: null,
            reportedBy: null
          });
        });
      });
      App.toast('Invoice ' + inv.id + ' saved' + (t.due > 0 ? ' • Due ' + App.money(t.due) : ''));
      App.nav('#/invoice/' + inv.id);
    }

    /* ---------- layout ---------- */
    view.innerHTML =
    '<style>' +
    '.bl-pos{display:grid;grid-template-columns:290px minmax(0,1fr) 340px;gap:18px;align-items:start}' +
    '.bl-panel{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 3px rgba(15,30,46,.06)}' +
    '.bl-panel-h{padding:14px 16px;border-bottom:1px solid var(--line);font-weight:800;font-size:14.5px;display:flex;align-items:center;justify-content:space-between}' +
    '.bl-panel-b{padding:14px 16px}' +
    '.bl-pat-card{display:flex;gap:12px;align-items:center;background:var(--brand-soft);border:1px solid #cdeee9;border-radius:12px;padding:12px}' +
    '.bl-pat-ava{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;display:grid;place-items:center;font-weight:800;font-size:19px;flex:none}' +
    '.bl-pat-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
    '.bl-pat-info strong{font-size:14.5px}' +
    '.bl-pat-info span{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bl-pick{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;background:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin-top:8px;cursor:pointer}' +
    '.bl-pick:hover{border-color:var(--brand);background:var(--brand-soft)}' +
    '.bl-pick strong{font-size:13.5px}' +
    '.bl-pick span{font-size:12px;color:var(--muted)}' +
    '.bl-nores{font-size:12.5px;color:var(--muted);padding:10px 2px}' +
    '.bl-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}' +
    '.bl-chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 13px;font-size:12.5px;font-weight:700;color:var(--muted);cursor:pointer}' +
    '.bl-chip.on{background:var(--brand);border-color:var(--brand);color:#fff}' +
    '.bl-test{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:8px;background:#fff}' +
    '.bl-test:hover{border-color:var(--brand)}' +
    '.bl-test.in-cart{background:#f8fafc}' +
    '.bl-test-info{display:flex;flex-direction:column;gap:1px;min-width:0}' +
    '.bl-test-info strong{font-size:13.5px}' +
    '.bl-test-info span{font-size:12px;color:var(--muted)}' +
    '.bl-test-right{display:flex;align-items:center;gap:10px;flex:none}' +
    '.bl-cart-line{display:flex;align-items:center;gap:10px;border-bottom:1px dashed var(--line);padding:10px 2px}' +
    '.bl-cart-line:last-child{border-bottom:none}' +
    '.bl-cart-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
    '.bl-cart-info strong{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bl-cart-info span{font-size:12px;color:var(--muted)}' +
    '.bl-rm{width:26px;height:26px;border-radius:50%;border:1px solid var(--line);background:#fff;color:var(--red);font-size:16px;line-height:1;cursor:pointer;flex:none}' +
    '.bl-rm:hover{background:var(--red-soft);border-color:var(--red)}' +
    '.bl-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13.5px;color:var(--muted)}' +
    '.bl-total{display:flex;justify-content:space-between;align-items:center;padding:12px 0 4px;margin-top:6px;border-top:2px solid var(--line);font-weight:800;font-size:16px}' +
    '.bl-total strong{color:var(--brand-d);font-size:22px}' +
    '.bl-change{color:var(--green)}' +
    '.bl-due{color:var(--amber)}' +
    '.bl-seg{display:flex;gap:6px}' +
    '.bl-seg button{flex:1;border:1px solid var(--line);background:#fff;border-radius:10px;padding:9px 4px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer}' +
    '.bl-seg button.on{background:var(--ink);border-color:var(--ink);color:#fff}' +
    '.bl-disc-wrap{display:flex;gap:8px}' +
    '.bl-disc-wrap .input{flex:1}' +
    '.bl-modal-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}' +
    '.bl-save{width:100%;padding:14px;font-size:15.5px;margin-top:12px}' +
    '.bl-save:disabled{opacity:.45;cursor:not-allowed}' +
    '@media(max-width:1180px){.bl-pos{grid-template-columns:1fr 1fr}.bl-pos .bl-col-summary{grid-column:1/-1}}' +
    '@media(max-width:760px){.bl-pos{grid-template-columns:1fr}}' +
    '</style>' +

    '<div class="toolbar"><div><h2 style="margin:0">New Bill</h2>' +
    '<p style="margin:2px 0 0;color:var(--muted);font-size:13px">Create a lab invoice — patient, tests, payment.</p></div></div>' +

    '<div class="bl-pos">' +
      /* patient column */
      '<div class="bl-panel"><div class="bl-panel-h">Patient' +
        '<button class="btn btn-primary btn-sm" id="blNewPat">+ New Patient</button></div>' +
        '<div class="bl-panel-b"><div id="blPatSearchWrap">' +
          '<input class="input search" id="blPatSearch" placeholder="Search name or phone…" autocomplete="off">' +
          '<div id="blPatResults"></div>' +
        '</div><div id="blPatientBox" style="margin-top:10px"></div></div></div>' +

      /* tests column */
      '<div class="bl-panel"><div class="bl-panel-h">Tests <span class="badge b-ready" id="blCount">0 tests</span></div>' +
        '<div class="bl-panel-b">' +
          '<input class="input search" id="blTestSearch" placeholder="Search test name or code…" autocomplete="off">' +
          '<div class="bl-chips" id="blChips">' + cats.map(function (c) {
            return '<button class="bl-chip' + (c === 'All' ? ' on' : '') + '" data-cat="' + App.esc(c) + '">' + App.esc(c) + '</button>';
          }).join('') + '</div>' +
          '<div id="blTestList" style="max-height:340px;overflow:auto"></div>' +
        '</div></div>' +

      /* summary column */
      '<div class="bl-panel bl-col-summary"><div class="bl-panel-h">Bill Summary</div><div class="bl-panel-b">' +
        '<div id="blCart" style="max-height:210px;overflow:auto;margin-bottom:6px"></div>' +
        '<label class="label">Referral doctor (optional)</label>' +
        '<select class="select" id="blDoctor"><option value="">Walk-in (no referral)</option>' +
          doctors.map(function (d) {
            return '<option value="' + App.esc(d.id) + '">' + App.esc(d.name) + ' — ' + App.esc(d.commissionPct || 0) + '%</option>';
          }).join('') + '</select>' +
        '<label class="label" style="margin-top:12px">Discount</label>' +
        '<div class="bl-disc-wrap"><div class="bl-seg" style="width:130px;flex:none">' +
          '<button id="blDiscRs" class="on">Rs</button><button id="blDiscPct">%</button></div>' +
          '<input class="input" id="blDiscVal" type="number" min="0" value="0"></div>' +
        '<div style="margin-top:14px">' +
          '<div class="bl-row"><span>Subtotal</span><strong id="blSub" style="color:var(--ink)">Rs 0</strong></div>' +
          '<div class="bl-row"><span>Discount</span><strong id="blDisc" style="color:var(--ink)">− Rs 0</strong></div>' +
          '<div class="bl-total"><span>Total</span><strong id="blTotal">Rs 0</strong></div>' +
        '</div>' +
        '<label class="label" style="margin-top:12px">Payment method</label>' +
        '<div class="bl-seg" id="blMethod"><button data-m="Cash" class="on">Cash</button><button data-m="Bank">Bank</button><button data-m="Card">Card</button></div>' +
        '<label class="label" style="margin-top:12px">Amount tendered</label>' +
        '<input class="input" id="blTendered" type="number" min="0" placeholder="0">' +
        '<div class="bl-row" id="blChangeRow" style="margin-top:6px"></div>' +
        '<button class="btn btn-primary bl-save" id="blSave" disabled>Save &amp; Print</button>' +
        '<button class="btn btn-ghost" id="blClear" style="width:100%;margin-top:8px">Clear Bill</button>' +
      '</div></div>' +
    '</div>';

    /* ---------- wiring ---------- */
    document.getElementById('blNewPat').addEventListener('click', openNewPatient);

    var ps = document.getElementById('blPatSearch');
    ps.addEventListener('input', function () { paintPatientResults(ps.value); });

    var ts = document.getElementById('blTestSearch');
    ts.addEventListener('input', function () { state.q = ts.value; paintTests(); });

    document.getElementById('blChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      state.cat = b.getAttribute('data-cat');
      this.querySelectorAll('.bl-chip').forEach(function (c) { c.classList.toggle('on', c === b); });
      paintTests();
    });

    document.getElementById('blDoctor').addEventListener('change', function () {
      state.doctorId = this.value;
    });

    var dr = document.getElementById('blDiscRs'), dp = document.getElementById('blDiscPct');
    dr.addEventListener('click', function () { state.discType = 'rs'; dr.classList.add('on'); dp.classList.remove('on'); paintTotals(); });
    dp.addEventListener('click', function () { state.discType = 'pct'; dp.classList.add('on'); dr.classList.remove('on'); paintTotals(); });
    document.getElementById('blDiscVal').addEventListener('input', function () {
      state.discVal = num(this.value);
      paintTotals();
    });

    document.getElementById('blMethod').addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      state.method = b.getAttribute('data-m');
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    });

    document.getElementById('blTendered').addEventListener('input', function () {
      state.tendered = num(this.value);
      state.tenderDirty = true;
      paintTotals();
    });

    document.getElementById('blSave').addEventListener('click', saveBill);

    document.getElementById('blClear').addEventListener('click', function () {
      state.cart = []; state.doctorId = ''; state.discType = 'rs'; state.discVal = 0;
      state.method = 'Cash'; state.tendered = 0; state.tenderDirty = false;
      document.getElementById('blDoctor').value = '';
      document.getElementById('blDiscVal').value = '0';
      document.getElementById('blTendered').value = '';
      dr.classList.add('on'); dp.classList.remove('on');
      document.getElementById('blMethod').querySelectorAll('button').forEach(function (x, i) { x.classList.toggle('on', i === 0); });
      paintTests(); paintCart(); paintTotals();
      App.toast('Bill cleared');
    });

    /* initial paint */
    paintPatient();
    paintTests();
    paintCart();
    paintTotals();
  });
})();
