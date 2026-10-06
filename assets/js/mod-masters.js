/* ============================================================
   Optix LAB MedSync — Masters module (Agent 8)
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
  return '<div class="stat" data-tint="' + tint + '">' +
    '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft);--sc-c:var(--' + tint + ')">' + icon + '</div>' +
    '<div class="stat-tx" style="flex:1;min-width:0"><div class="lb">' + App.esc(label) + '</div>' +
    '<div class="vl">' + value + '</div>' +
    '<div class="dl">' + App.esc(sub) + '</div></div>' +
    '</div>';
}

/* doctors-page premium stat cards — markup + CSS copied from the dashboard
   statCard() pattern (stat-grid > stat > stat-ico + lb/vl/dl), inline style so
   the premium look applies without touching app.css */
function _svgD(paths) {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
}
var DICONS = {
  doctor: _svgD('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M18 6v6M21 9h-6"/>'),
  refer: _svgD('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>'),
  cash: _svgD('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  trophy: _svgD('<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>')
};
function dStat(icon, tint, label, value, sub, raw, isMoney, vlStyle) {
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
var DOC_STAT_CSS = '';
/* dashboard-style count-up for .vl[data-count] values (final value is already
   in the markup, so a failure here never leaves a blank card) */
function dCountUp() {
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
  /* filter by selected category for stat cards */
  var fT = testFilter.cat === 'All' ? allT : allT.filter(function (t) { return t.category === testFilter.cat; });
  var nActive = fT.filter(function (t) { return t.active !== false; }).length;
  var nPkg = fT.filter(function (t) { return t.isPackage; }).length;
  var catLbl = testFilter.cat === 'All' ? 'in catalog' : 'in ' + testFilter.cat;
  var statCards =
    tStat(TICONS.flask, 'blue', 'Total Tests', fT.length, catLbl) +
    tStat(TICONS.check, 'green', 'Active Tests', nActive, testFilter.cat === 'All' ? 'available for booking' : 'active in ' + testFilter.cat) +
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
        (canEdit ? '<button type="button" class="btn btn-ghost" id="t-import" style="margin-left:8px">📥 Import CSV</button>' : '') +
        (canEdit ? '<button type="button" class="btn btn-ghost" id="t-bulkprice" style="margin-left:8px">💰 Bulk Prices</button>' : '') +
        (canEdit ? '' : '') +
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
  /* bulk price update */
  var bulkBtn = document.getElementById('t-bulkprice');
  if (bulkBtn) bulkBtn.addEventListener('click', function () { bulkPriceModal(); });
  /* CSV import for tests */
  var impBtn = document.getElementById('t-import');
  if (impBtn) impBtn.addEventListener('click', function () {
    var fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.csv,text/csv';
    fi.onchange = function () {
      var f = fi.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var lines = String(rd.result).split(/\r?\n/).filter(function (l) { return l.trim(); });
          if (lines.length < 2) { App.toast('CSV is empty', 'err'); return; }
          var headers = lines[0].split(',').map(function (h) { return h.trim().toLowerCase(); });
          var idx = function (n) { return headers.indexOf(n); };
          var ciCode = idx('code'), ciName = idx('name'), ciCat = idx('category'),
              ciPrice = idx('price'), ciSample = idx('sampletype'), ciTat = idx('tat');
          if (ciName < 0) { App.toast('CSV needs a "name" column', 'err'); return; }
          var existing = {};
          DB.all('tests').forEach(function (t) { existing[(t.name || '').toLowerCase()] = 1; });
          var added = 0, skipped = 0;
          for (var i = 1; i < lines.length; i++) {
            /* simple CSV parse handling quoted fields */
            var cols = [], cur = '', inQ = false;
            var line = lines[i];
            for (var j = 0; j < line.length; j++) {
              var ch = line[j];
              if (ch === '"') inQ = !inQ;
              else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
              else cur += ch;
            }
            cols.push(cur.trim());
            var name = (cols[ciName] || '').replace(/^"|"$/g, '').trim();
            if (!name || existing[name.toLowerCase()]) { skipped++; continue; }
            var code = ciCode >= 0 ? (cols[ciCode] || '').replace(/^"|"$/g, '').trim() : '';
            var cat = ciCat >= 0 ? (cols[ciCat] || '').replace(/^"|"$/g, '').trim() : 'General';
            var price = ciPrice >= 0 ? parseFloat((cols[ciPrice] || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
            DB.put('tests', {
              id: 't' + Date.now() + '_' + i + Math.random().toString(36).slice(2, 5),
              code: code || ('T' + (1000 + i)),
              name: name, category: cat || 'General', price: price,
              sampleType: ciSample >= 0 ? (cols[ciSample] || 'Blood') : 'Blood',
              tat: ciTat >= 0 ? (cols[ciTat] || 'Same day') : 'Same day',
              active: true, params: []
            });
            existing[name.toLowerCase()] = 1;
            added++;
          }
          App.toast(added + ' tests imported' + (skipped ? ' (' + skipped + ' skipped)' : ''));
          drawTestRows(canEdit);
        } catch (e) { App.toast('Import failed: ' + e.message, 'err'); }
      };
      rd.readAsText(f);
    };
    fi.click();
  });
  /* seed all template tests with price 0 */
  var seedBtn = document.getElementById('t-seed');
  if (seedBtn) seedBtn.addEventListener('click', function () {
    if (!confirm('Import 5000 realistic Pakistani lab tests with price Rs 0? This may take a moment. You can edit prices later.')) return;
    App.toast('Loading test catalog...', 'info');
    /* load the 5000-test catalog if not already loaded */
    function doSeed() {
      var catalog = (typeof TEST_CATALOG_5000 !== 'undefined') ? TEST_CATALOG_5000 : [];
      if (!catalog.length) { App.toast('Catalog not loaded', 'err'); return; }
      var existing = {};
      DB.all('tests').forEach(function (t) { existing[(t.name || '').toLowerCase()] = 1; });
      var added = 0, skipped = 0;
      catalog.forEach(function (ct, i) {
        var name = ct.name;
        if (!name || existing[name.toLowerCase()]) { skipped++; return; }
        DB.put('tests', {
          id: 't' + Date.now() + '_' + i + Math.random().toString(36).slice(2, 5),
          code: 'T' + (10000 + i),
          name: name, category: ct.category || 'General', price: 0,
          sampleType: 'Blood', tat: 'Same day', active: true,
          params: ct.params || []
        });
        existing[name.toLowerCase()] = 1;
        added++;
      });
      App.toast(added + ' tests imported' + (skipped ? ' (' + skipped + ' already exist)' : ''));
      drawTestRows(canEdit);
    }
    if (typeof TEST_CATALOG_5000 !== 'undefined') doSeed();
    else App.loadScript('assets/js/test-catalog-5000.js').then(doSeed).catch(function () {
      App.toast('Failed to load catalog', 'err');
    });
  });

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

  /* group tests by department (category) */
  var groups = {}, order = [];
  rows.forEach(function (t) {
    var cat = t.category || 'Uncategorized';
    if (!groups[cat]) { groups[cat] = []; order.push(cat); }
    groups[cat].push(t);
  });
  order.sort();

  var htmlParts = [];
  order.forEach(function (cat) {
    var isUncat = cat === 'Uncategorized';
    htmlParts.push('<tr class="dept-head"><td colspan="8" style="background:' + (isUncat ? '#fef3c7' : 'var(--brand-soft)') + ';font-weight:800;padding:10px 12px;color:' + (isUncat ? '#92400e' : 'var(--brand)') + ';border-left:4px solid ' + (isUncat ? '#f59e0b' : 'var(--brand)') + '">' +
      '📁 ' + App.esc(cat) + ' <span class="muted" style="font-weight:400">(' + groups[cat].length + ' test' + (groups[cat].length === 1 ? '' : 's') + ')</span></td></tr>');
    groups[cat].forEach(function (t) {
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
      htmlParts.push('<tr>' +
        '<td><strong>' + App.esc(t.code || '') + '</strong></td>' +
        '<td>' + App.esc(t.name || '') + (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') +
          (t.isPackage && t.includes ? '<div style="font-size:11.5px;color:var(--muted)">' + t.includes.length + ' tests included</div>' : '') +
          '<div style="margin-top:4px"><span class="badge" style="background:var(--brand-soft);color:var(--brand);font-size:11px">📁 ' + App.esc(t.category || 'Uncategorized') + '</span></div></td>' +
        '<td>' + App.esc(t.category || '') + '</td>' +
        '<td>' + App.esc(t.sampleType || '') + '</td>' +
        '<td>' + App.esc(t.tat || '') + '</td>' +
        '<td style="text-align:right"><strong>' + App.money(+t.price || 0) + '</strong></td>' +
        '<td>' + status + '</td>' +
        '<td style="text-align:right">' + acts + '</td>' +
      '</tr>');
    });
  });
  tb.innerHTML = htmlParts.join('');

  if (!canEdit) return;
  tb.querySelectorAll('[data-book]').forEach(function (b) {
    b.addEventListener('click', function () {
      sessionStorage.setItem('labpos_pretest', b.getAttribute('data-book'));
      App.nav('#/patients');
      App.toast('Select a patient, then use “+ New Bill” to order this test', 'info');
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

/* Pre-defined parameter templates for common tests (from standard lab reference ranges) */
var TEST_TEMPLATES = {
  'CBC': [
    { name: 'Haemoglobin', unit: 'g/dl', ref: '13 - 18', type: 'number' },
    { name: 'WBC (TLC)', unit: 'x10³/uL', ref: '4 - 11', type: 'number' },
    { name: 'ESR (WG)', unit: 'mm/1st Hour', ref: '1 - 10', type: 'number' },
    { name: 'Total RBC', unit: 'x10⁶/uL', ref: '4.5 - 6.5', type: 'number' },
    { name: 'HCT (PVC)', unit: '%', ref: '38 - 52', type: 'number' },
    { name: 'MCV', unit: 'fL', ref: '80 - 96', type: 'number' },
    { name: 'MCH', unit: 'pg', ref: '27 - 32', type: 'number' },
    { name: 'MCHC', unit: '%', ref: '30 - 35', type: 'number' },
    { name: 'Platelets', unit: 'x10³/uL', ref: '150 - 450', type: 'number' },
    { name: 'RDW %', unit: '%', ref: '', type: 'number' },
    { name: 'RDW a', unit: 'um³', ref: '', type: 'number' },
    { name: 'MPV', unit: 'um', ref: '', type: 'number' },
    { name: 'PDW', unit: 'um', ref: '', type: 'number' },
    { name: 'PCT', unit: '%', ref: '', type: 'number' }
  ],
  'Lipid Profile': [
    { name: 'Total Cholesterol', unit: 'mg/dL', ref: '< 200', type: 'number' },
    { name: 'Triglycerides', unit: 'mg/dL', ref: '< 150', type: 'number' },
    { name: 'HDL Cholesterol', unit: 'mg/dL', ref: '40 - 60', type: 'number' },
    { name: 'LDL Cholesterol', unit: 'mg/dL', ref: '< 100', type: 'number' },
    { name: 'VLDL', unit: 'mg/dL', ref: '2 - 30', type: 'number' }
  ],
  'Liver Function (LFT)': [
    { name: 'Total Bilirubin', unit: 'mg/dL', ref: '0.3 - 1.2', type: 'number' },
    { name: 'Direct Bilirubin', unit: 'mg/dL', ref: '0.0 - 0.3', type: 'number' },
    { name: 'SGPT (ALT)', unit: 'U/L', ref: '7 - 56', type: 'number' },
    { name: 'SGOT (AST)', unit: 'U/L', ref: '10 - 40', type: 'number' },
    { name: 'Alkaline Phosphatase', unit: 'U/L', ref: '44 - 147', type: 'number' },
    { name: 'Total Protein', unit: 'g/dL', ref: '6.0 - 8.3', type: 'number' },
    { name: 'Albumin', unit: 'g/dL', ref: '3.5 - 5.5', type: 'number' }
  ],
  'Kidney Function (RFT)': [
    { name: 'Urea', unit: 'mg/dL', ref: '15 - 45', type: 'number' },
    { name: 'Creatinine', unit: 'mg/dL', ref: '0.6 - 1.2', type: 'number' },
    { name: 'Uric Acid', unit: 'mg/dL', ref: '3.5 - 7.2', type: 'number' },
    { name: 'Sodium', unit: 'm.mol/l', ref: '135 - 150', type: 'number' },
    { name: 'Potassium', unit: 'm.mol/l', ref: '3.5 - 5.4', type: 'number' },
    { name: 'Chloride', unit: 'm.mol/l', ref: '95 - 108', type: 'number' }
  ],
  'Thyroid Profile': [
    { name: 'Total T3', unit: 'ng/mL', ref: '0.8 - 2.11', type: 'number' },
    { name: 'Total T4', unit: 'ug/dl', ref: '4.5 - 13.8', type: 'number' },
    { name: 'TSH', unit: 'uIU/ml', ref: '0.37 - 5.1', type: 'number' }
  ],
  'Blood Sugar': [
    { name: 'Glucose (Fasting)', unit: 'mg/dL', ref: '70 - 100', type: 'number' },
    { name: 'Glucose (Random)', unit: 'mg/dL', ref: '< 140', type: 'number' }
  ],
  'HbA1c': [
    { name: 'HbA1c', unit: '%', ref: '4.0 - 5.6', type: 'number' },
    { name: 'Avg. Blood Glucose', unit: 'mg/dL', ref: '', type: 'number' }
  ],
  'Urine Complete Examination': [
    { name: 'Color', unit: '', ref: 'Pale yellow', type: 'text' },
    { name: 'Appearance', unit: '', ref: 'Clear', type: 'text' },
    { name: 'pH', unit: '', ref: '5.0 - 8.0', type: 'number' },
    { name: 'Specific Gravity', unit: '', ref: '1.005 - 1.030', type: 'number' },
    { name: 'Protein', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Glucose', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Ketones', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Blood', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Bilirubin', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Urobilinogen', unit: '', ref: 'Normal', type: 'text' },
    { name: 'Nitrite', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Leukocyte Esterase', unit: '', ref: 'Negative', type: 'text' },
    { name: 'Pus Cells', unit: '/HPF', ref: '0 - 5', type: 'text' },
    { name: 'RBCs', unit: '/HPF', ref: '0 - 2', type: 'text' },
    { name: 'Epithelial Cells', unit: '/HPF', ref: 'Few', type: 'text' }
  ],
  'Hepatitis B (HBsAg)': [
    { name: 'HBsAg', unit: '', ref: 'Non-Reactive', type: 'text' }
  ],
  'Hepatitis C (Anti-HCV)': [
    { name: 'Anti-HCV', unit: '', ref: 'Non-Reactive', type: 'text' }
  ],
  'HIV (Anti-HIV)': [
    { name: 'Anti-HIV I & II', unit: '', ref: 'Non-Reactive', type: 'text' }
  ],
  'Dengue Profile': [
    { name: 'NS1 Antigen', unit: '', ref: 'Negative', type: 'text' },
    { name: 'IgG', unit: '', ref: 'Negative', type: 'text' },
    { name: 'IgM', unit: '', ref: 'Negative', type: 'text' }
  ],
  'Widal Test': [
    { name: 'S. Typhi O', unit: '', ref: '< 1:80', type: 'text' },
    { name: 'S. Typhi H', unit: '', ref: '< 1:80', type: 'text' },
    { name: 'S. Paratyphi AH', unit: '', ref: '< 1:80', type: 'text' },
    { name: 'S. Paratyphi BH', unit: '', ref: '< 1:80', type: 'text' }
  ],
  'Coagulation (PT/INR)': [
    { name: 'PT', unit: 'sec', ref: '11 - 13.5', type: 'number' },
    { name: 'INR', unit: '', ref: '0.9 - 1.1', type: 'number' },
    { name: 'APTT', unit: 'sec', ref: '25 - 35', type: 'number' }
  ],
  'Serum Electrolytes Extended': [
    { name: 'Calcium', unit: 'mg/dL', ref: '8.5 - 10.5', type: 'number' },
    { name: 'Magnesium', unit: 'mg/dL', ref: '1.7 - 2.2', type: 'number' },
    { name: 'Phosphorus', unit: 'mg/dL', ref: '2.5 - 4.5', type: 'number' }
  ],
  'Vitamin D': [
    { name: '25-OH Vitamin D', unit: 'ng/mL', ref: '30 - 100', type: 'number' }
  ],
  'Vitamin B12': [
    { name: 'Vitamin B12', unit: 'pg/mL', ref: '200 - 900', type: 'number' }
  ],
  'Iron Studies': [
    { name: 'Serum Iron', unit: 'ug/dL', ref: '60 - 170', type: 'number' },
    { name: 'TIBC', unit: 'ug/dL', ref: '240 - 450', type: 'number' },
    { name: 'Ferritin', unit: 'ng/mL', ref: '15 - 150', type: 'number' }
  ],
  'Cardiac Enzymes': [
    { name: 'CK-MB', unit: 'ng/mL', ref: '0 - 5', type: 'number' },
    { name: 'Troponin I', unit: 'ng/mL', ref: '< 0.04', type: 'number' }
  ]
};

/* ---------- bulk price update ---------- */
function _bulkFilteredTests() {
  var q = (testFilter.q || '').trim().toLowerCase();
  return DB.all('tests').filter(function (t) {
    if (testFilter.cat !== 'All' && t.category !== testFilter.cat) return false;
    if (testFilter.status === 'Active' && !t.active) return false;
    if (testFilter.status === 'Inactive' && t.active) return false;
    if (q) {
      var h = ((t.code || '') + ' ' + (t.name || '') + ' ' + (t.category || '')).toLowerCase();
      if (h.indexOf(q) < 0) return false;
    }
    return true;
  });
}

function bulkPriceModal() {
  var cats = categories().sort();
  var scopeNote = (testFilter.cat !== 'All' || testFilter.status !== 'All' || (testFilter.q || '').trim())
    ? 'Note: only tests matching your current filters will be updated.'
    : 'This will apply to ALL tests in the catalog.';

  var body =
    '<div style="display:flex;flex-direction:column;gap:14px">' +
      '<p class="muted" style="margin:0">' + App.esc(scopeNote) + '</p>' +
      '<div>' +
        '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;padding:10px;border:2px solid var(--line);border-radius:10px;margin-bottom:8px">' +
          '<input type="radio" name="bp-mode" value="fixed" checked style="margin-top:3px">' +
          '<span><b>Set fixed price</b><br><span class="muted">Set all affected tests to one price.</span></span>' +
        '</label>' +
        '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;padding:10px;border:2px solid var(--line);border-radius:10px;margin-bottom:8px">' +
          '<input type="radio" name="bp-mode" value="category" style="margin-top:3px">' +
          '<span><b>Set price by category</b><br><span class="muted">Set one price for every test in a chosen category.</span></span>' +
        '</label>' +
        '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;padding:10px;border:2px solid var(--line);border-radius:10px">' +
          '<input type="radio" name="bp-mode" value="percent" style="margin-top:3px">' +
          '<span><b>Percentage change</b><br><span class="muted">Increase or decrease all affected prices by a %.</span></span>' +
        '</label>' +
      '</div>' +
      '<div id="bp-fixedbox">' +
        '<label class="label">New price (Rs)</label>' +
        '<input id="bp-price" class="input" type="number" min="0" step="1" placeholder="e.g. 100">' +
      '</div>' +
      '<div id="bp-catbox" style="display:none">' +
        '<label class="label">Category</label>' +
        '<select id="bp-cat" class="select">' +
          cats.map(function (c) { return '<option>' + App.esc(c) + '</option>'; }).join('') +
        '</select>' +
        '<label class="label" style="margin-top:10px">New price for this category (Rs)</label>' +
        '<input id="bp-catprice" class="input" type="number" min="0" step="1" placeholder="e.g. 150">' +
      '</div>' +
      '<div id="bp-pctbox" style="display:none">' +
        '<label class="label">Percentage (use negative for decrease, e.g. -10)</label>' +
        '<input id="bp-pct" class="input" type="number" step="0.1" placeholder="e.g. 10 for +10%, -10 for -10%">' +
      '</div>' +
      '<div id="bp-count" class="muted" style="font-weight:600"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line);padding-top:14px">' +
        '<button type="button" class="btn btn-ghost" id="bp-cancel">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="bp-apply">Apply</button>' +
      '</div>' +
    '</div>';

  App.modal('💰 Bulk Update Prices', body, { wide: true, onOpen: function (ov, close) {
    var m = lastModal(); if (!m) return;
    m.querySelector('#bp-cancel').addEventListener('click', close);

    function mode() {
      var r = m.querySelector('input[name="bp-mode"]:checked');
      return r ? r.value : 'fixed';
    }
    function affectedCount() {
      var md = mode();
      if (md === 'category') {
        var cat = m.querySelector('#bp-cat').value;
        return DB.all('tests').filter(function (t) { return t.category === cat; }).length;
      }
      return _bulkFilteredTests().length;
    }
    function refreshCount() {
      var md = mode();
      m.querySelector('#bp-fixedbox').style.display = md === 'fixed' ? '' : 'none';
      m.querySelector('#bp-catbox').style.display = md === 'category' ? '' : 'none';
      m.querySelector('#bp-pctbox').style.display = md === 'percent' ? '' : 'none';
      m.querySelector('#bp-count').textContent = 'This will update ' + affectedCount() + ' test(s).';
    }
    Array.prototype.forEach.call(m.querySelectorAll('input[name="bp-mode"]'), function (r) {
      r.addEventListener('change', refreshCount);
    });
    m.querySelector('#bp-cat').addEventListener('change', refreshCount);
    refreshCount();

    m.querySelector('#bp-apply').addEventListener('click', function () {
      var md = mode(), n = affectedCount();
      if (!n) { App.toast('No tests match the current selection.', 'err'); return; }
      var newPrice = null, pct = null, cat = null;

      if (md === 'fixed') {
        newPrice = parseFloat(m.querySelector('#bp-price').value);
        if (isNaN(newPrice) || newPrice < 0) { App.toast('Enter a valid price (0 or more).', 'err'); return; }
      } else if (md === 'category') {
        cat = m.querySelector('#bp-cat').value;
        newPrice = parseFloat(m.querySelector('#bp-catprice').value);
        if (isNaN(newPrice) || newPrice < 0) { App.toast('Enter a valid price (0 or more).', 'err'); return; }
      } else {
        pct = parseFloat(m.querySelector('#bp-pct').value);
        if (isNaN(pct)) { App.toast('Enter a valid percentage.', 'err'); return; }
      }

      var desc = md === 'fixed' ? 'set price to Rs ' + newPrice :
                 md === 'category' ? 'set all "' + cat + '" tests to Rs ' + newPrice :
                 (pct >= 0 ? 'increase' : 'decrease') + ' prices by ' + Math.abs(pct) + '%';
      App.confirm('This will ' + desc + ' for ' + n + ' test(s). Continue?').then(function (ok) {
        if (!ok) return;
        var updated = 0;
        try {
          if (md === 'category') {
            DB.all('tests').forEach(function (t) {
              if (t.category !== cat) return;
              t.price = Math.round(newPrice);
              DB.put('tests', t);
              updated++;
            });
          } else {
            _bulkFilteredTests().forEach(function (t) {
              if (md === 'fixed') {
                t.price = Math.round(newPrice);
              } else {
                t.price = Math.max(0, Math.round((parseFloat(t.price) || 0) * (1 + pct / 100)));
              }
              DB.put('tests', t);
              updated++;
            });
          }
        } catch (e) {
          App.toast('Update failed: ' + (e.message || e), 'err');
          return;
        }
        close();
        App.toast('✅ ' + updated + ' test price(s) updated.');
        drawTestRows(true);
      });
    });
  } });
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
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
        '<select class="select" id="tm-tpl" style="flex:1"><option value="">Load template…</option>' +
        Object.keys(TEST_TEMPLATES).map(function (k) { return '<option value="' + App.esc(k) + '">' + App.esc(k) + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" id="tm-tplgo" class="btn btn-ghost btn-sm">Apply</button>' +
      '</div>' +
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
    '<div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px">' +
      '<button type="button" class="btn btn-ghost" id="tm-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' +
      (isNew ? 'Add Test' : 'Save Changes') + '</button></div>' +
    '</form>';

  App.modal(isNew ? 'Add New Test' : 'Edit Test', body, { onOpen: function (ov, close) {
    var m = lastModal(); if (!m) return;
    m.querySelector('#tm-cancel').addEventListener('click', close);
    var rowsBox = m.querySelector('#tm-prows');
    function addRow(p) {
      rowsBox.insertAdjacentHTML('beforeend', paramRow(p));
      var row = rowsBox.lastElementChild;
      row.querySelector('.tm-prm').addEventListener('click', function () { row.remove(); });
    }
    (t.params || []).forEach(addRow);
    if (!(t.params || []).length) addRow(null);
    m.querySelector('#tm-addp').addEventListener('click', function () { addRow(null); });
    /* template loader: fill parameters from a pre-defined template */
    var tplSel = m.querySelector('#tm-tpl'), tplGo = m.querySelector('#tm-tplgo');
    if (tplGo) tplGo.addEventListener('click', function () {
      var key = tplSel ? tplSel.value : '';
      var tpl = key && TEST_TEMPLATES[key];
      if (!tpl) { App.toast('Select a template first', 'err'); return; }
      rowsBox.innerHTML = '';
      tpl.forEach(function (p) { addRow(p); });
      App.toast(tpl.length + ' parameters loaded from "' + key + '"');
    });

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
      close();
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

  /* ---- month stats for the premium stat row (real data) ---- */
  var mk = currentMonthKey();
  var docs = DB.all('doctors');
  var invsAll = DB.all('invoices');
  var refM = 0, commDue = 0, topId = null, topN = 0;
  var byDoc = {};
  invsAll.forEach(function (i) {
    if (monthKey(i.createdAt) !== mk) return;
    refM++;
    if (i.doctorId) byDoc[i.doctorId] = (byDoc[i.doctorId] || 0) + 1;
  });
  docs.forEach(function (d) {
    var rev = invsAll.filter(function (i) { return i.doctorId === d.id && monthKey(i.createdAt) === mk; })
      .reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var comm = rev * (+d.commissionPct || 0) / 100;
    var paidM = (d.commissionPaid || []).filter(function (x) { return monthKey(x.date) === mk; })
      .reduce(function (s, x) { return s + (+x.amount || 0); }, 0);
    commDue += Math.max(0, comm - paidM);
    var n = byDoc[d.id] || 0;
    if (n > topN) { topN = n; topId = d.id; }
  });
  var topDoc = topId ? DB.get('doctors', topId) : null;
  var mLbl = new Date().toLocaleDateString('en-US', { month: 'long' });
  var docStats =
    dStat(DICONS.doctor, 'brand', 'Total Doctors', docs.length, 'on the referral panel', docs.length, false) +
    dStat(DICONS.refer, 'blue', 'Referrals (This Month)', refM, 'bills referred in ' + mLbl, refM, false) +
    dStat(DICONS.cash, 'amber', 'Commission Due (Month)', App.money(commDue), 'net of paid commission', Math.round(commDue), true) +
    dStat(DICONS.trophy, 'green', 'Top Referrer', topDoc ? App.esc(topDoc.name) : '—',
      topN + ' referral' + (topN === 1 ? '' : 's') + ' this month', null, false,
      'font-size:20px;white-space:normal;line-height:1.25');

  view().innerHTML =
    '<style>' + DOC_STAT_CSS + '</style>' +
    '<div class="stat-grid">' + docStats + '</div>' +
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
  dCountUp();
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
  var close = App.modal('Pay Commission', body, { onOpen: function (root, close) {
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
    '<div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px">' +
      '<button type="button" class="btn btn-ghost" id="dm-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' +
      (isNew ? 'Add Doctor' : 'Save Changes') + '</button></div></form>';

  App.modal(isNew ? 'Add Referral Doctor' : 'Edit Doctor', body, { onOpen: function (ov, close) {
    var m = lastModal(); if (!m) return;
    m.querySelector('#dm-cancel').addEventListener('click', close);
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
      close();
      renderDoctors();
    });
  }});
}

/* ---------- register routes ---------- */

App.route('/tests', renderTests);
App.route('/doctors', renderDoctors);

})();
