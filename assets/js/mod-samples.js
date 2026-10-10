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
    '.smp-lbl .l-tube{font-weight:800;border:1px solid #000;border-radius:2px;padding:0 1.2mm;font-size:5.4pt;line-height:1.1;white-space:nowrap}' +
    '.smp-lbl .l-code{font-family:"Courier New",monospace;font-size:7.2pt;font-weight:800;letter-spacing:.2px}' +
    '.smp-lbl .l-date{font-size:5.4pt;white-space:nowrap}' +
    /* A4 sheet cells are larger: scale the same layout up */
    '.smp-lbl.l-a4{width:66.6mm;height:35.9mm;padding:2mm 3mm 1.5mm;page-break-after:auto;break-after:auto;outline:.2mm dashed #cfd6e0;outline-offset:-.2mm}' +
    '.smp-lbl.l-a4 .l-name{font-size:11pt}.smp-lbl.l-a4 .l-as{font-size:8.5pt}.smp-lbl.l-a4 .l-sub{font-size:7.2pt}' +
    '.smp-lbl.l-a4 .l-tests{font-size:7.4pt;max-height:7mm}.smp-lbl.l-a4 .l-code{font-size:10pt}.smp-lbl.l-a4 .l-date{font-size:7pt}' +
    '.smp-lbl.l-a4 .l-bc{margin-top:1mm}' +
    '.smp-sheet{display:grid;grid-template-columns:repeat(3,66.6mm);grid-auto-rows:35.9mm;page-break-after:always;break-after:page;width:199.8mm}' +
    '.smp-sheet:last-child{page-break-after:auto;break-after:auto}';

  function tubeTag(tb) {
    if (!tb) return 'Sample';
    var t = String(tb).toLowerCase();
    if (t.indexOf('edta') >= 0 || t.indexOf('lavender') >= 0 || t.indexOf('purple') >= 0) return 'EDTA (Purple)';
    if (t.indexOf('serum') >= 0 || t.indexOf('red') >= 0 || t.indexOf('gold') >= 0) return 'Serum (Red)';
    if (t.indexOf('fluoride') >= 0 || t.indexOf('grey') >= 0 || t.indexOf('gray') >= 0 || t.indexOf('sugar') >= 0) return 'Fluoride (Grey)';
    if (t.indexOf('citrate') >= 0 || t.indexOf('blue') >= 0) return 'Citrate (Blue)';
    if (t.indexOf('urine') >= 0) return 'Urine';
    if (t.indexOf('stool') >= 0) return 'Stool';
    if (t.indexOf('swab') >= 0) return 'Swab';
    return tb;
  }
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
    var mrNo = p && p.id ? p.id : (s.patientId || '');
    var invNo = s.invoiceNo || s.invoiceId || '';
    var subId = (mrNo ? 'MR: ' + mrNo : '') + (mrNo && invNo ? ' · ' : '') + (invNo ? invNo : (labName || ''));
    var maxPx = a4 ? 62 : 46.4;                                  /* printable width in mm */
    var mods = App.barcodeModules(s.barcode, 4);
    var modMm = Math.min(a4 ? 0.3 : 0.25, maxPx / mods);        /* 0.25 mm = exactly 2 dots on a 203 dpi thermal printer */
    var svg = App.barcodeSvg(s.barcode, { height: 10, quiet: 4, width: (mods * modMm).toFixed(2) + 'mm', cssHeight: (a4 ? 12 : 8.2) + 'mm' });
    return '<div class="smp-lbl' + (a4 ? ' l-a4' : '') + '">' +
      '<div class="l-top"><span class="l-name">' + esc(name) + '</span><span class="l-as">' + esc(patientLine(p)) + '</span></div>' +
      '<div class="l-sub"><span style="font-weight:700">' + esc(subId) + '</span><b class="l-tube">' + esc(tubeTag(s.tube)) + '</b></div>' +
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
    r.hidden = false;
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
    var kp = document.getElementById('spKpis');
    if (kp) kp.outerHTML = sampleKpis();
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
     '.smp-result{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:11px 14px;border-radius:12px;background:#f8fafc;border:1px solid var(--line);color:var(--muted);font-size:13.5px}.smp-result[hidden]{display:none}' +
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

  /* ---------- stat cards: same look as the main dashboard (.stat in app.css: tinted diagonal, icon chip, label, number, caption) ---------- */
  var SVG_ATTR = ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var STAT_ICON = {
    cal: '<svg' + SVG_ATTR + '><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    clock: '<svg' + SVG_ATTR + '><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    check: '<svg' + SVG_ATTR + '><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    box: '<svg' + SVG_ATTR + '><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>'
  };
  function statCard(tint, icon, label, value, sub) {
    return '<div class="stat" data-tint="' + tint + '"><div class="stat-ico">' + icon + '</div>' +
      '<div class="lb">' + label + '</div><div class="vl">' + value + '</div><div class="dl">' + sub + '</div></div>';
  }

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
    var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>';
    var inProcess = (c.collected || 0) + (c.received || 0) + (c.processing || 0);
    return '<div class="stat-grid" id="spKpis">' +
      statCard('brand', TUBE, 'Total Samples', all.length, 'all tubes') +
      statCard('amber', CLOCK, 'To Collect', c.pending, 'awaiting collection') +
      statCard('blue', FLASK, 'In Process', inProcess, 'in lab &amp; processing') +
      statCard('green', CHECK, 'Done', c.done, 'completed') +
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
      sampleKpis() +
      '<div class="smp-scan" id="smpScanBox">' +
        '<div class="smp-scan-row">' +
          '<span class="smp-scan-ic">' + App.icon('scan', 24) + '</span>' +
          '<div class="smp-scan-in"><input class="input" id="smpScan" type="text" placeholder="Scan or type barcode" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Scan or type barcode"></div>' +
          '<button class="btn btn-primary" id="smpGo" title="Apply scan">' + App.icon('check', 16) + '<span>Go</span></button>' +
          '<button class="btn" id="smpCam" hidden title="Scan with the device camera">' + App.icon('scan', 16) + '<span>Camera</span></button>' +
        '</div>' +
         '<div class="smp-result" id="smpResult" hidden aria-live="polite"></div>' +
      '</div>' +
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

  function tubeBadge(tb) {
    var t = String(tb || '').toLowerCase();
    var bg = '#f3f4f6', fg = '#374151', bd = '#e5e7eb', dot = '#9ca3af';
    if (t.indexOf('edta') >= 0 || t.indexOf('purple') >= 0 || t.indexOf('lavender') >= 0) {
      bg = '#f3e8ff'; fg = '#7e22ce'; bd = '#d8b4fe'; dot = '#9333ea';
    } else if (t.indexOf('serum') >= 0 || t.indexOf('red') >= 0 || t.indexOf('gold') >= 0) {
      bg = '#fee2e2'; fg = '#b91c1c'; bd = '#fca5a5'; dot = '#dc2626';
    } else if (t.indexOf('fluoride') >= 0 || t.indexOf('grey') >= 0 || t.indexOf('gray') >= 0) {
      bg = '#f1f5f9'; fg = '#475569'; bd = '#cbd5e1'; dot = '#64748b';
    } else if (t.indexOf('citrate') >= 0 || t.indexOf('blue') >= 0) {
      bg = '#e0f2fe'; fg = '#0369a1'; bd = '#7dd3fc'; dot = '#0284c7';
    } else if (t.indexOf('urine') >= 0) {
      bg = '#fef9c3'; fg = '#a16207'; bd = '#fde047'; dot = '#ca8a04';
    } else if (t.indexOf('heparin') >= 0 || t.indexOf('green') >= 0) {
      bg = '#dcfce7'; fg = '#15803d'; bd = '#86efac'; dot = '#16a34a';
    }
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:' + bg + ';color:' + fg + ';border:1px solid ' + bd + ';border-radius:999px;padding:2px 8px;font-size:11.5px;font-weight:700;white-space:nowrap"><span style="width:7px;height:7px;border-radius:50%;background:' + dot + '"></span>' + esc(tubeTag(tb)) + '</span>';
  }

  /* ==========================================================================
     DEDICATED DASHBOARD: TUBE STICKERS & BARCODE CENTER (#/samples/stickers)
     Direct 50x25mm Thermal Label Printing & Batch Specimen Barcodes
     ========================================================================== */
  var STK = {
    q: '',
    range: 'today',
    date: App.today(),
    tube: 'all',
    status: 'all',
    page: 0,
    selectedId: null,
    checked: {},
    copies: 1,
    fmt: lsGet('labpos_smp_fmt', 'thermal')
  };

  var STK_CSS =
    '.stk-layout{display:flex;flex-direction:column;gap:20px;width:100%}' +
    '.stk-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;flex-wrap:wrap}' +
    '.stk-head-title h2{margin:0 0 4px;font-size:20px;font-weight:800;color:var(--brand-d);display:flex;align-items:center;gap:8px}' +
    '.stk-head-title p{margin:0;font-size:13px;color:var(--muted)}' +
    '.stk-head-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
    '.stk-preview-box{background:#ffffff;border:1.5px solid var(--bd);border-radius:16px;padding:22px 24px;box-shadow:0 4px 20px rgba(15,23,42,.05)}' +
    '.stk-prev-card{background:radial-gradient(circle at 50% 50%, #f8fafc 0%, #e2e8f0 100%);border:1px solid #cbd5e1;border-radius:14px;padding:34px 20px;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:220px;margin-bottom:0;overflow:hidden}' +
    '.stk-prev-zoom{zoom:2.5;-moz-transform:scale(2.5);-moz-transform-origin:center;display:flex;justify-content:center}' +
    '.stk-prev-zoom .smp-lbl{box-shadow:0 10px 30px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.1);border-radius:3px}' +
    '.stk-prev-empty{font-size:14px;color:var(--muted);text-align:center;padding:36px 16px}' +
    '.stk-prev-grid{display:grid;grid-template-columns:minmax(320px,1.2fr) minmax(280px,1fr);gap:24px;align-items:start}' +
    '@media(max-width:880px){.stk-prev-grid{grid-template-columns:1fr}}' +
    '.stk-tip-box{font-size:12px;color:var(--muted);background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:12px 14px;line-height:1.5}' +
    '.stk-tip-box b{color:var(--ink);font-weight:700}' +
    '.smp-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}' +
    '.smp-filters .input.search,.smp-filters .input.smp-q{flex:1 1 200px;min-width:160px;width:auto;padding:7px 12px;font-size:13px;height:36px;border-radius:8px}' +
    '.smp-filters .select,.smp-filters input[type=date]{width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px}';

  function renderStickersDashboard() {
    var view = document.getElementById('view');
    if (!view) return;
    if (!cleaned) { cleaned = true; try { S.cleanupOrphans(); } catch (e) {} }

    function getFilteredList() {
      var all = S.all() || [];
      var q = STK.q.trim().toLowerCase();
      var filtered = all.filter(function (s) {
        if (STK.range !== 'all') {
          var k = dayKey(s.createdAt), t = App.today();
          if (STK.range === 'today' && k !== t) return false;
          if (STK.range === 'yesterday' && k !== addDays(t, -1)) return false;
          if (STK.range === 'last7' && (k < addDays(t, -6) || k > t)) return false;
          if (STK.range === 'last30' && (k < addDays(t, -29) || k > t)) return false;
          if (STK.range === 'pick' && k !== (STK.date || t)) return false;
        }
        if (STK.tube !== 'all') {
          var tb = String(s.tube || '').toLowerCase();
          if (STK.tube === 'edta' && tb.indexOf('edta') < 0 && tb.indexOf('purple') < 0) return false;
          if (STK.tube === 'serum' && tb.indexOf('serum') < 0 && tb.indexOf('red') < 0) return false;
          if (STK.tube === 'fluoride' && tb.indexOf('fluoride') < 0 && tb.indexOf('grey') < 0 && tb.indexOf('gray') < 0) return false;
          if (STK.tube === 'citrate' && tb.indexOf('citrate') < 0 && tb.indexOf('blue') < 0) return false;
          if (STK.tube === 'urine' && tb.indexOf('urine') < 0) return false;
        }
        if (STK.status !== 'all' && s.status !== STK.status) return false;
        if (q) {
          var hay = (s.barcode + ' ' + s.patientName + ' ' + s.invoiceNo + ' ' + s.patientId + ' ' + s.tube + ' ' + (s.testNames || []).join(' ')).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
      filtered.sort(function (a, b) {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return String(a.barcode).localeCompare(String(b.barcode), undefined, { numeric: true });
      });
      return filtered;
    }

    function computeStats() {
      var all = S.all() || [];
      var todayKey = App.today();
      var todayTubes = all.filter(function (s) { return dayKey(s.createdAt) === todayKey; });
      var todayInvs = {};
      todayTubes.forEach(function (s) { if (s.invoiceId) todayInvs[s.invoiceId] = true; });
      var pendingCount = todayTubes.filter(function (s) { return s.status === 'pending'; }).length;
      var readyCount = todayTubes.filter(function (s) { return s.status !== 'pending' && s.status !== 'rejected'; }).length;
      return {
        invoices: Object.keys(todayInvs).length,
        tubes: todayTubes.length,
        pending: pendingCount,
        ready: readyCount
      };
    }

    function renderUI() {
      var st = computeStats();
      var list = getFilteredList();

      // ensure selected sample is valid
      if (!STK.selectedId && list.length) STK.selectedId = list[0].id;
      if (STK.selectedId && !list.some(function (x) { return x.id === STK.selectedId; })) {
        STK.selectedId = list.length ? list[0].id : null;
      }
      var currentSample = STK.selectedId ? S.get(STK.selectedId) : null;

      var checkedCount = Object.keys(STK.checked).length;

      var kpiHtml =
        '<div class="stat-grid">' +
          statCard('brand', App.icon('file', 20), "Today's Invoices", st.invoices, 'billed today') +
          statCard('blue', App.icon('tube', 20), 'Tubes Today', st.tubes, 'specimen tubes') +
          statCard('amber', STAT_ICON.clock, 'To Collect', st.pending, 'awaiting collection') +
          statCard('green', STAT_ICON.check, 'Collected / In Lab', st.ready, 'tubes received') +
        '</div>';

      var previewHtml = '';
      if (currentSample) {
        var labelHtml = oneLabel(currentSample, false);
        previewHtml =
          '<div class="stk-prev-grid">' +
            '<div>' +
              '<div class="stk-prev-card">' +
                '<div class="stk-prev-zoom">' + labelHtml + '</div>' +
              '</div>' +
              '<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:10px;font-weight:600">' +
                '🔍 2.5× Magnified Thermal Label Preview (50×25mm) &bull; Click any tube row in table above to switch' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:14px;justify-content:center">' +
              '<div style="background:#f8fafc;border:1.5px solid var(--bd);border-radius:14px;padding:16px 18px;line-height:1.5">' +
                '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">' +
                  '<span style="font-size:17px;font-weight:800;color:var(--ink)">' + esc(currentSample.patientName) + '</span>' +
                  (currentSample.patientId ? '<span class="badge" style="font-size:11.5px;background:#e2e8f0;color:var(--ink);font-weight:700">MR: ' + esc(currentSample.patientId) + '</span>' : '') +
                '</div>' +
                '<div style="font-size:13px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px">' +
                  '<span><b>Invoice:</b> ' + esc(currentSample.invoiceNo || '—') + '</span>' +
                  '<span><b>Barcode:</b> <code style="font-weight:800;color:var(--brand-d);background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:13px">' + esc(currentSample.barcode) + '</code></span>' +
                '</div>' +
                '<div style="margin-top:6px;display:flex;align-items:center;gap:10px">' +
                  '<span style="font-size:13px;font-weight:700;color:var(--ink)">Specimen Tube:</span>' +
                  tubeBadge(currentSample.tube) +
                '</div>' +
                (currentSample.testNames && currentSample.testNames.length ? '<div style="margin-top:10px;font-size:12.5px;color:var(--ink2);line-height:1.4"><b>Tests:</b> ' + esc(currentSample.testNames.join(', ')) + '</div>' : '') +
              '</div>' +
              '<div style="display:flex;gap:12px;align-items:flex-end">' +
                '<div style="width:90px">' +
                  '<label style="font-size:11.5px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;text-transform:uppercase">Copies:</label>' +
                  '<input type="number" id="stkCopies" class="input" min="1" max="20" value="' + STK.copies + '" style="width:100%;padding:9px 12px;font-weight:800;font-size:15px;text-align:center">' +
                '</div>' +
                '<div style="flex:1">' +
                  '<label style="font-size:11.5px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;text-transform:uppercase">Format:</label>' +
                  '<select id="stkFmt" class="select" style="padding:9px 12px;font-size:13.5px;width:100%">' +
                    '<option value="thermal"' + (STK.fmt === 'thermal' ? ' selected' : '') + '>50×25mm Thermal Roll</option>' +
                    '<option value="a4"' + (STK.fmt === 'a4' ? ' selected' : '') + '>A4 Sheet (3×8 Labels)</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<button class="btn btn-primary" id="stkPrintCurrent" style="justify-content:center;font-weight:800;font-size:15px;padding:13px 20px;box-shadow:0 4px 14px rgba(19,24,69,.35)">' +
                App.icon('printer', 18) + ' Print This Sticker Now' +
              '</button>' +
              (checkedCount > 1
                ? '<button class="btn btn-ghost" id="stkPrintChecked" style="justify-content:center;font-weight:700;padding:10px 16px">' +
                    App.icon('printer', 16) + ' Print ' + checkedCount + ' Selected Stickers' +
                  '</button>'
                : '') +
              '<div class="stk-tip-box" style="margin-top:4px">' +
                '<b>Thermal Printer Standard:</b> 50mm width × 25mm height.<br>' +
                'Barcode uses Code128 standard supported by all lab analyzers and handheld laser scanners.<br>' +
                'Set printer margin to <b>None</b> for seamless thermal alignment.' +
              '</div>' +
            '</div>' +
          '</div>';
      } else {
        previewHtml =
          '<div style="text-align:center;padding:48px 24px;background:#f8fafc;border:2px dashed var(--bd);border-radius:16px">' +
            '<div style="font-size:48px;margin-bottom:12px">🖨️</div>' +
            '<h3 style="margin:0 0 8px;font-size:17px;font-weight:800;color:var(--ink)">No Tube Selected</h3>' +
            '<p class="muted" style="margin:0 0 20px;max-width:480px;margin-left:auto;margin-right:auto;font-size:14px">' +
              'Click on any tube row in the table above to preview and print its 50×25mm thermal barcode sticker.' +
            '</p>' +
            '<div class="stk-tip-box" style="max-width:540px;margin:0 auto;text-align:left">' +
              '<b>Thermal Printer Standard:</b> 50mm width × 25mm height.<br>' +
              'Barcode uses Code128 standard supported by all lab analyzers and handheld laser scanners.<br>' +
              'Set printer margin to <b>None</b> for seamless thermal alignment.' +
            '</div>' +
          '</div>';
      }

      var PAGE_SIZE = 40;
      var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (STK.page >= totalPages) STK.page = totalPages - 1;
      var from = STK.page * PAGE_SIZE;
      var slice = list.slice(from, from + PAGE_SIZE);

      var tableRows = '';
      if (!slice.length) {
        tableRows = '<tr><td colspan="7">' + App.empty('No sample tube stickers found matching current filters.') + '</td></tr>';
      } else {
        tableRows = slice.map(function (s) {
          var isCur = currentSample && currentSample.id === s.id;
          var isChk = !!STK.checked[s.id];
          return '<tr class="' + (isCur ? 'is-sel' : '') + '" style="cursor:pointer" data-row-id="' + esc(s.id) + '">' +
            '<td><input type="checkbox" class="stk-ck" data-id="' + esc(s.id) + '" ' + (isChk ? 'checked' : '') + ' onclick="event.stopPropagation()"></td>' +
            '<td><span class="mono" style="font-weight:800;color:var(--brand-d);font-size:13px">' + esc(s.barcode) + '</span></td>' +
            '<td><div style="font-weight:700">' + esc(s.patientName) + '</div>' +
              '<div style="font-size:11.5px;color:var(--muted)">' + (s.patientId ? 'MR: ' + esc(s.patientId) : '') + (s.patientId && s.invoiceNo ? ' &middot; ' : '') + esc(s.invoiceNo || '') + '</div></td>' +
            '<td>' + tubeBadge(s.tube) + '</td>' +
            '<td><div style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;color:var(--ink2)" title="' + esc((s.testNames || []).join(', ')) + '">' + esc((s.testNames || []).join(', ')) + '</div></td>' +
            '<td>' + S.badge(s.status) + '</td>' +
            '<td class="actions" style="text-align:right;white-space:nowrap">' +
              '<button class="btn btn-sm btn-ghost stk-quick-print" data-id="' + esc(s.id) + '" title="Print 1 label immediately" onclick="event.stopPropagation()">' + App.icon('printer', 13) + ' Print</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      }

      view.innerHTML =
        '<style>' + CSS + LABEL_CSS + STK_CSS + '</style>' +
        kpiHtml +
        '<div class="stk-layout">' +
          '<div class="card"><div class="card-b">' +
            '<div class="smp-filters" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<input class="input search smp-q" id="stkSearch" placeholder="Search barcode, patient, MR#, invoice, test..." value="' + esc(STK.q) + '" style="flex:1 1 200px;min-width:160px;width:auto;padding:7px 12px;font-size:13px;height:36px;border-radius:8px">' +
              '<select class="select" id="stkRange" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px">' +
                [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['all', 'All dates'], ['pick', 'Pick date...']].map(function (o) {
                  return '<option value="' + o[0] + '"' + (STK.range === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
                }).join('') +
              '</select>' +
              '<input type="date" class="input" id="stkDate" value="' + esc(STK.date) + '" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px" ' + (STK.range === 'pick' ? '' : 'hidden') + '>' +
              '<select class="select" id="stkTubeFilter" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px">' +
                '<option value="all">All Tubes</option>' +
                '<option value="edta"' + (STK.tube === 'edta' ? ' selected' : '') + '>EDTA (Purple)</option>' +
                '<option value="serum"' + (STK.tube === 'serum' ? ' selected' : '') + '>Serum (Red)</option>' +
                '<option value="citrate"' + (STK.tube === 'citrate' ? ' selected' : '') + '>Citrate (Blue)</option>' +
                '<option value="fluoride"' + (STK.tube === 'fluoride' ? ' selected' : '') + '>Fluoride (Grey)</option>' +
                '<option value="urine"' + (STK.tube === 'urine' ? ' selected' : '') + '>Urine</option>' +
              '</select>' +
              '<select class="select" id="stkStatusFilter" style="width:auto;flex:0 0 auto;padding:7px 10px;font-size:13px;height:36px;border-radius:8px">' +
                '<option value="all">All Statuses</option>' +
                '<option value="pending"' + (STK.status === 'pending' ? ' selected' : '') + '>To collect</option>' +
                '<option value="collected"' + (STK.status === 'collected' ? ' selected' : '') + '>Collected</option>' +
                '<option value="received"' + (STK.status === 'received' ? ' selected' : '') + '>In lab</option>' +
                '<option value="done"' + (STK.status === 'done' ? ' selected' : '') + '>Done</option>' +
              '</select>' +
              '<button class="btn btn-primary" id="stkPrintAllToday" style="height:36px;padding:0 14px;white-space:nowrap;font-size:13px;display:inline-flex;align-items:center;gap:6px">' + App.icon('printer', 15) + ' Print All Today\'s Stickers</button>' +
              '<button class="btn btn-ghost" id="stkGenMissing" style="height:36px;padding:0 12px;white-space:nowrap;font-size:13px;display:inline-flex;align-items:center;gap:6px">' + App.icon('plus', 14) + ' Generate Missing Tubes</button>' +
              '<a class="btn btn-ghost" href="#/samples" style="height:36px;padding:0 12px;white-space:nowrap;font-size:13px;display:inline-flex;align-items:center;gap:6px">' + App.icon('scan', 14) + ' Sample Tracking</a>' +
            '</div>' +
            (checkedCount > 0
              ? '<div class="smp-bulk" style="margin-bottom:12px">' +
                  '<b>' + checkedCount + ' sticker(s) selected</b>' +
                  '<button class="btn btn-primary btn-sm" id="stkBulkPrint">' + App.icon('printer', 14) + ' Print Selected Stickers</button>' +
                  '<button class="btn btn-ghost btn-sm" id="stkBulkClear">Clear Selection</button>' +
                '</div>'
              : '') +
            '<div class="tbl-wrap"><table class="table smp-table"><thead><tr>' +
              '<th style="width:36px"><input type="checkbox" id="stkCheckAll" title="Select all on this page"></th>' +
              '<th>Barcode</th>' +
              '<th>Patient & MR#</th>' +
              '<th>Tube Type</th>' +
              '<th>Tests</th>' +
              '<th>Status</th>' +
              '<th style="text-align:right">Action</th>' +
            '</tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
            '<div class="smp-pager">' +
              (list.length > PAGE_SIZE
                ? '<span class="muted">' + (from + 1) + '–' + Math.min(from + PAGE_SIZE, list.length) + ' of ' + list.length + ' tubes</span>' +
                  '<button class="btn btn-sm" id="stkPrev"' + (STK.page === 0 ? ' disabled' : '') + '>&larr; Prev</button>' +
                  '<button class="btn btn-sm" id="stkNext"' + (STK.page >= totalPages - 1 ? ' disabled' : '') + '>Next &rarr;</button>'
                : (list.length ? '<span class="muted">' + list.length + ' tube sticker' + (list.length === 1 ? '' : 's') + '</span>' : '')) +
            '</div>' +
          '</div></div>' +
          '<div class="stk-preview-box">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">' +
              '<div style="display:flex;align-items:center;gap:10px">' +
                '<span style="width:36px;height:36px;border-radius:10px;background:#e0e7ff;color:#4338ca;display:inline-flex;align-items:center;justify-content:center">' + App.icon('printer', 20) + '</span>' +
                '<div>' +
                  '<h3 style="margin:0;font-size:17px;font-weight:800;color:var(--ink)">Live Sticker Preview</h3>' +
                  '<span style="font-size:12.5px;color:var(--muted)">Direct Thermal Label (50mm × 25mm) Barcode Preview</span>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px">' +
                '<span class="badge" style="background:#e0f2fe;color:#0369a1;font-weight:700;padding:4px 10px;font-size:12px;border-radius:8px">50 × 25 mm Thermal Roll</span>' +
                (currentSample ? '<span class="badge" style="background:#dcfce7;color:#15803d;font-weight:700;padding:4px 10px;font-size:12px;border-radius:8px">Ready to Print</span>' : '') +
              '</div>' +
            '</div>' +
            previewHtml +
          '</div>' +
        '</div>';

      // Attach event listeners
      document.getElementById('stkSearch').addEventListener('input', function () {
        STK.q = this.value; STK.page = 0; renderUI();
      });
      document.getElementById('stkRange').addEventListener('change', function () {
        STK.range = this.value; STK.page = 0; renderUI();
      });
      var dtEl = document.getElementById('stkDate');
      if (dtEl) dtEl.addEventListener('change', function () {
        STK.date = this.value; STK.page = 0; renderUI();
      });
      document.getElementById('stkTubeFilter').addEventListener('change', function () {
        STK.tube = this.value; STK.page = 0; renderUI();
      });
      document.getElementById('stkStatusFilter').addEventListener('change', function () {
        STK.status = this.value; STK.page = 0; renderUI();
      });

      var chkAll = document.getElementById('stkCheckAll');
      if (chkAll) {
        var pageIds = slice.map(function (x) { return x.id; });
        chkAll.checked = pageIds.length > 0 && pageIds.every(function (id) { return STK.checked[id]; });
        chkAll.addEventListener('change', function () {
          pageIds.forEach(function (id) {
            if (chkAll.checked) STK.checked[id] = true;
            else delete STK.checked[id];
          });
          renderUI();
        });
      }

      view.querySelectorAll('.stk-ck').forEach(function (ck) {
        ck.addEventListener('change', function () {
          var id = this.getAttribute('data-id');
          if (this.checked) STK.checked[id] = true;
          else delete STK.checked[id];
          renderUI();
        });
      });

      view.querySelectorAll('[data-row-id]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          STK.selectedId = this.getAttribute('data-row-id');
          renderUI();
        });
      });

      view.querySelectorAll('.stk-quick-print').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          var s = S.get(id);
          if (s) {
            App.print('Sticker ' + s.barcode, printCss('thermal') + labelsHTML([s], 'thermal', 1), { noHeader: true });
          }
        });
      });

      var btnPrev = document.getElementById('stkPrev');
      if (btnPrev) btnPrev.addEventListener('click', function () { STK.page = Math.max(0, STK.page - 1); renderUI(); });
      var btnNext = document.getElementById('stkNext');
      if (btnNext) btnNext.addEventListener('click', function () { STK.page++; renderUI(); });

      var cpEl = document.getElementById('stkCopies');
      if (cpEl) cpEl.addEventListener('input', function () {
        STK.copies = Math.max(1, Math.min(20, parseInt(this.value, 10) || 1));
      });
      var fmtEl = document.getElementById('stkFmt');
      if (fmtEl) fmtEl.addEventListener('change', function () {
        STK.fmt = this.value; lsSet('labpos_smp_fmt', STK.fmt);
      });

      var btnCur = document.getElementById('stkPrintCurrent');
      if (btnCur && currentSample) {
        btnCur.addEventListener('click', function () {
          App.print('Sticker ' + currentSample.barcode, printCss(STK.fmt) + labelsHTML([currentSample], STK.fmt, STK.copies), { noHeader: true });
        });
      }

      var btnChk = document.getElementById('stkPrintChecked');
      if (btnChk) {
        btnChk.addEventListener('click', function () {
          var ids = Object.keys(STK.checked);
          var selectedSamples = ids.map(function (id) { return S.get(id); }).filter(Boolean);
          if (selectedSamples.length) {
            App.print('Selected Stickers (' + selectedSamples.length + ')', printCss(STK.fmt) + labelsHTML(selectedSamples, STK.fmt, STK.copies), { noHeader: true });
          }
        });
      }

      var bulkPr = document.getElementById('stkBulkPrint');
      if (bulkPr) {
        bulkPr.addEventListener('click', function () {
          var ids = Object.keys(STK.checked);
          openLabelDialog(ids);
        });
      }
      var bulkClr = document.getElementById('stkBulkClear');
      if (bulkClr) {
        bulkClr.addEventListener('click', function () {
          STK.checked = {}; renderUI();
        });
      }

      document.getElementById('stkPrintAllToday').addEventListener('click', function () {
        var todayKey = App.today();
        var todayTubes = (S.all() || []).filter(function (s) { return dayKey(s.createdAt) === todayKey; });
        if (!todayTubes.length) {
          App.toast('No sample tubes generated for today yet.', 'info');
          return;
        }
        openLabelDialog(todayTubes.map(function (s) { return s.id; }));
      });

      document.getElementById('stkGenMissing').addEventListener('click', function () {
        generateMissing();
        setTimeout(renderUI, 300);
      });
    }

    renderUI();
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
  App.route('#/samples/stickers', renderStickersDashboard);

  /* ============================================================
     HOME SAMPLE COLLECTION BOOKING & DISPATCH CENTER
     Routes: #/home-sampling, #/samples/home
     ============================================================ */

  var HS_FILTER = { tab: 'all', q: '', date: 'all', riderId: 'all' };

  function renderHomeSamplingDashboard() {
    var view = document.getElementById('view');
    if (!view) return;

    var bookings = DB.all('home_sampling') || [];
    var riders = DB.all('riders') || [];
    var riderMap = {};
    riders.forEach(function (r) { riderMap[r.id] = r; });

    var todayStr = App.today();
    var tomorrowStr = addDays(todayStr, 1);

    /* Summary totals use all bookings, independent of table filters. */
    var todayBookings = bookings.filter(function (b) { return b.scheduledDate === todayStr; });
    var pendingCount = bookings.filter(function (b) { return b.status === 'scheduled'; }).length;
    var dispatchedCount = bookings.filter(function (b) { return b.status === 'dispatched'; }).length;
    var collectedCount = bookings.filter(function (b) { return b.status === 'collected'; }).length;

    /* Filter bookings */
    var filtered = bookings.filter(function (b) {
      if (HS_FILTER.tab !== 'all' && b.status !== HS_FILTER.tab) return false;
      if (HS_FILTER.date === 'today' && b.scheduledDate !== todayStr) return false;
      if (HS_FILTER.date === 'tomorrow' && b.scheduledDate !== tomorrowStr) return false;
      if (HS_FILTER.riderId !== 'all' && b.riderId !== HS_FILTER.riderId) return false;
      if (HS_FILTER.q) {
        var q = HS_FILTER.q.toLowerCase();
        var inNo = (b.bookingNo || '').toLowerCase().indexOf(q) >= 0;
        var inPat = (b.patientName || '').toLowerCase().indexOf(q) >= 0;
        var inPhone = (b.phone || '').toLowerCase().indexOf(q) >= 0;
        var inAddr = (b.address || '').toLowerCase().indexOf(q) >= 0;
        var inArea = (b.area || '').toLowerCase().indexOf(q) >= 0;
        var inTests = (b.tests || '').toLowerCase().indexOf(q) >= 0;
        if (!inNo && !inPat && !inPhone && !inAddr && !inArea && !inTests) return false;
      }
      return true;
    }).sort(function (a, b) {
      return (String(b.scheduledDate || '') + (b.timeSlot || '')).localeCompare(String(a.scheduledDate || '') + (a.timeSlot || ''));
    });

    var STATUS_INFO = {
      scheduled: { label: 'Scheduled', badge: 'background:#fef3c7;color:#b45309;border:1px solid #fde68a', icon: '📅' },
      dispatched: { label: 'Dispatched', badge: 'background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd', icon: '🛵' },
      collected: { label: 'Collected', badge: 'background:#f3e8ff;color:#7e22ce;border:1px solid #d8b4fe', icon: '🩸' },
      received_in_lab: { label: 'Received in Lab', badge: 'background:#dcfce7;color:#15803d;border:1px solid #86efac', icon: '🔬' },
      cancelled: { label: 'Cancelled', badge: 'background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5', icon: '❌' }
    };

    var tabCounts = {
      all: bookings.length,
      scheduled: pendingCount,
      dispatched: dispatchedCount,
      collected: collectedCount,
      received_in_lab: bookings.filter(function (b) { return b.status === 'received_in_lab'; }).length,
      cancelled: bookings.filter(function (b) { return b.status === 'cancelled'; }).length
    };

    var html = ''
      + '<style>'
      + '.hs-dash { max-width: 1300px; margin: 0 auto; }'
      + '.hs-tab-bar { display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1.5px solid var(--bd); padding-bottom: 12px; margin-bottom: 16px; }'
      + '.hs-tab-btn { background: transparent; border: 1.5px solid transparent; border-radius: 8px; padding: 6px 14px; font-weight: 600; font-size: 13px; color: var(--muted); cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all .15s; }'
      + '.hs-tab-btn:hover { background: #f1f5f9; color: var(--ink); }'
      + '.hs-tab-btn.active { background: #131845; color: #fff; border-color: #131845; }'
      + '.hs-tab-count { background: rgba(0,0,0,.08); border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 700; }'
      + '.hs-tab-btn.active .hs-tab-count { background: rgba(255,255,255,.25); color: #fff; }'
      + '.hs-badge-status { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: .03em; display: inline-flex; align-items: center; gap: 4px; }'
      + '</style>'
      + '<div class="hs-dash">'
      + '<div class="stat-grid">'
      + [
          { label: "Today's Bookings", value: todayBookings.length, subtitle: 'Scheduled for today', tint: 'blue', icon: STAT_ICON.cal },
          { label: 'Pending Dispatch', value: pendingCount, subtitle: 'Scheduled · All dates', tint: 'amber', icon: STAT_ICON.clock },
          { label: 'Dispatched', value: dispatchedCount, subtitle: 'All dates', tint: 'brand', icon: STAT_ICON.box },
          { label: 'Collected', value: collectedCount, subtitle: 'All dates', tint: 'green', icon: STAT_ICON.check }
        ].map(function (card) {
          return statCard(card.tint, card.icon, App.esc(card.label), App.esc(String(card.value)), App.esc(card.subtitle));
        }).join('')
      + '</div>'

      /* Search & Filter Card with Integrated Status Pipeline Tabs */
      + '<div class="card" style="margin-bottom:18px"><div class="card-b" style="padding:14px 16px">'
      +   '<div class="hs-tab-bar" style="border-bottom:1.5px solid var(--bd);padding-bottom:12px;margin-bottom:12px">'
      +   [
            { id: 'all', label: 'All Bookings', count: tabCounts.all },
            { id: 'scheduled', label: '📅 Scheduled', count: tabCounts.scheduled },
            { id: 'dispatched', label: '🛵 Dispatched', count: tabCounts.dispatched },
            { id: 'collected', label: '🩸 Collected', count: tabCounts.collected },
            { id: 'received_in_lab', label: '🔬 Received in Lab', count: tabCounts.received_in_lab },
            { id: 'cancelled', label: '❌ Cancelled', count: tabCounts.cancelled }
          ].map(function (tab) {
            var isAct = HS_FILTER.tab === tab.id;
            return '<button class="hs-tab-btn' + (isAct ? ' active' : '') + '" data-hs-tab="' + tab.id + '">'
              + tab.label + ' <span class="hs-tab-count">' + tab.count + '</span>'
              + '</button>';
          }).join('')
      +   '</div>'
      +   '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
      +     '<input class="input search" id="hsSearch" placeholder="Search by patient, phone, address, booking #, tests..." value="' + App.esc(HS_FILTER.q) + '" style="flex:1 1 240px;min-width:200px">'
      +     '<div style="display:flex;gap:6px;align-items:center">'
      +       '<span style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase">Date:</span>'
      +       '<select class="select" id="hsDateSelect" style="width:auto;padding:5px 8px;font-size:12.5px">'
      +         '<option value="all"' + (HS_FILTER.date === 'all' ? ' selected' : '') + '>All Dates</option>'
      +         '<option value="today"' + (HS_FILTER.date === 'today' ? ' selected' : '') + '>Today (' + App.d(todayStr) + ')</option>'
      +         '<option value="tomorrow"' + (HS_FILTER.date === 'tomorrow' ? ' selected' : '') + '>Tomorrow (' + App.d(tomorrowStr) + ')</option>'
      +       '</select>'
      +     '</div>'
      +     '<div style="display:flex;gap:6px;align-items:center">'
      +       '<span style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase">Rider:</span>'
      +       '<select class="select" id="hsRiderSelect" style="width:auto;padding:5px 8px;font-size:12.5px">'
      +         '<option value="all">All Riders</option>'
      +         riders.map(function (r) {
                  return '<option value="' + App.esc(r.id) + '"' + (HS_FILTER.riderId === r.id ? ' selected' : '') + '>' + App.esc(r.name) + '</option>';
                }).join('')
      +       '</select>'
      +     '</div>'
      +     (HS_FILTER.q || HS_FILTER.date !== 'all' || HS_FILTER.riderId !== 'all' ? '<button class="btn btn-ghost btn-sm" id="hsClearFilter" style="color:var(--red);padding:5px 8px">✕ Reset</button>' : '')
      +     '<span style="flex:1"></span>'
      +     '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +       '<button class="btn btn-sm btn-secondary" id="hsRidersBtn" title="Manage Phlebotomist Riders" style="font-weight:600;background:#fff;border:1.5px solid var(--bd,#cbd5e1)">👥 Phlebotomist Riders (' + riders.length + ')</button>'
      +       '<button class="btn btn-sm btn-secondary" id="hsSeedBtn" title="Seed Demo Bookings" style="font-weight:600;background:#fff;border:1.5px solid var(--bd,#cbd5e1)">⚡ Seed Bookings</button>'
      +       '<button class="btn btn-primary btn-sm" id="hsBookBtn" style="font-weight:700">+ Book Home Collection</button>'
      +     '</div>'
      +   '</div>'
      + '</div></div>';

    if (!filtered.length) {
      html += '<div class="card"><div class="card-b" style="text-align:center;padding:48px 20px">'
        + '<div style="font-size:44px;margin-bottom:12px">🛵</div>'
        + '<h3 style="margin:0 0 6px">No Home Sampling Bookings Found</h3>'
        + '<p class="muted" style="margin:0 0 18px;max-width:480px;margin-left:auto;margin-right:auto">'
        + (bookings.length ? 'No bookings match your current search and filter selections.' : 'No doorstep sample collection visits booked yet. Book your first home sampling visit or seed sample demo bookings.')
        + '</p>'
        + '<div style="display:flex;gap:10px;justify-content:center">'
        +   '<button class="btn btn-primary" id="hsEmptyBookBtn">+ Book Home Collection</button>'
        +   '<button class="btn btn-ghost" id="hsEmptySeedBtn">⚡ Seed Sample Bookings</button>'
        + '</div>'
        + '</div></div></div>';
      view.innerHTML = html;
      wireHomeSamplingEvents();
      return;
    }

    /* Bookings Table */
    html += '<div class="card" style="margin-bottom:24px"><div class="card-b" style="padding:0">'
      + '<div class="tbl-wrap"><table class="table" style="font-size:13px"><thead><tr>'
      +   '<th>Booking &amp; Status</th>'
      +   '<th>Date &amp; Time Slot</th>'
      +   '<th>Patient Details</th>'
      +   '<th>Collection Address</th>'
      +   '<th>Tests &amp; Specimen</th>'
      +   '<th>Assigned Phlebotomist</th>'
      +   '<th style="text-align:right">Total Amount</th>'
      +   '<th style="text-align:right">Workflow &amp; Actions</th>'
      + '</tr></thead><tbody>';

    filtered.forEach(function (b) {
      var st = STATUS_INFO[b.status] || STATUS_INFO.scheduled;
      var rObj = riderMap[b.riderId] || null;
      var rName = rObj ? rObj.name : (b.riderName || 'Unassigned');
      var rPhone = rObj ? rObj.phone : (b.riderPhone || '');

      var mapUrl = b.googleMapsUrl || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((b.address || '') + ' ' + (b.area || '')));

      /* Dynamic workflow button */
      var nextActionBtn = '';
      if (b.status === 'scheduled') {
        nextActionBtn = '<button class="btn btn-primary btn-sm" data-hs-action="dispatch" data-hs-id="' + App.esc(b.id) + '">🛵 Dispatch Rider</button>';
      } else if (b.status === 'dispatched') {
        nextActionBtn = '<button class="btn btn-primary btn-sm" style="background:#7e22ce;border-color:#7e22ce" data-hs-action="collect" data-hs-id="' + App.esc(b.id) + '">🩸 Mark Collected</button>';
      } else if (b.status === 'collected') {
        nextActionBtn = '<button class="btn btn-primary btn-sm" style="background:#15803d;border-color:#15803d" data-hs-action="receive" data-hs-id="' + App.esc(b.id) + '">🔬 Check-In Lab</button>';
      } else if (b.status === 'received_in_lab') {
        nextActionBtn = '<span class="badge b-ready">✓ In Lab</span>';
      }

      var waPatientUrl = 'https://wa.me/' + (b.whatsapp || b.phone || '').replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent('Assalam-o-Alaikum ' + b.patientName + '! Your home sample collection booking (' + b.bookingNo + ') is confirmed for ' + App.d(b.scheduledDate) + ' (' + b.timeSlot + '). Rider: ' + rName + ' (' + rPhone + '). Thank you!');

      html += '<tr>'
        /* Booking & Status */
        + '<td>'
        +   '<div class="mono" style="font-weight:800;color:var(--ink)">' + App.esc(b.bookingNo) + '</div>'
        +   '<span class="hs-badge-status" style="' + st.badge + '">' + st.icon + ' ' + st.label + '</span>'
        + '</td>'

        /* Date & Slot */
        + '<td>'
        +   '<div style="font-weight:700">' + App.esc(App.d(b.scheduledDate)) + '</div>'
        +   '<div class="muted" style="font-size:12px">' + App.esc(b.timeSlot) + '</div>'
        + '</td>'

        /* Patient Details */
        + '<td>'
        +   '<div style="font-weight:700;color:var(--ink)">' + App.esc(b.patientName) + '</div>'
        +   '<div style="font-size:12px;color:var(--muted)">'
        +     '<span>📞 ' + App.esc(b.phone || '—') + '</span>'
        +     (b.whatsapp || b.phone ? ' <a href="' + waPatientUrl + '" target="_blank" style="text-decoration:none" title="Chat on WhatsApp">💬</a>' : '')
        +   '</div>'
        + '</td>'

        /* Address & Area */
        + '<td style="max-width:240px">'
        +   '<div style="font-weight:600;font-size:12.5px;color:#334155">' + App.esc(b.address || '—') + '</div>'
        +   '<div style="font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:6px">'
        +     '<span>📍 ' + App.esc(b.area || '') + '</span>'
        +     '<a href="' + App.esc(mapUrl) + '" target="_blank" style="color:#0284c7;font-weight:600;text-decoration:none">Maps ↗</a>'
        +   '</div>'
        + '</td>'

        /* Tests */
        + '<td style="max-width:220px">'
        +   '<div style="font-weight:600;font-size:12.5px;color:var(--ink)">' + App.esc(b.tests || 'Diagnostic Tests') + '</div>'
        +   (b.specialInstructions ? '<div style="font-size:11px;color:#b45309;background:#fef3c7;padding:2px 6px;border-radius:4px;margin-top:3px">⚠️ ' + App.esc(b.specialInstructions) + '</div>' : '')
        + '</td>'

        /* Rider */
        + '<td>'
        +   '<div style="font-weight:700;display:flex;align-items:center;gap:4px">'
        +     '<span>🛵</span> ' + App.esc(rName)
        +   '</div>'
        +   (rPhone ? '<div class="muted" style="font-size:11.5px">' + App.esc(rPhone) + '</div>' : '')
        + '</td>'

        /* Total Amount */
        + '<td style="text-align:right">'
        +   '<div style="font-size:15px;font-weight:800;color:var(--ink)">' + App.money(+b.totalAmount || 0) + '</div>'
        +   '<div class="muted" style="font-size:11px">' + App.esc(b.paymentStatus === 'paid_online' ? 'Paid Online' : 'Cash on pickup') + '</div>'
        + '</td>'

        /* Actions */
        + '<td style="text-align:right;white-space:nowrap">'
        +   '<div style="display:flex;justify-content:flex-end;gap:5px;align-items:center">'
        +     nextActionBtn
        +     '<button class="btn btn-ghost btn-sm" data-hs-slip="' + App.esc(b.id) + '" title="Print Dispatch Order Sheet">🖨️ Slip</button>'
        +     '<button class="btn btn-ghost btn-sm" data-hs-edit="' + App.esc(b.id) + '">Edit</button>'
        +     (b.status !== 'cancelled' ? '<button class="btn btn-ghost btn-sm" data-hs-cancel="' + App.esc(b.id) + '" style="color:var(--red)" title="Cancel Booking">✕</button>' : '')
        +   '</div>'
        + '</td>'

        + '</tr>';
    });

    html += '</tbody></table></div></div></div>';
    html += '</div>'; /* end .hs-dash */

    view.innerHTML = html;
    wireHomeSamplingEvents();

    function wireHomeSamplingEvents() {
      /* Tab buttons */
      view.querySelectorAll('[data-hs-tab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          HS_FILTER.tab = this.getAttribute('data-hs-tab');
          renderHomeSamplingDashboard();
        });
      });

      /* Search & Filters */
      var sInp = document.getElementById('hsSearch');
      if (sInp) {
        sInp.addEventListener('input', function () {
          HS_FILTER.q = this.value;
          renderHomeSamplingDashboard();
        });
      }

      var dtSel = document.getElementById('hsDateSelect');
      if (dtSel) {
        dtSel.addEventListener('change', function () {
          HS_FILTER.date = this.value;
          renderHomeSamplingDashboard();
        });
      }

      var rSel = document.getElementById('hsRiderSelect');
      if (rSel) {
        rSel.addEventListener('change', function () {
          HS_FILTER.riderId = this.value;
          renderHomeSamplingDashboard();
        });
      }

      var clrBtn = document.getElementById('hsClearFilter');
      if (clrBtn) {
        clrBtn.addEventListener('click', function () {
          HS_FILTER = { tab: 'all', q: '', date: 'all', riderId: 'all' };
          renderHomeSamplingDashboard();
        });
      }

      /* KPI card quick filters */
      view.querySelectorAll('[data-hs-filter-status]').forEach(function (el) {
        el.addEventListener('click', function () {
          HS_FILTER.tab = this.getAttribute('data-hs-filter-status');
          renderHomeSamplingDashboard();
        });
      });
      view.querySelectorAll('[data-hs-filter-date]').forEach(function (el) {
        el.addEventListener('click', function () {
          HS_FILTER.date = this.getAttribute('data-hs-filter-date');
          renderHomeSamplingDashboard();
        });
      });

      /* Buttons */
      var bookBtn = document.getElementById('hsBookBtn');
      if (bookBtn) bookBtn.addEventListener('click', function () { openBookHomeSamplingModal(null); });
      var empBookBtn = document.getElementById('hsEmptyBookBtn');
      if (empBookBtn) empBookBtn.addEventListener('click', function () { openBookHomeSamplingModal(null); });

      var ridersBtn = document.getElementById('hsRidersBtn');
      if (ridersBtn) ridersBtn.addEventListener('click', openRidersManagementModal);

      var seedBtn = document.getElementById('hsSeedBtn');
      if (seedBtn) seedBtn.addEventListener('click', seedHomeSamplingBookings);
      var empSeedBtn = document.getElementById('hsEmptySeedBtn');
      if (empSeedBtn) empSeedBtn.addEventListener('click', seedHomeSamplingBookings);

      /* Workflow lifecycle button handlers */
      view.querySelectorAll('[data-hs-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var action = this.getAttribute('data-hs-action');
          var id = this.getAttribute('data-hs-id');
          var b = DB.get('home_sampling', id);
          if (!b) return;

          if (action === 'dispatch') {
            DB.update('home_sampling', id, { status: 'dispatched', dispatchedAt: new Date().toISOString() });
            App.toast('Rider dispatched to patient doorstep 🛵');
            renderHomeSamplingDashboard();
          } else if (action === 'collect') {
            DB.update('home_sampling', id, { status: 'collected', collectedAt: new Date().toISOString() });
            App.toast('Samples marked as collected 🩸');
            renderHomeSamplingDashboard();
          } else if (action === 'receive') {
            DB.update('home_sampling', id, { status: 'received_in_lab', receivedAt: new Date().toISOString() });
            App.toast('Samples checked into laboratory intake 🔬');
            renderHomeSamplingDashboard();
          }
        });
      });

      /* Print slip */
      view.querySelectorAll('[data-hs-slip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-hs-slip');
          var b = DB.get('home_sampling', id);
          if (b) printDispatchJobSlip(b);
        });
      });

      /* Edit */
      view.querySelectorAll('[data-hs-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-hs-edit');
          var b = DB.get('home_sampling', id);
          if (b) openBookHomeSamplingModal(b);
        });
      });

      /* Cancel */
      view.querySelectorAll('[data-hs-cancel]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-hs-cancel');
          var b = DB.get('home_sampling', id);
          if (!b) return;
          App.confirm('Cancel Booking', 'Are you sure you want to cancel booking ' + b.bookingNo + '?', function () {
            DB.update('home_sampling', id, { status: 'cancelled' });
            App.toast('Booking cancelled.');
            renderHomeSamplingDashboard();
          });
        });
      });
    }
  }

  /* Modal to book or edit a home sample collection visit */
  function openBookHomeSamplingModal(booking) {
    var isNew = !booking;
    booking = booking || {
      bookingNo: 'HS-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      patientId: '',
      patientName: '',
      phone: '',
      whatsapp: '',
      address: '',
      area: '',
      scheduledDate: App.today(),
      timeSlot: '08:00 AM - 09:30 AM (Fasting)',
      tests: '',
      estimatedAmount: 2500,
      collectionFee: 300,
      totalAmount: 2800,
      paymentStatus: 'cash_on_pickup',
      riderId: '',
      status: 'scheduled',
      specialInstructions: ''
    };

    var allPatients = DB.all('patients') || [];
    var allRiders = DB.all('riders') || [];

    var SLOTS = [
      '07:00 AM - 08:30 AM (Fasting)',
      '08:30 AM - 10:00 AM (Fasting)',
      '10:00 AM - 11:30 AM',
      '11:30 AM - 01:00 PM',
      '02:00 PM - 03:30 PM',
      '04:00 PM - 05:30 PM',
      '06:00 PM - 07:30 PM'
    ];

    var body = ''
      + '<form id="hsBookForm" style="display:flex;flex-direction:column;gap:14px">'
      + '<div class="form-grid">'
      +   '<div><label class="label">Booking Number</label><input class="input mono" id="hsbNo" value="' + App.esc(booking.bookingNo) + '" readonly style="background:#f1f5f9;font-weight:700"></div>'
      +   '<div><label class="label">Select Existing Patient (Optional)</label><select class="select" id="hsbPatSel">'
      +     '<option value="">— Or type patient details below —</option>'
      +     allPatients.map(function (p) {
              return '<option value="' + App.esc(p.id) + '"' + (booking.patientId === p.id ? ' selected' : '') + '>' + App.esc(p.name) + ' (' + App.esc(p.id) + ' • ' + App.esc(p.phone || '') + ')</option>';
            }).join('')
      +   '</select></div>'

      +   '<div><label class="label">Patient Name *</label><input class="input" id="hsbName" value="' + App.esc(booking.patientName) + '" placeholder="e.g. Tariq Mehmood" required></div>'
      +   '<div><label class="label">Contact Phone *</label><input class="input" id="hsbPhone" value="' + App.esc(booking.phone) + '" placeholder="0300-1234567" required></div>'

      +   '<div style="grid-column:1/-1"><label class="label">Collection Address (Street, House/Flat No, Landmark) *</label><input class="input" id="hsbAddress" value="' + App.esc(booking.address) + '" placeholder="House # 12, Street 4, Sector F-10/2, Islamabad (Near Roundabout)" required></div>'

      +   '<div><label class="label">Area / Sector / City</label><input class="input" id="hsbArea" value="' + App.esc(booking.area || '') + '" placeholder="e.g. F-10 Islamabad"></div>'
      +   '<div><label class="label">Scheduled Date *</label><input class="input" type="date" id="hsbDate" value="' + App.esc(booking.scheduledDate) + '" required></div>'

      +   '<div><label class="label">Time Slot *</label><select class="select" id="hsbSlot">'
      +     SLOTS.map(function (s) { return '<option value="' + s + '"' + (booking.timeSlot === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')
      +   '</select></div>'

      +   '<div><label class="label">Assign Phlebotomist Rider</label><select class="select" id="hsbRider">'
      +     '<option value="">— Assign Later —</option>'
      +     allRiders.map(function (r) { return '<option value="' + App.esc(r.id) + '"' + (booking.riderId === r.id ? ' selected' : '') + '>' + App.esc(r.name) + ' (' + App.esc(r.phone) + ')</option>'; }).join('')
      +   '</select></div>'

      +   '<div style="grid-column:1/-1"><label class="label">Tests to Collect *</label><input class="input" id="hsbTests" value="' + App.esc(booking.tests) + '" placeholder="e.g. CBC, Fasting Blood Sugar, Lipid Profile, Serum Creatinine" required></div>'

      +   '<div><label class="label">Tests Amount (PKR)</label><input class="input" type="number" id="hsbTestAmt" value="' + (+booking.estimatedAmount || 0) + '" min="0"></div>'
      +   '<div><label class="label">Home Collection Fee (PKR)</label><input class="input" type="number" id="hsbFee" value="' + (+booking.collectionFee || 300) + '" min="0"></div>'
      +   '<div><label class="label">Total Amount (PKR)</label><input class="input" type="number" id="hsbTotalAmt" value="' + (+booking.totalAmount || 0) + '" min="0" style="font-weight:800;color:#15803d"></div>'

      +   '<div><label class="label">Payment Mode</label><select class="select" id="hsbPayStatus">'
      +     '<option value="cash_on_pickup"' + (booking.paymentStatus === 'cash_on_pickup' ? ' selected' : '') + '>Cash on pickup</option>'
      +     '<option value="paid_online"' + (booking.paymentStatus === 'paid_online' ? ' selected' : '') + '>Paid online / Advance</option>'
      +     '<option value="panel"' + (booking.paymentStatus === 'panel' ? ' selected' : '') + '>Corporate / Panel Account</option>'
      +   '</select></div>'

      +   '<div style="grid-column:1/-1"><label class="label">Special Instructions for Rider</label><input class="input" id="hsbInstr" value="' + App.esc(booking.specialInstructions || '') + '" placeholder="e.g. Patient is bed-ridden. Call 10 minutes prior to arrival."></div>'
      + '</div>'

      + '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px">'
      +   '<button type="button" class="btn btn-ghost" id="hsbCancel">Cancel</button>'
      +   '<button type="submit" class="btn btn-primary">' + (isNew ? 'Book Collection' : 'Save Changes') + '</button>'
      + '</div>'
      + '</form>';

    App.modal(isNew ? '🛵 Book Home Sample Collection' : '✏️ Edit Home Sampling Booking', body, {
      wide: true,
      onOpen: function (ov, close) {
        var form = ov.querySelector('#hsBookForm');
        var patSel = ov.querySelector('#hsbPatSel');
        var nameInp = ov.querySelector('#hsbName');
        var phoneInp = ov.querySelector('#hsbPhone');
        var addrInp = ov.querySelector('#hsbAddress');
        var testAmtInp = ov.querySelector('#hsbTestAmt');
        var feeInp = ov.querySelector('#hsbFee');
        var totalAmtInp = ov.querySelector('#hsbTotalAmt');

        function recalc() {
          var t = parseFloat(testAmtInp.value) || 0;
          var f = parseFloat(feeInp.value) || 0;
          totalAmtInp.value = t + f;
        }
        testAmtInp.addEventListener('input', recalc);
        feeInp.addEventListener('input', recalc);

        patSel.addEventListener('change', function () {
          var pid = this.value;
          if (pid) {
            var p = DB.get('patients', pid);
            if (p) {
              nameInp.value = p.name || '';
              phoneInp.value = p.phone || '';
              if (p.address && !addrInp.value) addrInp.value = p.address;
            }
          }
        });

        ov.querySelector('#hsbCancel').addEventListener('click', close);

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var name = nameInp.value.trim();
          var phone = phoneInp.value.trim();
          var addr = addrInp.value.trim();
          var area = ov.querySelector('#hsbArea').value.trim();
          var date = ov.querySelector('#hsbDate').value;
          var slot = ov.querySelector('#hsbSlot').value;
          var tests = ov.querySelector('#hsbTests').value.trim();
          var rId = ov.querySelector('#hsbRider').value;
          var tAmt = parseFloat(testAmtInp.value) || 0;
          var fee = parseFloat(feeInp.value) || 0;
          var totAmt = parseFloat(totalAmtInp.value) || (tAmt + fee);
          var paySt = ov.querySelector('#hsbPayStatus').value;
          var instr = ov.querySelector('#hsbInstr').value.trim();

          if (!name || !phone || !addr || !tests) {
            App.toast('Name, phone, address, and tests are required.', 'err');
            return;
          }

          var rObj = rId ? DB.get('riders', rId) : null;

          var data = {
            bookingNo: booking.bookingNo,
            patientId: patSel.value || '',
            patientName: name,
            phone: phone,
            whatsapp: phone,
            address: addr,
            area: area,
            scheduledDate: date,
            timeSlot: slot,
            tests: tests,
            estimatedAmount: tAmt,
            collectionFee: fee,
            totalAmount: totAmt,
            paymentStatus: paySt,
            riderId: rId,
            riderName: rObj ? rObj.name : '',
            riderPhone: rObj ? rObj.phone : '',
            specialInstructions: instr,
            status: booking.status || 'scheduled'
          };

          if (isNew) {
            data.createdAt = new Date().toISOString();
            DB.insert('home_sampling', data);
            App.toast('Home collection booked successfully 🛵');
          } else {
            DB.update('home_sampling', booking.id, data);
            App.toast('Booking updated.');
          }
          close();
          renderHomeSamplingDashboard();
        });
      }
    });
  }

  /* Modal to manage phlebotomist riders */
  function openRidersManagementModal() {
    var riders = DB.all('riders') || [];

    var body = ''
      + '<div style="margin-bottom:14px">'
      +   '<h4 style="margin:0 0 10px;font-size:14px">Active Phlebotomist Field Riders (' + riders.length + ')</h4>'
      +   '<div class="tbl-wrap" style="max-height:220px;overflow-y:auto;border:1px solid var(--bd);border-radius:8px;margin-bottom:16px">'
      +     '<table class="table" style="font-size:13px"><thead><tr>'
      +       '<th>Name</th><th>Phone</th><th>Vehicle</th><th>Assigned Area</th><th>Status</th><th style="text-align:right">Action</th>'
      +     '</tr></thead><tbody>'
      +     (riders.length ? riders.map(function (r) {
              return '<tr>'
                + '<td><strong>' + App.esc(r.name) + '</strong></td>'
                + '<td>' + App.esc(r.phone) + '</td>'
                + '<td>' + App.esc(r.vehicle || 'Bike') + '</td>'
                + '<td>' + App.esc(r.assignedArea || 'All Areas') + '</td>'
                + '<td>' + (r.active !== false ? '<span class="badge b-ready">Active</span>' : '<span class="badge b-unpaid">Inactive</span>') + '</td>'
                + '<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-r-del="' + App.esc(r.id) + '" style="color:var(--red)">Remove</button></td>'
                + '</tr>';
            }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">No riders registered yet. Add one below.</td></tr>')
      +     '</tbody></table>'
      +   '</div>'

      +   '<h4 style="margin:0 0 8px;font-size:14px">+ Add New Phlebotomist Rider</h4>'
      +   '<form id="newRiderForm" style="display:flex;flex-direction:column;gap:10px">'
      +     '<div class="form-grid">'
      +       '<div><label class="label">Rider Name *</label><input class="input" id="nrName" placeholder="e.g. Ali Raza" required></div>'
      +       '<div><label class="label">Phone Number *</label><input class="input" id="nrPhone" placeholder="0312-9876543" required></div>'
      +       '<div><label class="label">Vehicle / Bike No.</label><input class="input" id="nrVeh" placeholder="e.g. Honda 125 (ICT-LE-4921)"></div>'
      +       '<div><label class="label">Assigned Sector / Area</label><input class="input" id="nrArea" placeholder="e.g. Sector F & G"></div>'
      +     '</div>'
      +     '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px">'
      +       '<button type="button" class="btn btn-ghost" id="nrClose">Close</button>'
      +       '<button type="submit" class="btn btn-primary">+ Add Rider</button>'
      +     '</div>'
      +   '</form>'
      + '</div>';

    App.modal('👥 Phlebotomist Riders Management', body, {
      wide: true,
      onOpen: function (ov, close) {
        ov.querySelector('#nrClose').addEventListener('click', close);

        ov.querySelectorAll('[data-r-del]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var rid = this.getAttribute('data-r-del');
            DB.remove('riders', rid);
            App.toast('Rider removed.');
            close();
            openRidersManagementModal();
            renderHomeSamplingDashboard();
          });
        });

        ov.querySelector('#newRiderForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var name = ov.querySelector('#nrName').value.trim();
          var phone = ov.querySelector('#nrPhone').value.trim();
          var veh = ov.querySelector('#nrVeh').value.trim();
          var area = ov.querySelector('#nrArea').value.trim();

          if (!name || !phone) { App.toast('Name and phone are required.', 'err'); return; }

          DB.insert('riders', {
            name: name,
            phone: phone,
            vehicle: veh || 'Motorcycle',
            assignedArea: area || 'All Sectors',
            active: true,
            createdAt: new Date().toISOString()
          });

          App.toast('Phlebotomist rider added.');
          close();
          openRidersManagementModal();
          renderHomeSamplingDashboard();
        });
      }
    });
  }

  /* Print field phlebotomist job order sheet */
  function printDispatchJobSlip(booking) {
    var s = DB.get('settings', 'main') || {};

    var slipHtml = ''
      + '<div style="max-width:650px;margin:0 auto;font-family:system-ui,sans-serif;color:#131845;padding:12px">'
      + '<div style="border-bottom:2.5px solid #131845;padding-bottom:10px;margin-bottom:12px;text-align:center">'
      +   '<div style="font-size:20px;font-weight:900;text-transform:uppercase">' + App.esc(s.labName || 'Optix Medical Sync') + '</div>'
      +   '<div style="font-size:12px;color:#64748b">' + App.esc(s.address || '') + ' • Helpline: ' + App.esc(s.phone || '') + '</div>'
      +   '<div style="display:inline-block;background:#131845;color:#fff;font-weight:800;font-size:12px;padding:3px 12px;border-radius:12px;letter-spacing:.05em;margin-top:6px">PHLEBOTOMY FIELD DISPATCH JOB SHEET</div>'
      + '</div>'

      + '<table class="table" style="margin-bottom:14px"><tbody>'
      + '<tr><td><strong>Job Order #:</strong> <span class="mono">' + App.esc(booking.bookingNo) + '</span></td><td><strong>Scheduled Slot:</strong> ' + App.esc(App.d(booking.scheduledDate)) + ' (' + App.esc(booking.timeSlot) + ')</td></tr>'
      + '<tr><td><strong>Patient Name:</strong> ' + App.esc(booking.patientName) + '</td><td><strong>Contact Phone:</strong> ' + App.esc(booking.phone) + '</td></tr>'
      + '<tr><td colspan="2"><strong>Collection Address:</strong> ' + App.esc(booking.address) + (booking.area ? ' (' + App.esc(booking.area) + ')' : '') + '</td></tr>'
      + '<tr><td><strong>Assigned Phlebotomist:</strong> ' + App.esc(booking.riderName || 'Staff Rider') + ' (' + App.esc(booking.riderPhone || '') + ')</td><td><strong>Payment Mode:</strong> ' + App.esc(booking.paymentStatus === 'paid_online' ? 'Paid Online' : 'Cash on Pickup') + '</td></tr>'
      + '</tbody></table>'

      + '<div style="border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;background:#f8fafc;margin-bottom:14px">'
      +   '<div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:4px">Required Diagnostic Tests &amp; Specimen Tubes to Draw:</div>'
      +   '<div style="font-size:14px;font-weight:800;color:#131845">' + App.esc(booking.tests) + '</div>'
      +   (booking.specialInstructions ? '<div style="font-size:12px;color:#b45309;margin-top:4px">⚠️ <strong>Special Instructions:</strong> ' + App.esc(booking.specialInstructions) + '</div>' : '')
      + '</div>'

      + '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
      +   '<div><span style="font-size:12px;color:#15803d;font-weight:700">Tests Fee: ' + App.money(+booking.estimatedAmount || 0) + ' + Home Visit Fee: ' + App.money(+booking.collectionFee || 0) + '</span></div>'
      +   '<div style="text-align:right"><span style="font-size:16px;font-weight:900;color:#15803d">Total Cash to Collect: ' + App.money(+booking.totalAmount || 0) + '</span></div>'
      + '</div>'

      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:28px">'
      +   '<div style="border-top:1px solid #333;padding-top:4px;font-size:11.5px;text-align:center">Patient / Attendant Signature</div>'
      +   '<div style="border-top:1px solid #333;padding-top:4px;font-size:11.5px;text-align:center">Phlebotomist Signature &amp; Collection Time</div>'
      + '</div>'
      + '</div>';

    App.print('Phlebotomy Dispatch Slip — ' + booking.bookingNo, slipHtml);
  }

  /* Seed realistic demo home sampling bookings and riders */
  function seedHomeSamplingBookings() {
    var riders = DB.all('riders') || [];
    if (!riders.length) {
      DB.insert('riders', { name: 'Ali Raza', phone: '0312-9876543', vehicle: 'Honda 125 (ICT-LE-4921)', assignedArea: 'Sector F & G', active: true });
      DB.insert('riders', { name: 'Kamran Khan', phone: '0301-5551234', vehicle: 'Honda 70 (ICT-RN-8812)', assignedArea: 'Blue Area & I-8', active: true });
      DB.insert('riders', { name: 'Zubair Ahmed', phone: '0333-7778901', vehicle: 'Yamaha YBR (ICT-KM-1209)', assignedArea: 'DHA & Bahria Town', active: true });
      riders = DB.all('riders');
    }

    var r1 = riders[0] || { id: 'r1', name: 'Ali Raza', phone: '0312-9876543' };
    var r2 = riders[1] || { id: 'r2', name: 'Kamran Khan', phone: '0301-5551234' };

    var todayStr = App.today();

    var demo = [
      {
        bookingNo: 'HS-2026-0101',
        patientName: 'Haji Muhammad Shafiq',
        phone: '0300-8521470',
        whatsapp: '0300-8521470',
        address: 'House # 48, Street 19, Sector F-8/2, Islamabad',
        area: 'F-8 Islamabad',
        scheduledDate: todayStr,
        timeSlot: '07:30 AM - 08:30 AM (Fasting)',
        tests: 'Blood Sugar Fasting, HbA1c, Serum Creatinine, Lipid Profile',
        estimatedAmount: 3750,
        collectionFee: 300,
        totalAmount: 4050,
        paymentStatus: 'cash_on_pickup',
        riderId: r1.id,
        riderName: r1.name,
        riderPhone: r1.phone,
        status: 'scheduled',
        specialInstructions: 'Elderly diabetic patient. Strictly fasting. Ring bell twice.'
      },
      {
        bookingNo: 'HS-2026-0102',
        patientName: 'Mrs. Saima Rehman',
        phone: '0321-9988776',
        whatsapp: '0321-9988776',
        address: 'Flat 4B, Silver Oaks Apartments, Main Expressway, Islamabad',
        area: 'Expressway Islamabad',
        scheduledDate: todayStr,
        timeSlot: '09:00 AM - 10:00 AM (Fasting)',
        tests: 'Complete Blood Count (CBC), Thyroid Profile (TSH), Serum Calcium',
        estimatedAmount: 2600,
        collectionFee: 300,
        totalAmount: 2900,
        paymentStatus: 'paid_online',
        riderId: r2.id,
        riderName: r2.name,
        riderPhone: r2.phone,
        status: 'dispatched',
        specialInstructions: 'Call upon gate security arrival.'
      },
      {
        bookingNo: 'HS-2026-0103',
        patientName: 'Tariq Mehmood',
        phone: '0333-1122334',
        whatsapp: '0333-1122334',
        address: 'House 112, Street 6, Sector G-9/4, Islamabad',
        area: 'G-9 Islamabad',
        scheduledDate: todayStr,
        timeSlot: '08:00 AM - 09:00 AM (Fasting)',
        tests: 'Liver Function Tests (LFT), Renal Function Tests (RFT)',
        estimatedAmount: 2300,
        collectionFee: 300,
        totalAmount: 2600,
        paymentStatus: 'cash_on_pickup',
        riderId: r1.id,
        riderName: r1.name,
        riderPhone: r1.phone,
        status: 'collected',
        specialInstructions: 'Sample drawn. Rider returning to laboratory.'
      },
      {
        bookingNo: 'HS-2026-0104',
        patientName: 'Dr. Asad Ullah Khan',
        phone: '0345-6677889',
        whatsapp: '0345-6677889',
        address: 'Villa 14, Street 2, Sector I-8/3, Islamabad',
        area: 'I-8 Islamabad',
        scheduledDate: todayStr,
        timeSlot: '07:00 AM - 08:00 AM (Fasting)',
        tests: 'Executive Full Body Health Profile, Vitamin D',
        estimatedAmount: 7299,
        collectionFee: 0,
        totalAmount: 7299,
        paymentStatus: 'paid_online',
        riderId: r2.id,
        riderName: r2.name,
        riderPhone: r2.phone,
        status: 'received_in_lab',
        specialInstructions: 'VIP customer. Free home collection offered.'
      }
    ];

    demo.forEach(function (d) {
      var exists = DB.all('home_sampling').some(function (b) { return b.bookingNo === d.bookingNo; });
      if (!exists) DB.insert('home_sampling', Object.assign({ createdAt: new Date().toISOString() }, d));
    });

    App.toast('Sample home sampling bookings and riders seeded 🛵');
    renderHomeSamplingDashboard();
  }

  App.route('#/home-sampling', renderHomeSamplingDashboard);
  App.route('#/samples/home', renderHomeSamplingDashboard);
  /* "All Bookings" menu item: the same dispatch centre, always opened on the All Bookings tab with the filters cleared */
  App.route('#/samples/bookings', function () {
    HS_FILTER.tab = 'all'; HS_FILTER.q = ''; HS_FILTER.date = 'all'; HS_FILTER.riderId = 'all';
    renderHomeSamplingDashboard();
  });
})();
