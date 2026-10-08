/* Optix Medical Sync — Stock (#/stock): reagents, kits and consumables.
   Receive stock (lot + expiry), it is used up automatically when a test result is saved (Tests -> edit -> "Stock used per test"),
   record waste / corrections, and get alerts for low stock, expiring and expired lots. All numbers come from the movement log (App.stockState). */
(function () {
  'use strict';
  var esc = App.esc;
  var F = { q: '', show: 'all' };
  var UNITS = ['tests', 'kit', 'vial', 'bottle', 'box', 'pack', 'pcs', 'ml', 'L', 'g'];

  var CSS = '' +
    '.sk-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}' +
    '.sk-st{padding:14px 16px;cursor:default}.sk-st .k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}' +
    '.sk-st b{display:block;font-size:26px;margin-top:4px;color:var(--ink)}.sk-st.bad b{color:#b91c1c}.sk-st.warn b{color:#b45309}' +
    '.sk-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 18px}.sk-bar .grow{flex:1;min-width:200px}' +
    '.sk-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap;margin:1px 4px 1px 0}' +
    '.sk-chip.ok{background:#e6f7f0;color:#047857}.sk-chip.low{background:#fff4e0;color:#b45309}.sk-chip.out{background:#fdecec;color:#b91c1c}.sk-chip.exp{background:#fdecec;color:#b91c1c}.sk-chip.soon{background:#fff4e0;color:#b45309}' +
    '.sk-alert{border:1px solid #f0d9a0;background:#fff8e6;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13.5px;line-height:1.7}' +
    '.sk-name{font-weight:700;color:var(--ink)}.sk-sub{font-size:12px;color:var(--muted)}.sk-num{font-weight:800;font-size:15px}' +
    '.sk-h{width:100%;border-collapse:collapse}.sk-h th,.sk-h td{padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;text-align:left}' +
    '@media(max-width:900px){.sk-stats{grid-template-columns:1fr 1fr}}';
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
    var h = '<div class="sk-stats">' +
      '<div class="card sk-st"><div class="k">Items</div><b>' + S.rows.length + '</b></div>' +
      '<div class="card sk-st ' + (S.low + S.out ? 'warn' : '') + '"><div class="k">Low / out of stock</div><b>' + (S.low + S.out) + '</b></div>' +
      '<div class="card sk-st ' + (S.soon ? 'warn' : '') + '"><div class="k">Expiring in ' + S.warnDays + ' days</div><b>' + S.soon + '</b></div>' +
      '<div class="card sk-st ' + (S.expired ? 'bad' : '') + '"><div class="k">Expired</div><b>' + S.expired + '</b></div></div>';
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
      '<select class="select" id="skWarn" title="How early to warn before a lot expires">' + [15, 30, 60, 90].map(function (d) { return '<option value="' + d + '"' + (S.warnDays === d ? ' selected' : '') + '>Warn ' + d + ' days before expiry</option>'; }).join('') + '</select>' +
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
    on('skWarn', 'change', function (e) { try { DB.update('settings', 'main', { stockExpiryDays: +e.target.value }); } catch (x) {} render(); });
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
