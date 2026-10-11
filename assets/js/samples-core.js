/* Optix Medical Sync — Sample tracking core (loaded at boot, small).
   - App.barcodeSvg(text, opts): dependency-free Code128 (subset B) SVG generator (works offline, old Chromium).
   - window.Samples: data helpers used by billing / invoices / results / patients and the #/samples page
     (assets/js/mod-samples.js, lazy). One `samples` row = one physical tube/container.
   Everything is plain client-side DB operations, so it works offline in the desktop app and syncs like any table. */
(function () {
  'use strict';

  /* ================= Code128 subset B ================= */
  /* bar/space widths for symbol values 0..106 (6 digits; stop = 7 digits) */
  var C128 = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];
  var START_B = 104, STOP = 106;

  /* symbol values (start, data..., checksum, stop) for a text; non-printable chars become '-' */
  function code128Values(text) {
    var s = String(text == null ? '' : text).replace(/[^\x20-\x7e]/g, '-');
    var vals = [START_B], sum = START_B;
    for (var i = 0; i < s.length; i++) {
      var v = s.charCodeAt(i) - 32;
      vals.push(v);
      sum += v * (i + 1);
    }
    vals.push(sum % 103);
    vals.push(STOP);
    return vals;
  }
  /* run-length module widths, alternating bar/space starting with a bar */
  function code128Widths(text) {
    var vals = code128Values(text), out = [];
    for (var i = 0; i < vals.length; i++) {
      var p = C128[vals[i]];
      for (var j = 0; j < p.length; j++) out.push(+p.charAt(j));
    }
    return out;
  }
  /* App.barcodeSvg(text, {height, module, quiet, fit}) -> SVG string
       module: px per narrow bar (default 2); height: px (default 48); quiet: quiet-zone modules each side (default 10)
       fit:true -> width:100% (scales to the container, keeps the aspect via viewBox) */
  function barcodeSvg(text, opts) {
    opts = opts || {};
    var mod = +opts.module > 0 ? +opts.module : 2;
    var h = +opts.height > 0 ? +opts.height : 48;
    var quiet = opts.quiet != null ? +opts.quiet : 10;
    var w = code128Widths(text);
    var x = quiet, d = '', total = quiet;
    for (var i = 0; i < w.length; i++) total += w[i];
    total += quiet;
    for (var k = 0; k < w.length; k++) {
      if (k % 2 === 0) d += 'M' + x + ' 0h' + w[k] + 'v' + h + 'h-' + w[k] + 'z';
      x += w[k];
    }
    var wpx = total * mod;
    /* opts.width / opts.cssHeight take any CSS length (e.g. '38mm') so labels can be sized in print units */
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + h + '" ' +
      'width="' + (opts.width ? opts.width : (opts.fit ? '100%' : wpx)) + '"' + (opts.fit ? ' style="display:block;max-width:100%"' : '') +
      ' height="' + (opts.cssHeight ? opts.cssHeight : h) + '" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ' + String(text == null ? '' : text).replace(/[^\x20-\x7e]/g, '-').replace(/[&<>"']/g, '') + '">' +
      '<rect width="' + total + '" height="' + h + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  /* total modules (incl. quiet zones) of a text's barcode — lets callers size it in mm */
  function barcodeModules(text, quiet) {
    var w = code128Widths(text), n = 2 * (quiet != null ? +quiet : 10);
    for (var i = 0; i < w.length; i++) n += w[i];
    return n;
  }

  /* ================= constants ================= */
  var ORDER = ['pending', 'collected', 'received', 'processing', 'done'];
  var LABEL = { pending: 'To collect', collected: 'Collected', received: 'In lab', processing: 'Processing', done: 'Done', rejected: 'Rejected' };
  var TUBES = ['EDTA (Lavender)', 'Serum (Red/Gold)', 'Fluoride (Grey)', 'Citrate (Blue)', 'Urine container', 'Stool container', 'Swab', 'Other'];
  var TUBE_COLOR = {
    'EDTA (Lavender)': '#a78bfa', 'Serum (Red/Gold)': '#dc2626', 'Fluoride (Grey)': '#6b7280', 'Citrate (Blue)': '#3b82f6',
    'Urine container': '#eab308', 'Stool container': '#92400e', 'Swab': '#14b8a6', 'Other': '#94a3b8'
  };

  /* ================= small helpers ================= */
  function db() { return window.DB; }
  function all() { try { return db().all('samples') || []; } catch (e) { return []; } }
  function settings() { try { return db().get('settings', 'main') || {}; } catch (e) { return {}; } }
  function nowISO() { return new Date().toISOString(); }
  function userName() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (!s) return 'system';
      var u = s.userId ? db().get('users', s.userId) : null;
      return (u && u.username) || s.name || 'system';
    } catch (e) { return 'system'; }
  }
  var _uidN = 0;
  /* client-generated id that cannot collide across PCs: S- + base36 time + counter + random (e.g. S-MG3K9F2X0A7QZ) */
  function newId() {
    _uidN = (_uidN + 1) % 1296;
    var c = _uidN.toString(36).toUpperCase(); if (c.length < 2) c = '0' + c;
    var r = '';
    for (var i = 0; i < 3; i++) r += Math.floor(Math.random() * 36).toString(36).toUpperCase();
    return 'S-' + Date.now().toString(36).toUpperCase() + c + r;
  }
  function isActive(s) { return !(s.status === 'rejected' && s.recollectId); } /* a rejected tube that was re-created no longer counts */

  /* ================= tube mapping ================= */
  function tubeFor(t) {
    t = t || {};
    var name = String(t.name || '').toLowerCase();
    var cat = String(t.category || '').toLowerCase();
    var st = String(t.sampleType || t.specimen || '').toLowerCase();
    var all3 = name + ' ' + cat + ' ' + st;
    if (st === 'stool' || /\bstool\b|faec|fecal|occult blood|\bova\b|parasite|h\.? ?pylori ag/.test(all3)) return 'Stool container';
    if (st === 'swab' || /\bswab\b|throat|nasal|nasopharyn|covid|vaginal|wound|\bpus\b/.test(all3)) return 'Swab';
    if (st === 'urine' || /\burine\b|\burinary\b|urinalysis|\b24 ?h(ou)?r\b/.test(all3)) return 'Urine container';
    if (/citrat/.test(st) || /\bpt\b|\binr\b|aptt|\bptt\b|d-?dimer|fibrinogen|coagulation|clotting|bleeding time|protein [cs]\b|antithrombin/.test(name + ' ' + cat)) return 'Citrate (Blue)';
    if (/\bedta\b/.test(st) || /hba1c|glycated|glycosylated|hemoglobin a1c/.test(name)) return 'EDTA (Lavender)';
    if (/glucose|\bfbs\b|\brbs\b|\bppbs\b|\bogtt\b|\bgtt\b|\bsugar\b|lactate|\bbsr\b|\bbsf\b|\bbsp\b/.test(name)) return 'Fluoride (Grey)';
    if (/hematolog|haematolog/.test(cat) ||
        /\bcbc\b|complete blood|\bhb\b|hemoglobin|haemoglobin|platelet|\besr\b|reticul|blood group|abo|\brh\b|blood picture|peripheral|cross.?match|malaria|\bmp\b|hematocrit|\bpcv\b|\btlc\b|\bdlc\b|differential|coombs|g6pd|electrophoresis|\bcd4\b|viral load|\bpcr\b|sickle|\bhb ?a/.test(name)) return 'EDTA (Lavender)';
    if (/culture|biopsy|histopath|cytolog|fnac|semen|sputum|csf|fluid|aspirate|\bbone marrow\b/.test(all3)) return 'Other';
    if (/clot/.test(st) || /biochem|serolog|hormon|lipid|immunolog|cardiac|tumor|tumour|vitamin|iron|allerg|drug|thyroid|liver|renal|kidney|electrolyte|diabet|enzyme|protein|marker|antibod|antigen|hepatitis|widal|typhi|dengue|elisa|serum|plasma/.test(all3)) return 'Serum (Red/Gold)';
    if (st === 'blood' || st === 'whole blood' || st === 'serum' || st === 'plasma') return 'Serum (Red/Gold)';
    return 'Other';
  }

  /* invoice items -> [{testId, name, tube}] with packages expanded to their member tests, de-duplicated */
  function expandTests(inv) {
    var out = [], seen = {};
    (inv && inv.items || []).forEach(function (it) {
      var ids = (it.includes && it.includes.length) ? it.includes : [it.testId];
      var isPkg = ids.length > 1 || (it.includes && it.includes.length);
      ids.forEach(function (tid) {
        if (!tid || seen[tid]) return;
        seen[tid] = true;
        var t = null;
        try { t = db().get('tests', tid); } catch (e) {}
        var nm = t ? t.name : (isPkg ? tid : (it.name || tid));
        out.push({ testId: tid, name: nm, tube: tubeFor(t || { name: it.name, category: '', sampleType: '' }) });
      });
    });
    return out;
  }
  function groupByTube(tests) {
    var g = {};
    tests.forEach(function (t) { (g[t.tube] = g[t.tube] || []).push(t); });
    return TUBES.filter(function (tb) { return g[tb]; }).map(function (tb) { return { tube: tb, tests: g[tb] }; });
  }

  /* ================= queries ================= */
  function forInvoice(invId, list) {
    list = list || all();
    return list.filter(function (s) { return s.invoiceId === invId; });
  }
  function get(id) { try { return db().get('samples', id); } catch (e) { return null; } }
  function findByBarcode(code, list) {
    var c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    list = list || all();
    for (var i = 0; i < list.length; i++) if (String(list[i].barcode || '').toUpperCase() === c) return list[i];
    return null;
  }
  function nextIndex(invId, list) {
    var max = 0;
    forInvoice(invId, list).forEach(function (s) {
      var m = /-(\d+)$/.exec(String(s.barcode || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max + 1;
  }
  function barcodeSet(list) {
    var m = {};
    (list || all()).forEach(function (s) { m[String(s.barcode || '').toUpperCase()] = true; });
    return m;
  }

  /* ================= stock: automatic tube consumption =================
     One sample row = one physical tube. When a tube is created for a billed invoice (createForInvoice / syncInvoice / recollect) it uses the stock
     item its tube type is linked to (Stock -> Tube Mapping: settings.main.tubeStock = { 'EDTA (Lavender)': { itemId, qty } }), qty units per tube.
       - the deduction is a stock_moves row  { type:'out', ref:'smp:<sampleId>', auto:true, sampleId, invoiceId, tube, short }  so the usual Stock
         screens, on-hand maths and low-stock alerts see it like any other movement;
       - the sample carries the marker  stockUsed: [{ itemId, qty, want, short, moveId }]  ([] = looked at, nothing linked). A sample that already has
         the marker is never deducted again (idempotent), and old samples (no marker) are never touched;
       - stock is clamped at 0: when less is on hand than wanted only what is there is taken and the rest is logged as  short  (shortfall);
       - a deleted invoice / removed or rejected tube gives the deducted units back as ONE  { type:'adjust', ref:'smp-ret:<sampleId>:<itemId>' }  move
         (checked by ref, so it can only happen once); a re-collected tube is a new sample and deducts again;
       - nothing here ever throws into billing: no mapping or no stock only produces a non-blocking notice. */
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function tubeMap() { var m = settings().tubeStock; return m && typeof m === 'object' ? m : {}; }
  function stockMoves() { try { return db().all('stock_moves') || []; } catch (e) { return []; } }
  /* units on hand = received + corrections - everything drawn (same maths as App.stockState) */
  function onHandOf(itemId, moves) {
    var t = 0;
    (moves || stockMoves()).forEach(function (m) {
      if (m.itemId !== itemId) return;
      var q = +m.qty || 0;
      t += (m.type === 'in' || m.type === 'adjust') ? q : -q;
    });
    return r3(t);
  }
  /* the stock item + units per tube a tube type consumes, or null when it is not linked (or the item was removed) */
  function linkFor(tube) {
    var c = tubeMap()[tube]; if (!c || !c.itemId) return null;
    var it = null; try { it = db().get('stock_items', c.itemId); } catch (e) {}
    if (!it || it.active === false) return null;
    return { item: it, qty: +c.qty > 0 ? +c.qty : 1 };
  }
  function anyLink() { var m = tubeMap(); return Object.keys(m).some(function (k) { return m[k] && m[k].itemId; }); }
  function moveBase(row, itemId, type, qty, ref, note, extra) {
    var now = nowISO(), mv = { itemId: itemId, type: type, qty: qty, ref: ref, note: note, date: now.slice(0, 10), createdAt: now, by: userName(),
      auto: true, sampleId: row.id, invoiceId: row.invoiceId, tube: row.tube };
    for (var k in extra) mv[k] = extra[k];
    return db().insert('stock_moves', mv);
  }
  /* deduct for a freshly stored tube; returns { tube, linked, item, want, took, short, left } or null when it was already handled */
  function applyStock(row) {
    if (!row || !row.id || row.stockUsed) return null;
    var out = { tube: row.tube, linked: false, item: null, want: 0, took: 0, short: 0, left: null };
    try {
      var lk = linkFor(row.tube), lines = [];
      if (lk) {
        var have = Math.max(0, onHandOf(lk.item.id)), took = r3(Math.min(lk.qty, have)), short = r3(lk.qty - took);
        var mv = moveBase(row, lk.item.id, 'out', took, 'smp:' + row.id,
          'Auto: tube used — ' + row.tube + ' · ' + (row.barcode || row.invoiceNo || '') + (short > 0 ? ' · shortfall ' + short + ' (no stock left)' : ''), { short: short });
        lines.push({ itemId: lk.item.id, qty: took, want: lk.qty, short: short, moveId: mv && mv.id });
        out.linked = true; out.item = lk.item; out.want = lk.qty; out.took = took; out.short = short; out.left = r3(have - took);
      }
      row.stockUsed = lines;   /* stored with the row itself by putRow (one write, so a synced copy always carries the marker) */
    } catch (e) { if (window.console) console.error(e); }
    return out;
  }
  /* give a tube's units back (once). why = short reason for the log. Does not touch the sample row - the caller removes or flags it. */
  function restoreStock(row, why) {
    var n = 0;
    try {
      if (!row || !row.id || !row.stockUsed || !row.stockUsed.length || row.stockReturned) return 0;
      var moves = stockMoves();
      row.stockUsed.forEach(function (ln) {
        if (!(+ln.qty > 0)) return;
        var ref = 'smp-ret:' + row.id + ':' + ln.itemId;
        if (moves.some(function (m) { return m.ref === ref; })) return;
        moveBase(row, ln.itemId, 'adjust', +ln.qty, ref, 'Auto: tube returned — ' + (why || 'sample removed') + ' · ' + (row.barcode || ''), {});
        n = r3(n + (+ln.qty));
      });
    } catch (e) { if (window.console) console.error(e); }
    return n;
  }
  /* one small non-blocking notice for what a billing step just did (unlinked tube types, items now low / out) */
  function stockNotice(results) {
    try {
      var msgs = [], seen = {};
      (results || []).forEach(function (r) {
        if (!r) return;
        if (!r.linked) {
          if (anyLink() && !seen['u' + r.tube]) { seen['u' + r.tube] = 1; msgs.push('No stock item linked for ' + r.tube + ' tubes — set it in Stock → Tube Mapping'); }
          return;
        }
        if (r.short > 0 && !seen['s' + r.item.id]) { seen['s' + r.item.id] = 1; msgs.push(r.item.name + ' is out of stock — billed anyway, ' + r.short + ' ' + (r.item.unit || 'unit') + '(s) not deducted'); }
      });
      var last = {};
      (results || []).forEach(function (r) { if (r && r.linked && r.left != null) last[r.item.id] = r; });
      Object.keys(last).forEach(function (id) {
        var r = last[id], rl = +r.item.reorderLevel || 0;
        if (r.short > 0) return;
        if (r.left <= 0) msgs.push(r.item.name + ' is now out of stock');
        else if (rl > 0 && r.left <= rl) msgs.push('Low stock: ' + r.item.name + ' — ' + r.left + ' ' + (r.item.unit || '') + ' left');
      });
      if (msgs.length && window.App && App.toast) setTimeout(function () { App.toast(msgs.join(' • '), 'info'); }, 700);
      return msgs;
    } catch (e) { return []; }
  }
  /* store a new tube row and deduct its stock (the one place every creation path goes through) */
  function putRow(row) {
    var r = applyStock(row);   /* sets row.stockUsed before the row is written */
    db().put('samples', row);
    return r;
  }
  /* tubes + units used between two dates (YYYY-MM-DD, local, inclusive) for the Tube Usage page:
       tubes[]  one row per tube type  { tube, tubes, tests, linked, itemId, itemName, unit, perTube, used, short, untracked, onHand }
       items[]  one row per stock item  { item, tubes[], used, returned, net, short, onHand, low, out }
     Tube counts come straight from the samples (so they work with no mapping at all); units come from the auto movements. */
  function dayKey(iso) { var d = new Date(iso); if (isNaN(d.getTime())) return ''; return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function usage(from, to) {
    var inR = function (iso) { var k = dayKey(iso); return !!k && (!from || k >= from) && (!to || k <= to); };
    var moves = stockMoves(), items = {}, map = tubeMap();
    try { db().all('stock_items').forEach(function (it) { items[it.id] = it; }); } catch (e) {}
    var by = {};
    TUBES.forEach(function (t) { by[t] = { tube: t, tubes: 0, tests: 0, used: 0, short: 0, untracked: 0 }; });
    var total = 0;
    all().forEach(function (s) {
      if (!isActive(s) || s.status === 'rejected' || !inR(s.createdAt)) return;
      var r = by[s.tube] = by[s.tube] || { tube: s.tube, tubes: 0, tests: 0, used: 0, short: 0, untracked: 0 };
      r.tubes++; total++; r.tests += (s.testIds || []).length;
      if (!s.stockUsed) r.untracked++;
      else (s.stockUsed || []).forEach(function (ln) { if (!s.stockReturned) { r.used = r3(r.used + (+ln.qty || 0)); r.short = r3(r.short + (+ln.short || 0)); } });
    });
    var st = null; try { st = window.App && App.stockState ? App.stockState() : null; } catch (e) {}
    var rowOf = function (id) { var f = null; (st && st.rows || []).forEach(function (x) { if (x.item.id === id) f = x; }); return f; };
    var tubes = Object.keys(by).map(function (k) {
      var r = by[k], c = map[k] || {}, it = c.itemId ? items[c.itemId] : null, sr = it ? rowOf(it.id) : null;
      r.linked = !!(it && it.active !== false); r.itemId = r.linked ? it.id : ''; r.itemName = r.linked ? it.name : ''; r.unit = r.linked ? (it.unit || '') : '';
      r.perTube = r.linked ? (+c.qty > 0 ? +c.qty : 1) : 0; r.onHand = sr ? sr.onHand : null; r.low = !!(sr && sr.low); r.out = !!(sr && sr.out);
      return r;
    }).filter(function (r) { return r.tubes > 0 || r.linked; });
    var ib = {};
    moves.forEach(function (m) {
      if (!m.auto || !m.itemId || !inR(m.createdAt || m.date)) return;
      var x = ib[m.itemId] = ib[m.itemId] || { used: 0, returned: 0, short: 0 };
      if (m.type === 'out') { x.used = r3(x.used + (+m.qty || 0)); x.short = r3(x.short + (+m.short || 0)); }
      else if (m.type === 'adjust') x.returned = r3(x.returned + (+m.qty || 0));
    });
    var itemRows = Object.keys(ib).map(function (id) {
      var it = items[id] || { id: id, name: 'Removed item', unit: '' }, sr = rowOf(id), x = ib[id];
      return { item: it, tubes: Object.keys(map).filter(function (k) { return map[k] && map[k].itemId === id; }), used: x.used, returned: x.returned, net: r3(x.used - x.returned), short: x.short,
        onHand: sr ? sr.onHand : null, low: !!(sr && sr.low), out: !!(sr && sr.out) };
    }).sort(function (a, b) { return b.net - a.net; });
    return { from: from, to: to, totalTubes: total, tubes: tubes, items: itemRows,
      units: itemRows.reduce(function (a, r) { return r3(a + r.net); }, 0), short: itemRows.reduce(function (a, r) { return r3(a + r.short); }, 0),
      unlinked: tubes.filter(function (r) { return !r.linked && r.tubes > 0; }).length };
  }

  /* ================= create / sync / remove ================= */
  function patientOf(inv) {
    try { return inv && inv.patientId ? db().get('patients', inv.patientId) : null; } catch (e) { return null; }
  }
  function buildRow(inv, tube, tests, idx, extra) {
    var p = patientOf(inv);
    var by = userName(), at = nowISO();
    var row = {
      id: newId(),
      invoiceId: inv.id,
      invoiceNo: inv.no || inv.id,
      patientId: inv.patientId || '',
      patientName: p ? p.name : 'Walk-in',
      barcode: (inv.no || inv.id) + '-' + idx,
      tube: tube,
      testIds: tests.map(function (t) { return t.testId; }),
      testNames: tests.map(function (t) { return t.name; }),
      status: 'pending',
      history: [{ status: 'pending', at: at, by: by }],
      collectedAt: null, collectedBy: null, rejectReason: '',
      createdAt: (extra && extra.createdAt) || at
    };
    if (extra && extra.recollectOf) row.recollectOf = extra.recollectOf;
    return row;
  }
  /* create the tubes for a new invoice (no-op when the invoice already has samples, unless opts.force) */
  function createForInvoice(inv, opts) {
    if (!inv || !inv.id) return [];
    var list = all();
    if (forInvoice(inv.id, list).length && !(opts && opts.force)) return [];
    var groups = groupByTube(expandTests(inv));
    var idx = nextIndex(inv.id, list), used = barcodeSet(list), made = [];
    var ex0 = { createdAt: nowISO() }, stock = []; /* one timestamp for all tubes of the invoice keeps them together in lists */
    groups.forEach(function (g) {
      var row = buildRow(inv, g.tube, g.tests, idx, ex0);
      while (used[row.barcode.toUpperCase()]) { idx++; row.barcode = (inv.no || inv.id) + '-' + idx; }
      used[row.barcode.toUpperCase()] = true; idx++;
      try { stock.push(putRow(row)); made.push(row); } catch (e) {}
    });
    stockNotice(stock);
    return made;
  }
  /* invoice edited: pending tubes lose removed tests (emptied ones are deleted); new tests go into a pending tube of the same type or a new tube */
  function syncInvoice(inv) {
    if (!inv || !inv.id) return;
    var list = all(), ex = forInvoice(inv.id, list);
    if (!ex.length) return; /* old invoice without samples: nothing to keep in sync */
    var want = expandTests(inv), wantIds = {};
    want.forEach(function (t) { wantIds[t.testId] = t; });
    ex.forEach(function (s) {
      if (s.status !== 'pending') return;
      var keep = [], names = [];
      (s.testIds || []).forEach(function (tid, i) { if (wantIds[tid]) { keep.push(tid); names.push((s.testNames || [])[i] || wantIds[tid].name); } });
      if (keep.length === (s.testIds || []).length) return;
      if (!keep.length) { restoreStock(s, 'test removed from the invoice'); try { db().remove('samples', s.id); } catch (e) {} s._gone = true; }
      else { try { db().update('samples', s.id, { testIds: keep, testNames: names }); } catch (e) {} s.testIds = keep; s.testNames = names; }
    });
    ex = ex.filter(function (s) { return !s._gone; });
    var covered = {};
    ex.forEach(function (s) { (s.testIds || []).forEach(function (tid) { covered[tid] = true; }); });
    var missing = want.filter(function (t) { return !covered[t.testId]; });
    if (!missing.length) return;
    var idx = nextIndex(inv.id, ex), used = barcodeSet(list), stock = [];
    groupByTube(missing).forEach(function (g) {
      var host = null;
      ex.forEach(function (s) { if (!host && s.status === 'pending' && s.tube === g.tube) host = s; });
      if (host) {
        try {
          db().update('samples', host.id, {
            testIds: (host.testIds || []).concat(g.tests.map(function (t) { return t.testId; })),
            testNames: (host.testNames || []).concat(g.tests.map(function (t) { return t.name; }))
          });
        } catch (e) {}
        host.testIds = (host.testIds || []).concat(g.tests.map(function (t) { return t.testId; }));
        return;
      }
      var row = buildRow(inv, g.tube, g.tests, idx, null);
      while (used[row.barcode.toUpperCase()]) { idx++; row.barcode = (inv.no || inv.id) + '-' + idx; }
      used[row.barcode.toUpperCase()] = true; idx++;
      try { stock.push(putRow(row)); ex.push(row); } catch (e) {}
    });
    stockNotice(stock);
  }
  function removeForInvoice(invId) {
    forInvoice(invId).forEach(function (s) { restoreStock(s, 'invoice deleted'); try { db().remove('samples', s.id); } catch (e) {} });
  }
  /* samples whose invoice no longer exists (deleted on another PC, old data) are removed */
  function cleanupOrphans() {
    var list = all(); if (!list.length) return 0;
    var ids = {};
    try { db().all('invoices').forEach(function (i) { ids[i.id] = true; }); } catch (e) { return 0; }
    var n = 0;
    list.forEach(function (s) { if (!ids[s.invoiceId]) { restoreStock(s, 'invoice deleted'); try { db().remove('samples', s.id); n++; } catch (e) {} } });
    return n;
  }

  /* ================= status changes ================= */
  function nextStatus(st) {
    var i = ORDER.indexOf(st);
    return (i < 0 || i >= ORDER.length - 1) ? null : ORDER[i + 1];
  }
  function setStatus(id, status, extra) {
    var s = get(id); if (!s) return null;
    var by = userName(), at = nowISO(), prevStatus = s.status;
    var h = (s.history || []).slice();
    var ent = { status: status, at: at, by: by };
    if (extra && extra.reason) ent.reason = extra.reason;
    h.push(ent);
    var patch = { status: status, history: h };
    if (status === 'collected') { patch.collectedAt = at; patch.collectedBy = by; }
    if (status === 'rejected') patch.rejectReason = (extra && extra.reason) || '';
    var upd = db().update('samples', id, patch);
    /* a rejected tube gives its stock back (once); the re-collected tube is a new sample and deducts again */
    if (status === 'rejected' && prevStatus !== 'rejected' && s.stockUsed && s.stockUsed.length && !s.stockReturned) {
      var back = restoreStock(s, 'sample rejected');
      try { db().update('samples', id, { stockReturned: nowISO() }); } catch (e) {}
      if (back > 0 && upd) upd.stockReturned = true;
    }
    return upd;
  }
  /* re-create a pending tube for a rejected one (same tube + tests, next barcode of the invoice) */
  function recollect(id) {
    var s = get(id); if (!s || s.recollectId) return null;
    var inv = null;
    try { inv = db().get('invoices', s.invoiceId); } catch (e) {}
    if (!inv) return null;
    var list = all(), idx = nextIndex(inv.id, list), used = barcodeSet(list);
    var tests = (s.testIds || []).map(function (tid, i) { return { testId: tid, name: (s.testNames || [])[i] || tid }; });
    var row = buildRow(inv, s.tube, tests, idx, { recollectOf: s.id });
    while (used[row.barcode.toUpperCase()]) { idx++; row.barcode = (inv.no || inv.id) + '-' + idx; }
    var made = putRow(row);
    db().update('samples', s.id, { recollectId: row.id });
    stockNotice([made]);
    return row;
  }

  /* ================= per-invoice summary + chip ================= */
  function summaryMap(list) {
    var m = {};
    (list || all()).forEach(function (s) {
      if (!isActive(s)) return;
      var x = m[s.invoiceId] = m[s.invoiceId] || { total: 0, pending: 0, collected: 0, received: 0, processing: 0, done: 0, rejected: 0 };
      x.total++; x[s.status] = (x[s.status] || 0) + 1;
    });
    return m;
  }
  function chipHTML(sum) {
    if (!sum || !sum.total) return '';
    var cls, txt, tip;
    var got = sum.total - sum.pending - sum.rejected;
    if (sum.rejected) { cls = 'smp-c-rej'; txt = sum.rejected + ' rejected'; }
    else if (sum.pending) { cls = 'smp-c-pend'; txt = got ? 'Collected ' + got + '/' + sum.total : 'To collect ' + sum.total; }
    else if (sum.done === sum.total) { cls = 'smp-c-done'; txt = 'Samples done'; }
    else if (sum.processing) { cls = 'smp-c-proc'; txt = 'Processing'; }
    else if (sum.received) { cls = 'smp-c-lab'; txt = 'In lab'; }
    else { cls = 'smp-c-col'; txt = 'Collected'; }
    tip = sum.total + ' sample' + (sum.total === 1 ? '' : 's') + ' — ' + ORDER.concat(['rejected']).filter(function (k) { return sum[k]; }).map(function (k) { return sum[k] + ' ' + LABEL[k].toLowerCase(); }).join(', ');
    return '<span class="smp-chip ' + cls + '" title="' + esc(tip) + '">' + tubeIcon(12) + esc(txt) + '</span>';
  }
  function esc(s) { return window.App && App.esc ? App.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tubeIcon(sz) {
    return window.App && App.icon ? App.icon('tube', sz || 14) : '';
  }

  var BCLS = { pending: 'b-pending', collected: 'b-info', received: 'b-teal', processing: 'b-violet', done: 'b-ready', rejected: 'b-unpaid' };
  function badge(st) { return '<span class="badge ' + (BCLS[st] || 'b-pending') + '">' + esc(LABEL[st] || st) + '</span>'; }
  function tubeDot(tube) { return '<i class="smp-dot" style="background:' + (TUBE_COLOR[tube] || '#94a3b8') + '"></i>'; }
  /* open the label print dialog (mod-samples.js loads on demand, e.g. from the invoice page) */
  function printLabels(ids) {
    if (window.App && App.openLabelDialog) { App.openLabelDialog(ids); return; }
    App.loadScript('assets/js/mod-samples.js').then(function () { App.openLabelDialog(ids); },
      function () { App.toast('Could not load the label printer — check your connection', 'err'); });
  }

  /* ================= results integration ================= */
  function requireCollected() { return !!settings().requireSampleCollected; }
  /* is this (invoice, test) waiting on an uncollected / rejected sample? -> message, or '' */
  function blockedReason(invoiceId, testId, list) {
    var ss = forInvoice(invoiceId, list).filter(function (s) { return isActive(s) && (s.testIds || []).indexOf(testId) >= 0; });
    if (!ss.length) return '';
    var ok = ss.some(function (s) { return s.status !== 'pending' && s.status !== 'rejected'; });
    if (ok) return '';
    var s0 = ss[0];
    return s0.status === 'rejected'
      ? 'Sample ' + s0.barcode + ' was rejected — re-collect it before entering results.'
      : 'Sample ' + s0.barcode + ' (' + s0.tube + ') is not collected yet — collect it on the Samples page first.';
  }
  /* count of result rows ({invoice,item,res}) whose sample is not collected yet */
  function uncollectedCount(rows) {
    var list = all(); if (!list.length) return 0;
    var n = 0;
    rows.forEach(function (r) {
      var tid = r.res ? r.res.testId : (r.item && r.item.testId);
      if (blockedReason(r.invoice.id, tid, list)) n++;
    });
    return n;
  }
  /* after results were saved: when every result of an invoice is ready, its tubes are marked done */
  function onResultsSaved(invoiceIds) {
    try {
      var seen = {};
      (invoiceIds || []).forEach(function (iid) {
        if (!iid || seen[iid]) return; seen[iid] = true;
        var ss = forInvoice(iid).filter(function (s) { return isActive(s) && s.status !== 'done' && s.status !== 'rejected'; });
        if (!ss.length) return;
        var inv = db().get('invoices', iid); if (!inv) return;
        var res = db().all('results').filter(function (r) { return r.invoiceId === iid; });
        var ready = {};
        res.forEach(function (r) { if (r.status === 'ready') ready[r.testId] = true; });
        var need = expandTests(inv);
        if (!need.length || !need.every(function (t) { return ready[t.testId]; })) return;
        ss.forEach(function (s) { setStatus(s.id, 'done'); });
      });
    } catch (e) { if (window.console) console.error(e); }
  }

  window.Samples = {
    ORDER: ORDER, LABEL: LABEL, TUBES: TUBES, TUBE_COLOR: TUBE_COLOR,
    all: all, get: get, forInvoice: forInvoice, findByBarcode: findByBarcode, isActive: isActive,
    tubeFor: tubeFor, expandTests: expandTests,
    createForInvoice: createForInvoice, syncInvoice: syncInvoice, removeForInvoice: removeForInvoice, cleanupOrphans: cleanupOrphans,
    nextStatus: nextStatus, setStatus: setStatus, recollect: recollect,
    summaryMap: summaryMap, chipHTML: chipHTML, tubeIcon: tubeIcon, badge: badge, tubeDot: tubeDot, printLabels: printLabels,
    requireCollected: requireCollected, blockedReason: blockedReason, uncollectedCount: uncollectedCount,
    onResultsSaved: onResultsSaved, userName: userName,
    tubeMap: tubeMap, linkFor: linkFor, onHandOf: onHandOf, usage: usage, applyStock: applyStock, restoreStock: restoreStock,
    _code128Values: code128Values, _code128Widths: code128Widths
  };
  if (window.App) { App.barcodeSvg = barcodeSvg; App.barcodeModules = barcodeModules; }
})();
