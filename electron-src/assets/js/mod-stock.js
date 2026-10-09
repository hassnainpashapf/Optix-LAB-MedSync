/* Optix Medical Sync — Inventory & Stock Dashboard (#/inventory, #/stock):
   Track clinical lab reagents, test kits, vacutainers, consumables & diagnostic supplies.
   Receive stock (lot + expiry), automatic consumption when test results are saved,
   record waste / corrections, and comprehensive reorder & expiry alerts. */
(function () {
  'use strict';
  var esc = App.esc;
  var F = { q: '', show: 'all', tab: 'items', moveType: 'all', mq: '' };
  var UNITS = ['tests', 'kit', 'vial', 'bottle', 'box', 'pack', 'pcs', 'ml', 'L', 'g'];

  var CSS = '' +
    '.sk-bar{display:flex;gap:10px;flex-wrap:nowrap;align-items:center;padding:14px 18px}' +
    '.sk-bar .grow{flex:1 1 auto;min-width:200px;width:auto}' +
    '.sk-bar .select{flex:0 0 auto;width:auto;max-width:100%}' +
    '.sk-bar .btn{flex:0 0 auto;white-space:nowrap}' +
    '.sk-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap;margin:1px 4px 1px 0}' +
    '.sk-chip.ok{background:#e6f7f0;color:#047857}.sk-chip.low{background:#fff4e0;color:#b45309}.sk-chip.out{background:#fdecec;color:#b91c1c}.sk-chip.exp{background:#fdecec;color:#b91c1c}.sk-chip.soon{background:#fff4e0;color:#b45309}.sk-chip.trf{background:#e0f2fe;color:#0284c7}' +
    '.sk-alert{border:1px solid #f0d9a0;background:#fff8e6;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13.5px;line-height:1.7}' +
    '.sk-name{font-weight:700;color:var(--ink)}.sk-sub{font-size:12px;color:var(--muted)}.sk-num{font-weight:800;font-size:15px}' +
    '.sk-h{width:100%;border-collapse:collapse}.sk-h th,.sk-h td{padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;text-align:left}' +
    '@media(max-width:760px){.sk-bar{flex-wrap:wrap}.sk-bar .grow{flex:1 1 100%;min-width:0}}';
  function css() { if (document.getElementById('skCss')) return; var s = document.createElement('style'); s.id = 'skCss'; s.textContent = CSS; document.head.appendChild(s); }

  function num(n) { n = Math.round((+n || 0) * 100) / 100; return String(n); }
  function fdate(d) { return d ? App.d(d) : '—'; }
  function canEdit() { var s = App.session(); return !!s && (s.role === 'admin' || s.role === 'technician' || (s.role === 'custom' && (App.canPage('stock') || App.canPage('inventory')))); }

  function statusChips(r) {
    var h = '';
    if (r.out) h += '<span class="sk-chip out">Out of stock</span>';
    else if (r.low) h += '<span class="sk-chip low">Low stock</span>';
    if (r.expired) h += '<span class="sk-chip exp">Expired: ' + num(r.expiredQty) + '</span>';
    if (r.soon) h += '<span class="sk-chip soon">Expiring: ' + num(r.soonQty) + '</span>';
    return h || '<span class="sk-chip ok">OK</span>';
  }

  function warnOpts(cur) {
    var presets = [15, 30, 60, 90], h = '';
    presets.forEach(function (d) { h += '<option value="' + d + '"' + (cur === d ? ' selected' : '') + '>Warn ' + d + ' days before expiry</option>'; });
    if (presets.indexOf(cur) < 0 && cur > 0) h += '<option value="' + cur + '" selected>Warn ' + cur + ' days before expiry</option>';
    h += '<option value="custom">Custom…</option>';
    return h;
  }

  function warnCustom(cur) {
    App.modal('Custom expiry warning',
      '<div><label class="label">Warn how many days before a lot expires? (1–365)</label>' +
      '<input class="input" id="swDays" type="number" min="1" max="365" step="1" value="' + (+cur || 30) + '">' +
      '<div class="sk-sub" id="swErr" style="color:#b91c1c;margin-top:6px;display:none">Enter a whole number of days between 1 and 365.</div></div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="swCancel">Cancel</button><button class="btn btn-primary" id="swSave">Save</button></div>',
      { onOpen: function (ov, close) {
          var $ = function (id) { return ov.querySelector('#' + id); };
          $('swCancel').addEventListener('click', function () { close(); render(); });
          $('swSave').addEventListener('click', function () {
            var n = Math.floor(+$('swDays').value);
            if (!(n >= 1 && n <= 365)) { $('swErr').style.display = ''; App.toast('Enter a whole number of days between 1 and 365', 'err'); return; }
            try { DB.update('settings', 'main', { stockExpiryDays: n }); } catch (x) {}
            close(); App.toast('Expiry warning set to ' + n + ' days.'); render();
          });
        } });
  }

  var LAB_COMMON_ITEMS = [
    { name: 'CBC 3-Part Reagent Pack (Diluent, Lyse, Cleaner)', unit: 'tests', category: 'Hematology & Analyzers', vendor: 'Sysmex / Mindray', reorderLevel: 250 },
    { name: 'CBC Probe Cleaner Solution', unit: 'bottle', category: 'Hematology & Analyzers', vendor: 'Sysmex / Mindray', reorderLevel: 2 },
    { name: 'Blood Glucose GOD-POD Reagent Kit (500ml)', unit: 'tests', category: 'Clinical Chemistry', vendor: 'Spinreact / Diasys', reorderLevel: 300 },
    { name: 'LFT Reagent Kit (ALT, AST, ALP, Total Bilirubin)', unit: 'tests', category: 'Clinical Chemistry', vendor: 'Linear Chemicals', reorderLevel: 150 },
    { name: 'RFT Reagent Kit (Urea & Creatinine)', unit: 'tests', category: 'Clinical Chemistry', vendor: 'Spinreact / Biosystems', reorderLevel: 150 },
    { name: 'Lipid Profile Reagents (Cholesterol, Triglycerides, HDL)', unit: 'tests', category: 'Clinical Chemistry', vendor: 'Human Diagnostics', reorderLevel: 100 },
    { name: 'Electrolytes Reagent Pack (Na+, K+, Cl-)', unit: 'tests', category: 'Clinical Chemistry', vendor: 'Roche / Cornley', reorderLevel: 100 },
    { name: 'EDTA K3 Blood Collection Tubes 3ml (Lavender)', unit: 'pcs', category: 'Phlebotomy & Tubes', vendor: 'BD Vacutainer', reorderLevel: 200 },
    { name: 'Serum Clot Activator & Gel Tubes 4ml (Yellow)', unit: 'pcs', category: 'Phlebotomy & Tubes', vendor: 'BD Vacutainer', reorderLevel: 200 },
    { name: 'Sodium Citrate 3.2% Tubes 2.7ml (Light Blue)', unit: 'pcs', category: 'Phlebotomy & Tubes', vendor: 'BD Vacutainer', reorderLevel: 100 },
    { name: 'Fluoride Oxalate Sugar Tubes 2ml (Grey)', unit: 'pcs', category: 'Phlebotomy & Tubes', vendor: 'BD Vacutainer', reorderLevel: 100 },
    { name: 'Disposable Syringes with Needle 5ml', unit: 'pcs', category: 'Phlebotomy & Tubes', vendor: 'BD / Shifa', reorderLevel: 300 },
    { name: 'Disposable Syringes with Needle 3ml', unit: 'pcs', category: 'Phlebotomy & Tubes', vendor: 'BD / Shifa', reorderLevel: 300 },
    { name: 'BD Vacutainer Needles 21G / 22G', unit: 'box', category: 'Phlebotomy & Tubes', vendor: 'BD', reorderLevel: 5 },
    { name: 'Alcohol Prep Pads (Box of 100)', unit: 'box', category: 'Phlebotomy & Tubes', vendor: 'BD / Webcol', reorderLevel: 5 },
    { name: 'Urine 10-Parameter Reagent Strips (100 Strips)', unit: 'pack', category: 'Urinalysis', vendor: 'Siemens / Acon', reorderLevel: 2 },
    { name: 'Urine Specimen Collection Containers 60ml Sterile', unit: 'pcs', category: 'Consumables & Plasticware', vendor: 'LabChem', reorderLevel: 200 },
    { name: 'Pregnancy Rapid Test Strips (hCG)', unit: 'tests', category: 'Rapid Test Devices', vendor: 'Acon / InTec', reorderLevel: 50 },
    { name: 'Typhidot IgM/IgG Rapid ICT Cassettes', unit: 'tests', category: 'Rapid Test Devices', vendor: 'SD Biosensor', reorderLevel: 50 },
    { name: 'Dengue NS1 Antigen & IgG/IgM Combo Devices', unit: 'tests', category: 'Rapid Test Devices', vendor: 'SD Biosensor', reorderLevel: 50 },
    { name: 'HBsAg Rapid Screening Devices (Hepatitis B)', unit: 'tests', category: 'Serology & Rapid Devices', vendor: 'Acon Biotech', reorderLevel: 50 },
    { name: 'HCV Antibody Rapid Screening Devices (Hepatitis C)', unit: 'tests', category: 'Serology & Rapid Devices', vendor: 'Acon Biotech', reorderLevel: 50 },
    { name: 'HIV 1/2 Triline Rapid Test Cassettes', unit: 'tests', category: 'Serology & Rapid Devices', vendor: 'Abbott / Alere', reorderLevel: 30 },
    { name: 'VDRL / Syphilis Rapid Test Device', unit: 'tests', category: 'Serology & Rapid Devices', vendor: 'CTK Biotech', reorderLevel: 30 },
    { name: 'Microscope Glass Slides 7101 (Box of 50)', unit: 'box', category: 'Consumables & Plasticware', vendor: 'Sail Brand', reorderLevel: 10 },
    { name: 'Microscope Cover Slips 22×22mm (Pack of 100)', unit: 'box', category: 'Consumables & Plasticware', vendor: 'Sail Brand', reorderLevel: 10 },
    { name: 'Leishman Stain Solution (500ml)', unit: 'bottle', category: 'Stains & Chemicals', vendor: 'BDH / Merck', reorderLevel: 2 },
    { name: 'Microscopic Immersion Oil Type A (50ml)', unit: 'bottle', category: 'Stains & Chemicals', vendor: 'Cargille / Merck', reorderLevel: 1 },
    { name: 'Nitrile Powder-Free Examination Gloves (Medium)', unit: 'box', category: 'PPE & Safety', vendor: 'Supermax / Ansell', reorderLevel: 10 },
    { name: 'Yellow Micropipette Tips 200 µL (Pack of 500)', unit: 'pack', category: 'Consumables & Plasticware', vendor: 'Gilson / Eppendorf', reorderLevel: 5 },
    { name: 'Blue Micropipette Tips 1000 µL (Pack of 500)', unit: 'pack', category: 'Consumables & Plasticware', vendor: 'Gilson / Eppendorf', reorderLevel: 5 },
    { name: 'Thermal Receipt Rolls 80mm × 80m (Box of 50)', unit: 'pcs', category: 'Counter & Stationery', vendor: 'Standard POS Paper', reorderLevel: 20 },
    { name: 'Thermal Barcode Tube Stickers 50×25mm (Roll of 1000)', unit: 'pcs', category: 'Counter & Stationery', vendor: 'Zebra / Citizen', reorderLevel: 10 }
  ];

  function seedStockCatalog(force) {
    var existing = DB.all('stock_items') || [];
    if (existing.length && !force) return 0;
    var count = 0;
    LAB_COMMON_ITEMS.forEach(function (preset) {
      var dup = existing.some(function (x) { return String(x.name).toLowerCase() === preset.name.toLowerCase(); });
      if (!dup) {
        var id = DB.insert('stock_items', {
          name: preset.name,
          unit: preset.unit,
          category: preset.category,
          vendor: preset.vendor,
          reorderLevel: preset.reorderLevel,
          active: true
        });
        DB.insert('stock_moves', {
          itemId: id,
          type: 'in',
          qty: Math.max(10, preset.reorderLevel * 2),
          lot: 'LOT-' + Math.floor(10000 + Math.random() * 90000),
          expiry: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
          note: 'Initial catalog stock balance',
          date: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
          by: (App.session() || {}).name || 'System'
        });
        count++;
      }
    });
    return count;
  }

  function exportCsv(tab, rows, S) {
    var csv = '';
    if (tab === 'moves') {
      var moves = (DB.all('stock_moves') || []).slice().sort(function (a, b) {
        return String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date));
      });
      csv = 'Date,Item,Type,Quantity,Unit,Lot,Expiry,Note,Logged By\r\n';
      moves.forEach(function (m) {
        var it = DB.get('stock_items', m.itemId) || {};
        var row = [
          m.date || '',
          '"' + (it.name || '').replace(/"/g, '""') + '"',
          m.type || '',
          m.qty || 0,
          it.unit || '',
          m.lot || '',
          m.expiry || '',
          '"' + (m.note || m.ref || '').replace(/"/g, '""') + '"',
          '"' + (m.by || '').replace(/"/g, '""') + '"'
        ];
        csv += row.join(',') + '\r\n';
      });
    } else {
      csv = 'Item Name,Category,Supplier,Unit,On Hand,Reorder Level,Nearest Expiry,Status\r\n';
      (rows || []).forEach(function (r) {
        var it = r.item || {};
        var status = r.out ? 'Out of stock' : (r.low ? 'Low stock' : 'OK');
        if (r.expired) status += ' (Expired: ' + r.expiredQty + ')';
        if (r.soon) status += ' (Expiring soon: ' + r.soonQty + ')';
        var row = [
          '"' + (it.name || '').replace(/"/g, '""') + '"',
          '"' + (it.category || '').replace(/"/g, '""') + '"',
          '"' + (it.vendor || '').replace(/"/g, '""') + '"',
          it.unit || '',
          r.onHand || 0,
          it.reorderLevel || 0,
          r.nearest || '',
          '"' + status.replace(/"/g, '""') + '"'
        ];
        csv += row.join(',') + '\r\n';
      });
    }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (tab === 'moves' ? 'inventory-moves-' : 'inventory-stock-') + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function render() {
    css();
    var v = document.getElementById('view'); if (!v) return;
    var S = App.stockState();
    var seededFlag = false;
    try { seededFlag = localStorage.getItem('labpos_stock_catalog_seeded') === '1'; } catch (e) {}
    if ((!S.rows.length || !(DB.all('stock_items') || []).length) && !seededFlag) {
      seedStockCatalog(false);
      try { localStorage.setItem('labpos_stock_catalog_seeded', '1'); } catch (e) {}
      S = App.stockState();
    }
    var q = F.q.toLowerCase();
    var rows = S.rows.filter(function (r) {
      if (q && (r.item.name + ' ' + (r.item.category || '') + ' ' + (r.item.vendor || '')).toLowerCase().indexOf(q) < 0) return false;
      if (F.show === 'alerts') return r.out || r.low || r.expired || r.soon;
      if (F.show === 'low') return r.low;
      if (F.show === 'out') return r.out;
      if (F.show === 'exp') return r.expired || r.soon;
      return true;
    }).sort(function (a, b) {
      var sa = (a.out || a.expired ? 0 : (a.low || a.soon ? 1 : 2)), sb = (b.out || b.expired ? 0 : (b.low || b.soon ? 1 : 2));
      return sa - sb || String(a.item.name).localeCompare(String(b.item.name));
    });
    var al = S.rows.filter(function (r) { return r.out || r.low || r.expired || r.soon; });

    var curTab = F.tab || 'items';

    var h = '' +
      /* Dashboard Header */
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">' +
        '<div>' +
          '<h2 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);display:flex;align-items:center;gap:10px">' +
            '<span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:#e0f2fe;color:#0284c7">' + App.icon('box', 22) + '</span>' +
            'Inventory &amp; Stock Dashboard' +
          '</h2>' +
          '<div style="font-size:12.5px;color:var(--muted);margin-top:2px">Clinical laboratory reagents, test kits, vacutainers, consumables &amp; automated consumption tracking</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          (canEdit() ? '<button class="btn btn-primary" id="skRecvTop" style="display:inline-flex;align-items:center;gap:6px;font-weight:700">' + App.icon('plus', 16) + ' Receive Stock</button>' +
            '<button class="btn btn-secondary" id="skMoveTop" style="background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink);font-weight:700;display:inline-flex;align-items:center;gap:6px">🚚 Move / Use Stock</button>' +
            '<button class="btn btn-secondary" id="skAddTop" style="background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink);font-weight:600;display:inline-flex;align-items:center;gap:6px">' + App.icon('plus', 16) + ' Add Item</button>' +
            '<button class="btn btn-ghost btn-sm" id="skSeedCatTop" style="background:#f8fafc;border:1px solid #cbd5e1;font-weight:600;display:inline-flex;align-items:center;gap:6px" title="Load comprehensive 30+ medical laboratory reagents, test kits and tubes">⚡ Lab Catalog</button>' : '') +
          '<button class="btn btn-ghost btn-sm" id="skCsvExport" style="background:#f8fafc;border:1px solid #cbd5e1;font-weight:600;display:inline-flex;align-items:center;gap:6px">' + App.icon('download', 14) + ' Export CSV</button>' +
        '</div>' +
      '</div>' +

      /* 4 Standardized Unified KPI Stat Cards (.kpi-grid + .kpi) */
      '<div class="kpi-grid" style="margin-bottom:18px">' +
        '<div class="kpi t-navy" style="border-left:4px solid #0284c7 !important">' +
          '<div class="kpi-ic">' + App.icon('box', 18) + '</div>' +
          '<div class="kpi-lb">TOTAL INVENTORY ITEMS</div>' +
          '<div class="kpi-nm" style="color:#0284c7">' + S.rows.length + '</div>' +
          '<div class="kpi-sb">Tracked in lab catalog</div>' +
        '</div>' +
        '<div class="kpi t-amber" style="border-left:4px solid #d97706 !important">' +
          '<div class="kpi-ic">' + App.icon('alert', 18) + '</div>' +
          '<div class="kpi-lb">LOW / OUT OF STOCK</div>' +
          '<div class="kpi-nm" style="color:#d97706">' + (S.low + S.out) + '</div>' +
          '<div class="kpi-sb">' + S.out + ' out of stock • ' + S.low + ' low balance</div>' +
        '</div>' +
        '<div class="kpi t-purple" style="border-left:4px solid #7c3aed !important">' +
          '<div class="kpi-ic">' + App.icon('clock', 18) + '</div>' +
          '<div class="kpi-lb">EXPIRING IN ' + S.warnDays + ' DAYS</div>' +
          '<div class="kpi-nm" style="color:#7c3aed">' + S.soon + '</div>' +
          '<div class="kpi-sb">Reagent lots near expiry</div>' +
        '</div>' +
        '<div class="kpi t-red" style="border-left:4px solid #dc2626 !important">' +
          '<div class="kpi-ic">' + App.icon('x', 18) + '</div>' +
          '<div class="kpi-lb">EXPIRED LOTS</div>' +
          '<div class="kpi-nm" style="color:' + (S.expired > 0 ? '#dc2626' : 'var(--muted)') + '">' + S.expired + '</div>' +
          '<div class="kpi-sb">Requires disposal / waste log</div>' +
        '</div>' +
      '</div>' +

      /* Top Horizontal View Tabs */
      '<div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--bd,#e2e8f0);padding-bottom:10px;flex-wrap:wrap">' +
        '<button class="btn btn-sm ' + (curTab === 'items' ? 'btn-primary' : 'btn-secondary') + '" id="tabItems" style="font-weight:700;display:inline-flex;align-items:center;gap:6px;' + (curTab !== 'items' ? 'background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink)' : '') + '">' + App.icon('box', 15) + ' Inventory Stock &amp; Items</button>' +
        '<button class="btn btn-sm ' + (curTab === 'moves' ? 'btn-primary' : 'btn-secondary') + '" id="tabMoves" style="font-weight:700;display:inline-flex;align-items:center;gap:6px;' + (curTab !== 'moves' ? 'background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink)' : '') + '">' + App.icon('tube', 15) + ' Movement Log &amp; History</button>' +
        '<button class="btn btn-sm ' + (curTab === 'alerts' ? 'btn-primary' : 'btn-secondary') + '" id="tabAlerts" style="font-weight:700;display:inline-flex;align-items:center;gap:6px;' + (curTab !== 'alerts' ? 'background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink)' : '') + '">' + App.icon('alert', 15) + ' Reorder &amp; Expiry Alerts ' + (al.length ? '<span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px">' + al.length + '</span>' : '') + '</button>' +
      '</div>';

    /* Tab 1: Inventory Stock Items */
    if (curTab === 'items') {
      if (al.length) {
        h += '<div class="sk-alert"><b>⚠️ Stock alerts needing immediate attention:</b><br>' + al.slice(0, 6).map(function (r) {
          var bits = []; if (r.out) bits.push('<span style="color:#b91c1c;font-weight:800">out of stock</span>'); else if (r.low) bits.push('only ' + num(r.onHand) + ' ' + esc(r.item.unit || '') + ' left (reorder at ' + num(r.item.reorderLevel) + ')');
          if (r.expired) bits.push('<span style="color:#b91c1c">' + num(r.expiredQty) + ' expired</span>'); if (r.soon) bits.push(num(r.soonQty) + ' expiring by ' + fdate(r.nearest));
          return '• <b>' + esc(r.item.name) + '</b> — ' + bits.join(', ');
        }).join('<br>') + (al.length > 6 ? '<br>…and <b>' + (al.length - 6) + ' more</b> in Alerts tab' : '') + '</div>';
      }

      h += '<div class="card" style="margin-bottom:16px"><div class="sk-bar">' +
        '<input class="input grow" id="skQ" placeholder="Search item, category, vendor…" value="' + esc(F.q) + '">' +
        '<select class="select" id="skShow">' +
          '<option value="all"' + (F.show === 'all' ? ' selected' : '') + '>All items</option>' +
          '<option value="alerts"' + (F.show === 'alerts' ? ' selected' : '') + '>Only items needing attention</option>' +
          '<option value="low"' + (F.show === 'low' ? ' selected' : '') + '>Low stock only</option>' +
          '<option value="out"' + (F.show === 'out' ? ' selected' : '') + '>Out of stock only</option>' +
          '<option value="exp"' + (F.show === 'exp' ? ' selected' : '') + '>Expiring or expired</option>' +
        '</select>' +
        '<select class="select" id="skWarn" title="How early to warn before a lot expires">' + warnOpts(S.warnDays) + '</select>' +
        (canEdit() ? '<button class="btn btn-primary" id="skRecv">+ Receive stock</button>' +
          '<button class="btn btn-secondary" id="skMove" style="background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink);font-weight:600;display:inline-flex;align-items:center;gap:6px">🚚 Move / Use</button>' +
          '<button class="btn btn-secondary" id="skAdd" style="background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink);font-weight:600;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,.04)">+ Add item</button>' : '') +
      '</div></div>';

      if (!S.rows.length) {
        h += '<div class="card"><div class="card-b">' + App.empty('No stock items yet. Click "+ Add item" or "⚡ Lab Catalog" to seed common clinical supplies, then click "+ Receive stock" to add stock batches.') + '</div></div>';
      } else {
        h += '<div class="card"><div class="tbl-wrap"><table class="table"><thead><tr><th>Item</th><th>On hand</th><th>Reorder at</th><th>Nearest expiry</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody>' +
          (rows.length ? rows.map(function (r) {
            var it = r.item;
            return '<tr><td><div class="sk-name">' + esc(it.name) + '</div><div class="sk-sub">' + esc([it.category, it.vendor].filter(Boolean).join(' · ')) + '</div></td>' +
              '<td><span class="sk-num">' + num(r.onHand) + '</span> <span class="sk-sub">' + esc(it.unit || '') + '</span></td>' +
              '<td class="muted">' + (+it.reorderLevel ? num(it.reorderLevel) : '—') + '</td>' +
              '<td class="muted">' + fdate(r.nearest) + '</td><td>' + statusChips(r) + '</td>' +
              '<td class="actions" style="text-align:right">' + (canEdit() ? '<button class="btn btn-primary btn-sm" data-recv="' + esc(it.id) + '">Receive</button><button class="btn btn-ghost btn-sm" data-use="' + esc(it.id) + '" title="Move to department / use / waste / adjust">Move / Use</button>' : '') +
              '<button class="btn btn-ghost btn-sm" data-hist="' + esc(it.id) + '">History</button>' + (canEdit() ? '<button class="btn btn-ghost btn-sm" data-edit="' + esc(it.id) + '">Edit</button>' : '') + '</td></tr>';
          }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No stock items match your search.</td></tr>') + '</tbody></table></div></div>';
      }
    }

    /* Tab 2: Movement Log & History */
    else if (curTab === 'moves') {
      var moves = (DB.all('stock_moves') || []).slice().sort(function (a, b) {
        return String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date));
      });
      var mq = (F.mq || '').toLowerCase();
      var filteredMoves = moves.filter(function (m) {
        if (F.moveType !== 'all') {
          if (F.moveType === 'in' && m.type !== 'in') return false;
          if (F.moveType === 'out' && m.type !== 'out') return false;
          if (F.moveType === 'waste' && m.type !== 'waste') return false;
          if (F.moveType === 'adjust' && m.type !== 'adjust') return false;
          if (F.moveType === 'transfer' && m.type !== 'transfer') return false;
        }
        if (mq) {
          var it = DB.get('stock_items', m.itemId) || {};
          var str = (it.name || '') + ' ' + (m.lot || '') + ' ' + (m.note || '') + ' ' + (m.ref || '') + ' ' + (m.dest || '') + ' ' + (m.by || '');
          if (str.toLowerCase().indexOf(mq) < 0) return false;
        }
        return true;
      });

      h += '<div class="card" style="margin-bottom:16px"><div class="sk-bar">' +
        '<input class="input grow" id="skMq" placeholder="Search movement note, lot, reagent, user…" value="' + esc(F.mq || '') + '">' +
        '<select class="select" id="skMoveType">' +
          '<option value="all"' + (F.moveType === 'all' ? ' selected' : '') + '>All movement types</option>' +
          '<option value="transfer"' + (F.moveType === 'transfer' ? ' selected' : '') + '>Transfers to Department / Machine (−)</option>' +
          '<option value="in"' + (F.moveType === 'in' ? ' selected' : '') + '>Received deliveries (+)</option>' +
          '<option value="out"' + (F.moveType === 'out' ? ' selected' : '') + '>Used for tests / routine (−)</option>' +
          '<option value="waste"' + (F.moveType === 'waste' ? ' selected' : '') + '>Wasted / expired (−)</option>' +
          '<option value="adjust"' + (F.moveType === 'adjust' ? ' selected' : '') + '>Adjustments &amp; counts (±)</option>' +
        '</select>' +
        (canEdit() ? '<button class="btn btn-primary" id="skRecv">+ Receive stock</button>' +
          '<button class="btn btn-secondary" id="skUseQuick" style="background:#fff;border:1.5px solid var(--bd,#cbd5e1);color:var(--ink);font-weight:600">🚚 Move / Use</button>' : '') +
      '</div></div>';

      h += '<div class="card"><div class="tbl-wrap"><table class="table"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Quantity</th><th>Lot &amp; Expiry</th><th>Note / Ref</th><th>Recorded by</th><th style="text-align:right"></th></tr></thead><tbody>' +
        (filteredMoves.length ? filteredMoves.slice(0, 300).map(function (m) {
          var it = DB.get('stock_items', m.itemId) || { name: 'Unknown item', unit: '' };
          var t = MT[m.type] || [m.type, 'soon'];
          var qStr = (m.type === 'in' || (m.type === 'adjust' && m.qty >= 0) ? '+' : '−') + num(Math.abs(m.qty));
          var destLine = m.dest ? '<div style="color:#0284c7;font-weight:700;font-size:12px">↳ To ' + esc(m.dest) + '</div>' : '';
          return '<tr><td><span style="font-weight:600">' + fdate(m.date) + '</span></td>' +
            '<td><div class="sk-name">' + esc(it.name) + '</div><div class="sk-sub">' + esc(it.category || '') + '</div></td>' +
            '<td><span class="sk-chip ' + t[1] + '">' + t[0] + '</span>' + destLine + '</td>' +
            '<td><b class="sk-num">' + qStr + '</b> <span class="sk-sub">' + esc(it.unit || '') + '</span></td>' +
            '<td class="sk-sub">' + esc([m.lot ? 'Lot: ' + m.lot : '', m.expiry ? 'Exp: ' + fdate(m.expiry) : ''].filter(Boolean).join(' • ') || '—') + '</td>' +
            '<td class="sk-sub">' + esc(m.note || m.ref || '—') + '</td>' +
            '<td class="sk-sub">' + esc(m.by || '—') + '</td>' +
            '<td class="actions" style="text-align:right">' + (canEdit() ? '<button class="btn btn-ghost btn-sm" data-delmv="' + esc(m.id) + '" title="Delete this entry (undo)">✕</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No stock movements found.</td></tr>') +
      '</tbody></table></div></div>';
    }

    /* Tab 3: Reorder & Expiry Alerts */
    else if (curTab === 'alerts') {
      h += '<div class="card"><div class="card-h"><h3 style="margin:0">🚨 Items Requiring Action (Low Stock, Expirations &amp; Out of Stock)</h3></div>' +
        '<div class="tbl-wrap"><table class="table"><thead><tr><th>Item</th><th>On hand</th><th>Reorder level</th><th>Nearest expiry</th><th>Alert status</th><th style="text-align:right">Actions</th></tr></thead><tbody>' +
        (al.length ? al.map(function (r) {
          var it = r.item;
          return '<tr><td><div class="sk-name">' + esc(it.name) + '</div><div class="sk-sub">' + esc([it.category, it.vendor].filter(Boolean).join(' · ')) + '</div></td>' +
            '<td><span class="sk-num" style="color:' + (r.out ? '#dc2626' : (r.low ? '#d97706' : 'inherit')) + '">' + num(r.onHand) + '</span> <span class="sk-sub">' + esc(it.unit || '') + '</span></td>' +
            '<td class="muted">' + (+it.reorderLevel ? num(it.reorderLevel) : '—') + '</td>' +
            '<td class="muted" style="color:' + (r.expired ? '#dc2626' : (r.soon ? '#d97706' : 'inherit')) + '">' + fdate(r.nearest) + '</td>' +
            '<td>' + statusChips(r) + '</td>' +
            '<td class="actions" style="text-align:right">' + (canEdit() ? '<button class="btn btn-primary btn-sm" data-recv="' + esc(it.id) + '">Receive Stock</button>' : '') +
            '<button class="btn btn-ghost btn-sm" data-hist="' + esc(it.id) + '">History</button></td></tr>';
        }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#16a34a;font-weight:700">✓ All stock levels are healthy! No low stock or expired lots detected.</td></tr>') +
      '</tbody></table></div></div>';
    }

    v.innerHTML = h;
    wire(v, rows, S);
  }

  function wire(v, rows, S) {
    function on(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
    on('skQ', 'input', function (e) { F.q = e.target.value.trim(); var p = e.target.selectionStart; render(); var n = document.getElementById('skQ'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (x) {} } });
    on('skShow', 'change', function (e) { F.show = e.target.value; render(); });
    on('skMq', 'input', function (e) { F.mq = e.target.value.trim(); var p = e.target.selectionStart; render(); var n = document.getElementById('skMq'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (x) {} } });
    on('skMoveType', 'change', function (e) { F.moveType = e.target.value; render(); });
    on('skWarn', 'change', function (e) {
      var val = e.target.value;
      if (val === 'custom') { warnCustom(S.warnDays); return; }
      try { DB.update('settings', 'main', { stockExpiryDays: +val }); } catch (x) {} render();
    });
    on('tabItems', 'click', function () { F.tab = 'items'; render(); });
    on('tabMoves', 'click', function () { F.tab = 'moves'; render(); });
    on('tabAlerts', 'click', function () { F.tab = 'alerts'; render(); });

    on('skAdd', 'click', function () { itemForm(null); });
    on('skAddTop', 'click', function () { itemForm(null); });
    on('skRecv', 'click', function () { receive(''); });
    on('skRecvTop', 'click', function () { receive(''); });
    on('skMove', 'click', function () { useForm(''); });
    on('skMoveTop', 'click', function () { useForm(''); });
    on('skUseQuick', 'click', function () { useForm(''); });
    on('skCsvExport', 'click', function () { exportCsv(F.tab, rows, S); });
    on('skSeedCatTop', 'click', function () {
      var n = seedStockCatalog(true);
      App.toast('Loaded ' + n + ' clinical lab items & reagents into stock catalog.');
      render();
    });

    function each(attr, fn) { Array.prototype.forEach.call(v.querySelectorAll('[' + attr + ']'), function (b) { b.addEventListener('click', function () { fn(b.getAttribute(attr)); }); }); }
    each('data-recv', receive);
    each('data-use', useForm);
    each('data-hist', history);
    each('data-edit', function (id) { itemForm(DB.get('stock_items', id)); });
    each('data-delmv', function (mId) {
      App.confirm('Delete this stock entry? The on-hand number will be recalculated.').then(function (ok) {
        if (!ok) return;
        DB.remove('stock_moves', mId);
        App.toast('Stock move removed');
        render();
      });
    });
  }

  function itemOptions(sel) {
    return (DB.all('stock_items') || []).filter(function (i) { return i.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit || '') + ')</option>'; }).join('');
  }

  function itemForm(it) {
    var isNew = !it; it = it || { name: '', unit: 'tests', category: '', vendor: '', reorderLevel: '' };
    var quickPresetHtml = isNew ?
      ('<div style="grid-column:1/-1;margin-bottom:6px;background:#f8fafc;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:10px">' +
        '<label class="label" style="font-size:11.5px;color:var(--brand-d);font-weight:800;margin-bottom:4px;display:block">⚡ Quick Select Standard Lab Item / Reagent:</label>' +
        '<select class="select" id="siPresetPick" style="width:100%;font-size:13px;background:#fff">' +
          '<option value="">-- Choose common lab item to auto-fill --</option>' +
          LAB_COMMON_ITEMS.map(function (c, idx) { return '<option value="' + idx + '">' + esc(c.name) + ' (' + esc(c.category) + ' · ' + esc(c.unit) + ')</option>'; }).join('') +
        '</select>' +
      '</div>') : '';
    App.modal(isNew ? 'Add inventory item' : 'Edit inventory item',
      '<div class="form-grid">' +
      quickPresetHtml +
      '<div style="grid-column:1/-1"><label class="label">Item name *</label><input class="input" id="siName" maxlength="80" placeholder="e.g. CBC reagent kit" value="' + esc(it.name) + '"></div>' +
      '<div><label class="label">Unit *</label><input class="input" id="siUnit" list="siUnits" maxlength="12" value="' + esc(it.unit || '') + '"><datalist id="siUnits">' + UNITS.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist>' +
      '<div class="sk-sub" style="margin-top:3px">For a kit that runs 500 tests, use "tests" and receive 500.</div></div>' +
      '<div><label class="label">Alert when stock falls to</label><input class="input" id="siRe" type="number" min="0" step="any" placeholder="e.g. 50" value="' + esc(it.reorderLevel) + '"></div>' +
      '<div><label class="label">Category</label><input class="input" id="siCat" maxlength="40" placeholder="Hematology, Chemistry…" value="' + esc(it.category || '') + '"></div>' +
      '<div><label class="label">Supplier</label><input class="input" id="siVen" maxlength="60" value="' + esc(it.vendor || '') + '"></div></div>' +
      '<div class="actions" style="margin-top:16px">' + (isNew ? '' : '<button class="btn btn-ghost" id="siDel" style="margin-right:auto;color:#b91c1c">Remove item</button>') +
      '<button class="btn btn-ghost" id="siCancel">Cancel</button><button class="btn btn-primary" id="siSave">Save</button></div>',
      { onOpen: function (ov, close) {
          var $ = function (id) { return ov.querySelector('#' + id); };
          var pr = $('siPresetPick');
          if (pr) {
            pr.addEventListener('change', function () {
              var idx = pr.value;
              if (idx !== '' && LAB_COMMON_ITEMS[idx]) {
                var itemObj = LAB_COMMON_ITEMS[idx];
                $('siName').value = itemObj.name;
                $('siUnit').value = itemObj.unit;
                $('siCat').value = itemObj.category;
                $('siVen').value = itemObj.vendor;
                $('siRe').value = itemObj.reorderLevel;
              }
            });
          }
          $('siCancel').addEventListener('click', close);
          $('siSave').addEventListener('click', function () {
            var name = $('siName').value.trim(), unit = $('siUnit').value.trim();
            if (!name) { App.toast('Enter the item name', 'err'); return; } if (!unit) { App.toast('Enter a unit (tests, kit, ml…)', 'err'); return; }
            var dup = (DB.all('stock_items') || []).some(function (x) { return x.id !== it.id && x.active !== false && String(x.name).toLowerCase() === name.toLowerCase(); });
            if (dup) { App.toast('An item with this name already exists', 'err'); return; }
            var data = { name: name, unit: unit, category: $('siCat').value.trim(), vendor: $('siVen').value.trim(), reorderLevel: Math.max(0, +$('siRe').value || 0), active: true };
            if (isNew) DB.insert('stock_items', data); else DB.update('stock_items', it.id, data);
            close(); App.toast(isNew ? 'Item added. Now click "Receive stock" to record the first delivery.' : 'Item updated.'); render();
          });
          var d = $('siDel'); if (d) d.addEventListener('click', function () {
            App.confirm('Remove "' + it.name + '" from stock? Its history stays in the records, but it will no longer be tracked.').then(function (ok) {
              if (!ok) return; DB.update('stock_items', it.id, { active: false }); close(); App.toast('Item removed.'); render();
            });
          });
          setTimeout(function () { $('siName').focus(); }, 50);
        } });
  }

  function receive(itemId) {
    if (!(DB.all('stock_items') || []).length) { App.toast('Add an item first', 'err'); itemForm(null); return; }
    App.modal('Receive stock (Delivery)',
      '<div class="form-grid"><div style="grid-column:1/-1"><label class="label">Item *</label><select class="select" id="rcItem">' + itemOptions(itemId) + '</select></div>' +
      '<div><label class="label">Quantity received *</label><input class="input" id="rcQty" type="number" min="0" step="any" placeholder="e.g. 500"></div>' +
      '<div><label class="label">Expiry date</label><input class="input" id="rcExp" type="date"></div>' +
      '<div><label class="label">Lot / batch no.</label><input class="input" id="rcLot" maxlength="30"></div>' +
      '<div><label class="label">Note</label><input class="input" id="rcNote" maxlength="80" placeholder="Supplier invoice no."></div></div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="rcCancel">Cancel</button><button class="btn btn-primary" id="rcSave">Add to stock</button></div>',
      { onOpen: function (ov, close) {
          var $ = function (id) { return ov.querySelector('#' + id); };
          $('rcCancel').addEventListener('click', close);
          $('rcSave').addEventListener('click', function () {
            var q = +$('rcQty').value; if (!(q > 0)) { App.toast('Enter the quantity received', 'err'); return; }
            var exp = $('rcExp').value; if (exp && exp < new Date().toISOString().slice(0, 10)) { if (!window.confirm('This expiry date is in the past. Add it anyway?')) return; }
            DB.insert('stock_moves', { itemId: $('rcItem').value, type: 'in', qty: q, lot: $('rcLot').value.trim(), expiry: exp, note: $('rcNote').value.trim(), date: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), by: (App.session() || {}).name || '' });
            close(); App.toast('Stock received successfully'); render();
          });
        } });
  }

  function useForm(itemId) {
    if (!(DB.all('stock_items') || []).length) { App.toast('Add an item first', 'err'); itemForm(null); return; }
    App.modal('🚚 Move / Transfer / Consume Stock',
      '<div class="form-grid">' +
      '<div style="grid-column:1/-1"><label class="label">Item *</label><select class="select" id="ufItem">' + itemOptions(itemId) + '</select>' +
        '<div id="ufAvailInfo" style="margin-top:6px;font-size:12px;color:var(--muted)"></div></div>' +
      '<div style="grid-column:1/-1"><label class="label">Movement Action *</label><select class="select" id="ufType">' +
        '<option value="transfer">🚚 Move / Transfer to Lab Dept / Analyzer / Branch (−)</option>' +
        '<option value="out">📉 Routine consumption / used in test (−)</option>' +
        '<option value="waste">🗑️ Wasted / spilled / expired - dispose (−)</option>' +
        '<option value="adjust+">➕ Correction: Add (found extra) (+)</option>' +
        '<option value="adjust-">➖ Correction: Remove (count is lower) (−)</option>' +
      '</select></div>' +
      '<div id="ufDestGroup" style="grid-column:1/-1"><label class="label">Destination Department / Machine / Branch *</label>' +
        '<input class="input" id="ufDest" list="labDepts" placeholder="e.g. Hematology Lab, Chemistry Analyzer, Phlebotomy, Satellite Branch">' +
        '<datalist id="labDepts">' +
          '<option value="Hematology Lab">' +
          '<option value="Biochemistry Lab">' +
          '<option value="Microbiology / Culture">' +
          '<option value="Serology & Immunology">' +
          '<option value="Phlebotomy / Collection Desk">' +
          '<option value="Main Chemistry Analyzer">' +
          '<option value="Hematology Analyzer (Sysmex/Mindray)">' +
          '<option value="Satellite Branch 1">' +
          '<option value="Emergency Room Counter">' +
        '</datalist>' +
        '<div class="sk-sub" style="margin-top:4px">Specify which lab section, analyzer bench, or collection branch is receiving this stock.</div>' +
      '</div>' +
      '<div><label class="label">Quantity *</label><input class="input" id="ufQty" type="number" min="0" step="any" placeholder="e.g. 10"></div>' +
      '<div><label class="label">Movement Date</label><input class="input" id="ufDate" type="date"></div>' +
      '<div style="grid-column:1/-1"><label class="label">Note / Reference</label><input class="input" id="ufNote" maxlength="120" placeholder="e.g. Sent to morning shift bench / monthly adjustment"></div></div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="ufCancel">Cancel</button><button class="btn btn-primary" id="ufSave">Record Movement</button></div>',
      { onOpen: function (ov, close) {
          var $ = function (id) { return ov.querySelector('#' + id); };
          $('ufDate').value = new Date().toISOString().slice(0, 10);

          function updateStockInfo() {
            var itId = $('ufItem').value;
            var it = DB.get('stock_items', itId);
            if (!it) { $('ufAvailInfo').innerHTML = ''; return; }
            var st = App.stockState ? App.stockState() : null;
            var row = st && st.rows ? st.rows.filter(function(r){ return r.item.id === itId; })[0] : null;
            var onHand = row ? row.onHand : 0;
            $('ufAvailInfo').innerHTML = '📦 Current on-hand in main inventory: <b style="color:' + (onHand <= 0 ? '#dc2626' : '#047857') + '">' + num(onHand) + '</b> ' + esc(it.unit || '') + (row && row.low ? ' <span class="sk-chip low">Low Stock</span>' : '');
          }

          function toggleDest() {
            var t = $('ufType').value;
            $('ufDestGroup').style.display = (t === 'transfer') ? 'block' : 'none';
          }

          $('ufItem').addEventListener('change', updateStockInfo);
          $('ufType').addEventListener('change', toggleDest);
          updateStockInfo();
          toggleDest();

          $('ufCancel').addEventListener('click', close);
          $('ufSave').addEventListener('click', function () {
            var q = +$('ufQty').value; if (!(q > 0)) { App.toast('Enter a valid quantity', 'err'); return; }
            var itId = $('ufItem').value;
            var t = $('ufType').value;
            var isTrf = (t === 'transfer');
            var dest = isTrf ? $('ufDest').value.trim() : '';
            var type = (t.indexOf('adjust') === 0) ? 'adjust' : t;
            var qty = (t === 'adjust-') ? -q : q;
            var note = $('ufNote').value.trim();
            var date = $('ufDate').value || new Date().toISOString().slice(0, 10);

            DB.insert('stock_moves', {
              itemId: itId,
              type: type,
              qty: qty,
              dest: dest,
              note: note,
              date: date,
              createdAt: new Date().toISOString(),
              by: (App.session() || {}).name || ''
            });
            close();
            App.toast(isTrf ? 'Stock transferred successfully' : 'Stock movement recorded');
            render();
          });
        } });
  }

  var MT = { in: ['Received', 'ok'], out: ['Used', 'soon'], waste: ['Wasted', 'out'], adjust: ['Correction', 'soon'], transfer: ['Transfer', 'trf'] };
  function history(itemId) {
    var it = DB.get('stock_items', itemId); if (!it) return;
    var mv = (DB.all('stock_moves') || []).filter(function (m) { return m.itemId === itemId; }).sort(function (a, b) { return String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)); });
    App.modal('History — ' + esc(it.name),
      (mv.length ? '<div style="max-height:56vh;overflow:auto"><table class="sk-h"><thead><tr><th>Date</th><th>What</th><th>Qty</th><th>Lot / expiry</th><th>Note</th>' + (canEdit() ? '<th></th>' : '') + '</tr></thead><tbody>' +
        mv.slice(0, 200).map(function (m) {
          var t = MT[m.type] || [m.type, 'soon'], q = (m.type === 'in' || (m.type === 'adjust' && m.qty >= 0) ? '+' : '−') + num(Math.abs(m.qty));
          var destLine = m.dest ? '<div style="color:#0284c7;font-weight:700;font-size:11.5px">↳ To ' + esc(m.dest) + '</div>' : '';
          return '<tr><td>' + fdate(m.date) + '</td><td><span class="sk-chip ' + t[1] + '">' + t[0] + '</span>' + destLine + '</td><td><b>' + q + '</b> <span class="sk-sub">' + esc(it.unit || '') + '</span></td>' +
            '<td class="sk-sub">' + esc([m.lot, m.expiry ? 'exp ' + fdate(m.expiry) : ''].filter(Boolean).join(' · ') || '—') + '</td><td class="sk-sub">' + esc(m.note || m.ref || '') + '</td>' +
            (canEdit() ? '<td><button class="btn btn-ghost btn-sm" data-delmv="' + esc(m.id) + '" title="Delete this entry (undo)">✕</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' : App.empty('No movements yet')) +
      '<div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="hsClose">Close</button></div>',
      { wide: true, onOpen: function (ov, close) {
          ov.querySelector('#hsClose').addEventListener('click', close);
          Array.prototype.forEach.call(ov.querySelectorAll('[data-delmv]'), function (b) {
            b.addEventListener('click', function () {
              App.confirm('Delete this stock entry? The on-hand number will be recalculated.').then(function (ok) {
                if (!ok) return; DB.remove('stock_moves', b.getAttribute('data-delmv')); close(); render(); history(itemId);
              });
            });
          });
        } });
  }

  function routeHandler(params) {
    var s = App.session();
    if (!s || (s.role !== 'admin' && s.role !== 'technician' && s.role !== 'reception' && !(s.role === 'custom' && (App.canPage('stock') || App.canPage('inventory'))))) {
      document.getElementById('view').innerHTML = '<div class="card"><div class="card-b">' + App.empty('You do not have access to Inventory.') + '</div></div>';
      return;
    }
    if (params && params.tab && (params.tab === 'items' || params.tab === 'moves' || params.tab === 'alerts')) {
      F.tab = params.tab;
    }
    render();
  }

  App.route('#/inventory', routeHandler);
  App.route('#/inventory/:tab', routeHandler);
  App.route('#/stock', routeHandler);
  App.route('#/stock/:tab', routeHandler);
})();
