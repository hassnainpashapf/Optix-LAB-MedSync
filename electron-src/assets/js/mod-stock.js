/* Optix Medical Sync — Stock (#/stock): reagents, kits and consumables.
   Receive stock (lot + expiry), it is used up automatically when a test result is saved (Tests -> edit -> "Stock used per test"),
   record waste / corrections, and get alerts for low stock, expiring and expired lots. All numbers come from the movement log (App.stockState). */
(function () {
  'use strict';
  var esc = App.esc;
  var F = { q: '', show: 'all' };
  var UNITS = ['tests', 'kit', 'vial', 'bottle', 'box', 'pack', 'pcs', 'ml', 'L', 'g'];

  var CSS = '' +
    '.sk-bar{display:flex;gap:10px;flex-wrap:nowrap;align-items:center;padding:14px 18px}' +
    '.sk-bar .grow{flex:1 1 auto;min-width:200px;width:auto}' +
    '.sk-bar .select{flex:0 0 auto;width:auto;max-width:100%}' +
    '.sk-bar .btn{flex:0 0 auto;white-space:nowrap}' +
    '.sk-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap;margin:1px 4px 1px 0}' +
    '.sk-chip.ok{background:#e6f7f0;color:#047857}.sk-chip.low{background:#fff4e0;color:#b45309}.sk-chip.out{background:#fdecec;color:#b91c1c}.sk-chip.exp{background:#fdecec;color:#b91c1c}.sk-chip.soon{background:#fff4e0;color:#b45309}' +
    '.sk-alert{border:1px solid #f0d9a0;background:#fff8e6;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13.5px;line-height:1.7}' +
    '.sk-name{font-weight:700;color:var(--ink)}.sk-sub{font-size:12px;color:var(--muted)}.sk-num{font-weight:800;font-size:15px}' +
    '.sk-h{width:100%;border-collapse:collapse}.sk-h th,.sk-h td{padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;text-align:left}' +
    '@media(max-width:760px){.sk-bar{flex-wrap:wrap}.sk-bar .grow{flex:1 1 100%;min-width:0}}';
  function css() { if (document.getElementById('skCss')) return; var s = document.createElement('style'); s.id = 'skCss'; s.textContent = CSS; document.head.appendChild(s); }

  function num(n) { n = Math.round((+n || 0) * 100) / 100; return String(n); }
  function fdate(d) { return d ? App.d(d) : '—'; }
  function canEdit() { var s = App.session(); return !!s && (s.role === 'admin' || s.role === 'technician' || (s.role === 'custom' && App.canPage('stock'))); }

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

  var STAT_TINTS = {
    brand: { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    navy:  { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#a9c9ec', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e9cb96', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#9fd8b8', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e6aaaa', soft: '#fdecec', circle: '#fad2d2' }
  };

  function statCard(icon, tint, label, value, sub) {
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:1.5px solid ' + c.line + ' !important;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
      '<div style="position:absolute;top:-30px;right:-30px;width:90px;height:90px;border-radius:50%;background:' + c.circle + ';opacity:0.65;pointer-events:none"></div>' +
      '<div class="stat-ico" style="position:relative;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:' + c.sc + ';background:linear-gradient(135deg,' + c.soft + ' 0%,#ffffff 160%);box-shadow:inset 0 0 0 1px ' + c.line + ',0 1px 3px rgba(15,30,46,.06);margin-bottom:6px;flex:0 0 auto">' + icon + '</div>' +
      '<div class="lb" style="position:relative;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;flex:0 0 auto">' + App.esc(label) + '</div>' +
      '<div class="vl" style="position:relative;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 0 4px 0;flex:0 0 auto">' + value + '</div>' +
      '<div class="dl" style="position:relative;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">' + sub + '</div>' +
      '</div>';
  }

  function render() {
    css();
    var v = document.getElementById('view'); if (!v) return;
    var S = App.stockState(), q = F.q.toLowerCase();
    var rows = S.rows.filter(function (r) {
      if (q && (r.item.name + ' ' + (r.item.category || '') + ' ' + (r.item.vendor || '')).toLowerCase().indexOf(q) < 0) return false;
      if (F.show === 'alerts') return r.out || r.low || r.expired || r.soon;
      return true;
    }).sort(function (a, b) {
      var sa = (a.out || a.expired ? 0 : (a.low || a.soon ? 1 : 2)), sb = (b.out || b.expired ? 0 : (b.low || b.soon ? 1 : 2));
      return sa - sb || String(a.item.name).localeCompare(String(b.item.name));
    });
    var al = S.rows.filter(function (r) { return r.out || r.low || r.expired || r.soon; });
    var I_BOX = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4L7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>';
    var I_WARN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    var I_CAL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    var I_EXP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

    var h = '<div class="stat-grid">' +
      statCard(I_BOX, 'brand', 'Items', S.rows.length, 'tracked in stock') +
      statCard(I_WARN, 'amber', 'Low / out of stock', (S.low + S.out), 'need restocking') +
      statCard(I_CAL, 'blue', 'Expiring in ' + S.warnDays + ' days', S.soon, 'lots expiring soon') +
      statCard(I_EXP, 'red', 'Expired', S.expired, 'lots past expiry') +
      '</div>';
    if (al.length) {
      h += '<div class="sk-alert"><b>Needs attention</b><br>' + al.slice(0, 8).map(function (r) {
        var bits = []; if (r.out) bits.push('out of stock'); else if (r.low) bits.push('only ' + num(r.onHand) + ' ' + esc(r.item.unit || '') + ' left (reorder at ' + num(r.item.reorderLevel) + ')');
        if (r.expired) bits.push(num(r.expiredQty) + ' expired'); if (r.soon) bits.push(num(r.soonQty) + ' expiring by ' + fdate(r.nearest));
        return '• <b>' + esc(r.item.name) + '</b> — ' + bits.join(', ');
      }).join('<br>') + (al.length > 8 ? '<br>…and ' + (al.length - 8) + ' more' : '') + '</div>';
    }
    h += '<div class="card" style="margin-bottom:16px"><div class="sk-bar">' +
      '<input class="input grow" id="skQ" placeholder="Search item, category, vendor…" value="' + esc(F.q) + '">' +
      '<select class="select" id="skShow"><option value="all"' + (F.show === 'all' ? ' selected' : '') + '>All items</option><option value="alerts"' + (F.show === 'alerts' ? ' selected' : '') + '>Only items needing attention</option></select>' +
      '<select class="select" id="skWarn" title="How early to warn before a lot expires">' + warnOpts(S.warnDays) + '</select>' +
      (canEdit() ? '<button class="btn btn-primary" id="skRecv">+ Receive stock</button><button class="btn btn-ghost" id="skAdd">+ Add item</button>' : '') + '</div></div>';
    if (!S.rows.length) {
      h += '<div class="card"><div class="card-b">' + App.empty('No stock items yet. Click "Add item" for each reagent or consumable you buy (for example "CBC reagent kit"), then "Receive stock" when a delivery arrives.') + '</div></div>';
    } else {
      h += '<div class="card"><div class="tbl-wrap"><table class="table"><thead><tr><th>Item</th><th>On hand</th><th>Reorder at</th><th>Nearest expiry</th><th>Status</th><th></th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (r) {
          var it = r.item;
          return '<tr><td><div class="sk-name">' + esc(it.name) + '</div><div class="sk-sub">' + esc([it.category, it.vendor].filter(Boolean).join(' · ')) + '</div></td>' +
            '<td><span class="sk-num">' + num(r.onHand) + '</span> <span class="sk-sub">' + esc(it.unit || '') + '</span></td>' +
            '<td class="muted">' + (+it.reorderLevel ? num(it.reorderLevel) : '—') + '</td>' +
            '<td class="muted">' + fdate(r.nearest) + '</td><td>' + statusChips(r) + '</td>' +
            '<td class="actions">' + (canEdit() ? '<button class="btn btn-primary btn-sm" data-recv="' + esc(it.id) + '">Receive</button><button class="btn btn-ghost btn-sm" data-use="' + esc(it.id) + '">Use / waste</button>' : '') +
            '<button class="btn btn-ghost btn-sm" data-hist="' + esc(it.id) + '">History</button>' + (canEdit() ? '<button class="btn btn-ghost btn-sm" data-edit="' + esc(it.id) + '">Edit</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Nothing matches.</td></tr>') + '</tbody></table></div></div>';
    }
    v.innerHTML = h;
    wire(v);
  }

  function wire(v) {
    function on(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
    on('skQ', 'input', function (e) { F.q = e.target.value.trim(); var p = e.target.selectionStart; render(); var n = document.getElementById('skQ'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (x) {} } });
    on('skShow', 'change', function (e) { F.show = e.target.value; render(); });
    on('skWarn', 'change', function (e) {
      var v = e.target.value;
      if (v === 'custom') { warnCustom(S.warnDays); return; }
      try { DB.update('settings', 'main', { stockExpiryDays: +v }); } catch (x) {} render();
    });
    on('skAdd', 'click', function () { itemForm(null); });
    on('skRecv', 'click', function () { receive(''); });
    function each(attr, fn) { Array.prototype.forEach.call(v.querySelectorAll('[' + attr + ']'), function (b) { b.addEventListener('click', function () { fn(b.getAttribute(attr)); }); }); }
    each('data-recv', receive); each('data-use', useForm); each('data-hist', history); each('data-edit', function (id) { itemForm(DB.get('stock_items', id)); });
  }

  function itemOptions(sel) {
    return (DB.all('stock_items') || []).filter(function (i) { return i.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit || '') + ')</option>'; }).join('');
  }

  function itemForm(it) {
    var isNew = !it; it = it || { name: '', unit: 'tests', category: '', vendor: '', reorderLevel: '' };
    App.modal(isNew ? 'Add stock item' : 'Edit stock item',
      '<div class="form-grid">' +
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
          $('siCancel').addEventListener('click', close);
          $('siSave').addEventListener('click', function () {
            var name = $('siName').value.trim(), unit = $('siUnit').value.trim();
            if (!name) { App.toast('Enter the item name', 'err'); return; } if (!unit) { App.toast('Enter a unit (tests, kit, ml…)', 'err'); return; }
            var dup = (DB.all('stock_items') || []).some(function (x) { return x.id !== it.id && x.active !== false && String(x.name).toLowerCase() === name.toLowerCase(); });
            if (dup) { App.toast('An item with this name already exists', 'err'); return; }
            var data = { name: name, unit: unit, category: $('siCat').value.trim(), vendor: $('siVen').value.trim(), reorderLevel: Math.max(0, +$('siRe').value || 0), active: true };
            if (isNew) DB.insert('stock_items', data); else DB.update('stock_items', it.id, data);
            close(); App.toast(isNew ? 'Item added. Now use "Receive stock" for the first delivery.' : 'Item updated.'); render();
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
    App.modal('Receive stock',
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
            close(); App.toast('Stock received'); render();
          });
        } });
  }

  function useForm(itemId) {
    App.modal('Use / waste / correct stock',
      '<div class="form-grid"><div style="grid-column:1/-1"><label class="label">Item *</label><select class="select" id="ufItem">' + itemOptions(itemId) + '</select></div>' +
      '<div><label class="label">What happened *</label><select class="select" id="ufType"><option value="out">Used (not through a test)</option><option value="waste">Wasted / spilled / expired - throw away</option><option value="adjust+">Correction: add (found extra)</option><option value="adjust-">Correction: remove (count is lower)</option></select></div>' +
      '<div><label class="label">Quantity *</label><input class="input" id="ufQty" type="number" min="0" step="any"></div>' +
      '<div style="grid-column:1/-1"><label class="label">Note</label><input class="input" id="ufNote" maxlength="80" placeholder="e.g. monthly stock count"></div></div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="ufCancel">Cancel</button><button class="btn btn-primary" id="ufSave">Save</button></div>',
      { onOpen: function (ov, close) {
          var $ = function (id) { return ov.querySelector('#' + id); };
          $('ufCancel').addEventListener('click', close);
          $('ufSave').addEventListener('click', function () {
            var q = +$('ufQty').value; if (!(q > 0)) { App.toast('Enter the quantity', 'err'); return; }
            var t = $('ufType').value, type = t.indexOf('adjust') === 0 ? 'adjust' : t, qty = t === 'adjust-' ? -q : q;
            DB.insert('stock_moves', { itemId: $('ufItem').value, type: type, qty: qty, note: $('ufNote').value.trim(), date: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), by: (App.session() || {}).name || '' });
            close(); App.toast('Saved'); render();
          });
        } });
  }

  var MT = { in: ['Received', 'ok'], out: ['Used', 'soon'], waste: ['Wasted', 'out'], adjust: ['Correction', 'soon'] };
  function history(itemId) {
    var it = DB.get('stock_items', itemId); if (!it) return;
    var mv = (DB.all('stock_moves') || []).filter(function (m) { return m.itemId === itemId; }).sort(function (a, b) { return String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)); });
    App.modal('History — ' + esc(it.name),
      (mv.length ? '<div style="max-height:56vh;overflow:auto"><table class="sk-h"><thead><tr><th>Date</th><th>What</th><th>Qty</th><th>Lot / expiry</th><th>Note</th>' + (canEdit() ? '<th></th>' : '') + '</tr></thead><tbody>' +
        mv.slice(0, 200).map(function (m) {
          var t = MT[m.type] || [m.type, 'soon'], q = (m.type === 'in' || (m.type === 'adjust' && m.qty >= 0) ? '+' : '−') + num(Math.abs(m.qty));
          return '<tr><td>' + fdate(m.date) + '</td><td><span class="sk-chip ' + t[1] + '">' + t[0] + '</span></td><td><b>' + q + '</b> <span class="sk-sub">' + esc(it.unit || '') + '</span></td>' +
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

  App.route('#/stock', function () {
    var s = App.session();
    if (!s || (s.role !== 'admin' && s.role !== 'technician' && s.role !== 'reception' && !(s.role === 'custom' && App.canPage('stock')))) { document.getElementById('view').innerHTML = '<div class="card"><div class="card-b">' + App.empty('You do not have access to Stock.') + '</div></div>'; return; }
    render();
  });
})();
