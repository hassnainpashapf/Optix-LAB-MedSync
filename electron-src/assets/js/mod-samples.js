/* Optix Medical Sync — Samples module (route: #/samples)
   Barcode scan -> status workflow, label printing (50x25 mm thermal / A4 3x8), reject + re-collect.
   Data helpers live in samples-core.js (window.Samples); this file is the UI (lazy loaded). */
(function () {
  'use strict';
  if (window.__smpModule) return; /* may be loaded on demand by the invoice page and again by the router */
  window.__smpModule = true;

  var S = window.Samples;
  var PAGE = 50;
  var F = { tab: 'all', q: '', range: 'today', date: '', page: 0 };
  var sel = {};              /* selected sample ids (bulk label print) */
  var lastScan = { code: '', t: 0 };
  var cleaned = false;

  var TABS = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'To collect' },
    { id: 'collected', label: 'Collected' },
    { id: 'received', label: 'In lab' },
    { id: 'processing', label: 'Processing' },
    { id: 'done', label: 'Done' },
    { id: 'rejected', label: 'Rejected' }
  ];
  var ACTION = {
    pending: { to: 'collected', label: 'Collect' },
    collected: { to: 'received', label: 'Receive in lab' },
    received: { to: 'processing', label: 'Start processing' },
    processing: { to: 'done', label: 'Mark done' }
  };
  var REASONS = ['Hemolyzed', 'Clotted', 'Insufficient volume', 'Wrong tube / container', 'Unlabeled / mislabeled', 'Contaminated', 'Leaked / damaged', 'Other'];

  /* ---------- helpers ---------- */
  var esc = App.esc;
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(v) {
    var d = new Date(v);
    return isNaN(d) ? '' : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function addDays(key, n) {
    var d = new Date(key + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }
  function clock(v) {
    var d = new Date(v); if (isNaN(d)) return '';
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
    var t = h + ':' + pad2(d.getMinutes()) + ' ' + ap;
    return dayKey(d) === App.today() ? t : pad2(d.getDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ', ' + t;
  }
  function shortStamp(v) { /* 07/10/26 10:42 for the label */
    var d = new Date(v); if (isNaN(d)) d = new Date();
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function settings() { return DB.get('settings', 'main') || {}; }
  function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isTouch() { return ('ontouchstart' in window) || window.innerWidth <= 760; }
  function canInvoices() { var s = App.session(); return !!(s && App.can('invoices', s.role)); }
  function patientLine(p, snap) {
    if (!p) return '';
    var g = p.gender ? String(p.gender).charAt(0).toUpperCase() : '';
    return (p.age ? p.age + 'Y' : '') + (p.age && g ? ' / ' : '') + g;
  }

  /* ---------- filtering ---------- */
  function inRange(s) {
    if (F.range === 'all') return true;
    var k = dayKey(s.createdAt), t = App.today();
    if (F.range === 'today') return k === t;
    if (F.range === 'yesterday') return k === addDays(t, -1);
    if (F.range === 'last7') return k >= addDays(t, -6) && k <= t;
    if (F.range === 'last30') return k >= addDays(t, -29) && k <= t;
    if (F.range === 'pick') return k === (F.date || t);
    return true;
  }
  function baseList(all) {
    var q = F.q.trim().toLowerCase();
    var out = all.filter(function (s) {
      if (!inRange(s)) return false;
      if (!q) return true;
      var hay = (s.barcode + ' ' + s.patientName + ' ' + s.invoiceNo + ' ' + s.patientId + ' ' + s.tube + ' ' + (s.testNames || []).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    out.sort(function (a, b) {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return String(a.barcode).localeCompare(String(b.barcode), undefined, { numeric: true });
    });
    return out;
  }
  function counts(list) {
    var c = { all: list.length, pending: 0, collected: 0, received: 0, processing: 0, done: 0, rejected: 0 };
    list.forEach(function (s) { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }

  /* ---------- label HTML (print + preview) ---------- */
  var LABEL_CSS =
    '.smp-lbl{width:50mm;height:25mm;padding:1.1mm 1.7mm 0.9mm;overflow:hidden;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;page-break-after:always;break-after:page;border:0}' +
    '.smp-lbl:last-child{page-break-after:auto;break-after:auto}' +
    '.smp-lbl .l-top{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;line-height:1.1}' +
    '.smp-lbl .l-name{font-size:8.2pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
    '.smp-lbl .l-as{font-size:6.4pt;font-weight:700;white-space:nowrap;flex:none}' +
    '.smp-lbl .l-sub{display:flex;justify-content:space-between;gap:2mm;font-size:5.4pt;line-height:1.25;color:#222}' +
    '.smp-lbl .l-sub b{font-weight:800;white-space:nowrap}' +
    '.smp-lbl .l-sub span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
    '.smp-lbl .l-tests{font-size:5.6pt;line-height:1.2;max-height:5mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-top:.15mm}' +
    '.smp-lbl .l-bc{margin-top:.5mm;text-align:center;line-height:0;flex:none}' +
    '.smp-lbl .l-bc svg{display:inline-block}' +
    '.smp-lbl .l-foot{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;margin-top:.35mm;line-height:1.1}' +
    '.smp-lbl .l-code{font-family:"Courier New",monospace;font-size:7.2pt;font-weight:800;letter-spacing:.2px}' +
    '.smp-lbl .l-date{font-size:5.4pt;white-space:nowrap}' +
    /* A4 sheet cells are larger: scale the same layout up */
    '.smp-lbl.l-a4{width:66.6mm;height:35.9mm;padding:2mm 3mm 1.5mm;page-break-after:auto;break-after:auto;outline:.2mm dashed #cfd6e0;outline-offset:-.2mm}' +
    '.smp-lbl.l-a4 .l-name{font-size:11pt}.smp-lbl.l-a4 .l-as{font-size:8.5pt}.smp-lbl.l-a4 .l-sub{font-size:7.2pt}' +
    '.smp-lbl.l-a4 .l-tests{font-size:7.4pt;max-height:7mm}.smp-lbl.l-a4 .l-code{font-size:10pt}.smp-lbl.l-a4 .l-date{font-size:7pt}' +
    '.smp-lbl.l-a4 .l-bc{margin-top:1mm}' +
    '.smp-sheet{display:grid;grid-template-columns:repeat(3,66.6mm);grid-auto-rows:35.9mm;page-break-after:always;break-after:page;width:199.8mm}' +
    '.smp-sheet:last-child{page-break-after:auto;break-after:auto}';

  function testsLine(names, maxChars) {
    var out = '', used = 0;
    for (var i = 0; i < names.length; i++) {
      var nx = (out ? out + ', ' : '') + names[i];
      if (nx.length > maxChars && out) { return out + ' +' + (names.length - used); }
      out = nx.length > maxChars ? nx.slice(0, maxChars - 1) + '…' : nx; used++;
    }
    return out;
  }
  function oneLabel(s, a4, labName) {
    var p = null;
    try { p = s.patientId ? DB.get('patients', s.patientId) : null; } catch (e) {}
    var name = p ? p.name : (s.patientName || 'Walk-in');
    var maxPx = a4 ? 62 : 46.4;                                  /* printable width in mm */
    var mods = App.barcodeModules(s.barcode, 4);
    var modMm = Math.min(a4 ? 0.3 : 0.25, maxPx / mods);        /* 0.25 mm = exactly 2 dots on a 203 dpi thermal printer */
    var svg = App.barcodeSvg(s.barcode, { height: 10, quiet: 4, width: (mods * modMm).toFixed(2) + 'mm', cssHeight: (a4 ? 12 : 8.2) + 'mm' });
    return '<div class="smp-lbl' + (a4 ? ' l-a4' : '') + '">' +
      '<div class="l-top"><span class="l-name">' + esc(name) + '</span><span class="l-as">' + esc(patientLine(p)) + '</span></div>' +
      '<div class="l-sub"><span>' + esc(labName) + '</span><b>' + esc(s.tube) + '</b></div>' +
      '<div class="l-tests">' + esc(testsLine(s.testNames || [], a4 ? 110 : 80)) + '</div>' +
      '<div class="l-bc">' + svg + '</div>' +
      '<div class="l-foot"><span class="l-code">' + esc(s.barcode) + '</span><span class="l-date">' + esc(shortStamp(s.collectedAt || s.createdAt)) + '</span></div>' +
    '</div>';
  }
  function labelsHTML(list, fmt, copies) {
    var labName = settings().labName || 'Optix Medical Sync';
    var a4 = fmt === 'a4', items = [];
    list.forEach(function (s) { for (var i = 0; i < copies; i++) items.push(oneLabel(s, a4, labName)); });
    if (!a4) return '<style>' + LABEL_CSS + '</style>' + items.join('');
    var sheets = '';
    for (var i = 0; i < items.length; i += 24) sheets += '<div class="smp-sheet">' + items.slice(i, i + 24).join('') + '</div>';
    return '<style>' + LABEL_CSS + '</style>' + sheets;
  }
  function printCss(fmt) {
    return '<style>' + (fmt === 'a4' ? '@page{size:A4;margin:5mm}' : '@page{size:50mm 25mm;margin:0}') +
      'html,body{margin:0}body{padding:0!important;background:#fff}@media print{body{padding:0!important}}</style>';
  }

  /* ---------- label dialog ---------- */
  function openLabelDialog(ids) {
    var list = (ids || []).map(function (id) { return S.get(id); }).filter(Boolean);
    list.sort(function (a, b) { return String(a.barcode).localeCompare(String(b.barcode), undefined, { numeric: true }); });
    if (!list.length) { App.toast('No samples selected', 'err'); return; }
    var fmt = lsGet('labpos_smp_fmt', 'thermal'); if (fmt !== 'a4') fmt = 'thermal';
    var copies = 1;
    var body =
      '<div class="smp-ld-ctl">' +
        '<div class="radio-row" id="smpFmt">' +
          '<button type="button" class="radio-pill" data-f="thermal">Thermal label &nbsp;50 &times; 25 mm</button>' +
          '<button type="button" class="radio-pill" data-f="a4">A4 sheet &nbsp;3 &times; 8</button>' +
        '</div>' +
        '<label class="smp-ld-cp">Copies of each <input class="input" id="smpCopies" type="number" min="1" max="20" value="1"></label>' +
      '</div>' +
      '<div class="smp-ld-info" id="smpLdInfo"></div>' +
      '<div class="smp-ld-prev" id="smpPrev"></div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="smpLdX">Close</button>' +
      '<button class="btn btn-primary" id="smpLdPrint">' + App.icon('printer', 16) + ' <span>Print</span></button></div>';
    App.modal('Print labels', body, { wide: true, onOpen: function (ov, close) {
      function paint() {
        ov.querySelectorAll('#smpFmt .radio-pill').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-f') === fmt); });
        var total = list.length * copies;
        ov.querySelector('#smpLdInfo').textContent = total + ' label' + (total === 1 ? '' : 's') + ' · ' + (fmt === 'a4' ? Math.ceil(total / 24) + ' A4 sheet(s), 24 per sheet' : 'one 50 × 25 mm label per page');
        var prevItems = list.slice(0, fmt === 'a4' ? 24 : 6);
        var html = labelsHTML(prevItems, fmt, fmt === 'a4' ? 1 : Math.min(copies, 1));
        var host = ov.querySelector('#smpPrev');
        host.className = 'smp-ld-prev ' + (fmt === 'a4' ? 'is-a4' : 'is-th');
        host.innerHTML = fmt === 'a4' ? '<div class="smp-a4pg">' + html + '</div>' : '<div class="smp-thgrid">' + html + '</div>';
      }
      ov.querySelector('#smpFmt').addEventListener('click', function (e) {
        var b = e.target.closest('[data-f]'); if (!b) return;
        fmt = b.getAttribute('data-f'); lsSet('labpos_smp_fmt', fmt); paint();
      });
      ov.querySelector('#smpCopies').addEventListener('input', function () {
        copies = Math.max(1, Math.min(20, parseInt(this.value, 10) || 1)); paint();
      });
      ov.querySelector('#smpLdX').addEventListener('click', close);
      ov.querySelector('#smpLdPrint').addEventListener('click', function () {
        App.print('Sample labels', printCss(fmt) + labelsHTML(list, fmt, copies), { noHeader: true });
      });
      paint();
    } });
  }
  App.openLabelDialog = openLabelDialog;

  /* ---------- status actions ---------- */
  function advance(id, to) {
    var s = S.get(id); if (!s) return null;
    S.setStatus(id, to);
    return S.get(id);
  }

  function rejectDialog(id) {
    var s = S.get(id); if (!s) return;
    var body =
      '<p class="muted" style="margin-bottom:12px"><b>' + esc(s.barcode) + '</b> &middot; ' + esc(s.patientName) + ' &middot; ' + esc(s.tube) + '</p>' +
      '<label class="label">Reason *</label>' +
      '<select class="select" id="rjReason">' + REASONS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select>' +
      '<label class="label" style="margin-top:12px;display:block">Note (optional)</label>' +
      '<textarea class="input" id="rjNote" rows="2" maxlength="200" placeholder="Anything the collector should know"></textarea>' +
      '<label class="check" style="margin-top:14px"><input type="checkbox" id="rjRe" checked><span>Create a new pending sample for re-collection</span></label>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="rjNo">Cancel</button><button class="btn btn-danger" id="rjYes">Reject sample</button></div>';
    App.modal('Reject sample', body, { onOpen: function (ov, close) {
      ov.querySelector('#rjNo').addEventListener('click', close);
      ov.querySelector('#rjYes').addEventListener('click', function () {
        var r = ov.querySelector('#rjReason').value, n = ov.querySelector('#rjNote').value.trim();
        var reason = r + (n ? ' — ' + n : '');
        var again = ov.querySelector('#rjRe').checked;
        S.setStatus(id, 'rejected', { reason: reason });
        var nw = again ? S.recollect(id) : null;
        close();
        App.toast('Sample ' + s.barcode + ' rejected' + (nw ? ' — new sample ' + nw.barcode + ' created for re-collection' : ''), nw ? 'ok' : 'info');
        paintList();
      });
    } });
  }

  /* ---------- scan ---------- */
  function flash(kind) {
    var box = document.getElementById('smpScanBox'); if (!box) return;
    box.classList.remove('f-ok', 'f-err', 'f-info');
    void box.offsetWidth;
    box.classList.add('f-' + kind);
  }
  function showResult(kind, title, lines) {
    var r = document.getElementById('smpResult'); if (!r) return;
    r.className = 'smp-result r-' + kind;
    r.innerHTML = '<span class="smp-res-ic">' + App.icon(kind === 'err' ? 'alert' : (kind === 'info' ? 'file' : 'check'), 22) + '</span>' +
      '<div class="smp-res-tx"><b>' + title + '</b>' + (lines || []).map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>';
    flash(kind);
  }
  function handleScan(raw, via) {
    var code = String(raw || '').trim();
    if (!code) return;
    var now = Date.now();
    if (code.toUpperCase() === lastScan.code && now - lastScan.t < 2500) {
      showResult('info', 'Already scanned', ['<code>' + esc(code) + '</code> was just scanned — ignored']);
      lastScan.t = now;
      return;
    }
    var s = S.findByBarcode(code);
    if (!s) {
      lastScan = { code: '', t: 0 };
      showResult('err', 'Unknown barcode', ['No sample <code>' + esc(code) + '</code> in this lab. Check the label or type it again.']);
      App.toast('Unknown barcode: ' + code, 'err');
      return;
    }
    lastScan = { code: code.toUpperCase(), t: now };
    var det = [esc(s.patientName) + ' &middot; ' + esc(s.tube), esc((s.testNames || []).join(', '))];
    if (s.status === 'rejected') {
      showResult('err', esc(s.barcode) + ' was rejected', ['Reason: ' + esc(s.rejectReason || '—')].concat(s.recollectId ? ['A re-collection sample already exists.'] : ['Use “Re-collect” in the Rejected tab.']));
      App.toast('Sample ' + s.barcode + ' is rejected', 'err');
      return;
    }
    var nx = S.nextStatus(s.status);
    if (!nx) {
      showResult('info', esc(s.barcode) + ' is already Done', det);
      App.toast('Sample ' + s.barcode + ' is already done', 'info');
      return;
    }
    S.setStatus(s.id, nx);
    showResult('ok', esc(s.barcode) + ' &rarr; ' + esc(S.LABEL[nx]), det.concat(['<em>' + esc(S.LABEL[s.status]) + ' &rarr; ' + esc(S.LABEL[nx]) + (via === 'camera' ? ' (camera)' : '') + '</em>']));
    App.toast(s.barcode + ': ' + S.LABEL[nx], 'ok');
    paintList();
  }

  /* camera scan (BarcodeDetector) */
  function openCamera() {
    var detector;
    try { detector = new window.BarcodeDetector({ formats: ['code_128'] }); } catch (e) { App.toast('Camera scanning is not available here', 'err'); return; }
    var body =
      '<div class="smp-cam"><video id="smpVid" playsinline muted autoplay></video><div class="smp-cam-line"></div></div>' +
      '<div class="smp-cam-st" id="smpCamSt">Point the camera at a sample label…</div>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="smpCamX">Close</button></div>';
    App.modal('Scan with camera', body, { onOpen: function (ov, close) {
      var stream = null, timer = null, busy = false, stopped = false;
      function stop() { stopped = true; if (timer) clearInterval(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }
      ov.querySelector('#smpCamX').addEventListener('click', function () { stop(); close(); });
      var st = ov.querySelector('#smpCamSt'), vid = ov.querySelector('#smpVid');
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (m) {
        if (stopped || !ov.isConnected) { m.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = m; vid.srcObject = m;
        timer = setInterval(function () {
          if (!ov.isConnected) { stop(); return; }
          if (busy || vid.readyState < 2) return;
          busy = true;
          detector.detect(vid).then(function (codes) {
            busy = false;
            if (codes && codes.length && codes[0].rawValue) {
              handleScan(codes[0].rawValue, 'camera');
              var r = document.getElementById('smpResult');
              st.textContent = r ? r.textContent.replace(/\s+/g, ' ').trim() : 'Scanned';
              st.className = 'smp-cam-st ' + (r && r.classList.contains('r-err') ? 'is-err' : 'is-ok');
            }
          }, function () { busy = false; });
        }, 300);
      }, function (err) {
        st.textContent = 'Camera unavailable: ' + ((err && err.message) || 'permission denied');
        st.className = 'smp-cam-st is-err';
      });
    } });
  }

  /* ---------- list ---------- */
  function rowHTML(s, ctx) {
    var act = ACTION[s.status];
    var inv = canInvoices()
      ? '<a class="link" href="#/invoice/' + esc(s.invoiceId) + '"><span class="mono">' + esc(s.invoiceNo) + '</span></a>'
      : '<span class="mono">' + esc(s.invoiceNo) + '</span>';
    var p = ctx.patients[s.patientId];
    var pname = p ? p.name : s.patientName;
    var when = s.collectedAt ? clock(s.collectedAt) : '—';
    var tests = (s.testNames || []).join(', ');
    var status = S.badge(s.status) + (s.status === 'rejected' && s.rejectReason ? '<div class="smp-rej" title="' + esc(s.rejectReason) + '">' + esc(s.rejectReason) + '</div>' : '');
    var acts = '';
    if (act) acts += '<button class="btn btn-primary btn-sm" data-act="adv" data-id="' + esc(s.id) + '" data-to="' + act.to + '">' + act.label + '</button>';
    if (s.status === 'rejected' && !s.recollectId) acts += '<button class="btn btn-primary btn-sm" data-act="recol" data-id="' + esc(s.id) + '">Re-collect</button>';
    acts += '<button class="btn btn-sm" data-act="label" data-id="' + esc(s.id) + '" title="Print label">' + App.icon('printer', 14) + ' Label</button>';
    if (s.status !== 'rejected' && s.status !== 'done') acts += '<button class="btn btn-sm smp-btn-rej" data-act="rej" data-id="' + esc(s.id) + '">Reject</button>';
    return '<tr' + (sel[s.id] ? ' class="is-sel"' : '') + '>' +
      '<td><label class="smp-bc"><input type="checkbox" class="smp-ck" data-id="' + esc(s.id) + '"' + (sel[s.id] ? ' checked' : '') + '><span class="mono smp-code">' + esc(s.barcode) + '</span></label></td>' +
      '<td><a class="link pt-name" href="#/patient/' + esc(s.patientId) + '"><strong>' + esc(pname) + '</strong></a>' +
        (p ? '<div class="smp-sub">' + esc(patientLine(p)) + '</div>' : '') + '</td>' +
      '<td class="smp-nw">' + inv + '</td>' +
      '<td><span class="smp-tube">' + S.tubeDot(s.tube) + esc(s.tube) + '</span></td>' +
      '<td class="smp-tests" title="' + esc(tests) + '">' + esc(tests) + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="muted">' + esc(when) + '</td>' +
      '<td class="actions">' + acts + '</td></tr>';
  }

  function paintList() {
    var view = document.getElementById('view');
    if (!view || !document.getElementById('smpList')) return;
    var all = S.all();
    var base = baseList(all);
    var c = counts(base);
    var list = F.tab === 'all' ? base : base.filter(function (s) { return s.status === F.tab; });
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (F.page >= pages) F.page = pages - 1;
    var from = F.page * PAGE, slice = list.slice(from, from + PAGE);
    var ctx = { patients: {} };
    slice.forEach(function (s) { if (s.patientId && !ctx.patients[s.patientId]) { try { ctx.patients[s.patientId] = DB.get('patients', s.patientId); } catch (e) {} } });

    document.getElementById('smpTabs').innerHTML = TABS.map(function (t) {
      return '<button class="tab' + (F.tab === t.id ? ' on' : '') + '" data-tab="' + t.id + '">' + t.label +
        ' <span class="smp-tc">' + (c[t.id] || 0) + '</span></button>';
    }).join('');

    var host = document.getElementById('smpList');
    if (!list.length) {
      host.innerHTML = App.empty(all.length
        ? (F.q || F.tab !== 'all' || F.range !== 'all' ? 'No samples match these filters.' : 'No samples yet.')
        : 'No samples yet — they are created automatically when an invoice is billed.');
    } else {
      host.innerHTML = '<div class="tbl-wrap"><table class="table smp-table"><thead><tr>' +
        '<th><label class="smp-bc"><input type="checkbox" id="smpAll" title="Select all shown"><span>Barcode</span></label></th>' +
        '<th>Patient</th><th>Invoice</th><th>Tube</th><th>Tests</th><th>Status</th><th>Collected</th><th></th>' +
        '</tr></thead><tbody>' + slice.map(function (s) { return rowHTML(s, ctx); }).join('') + '</tbody></table></div>';
    }
    var ids = slice.map(function (s) { return s.id; });
    var allCk = document.getElementById('smpAll');
    if (allCk) {
      allCk.checked = ids.length > 0 && ids.every(function (id) { return sel[id]; });
      allCk.addEventListener('change', function () { ids.forEach(function (id) { if (allCk.checked) sel[id] = true; else delete sel[id]; }); paintList(); });
    }
    var pg = document.getElementById('smpPager');
    pg.innerHTML = list.length > PAGE
      ? '<span class="muted">' + (from + 1) + '–' + Math.min(from + PAGE, list.length) + ' of ' + list.length + '</span>' +
        '<button class="btn btn-sm" data-pg="-1"' + (F.page === 0 ? ' disabled' : '') + '>&larr; Prev</button>' +
        '<button class="btn btn-sm" data-pg="1"' + (F.page >= pages - 1 ? ' disabled' : '') + '>Next &rarr;</button>'
      : (list.length ? '<span class="muted">' + list.length + ' sample' + (list.length === 1 ? '' : 's') + '</span>' : '');

    var n = Object.keys(sel).length;
    var bulk = document.getElementById('smpBulk');
    bulk.hidden = !n;
    bulk.innerHTML = n ? '<b>' + n + ' selected</b><button class="btn btn-primary btn-sm" data-bulk="print">' + App.icon('printer', 14) + ' Print labels</button><button class="btn btn-ghost btn-sm" data-bulk="clear">Clear</button>' : '';
  }

  function generateMissing() {
    var invs = DB.all('invoices').filter(function (i) {
      if (F.range === 'all') return true;
      return inRange({ createdAt: i.createdAt });
    });
    var have = {};
    S.all().forEach(function (s) { have[s.invoiceId] = true; });
    var miss = invs.filter(function (i) { return !have[i.id] && (i.items || []).length; });
    if (!miss.length) { App.toast('Every invoice in this date range already has samples', 'info'); return; }
    App.confirm('Generate sample tubes for ' + miss.length + ' invoice(s) in this date range that have none? (They are created as “To collect”.)').then(function (ok) {
      if (!ok) return;
      var n = 0;
      miss.forEach(function (i) { n += S.createForInvoice(i).length; });
      App.toast(n + ' sample(s) generated for ' + miss.length + ' invoice(s)');
      F.range = 'today'; /* generated rows are stamped now */
      render();
    });
  }

  /* ---------- page ---------- */
  var CSS =
    '.smp-scan{border:2px solid var(--bd);border-radius:var(--r-lg);background:#fff;padding:16px 18px;margin-bottom:18px;box-shadow:var(--sh-sm);transition:border-color .2s}' +
    '.smp-scan.f-ok{animation:smpOk .9s ease-out}.smp-scan.f-err{animation:smpErr .9s ease-out}.smp-scan.f-info{animation:smpInfo .9s ease-out}' +
    '@keyframes smpOk{0%{box-shadow:0 0 0 0 rgba(5,150,105,.55);border-color:var(--green);background:var(--green-soft)}100%{box-shadow:0 0 0 14px rgba(5,150,105,0);border-color:var(--bd);background:#fff}}' +
    '@keyframes smpErr{0%{box-shadow:0 0 0 0 rgba(220,38,38,.55);border-color:var(--red);background:var(--red-soft)}100%{box-shadow:0 0 0 14px rgba(220,38,38,0);border-color:var(--bd);background:#fff}}' +
    '@keyframes smpInfo{0%{box-shadow:0 0 0 0 rgba(37,99,235,.45);border-color:var(--blue);background:var(--blue-soft)}100%{box-shadow:0 0 0 14px rgba(37,99,235,0);border-color:var(--bd);background:#fff}}' +
    '.smp-scan-row{display:flex;gap:10px;align-items:center}' +
    '.smp-scan-ic{width:46px;height:46px;border-radius:13px;background:var(--brand-grad);color:#fff;display:grid;place-items:center;flex:none;box-shadow:0 6px 16px -4px rgba(19,24,69,.5)}' +
    '.smp-scan-ic svg{width:24px;height:24px}' +
    '.smp-scan-in{flex:1;min-width:0}' +
    '.smp-scan-in .input{font-size:18px;font-weight:700;letter-spacing:.02em;padding:11px 14px;font-family:"Courier New",ui-monospace,monospace}' +
    '.smp-scan-in .input::placeholder{font-family:var(--font);font-weight:500;letter-spacing:0;font-size:15px}' +
    '.smp-result{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:11px 14px;border-radius:12px;background:#f8fafc;border:1px solid var(--line);color:var(--muted);font-size:13.5px}' +
    '.smp-result.r-ok{background:var(--green-soft);border-color:#bfe8d6;color:var(--ink)}.smp-result.r-ok .smp-res-ic{color:var(--green)}' +
    '.smp-result.r-err{background:var(--red-soft);border-color:#f6c6c6;color:var(--ink)}.smp-result.r-err .smp-res-ic{color:var(--red)}' +
    '.smp-result.r-info{background:var(--blue-soft);border-color:#c5d6fb;color:var(--ink)}.smp-result.r-info .smp-res-ic{color:var(--blue)}' +
    '.smp-res-ic{flex:none;display:grid;place-items:center;padding-top:1px}' +
    '.smp-res-tx{display:flex;flex-direction:column;gap:2px;min-width:0}.smp-res-tx b{font-size:15px;font-weight:800}.smp-res-tx span{font-size:13px;color:var(--ink2);word-break:break-word}' +
    '.smp-res-tx code{font-family:"Courier New",monospace;font-weight:700}' +
    '.smp-hint{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:12.5px}.smp-hint i{font-style:normal;color:var(--faint)}' +
    '.smp-hint b{font-weight:700;color:var(--ink2);background:#fff;border:1px solid var(--line);border-radius:999px;padding:2px 10px}' +
    '.smp-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}' +
    '.smp-filters .input.smp-q{flex:1 1 260px;min-width:0;padding:8px 12px;font-size:13px}' +
    '.smp-filters .select,.smp-filters input[type=date]{width:auto;flex:0 0 auto;padding:8px 10px;font-size:13px}' +
    '.smp-sp{flex:1}' +
    '.smp-bulk{display:flex;gap:10px;align-items:center;padding:9px 14px;margin-bottom:12px;background:var(--brand-soft);border:1px solid var(--brand-line);border-radius:12px;font-size:13.5px}' +
    '.smp-bulk[hidden]{display:none}.smp-bulk b{color:var(--brand-d);margin-right:auto}' +
    '.smp-tc{display:inline-block;min-width:22px;text-align:center;font-size:11.5px;font-weight:800;background:#f1f5f9;color:var(--muted);border-radius:999px;padding:1px 7px;margin-left:4px}' +
    '.tab.on .smp-tc{background:var(--brand);color:#fff}' +
    '.smp-bc{display:inline-flex;align-items:center;gap:9px;cursor:pointer;margin:0}.smp-bc input{width:16px;height:16px;accent-color:var(--brand);flex:none;cursor:pointer}' +
    '.smp-code{font-weight:800;font-size:13.5px;color:var(--brand-d);letter-spacing:.01em}' +
    'tr.is-sel td{background:var(--brand-soft)}' +
    '.smp-sub{font-size:12px;color:var(--muted)}' +
    '.smp-tube{display:inline-flex;align-items:center;white-space:nowrap;font-weight:600;font-size:13px}' +
    '.smp-tests{max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink2);font-size:13px}' +
    '.smp-rej{font-size:11.5px;color:var(--red);margin-top:3px;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.smp-table td.smp-nw,.smp-table td .smp-code,.smp-table td .mono{white-space:nowrap}' +
    '@media(min-width:641px){.smp-table td.actions{display:table-cell;text-align:right;white-space:nowrap}.smp-table td.actions .btn{margin-left:5px;vertical-align:middle}.smp-table td.actions .btn:first-child{margin-left:0}}' +
    '.smp-btn-rej{color:var(--red)!important;border-color:#f3c7c7!important;background:#fff!important}.smp-btn-rej:hover{background:var(--red-soft)!important}' +
    '.smp-pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px}.smp-pager:empty{display:none}.smp-pager .muted{margin-right:auto;font-size:13px}' +
    '.smp-ld-ctl{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px}' +
    '.smp-ld-cp{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;margin-left:auto}.smp-ld-cp .input{width:76px;padding:7px 10px}' +
    '.smp-ld-info{font-size:12.5px;color:var(--muted);margin-bottom:10px}' +
    '.smp-ld-prev{background:#e9edf3;border-radius:12px;padding:16px;max-height:56vh;overflow:auto;display:flex;justify-content:center}' +
    '.smp-thgrid{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;zoom:2.2}' +
    '.smp-thgrid .smp-lbl{page-break-after:auto;box-shadow:0 1px 4px rgba(15,30,46,.25);border-radius:1mm}' +
    '.smp-a4pg{zoom:.8;background:#fff;width:210mm;min-height:297mm;padding:5mm;box-shadow:0 2px 10px rgba(15,30,46,.3)}' +
    '.smp-cam{position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:4/3;max-height:52vh}' +
    '.smp-cam video{width:100%;height:100%;object-fit:cover;display:block}' +
    '.smp-cam-line{position:absolute;left:8%;right:8%;top:50%;height:2px;background:rgba(255,60,60,.85);box-shadow:0 0 10px rgba(255,60,60,.9)}' +
    '.smp-cam-st{margin-top:10px;font-size:13.5px;color:var(--muted);min-height:20px}.smp-cam-st.is-ok{color:var(--green);font-weight:700}.smp-cam-st.is-err{color:var(--red);font-weight:700}' +
    '@media(max-width:640px){' +
      '.smp-scan{padding:13px}.smp-scan-ic{width:40px;height:40px}.smp-scan-in .input{font-size:16px}' +
      '.smp-filters .input.smp-q{flex:1 1 100%}.smp-filters .select,.smp-filters input[type=date]{flex:1 1 0;min-width:0}.smp-filters .btn{flex:1 1 100%}' +
      '#view .smp-table tbody td:first-child::before{display:none}.smp-bc{width:100%}.smp-tests{max-width:none;white-space:normal}.smp-rej{max-width:none;white-space:normal}' +
      '#view .smp-table td.actions .btn{flex:1 1 calc(50% - 8px)}.smp-thgrid{zoom:1.35}.smp-a4pg{zoom:.36}.smp-ld-cp{margin-left:0}.smp-scan-row .btn span{display:none}' +
    '}';

  /* ---------- KPI cards (computed from the GLOBAL UNFILTERED sample list) ---------- */
  function sampleKpis() {
    var all = [];
    try { all = S.all() || []; } catch (e) {}
    var c = { pending: 0, collected: 0, received: 0, processing: 0, done: 0, rejected: 0 };
    all.forEach(function (s) {
      var st = s && s.status;
      if (c[st] !== undefined) c[st]++;
    });
    var TUBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6.3L4.6 18.1a1.5 1.5 0 0 0 1.3 2.2h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.3V3"/></svg>';
    var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var FLASK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v6L4.5 18a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 8V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></svg>';
    var COG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';
    var X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
    function kpi(cls, icon, label, num, sub) {
      return '<div class="sp-kpi ' + cls + '"><div class="sp-chip">' + icon + '</div><div class="sp-label">' + label + '</div><div class="sp-num">' + num + '</div><div class="sp-sub">' + sub + '</div></div>';
    }
    return '<div class="sp-kpis">' +
      kpi('sp-navy', TUBE, 'TOTAL SAMPLES', all.length, 'all tubes') +
      kpi('sp-amber', CLOCK, 'TO COLLECT', c.pending, 'awaiting collection') +
      kpi('sp-blue', FLASK, 'IN LAB', c.collected + c.received, 'at the lab') +
      kpi('sp-purple', COG, 'PROCESSING', c.processing, 'being processed') +
      kpi('sp-green', CHECK, 'DONE', c.done, 'completed') +
      kpi('sp-red', X, 'REJECTED', c.rejected, 'rejected tubes') +
      '</div>';
  }

  function render() {
    var view = document.getElementById('view');
    if (!view) return;
    if (!cleaned) { cleaned = true; try { S.cleanupOrphans(); } catch (e) {} }
    var pre = null;
    try { pre = sessionStorage.getItem('labpos_smp_q'); if (pre) sessionStorage.removeItem('labpos_smp_q'); } catch (e) {}
    if (pre) { F.q = pre; F.range = 'all'; F.tab = 'all'; F.page = 0; }
    if (!F.date) F.date = App.today();
    var camSupport = typeof window.BarcodeDetector === 'function' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    view.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="smp-scan" id="smpScanBox">' +
        '<div class="smp-scan-row">' +
          '<span class="smp-scan-ic">' + App.icon('scan', 24) + '</span>' +
          '<div class="smp-scan-in"><input class="input" id="smpScan" type="text" placeholder="Scan or type barcode" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Scan or type barcode"></div>' +
          '<button class="btn btn-primary" id="smpGo" title="Apply scan">' + App.icon('check', 16) + '<span>Go</span></button>' +
          '<button class="btn" id="smpCam" hidden title="Scan with the device camera">' + App.icon('scan', 16) + '<span>Camera</span></button>' +
        '</div>' +
        '<div class="smp-result" id="smpResult"><div class="smp-hint"><span>Each scan moves the tube one step:</span>' +
          '<b>To collect</b><i>&rarr;</i><b>Collected</b><i>&rarr;</i><b>In lab</b><i>&rarr;</i><b>Processing</b><i>&rarr;</i><b>Done</b></div></div>' +
      '</div>' +
      sampleKpis() +
      '<div class="card"><div class="card-b">' +
        '<div class="smp-filters">' +
          '<input class="input search smp-q" id="smpQ" placeholder="Search patient, invoice or barcode…" value="' + esc(F.q) + '">' +
          '<select class="select" id="smpRange">' + [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['all', 'All dates'], ['pick', 'Pick a date…']].map(function (o) {
            return '<option value="' + o[0] + '"' + (F.range === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<input type="date" class="input" id="smpDate" value="' + esc(F.date) + '"' + (F.range === 'pick' ? '' : ' hidden') + '>' +
          '<span class="smp-sp"></span>' +
          '<button class="btn btn-primary btn-sm" id="smpGen" title="Create sample tubes for invoices in this date range that have none">' + App.icon('plus', 14) + ' Generate samples</button>' +
        '</div>' +
        '<div class="tabs" id="smpTabs"></div>' +
        '<div class="smp-bulk" id="smpBulk" hidden></div>' +
        '<div id="smpList"></div>' +
        '<div class="smp-pager" id="smpPager"></div>' +
      '</div></div>';

    var scan = document.getElementById('smpScan');
    function submit() { var v = scan.value; scan.value = ''; handleScan(v, 'scanner'); focusScan(); }
    scan.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    document.getElementById('smpGo').addEventListener('click', submit);
    if (camSupport) {
      try {
        window.BarcodeDetector.getSupportedFormats().then(function (f) {
          var b = document.getElementById('smpCam');
          if (b && f.indexOf('code_128') >= 0) { b.hidden = false; b.addEventListener('click', openCamera); }
        });
      } catch (e) {}
    }
    document.getElementById('smpQ').addEventListener('input', function () { F.q = this.value; F.page = 0; paintList(); });
    document.getElementById('smpRange').addEventListener('change', function () {
      F.range = this.value; F.page = 0;
      document.getElementById('smpDate').hidden = F.range !== 'pick';
      paintList();
    });
    document.getElementById('smpDate').addEventListener('change', function () { F.date = this.value; F.page = 0; paintList(); });
    document.getElementById('smpGen').addEventListener('click', generateMissing);
    document.getElementById('smpTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      F.tab = b.getAttribute('data-tab'); F.page = 0; paintList(); focusScan();
    });
    document.getElementById('smpPager').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pg]'); if (!b) return;
      F.page = Math.max(0, F.page + parseInt(b.getAttribute('data-pg'), 10)); paintList();
    });
    document.getElementById('smpBulk').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bulk]'); if (!b) return;
      if (b.getAttribute('data-bulk') === 'clear') { sel = {}; paintList(); return; }
      openLabelDialog(Object.keys(sel));
    });
    var listEl = document.getElementById('smpList');
    listEl.addEventListener('change', function (e) {
      var ck = e.target.closest && e.target.closest('.smp-ck'); if (!ck) return;
      var id = ck.getAttribute('data-id');
      if (ck.checked) sel[id] = true; else delete sel[id];
      paintList();
    });
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
      if (act === 'adv') {
        var to = b.getAttribute('data-to'), s0 = S.get(id);
        if (s0 && S.nextStatus(s0.status) === to) {
          S.setStatus(id, to);
          showResult('ok', esc(s0.barcode) + ' &rarr; ' + esc(S.LABEL[to]), [esc(s0.patientName) + ' &middot; ' + esc(s0.tube)]);
          App.toast(s0.barcode + ': ' + S.LABEL[to], 'ok');
        }
        paintList();
      } else if (act === 'label') openLabelDialog([id]);
      else if (act === 'rej') rejectDialog(id);
      else if (act === 'recol') {
        var nw = S.recollect(id);
        if (nw) App.toast('New sample ' + nw.barcode + ' created for re-collection');
        else App.toast('Could not create a re-collection sample', 'err');
        paintList();
      }
    });
    paintList();
    if (!isTouch()) scan.focus();
  }

  /* keep the scan box focused (barcode scanners "type" the code): refocus after clicks, and when a printable key is typed anywhere */
  function scanActive() { return location.hash === '#/samples' && document.getElementById('smpScan') && !document.body.classList.contains('modal-open'); }
  function focusScan() {
    if (isTouch() || !scanActive()) return;
    var a = document.activeElement;
    if (a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== 'smpScan') return;
    var el = document.getElementById('smpScan');
    if (el && a !== el) el.focus();
  }
  if (!window.__smpFocusWired) {
    window.__smpFocusWired = true;
    document.addEventListener('click', function (e) {
      if (!scanActive() || e.target.closest('input,select,textarea,label')) return;
      setTimeout(focusScan, 0);
    });
    document.addEventListener('keydown', function (e) {
      if (!scanActive() || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      var el = document.getElementById('smpScan');
      if (el && !isTouch()) el.focus(); /* the key press then lands in the box */
    });
  }

  App.route('#/samples', render);
})();
