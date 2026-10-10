/* ============================================================
   Optix Medical Sync — Masters module (Agent 8)
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
var catalogType = 'all';
var testCatalogMode = 'all';
var testSelection = {};
var testSelectionMode = null;
var testSelectionSession = null;
var testSelectionRevision = 0;
var testMovePending = false;
var testVisibleRows = [];
function catalogTests() {
  return DB.all('tests').filter(function (t) {
    return catalogType === 'all' || (t.type === 'generic' ? 'generic' : 'regular') === catalogType;
  });
}
function openCatalog(type) {
  catalogType = type;
  testCatalogMode = type;
  if (testSelectionMode !== type) { testSelection = {}; testSelectionMode = type; }
  testFilter = { q: '', cat: 'All', status: 'All' };
  renderTests();
}
var docFilter = { q: '' };

/* ============================================================
   #/tests — Test catalog master
   ============================================================ */

function renderTests() {
  var r = sessionRole();
  var cust = (r === 'custom' && App.canPage('tests'));
  if (r !== 'admin' && r !== 'technician' && !cust) { deny(); return; }
  var canEdit = (r === 'admin' || cust);

  var cats = categories();
  var allT = catalogTests();
  /* filter by selected category for stat cards */
  var fT = testFilter.cat === 'All' ? allT : allT.filter(function (t) { return t.category === testFilter.cat; });
  var nActive = fT.filter(function (t) { return t.active !== false; }).length;
  var nPkg = fT.filter(function (t) { return t.isPackage; }).length;
  var catLbl = testFilter.cat === 'All' ? 'in catalog' : 'in ' + testFilter.cat;
  var statCards =
    '<div class="kpi-grid" style="margin-bottom:18px">' +
      '<div class="kpi t-navy" style="border-left:4px solid #0284c7 !important">' +
        '<div class="kpi-ic">' + App.icon('flask', 18) + '</div>' +
        '<div class="kpi-lb">TOTAL TESTS</div>' +
        '<div class="kpi-nm" style="color:#0284c7">' + fT.length + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">tests</span></div>' +
        '<div class="kpi-sb">' + App.esc(catLbl) + '</div>' +
      '</div>' +
      '<div class="kpi t-green" style="border-left:4px solid #16a34a !important">' +
        '<div class="kpi-ic">' + App.icon('check', 18) + '</div>' +
        '<div class="kpi-lb">ACTIVE TESTS</div>' +
        '<div class="kpi-nm" style="color:#16a34a">' + nActive + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">active</span></div>' +
        '<div class="kpi-sb">' + (testFilter.cat === 'All' ? 'Available for booking' : 'Active in ' + App.esc(testFilter.cat)) + '</div>' +
      '</div>' +
      '<div class="kpi t-amber" style="border-left:4px solid #d97706 !important">' +
        '<div class="kpi-ic">' + App.icon('scan', 18) + '</div>' +
        '<div class="kpi-lb">CATEGORIES</div>' +
        '<div class="kpi-nm" style="color:#d97706">' + cats.length + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">categories</span></div>' +
        '<div class="kpi-sb">Organized test groups</div>' +
      '</div>' +
      '<div class="kpi t-purple" style="cursor:pointer;border-left:4px solid #7c3aed !important" onclick="location.hash=\'#/packages\'" title="View Health Packages">' +
        '<div class="kpi-ic">' + App.icon('box', 18) + '</div>' +
        '<div class="kpi-lb">HEALTH PACKAGES</div>' +
        '<div class="kpi-nm" style="color:#7c3aed">' + nPkg + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">deals</span></div>' +
        '<div class="kpi-sb">Screening packages &rarr;</div>' +
      '</div>' +
    '</div>';
  var chips = ['All'].concat(cats).map(function (c) {
    return '<button type="button" class="btn btn-sm ' +
      (testFilter.cat === c ? 'btn-primary' : 'btn-ghost') +
      '" data-cat="' + App.esc(c) + '">' + App.esc(c) + '</button>';
  }).join(' ');

  var testTabs =
    '<div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--bd,#e2e8f0);padding-bottom:10px">' +
      '<a href="#/tests" class="btn btn-sm btn-primary" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">' + App.icon('flask', 15) + ' All Tests Catalog</a>' +
      '<a href="#/packages" class="btn btn-sm btn-secondary" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink)">' + App.icon('box', 15) + ' Health Packages &amp; Deals</a>' +
    '</div>';

  view().innerHTML =
    testTabs +
    statCards +
    '<div class="card"><div class="card-b">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">' +
        '<input id="t-q" class="input search" placeholder="Search code, name, category..." value="' + App.esc(testFilter.q) + '" style="max-width:280px">' +
        '<select id="t-status" class="select" style="max-width:160px">' +
          ['All', 'Active', 'Inactive'].map(function (s) {
            return '<option' + (testFilter.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
        (testCatalogMode === 'all' && canEdit ? '<span style="display:inline-flex;gap:8px;align-items:center;margin-left:8px"><button type="button" class="btn btn-ghost" id="t-move-generic" disabled>Move to Generic</button><button type="button" class="btn btn-ghost" id="t-move-regular" disabled>Move to Regular</button></span>' : '') +
        (canEdit ? '<button type="button" class="btn" id="t-import" style="margin-left:8px;border:2px solid var(--bd)">📥 Import CSV</button>' : '') +
        (canEdit ? '<button type="button" class="btn" id="t-bulkprice" style="margin-left:8px;border:2px solid var(--bd)">💰 Bulk Prices</button>' : '') +
        (canEdit ? '' : '') +
        (canEdit ? '<button type="button" class="btn btn-primary" id="t-add" style="margin-left:auto">+ Add Test</button>' : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px" id="t-chips">' + chips + '</div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr>' +
        (testCatalogMode === 'all' && canEdit ? '<th style="width:34px"><input type="checkbox" id="t-select-all" title="Select all shown"></th>' : '') +
        '<th>Code</th><th>Test Name</th><th>Category</th><th>Sample</th><th>TAT</th>' +
        '<th style="text-align:right">Price</th><th>Status</th><th style="text-align:right">Actions</th>' +
      '</tr></thead><tbody id="t-rows"></tbody></table></div>' +
    '</div></div>' + (testCatalogMode === 'generic' ? genericTemplateBrowser(canEdit) : '');

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
  if (testCatalogMode === 'all' && canEdit) {
    document.getElementById('t-move-generic').addEventListener('click', function () { moveSelectedTests('generic'); });
    document.getElementById('t-move-regular').addEventListener('click', function () { moveSelectedTests('regular'); });
  }
  var templateBox = document.getElementById('generic-template-browser');
  if (templateBox && canEdit) templateBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-template-import]');
    if (b) importGenericTemplate(b.getAttribute('data-template-import'));
  });
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
              active: true, type: catalogType === 'generic' ? 'generic' : 'regular', params: []
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
  testSelectionRevision++;
  var session = localStorage.getItem('labpos_session');
  if (session !== testSelectionSession) testSelection = {};
  testSelectionSession = session;
  var rows = catalogTests().slice().sort(function (a, b) {
    return String(a.code || '').localeCompare(String(b.code || ''));
  }).filter(function (t) {
    if (testFilter.cat !== 'All' && t.category !== testFilter.cat) return false;
    if (testFilter.status === 'Active' && !t.active) return false;
    if (testFilter.status === 'Inactive' && t.active) return false;
    if (q) {
      var h = ((t.code || '') + ' ' + (t.name || '') + ' ' + (t.category || '') + (t.aliases ? (' ' + t.aliases.join(' ')) : '')).toLowerCase();
      if (h.indexOf(q) < 0) return false;
    }
    return true;
  });
  testVisibleRows = rows;

  var visibleIds = {};
  rows.forEach(function (t) { visibleIds[String(t.id)] = true; });
  Object.keys(testSelection).forEach(function (id) { if (!visibleIds[id]) delete testSelection[id]; });
  var classify = testCatalogMode === 'all' && canEdit, colCount = classify ? 9 : 8;
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="' + colCount + '">' + App.empty('No tests found.') + '</td></tr>'; syncTestClassificationControls(rows, classify); return; }

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
    htmlParts.push('<tr class="dept-head"><td colspan="' + colCount + '" style="background:' + (isUncat ? '#fef3c7' : 'var(--brand-soft)') + ';font-weight:800;padding:10px 12px;color:' + (isUncat ? '#92400e' : 'var(--brand)') + ';border-left:4px solid ' + (isUncat ? '#f59e0b' : 'var(--brand)') + '">' +
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
        (classify ? '<td><input type="checkbox" data-test-select="' + App.esc(t.id) + '"' + (testSelection[String(t.id)] ? ' checked' : '') + '></td>' : '') +
        '<td><strong>' + App.esc(t.code || '') + '</strong></td>' +
        '<td>' + App.esc(t.name || '') + (testCatalogMode === 'all' ? (t.type === 'generic' ? ' <span class="badge b-ready">Generic</span>' : ' <span class="badge b-ready">Regular</span>') : '') + (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') +
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

  if (classify) {
    tb.querySelectorAll('[data-test-select]').forEach(function (c) { c.addEventListener('change', function () {
      var id = c.getAttribute('data-test-select'); if (c.checked) testSelection[id] = true; else delete testSelection[id]; drawTestRows(canEdit);
    }); });
  }
  syncTestClassificationControls(rows, classify);

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
      DB.update('tests', t.id, { active: !t.active });
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

function selectedTestIds() { return Object.keys(testSelection).filter(function (id) { return testSelection[id]; }); }
function canClassifyTests() { var r = sessionRole(); return r === 'admin' || (r === 'custom' && App.canPage('tests')); }
function syncTestClassificationControls(rows, classify) {
  if (!classify) return;
  var ids = selectedTestIds(), g = document.getElementById('t-move-generic'), r = document.getElementById('t-move-regular');
  if (g) g.disabled = testMovePending || !ids.length; if (r) r.disabled = testMovePending || !ids.length;
  var all = document.getElementById('t-select-all');
  if (all) {
    all.checked = !!rows.length && rows.every(function (t) { return !!testSelection[String(t.id)]; });
    all.indeterminate = !!ids.length && !all.checked;
    if (!all._classificationBound) {
      all.addEventListener('change', function () { testSelection = {}; if (all.checked) testVisibleRows.forEach(function (t) { testSelection[String(t.id)] = true; }); drawTestRows(canClassifyTests()); });
      all._classificationBound = true;
    }
  }
}
function moveSelectedTests(targetType) {
  if (!canClassifyTests()) { App.toast('You do not have permission to edit tests.', 'err'); return; }
  if (testMovePending || testCatalogMode !== 'all') return;
  var ids = selectedTestIds(); if (!ids.length) { App.toast('No tests selected.', 'err'); return; }
  var session = testSelectionSession, revision = testSelectionRevision, table = document.getElementById('t-rows'), hash = location.hash;
  testMovePending = true; syncTestClassificationControls(catalogTests(), true);
  Promise.resolve().then(function () { return App.confirm('Move ' + ids.length + ' selected test' + (ids.length === 1 ? '' : 's') + ' to ' + (targetType === 'generic' ? 'Generic' : 'Regular') + '?'); }).then(function (ok) {
    if (!ok) return;
    if (!canClassifyTests() || session !== localStorage.getItem('labpos_session') || revision !== testSelectionRevision || hash !== location.hash || table !== document.getElementById('t-rows')) { App.toast('Selection or session changed. Select the tests again.', 'err'); return; }
    var visible = {};
    testVisibleRows.forEach(function (t) { visible[String(t.id)] = true; });
    var updated = 0, failed = 0;
    ids.forEach(function (id) { try {
      if (!visible[id] || !canClassifyTests() || session !== localStorage.getItem('labpos_session')) { failed++; return; }
      var result = DB.update('tests', id, { type: targetType });
      if (!result || result.type !== targetType) failed++; else { updated++; delete testSelection[id]; }
    } catch (e) { failed++; } });
    App.toast(updated + ' test' + (updated === 1 ? '' : 's') + ' moved to ' + (targetType === 'generic' ? 'Generic' : 'Regular') + '.' + (failed ? ' ' + failed + ' could not be confirmed; review the catalog.' : ''), failed ? 'err' : 'ok');
  }).catch(function () { App.toast('Move could not be confirmed. Review the catalog before retrying.', 'err'); }).then(function () {
    testMovePending = false; if (table === document.getElementById('t-rows') && hash === location.hash) drawTestRows(canClassifyTests());
  });
}

function paramRow(p) {
  p = p || {};
  var ptype = p.type || (/\d/.test(String(p.ref || '')) || !p.ref ? 'number' : 'text');
  return '<div class="tm-prow" style="display:grid;grid-template-columns:1fr 120px 1fr 36px;gap:8px;margin-bottom:8px">' +
    '<input class="input tm-pn" placeholder="Parameter (e.g. Hemoglobin)" value="' + App.esc(p.name || '') + '">' +
    App.unitSelect('tm-pu', p.unit) +
    '<div style="display:flex;gap:4px"><input class="input tm-pr" style="min-width:0" placeholder="Reference range" value="' + App.esc(p.ref || '') + '">' + App.refPresetSelect() + '</div>' +
    '<button type="button" class="btn btn-ghost btn-sm tm-prm" title="Remove">✕</button>' +
    '<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:-2px">' +
      '<input class="input tm-pm" placeholder="Male range (optional)" value="' + App.esc(p.refMale || '') + '">' +
      '<input class="input tm-pf" placeholder="Female range (optional)" value="' + App.esc(p.refFemale || '') + '">' +
      '<input class="input tm-pc" placeholder="Child &lt; 13 yrs (optional)" value="' + App.esc(p.refChild || '') + '">' +
      '<select class="input tm-pt" title="Result type: Number = typed number; Text / menu = pick from a menu (Positive / Negative ...)"><option value="number"' + (ptype === 'number' ? ' selected' : '') + '>Number</option><option value="text"' + (ptype === 'text' ? ' selected' : '') + '>Text / menu</option></select>' +
    '</div>' +
  '</div>';
}

/* Pre-defined parameter templates for common tests (from standard lab reference ranges) */
var TEST_TEMPLATES = {
  'CBC': [
    { name: 'Hb', unit: 'g/dl', ref: '11.5 - 16', refMale: '13.0 - 17.0', refFemale: '12.0 - 15.0', type: 'number' },
    { name: 'Total RBC', unit: 'x10^12/l', ref: '4 - 6', refMale: '4.5 - 5.5', refFemale: '3.8 - 4.8', type: 'number' },
    { name: 'HCT', unit: '%', ref: '36 - 46', refMale: '40 - 50', refFemale: '36 - 46', type: 'number' },
    { name: 'MCV', unit: 'fl', ref: '75 - 95', type: 'number' },
    { name: 'MCH', unit: 'pg', ref: '26 - 32', type: 'number' },
    { name: 'MCHC', unit: 'g/dl', ref: '30 - 35', type: 'number' },
    { name: 'Platelet Count', unit: 'x10^9/l', ref: '150 - 400', type: 'number' },
    { name: 'WBC Count (TLC)', unit: 'x10^9/l', ref: '4 - 11', type: 'number' },
    { name: 'Neutrophils', unit: '%', ref: '40 - 75', type: 'number' },
    { name: 'Lymphocytes', unit: '%', ref: '20 - 50', type: 'number' },
    { name: 'Monocytes', unit: '%', ref: '02 - 10', type: 'number' },
    { name: 'Eosinophils', unit: '%', ref: '01 - 06', type: 'number' }
  ],
  'Lipid Profile': [
    { name: 'Total Cholesterol', unit: 'mg/dL', ref: '< 200', type: 'number' },
    { name: 'Triglycerides', unit: 'mg/dL', ref: '< 150', type: 'number' },
    { name: 'HDL Cholesterol', unit: 'mg/dL', ref: '40 - 60', refMale: '40 - 60', refFemale: '50 - 70', type: 'number' },
    { name: 'LDL Cholesterol', unit: 'mg/dL', ref: '< 100', type: 'number' },
    { name: 'VLDL', unit: 'mg/dL', ref: '2 - 30', type: 'number' }
  ],
  'Liver Function (LFT)': [
    { name: 'Total Bilirubin', unit: 'mg/dL', ref: '0.3 - 1.2', type: 'number' },
    { name: 'Direct Bilirubin', unit: 'mg/dL', ref: '0.0 - 0.3', type: 'number' },
    { name: 'SGPT (ALT)', unit: 'U/L', ref: '7 - 56', refMale: '7 - 41', refFemale: '7 - 33', type: 'number' },
    { name: 'SGOT (AST)', unit: 'U/L', ref: '10 - 40', refMale: '10 - 40', refFemale: '10 - 32', type: 'number' },
    { name: 'Alkaline Phosphatase', unit: 'U/L', ref: '44 - 147', refMale: '40 - 129', refFemale: '35 - 104', type: 'number' },
    { name: 'Total Protein', unit: 'g/dL', ref: '6.0 - 8.3', type: 'number' },
    { name: 'Albumin', unit: 'g/dL', ref: '3.5 - 5.5', type: 'number' }
  ],
  'Kidney Function (RFT)': [
    { name: 'Urea', unit: 'mg/dL', ref: '15 - 45', type: 'number' },
    { name: 'Creatinine', unit: 'mg/dL', ref: '0.6 - 1.2', refMale: '0.7 - 1.3', refFemale: '0.6 - 1.1', type: 'number' },
    { name: 'Uric Acid', unit: 'mg/dL', ref: '3.5 - 7.2', refMale: '3.5 - 7.2', refFemale: '2.6 - 6.0', type: 'number' },
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
    { name: 'Serum Iron', unit: 'ug/dL', ref: '60 - 170', refMale: '65 - 175', refFemale: '50 - 170', type: 'number' },
    { name: 'TIBC', unit: 'ug/dL', ref: '240 - 450', type: 'number' },
    { name: 'Ferritin', unit: 'ng/mL', ref: '15 - 150', refMale: '24 - 336', refFemale: '11 - 307', type: 'number' }
  ],
  'Cardiac Enzymes': [
    { name: 'CK-MB', unit: 'ng/mL', ref: '0 - 5', type: 'number' },
    { name: 'Troponin I', unit: 'ng/mL', ref: '< 0.04', type: 'number' }
  ]
};

function genericTemplateBrowser(canEdit) {
  return '<div class="card" id="generic-template-browser"><div class="card-h"><h3>Generic Test Templates</h3></div><div class="card-b"><p class="muted">Reusable definitions remain separate from saved tests. Import one to create a saved Generic test.</p><div class="tbl-wrap"><table class="table"><thead><tr><th>Template</th><th>Parameters</th><th>Action</th></tr></thead><tbody>' +
    Object.keys(TEST_TEMPLATES).map(function (key) {
      var exists = DB.all('tests').some(function (t) { return t.templateKey === key || t.name === key; });
      return '<tr><td>' + App.esc(key) + '</td><td>' + TEST_TEMPLATES[key].length + '</td><td>' +
        (exists ? '<span class="muted">Already in catalog</span>' : (canEdit ? '<button type="button" class="btn btn-ghost btn-sm" data-template-import="' + App.esc(key) + '">Import</button>' : '<span class="muted">Admin can import</span>')) +
        '</td></tr>';
    }).join('') + '</tbody></table></div></div></div>';
}
function importGenericTemplate(key) {
  if (sessionRole() !== 'admin') { App.toast('Only an administrator can import templates.', 'err'); return; }
  if (!Object.prototype.hasOwnProperty.call(TEST_TEMPLATES, key)) return;
  if (DB.all('tests').some(function (t) { return t.templateKey === key || t.name === key; })) { App.toast('This template already has a saved test.', 'info'); return; }
  testModal({ code: 'GEN-' + key.toUpperCase().replace(/[^A-Z0-9]+/g, '-'), name: key, category: 'General', price: 0,
    sampleType: key.indexOf('Urine') === 0 ? 'Urine' : 'Blood', tat: 'Same day', active: true, type: 'generic', templateKey: key,
    params: JSON.parse(JSON.stringify(TEST_TEMPLATES[key])) });
}

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
  t = t || { code: '', name: '', category: '', price: '', type: catalogType === 'generic' ? 'generic' : 'regular', sampleType: 'Blood', tat: 'Same day', active: true, params: [] };
  var cats = categories();
  var sampleOpts = App.optionsHtml('sampleType', t.sampleType || '');

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
      '<div><label class="label">Remind to repeat after (days)</label><input id="tm-retest" class="input" type="number" min="0" step="1" value="' + App.esc(t.retestDays ? String(t.retestDays) : '') + '" placeholder="e.g. 90 (optional)"><div class="muted" style="font-size:12px;margin-top:3px">Used by WhatsApp &rarr; Automatic messages &rarr; repeat-test reminder.</div></div>' +
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
    '<div style="margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:10px 12px"><label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer"><input id="tm-out" type="checkbox"' + (t.outsourced ? ' checked' : '') + '> Outsourced &mdash; sent to another (reference) lab</label>' +
      '<div id="tm-outbox" style="display:' + (t.outsourced ? 'grid' : 'none') + ';grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px">' +
        '<div><label class="label">Reference lab *</label><select id="tm-reflab" class="select"><option value="">Choose&hellip;</option>' + (DB.all('ref_labs') || []).filter(function (x) { return x.active !== false || x.id === t.refLabId; }).map(function (x) { return '<option value="' + App.esc(x.id) + '"' + (t.refLabId === x.id ? ' selected' : '') + '>' + App.esc(x.name) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="label">What they charge us (Rs)</label><input id="tm-refcost" class="input" type="number" min="0" step="any" value="' + App.esc(t.refCost == null ? '' : String(t.refCost)) + '"></div>' +
        '<div><label class="label">Result takes (days)</label><input id="tm-reftat" class="input" type="number" min="0" step="1" value="' + App.esc(t.refTatDays ? String(t.refTatDays) : '') + '" placeholder="e.g. 3"></div>' +
        '<div class="muted" style="grid-column:1/-1;font-size:12px">Add reference labs in <b>Outsourced &rarr; Reference labs</b>. Every bill with this test then appears in the Outsourced dashboard.</div></div></div>' +
    '<div style="margin-top:14px"><label class="label">Stock used per test <span class="muted" style="font-weight:400">(optional &mdash; taken off your stock automatically when a result is saved)</span></label>' +
      '<div id="tm-cons"></div><button type="button" id="tm-addc" class="btn btn-ghost btn-sm">+ Add stock item</button>' +
      '<div class="muted" id="tm-nocons" style="font-size:12.5px;margin-top:4px" hidden>No stock items yet &mdash; add them in <b>Stock</b> first.</div></div>' +
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

  App.modal(isNew ? 'Add New Test' : 'Edit Test', body, { wide: true, onOpen: function (ov, close) {
    var m = lastModal(); if (!m) return;
    m.querySelector('#tm-cancel').addEventListener('click', close);
    m.querySelector('#tm-out').addEventListener('change', function () { m.querySelector('#tm-outbox').style.display = this.checked ? 'grid' : 'none'; });
    var rowsBox = m.querySelector('#tm-prows');
    function addRow(p) {
      rowsBox.insertAdjacentHTML('beforeend', paramRow(p));
      var row = rowsBox.lastElementChild;
      row.querySelector('.tm-prm').addEventListener('click', function () { row.remove(); });
    }
    (t.params || []).forEach(addRow);
    if (!(t.params || []).length) addRow(null);
    m.querySelector('#tm-addp').addEventListener('click', function () { addRow(null); });
    /* stock used per test: [item][quantity][remove] rows */
    var consBox = m.querySelector('#tm-cons'), stockItems = (DB.all('stock_items') || []).filter(function (i) { return i.active !== false; });
    function addCons(c) {
      c = c || {};
      var sel = stockItems.map(function (i) { return '<option value="' + App.esc(i.id) + '"' + (i.id === c.itemId ? ' selected' : '') + '>' + App.esc(i.name) + ' (' + App.esc(i.unit || '') + ')</option>'; }).join('');
      consBox.insertAdjacentHTML('beforeend', '<div class="tm-crow" style="display:grid;grid-template-columns:1fr 110px 36px;gap:8px;margin-bottom:8px"><select class="select tm-ci">' + sel + '</select>' +
        '<input class="input tm-cq" type="number" min="0" step="any" placeholder="Qty per test" value="' + App.esc(c.qty == null ? '' : c.qty) + '"><button type="button" class="btn btn-ghost btn-sm tm-crm" title="Remove">✕</button></div>');
      var row = consBox.lastElementChild; row.querySelector('.tm-crm').addEventListener('click', function () { row.remove(); });
    }
    (t.consumes || []).forEach(function (c) { if (stockItems.some(function (i) { return i.id === c.itemId; })) addCons(c); });
    m.querySelector('#tm-addc').addEventListener('click', function () { if (!stockItems.length) { m.querySelector('#tm-nocons').hidden = false; return; } addCons(null); });
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
      if (m.querySelector('#tm-out').checked && !m.querySelector('#tm-reflab').value) { App.toast('Choose the reference lab for an outsourced test (add one in Outsourced → Reference labs first).', 'err'); return; }
      var params = [];
      rowsBox.querySelectorAll('.tm-prow').forEach(function (row) {
        var pn = row.querySelector('.tm-pn').value.trim();
        if (!pn) return;
        var pobj = {
          name: pn,
          unit: row.querySelector('.tm-pu').value.trim(),
          ref: row.querySelector('.tm-pr').value.trim()
        };
        var ptEl = row.querySelector('.tm-pt'); if (ptEl) pobj.type = ptEl.value;
        [['.tm-pm', 'refMale'], ['.tm-pf', 'refFemale'], ['.tm-pc', 'refChild']].forEach(function (x) {
          var v = row.querySelector(x[0]).value.trim(); if (v) pobj[x[1]] = v;
        });
        params.push(pobj);
      });
      var consumes = [];
      Array.prototype.forEach.call(m.querySelectorAll('.tm-crow'), function (r) { var q = +r.querySelector('.tm-cq').value, id = r.querySelector('.tm-ci').value; if (id && q > 0) consumes.push({ itemId: id, qty: q }); });
      var data = {
        type: t.type === 'generic' ? 'generic' : 'regular',
        code: code, name: name, category: category, price: price, consumes: consumes,
        sampleType: m.querySelector('#tm-sample').value,
        tat: m.querySelector('#tm-tat').value.trim() || 'Same day',
        retestDays: Math.max(0, parseInt(m.querySelector('#tm-retest').value, 10) || 0),
        outsourced: m.querySelector('#tm-out').checked,
        outsourcedAt: m.querySelector('#tm-out').checked ? (t.outsourced && t.outsourcedAt ? t.outsourcedAt : new Date().toISOString()) : (t.outsourcedAt || ''),
        refLabId: m.querySelector('#tm-out').checked ? m.querySelector('#tm-reflab').value : '',
        refCost: Math.max(0, parseFloat(m.querySelector('#tm-refcost').value) || 0),
        refTatDays: Math.max(0, parseInt(m.querySelector('#tm-reftat').value, 10) || 0),
        active: m.querySelector('#tm-active').checked,
        params: params,
        isPackage: isPkgEl.checked,
        includes: isPkgEl.checked ? Object.keys(picked).filter(function (id) { return picked[id]; }) : []
      };
      if (t.templateKey !== undefined) data.templateKey = t.templateKey;
      if (data.isPackage && !data.includes.length) { App.toast('Select at least one test for the package.', 'err'); return; }
      if (isNew) { DB.insert('tests', data); App.toast('Test added.'); }
      else { DB.update('tests', t.id, data); App.toast('Test updated.'); }
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
  if (r !== 'admin' && r !== 'reception' && !(r === 'custom' && App.canPage('doctors'))) { deny(); return; }
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
  var tById = App.testsById();
  docs.forEach(function (d) {
    var mineD = invsAll.filter(function (i) { return i.doctorId === d.id && monthKey(i.createdAt) === mk; });
    var rev = mineD.reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var comm = mineD.reduce(function (s, i) { return s + App.commissionOf(i, d, tById); }, 0);
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
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><input id="d-q" class="input search" placeholder="Search name, clinic, phone..." value="' + App.esc(docFilter.q) + '" style="max-width:280px">' +
      '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
        '<button type="button" class="btn btn-secondary" id="d-stmt" style="background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink);font-weight:600;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,.04)">' + App.icon('file', 15) + ' Monthly Statements</button>' +
        '<button type="button" class="btn btn-primary" id="d-add">+ Add Doctor</button>' +
      '</div></div>' +
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
  document.getElementById('d-stmt').addEventListener('click', function () { openStatement(''); });

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
    var h = ((d.name || '') + ' ' + (d.clinic || '') + ' ' + (d.phone || '') + ' ' + (d.whatsapp || '')).toLowerCase();
    return h.indexOf(q) >= 0;
  });

  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7">' + App.empty('No doctors found.') + '</td></tr>'; return; }

  var tById2 = App.testsById();
  tb.innerHTML = rows.map(function (d) {
    var mine = invs.filter(function (i) { return i.doctorId === d.id && monthKey(i.createdAt) === mk; });
    var rev = mine.reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var comm = mine.reduce(function (s, i) { return s + App.commissionOf(i, d, tById2); }, 0);
    var paidM = (d.commissionPaid || []).filter(function (x) { return monthKey(x.date) === mk; })
      .reduce(function (s, x) { return s + (+x.amount || 0); }, 0);
    var dueM = Math.max(0, comm - paidM);
    return '<tr>' +
      '<td><strong>' + App.esc(d.name || '') + '</strong></td>' +
      '<td>' + App.esc(d.clinic || '—') + '</td>' +
      '<td>' + App.esc(d.phone || '—') + (d.whatsapp ? '<div style="font-size:11.5px;color:var(--green)">💬 ' + App.esc(d.whatsapp) + '</div>' : '') + '</td>' +
      '<td style="text-align:right">' + App.esc(String(d.commissionPct == null ? 0 : d.commissionPct)) + '%' + ((d.commissionRules || []).length ? '<div class="muted" style="font-size:11px">+ ' + d.commissionRules.length + ' special rate' + (d.commissionRules.length === 1 ? '' : 's') + '</div>' : '') + '</td>' +
      '<td style="text-align:right"><strong>' + mine.length + '</strong></td>' +
      '<td style="text-align:right"><strong>' + App.money(comm) + '</strong>' +
        (paidM > 0 ? '<div style="font-size:11.5px;color:var(--green)">Paid ' + App.money(paidM) + '</div>' : '') +
        (dueM > 0 ? '<div style="font-size:11.5px;color:var(--red);font-weight:700">Due ' + App.money(dueM) + '</div>' : '') + '</td>' +
      '<td style="text-align:right"><div class="actions">' +
        (dueM > 0 ? '<button type="button" class="btn btn-primary btn-sm" data-pay="' + App.esc(d.id) + '" data-due="' + dueM + '">Pay</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-stmt="' + App.esc(d.id) + '">Statement</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + App.esc(d.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-del="' + App.esc(d.id) + '" title="Delete">✕</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  tb.querySelectorAll('[data-pay]').forEach(function (b) {
    b.addEventListener('click', function () { openCommissionPay(b.getAttribute('data-pay'), parseFloat(b.getAttribute('data-due')) || 0); });
  });

  tb.querySelectorAll('[data-stmt]').forEach(function (b) { b.addEventListener('click', function () { openStatement(b.getAttribute('data-stmt')); }); });
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

function openStatement(docId) {
  if (App.doctorStatement) { App.doctorStatement(docId); return; }
  App.loadScript('assets/js/mod-statements.js').then(function () { App.doctorStatement(docId); }, function () { App.toast('Could not load the statement', 'err'); });
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
  d = d || { name: '', clinic: '', phone: '', whatsapp: '', commissionPct: 10 };

  var body =
    '<form id="dm-form"><div class="form-grid">' +
      '<div><label class="label">Doctor Name *</label><input id="dm-name" class="input" value="' + App.esc(d.name || '') + '" placeholder="e.g. Dr. Ahmed Khan" required></div>' +
      '<div><label class="label">Clinic / Hospital</label><input id="dm-clinic" class="input" value="' + App.esc(d.clinic || '') + '"></div>' +
      '<div><label class="label">Phone</label><input id="dm-phone" class="input" value="' + App.esc(d.phone || '') + '" placeholder="03xx-xxxxxxx"></div>' +
      '<div><label class="label">WhatsApp No.</label><input id="dm-wa" class="input" value="' + App.esc(d.whatsapp || '') + '" placeholder="03xxxxxxxxx"></div>' +
      '<div><label class="label">Email</label><input id="dm-email" class="input" type="email" maxlength="80" value="' + App.esc(d.email || '') + '" placeholder="doctor@mail.com (to email reports)"></div>' +
      '<div><label class="label">Commission % *</label><input id="dm-comm" class="input" type="number" min="0" max="100" step="0.5" value="' + App.esc(String(d.commissionPct == null ? '' : d.commissionPct)) + '" required></div>' +
    '</div>' +
    '<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px"><label class="label">Special rates <span class="muted" style="font-weight:400">(optional &mdash; a different % for a particular test or category; everything else uses the % above)</span></label>' +
      '<div id="dm-rules"></div><button type="button" id="dm-addr" class="btn btn-ghost btn-sm">+ Add special rate</button>' +
      '<div class="muted" id="dm-rnote" style="font-size:12.5px;margin-top:6px">Example: <b>CBC &rarr; 10%</b>, <b>MRI &rarr; 20%</b>. A test rate beats a category rate.</div></div>' +
    '<div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px">' +
      '<button type="button" class="btn btn-ghost" id="dm-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' +
      (isNew ? 'Add Doctor' : 'Save Changes') + '</button></div></form>';

  App.modal(isNew ? 'Add Referral Doctor' : 'Edit Doctor', body, { onOpen: function (ov, close) {
    var m = lastModal(); if (!m) return;
    m.querySelector('#dm-cancel').addEventListener('click', close);
    /* special rates: [what][%][remove] rows; "what" is a test or a whole category */
    var rulesBox = m.querySelector('#dm-rules'), allTests = (DB.all('tests') || []).filter(function (t) { return t.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var cats = []; allTests.forEach(function (t) { if (t.category && cats.indexOf(t.category) < 0) cats.push(t.category); }); cats.sort();
    function addRule(r) {
      r = r || {};
      var cur = (r.type === 'category' ? 'c:' : 't:') + (r.key || '');
      var opts = '<option value="">Choose test or category…</option>' +
        '<optgroup label="Category (all tests in it)">' + cats.map(function (c) { return '<option value="c:' + App.esc(c) + '"' + (cur === 'c:' + c ? ' selected' : '') + '>' + App.esc(c) + ' (all)</option>'; }).join('') + '</optgroup>' +
        '<optgroup label="Single test">' + allTests.map(function (t) { return '<option value="t:' + App.esc(t.id) + '"' + (cur === 't:' + t.id ? ' selected' : '') + '>' + App.esc(t.name) + '</option>'; }).join('') + '</optgroup>';
      rulesBox.insertAdjacentHTML('beforeend', '<div class="dm-rule" style="display:flex;gap:8px;margin-bottom:8px;align-items:center"><select class="select dm-rk" style="flex:1;min-width:0">' + opts + '</select>' +
        '<input class="input dm-rp" type="number" min="0" max="100" step="0.5" style="width:90px" placeholder="%" value="' + (r.pct == null ? '' : App.esc(String(r.pct))) + '"><span class="muted">%</span><button type="button" class="btn btn-ghost btn-sm dm-rx" title="Remove">&times;</button></div>');
      var row = rulesBox.lastElementChild; row.querySelector('.dm-rx').addEventListener('click', function () { row.remove(); });
    }
    (d.commissionRules || []).forEach(addRule);
    m.querySelector('#dm-addr').addEventListener('click', function () { addRule(null); });
    m.querySelector('#dm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = m.querySelector('#dm-name').value.trim();
      var comm = parseFloat(m.querySelector('#dm-comm').value);
      if (!name) { App.toast('Doctor name is required.', 'err'); return; }
      if (isNaN(comm) || comm < 0 || comm > 100) { App.toast('Commission must be between 0 and 100%.', 'err'); return; }
      var rules = [], seenR = {}, badR = false;
      Array.prototype.forEach.call(m.querySelectorAll('.dm-rule'), function (row) {
        var k = row.querySelector('.dm-rk').value, v = parseFloat(row.querySelector('.dm-rp').value);
        if (!k && isNaN(v)) return;
        if (!k || isNaN(v) || v < 0 || v > 100) { badR = true; return; }
        if (seenR[k]) { badR = true; return; } seenR[k] = 1;
        rules.push({ type: k.charAt(0) === 'c' ? 'category' : 'test', key: k.slice(2), pct: v });
      });
      if (badR) { App.toast('Each special rate needs a test/category (once) and a % between 0 and 100.', 'err'); return; }
      var data = {
        commissionRules: rules,
        name: name,
        clinic: m.querySelector('#dm-clinic').value.trim(),
        phone: m.querySelector('#dm-phone').value.trim(),
        whatsapp: m.querySelector('#dm-wa').value.trim(),
        email: m.querySelector('#dm-email').value.trim(),
        commissionPct: comm
      };
      if (isNew) { DB.insert('doctors', data); App.toast('Doctor added.'); }
      else { DB.update('doctors', d.id, data); App.toast('Doctor updated.'); }
      close();
      renderDoctors();
    });
  }});
}

/* ============================================================
   #/packages — Health Packages & Screening Deals Center
   ============================================================ */

var pkgFilter = { q: '', cat: 'all', status: 'all' };

function renderPackages() {
  var r = sessionRole();
  if (r !== 'admin' && r !== 'reception' && !(r === 'custom' && App.canPage('tests'))) { deny(); return; }

  var allTests = DB.all('tests') || [];
  var testMap = {};
  allTests.forEach(function (t) { testMap[t.id] = t; });

  var pkgs = allTests.filter(function (t) { return t.isPackage; });
  var activePkgs = pkgs.filter(function (p) { return p.active !== false; });

  var allInvoices = DB.all('invoices') || [];
  var pkgBilledCount = 0;
  allInvoices.forEach(function (iv) {
    (iv.items || []).forEach(function (it) {
      if (it.testId && testMap[it.testId] && testMap[it.testId].isPackage) {
        pkgBilledCount++;
      }
    });
  });

  /* Calculate covered tests and average savings */
  var uniqueCovered = {};
  var totalRegPrice = 0;
  var totalDealPrice = 0;
  activePkgs.forEach(function (p) {
    totalDealPrice += (+p.price || 0);
    var regSum = 0;
    (p.includes || []).forEach(function (tid) {
      uniqueCovered[tid] = true;
      var subT = testMap[tid];
      if (subT) regSum += (+subT.price || 0);
    });
    totalRegPrice += regSum;
  });

  var avgSavingsPct = totalRegPrice > 0 ? Math.round(((totalRegPrice - totalDealPrice) / totalRegPrice) * 100) : 0;
  if (avgSavingsPct < 0) avgSavingsPct = 0;

  var coveredCount = Object.keys(uniqueCovered).length;

  /* Categories present in packages */
  var pkgCats = ['all'];
  pkgs.forEach(function (p) {
    if (p.category && pkgCats.indexOf(p.category) < 0) pkgCats.push(p.category);
  });

  /* Filter packages */
  var filtered = pkgs.filter(function (p) {
    if (pkgFilter.status === 'active' && p.active === false) return false;
    if (pkgFilter.status === 'inactive' && p.active !== false) return false;
    if (pkgFilter.cat !== 'all' && p.category !== pkgFilter.cat) return false;
    if (pkgFilter.q) {
      var q = pkgFilter.q.toLowerCase();
      var inName = (p.name || '').toLowerCase().indexOf(q) >= 0;
      var inCode = (p.code || '').toLowerCase().indexOf(q) >= 0;
      var inBadge = (p.dealBadge || '').toLowerCase().indexOf(q) >= 0;
      var inIncludes = (p.includes || []).some(function (tid) {
        var it = testMap[tid];
        return it && (it.name.toLowerCase().indexOf(q) >= 0 || (it.code && it.code.toLowerCase().indexOf(q) >= 0));
      });
      if (!inName && !inCode && !inBadge && !inIncludes) return false;
    }
    return true;
  });

  var html = ''
    + '<style>'
    + '.pkg-dash { max-width: 1300px; margin: 0 auto; }'
    + '.pkg-head-bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }'
    + '.pkg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; margin-bottom: 24px; }'
    + '.pkg-card { background: #fff; border: 1.5px solid var(--bd); border-radius: 16px; padding: 18px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(15,23,42,.04); transition: transform .18s, box-shadow .18s, border-color .18s; position: relative; overflow: hidden; }'
    + '.pkg-card:hover { border-color: #38bdf8; box-shadow: 0 8px 24px rgba(14,165,233,.12); transform: translateY(-2px); }'
    + '.pkg-card.is-inactive { opacity: .68; background: #f8fafc; border-style: dashed; }'
    + '.pkg-card.is-inactive:hover { opacity: .9; transform: none; }'
    + '.pkg-badge-deal { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: .05em; display: inline-flex; align-items: center; gap: 4px; }'
    + '.pkg-inc-tag { display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 8px; font-size: 11.5px; font-weight: 600; margin: 3px 4px 3px 0; color: #334155; transition: background .12s; }'
    + '.pkg-inc-tag:hover { background: #e2e8f0; }'
    + '.pkg-price-bar { background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1.5px solid #86efac; border-radius: 12px; padding: 12px 14px; margin: 14px 0 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }'
    + '</style>'
    + '<div class="pkg-dash">'
    + '<div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--bd,#e2e8f0);padding-bottom:10px">'
    +   '<a href="#/tests" class="btn btn-sm btn-secondary" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink)">' + App.icon('flask', 15) + ' All Tests Catalog</a>'
    +   '<a href="#/packages" class="btn btn-sm btn-primary" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">' + App.icon('box', 15) + ' Health Packages &amp; Deals</a>'
    + '</div>'

    /* 4 Unified KPI Stat Cards (.kpi-grid + .kpi) */
    + '<div class="kpi-grid" style="margin-bottom:18px">'
    +   '<div class="kpi t-navy" style="cursor:pointer;border-left:4px solid #0284c7 !important" id="kpiPkgAll" title="Click to view all packages">'
    +     '<div class="kpi-ic">' + App.icon('box', 18) + '</div>'
    +     '<div class="kpi-lb">TOTAL HEALTH PACKAGES</div>'
    +     '<div class="kpi-nm" style="color:#0284c7">' + pkgs.length + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">packages</span></div>'
    +     '<div class="kpi-sb">' + activePkgs.length + ' currently active deals</div>'
    +   '</div>'

    +   '<div class="kpi t-green" style="cursor:pointer;border-left:4px solid #16a34a !important" id="kpiPkgActive" title="Click to filter active deals">'
    +     '<div class="kpi-ic">' + App.icon('check', 18) + '</div>'
    +     '<div class="kpi-lb">ACTIVE PROMOTIONS</div>'
    +     '<div class="kpi-nm" style="color:#16a34a">' + activePkgs.length + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">active</span></div>'
    +     '<div class="kpi-sb">Available on billing counter</div>'
    +   '</div>'

    +   '<div class="kpi t-amber" style="border-left:4px solid #d97706 !important">'
    +     '<div class="kpi-ic">' + App.icon('coins', 18) + '</div>'
    +     '<div class="kpi-lb">AVERAGE PATIENT SAVINGS</div>'
    +     '<div class="kpi-nm" style="color:#d97706">' + (avgSavingsPct > 0 ? '~' + avgSavingsPct + '%' : '0%') + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">SAVINGS</span></div>'
    +     '<div class="kpi-sb">' + coveredCount + ' tests covered across deals</div>'
    +   '</div>'

    +   '<div class="kpi t-purple" style="border-left:4px solid #7c3aed !important">'
    +     '<div class="kpi-ic">' + App.icon('file', 18) + '</div>'
    +     '<div class="kpi-lb">PACKAGE BILLINGS</div>'
    +     '<div class="kpi-nm" style="color:#7c3aed">' + pkgBilledCount + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">orders</span></div>'
    +     '<div class="kpi-sb">Booked in patient invoices</div>'
    +   '</div>'
    + '</div>'

    /* Filter Toolbar */
    + '<div class="card" style="margin-bottom:20px"><div class="card-b" style="padding:12px 16px">'
    +   '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'
    +     '<input class="input search" id="pkgSearch" placeholder="Search package name, code, or included test..." value="' + App.esc(pkgFilter.q) + '" style="max-width:300px;flex:1 1 220px">'
    +     '<div style="display:flex;gap:8px;align-items:center">'
    +       '<span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase">Category:</span>'
    +       '<select class="select" id="pkgCatSelect" style="width:auto;padding:5px 10px;font-size:13px">'
    +         pkgCats.map(function (c) {
                return '<option value="' + App.esc(c) + '"' + (pkgFilter.cat === c ? ' selected' : '') + '>'
                  + (c === 'all' ? 'All Categories' : App.esc(c)) + '</option>';
              }).join('')
    +       '</select>'
    +     '</div>'
    +     '<div style="display:flex;gap:8px;align-items:center">'
    +       '<span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase">Status:</span>'
    +       '<select class="select" id="pkgStatusSelect" style="width:auto;padding:5px 10px;font-size:13px">'
    +         '<option value="all"' + (pkgFilter.status === 'all' ? ' selected' : '') + '>All Status</option>'
    +         '<option value="active"' + (pkgFilter.status === 'active' ? ' selected' : '') + '>Active Only</option>'
    +         '<option value="inactive"' + (pkgFilter.status === 'inactive' ? ' selected' : '') + '>Inactive Only</option>'
    +       '</select>'
    +     '</div>'
    +     '<div style="display:flex;gap:8px;align-items:center;margin-left:auto;flex-wrap:wrap">'
    +       '<button class="btn btn-ghost btn-sm" id="pkgResetFilter">Clear Filters</button>'
    +       '<button class="btn btn-ghost btn-sm" id="pkgSeedBtn">⚡ Quick Seed Premier Deals</button>'
    +       '<button class="btn btn-primary btn-sm" id="pkgAddBtn">+ Create Health Package</button>'
    +     '</div>'
    +   '</div>'
    + '</div></div>';

  if (!filtered.length) {
    html += '<div class="card"><div class="card-b" style="text-align:center;padding:48px 20px">'
      + '<div style="font-size:44px;margin-bottom:12px">🎁</div>'
      + '<h3 style="margin:0 0 6px">No Health Packages Found</h3>'
      + '<p class="muted" style="margin:0 0 18px;max-width:480px;margin-left:auto;margin-right:auto">'
      + (pkgs.length ? 'No health packages match your current search and filter criteria.' : 'No health screening packages created yet. Click below to automatically seed 6 popular Pakistani lab packages or create your custom deal.')
      + '</p>'
      + '<div style="display:flex;gap:10px;justify-content:center">'
      +   '<button class="btn btn-primary" id="pkgEmptySeedBtn">⚡ Quick Seed Premier Packages</button>'
      +   '<button class="btn btn-ghost" id="pkgEmptyAddBtn">+ Create Custom Package</button>'
      + '</div>'
      + '</div></div></div>';
    view().innerHTML = html;
    wirePackagesEvents();
    return;
  }

  /* Render Package Cards */
  var THEMES = [
    { border: '#0284c7', bg: '#f0f9ff', tagBg: '#e0f2fe', tagColor: '#0369a1', badgeBg: '#e0f2fe', badgeColor: '#0284c7', badgeBd: '#bae6fd', btnBg: '#0284c7' }, // Sky Blue
    { border: '#16a34a', bg: '#f0fdf4', tagBg: '#dcfce7', tagColor: '#15803d', badgeBg: '#dcfce7', badgeColor: '#15803d', badgeBd: '#bbf7d0', btnBg: '#16a34a' }, // Emerald Green
    { border: '#7c3aed', bg: '#faf5ff', tagBg: '#f3e8ff', tagColor: '#6b21a8', badgeBg: '#f3e8ff', badgeColor: '#7c3aed', badgeBd: '#e9d5ff', btnBg: '#7c3aed' }, // Purple
    { border: '#ea580c', bg: '#fff7ed', tagBg: '#ffedd5', tagColor: '#9a3412', badgeBg: '#ffedd5', badgeColor: '#c2410c', badgeBd: '#fed7aa', btnBg: '#ea580c' }, // Amber Orange
    { border: '#e11d48', bg: '#fff1f2', tagBg: '#ffe4e6', tagColor: '#9f1239', badgeBg: '#ffe4e6', badgeColor: '#e11d48', badgeBd: '#fecdd3', btnBg: '#e11d48' }, // Rose Pink
    { border: '#0d9488', bg: '#f0fdfa', tagBg: '#ccfbf1', tagColor: '#115e59', badgeBg: '#ccfbf1', badgeColor: '#0d9488', badgeBd: '#99f6e4', btnBg: '#0d9488' }  // Teal
  ];

  html += '<div class="pkg-grid">';
  filtered.forEach(function (pkg, pIdx) {
    var c = THEMES[pIdx % THEMES.length];
    var regSum = 0;
    var incTests = (pkg.includes || []).map(function (tid) {
      var it = testMap[tid];
      if (it) regSum += (+it.price || 0);
      return it;
    }).filter(Boolean);

    var dealPrice = +pkg.price || 0;
    var savings = Math.max(0, regSum - dealPrice);
    var savingsPct = regSum > 0 ? Math.round((savings / regSum) * 100) : 0;

    var badgeText = pkg.dealBadge || 'SPECIAL DEAL';
    var badgeIcon = '🏷️';
    if (/best/i.test(badgeText)) badgeIcon = '🔥';
    else if (/exec|vip/i.test(badgeText)) badgeIcon = '👑';
    else if (/pop|star/i.test(badgeText)) badgeIcon = '⭐';
    else if (/screen|health/i.test(badgeText)) badgeIcon = '💚';

    html += '<div class="pkg-card' + (pkg.active === false ? ' is-inactive' : '') + '" style="border-top:4px solid ' + c.border + ';box-shadow:0 3px 12px rgba(15,23,42,.06);' + (pkg.active === false ? 'border-top-style:dashed;' : '') + '">'
      + '<div>'
      /* Card Header */
      +   '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">'
      +     '<span class="pkg-badge-deal" style="background:' + c.badgeBg + ';color:' + c.badgeColor + ';border:1.5px solid ' + c.badgeBd + '">' + badgeIcon + ' ' + App.esc(badgeText) + '</span>'
      +     '<button class="btn btn-ghost btn-sm" style="padding:3px 10px;font-size:11.5px;border-radius:20px;font-weight:700;' + (pkg.active !== false ? 'background:#ecfdf5;color:#15803d;border:1px solid #a7f3d0' : 'background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1') + '" data-pkg-toggle="' + App.esc(pkg.id) + '">'
      +       (pkg.active !== false ? '● Active' : '○ Inactive')
      +     '</button>'
      +   '</div>'

      /* Name & Code */
      +   '<h3 style="margin:0 0 6px;font-size:17.5px;font-weight:800;color:var(--ink);letter-spacing:-.01em;line-height:1.25">' + App.esc(pkg.name) + '</h3>'
      +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
      +     '<span class="mono" style="font-size:12px;font-weight:700;color:' + c.tagColor + ';background:' + c.tagBg + ';padding:2px 8px;border-radius:6px;border:1px solid ' + c.border + '33">' + App.esc(pkg.code) + '</span>'
      +     (pkg.category ? '<span style="font-size:11.5px;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;padding:2px 8px;border-radius:6px;font-weight:600">📁 ' + App.esc(pkg.category) + '</span>' : '')
      +     '<span style="font-size:11.5px;color:var(--muted);margin-left:auto;font-weight:600">' + incTests.length + ' tests included</span>'
      +   '</div>'

      /* Preparation Instructions */
      +   (pkg.prepNote ? '<div style="background:' + c.bg + ';border:1px solid ' + c.border + '33;border-left:3.5px solid ' + c.border + ';padding:7px 11px;border-radius:8px;font-size:11.5px;color:' + c.tagColor + ';font-weight:500;margin-bottom:12px;display:flex;align-items:center;gap:6px"><span>ℹ️</span><span>' + App.esc(pkg.prepNote) + '</span></div>' : '')

      /* Included Tests List */
      +   '<div style="margin-bottom:12px">'
      +     '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);letter-spacing:.04em;margin-bottom:6px">Included Diagnostic Tests:</div>'
      +     '<div style="max-height:115px;overflow-y:auto;padding-right:4px">'
      +       incTests.map(function (it) {
                return '<span class="pkg-inc-tag" title="' + App.esc(it.name) + ' (' + App.money(+it.price || 0) + ')">'
                  + App.esc(it.code || it.name) + ' <span style="color:var(--muted);font-size:11px;font-weight:500">(' + App.money(+it.price || 0) + ')</span>'
                  + '</span>';
              }).join('')
      +     '</div>'
      +   '</div>'
      + '</div>'

      /* Price & Savings Bar */
      + '<div>'
      +   '<div class="pkg-price-bar" style="background:linear-gradient(135deg, ' + c.bg + ' 0%, #ffffff 100%);border:1.5px solid ' + c.border + '44">'
      +     '<div>'
      +       '<div style="font-size:11px;color:#64748b;font-weight:600;text-decoration:line-through">Catalog Sum: ' + App.money(regSum) + '</div>'
      +       '<div style="font-size:23px;font-weight:900;color:' + c.border + ';line-height:1.15;letter-spacing:-.02em">' + App.money(dealPrice) + '</div>'
      +     '</div>'
      +     (savings > 0 ? '<div style="background:' + c.border + ';color:#ffffff;font-weight:800;font-size:12px;padding:5px 11px;border-radius:8px;box-shadow:0 2px 8px ' + c.border + '44;letter-spacing:.02em;text-align:right">SAVE ' + App.money(savings) + '<br><span style="font-size:10.5px;opacity:.9;font-weight:700">(' + savingsPct + '% OFF)</span></div>' : '')
      +   '</div>'

      /* Action Buttons */
      +   '<div style="display:flex;gap:7px;align-items:center">'
      +     '<button class="btn btn-sm" style="flex:1;font-weight:700;background:' + c.btnBg + ';color:#ffffff;border:none;box-shadow:0 2px 6px ' + c.border + '44" data-pkg-bill="' + App.esc(pkg.id) + '">🧾 Quick Bill Deal</button>'
      +     '<button class="btn btn-ghost btn-sm" data-pkg-flyer="' + App.esc(pkg.id) + '" title="Print Counter Flyer" style="border:1px solid var(--bd)">🖨️ Flyer</button>'
      +     '<button class="btn btn-ghost btn-sm" data-pkg-edit="' + App.esc(pkg.id) + '" style="border:1px solid var(--bd)">Edit</button>'
      +     '<button class="btn btn-ghost btn-sm" data-pkg-del="' + App.esc(pkg.id) + '" style="color:var(--red);border:1px solid var(--bd)">Delete</button>'
      +   '</div>'
      + '</div>'

      + '</div>';
  });
  html += '</div>';

  html += '</div>'; /* end .pkg-dash */

  view().innerHTML = html;
  wirePackagesEvents();

  function wirePackagesEvents() {
    /* Filter inputs */
    var searchEl = document.getElementById('pkgSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        pkgFilter.q = this.value;
        renderPackages();
      });
    }

    var catEl = document.getElementById('pkgCatSelect');
    if (catEl) {
      catEl.addEventListener('change', function () {
        pkgFilter.cat = this.value;
        renderPackages();
      });
    }

    var stEl = document.getElementById('pkgStatusSelect');
    if (stEl) {
      stEl.addEventListener('change', function () {
        pkgFilter.status = this.value;
        renderPackages();
      });
    }

    var resetBtn = document.getElementById('pkgResetFilter');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        pkgFilter = { q: '', cat: 'all', status: 'all' };
        renderPackages();
      });
    }

    /* KPI Click Filters */
    var kAll = document.getElementById('kpiPkgAll');
    if (kAll) {
      kAll.addEventListener('click', function () {
        pkgFilter.status = 'all';
        var sel = document.getElementById('pkgStatusSelect');
        if (sel) sel.value = 'all';
        renderPackages();
      });
    }
    var kAct = document.getElementById('kpiPkgActive');
    if (kAct) {
      kAct.addEventListener('click', function () {
        pkgFilter.status = 'active';
        var sel = document.getElementById('pkgStatusSelect');
        if (sel) sel.value = 'active';
        renderPackages();
      });
    }

    /* Create package */
    var addBtn = document.getElementById('pkgAddBtn');
    if (addBtn) addBtn.addEventListener('click', function () { openPackageModal(null); });
    var empAddBtn = document.getElementById('pkgEmptyAddBtn');
    if (empAddBtn) empAddBtn.addEventListener('click', function () { openPackageModal(null); });

    /* Seed deals */
    var seedBtn = document.getElementById('pkgSeedBtn');
    if (seedBtn) seedBtn.addEventListener('click', function () { seedPremierPackages(); });
    var empSeedBtn = document.getElementById('pkgEmptySeedBtn');
    if (empSeedBtn) empSeedBtn.addEventListener('click', function () { seedPremierPackages(); });

    /* Toggle Active */
    document.querySelectorAll('[data-pkg-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-pkg-toggle');
        var p = DB.get('tests', id);
        if (p) {
          DB.update('tests', id, { active: p.active === false ? true : false });
          App.toast(p.active === false ? 'Package activated.' : 'Package paused.');
          renderPackages();
        }
      });
    });

    /* Quick Bill */
    document.querySelectorAll('[data-pkg-bill]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-pkg-bill');
        var p = DB.get('tests', id);
        if (p) quickBillPackage(p);
      });
    });

    /* Print Flyer */
    document.querySelectorAll('[data-pkg-flyer]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-pkg-flyer');
        var p = DB.get('tests', id);
        if (p) printPackageFlyer(p);
      });
    });

    /* Edit Package */
    document.querySelectorAll('[data-pkg-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-pkg-edit');
        var p = DB.get('tests', id);
        if (p) openPackageModal(p);
      });
    });

    /* Delete Package */
    document.querySelectorAll('[data-pkg-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-pkg-del');
        var p = DB.get('tests', id);
        if (!p) return;
        App.confirm('Delete Health Package', 'Are you sure you want to delete "' + p.name + '"? This will not delete the individual diagnostic tests.', function () {
          DB.remove('tests', id);
          App.toast('Package deleted.');
          renderPackages();
        });
      });
    });
  }
}

/* Modal to add / edit a health package */
function openPackageModal(pkg) {
  var isNew = !pkg;
  pkg = pkg || {
    name: '',
    code: 'PKG-' + Math.floor(100 + Math.random() * 900),
    category: 'Health Packages',
    dealBadge: 'BEST VALUE',
    price: 2999,
    sampleType: 'Serum + EDTA Blood',
    tat: 'Same day',
    prepNote: '10-12 hours fasting required. Water permitted.',
    active: true,
    isPackage: true,
    includes: []
  };

  var allTests = (DB.all('tests') || []).filter(function (t) { return !t.isPackage && t.active !== false; })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

  var picked = {};
  (pkg.includes || []).forEach(function (id) { picked[id] = true; });

  var BADGES = ['BEST VALUE', 'POPULAR', 'EXECUTIVE', 'SPECIAL DEAL', 'WOMEN HEALTH', 'SENIOR CITIZEN', 'DIABETES CARE', 'CARDIAC CARE'];

  var body = ''
    + '<form id="pmForm" style="display:flex;flex-direction:column;gap:14px">'
    + '<div class="form-grid">'
    +   '<div><label class="label">Package Name *</label><input class="input" id="pmName" value="' + App.esc(pkg.name) + '" placeholder="e.g. Executive Full Body Checkup" required></div>'
    +   '<div><label class="label">Package Code *</label><input class="input mono" id="pmCode" value="' + App.esc(pkg.code) + '" placeholder="e.g. PKG-EXEC-01" required></div>'
    +   '<div><label class="label">Category</label><input class="input" id="pmCat" value="' + App.esc(pkg.category || 'Health Packages') + '" list="pmCatList"><datalist id="pmCatList"><option value="Executive Screening"><option value="Diabetes Care"><option value="Cardiac Care"><option value="Women Health"><option value="Senior Citizens"><option value="Basic Health"></datalist></div>'
    +   '<div><label class="label">Promotional Badge</label><select class="select" id="pmBadge">'
    +     BADGES.map(function (b) { return '<option value="' + b + '"' + (pkg.dealBadge === b ? ' selected' : '') + '>' + b + '</option>'; }).join('')
    +   '</select></div>'
    +   '<div><label class="label">Sample Type(s)</label><input class="input" id="pmSample" value="' + App.esc(pkg.sampleType || 'Serum + EDTA Blood') + '" placeholder="e.g. Serum + EDTA Blood + Urine"></div>'
    +   '<div><label class="label">Turnaround Time (TAT)</label><input class="input" id="pmTat" value="' + App.esc(pkg.tat || 'Same day') + '"></div>'
    +   '<div style="grid-column:1/-1"><label class="label">Patient Preparation &amp; Fasting Guidelines</label><input class="input" id="pmPrep" value="' + App.esc(pkg.prepNote || '') + '" placeholder="e.g. 10-12 hours fasting required. Drink water only."></div>'
    + '</div>'

    /* Interactive Test Picker with Live Tally */
    + '<div>'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
    +     '<label class="label" style="margin:0;font-weight:700">Select Included Diagnostic Tests *</label>'
    +     '<input class="input search" id="pmTestFilter" placeholder="Filter tests..." style="width:200px;padding:4px 8px;font-size:12px">'
    +   '</div>'
    +   '<div id="pmTestList" style="max-height:180px;overflow-y:auto;border:1.5px solid var(--bd);border-radius:8px;padding:8px 10px;background:#fafafa">'
    +     allTests.map(function (t) {
            return '<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:13px" class="pm-test-item">'
              + '<input type="checkbox" data-pm-tid="' + App.esc(t.id) + '" data-pm-price="' + (+t.price || 0) + '"' + (picked[t.id] ? ' checked' : '') + '> '
              + '<span><strong>' + App.esc(t.name) + '</strong> <span class="muted">(' + App.esc(t.code || '') + ' · ' + App.money(+t.price || 0) + ')</span></span>'
              + '</label>';
          }).join('')
    +   '</div>'
    + '</div>'

    /* Live Savings Calculation Card */
    + '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px 16px">'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:center">'
    +     '<div><div class="muted" style="font-size:11px;text-transform:uppercase">Individual Sum:</div><div style="font-size:16px;font-weight:800;color:#334155" id="pmRegTotal">Rs. 0</div></div>'
    +     '<div><label class="label" style="margin:0 0 3px;font-size:11px;text-transform:uppercase;color:#15803d">Bundle Price (PKR) *</label><input class="input" type="number" id="pmPrice" value="' + (+pkg.price || 0) + '" min="0" step="1" style="font-weight:800;font-size:15px;color:#15803d" required></div>'
    +     '<div><div class="muted" style="font-size:11px;text-transform:uppercase">Patient Savings:</div><div style="font-size:15px;font-weight:800;color:#16a34a" id="pmSavingsTxt">Save Rs. 0 (0%)</div></div>'
    +   '</div>'
    + '</div>'

    + '<div style="display:flex;align-items:center;gap:8px">'
    +   '<input type="checkbox" id="pmActive"' + (pkg.active !== false ? ' checked' : '') + '><label for="pmActive" style="font-size:13.5px;font-weight:600;cursor:pointer">Package is active and available for billing</label>'
    + '</div>'

    + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px">'
    +   '<button type="button" class="btn btn-ghost" id="pmCancel">Cancel</button>'
    +   '<button type="submit" class="btn btn-primary">' + (isNew ? 'Create Package' : 'Save Changes') + '</button>'
    + '</div>'
    + '</form>';

  App.modal(isNew ? '🎁 Create New Health Package' : '✏️ Edit Health Package Deal', body, {
    wide: true,
    onOpen: function (ov, close) {
      var form = ov.querySelector('#pmForm');
      var testFilter = ov.querySelector('#pmTestFilter');
      var testList = ov.querySelector('#pmTestList');
      var priceInp = ov.querySelector('#pmPrice');
      var regTotalEl = ov.querySelector('#pmRegTotal');
      var savingsTxtEl = ov.querySelector('#pmSavingsTxt');

      function updateCalculation() {
        var total = 0;
        ov.querySelectorAll('[data-pm-tid]:checked').forEach(function (cb) {
          total += (+cb.getAttribute('data-pm-price') || 0);
        });
        regTotalEl.textContent = App.money(total);
        var pVal = parseFloat(priceInp.value) || 0;
        var diff = total - pVal;
        var pct = total > 0 ? Math.round((diff / total) * 100) : 0;
        if (diff > 0) {
          savingsTxtEl.innerHTML = '<span style="color:#15803d">Save ' + App.money(diff) + ' (' + pct + '% OFF)</span>';
        } else if (diff === 0) {
          savingsTxtEl.innerHTML = '<span style="color:#64748b">No discount (0%)</span>';
        } else {
          savingsTxtEl.innerHTML = '<span style="color:#dc2626">Price higher by ' + App.money(Math.abs(diff)) + '</span>';
        }
      }

      ov.querySelectorAll('[data-pm-tid]').forEach(function (cb) {
        cb.addEventListener('change', updateCalculation);
      });
      priceInp.addEventListener('input', updateCalculation);
      updateCalculation();

      testFilter.addEventListener('input', function () {
        var q = this.value.toLowerCase().trim();
        ov.querySelectorAll('.pm-test-item').forEach(function (item) {
          var txt = item.textContent.toLowerCase();
          item.style.display = txt.indexOf(q) >= 0 ? 'flex' : 'none';
        });
      });

      ov.querySelector('#pmCancel').addEventListener('click', close);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = ov.querySelector('#pmName').value.trim();
        var code = ov.querySelector('#pmCode').value.trim();
        var cat = ov.querySelector('#pmCat').value.trim();
        var badge = ov.querySelector('#pmBadge').value;
        var sample = ov.querySelector('#pmSample').value.trim();
        var tat = ov.querySelector('#pmTat').value.trim();
        var prep = ov.querySelector('#pmPrep').value.trim();
        var price = parseFloat(priceInp.value);
        var active = ov.querySelector('#pmActive').checked;

        if (!name || !code) { App.toast('Name and code are required.', 'err'); return; }
        if (isNaN(price) || price < 0) { App.toast('Enter a valid package price.', 'err'); return; }

        var selectedIds = [];
        ov.querySelectorAll('[data-pm-tid]:checked').forEach(function (cb) {
          selectedIds.push(cb.getAttribute('data-pm-tid'));
        });

        if (!selectedIds.length) {
          App.toast('Select at least one test for the package.', 'err');
          return;
        }

        var dup = DB.all('tests').some(function (t) {
          return t.id !== pkg.id && String(t.code || '').toLowerCase() === code.toLowerCase();
        });
        if (dup) { App.toast('A test or package with this code already exists.', 'err'); return; }

        var data = {
          name: name,
          code: code,
          category: cat || 'Health Packages',
          dealBadge: badge,
          sampleType: sample || 'Serum + EDTA Blood',
          tat: tat || 'Same day',
          prepNote: prep,
          price: price,
          active: active,
          isPackage: true,
          includes: selectedIds
        };

        if (isNew) {
          DB.insert('tests', data);
          App.toast('Health Package created successfully.');
        } else {
          DB.update('tests', pkg.id, data);
          App.toast('Health Package updated.');
        }
        close();
        renderPackages();
      });
    }
  });
}

/* Quick bill a package directly to a patient */
function quickBillPackage(pkg) {
  var allPats = DB.all('patients') || [];
  var body = ''
    + '<div style="margin-bottom:14px">'
    +   '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 14px;margin-bottom:14px">'
    +     '<div style="display:flex;justify-content:space-between;align-items:center">'
    +       '<strong>' + App.esc(pkg.name) + ' (' + App.esc(pkg.code) + ')</strong>'
    +       '<span style="font-size:16px;font-weight:800;color:#15803d">' + App.money(+pkg.price || 0) + '</span>'
    +     '</div>'
    +     '<div class="muted" style="font-size:12px;margin-top:4px">' + (pkg.includes || []).length + ' diagnostic tests bundled in deal</div>'
    +   '</div>'
    +   '<label class="label" style="font-weight:700">Select Patient to Bill</label>'
    +   '<select class="select" id="qbPatientSelect" style="width:100%;font-size:14px;margin-bottom:10px">'
    +     '<option value="">— Select an existing patient —</option>'
    +     allPats.map(function (p) {
            return '<option value="' + App.esc(p.id) + '">' + App.esc(p.name) + ' (' + App.esc(p.id) + ' • ' + App.esc(p.phone || 'no phone') + ')</option>';
          }).join('')
    +   '</select>'
    +   '<div style="text-align:center;color:var(--muted);font-size:12px;margin:8px 0">— OR —</div>'
    +   '<button type="button" class="btn btn-ghost btn-sm" id="qbWalkInBtn" style="width:100%">+ Bill as Quick Walk-in Patient</button>'
    + '</div>'
    + '<div style="display:flex;justify-content:flex-end;gap:10px">'
    +   '<button class="btn btn-ghost" id="qbCancel">Cancel</button>'
    +   '<button class="btn btn-primary" id="qbProceed">Proceed to Billing POS &rarr;</button>'
    + '</div>';

  App.modal('🧾 Quick Bill Health Package', body, {
    onOpen: function (ov, close) {
      var patSel = ov.querySelector('#qbPatientSelect');
      var proceedBtn = ov.querySelector('#qbProceed');
      var walkInBtn = ov.querySelector('#qbWalkInBtn');
      var cancelBtn = ov.querySelector('#qbCancel');

      cancelBtn.addEventListener('click', close);

      function billTo(patientId) {
        /* Store pre-loaded package into sessionStorage cart */
        sessionStorage.setItem('labpos_precart', JSON.stringify([{
          testId: pkg.id,
          code: pkg.code,
          name: pkg.name,
          price: +pkg.price || 0,
          isPackage: true,
          includes: pkg.includes || []
        }]));
        close();
        App.nav('#/billing/' + patientId);
      }

      proceedBtn.addEventListener('click', function () {
        var pid = patSel.value;
        if (!pid) { App.toast('Please select a patient.', 'err'); return; }
        billTo(pid);
      });

      walkInBtn.addEventListener('click', function () {
        /* Create quick walk-in patient */
        var now = new Date();
        var patName = 'Walk-in (' + App.dt(now).split(' ')[1] + ')';
        var newP = DB.insert('patients', {
          name: patName,
          phone: '',
          gender: 'Other',
          age: 30,
          notes: 'Created via Quick Package Deal (' + pkg.name + ')',
          createdAt: now.toISOString()
        });
        App.toast('Walk-in patient created.');
        billTo(newP.id);
      });
    }
  });
}

/* Print official promotional counter flyer / pamphlet for the package */
function printPackageFlyer(pkg) {
  var s = DB.get('settings', 'main') || {};
  var allTests = DB.all('tests') || [];
  var testMap = {};
  allTests.forEach(function (t) { testMap[t.id] = t; });

  var regSum = 0;
  var items = (pkg.includes || []).map(function (tid) {
    var it = testMap[tid];
    if (it) regSum += (+it.price || 0);
    return it;
  }).filter(Boolean);

  var dealPrice = +pkg.price || 0;
  var savings = Math.max(0, regSum - dealPrice);
  var savingsPct = regSum > 0 ? Math.round((savings / regSum) * 100) : 0;

  var flyerHtml = ''
    + '<div style="max-width:800px;margin:0 auto;font-family:system-ui,sans-serif;color:#131845;padding:10px">'
    + '<div style="text-align:center;border-bottom:3px solid #131845;padding-bottom:14px;margin-bottom:18px">'
    +   '<div style="font-size:24px;font-weight:900;letter-spacing:.03em;color:#131845;text-transform:uppercase">' + App.esc(s.labName || 'Optix Medical Sync') + '</div>'
    +   '<div style="font-size:12.5px;color:#64748b;margin:4px 0">' + App.esc(s.address || '') + ' • Helpline: ' + App.esc(s.phone || '') + '</div>'
    +   '<div style="display:inline-block;background:#131845;color:#fff;font-weight:800;font-size:13px;padding:4px 14px;border-radius:20px;letter-spacing:.08em;margin-top:8px">PROMOTIONAL HEALTH SCREENING PACKAGE</div>'
    + '</div>'

    + '<div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:2px solid #cbd5e1;border-radius:12px;padding:16px 20px;margin-bottom:20px">'
    +   '<div>'
    +     '<span style="background:#fee2e2;color:#b91c1c;font-weight:800;font-size:11px;padding:3px 8px;border-radius:6px;letter-spacing:.05em">' + App.esc(pkg.dealBadge || 'SPECIAL DEAL') + '</span>'
    +     '<h2 style="margin:6px 0 2px;font-size:24px;font-weight:900;color:#131845">' + App.esc(pkg.name) + '</h2>'
    +     '<div style="font-size:13px;color:#64748b">Package Code: <strong class="mono">' + App.esc(pkg.code) + '</strong> &bull; ' + App.esc(pkg.category || 'Health Package') + '</div>'
    +   '</div>'
    +   '<div style="text-align:right">'
    +     '<div style="font-size:13px;color:#64748b;text-decoration:line-through">Normal Price: ' + App.money(regSum) + '</div>'
    +     '<div style="font-size:28px;font-weight:900;color:#15803d;line-height:1.1">' + App.money(dealPrice) + '</div>'
    +     (savings > 0 ? '<div style="font-size:13px;font-weight:800;color:#b91c1c">Save ' + App.money(savings) + ' (' + savingsPct + '% OFF)</div>' : '')
    +   '</div>'
    + '</div>'

    + '<h3 style="font-size:16px;font-weight:800;margin:0 0 10px;border-bottom:1.5px solid #cbd5e1;padding-bottom:6px">Included Diagnostic Tests (' + items.length + ' Tests)</h3>'
    + '<table class="table" style="margin-bottom:18px"><thead><tr>'
    + '<th>#</th><th>Test Name</th><th>Test Code</th><th>Sample Type</th><th style="text-align:right">Catalog Price</th>'
    + '</tr></thead><tbody>'
    + items.map(function (it, i) {
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td><strong>' + App.esc(it.name) + '</strong></td>'
          + '<td><span class="mono">' + App.esc(it.code || '—') + '</span></td>'
          + '<td>' + App.esc(it.sampleType || 'Blood') + '</td>'
          + '<td style="text-align:right">' + App.money(+it.price || 0) + '</td>'
          + '</tr>';
      }).join('')
    + '<tr><td colspan="4" style="text-align:right;font-weight:700">Total Standard Price:</td><td style="text-align:right;font-weight:700">' + App.money(regSum) + '</td></tr>'
    + '<tr style="background:#f0fdf4"><td colspan="4" style="text-align:right;font-weight:900;color:#15803d;font-size:15px">Special Package Deal Price:</td><td style="text-align:right;font-weight:900;color:#15803d;font-size:16px">' + App.money(dealPrice) + '</td></tr>'
    + '</tbody></table>'

    + (pkg.prepNote ? '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:13px">'
    + '<strong style="color:#b45309">📌 Patient Preparation &amp; Fasting Guidelines:</strong> ' + App.esc(pkg.prepNote) + '</div>' : '')

    + '<div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #131845;padding-top:14px;margin-top:24px;font-size:12px;color:#64748b">'
    +   '<div>Report Turnaround: <b>' + App.esc(pkg.tat || 'Same day') + '</b> &bull; Sample Collection Available At Counter &amp; Home</div>'
    +   '<div><b>' + App.esc(s.labName || 'Optix Medical Sync') + '</b> &bull; ' + App.esc(s.phone || '') + '</div>'
    + '</div>'
    + '</div>';

  App.print('Health Package Deal — ' + pkg.name, flyerHtml);
}

/* Quick seed 6 premier Pakistani lab packages */
function seedPremierPackages() {
  var all = DB.all('tests') || [];

  function findOrMakeTest(name, code, price, category, sampleType) {
    var q = name.toLowerCase();
    for (var i = 0; i < all.length; i++) {
      if (!all[i].isPackage && (all[i].name.toLowerCase().indexOf(q) >= 0 || (all[i].code && all[i].code.toLowerCase() === code.toLowerCase()))) {
        return all[i].id;
      }
    }
    /* create placeholder test if not in database */
    var newT = DB.insert('tests', {
      name: name,
      code: code,
      price: price,
      category: category,
      sampleType: sampleType,
      active: true,
      params: [{ name: name, unit: '', ref: '' }]
    });
    all.push(newT);
    return newT.id;
  }

  var cbcId = findOrMakeTest('Complete Blood Count (CBC)', 'CBC', 800, 'Hematology', 'EDTA Blood');
  var bsfId = findOrMakeTest('Blood Sugar Fasting (BSF)', 'BSF', 350, 'Biochemistry', 'Fluoride Blood');
  var creatId = findOrMakeTest('Serum Creatinine', 'CREAT', 600, 'Renal Function', 'Serum');
  var urineId = findOrMakeTest('Urine Routine Examination (R/E)', 'URINE-RE', 450, 'Clinical Pathology', 'Urine');
  var lipidId = findOrMakeTest('Lipid Profile', 'LIPID', 1600, 'Biochemistry', 'Serum');
  var lftId = findOrMakeTest('Liver Function Tests (LFT)', 'LFT', 1400, 'Biochemistry', 'Serum');
  var uricId = findOrMakeTest('Serum Uric Acid', 'URIC', 550, 'Biochemistry', 'Serum');
  var hba1cId = findOrMakeTest('HbA1c (Glycated Hemoglobin)', 'HBA1C', 1200, 'Special Chemistry', 'EDTA Blood');
  var tshId = findOrMakeTest('Thyroid Stimulating Hormone (TSH)', 'TSH', 1200, 'Endocrinology', 'Serum');
  var vitDId = findOrMakeTest('Vitamin D (25-OH)', 'VIT-D', 2800, 'Endocrinology', 'Serum');
  var calciumId = findOrMakeTest('Serum Calcium', 'CA', 600, 'Biochemistry', 'Serum');
  var tropId = findOrMakeTest('Troponin-I', 'TROP-I', 1800, 'Cardiac Markers', 'Serum');
  var ureaId = findOrMakeTest('Blood Urea', 'UREA', 500, 'Renal Function', 'Serum');
  var electroId = findOrMakeTest('Serum Electrolytes (Na, K, Cl)', 'ELECTRO', 1100, 'Biochemistry', 'Serum');

  var presetBundles = [
    {
      name: 'Basic Health Screening Deal',
      code: 'PKG-BASIC-01',
      category: 'Basic Health',
      dealBadge: 'POPULAR',
      price: 1499,
      sampleType: 'Serum + EDTA Blood + Urine',
      tat: 'Same day',
      prepNote: '10-12 hours fasting recommended. Water is permitted.',
      includes: [cbcId, bsfId, creatId, urineId]
    },
    {
      name: 'Executive Full Body Health Profile',
      code: 'PKG-EXEC-01',
      category: 'Executive Screening',
      dealBadge: 'BEST VALUE',
      price: 4499,
      sampleType: 'Serum + EDTA Blood + Urine',
      tat: 'Same day',
      prepNote: 'Strict 10-12 hours overnight fasting. Avoid heavy fatty meal night before.',
      includes: [cbcId, bsfId, lipidId, lftId, creatId, uricId, urineId]
    },
    {
      name: 'Diabetic Comprehensive Care Package',
      code: 'PKG-DIAB-01',
      category: 'Diabetes Care',
      dealBadge: 'SPECIAL DEAL',
      price: 2999,
      sampleType: 'Serum + EDTA Blood + Fluoride',
      tat: 'Same day',
      prepNote: '10-12 hours fasting. Take your morning diabetes medicines after blood collection.',
      includes: [hba1cId, bsfId, creatId, lipidId, urineId]
    },
    {
      name: 'Cardiac Risk & Lipid Health Profile',
      code: 'PKG-CARD-01',
      category: 'Cardiac Care',
      dealBadge: 'HEART HEALTH',
      price: 3699,
      sampleType: 'Serum + EDTA Blood',
      tat: 'Same day',
      prepNote: '12 hours fasting required. Rest quietly for 15 minutes prior to blood draw.',
      includes: [lipidId, bsfId, tropId, ureaId, electroId]
    },
    {
      name: 'Well-Woman Vital Health Checkup',
      code: 'PKG-WOMEN-01',
      category: 'Women Health',
      dealBadge: 'WELL-WOMAN',
      price: 4999,
      sampleType: 'Serum + EDTA Blood + Urine',
      tat: 'Same day',
      prepNote: 'Morning sample preferred. Overnight fasting 8-10 hours.',
      includes: [cbcId, tshId, calciumId, vitDId, urineId, bsfId]
    },
    {
      name: 'Senior Citizen Vital Geriatric Panel',
      code: 'PKG-SNR-01',
      category: 'Senior Citizens',
      dealBadge: 'GOLDEN AGE',
      price: 3999,
      sampleType: 'Serum + EDTA Blood + Urine',
      tat: 'Same day',
      prepNote: '10 hours fasting. Bring all your current prescription medicines.',
      includes: [cbcId, creatId, ureaId, lftId, lipidId, uricId, bsfId, electroId]
    }
  ];

  var addedCount = 0;
  presetBundles.forEach(function (b) {
    var exists = DB.all('tests').some(function (t) { return t.code === b.code; });
    if (!exists) {
      DB.insert('tests', Object.assign({ isPackage: true, active: true }, b));
      addedCount++;
    }
  });

  if (addedCount > 0) {
    App.toast(addedCount + ' premier health packages seeded.');
  } else {
    App.toast('All premier health packages already exist.');
  }
  renderPackages();
}

/* ---------- register routes ---------- */

App.route('/tests', function () { openCatalog('all'); });
App.route('/tests/regular', function () { openCatalog('regular'); });
App.route('/tests/generic', function () { openCatalog('generic'); });
App.route('/doctors', renderDoctors);
App.route('/packages', renderPackages);
App.route('#/packages', renderPackages);

})();
