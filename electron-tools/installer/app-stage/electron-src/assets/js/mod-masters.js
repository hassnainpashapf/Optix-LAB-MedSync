/* ============================================================
   LabPOS — Masters module (Agent 8)
   Routes: #/tests (test catalog), #/doctors (referral doctors)
   Depends on: window.DB, window.App (see SPEC.md)
   ============================================================ */
(function () {
'use strict';

/* ---------- helpers ---------- */

function sessionRole() {
  try {
    var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
    return s ? s.role : null;
  } catch (e) { return null; }
}

function deny() {
  App.toast('You do not have permission to view this page.', 'err');
  App.nav('/dashboard');
}

function view() { return document.getElementById('view'); }

function lastModal() {
  var ms = document.querySelectorAll('.modal');
  return ms.length ? ms[ms.length - 1] : null;
}

function monthKey(d) { d = new Date(d); return d.getFullYear() * 12 + d.getMonth(); }
function currentMonthKey() { return monthKey(new Date()); }

function categories() {
  var s = {};
  DB.all('tests').forEach(function (t) { if (t.category) s[t.category] = 1; });
  return Object.keys(s).sort();
}

/* dashboard-style stat card icons (22x22, stroke=currentColor, round caps) */
var TICONS = {
  flask: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/></svg>',
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/></svg>',
  tag: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/></svg>',
  box: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8.3L12 13l8.7-4.7"/><path d="M12 13v9"/></svg>'
};

/* dashboard-style stat card — reuses global .stat classes from app.css */
function tStat(icon, tint, label, value, sub) {
  return '<div class="stat">' +
    '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft);--sc-c:var(--' + tint + ')">' + icon + '</div>' +
    '<div class="stat-tx" style="flex:1;min-width:0"><div class="lb">' + App.esc(label) + '</div>' +
    '<div class="vl">' + value + '</div>' +
    '<div class="dl">' + App.esc(sub) + '</div></div>' +
    '</div>';
}

/* how many invoices reference this test / doctor */
function testInvoiceCount(id) {
  return DB.all('invoices').filter(function (inv) {
    return (inv.items || []).some(function (it) { return it.testId === id; });
  }).length;
}
function doctorInvoiceCount(id) {
  return DB.all('invoices').filter(function (inv) { return inv.doctorId === id; }).length;
}

/* filter state (module-level so it survives re-render) */
var testFilter = { q: '', cat: 'All', status: 'All' };
var docFilter = { q: '' };

/* ============================================================
   #/tests — Test catalog master
   ============================================================ */

function renderTests() {
  var r = sessionRole();
  if (r !== 'admin' && r !== 'technician') { deny(); return; }
  var canEdit = (r === 'admin');

  var cats = categories();
  var allT = DB.all('tests');
  var nActive = allT.filter(function (t) { return t.active !== false; }).length;
  var nPkg = allT.filter(function (t) { return t.isPackage; }).length;
  var statCards =
    tStat(TICONS.flask, 'blue', 'Total Tests', allT.length, 'in catalog') +
    tStat(TICONS.check, 'green', 'Active Tests', nActive, 'available for booking') +
    tStat(TICONS.tag, 'amber', 'Categories', cats.length, 'test categories') +
    tStat(TICONS.box, 'brand', 'Packages', nPkg, 'bundled offers');
  var chips = ['All'].concat(cats).map(function (c) {
    return '<button type="button" class="btn btn-sm ' +
      (testFilter.cat === c ? 'btn-primary' : 'btn-ghost') +
      '" data-cat="' + App.esc(c) + '">' + App.esc(c) + '</button>';
  }).join(' ');

  view().innerHTML =
    '<div class="stat-grid">' + statCards + '</div>' +
    '<div class="card"><div class="card-b">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">' +
        '<input id="t-q" class="input search" placeholder="Search code, name, category..." value="' + App.esc(testFilter.q) + '" style="max-width:280px">' +
        '<select id="t-status" class="select" style="max-width:160px">' +
          ['All', 'Active', 'Inactive'].map(function (s) {
            return '<option' + (testFilter.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
        (canEdit ? '<button type="button" class="btn btn-primary" id="t-add" style="margin-left:auto">+ Add Test</button>' : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px" id="t-chips">' + chips + '</div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr>' +
        '<th>Code</th><th>Test Name</th><th>Category</th><th>Sample</th><th>TAT</th>' +
        '<th style="text-align:right">Price</th><th>Status</th><th style="text-align:right">Actions</th>' +
      '</tr></thead><tbody id="t-rows"></tbody></table></div>' +
    '</div></div>';

  var qEl = document.getElementById('t-q');
  qEl.addEventListener('input', function () { testFilter.q = qEl.value; drawTestRows(canEdit); });
  // keep focus while typing
  qEl.addEventListener('input', function () { qEl.focus(); });
  document.getElementById('t-status').addEventListener('change', function (e) {
    testFilter.status = e.target.value; drawTestRows(canEdit);
  });
  document.getElementById('t-chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]'); if (!b) return;
    testFilter.cat = b.getAttribute('data-cat'); renderTests();
  });
  var addBtn = document.getElementById('t-add');
  if (addBtn) addBtn.addEventListener('click', function () { testModal(null); });

  drawTestRows(canEdit);
}

function drawTestRows(canEdit) {
  var tb = document.getElementById('t-rows');
  if (!tb) return;
  var q = testFilter.q.trim().toLowerCase();
  var rows = DB.all('tests').slice().sort(function (a, b) {
    return String(a.code || '').localeCompare(String(b.code || ''));
  }).filter(function (t) {
    if (testFilter.cat !== 'All' && t.category !== testFilter.cat) return false;
    if (testFilter.status === 'Active' && !t.active) return false;
    if (testFilter.status === 'Inactive' && t.active) return false;
    if (q) {
      var h = ((t.code || '') + ' ' + (t.name || '') + ' ' + (t.category || '')).toLowerCase();
      if (h.indexOf(q) < 0) return false;
    }
    return true;
  });

  if (!rows.length) { tb.innerHTML = '<tr><td colspan="8">' + App.empty('No tests found.') + '</td></tr>'; return; }

  tb.innerHTML = rows.map(function (t) {
    var status = t.active
      ? '<span class="badge b-ready">Active</span>'
      : '<span class="badge b-unpaid">Inactive</span>';
    var acts = canEdit
      ? '<div class="actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-book="' + App.esc(t.id) + '">Book</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + App.esc(t.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-toggle="' + App.esc(t.id) + '">' +
          (t.active ? 'Deactivate' : 'Activate') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-del="' + App.esc(t.id) + '" title="Delete">✕</button>' +
        '</div>'
      : '<span class="muted">—</span>';
    return '<tr>' +
      '<td><strong>' + App.esc(t.code || '') + '</strong></td>' +
      '<td>' + App.esc(t.name || '') + (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') +
        (t.isPackage && t.includes ? '<div style="font-size:11.5px;color:var(--muted)">' + t.includes.length + ' tests included</div>' : '') + '</td>' +
      '<td>' + App.esc(t.category || '') + '</td>' +
      '<td>' + App.esc(t.sampleType || '') + '</td>' +
      '<td>' + App.esc(t.tat || '') + '</td>' +
      '<td style="text-align:right"><strong>' + App.money(+t.price || 0) + '</strong></td>' +
      '<td>' + status + '</td>' +
      '<td style="text-align:right">' + acts + '</td>' +
    '</tr>';
  }).join('');

  if (!canEdit) return;
  tb.querySelectorAll('[data-book]').forEach(function (b) {
    b.addEventListener('click', function () {
      sessionStorage.setItem('labpos_pretest', b.getAttribute('data-book'));
      App.nav('#/billing');
    });
  });
  tb.querySelectorAll('[data-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = DB.get('tests', b.getAttribute('data-edit'));
      if (t) testModal(t);
    });
  });
  tb.querySelectorAll('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = DB.get('tests', b.getAttribute('data-toggle'));
      if (!t) return;
      DB.update(t.id, { active: !t.active });
      App.toast(t.active ? 'Test deactivated.' : 'Test activated.');
      renderTests();
    });
  });
  tb.querySelectorAll('[data-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-del');
      var n = testInvoiceCount(id);
      if (n > 0) {
        App.toast('Cannot delete: this test is used in ' + n + ' invoice(s). Deactivate it instead.', 'err');
        return;
      }
      App.confirm('Delete this test permanently?').then(function (ok) {
        if (!ok) return;
        DB.remove('tests', id);
        App.toast('Test deleted.');
        renderTests();
      });
    });
  });
}

function paramRow(p) {
  p = p || {};
  return '<div class="tm-prow" style="display:grid;grid-template-columns:1fr 110px 1fr 36px;gap:8px;margin-bottom:8px">' +
    '<input class="input tm-pn" placeholder="Parameter (e.g. Hemoglobin)" value="' + App.esc(p.name || '') + '">' +
    '<input class="input tm-pu" placeholder="Unit" value="' + App.esc(p.unit || '') + '">' +
    '<input class="input tm-pr" placeholder="Reference range" value="' + App.esc(p.ref || '') + '">' +
    '<button type="button" class="btn btn-ghost btn-sm tm-prm" title="Remove">✕</button>' +
  '</div>';
}

function testModal(t) {
  var isNew = !t;
  t = t || { code: '', name: '', category: '', price: '', sampleType: 'Blood', tat: 'Same day', active: true, params: [] };
  var cats = categories();
  var sampleOpts = ['Blood', 'Serum', 'Plasma', 'Urine', 'Stool', 'Other'].map(function (s) {
    return '<option' + (t.sampleType === s ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  var body =
    '<form id="tm-form">' +
    '<div class="form-grid">' +
      '<div><label class="label">Test Code *</label><input id="tm-code" class="input" value="' + App.esc(t.code || '') + '" required></div>' +
      '<div><label class="label">Test Name *</label><input id="tm-name" class="input" value="' + App.esc(t.name || '') + '" required></div>' +
      '<div><label class="label">Category *</label><input id="tm-cat" class="input" list="tm-catlist" value="' + App.esc(t.category || '') + '" required>' +
        '<datalist id="tm-catlist">' + cats.map(function (c) { return '<option value="' + App.esc(c) + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="label">Price (Rs) *</label><input id="tm-price" class="input" type="number" min="0" step="1" value="' + App.esc(String(t.price === '' ? '' : t.price)) + '" required></div>' +
      '<div><label class="label">Sample Type</label><select id="tm-sample" class="select">' + sampleOpts + '</select></div>' +
      '<div><label class="label">Turnaround Time</label><input id="tm-tat" class="input" value="' + App.esc(t.tat || '') + '" placeholder="e.g. Same day"></div>' +
      '<div><label class="label">Status</label><label style="display:flex;align-items:center;gap:8px;font-weight:600"><input id="tm-active" type="checkbox"' + (t.active ? ' checked' : '') + '> Active</label></div>' +
    '</div>' +
    '<div style="margin-top:14px"><label class="label">Report Parameters</label>' +
      '<div id="tm-prows"></div>' +
      '<button type="button" id="tm-addp" class="btn btn-ghost btn-sm">+ Add Parameter</button></div>' +
    '<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer">' +
      '<input id="tm-ispkg" type="checkbox"' + (t.isPackage ? ' checked' : '') + '> This is a <span class="badge b-ready">Package</span> (bundle of tests at one price)</label>' +
      '<div id="tm-pkgbox" style="display:' + (t.isPackage ? 'block' : 'none') + ';margin-top:8px">' +
        '<div class="label">Included tests</div>' +
        '<div id="tm-pkglist" style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px"></div>' +
      '</div>' +
    '</div>' +
    '<div style="margin-top:18px;text-align:right"><button type="submit" class="btn btn-primary">' +
      (isNew ? 'Add Test' : 'Save Changes') + '</button></div>' +
    '</form>';

  App.modal(isNew ? 'Add New Test' : 'Edit Test', body, { onOpen: function () {
    var m = lastModal(); if (!m) return;
    var rowsBox = m.querySelector('#tm-prows');
    function addRow(p) {
      rowsBox.insertAdjacentHTML('beforeend', paramRow(p));
      var row = rowsBox.lastElementChild;
      row.querySelector('.tm-prm').addEventListener('click', function () { row.remove(); });
    }
    (t.params || []).forEach(addRow);
    if (!(t.params || []).length) addRow(null);
    m.querySelector('#tm-addp').addEventListener('click', function () { addRow(null); });

    /* package includes picker */
    var pkgBox = m.querySelector('#tm-pkgbox'), pkgList = m.querySelector('#tm-pkglist');
    var isPkgEl = m.querySelector('#tm-ispkg');
    var picked = {};
    (t.includes || []).forEach(function (id) { picked[id] = true; });
    function paintPkgList() {
      var all = DB.all('tests').filter(function (x) { return x.id !== t.id && !x.isPackage && x.active !== false; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      pkgList.innerHTML = all.length ? all.map(function (x) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:13.5px">' +
          '<input type="checkbox" data-pkg="' + App.esc(x.id) + '"' + (picked[x.id] ? ' checked' : '') + '> ' +
          App.esc(x.name) + ' <span style="color:var(--muted)">(' + App.esc(x.code || '') + ' • ' + App.money(+x.price || 0) + ')</span></label>';
      }).join('') : '<div style="color:var(--muted);padding:8px">No tests available.</div>';
      pkgList.querySelectorAll('[data-pkg]').forEach(function (cb) {
        cb.addEventListener('change', function () { picked[cb.getAttribute('data-pkg')] = cb.checked; });
      });
    }
    paintPkgList();
    isPkgEl.addEventListener('change', function () { pkgBox.style.display = isPkgEl.checked ? 'block' : 'none'; });

    m.querySelector('#tm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = m.querySelector('#tm-code').value.trim();
      var name = m.querySelector('#tm-name').value.trim();
      var category = m.querySelector('#tm-cat').value.trim();
      var price = parseFloat(m.querySelector('#tm-price').value);
      if (!code || !name || !category) { App.toast('Code, name and category are required.', 'err'); return; }
      if (isNaN(price) || price < 0) { App.toast('Enter a valid price.', 'err'); return; }
      var dup = DB.all('tests').some(function (x) {
        return x.id !== t.id && String(x.code || '').toLowerCase() === code.toLowerCase();
      });
      if (dup) { App.toast('A test with this code already exists.', 'err'); return; }
      var params = [];
      rowsBox.querySelectorAll('.tm-prow').forEach(function (row) {
        var pn = row.querySelector('.tm-pn').value.trim();
        if (!pn) return;
        params.push({
          name: pn,
          unit: row.querySelector('.tm-pu').value.trim(),
          ref: row.querySelector('.tm-pr').value.trim()
        });
      });
      var data = {
        code: code, name: name, category: category, price: price,
        sampleType: m.querySelector('#tm-sample').value,
        tat: m.querySelector('#tm-tat').value.trim() || 'Same day',
        active: m.querySelector('#tm-active').checked,
        params: params,
        isPackage: isPkgEl.checked,
        includes: isPkgEl.checked ? Object.keys(picked).filter(function (id) { return picked[id]; }) : []
      };
      if (data.isPackage && !data.includes.length) { App.toast('Select at least one test for the package.', 'err'); return; }
      if (isNew) { DB.insert('tests', data); App.toast('Test added.'); }
      else { DB.update(t.id, data); App.toast('Test updated.'); }
      var ms = document.querySelectorAll('.modal-ov');
      // close via App.modal's closer: re-query close by clicking overlay close button if present
      var closer = m.querySelector('[data-close]');
      if (closer) closer.click();
      renderTests();
    });
  }});
}

/* ============================================================
   #/doctors — Referral doctors
   ============================================================ */

function renderDoctors() {
  var r = sessionRole();
  if (r !== 'admin' && r !== 'reception') { deny(); return; }
  var canEdit = true; // admin + reception both manage doctors

  view().innerHTML =
    '<div class="card"><div class="card-b">' +
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><input id="d-q" class="input search" placeholder="Search name, clinic, phone..." value="' + App.esc(docFilter.q) + '" style="max-width:280px">' +
      '<button type="button" class="btn btn-primary" id="d-add" style="margin-left:auto">+ Add Doctor</button></div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr>' +
        '<th>Doctor</th><th>Clinic</th><th>Phone</th><th style="text-align:right">Commission %</th>' +
        '<th style="text-align:right">Referred (this month)</th><th style="text-align:right">Commission Due (month)</th>' +
        '<th style="text-align:right">Actions</th>' +
      '</tr></thead><tbody id="d-rows"></tbody></table></div>' +
    '</div></div>';

  var qEl = document.getElementById('d-q');
  qEl.addEventListener('input', function () { docFilter.q = qEl.value; drawDoctorRows(); });
  qEl.addEventListener('input', function () { qEl.focus(); });
  document.getElementById('d-add').addEventListener('click', function () { doctorModal(null); });

  drawDoctorRows();
}

function drawDoctorRows() {
  var tb = document.getElementById('d-rows');
  if (!tb) return;
  var q = docFilter.q.trim().toLowerCase();
  var mk = currentMonthKey();
  var invs = DB.all('invoices');

  var rows = DB.all('doctors').slice().sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }).filter(function (d) {
    if (!q) return true;
    var h = ((d.name || '') + ' ' + (d.clinic || '') + ' ' + (d.phone || '')).toLowerCase();
    return h.indexOf(q) >= 0;
  });

  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7">' + App.empty('No doctors found.') + '</td></tr>'; return; }

  tb.innerHTML = rows.map(function (d) {
    var mine = invs.filter(function (i) { return i.doctorId === d.id && monthKey(i.createdAt) === mk; });
    var rev = mine.reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var comm = rev * (+d.commissionPct || 0) / 100;
    var paidM = (d.commissionPaid || []).filter(function (x) { return monthKey(x.date) === mk; })
      .reduce(function (s, x) { return s + (+x.amount || 0); }, 0);
    var dueM = Math.max(0, comm - paidM);
    return '<tr>' +
      '<td><strong>' + App.esc(d.name || '') + '</strong></td>' +
      '<td>' + App.esc(d.clinic || '—') + '</td>' +
      '<td>' + App.esc(d.phone || '—') + '</td>' +
      '<td style="text-align:right">' + App.esc(String(d.commissionPct == null ? 0 : d.commissionPct)) + '%</td>' +
      '<td style="text-align:right"><strong>' + mine.length + '</strong></td>' +
      '<td style="text-align:right"><strong>' + App.money(comm) + '</strong>' +
        (paidM > 0 ? '<div style="font-size:11.5px;color:var(--green)">Paid ' + App.money(paidM) + '</div>' : '') +
        (dueM > 0 ? '<div style="font-size:11.5px;color:var(--red);font-weight:700">Due ' + App.money(dueM) + '</div>' : '') + '</td>' +
      '<td style="text-align:right"><div class="actions">' +
        (dueM > 0 ? '<button type="button" class="btn btn-primary btn-sm" data-pay="' + App.esc(d.id) + '" data-due="' + dueM + '">Pay</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + App.esc(d.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-del="' + App.esc(d.id) + '" title="Delete">✕</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  tb.querySelectorAll('[data-pay]').forEach(function (b) {
    b.addEventListener('click', function () { openCommissionPay(b.getAttribute('data-pay'), parseFloat(b.getAttribute('data-due')) || 0); });
  });

  tb.querySelectorAll('[data-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = DB.get('doctors', b.getAttribute('data-edit'));
      if (d) doctorModal(d);
    });
  });
  tb.querySelectorAll('[data-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-del');
      var n = doctorInvoiceCount(id);
      if (n > 0) {
        App.toast('Cannot delete: this doctor is linked to ' + n + ' invoice(s).', 'err');
        return;
      }
      App.confirm('Delete this doctor permanently?').then(function (ok) {
        if (!ok) return;
        DB.remove('doctors', id);
        App.toast('Doctor deleted.');
        renderDoctors();
      });
    });
  });
}

function openCommissionPay(doctorId, dueAmount) {
  var d = DB.get('doctors', doctorId);
  if (!d) return;
  var body =
    '<div class="form-grid">' +
      '<div><label class="label">Doctor</label><div style="font-weight:700">' + App.esc(d.name || '') + '</div></div>' +
      '<div><label class="label">Commission Due (this month)</label><div style="font-weight:800;color:var(--red)">' + App.money(dueAmount) + '</div></div>' +
      '<div><label class="label">Amount Paid *</label><input id="cp-amt" class="input" type="number" min="1" step="any" value="' + dueAmount + '"></div>' +
      '<div><label class="label">Date</label><input id="cp-date" class="input" type="date" value="' + App.today() + '"></div>' +
      '<div style="grid-column:1/-1"><label class="label">Note (optional)</label><input id="cp-note" class="input" placeholder="e.g. cash handed over"></div>' +
    '</div>' +
    '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="cp-cancel">Cancel</button>' +
    '<button class="btn btn-primary" id="cp-save">Record Payment</button></div>';
  var close = App.modal('Pay Commission', body, { onOpen: function (root) {
    root.querySelector('#cp-cancel').addEventListener('click', close);
    root.querySelector('#cp-save').addEventListener('click', function () {
      var amt = parseFloat(root.querySelector('#cp-amt').value);
      if (!(amt > 0)) { App.toast('Enter a valid amount', 'err'); return; }
      var cur = DB.get('doctors', doctorId) || {};
      var list = (cur.commissionPaid || []).slice();
      var s = null;
      try { s = JSON.parse(localStorage.getItem('labpos_session') || 'null'); } catch (e) {}
      list.push({ amount: amt, date: root.querySelector('#cp-date').value || App.today(), note: root.querySelector('#cp-note').value.trim(), by: (s && s.name) || 'system' });
      DB.update('doctors', doctorId, { commissionPaid: list });
      App.toast('Commission payment recorded');
      close(); renderDoctors();
    });
  }});
}

function doctorModal(d) {
  var isNew = !d;
  d = d || { name: '', clinic: '', phone: '', commissionPct: 10 };

  var body =
    '<form id="dm-form"><div class="form-grid">' +
      '<div><label class="label">Doctor Name *</label><input id="dm-name" class="input" value="' + App.esc(d.name || '') + '" placeholder="e.g. Dr. Ahmed Khan" required></div>' +
      '<div><label class="label">Clinic / Hospital</label><input id="dm-clinic" class="input" value="' + App.esc(d.clinic || '') + '"></div>' +
      '<div><label class="label">Phone</label><input id="dm-phone" class="input" value="' + App.esc(d.phone || '') + '" placeholder="03xx-xxxxxxx"></div>' +
      '<div><label class="label">Commission % *</label><input id="dm-comm" class="input" type="number" min="0" max="100" step="0.5" value="' + App.esc(String(d.commissionPct == null ? '' : d.commissionPct)) + '" required></div>' +
    '</div>' +
    '<div style="margin-top:18px;text-align:right"><button type="submit" class="btn btn-primary">' +
      (isNew ? 'Add Doctor' : 'Save Changes') + '</button></div></form>';

  App.modal(isNew ? 'Add Referral Doctor' : 'Edit Doctor', body, { onOpen: function () {
    var m = lastModal(); if (!m) return;
    m.querySelector('#dm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = m.querySelector('#dm-name').value.trim();
      var comm = parseFloat(m.querySelector('#dm-comm').value);
      if (!name) { App.toast('Doctor name is required.', 'err'); return; }
      if (isNaN(comm) || comm < 0 || comm > 100) { App.toast('Commission must be between 0 and 100%.', 'err'); return; }
      var data = {
        name: name,
        clinic: m.querySelector('#dm-clinic').value.trim(),
        phone: m.querySelector('#dm-phone').value.trim(),
        commissionPct: comm
      };
      if (isNew) { DB.insert('doctors', data); App.toast('Doctor added.'); }
      else { DB.update(d.id, data); App.toast('Doctor updated.'); }
      var closer = m.querySelector('[data-close]');
      if (closer) closer.click();
      renderDoctors();
    });
  }});
}

/* ---------- register routes ---------- */

App.route('/tests', renderTests);
App.route('/doctors', renderDoctors);

})();
