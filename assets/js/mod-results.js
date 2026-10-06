/* ============================================================
   Optix LAB MedSync — Lab Results module
   Route: #/results
   - Pending results grouped by invoice, per-test result entry
   - Ready results grouped by invoice, printable lab reports
   ============================================================ */
(function () {
  'use strict';

  var tab = 'pending';   // 'pending' | 'ready'
  var query = '';

  /* ---------- helpers ---------- */

  function sessionUser() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (!s) return 'system';
      var u = s.userId ? DB.get('users', s.userId) : null;
      return (u && u.username) || s.name || 'system';
    } catch (e) { return 'system'; }
  }

  function invOf(id) { return DB.get('invoices', id) || null; }
  function patOf(pid) { return DB.get('patients', pid) || {}; }

  function waPhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.charAt(0) === '0') d = '92' + d.slice(1);
    return d;
  }

  /* ---------- WhatsApp API (send report PDF) ---------- */

  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;vertical-align:-2px"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.13a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.54-3.7 8.22-8.24 8.22zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.38-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29z"/></svg>';

  var PRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';

  function waCfg() {
    try {
      var s = DB.get('settings', 'main') || {};
      return s.whatsapp || {};
    } catch (e) { return {}; }
  }
  function waReady(cfg) {
    return !!(cfg && cfg.instanceId && cfg.token);
  }
  function waSummaryText(inv, pat) {
    var s = DB.get('settings', 'main') || {};
    return (s.labName || 'Lab') + '\nAssalam-o-Alaikum ' + (pat.name || '') + ',\n' +
      'Your lab report is ready.\nInvoice: ' + inv.no + ' (' + App.d(inv.createdAt) + ')\n' +
      'Please collect it from the lab or reply here. Shukriya!';
  }
  function waTextFallback(invoiceId) {
    var inv = invOf(invoiceId);
    if (!inv) return;
    var pat = patOf(inv.patientId);
    var ph = waPhone(pat.phone);
    if (!ph) { App.toast('No WhatsApp number on patient record', 'err'); return; }
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(waSummaryText(inv, pat)), '_blank');
  }

  // POST the PDF document to the configured provider. done(err)
  function waSendDocument(cfg, to, filename, dataUri, caption, done) {
    var url, body, headers = {};
    if (cfg.provider === 'custom' && cfg.baseUrl) {
      url = cfg.baseUrl;
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ to: to, filename: filename, document: dataUri, caption: caption, token: cfg.token });
    } else {
      // Ultramsg-compatible
      url = 'https://api.ultramsg.com/' + encodeURIComponent(cfg.instanceId) + '/messages/document';
      var fd = new FormData();
      fd.append('token', cfg.token);
      fd.append('to', to);
      fd.append('filename', filename);
      fd.append('document', dataUri);
      fd.append('caption', caption || '');
      body = fd;
    }
    var timer = setTimeout(function () { done(new Error('Request timed out')); done = function () {}; }, 45000);
    fetch(url, { method: 'POST', headers: headers, body: body })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          return { status: r.status, json: j, text: t };
        });
      })
      .then(function (res) {
        clearTimeout(timer);
        var j = res.json || {};
        var ok = res.status >= 200 && res.status < 300 &&
          (j.sent === true || j.sent === 'true' || j.status === 'sent' || j.success === true || res.status === 200);
        if (ok) done(null);
        else done(new Error((j.message || j.error || res.text || ('HTTP ' + res.status)).toString().slice(0, 140)));
      })
      .catch(function (e) { clearTimeout(timer); done(e); });
  }

  function shareReportWhatsApp(invoiceId) {
    var inv = invOf(invoiceId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    var pat = patOf(inv.patientId);
    var ph = waPhone(pat.phone);
    if (!ph) { App.toast('No WhatsApp number on patient record', 'err'); return; }

    var cfg = waCfg();
    if (!waReady(cfg)) { waTextFallback(invoiceId); return; } // API not configured → wa.me text

    App.toast('Preparing PDF…', 'info');
    App.ensureJsPDF().then(function (ok) {
      if (!ok) { App.toast('PDF engine failed to load — check connection', 'err'); return; }
      var pdf = buildReportPdf(invoiceId);
      if (!pdf) return; // error already toasted

      var fname = 'LabReport-' + String(inv.no || inv.id).replace(/[^A-Za-z0-9_-]/g, '') + '.pdf';
      var caption = waSummaryText(inv, pat);
      App.toast('Sending report on WhatsApp…', 'info');
      waSendDocument(cfg, ph, fname, pdf.dataUri, caption, function (err) {
        if (err) {
          App.toast('WhatsApp API failed — opening chat instead', 'err');
          waTextFallback(invoiceId);
        } else {
          App.toast('Report sent on WhatsApp');
        }
      });
    });
  }
  function deleteResult(resId) {
    var r = DB.get('results', resId);
    if (!r) return;
    App.confirm('Delete this report permanently? This cannot be undone.').then(function (ok) {
      if (!ok) return;
      DB.remove('results', resId);
      App.toast('Report deleted');
      render();
    });
  }

  // Join results with invoices/items. Returns array of:
  // {res, invoice, patient, item, test}  (res may be null = not yet created)
  function joinedRows(status) {
    var out = [];
    var seen = {};
    var results = DB.all('results');
    results.forEach(function (r) {
      var inv = invOf(r.invoiceId);
      if (!inv || !Array.isArray(inv.items)) return;
      var item = inv.items.filter(function (it) { return it.testId === r.testId; })[0];
      if (!item) return; // orphan result, skip
      if (r.status !== status) return;
      seen[r.invoiceId + '|' + r.testId] = true;
      out.push({ res: r, invoice: inv, patient: patOf(inv.patientId), item: item, test: DB.get('tests', r.testId) });
    });
    // Synthesize pending rows for invoice items that have no result row yet
    if (status === 'pending') {
      DB.all('invoices').forEach(function (inv) {
        if (!Array.isArray(inv.items)) return;
        inv.items.forEach(function (item) {
          var key = inv.id + '|' + item.testId;
          if (!seen[key]) {
            out.push({ res: null, invoice: inv, patient: patOf(inv.patientId), item: item, test: DB.get('tests', item.testId) });
          }
        });
      });
    }
    return out;
  }

  function groupByInvoice(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) {
      var id = r.invoice.id;
      if (!map[id]) { map[id] = { invoice: r.invoice, patient: r.patient, rows: [] }; order.push(id); }
      map[id].rows.push(r);
    });
    // newest invoices first
    order.sort(function (a, b) {
      var da = map[a].invoice.createdAt || '', db = map[b].invoice.createdAt || '';
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    return order.map(function (id) { return map[id]; });
  }

  function groupByPatient(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) {
      var pid = (r.patient && r.patient.id) || r.invoice.patientId || 'unknown';
      if (!map[pid]) { map[pid] = { patient: r.patient, rows: [] }; order.push(pid); }
      map[pid].rows.push(r);
    });
    // most recent activity first
    order.sort(function (a, b) {
      var da = '', db = '';
      map[a].rows.forEach(function (r) { if (r.invoice.createdAt > da) da = r.invoice.createdAt; });
      map[b].rows.forEach(function (r) { if (r.invoice.createdAt > db) db = r.invoice.createdAt; });
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    return order.map(function (pid) { return map[pid]; });
  }

  function testName(row) {
    return row.item.name || (row.test && row.test.name) || 'Test';
  }
  function testCode(row) {
    return row.item.code || (row.test && row.test.code) || '';
  }

  /* ---------- entry modal ---------- */

  /* Bulk entry: all pending tests for a patient in one form, then print */
  function openBulkEntry(patient, rows) {
    if (!rows.length) return;
    var invNos = {};
    rows.forEach(function (r) { invNos[r.invoice.no || r.invoice.id] = true; });
    var invList = Object.keys(invNos).join(', ');

    var sectionsHtml = rows.map(function (row, ti) {
      var test = row.test;
      var params = (test && Array.isArray(test.params)) ? test.params : [];
      var existing = (row.res && row.res.values) || {};
      var tTitle = App.esc(testName(row)) + (testCode(row) ? ' <span class="muted">(' + App.esc(testCode(row)) + ')</span>' : '');
      var fieldsHtml;
      if (params.length) {
        var prowHtml = params.map(function (p, pi) {
          var v = existing[p.name] != null ? String(existing[p.name]) : '';
          var isNum = p.type === 'number';
          return '<tr>' +
            '<td><strong>' + App.esc(p.name) + '</strong></td>' +
            '<td><input class="input" data-bt="' + ti + '" data-bpi="' + pi + '"' + (isNum ? ' type="number" step="any" inputmode="decimal"' : '') + ' value="' + App.esc(v) + '" placeholder="Enter value"></td>' +
            '<td class="muted">' + App.esc(p.unit || '') + '</td>' +
            '<td class="muted">' + App.esc(p.ref || '') + '</td></tr>';
        }).join('');
        fieldsHtml =
          '<table class="table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead>' +
          '<tbody>' + prowHtml + '</tbody></table>' +
          '<div style="margin-top:10px"><label class="label">Remarks (optional)</label>' +
          '<input class="input" data-brem="' + ti + '" value="' + App.esc(existing['Remarks'] || '') + '" placeholder="e.g. Sample hemolyzed, repeat advised"></div>';
      } else {
        var ft = existing['Result'] != null ? String(existing['Result']) : '';
        fieldsHtml =
          '<div><label class="label">Result</label>' +
          '<input class="input" data-bfree="' + ti + '" placeholder="Type the result value..." value="' + App.esc(ft) + '"></div>';
      }
      return '<div class="card" style="margin-bottom:14px"><div class="card-h"><div><strong>' + tTitle + '</strong></div>' +
        '<span class="muted">' + App.esc(row.invoice.no || row.invoice.id) + '</span></div>' +
        '<div class="card-b">' + fieldsHtml + '</div></div>';
    }).join('');

    var sub = App.esc(patient.name || '—') +
      (patient.age ? ' <span class="muted">(' + App.esc(String(patient.age)) + (patient.gender ? '/' + App.esc(patient.gender) : '') + ')</span>' : '') +
      ' <span class="muted">• ' + App.esc(invList) + ' • ' + rows.length + ' test(s)</span>';

    // payment section: if any invoice has a due, offer to collect it now
    var _invSeen = {}, _totalDue = 0;
    rows.forEach(function (r) {
      var iid = r.invoice.id;
      if (!_invSeen[iid]) { _invSeen[iid] = true; _totalDue += (+r.invoice.due || 0); }
    });
    var payHtml = '';
    if (_totalDue > 0) {
      payHtml = '<div class="card" style="margin-bottom:14px;border:1.5px solid var(--amber)">' +
        '<div class="card-b"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><strong style="font-size:15px">Payment Due: ' + App.money(_totalDue) + '</strong>' +
        '<div class="muted" style="font-size:12px">Mark as paid now to activate the QR code on the report. Otherwise it stays in Dues.</div></div>' +
        '<label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer;font-size:14px">' +
        '<input type="checkbox" id="bresPaid" style="width:20px;height:20px;accent-color:var(--green)"> Mark as Paid</label>' +
        '</div></div></div>';
    }

    App.modal('Enter Results — ' + App.esc(patient.name || 'Patient'),
      '<p class="muted" style="margin-bottom:14px">' + sub + '</p>' + sectionsHtml + payHtml +
      '<div class="actions" style="margin-top:16px;position:sticky;bottom:0;background:#fff;padding-top:12px;border-top:1px solid var(--line)">' +
      '<button class="btn btn-ghost" id="bresCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="bresSave">Save All Results</button></div>',
      { wide: true, onOpen: function (ov, close) {
          document.getElementById('bresCancel').addEventListener('click', close);
          document.getElementById('bresSave').addEventListener('click', function () {
            var saved = 0, skipped = 0;
            rows.forEach(function (row, ti) {
              var test = row.test;
              var params = (test && Array.isArray(test.params)) ? test.params : [];
              var vals = {};
              var anyVal = false;
              if (params.length) {
                for (var pi = 0; pi < params.length; pi++) {
                  var inp = ov.querySelector('[data-bt="' + ti + '"][data-bpi="' + pi + '"]');
                  var v = inp ? inp.value.trim() : '';
                  vals[params[pi].name] = v;
                  if (v) anyVal = true;
                }
                var rem = ov.querySelector('[data-brem="' + ti + '"]');
                if (rem && rem.value.trim()) vals['Remarks'] = rem.value.trim();
              } else {
                var ta = ov.querySelector('[data-bfree="' + ti + '"]');
                var t = ta ? ta.value.trim() : '';
                if (t) { vals = { Result: t }; anyVal = true; }
              }
              if (!anyVal) { skipped++; return; }
              var patch = {
                values: vals,
                status: 'ready',
                reportedAt: new Date().toISOString(),
                reportedBy: sessionUser()
              };
              if (row.res) DB.update('results', row.res.id, patch);
              else DB.insert('results', { invoiceId: row.invoice.id, testId: row.item.testId, values: vals, status: 'ready', reportedAt: patch.reportedAt, reportedBy: patch.reportedBy });
              saved++;
            });
            // payment: if "Mark as Paid" checked, collect full due on each invoice
            var payBox = ov.querySelector('#bresPaid');
            var paidMsg = '';
            if (payBox && payBox.checked) {
              var pSeen = {}, pTotal = 0;
              rows.forEach(function (r) {
                var iid = r.invoice.id;
                if (pSeen[iid]) return;
                pSeen[iid] = true;
                var inv = null;
                try { inv = DB.get('invoices', iid); } catch (e) {}
                if (!inv) return;
                var due = Math.round((+inv.due || 0) * 100) / 100;
                if (due > 0) {
                  try {
                    DB.insert('payments', {
                      invoiceId: iid, amount: due, method: 'Cash',
                      date: new Date().toISOString(),
                      note: 'Collected at result entry', createdBy: sessionUser()
                    });
                  } catch (e) {}
                  var newPaid = Math.round(((+inv.paid || 0) + due) * 100) / 100;
                  try { DB.update('invoices', iid, { paid: newPaid, due: 0, status: 'paid' }); } catch (e) {}
                  pTotal += due;
                }
              });
              if (pTotal > 0) paidMsg = ' • ' + App.money(pTotal) + ' collected — QR code activated';
            }
            close();
            if (!saved) { App.toast('Enter at least one result value', 'err'); return; }
            App.toast(saved + ' result(s) saved — marked ready' + (skipped ? ' (' + skipped + ' skipped — empty)' : '') + paidMsg);
            render();
            // offer print: switch to ready tab so the user can print
            tab = 'ready';
            render();
          });
        }
      });
  }

  function openEntry(row, onSaved) {
    var test = row.test;
    var inv = row.invoice;
    var pat = row.patient;
    var params = (test && Array.isArray(test.params)) ? test.params : [];
    var existing = (row.res && row.res.values) || {};
    var resId = row.res ? row.res.id : null;

    // Trend-graph support (assets/js/graph-config.js, loaded in parallel by Worker 1).
    // Guarded so the modal works exactly as before when that file is absent.
    var graphCfg = null;
    if (window.App && App.graphFor && App.renderGraphSvg) {
      try { graphCfg = App.graphFor(test) || null; } catch (gerr) { graphCfg = null; }
    }

    var body;
    if (params.length) {
      var rowsHtml = params.map(function (p, i) {
        var v = existing[p.name] != null ? String(existing[p.name]) : '';
        var isNum = p.type === 'number';
        return '<tr>' +
          '<td><strong>' + App.esc(p.name) + '</strong></td>' +
          '<td><input class="input" data-pi="' + i + '"' + (isNum ? ' type="number" step="any" inputmode="decimal"' : '') + ' value="' + App.esc(v) + '" placeholder="Enter value"></td>' +
          '<td class="muted">' + App.esc(p.unit || '') + '</td>' +
          '<td class="muted">' + App.esc(p.ref || '') + '</td></tr>';
      }).join('');
      body =
        '<table class="table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table>' +
        (graphCfg ? '<div id="resGraphWrap" style="margin-top:14px"><div class="label" style="font-weight:700;margin-bottom:6px">Trend Graph</div><div id="resGraph"></div></div>' : '') +
        '<div class="form-grid" style="margin-top:12px"><div>' +
        '<label class="label">Remarks (optional)</label>' +
        '<input class="input" id="resRemarks" value="' + App.esc(existing['Remarks'] || '') + '" placeholder="e.g. Sample hemolyzed, repeat advised">' +
        '</div></div>';
    } else {
      var ft = existing['Result'] != null ? String(existing['Result']) : '';
      body =
        '<div class="form-grid"><div>' +
        '<label class="label">Result</label>' +
        '<input class="input" id="resFree" placeholder="Type the result value..." value="' + App.esc(ft) + '">' +
        '</div></div>';
    }

    var sub = pat.name ? (App.esc(pat.name) + ' • ' + App.esc(inv.no)) : App.esc(inv.no);
    var close = App.modal('Enter Result — ' + App.esc(testName(row)) + (testCode(row) ? ' (' + App.esc(testCode(row)) + ')' : ''),
      '<p class="muted" style="margin-bottom:14px">' + sub + '</p>' + body +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-ghost" id="resCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="resSave">Save Result</button></div>',
      { onOpen: function (ov, close) {
          document.getElementById('resCancel').addEventListener('click', close);
          document.getElementById('resSave').addEventListener('click', function () {
            saveResult(row, params, close, onSaved);
          });
          // Live trend graph: re-render on every param input, scoped to this modal's overlay.
          function renderGraph() {
            if (!graphCfg) return;
            var wrap = document.getElementById('resGraphWrap');
            var holder = document.getElementById('resGraph');
            if (!wrap || !holder) return;
            var valsByName = {};
            var inputs = ov.querySelectorAll('input[data-pi]');
            for (var i = 0; i < inputs.length; i++) {
              var pi = parseInt(inputs[i].getAttribute('data-pi'), 10);
              if (!isNaN(pi) && params[pi]) valsByName[params[pi].name] = inputs[i].value;
            }
            var svg = '';
            try { svg = App.renderGraphSvg(graphCfg, valsByName); } catch (gerr2) { svg = ''; }
            holder.innerHTML = svg;
            wrap.style.display = svg ? '' : 'none';
          }
          if (graphCfg) {
            var gInputs = ov.querySelectorAll('input[data-pi]');
            for (var gi = 0; gi < gInputs.length; gi++) {
              gInputs[gi].addEventListener('input', renderGraph);
            }
            renderGraph();
          }
        }
      });
  }

  function saveResult(row, params, close, onSaved) {
    var vals = {};
    if (params.length) {
      var anyVal = false;
      for (var i = 0; i < params.length; i++) {
        var inp = document.querySelector('[data-pi="' + i + '"]');
        var v = inp ? inp.value.trim() : '';
        vals[params[i].name] = v;
        if (v) anyVal = true;
      }
      var rem = document.getElementById('resRemarks');
      if (rem && rem.value.trim()) vals['Remarks'] = rem.value.trim();
      if (!anyVal) { App.toast('Enter at least one result value', 'err'); return; }
    } else {
      var ta = document.getElementById('resFree');
      var t = ta ? ta.value.trim() : '';
      if (!t) { App.toast('Enter the result', 'err'); return; }
      vals = { Result: t };
    }
    var patch = {
      values: vals,
      status: 'ready',
      reportedAt: new Date().toISOString(),
      reportedBy: sessionUser()
    };
    if (row.res) DB.update('results', row.res.id, patch);
    else DB.insert('results', { invoiceId: row.invoice.id, testId: row.item.testId, values: vals, status: 'ready', reportedAt: patch.reportedAt, reportedBy: patch.reportedBy });
    close();
    App.toast('Result saved — marked ready');
    if (typeof onSaved === 'function') onSaved();
    else render();
  }

  /* ---------- print report ---------- */

  // Shared structured report data (used by HTML print, preview modal, and PDF builder)
  /* ============================================================
     Lab report redesign (Chughtai-style) — integrated helpers
     Sources: ~/workspace/report-redesign/ workers 2,4,5,6,7,8,9,11,12.

     Font sizes below are written in em relative to the .rpt-page root.
     reportHtml() sets that root's px size from s.reportFontSize
     ('small' | 'medium' | 'large') via RPT.setScale(), so the whole
     report scales from one rule. Layout px (gaps, borders, images)
     deliberately does NOT scale.
     ============================================================ */

  /* ---------- worker 7/20: report style constants ---------- */
  var RPT = {

    /* COLORS — sampled from the reference */
    navy:      '#1b1b6e',  // lab name, tagline, logo ink (deep reference blue)
    ink:       '#111',     // primary body text / headings
    black:     '#000',     // patient grid labels+values, footer rule, barcode text
    grey:      '#777',     // secondary / muted text
    lightGrey: '#A9A9A9',  // hairline rules, dividers
    barGrey:   '#b5b5b5',  // TEST|NORMAL VALUE|UNIT header bar + RESULT box header
    line:      '#333',     // RESULT box border, thin dark rules
    tableLine: '#000',     // table header-bar outer border
    white:     '#ffffff',
    red:       '#c0392b',  // logo droplet accent
    powered:   '#999',     // "Powered by System Optix" footer line

    /* FONT SIZES — base scale (px at reportFontSize = 'medium') */
    base:  12,
    h1:    26,     // lab name in header
    h2:    15,     // test name heading (e.g. "Serum Electrolytes")
    h3:    13,
    small: 10.5,
    tiny:  9,

    fs: {
      /* header */
      labName:       26,
      labTagline:    14,
      labSlogan:      9,
      patientNoLbl:  12,
      patientNoVal:  12,
      logoSize:      54,

      /* patient info grid */
      patLabel:      12,
      patValue:      12,
      patLabelW:    230,

      /* sections */
      testName:      15,
      deptTitle:     14,
      subsection:    12.5,
      noteLbl:       11,
      noteBody:      11,

      /* test table */
      tableHead:     11,
      tableCell:     11.5,
      tableResult:   11.5,
      refRange:      10.5,
      resultBoxTtl:  11,
      resultBoxMeta:  9,

      /* footer */
      verNote:       12,
      sigName:       12,
      sigQual:       10,
      sigTitle:      10,
      addrLine:      12.5,
      poweredBy:     11
    },

    /* FONT FAMILIES — serif for the lab brand only; body inherits the
       lab's configured sans font (s.font) from the app / print shell. */
    serif: "Georgia,'Times New Roman',serif",
    sans:  "Arial,Helvetica,sans-serif",

    w: {
      normal: 400,
      bold:   700
    },

    sp: {
      headGap:        16,
      headPadBottom:  12,
      headMargin:     10,
      qrSize:        110,
      gridColGap:     40,
      gridRowPad:      2.5,
      gridMargin:      '2px 0 6px',
      gridRuleMargin:  '6px 0 4px',
      testNameMargin: '18px 0 6px',
      deptMargin:     '22px 0 10px',
      deptPad:        '7px 10px',
      subMargin:      '20px 0 8px',
      noteMargin:     '8px 0 2px',
      tableHeadPad:   '7px 10px',
      tableCellPad:   '6px 10px',
      verNoteMargin:  '22px 0 4px',
      footRuleMargin: '6px 0',
      sigMargin:      '10px 0 6px',
      sigGap:          8,
      addrMargin:     '10px 0 0',
      poweredMargin:  '14px 0 0'
    },

    bd: {
      hairline:  '1px solid #000',
      thin:      '1px solid #000',
      resultBox: '1.5px solid #333',
      rule:      '2.5px solid #000',
      sigLine:   '1px solid #000'
    },

    lh: {
      body:  1.5,
      table: 1.4,
      addr:  1.9
    },

    track: {
      caps:  '0.6px',
      wide:  '2px'
    },

    /* reportFontSize setting -> scale multiplier */
    fontScale: { small: 0.9, medium: 1, large: 1.12 },

    _scale: 1,

    /* select the active multiplier: RPT.setScale('large') */
    setScale: function (setting) {
      this._scale = this.fontScale[setting] || 1;
      return this._scale;
    },

    /* scale one px value: RPT.size(12) -> 13.4 at 'large' */
    size: function (n) {
      return Math.round(n * this._scale * 10) / 10;
    },

    /* scaled copy of the whole fs map for the given setting */
    sizes: function (setting) {
      var k = (setting && this.fontScale[setting]) ? setting : 'medium';
      var m = this.fontScale[k], out = {}, key;
      for (key in this.fs) {
        if (Object.prototype.hasOwnProperty.call(this.fs, key)) {
          out[key] = Math.round(this.fs[key] * m * 10) / 10;
        }
      }
      return out;
    },

    /* one-liner for inline styles: RPT.px('font-size', 12) -> "font-size:12px" */
    px: function (prop, n) {
      return prop + ':' + this.size(n) + 'px';
    }
  };

  /* ---------- worker 12/20: print stylesheet ----------
     reportHtml() injects this inside a <style> tag at the top of its
     output; rules are scoped to .rpt-page / @media print. */
  var RPT_PRINT_CSS = `
/* =====================================================================
   Optix LAB MedSync — Lab Report Print Stylesheet  (Worker 12/20)
   ---------------------------------------------------------------------
   Target: Chughtai-style A4 lab report (see reference image).
   The integrator injects this into the print document opened by
   App.print(title, html, {noHeader:true}), wrapping the report HTML
   in <div class="rpt-page"> … </div>. Report body itself is inline-
   styled; these rules govern the page box, print-only behavior,
   page-break control, exact background printing, and font smoothing.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. PAGE BOX — A4 portrait, ~12mm margins
   --------------------------------------------------------------------- */
@page {
  size: A4 portrait;
  margin: 12mm;
}

/* ---------------------------------------------------------------------
   2. PRINT BASE
   --------------------------------------------------------------------- */
@media print {

  /* Hard reset of any screen padding the app's print template applies. */
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
  }

  /* Never leak screen chrome into the printout. */
  .noprint,
  button, .btn,
  .actions, .toolbar {
    display: none !important;
  }

  /* Hide the browser's auto header/footer URL bar if the app sets
     @page margin boxes — kept zero-size defensively. */
  @page {
    margin: 12mm;
  }

  /* Keep everything monochrome-black like the reference report. */
  a {
    color: #000 !important;
    text-decoration: none !important;
  }

  /* Long values wrap instead of overflowing the page edge. */
  * {
    overflow-wrap: break-word;
  }
}

/* ---------------------------------------------------------------------
   3. REPORT CONTAINER
   --------------------------------------------------------------------- */
.rpt-page {
  /* 210mm A4 − 2×12mm page margin ≈ 186mm of printable width */
  max-width: 186mm;
  width: 100%;
  margin: 0 auto;
  color: #000;
  background: #fff;
  font-size: 12.5px;
  line-height: 1.55;
  /* Everything below inherits from here unless overridden. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  /* Keep shaded header bars when printing from Chrome/Edge. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* On screen preview (the "live print preview" panel) keep the page
   readable at any viewport width; print media ignores this. */
@media screen {
  .rpt-page {
    max-width: 800px;
  }
}

/* ---------------------------------------------------------------------
   4. PAGE-BREAK CONTROL
   --------------------------------------------------------------------- */

/* Test sections: never split a section's table across a page boundary
   when it fits on one page; never leave a section heading orphaned
   at the bottom of a page. (The integrator wraps each h3+table pair
   in .rpt-section; these rules also cover the raw sibling markup.) */
.rpt-page .rpt-section,
.rpt-page table.table {
  break-inside: avoid;
  page-break-inside: avoid;
}
.rpt-page h3 {
  break-after: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  page-break-inside: avoid;
}
/* If a section's table is genuinely longer than a page, at least keep
   each data row intact. */
.rpt-page table tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
/* Keep the note attached to the row it belongs to. */
.rpt-page .rpt-note {
  break-before: avoid;
  page-break-before: avoid;
}

/* RESULT box (barcode + reported-at stamp): never break across pages,
   never dangle away from its section. */
.rpt-page .rpt-resultbox {
  break-inside: avoid;
  page-break-inside: avoid;
  break-before: avoid;
  page-break-before: avoid;
  float: right;
  margin: 0 0 6px 12px;
}

/* Patient info grid and report header: keep together. */
.rpt-page .rpt-head,
.rpt-page .rpt-patient {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Footer: keep the verification note, signatory row and address block
   together on the same page; never orphan the footer from the body —
   force it onto the next page if it cannot fit with its lead content. */
.rpt-page .rpt-footer {
  break-inside: avoid;
  page-break-inside: avoid;
  break-before: auto;
}
.rpt-page .rpt-footnote {
  orphans: 3;
  widows: 3;
}
/* Signatory row: one block, never split between columns or pages. */
.rpt-page .rpt-sigs {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* "Powered by System Optix" line always sits with the address block. */
.rpt-page .rpt-powered {
  break-before: avoid;
  page-break-before: avoid;
}

/* ---------------------------------------------------------------------
   5. BACKGROUNDS MUST PRINT (exact color reproduction)
   --------------------------------------------------------------------- */

/* Grey header bars on TEST | NORMAL VALUE | UNIT | RESULT tables. */
.rpt-page,
.rpt-page thead th,
.rpt-page .rpt-greybar {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rpt-page thead th {
  background: #cfcfcf;
}
.rpt-page .rpt-greybar {
  background: #d9d9d9;
}

/* ---------------------------------------------------------------------
   6. TYPOGRAPHY FOR PRINT (matches the reference: plain black serif-less)
   --------------------------------------------------------------------- */
.rpt-page h1, .rpt-page h2, .rpt-page h3 {
  color: #000;
  font-weight: 700;
  line-height: 1.3;
}
.rpt-page .rpt-sec-title {
  font-size: 14.5px;
  font-weight: 700;
  margin: 16px 0 6px;
  color: #000;
}

/* Patient info: label bold, value regular — like the reference grid. */
.rpt-page .rpt-patient {
  font-size: 12.5px;
}
.rpt-page .rpt-patient .k {
  font-weight: 700;
}

/* Test tables: full width, thin dark rules, generous cell padding. */
.rpt-page table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 4px;
}
.rpt-page th,
.rpt-page td {
  border: 1px solid #000;
  padding: 6px 8px;
  font-size: 12px;
  text-align: left;
  vertical-align: top;
  color: #000;
}
.rpt-page thead th {
  font-weight: 700;
  font-size: 11.5px;
  letter-spacing: 0.4px;
}
.rpt-page td strong,
.rpt-page .rpt-result {
  font-weight: 700;
}

/* "Note:" blocks under a test. */
.rpt-page .rpt-note {
  font-size: 11.5px;
  margin: 6px 0 10px;
}
.rpt-page .rpt-note b,
.rpt-page .rpt-note strong {
  font-size: 12px;
}

/* ---------------------------------------------------------------------
   7. HEADER — lab block left, Patient No / Case # / QR right
   --------------------------------------------------------------------- */
.rpt-page .rpt-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 10px;
  margin-bottom: 8px;
  border-bottom: 2px solid #000;
}
.rpt-page .rpt-brand {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}
.rpt-page .rpt-logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
  flex: none;
}
.rpt-page .rpt-labname {
  margin: 0;
  font-size: 21px;
  color: #000;
  letter-spacing: 0.3px;
}
.rpt-page .rpt-tagline,
.rpt-page .rpt-addr {
  font-size: 11px;
  color: #000;
}
.rpt-page .rpt-ids {
  text-align: right;
  flex: none;
}
.rpt-page .rpt-ids .k {
  font-size: 12px;
  font-weight: 700;
}
.rpt-page .rpt-ids .v {
  font-size: 12px;
  margin: 2px 0 6px;
  letter-spacing: 1px;
}
.rpt-page .rpt-qr {
  width: 104px;
  height: 104px;
}

/* ---------------------------------------------------------------------
   8. PATIENT INFO GRID
   --------------------------------------------------------------------- */
.rpt-page .rpt-patient {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 36px;
  margin: 6px 0 4px;
}
.rpt-page .rpt-prow {
  display: flex;
  gap: 10px;
  padding: 3px 0;
  font-size: 12.5px;
}
.rpt-page .rpt-prow .k {
  font-weight: 700;
  flex: none;
  min-width: 168px;
}
.rpt-page hr.rpt-rule {
  border: none;
  border-top: 1px solid #000;
  margin: 8px 0 4px;
}

/* ---------------------------------------------------------------------
   9. FOOTER — verification notes, signatories, address, powered-by
   --------------------------------------------------------------------- */
.rpt-page .rpt-footer {
  margin-top: 18px;
}
.rpt-page .rpt-ver {
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  line-height: 1.5;
  margin: 18px 0 4px;
}
.rpt-page hr.rpt-footrule {
  border: none;
  border-top: 2.5px solid #000;
  margin: 6px 0;
}
.rpt-page .rpt-sigs {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
}
.rpt-page .rpt-sig {
  flex: 1;
  text-align: center;
}
.rpt-page .rpt-sig .n {
  font-weight: 800;
  font-size: 12.5px;
}
.rpt-page .rpt-sig .q,
.rpt-page .rpt-sig .t {
  font-size: 10.5px;
  color: #000;
}
.rpt-page .rpt-addrblock {
  text-align: center;
  font-size: 12px;
  margin-top: 14px;
  line-height: 1.8;
}
.rpt-page .rpt-powered {
  color: #000;
  font-size: 11px;
  text-align: center;
  margin: 12px 0 0;
}

/* ---------------------------------------------------------------------
   10. PRINT FINISHING TOUCHES
   --------------------------------------------------------------------- */
@media print {
  /* Never start a new page for a lone heading: pull the first content
     block up with the section title when a break would orphan it. */
  .rpt-page h3:first-child {
    margin-top: 0;
  }
  /* Remove any drop shadows / rounded corners that survive from
     screen styles — flat print only. */
  .rpt-page * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
  /* QR and logo images: crisp edges. */
  .rpt-page img {
    image-rendering: auto;
  }
}

/* ---------------------------------------------------------------------
   11. TREND GRAPH (worker 3/3)
   Inline SVG rendered by App.renderGraphSvg (graph-config.js).
   --------------------------------------------------------------------- */
.rpt-page .rpt-graph {
  /* Keep the reference band / line colors in print. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  /* Never split the graph block across a page boundary. */
  break-inside: avoid;
  page-break-inside: avoid;
}
/* The SVG scales via its own viewBox; cap the rendered size instead of
   fixing pixel dimensions so it stays crisp on screen and in print. */
.rpt-page .rpt-graph svg {
  display: block;
  width: 100%;
  max-width: 560px;
  height: auto;
}
  `;

  /* ---------- worker 1/4: report header (Chughtai-style) ----------
     Decorative grey-to-blue top bar; circular logo; large serif lab name +
     tagline highlight box + address/Tel/Email (center); MR / Lab # and
     Case # with Code39 barcodes + 90px QR placeholder (right); thin black
     rule below. The custom s.headerHtml override is applied by
     reportHtml(), not here. */
  function reportHeaderHtml(d) {
    var inv = (d && d.inv) || {};
    var pat = (d && d.pat) || {};
    var s = (d && d.s) || {};

    var showTagline = s.showTagline !== false;   /* default true */
    var showQr = s.showQr !== false;             /* default true */
    var labName = s.labName || 'Optix LAB MedSync';

    /* "INV-0042" -> "INV - 0042" spaced style like the reference */
    function spacedNo(v) {
      var t = String(v == null ? '' : v);
      if (!t) return '';
      return t.replace(/\s*-\s*/g, ' - ').replace(/\s*\/\s*/g, ' / ');
    }

    /* LEFT: logo image (rectangular banner, may contain lab name) when set,
       else large black serif lab name (+ tagline) */
    var leftHtml;
    if (s.logo) {
      leftHtml =
        '<div style="flex:1;min-width:0">' +
          '<img src="' + App.esc(s.logo) + '" style="max-width:320px;max-height:84px" alt="">' +
        '</div>';
    } else {
      leftHtml =
        '<div style="flex:1;min-width:0">' +
          '<div style="margin:0;color:#000;font-family:' + RPT.serif +
            ';font-weight:700;font-size:1.7em;line-height:1.2">' +
            App.esc(labName) +
          '</div>' +
          ((showTagline && s.tagline)
            ? '<div style="margin:4px 0 0;color:#000;font-family:' + RPT.serif +
                ';font-style:italic;font-size:1.05em">' +
                App.esc(s.tagline) +
              '</div>'
            : '') +
        '</div>';
    }

    /* RIGHT: QR on top, then Case # barcode + ID, then Patient ID barcode + ID */
    var _caseNo = spacedNo(inv.no);
    var _patId = String(pat.id == null ? '' : pat.id);
    var rightHtml =
      '<div style="flex:none;text-align:center;color:#000;font-size:0.95em;line-height:1.5">' +
        (showQr
          ? '<div><img data-qr="1" style="width:90px;height:90px" alt="QR"></div>'
          : '') +
        '<div style="margin-top:4px">' + barcodeHtml(_caseNo) +
          '<div style="font-weight:700;letter-spacing:2px">' + App.esc(_caseNo) + '</div></div>' +
        '<div style="margin-top:4px">' + barcodeHtml(_patId) +
          '<div style="font-weight:700;letter-spacing:2px">' + App.esc(_patId) + '</div></div>' +
      '</div>';

    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;background:#fff;color:#000">' +
        leftHtml +
        rightHtml +
      '</div>'
    );
  }

  /* ---------- worker 2/4: patient info grid ----------
     Reference layout: 2 columns; each row is "Label : value" with the
     colon separator; labels BOLD black (#000). Reg. Date comes from
     inv.createdAt (registration time), formatted "11-Jul-25 3:33:30 pm".
     Thin black rule below the grid. */
  function patientGridHtml(d) {
    var inv = d.inv || {};
    var pat = d.pat || {};
    var s = d.s || {};
    var em = '\u2014';

    function val(v) {
      if (v === undefined || v === null) return em;
      var str = String(v).trim();
      return str ? App.esc(str) : em;
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function validDate(t) {
      if (!t) return null;
      var dt = new Date(t);
      return isNaN(dt.getTime()) ? null : dt;
    }
    function fmtDate(t) {
      var dt = validDate(t);
      if (!dt) return null;
      return pad(dt.getDate()) + '-' + pad(dt.getMonth() + 1) + '-' + dt.getFullYear();
    }
    function fmtTime(t) {
      var dt = validDate(t);
      if (!dt) return null;
      return pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds());
    }
    function fmtDateTime(t) {
      var ds = fmtDate(t), ts = fmtTime(t);
      if (!ds || !ts) return em;
      return App.esc(ds + ' ' + ts);
    }
    function row(label, value) {
      return '<div style="display:flex;margin:1px 0;color:#000">' +
        '<span style="display:inline-block;min-width:140px;font-weight:bold;color:#000">' + label + '</span>' +
        '<span style="color:#000">:</span>' +
        '<span style="color:#000;margin-left:6px">' + value + '</span>' +
        '</div>';
    }

    var ageStr = (pat.age === undefined || pat.age === null) ? '' : String(pat.age).trim();
    var genderStr = (pat.gender === undefined || pat.gender === null) ? '' : String(pat.gender).trim();
    var ageSex = '';
    if (ageStr) ageSex = ageStr + ' Yr(s)';
    if (genderStr) ageSex = ageSex ? ageSex + ' / ' + genderStr : genderStr;

    var left = [
      ['Patient Name', val(pat.name)],
      ['Father/Husband Name', val(pat.father)],
      ['Age/Sex', val(ageSex)],
      ['Blood Group', val(pat.blood)],
      ['NIC', val(pat.cnic)],
      ['Phone', val(pat.phone)],
      ['Address', val(pat.address)]
    ];
    var right = [
      ['Registration Date', fmtDateTime(inv.createdAt)],
      ['Collect Report At', fmtDateTime(d.maxReported)],
      ['Registration Location', val(s.headOffice)],
      ['Destination Location', val(s.destinationLocation || s.mainLab)],
      ['Reference', val(s.reference)],
      ['Consultant', val((d.doc && d.doc.name) || 'SELF')]
    ];

    var i, html = '<div style="display:flex;color:#000;font-size:12px">';
    html += '<div style="flex:1;padding-right:10px">';
    for (i = 0; i < left.length; i++) { html += row(left[i][0], left[i][1]); }
    html += '</div>';
    html += '<div style="flex:1;padding-left:10px">';
    for (i = 0; i < right.length; i++) { html += row(right[i][0], right[i][1]); }
    html += '</div>';
    html += '</div>';
    html += '<hr style="border:none;border-top:1px solid #000;margin:6px 0 4px">';
    return html;
  }

  /* ---------- worker 11/20: abnormal value highlighting ----------
     abnormalDir() parses the reference range ("135 - 150", "< 200",
     "> 10", "4,000 - 11,000") and returns 'high' | 'low' | null.
     Empty / non-numeric refs (e.g. test-template params with ref: '')
     are NEVER flagged. */
  function parseAbnNum(str) {
    if (str == null) return NaN;
    var clean = String(str).replace(/,/g, '').trim();   // "7,500" -> "7500"
    var m = clean.match(/^[+-]?(\d+(\.\d+)?|\.\d+)/);
    return m ? parseFloat(m[0]) : NaN;
  }

  /* Returns 'high' | 'low' | null — the direction tells which arrow to show. */
  function abnormalDir(valueStr, refStr) {
    var sev = abnormalSeverity(valueStr, refStr);
    return sev ? sev.dir : null;
  }

  /* returns { dir: 'high'|'low', severity: 'mild'|'moderate'|'critical' } or null */
  function abnormalSeverity(valueStr, refStr) {
    var v = parseAbnNum(valueStr);
    if (isNaN(v)) return null;
    if (refStr == null) return null;
    var ref = String(refStr).replace(/[–—]/g, '-').trim();
    if (!ref || /see\s*below/i.test(ref)) return null;
    ref = ref.replace(/,/g, '');

    var dir = null, lo = null, hi = null;
    var op = ref.match(/^\s*(<=|>=|<|>|≤|≥)\s*(.+)$/);
    if (op) {
      var bound = parseAbnNum(op[2]);
      if (isNaN(bound)) return null;
      switch (op[1]) {
        case '<':  if (v >= bound) { dir = 'high'; lo = bound * 0.9; hi = bound; } break;
        case '<=': case '≤': if (v > bound) { dir = 'high'; lo = bound * 0.9; hi = bound; } break;
        case '>':  if (v <= bound) { dir = 'low'; lo = bound; hi = bound * 1.1; } break;
        case '>=': case '≥': if (v < bound) { dir = 'low'; lo = bound; hi = bound * 1.1; } break;
      }
      if (!dir) return null;
    } else if (ref.indexOf('-') > -1) {
      var nums = ref.match(/-?\d+(\.\d+)?/g);
      if (nums && nums.length >= 2) {
        lo = parseFloat(nums[0]); hi = parseFloat(nums[1]);
        if (lo > hi) { var t = lo; lo = hi; hi = t; }
        if (v < lo) dir = 'low';
        else if (v > hi) dir = 'high';
        else return null;
      } else return null;
    } else return null;

    /* calculate severity based on % outside range */
    var range = hi - lo;
    if (range <= 0) range = Math.abs(hi) || 1;
    var pct = dir === 'high' ? ((v - hi) / range) * 100 : ((lo - v) / range) * 100;
    var severity = pct <= 10 ? 'mild' : (pct <= 25 ? 'moderate' : 'critical');
    return { dir: dir, severity: severity };
  }

  function isAbnormal(valueStr, refStr) {
    return abnormalDir(valueStr, refStr) !== null;
  }

  /* Worker 11's resultCellHtml targets <table> markup; the redesigned
     report renders rows as a div grid, so rows use resultCellDiv() —
     same detection, same red-bold + ↑/↓ treatment. */
  function resultCellDiv(valueStr, refStr) {
    var disp = (valueStr == null) ? '' : String(valueStr);
    var dir = abnormalDir(valueStr, refStr);
    var arrow = dir === 'high' ? ' ↑' : (dir === 'low' ? ' ↓' : '');
    return '<div style="text-align:right' + (dir ? ';color:#c00;font-weight:700' : '') + '">' +
      App.esc(disp) + arrow + '</div>';
  }

  /* table-markup variant (kept for parity with worker 11's spec) */
  function resultCellHtml(valueStr, refStr) {
    var disp = (valueStr == null) ? '' : String(valueStr);
    var dir = abnormalDir(valueStr, refStr);
    if (!dir) return '<td>' + App.esc(disp) + '</td>';
    var arrow = (dir === 'high') ? ' ↑' : ' ↓';
    return '<td style="color:#c00;font-weight:700">' + App.esc(disp) + arrow + '</td>';
  }

  /* ---------- worker 9/20: Code39-style barcode (pure HTML/CSS) ----------
     barcodeHtml(text) renders a deterministic Code39-style barcode strip
     for the case # (~100px x 28px, black bars on white). No dependencies. */
  var CODE39 = {
    '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
    '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
    '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
    'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw',
    'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
    'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww',
    'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn',
    'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
    'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw',
    'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn',
    ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn', '$': 'nwnwnwnnn', '/': 'nwnwnnnwn',
    '+': 'nwnnnwnwn', '%': 'nnnwnwnwn'
  };

  function barcodeHtml(text) {
    var t = String(text == null ? '' : text).toUpperCase().replace(/\s+/g, '');
    // Encode with * start/stop; unsupported chars fall back to '-'
    var seq = '*' + t + '*';
    var bars = '';
    for (var i = 0; i < seq.length; i++) {
      var ch = seq.charAt(i);
      var pat = CODE39[ch] || CODE39['-'];
      for (var j = 0; j < 9; j++) {
        var isBar = (j % 2 === 0);
        var wide = pat.charAt(j) === 'w';
        // flex-grow proportional to module width: wide = 3x narrow
        bars += '<span style="display:block;flex:0 0 auto;width:0;flex-grow:' +
          (wide ? 3 : 1) + ';background:' + (isBar ? '#000' : '#fff') +
          ';height:100%;"></span>';
      }
      // narrow inter-character gap (white)
      if (i < seq.length - 1) {
        bars += '<span style="display:block;flex:0 0 auto;width:0;flex-grow:1;background:#fff;height:100%;"></span>';
      }
    }
    return '<div style="display:flex;align-items:stretch;width:70px;height:20px;' +
      'background:#fff;padding:0;margin:0 auto;line-height:0;overflow:hidden;" ' +
      'aria-hidden="true">' + bars + '</div>';
  }

  /* ---------- worker 4/20: one test section ----------
     Bold section title; medium-grey header bar (TEST | NORMAL VALUE | UNIT);
     bordered RESULT box on the right (grey "RESULT" strip, barcode, case #,
     timestamp); borderless param rows with the result value right-aligned
     in its own 4th column; abnormal values render red-bold with ↑/↓.
     No-params tests get a single "Result" row; vals['Remarks'] renders
     below the rows.

     NOTE (integrator fix): the worker's draft used a 3-column grid for a
     4-cell row, which would wrap the result cell onto a second line. The
     grid below uses 4 columns (header bar carries an empty 4th cell) so
     the TEST | NORMAL VALUE | UNIT | result columns line up exactly.

     Relies on: testName(r), barcodeHtml(), resultCellDiv(), chughtaiTs(). */
  function chughtaiTs(v) {
    var t = v instanceof Date ? v : new Date(v);
    if (isNaN(t.getTime())) return '';
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getDate()) + '-' + M[t.getMonth()] + '-' + t.getFullYear() + ' ' +
           p(t.getHours()) + ':' + p(t.getMinutes());
  }

  /* ---------- worker 3/4: date helpers for integrated comparison columns ---------- */
  var CMP_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtD(iso) {   /* "11-Jul-25" (day-Mon-yy) */
    var t = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(t.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getDate()) + '-' + CMP_MON[t.getMonth()] + '-' + String(t.getFullYear()).slice(2);
  }
  function fmtDMY(iso) { /* "6:7:2025" (d:m:yyyy) */
    var t = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(t.getTime())) return '';
    return t.getDate() + ':' + (t.getMonth() + 1) + ':' + t.getFullYear();
  }
  function fmtDTm(iso) {  /* "11-Jul-25  15:33" */
    var t = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(t.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return fmtD(iso) + '  ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }

  /* ---------- worker 3/4: per-test table with INTEGRATED comparison columns ----------
     Target design (reference: Waheed Khanzada style):
     - Blue bold caps section title: "{Test Name} ({CODE}) REPORT" — test code
       from r.item.code (fallback r.test.code) shown with the test name.
     - Light-blue (#d9f2fb) header row (TEST | REFERENCE RANGE | UNIT, dark
       borders) plus one RESULT box per report: the current report first,
       then one per previous report of the same test for this patient
       (newest first, capped at 2). Each box shows:
         line 1: RESULT (bold), line 2: 6:7:2025 (d:m:yyyy),
         line 3: 11-Jul-25  15:33
     - Body rows with dotted separators; param name regular weight.
     - Abnormal values (abnormalDir): red (#c00) bold with ↑ (high) or ↓
       (low) before the value — current and previous columns alike.
     - Tests with no params (free-text): single row labeled "Result" with
       the value spanning the result columns. */
  function testSectionHtml(r, d) {
    d = d || {};
    var test = r.test || {};
    var params = Array.isArray(test.params) ? test.params : [];
    var vals = (r.res && r.res.values) || {};
    var testId = (r.item && (r.item.testId || r.item.id)) || '';
    var prev = (d.prevByTest && testId && d.prevByTest[testId]) || [];
    var invNo = (d.inv && d.inv.no) || '';

    /* result columns: current report first, then previous (newest first) */
    var cols = [{ reportedAt: (r.res && r.res.reportedAt) || d.maxReported || '', values: vals }]
      .concat(prev.map(function (p) {
        return { reportedAt: p.reportedAt || '', values: p.values || {} };
      }));
    var nRes = cols.length;

    /* column grid: TEST 30% | NORMAL VALUE 22% | UNIT 10% | results share the rest */
    var resW = (38 / nRes).toFixed(2);
    var gridCols = '30% 22% 10%';
    for (var gi = 0; gi < nRes; gi++) gridCols += ' ' + resW + '%';

    /* section title: "{Name} ({CODE})" — append REPORT unless already present */
    var tName = testName(r);
    var tCode = (r.item && r.item.code) || (test && test.code) || '';
    var title = tName + (tCode ? ' (' + tCode + ')' : '');
    if (!/report\s*:?\s*$/i.test(title)) title += ' REPORT';

    /* RESULT header boxes — span the full header height (grid-row: span 2):
       barcode of the case/invoice number, then the case number, then the
       date/time in Chughtai style ("22-Sep-2026 10:21") */
    var boxHtml = cols.map(function (c) {
      return '<div style="border:1px solid #000;background:#fff;text-align:center;' +
        'padding:2px 1px;line-height:1.3;font-size:0.85em;grid-row:span 2">' +
        '<div style="font-weight:700;color:#000;font-size:0.95em">RESULT</div>' +
        barcodeHtml(invNo) +
        '<div style="font-weight:700;color:#000;font-size:0.9em">' + App.esc(invNo) + '</div>' +
        '<div style="font-size:0.85em;color:#000">' +
          App.esc(chughtaiTs(c.reportedAt)).replace(/ /g, '&nbsp;') +
        '</div>' +
      '</div>';
    }).join('');

    /* medium-grey header bar cells for the 3 label columns */
    var headCells = ['TEST', 'NORMAL VALUE', 'UNIT'].map(function (h, i) {
      return '<div style="border:1px solid #000;' + (i ? 'border-left:none;' : '') +
        'background:#d9d9d9;color:#000;font-weight:700;padding:4px 6px;font-size:1em">' +
        h +
      '</div>';
    }).join('');

    /* value cell: centered; abnormal = bold black only (no colors, no arrows) */
    function valCell(valueStr, refStr) {
      var disp = (valueStr == null) ? '' : String(valueStr);
      if (abnormalSeverity(disp, refStr)) {
        return '<div style="text-align:center">' +
          '<span style="font-weight:700;color:#000">' + App.esc(disp) + '</span>' +
        '</div>';
      }
      return '<div style="text-align:center">' + App.esc(disp) + '</div>';
    }

    /* body rows: thin separators, param name regular weight */
    var rowsHtml;
    if (params.length) {
      rowsHtml = params.map(function (p) {
        var cells = cols.map(function (c) {
          return valCell((c.values || {})[p.name], p.ref);
        }).join('');
        return '<div style="display:grid;grid-template-columns:' + gridCols + ';' +
          'border-bottom:1px solid #ddd;font-size:1.04em;padding:4px 6px">' +
          '<div>' + App.esc(p.name || '') + '</div>' +
          '<div>' + App.esc(p.ref != null && p.ref !== '' ? String(p.ref) : '—') + '</div>' +
          '<div>' + App.esc(p.unit != null && p.unit !== '' ? String(p.unit) : '') + '</div>' +
          cells +
        '</div>';
      }).join('');
    } else {
      // Test with no params: single row labeled "Result", value spans the result columns.
      var ftVal = vals['Result'];
      rowsHtml =
        '<div style="display:grid;grid-template-columns:' + gridCols + ';' +
          'border-bottom:1px solid #ddd;font-size:1.04em;padding:4px 6px">' +
          '<div>Result</div>' +
          '<div></div><div></div>' +
          '<div style="grid-column:span ' + nRes + ';text-align:center">' +
            App.esc(ftVal == null ? '' : String(ftVal)) +
          '</div>' +
        '</div>';
    }

    /* remarks below the table (kept from previous design) */
    var remarksHtml = '';
    if (vals['Remarks']) {
      remarksHtml =
        '<div style="font-size:1em;padding:6px 6px 0">' +
          '<div style="font-weight:700">Note:</div>' +
          '<div>' + App.esc(vals['Remarks']) + '</div>' +
        '</div>';
    }

    /* ---------- worker 3/3: trend graph below the table ----------
       Contract lives in assets/js/graph-config.js (Worker 1):
         App.graphFor(test) -> {xLabels, unit, refLo, refHi, title} | null
         App.renderGraphSvg(g, valsByParam) -> inline-SVG HTML | ''
       Current-report values only; renderGraphSvg returns '' when fewer
       than 2 numeric points are plottable. Guarded so the report still
       renders when graph-config.js is absent. Never throws. */
    var graphHtml = '';
    try {
      if (window.App && App.graphFor && App.renderGraphSvg) {
        var g = App.graphFor(test);
        /* Value lookup keys: the config carries the param names in g.params
           (g.xLabels are display labels like "0 min"); the contract used
           xLabels for both. Accept either shape. */
        var gKeys = (g && Array.isArray(g.params) && g.params.length) ? g.params :
                    (g && Array.isArray(g.xLabels) ? g.xLabels : []);
        if (gKeys.length > 1) {
          var nNum = 0;
          for (var qi = 0; qi < gKeys.length; qi++) {
            if (isFinite(parseFloat(vals[gKeys[qi]]))) nNum++;
          }
          if (nNum >= 2) {
            var svg = App.renderGraphSvg(g, vals) || '';
            if (svg) {
              graphHtml =
                '<div class="rpt-graph" style="margin:8px 0 4px;page-break-inside:avoid">' +
                  '<div style="font-weight:700;font-size:0.9em;margin-bottom:4px;color:#000">' +
                    App.esc(g.title || 'Trend Graph') +
                  '</div>' +
                  svg +
                '</div>';
            }
          }
        }
      }
    } catch (e) { graphHtml = ''; }

    /* assemble: title + RESULT boxes row, then grey header row, body, graph, remarks */
    return '<div class="rpt-section" style="margin:14px 0 4px">' +
      '<div style="display:grid;grid-template-columns:' + gridCols + '">' +
        '<div style="grid-column:span 3;align-self:center;color:#000;font-weight:700;' +
          'font-size:1.15em;text-transform:uppercase;letter-spacing:0.02em">' +
          App.esc(title) +
        '</div>' +
        boxHtml +
        headCells +
      '</div>' +
      rowsHtml +
      graphHtml +
      remarksHtml +
    '</div>';
  }

  /* ---------- worker 5/20: section dividers / subsection headers / notes ----------
     Emitted by reportHtml() when tests carry a category (grouped, stable
     sort). Until tests carry categories this is a safe no-op. */
  function sectionDividerHtml(title) {
    return '<div style="background:#e8e8e8;border:1px solid #000;' +
      'padding:7px 10px;margin:22px 0 10px;' +
      'font-size:1.12em;font-weight:700;color:#000;' +
      'page-break-after:avoid">' +
      App.esc(title || '') + '</div>';
  }

  function subsectionHeaderHtml(title) {
    return '<h3 style="margin:20px 0 8px;font-size:1em;font-weight:700;' +
      'letter-spacing:0.05em;color:#000;text-transform:uppercase;' +
      'page-break-after:avoid">' +
      App.esc(String(title || '').toUpperCase()) + '</h3>';
  }

  /* Per-test Note block ("Note:" + small text). Renders test.note when
     present, nothing otherwise. */
  function testNoteHtml(test) {
    var note = test && (test.note || '');
    if (!note) return '';
    return '<div class="rpt-note" style="margin:8px 0 2px;font-size:0.88em;line-height:1.5;color:#000;' +
      'page-break-inside:avoid">' +
      '<strong>Note:</strong><br>' +
      App.esc(note) + '</div>';
  }

  function sectionCatOf(r) {
    var c = r && r.test && r.test.category;
    if (c == null) return '';
    return String(c).trim();
  }

  /* exposed for other modules / future use */
  App.sectionDividerHtml = sectionDividerHtml;
  App.subsectionHeaderHtml = subsectionHeaderHtml;
  App.testNoteHtml = testNoteHtml;
  App.sectionCatOf = sectionCatOf;

  /* ---------- worker 4/4: report footer (redesign) ----------
     Centered bold verification line, thick black rule, signatories in
     one row spread across (from s.signatories), bordered disclaimer box,
     "Powered by System Optix". Used only when the custom s.footerHtml
     override is NOT set. */
  function reportFooterHtml(d) {
    var s = (d && d.s) || {};

    /* 1: centered bold verification line */
    var verNote = s.verNote || s.verificationNote ||
      'Electronically verified report. No signatures necessary. Sample brought to the main lab. Lab reports should be interpreted by a physician in correlation with clinical and radiologic findings.';
    var line1 =
      '<p class="rpt-ver" style="text-align:center;font-weight:700;font-size:0.96em;margin:22px 0 4px;line-height:1.5">' +
        App.esc(verNote) + '</p>';

    /* 2: thin black rule */
    var rule = '<hr class="rpt-footrule" style="border:none;border-top:1px solid #000;margin:6px 0">';

    /* 3: signatory doctors in one row, spread across */
    var sigs = (Array.isArray(s.signatories) ? s.signatories : [])
      .filter(function (g) { return g && g.name; });
    var sigHtml = '';
    if (sigs.length) {
      sigHtml =
        '<div class="rpt-sigs" style="display:flex;justify-content:space-between;gap:10px;margin:10px 0 8px">' +
          sigs.map(function (g) {
            return '<div class="rpt-sig" style="flex:1;text-align:left">' +
              '<div style="font-weight:700;font-size:0.9em">' + App.esc(g.name) + '</div>' +
              (g.qual ? '<div style="font-size:0.78em">' + App.esc(g.qual) + '</div>' : '') +
              (g.title ? '<div style="font-size:0.78em">' + App.esc(g.title) + '</div>' : '') +
            '</div>';
          }).join('') + '</div>';
    }

    /* 4: address block, centered bold-ish — always show lab address + contact */
    var addrLines = [];
    if (s.address) addrLines.push(s.address);
    if (s.headOffice) addrLines.push('Head Office: ' + s.headOffice);
    if (s.mainLab) addrLines.push('Previous Lab: ' + s.mainLab);
    var contactParts = [];
    if (s.phone) contactParts.push('Phone: ' + s.phone);
    if (s.callCenter) contactParts.push('Call Center: ' + s.callCenter);
    if (s.website) contactParts.push('Web: ' + s.website);
    if (s.email) contactParts.push('Email: ' + s.email);
    if (contactParts.length) addrLines.push(contactParts.join('   '));
    var addrHtml = '';
    if (addrLines.length) {
      addrHtml =
        '<div style="text-align:center;font-weight:600;font-size:0.85em;line-height:1.6;margin:6px 0">' +
          addrLines.map(function (l) { return '<div>' + App.esc(l) + '</div>'; }).join('') +
        '</div>';
    }

    /* 5: disclaimer box — skip the old "Get well soon" default footer note */
    var _fn = s.footerNote;
    if (_fn === 'Get well soon. Reports available on counter & phone.') _fn = '';
    var disc = s.disclaimer || _fn ||
      'NOTE: All the tests are performed on the most advanced, highly sophisticated, appropriate, and state of the art instruments with highly sensitive chemicals under strict conditions and with all care and diligence. However, the above results are NOT the DIAGNOSIS and should be correlated with clinical findings, patient\'s history, signs and symptoms and other diagnostic tests. Lab to lab variation may occur. This document is NEVER challengeable at any PLACE/COURT and in any CONDITION.';
    var discHtml =
      '<div class="rpt-disc" style="border:1px solid #000;padding:6px 8px;font-size:0.72em;line-height:1.5;margin:8px 0 0">' +
        App.esc(disc) + '</div>';

    /* 6: powered-by (existing constraint) */
    var powered =
      '<p class="rpt-powered" style="color:#000;font-size:0.88em;text-align:center;margin:14px 0 0">Powered by System Optix</p>';

    return '<div class="rpt-footer">' + line1 + rule + sigHtml + addrHtml + discHtml + powered + '</div>';
  }

  function reportData(invoiceId) {
    var inv = invOf(invoiceId);
    if (!inv) return null;
    var readyRows = joinedRows('ready').filter(function (r) { return r.invoice.id === invoiceId; });
    if (!readyRows.length) return null;
    var pendingCount = joinedRows('pending').filter(function (r) { return r.invoice.id === invoiceId; }).length;
    var maxReported = '';
    readyRows.forEach(function (r) {
      if (r.res && r.res.reportedAt && r.res.reportedAt > maxReported) maxReported = r.res.reportedAt;
    });

    /* ---------- worker 3/4: integrated comparison data ----------
       Previous-report data: for the same patient (inv.patientId), find OTHER
       invoices (id !== invoiceId) with ready results, newest first.
       d.prevByTest = map testId -> array of { invoiceNo, reportedAt, values }
       (capped at 2 previous columns per test for readability). */
    var prevByTest = {};
    var otherInvRows = joinedRows('ready').filter(function (r) {
      return r.invoice.id !== invoiceId && r.invoice.patientId === inv.patientId;
    });
    otherInvRows.sort(function (a, b) {
      var da = (a.res && a.res.reportedAt) || a.invoice.createdAt || '';
      var db = (b.res && b.res.reportedAt) || b.invoice.createdAt || '';
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    otherInvRows.forEach(function (r) {
      var tid = (r.item && (r.item.testId || r.item.id)) || (r.res && r.res.testId);
      if (!tid) return;
      if (!prevByTest[tid]) prevByTest[tid] = [];
      if (prevByTest[tid].length >= 2) return;  /* cap: 2 previous columns */
      prevByTest[tid].push({
        invoiceNo: r.invoice.no || r.invoice.id,
        reportedAt: (r.res && r.res.reportedAt) || r.invoice.createdAt || '',
        values: (r.res && r.res.values) || {}
      });
    });

    return {
      inv: inv,
      pat: patOf(inv.patientId),
      s: DB.get('settings', 'main') || {},
      doc: inv.doctorId ? DB.get('doctors', inv.doctorId) : null,
      readyRows: readyRows,
      pendingCount: pendingCount,
      maxReported: maxReported,
      prevByTest: prevByTest
    };
  }

  /* ---------- lab report document (Chughtai-style redesign) ----------
     Composed from the integrated helpers above:
       header (worker 2) + patient grid (worker 3) + test sections with
       category dividers/notes (workers 4+5) + footer (worker 6).
     - s.headerHtml / s.footerHtml custom overrides still win when set.
     - opts.noLabHeader (print-choice dialog: pre-printed letterhead) still
       suppresses the header.
     - The QR placeholder <img data-qr="1"> contract is unchanged:
       printReport() injects the src; stripQrImg() only runs if QR
       generation itself fails (unpaid invoices get a fallback-URL QR).
     - Output is wrapped in .rpt-page (print stylesheet governs page box,
       breaks and exact backgrounds) with the <style> prepended. */
  function reportHtml(d, opts) {
    var inv = d.inv || {}, pat = d.pat || {}, s = d.s || {};
    var readyRows = d.readyRows || [], pendingCount = d.pendingCount || 0;
    var noLabHeader = !!(opts && opts.noLabHeader);

    /* report font-size scale (Lab Profile -> Report Font Size) */
    var rptScale = RPT.setScale(s.reportFontSize || 'medium');
    var rptBase = Math.round(12.5 * rptScale * 10) / 10;

    /* header */
    /* custom header/footer only override if they contain real content (ignore trivial/invalid like ">") */
    function hasRealHtml(h) {
      if (!h) return false;
      var t = String(h).replace(/<[^>]*>/g, '').trim();
      return t.length > 1;
    }
    var headOut = noLabHeader ? '' : (hasRealHtml(s.headerHtml) ? s.headerHtml : reportHeaderHtml(d));

    /* patient info grid */
    var infoHtml = patientGridHtml(d);

    /* test sections, grouped by test category when present */
    var rows = readyRows.slice();
    rows.sort(function (a, b) {
      var ca = sectionCatOf(a), cb = sectionCatOf(b);
      if (!ca && !cb) return 0;              // keep original order
      if (!ca) return 1;                     // uncategorised last
      if (!cb) return -1;
      return ca === cb ? 0 : (ca < cb ? -1 : 1);
    });
    var testsHtml = '', lastCat = null;
    rows.forEach(function (r) {
      var cat = sectionCatOf(r);
      if (cat && cat !== lastCat) {
        // Department divider on category change; categories that already
        // read like a department ("Department of X") render as the divider,
        // otherwise as an ALL-CAPS subsection header.
        testsHtml += (/^department of/i.test(cat) ? sectionDividerHtml(cat) : subsectionHeaderHtml(cat));
        lastCat = cat;
      }
      testsHtml += testSectionHtml(r, d);
      testsHtml += testNoteHtml(r.test);
    });

    /* footer */
    var footOut = hasRealHtml(s.footerHtml) ? s.footerHtml : reportFooterHtml(d);

    var bodyHtml = headOut + infoHtml + testsHtml +
      (pendingCount
        ? '<p style="color:#000;font-size:0.96em;margin:10px 0"><em>Note: ' +
          pendingCount + ' test(s) from this invoice are still pending.</em></p>'
        : '') +
      (s.footerNote && s.footerNote !== 'Get well soon. Reports available on counter & phone.'
        ? '<p style="color:#000;margin-top:18px;margin-bottom:4px;font-size:0.92em"><em>' +
          App.esc(s.footerNote) + '</em></p>'
        : '') +
      footOut;

    return '<style>' + RPT_PRINT_CSS + '</style>' +
      '<div class="rpt-page" style="font-size:' + rptBase + 'px">' + bodyHtml + '</div>';
  }

  /* ---------- QR-coded report PDF upload ---------- */
  // The printed report carries a QR code that opens the report PDF on a phone.
  // The PDF is uploaded once per invoice (stable key), then the URL is reused.

  function rand6() {
    var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', i;
    for (i = 0; i < 6; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }

  // Build the report PDF, upload it to the cloud API, return the public URL (or null).
  function getReportPdfUrl(invoiceId) {
    var inv = invOf(invoiceId);
    if (!inv) return Promise.resolve(null);
    // QR goes live only when the invoice is fully paid; unpaid reports print without a live QR
    if (inv.status !== 'paid') return Promise.resolve(null);
    var pdf = null;
    try { pdf = buildReportPdf(invoiceId); } catch (e) { pdf = null; }
    if (!pdf || !pdf.dataUri) return Promise.resolve(null);
    var key = inv.reportPdfKey || ('rpt-' + invoiceId + '-' + rand6());
    var rawUri = String(pdf.dataUri);
    var b64 = rawUri.slice(rawUri.indexOf(',') + 1); // strip data:...;base64, prefix (jsPDF adds filename=)
    var base = 'https://labpos-api.150.230.52.29.sslip.io';
    try { if (window.LABPOS_API) base = window.LABPOS_API; } catch (e) {}
    return fetch(base + '/api/report-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, pdfBase64: b64 })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.url) {
          try { DB.update('invoices', invoiceId, { reportPdfKey: key }); } catch (e) {}
          return j.url;
        }
        return null;
      })
      .catch(function () { return null; });
  }
  App.getReportPdfUrl = getReportPdfUrl;

  function qrDataUrlFor(url) {
    try {
      if (!url || typeof qrcode === 'undefined') return null;
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(4, 4);
    } catch (e) { return null; }
  }

  function stripQrImg(html) {
    var h = String(html);
    // The data-qr-wrap block contains no nested <div> (the caption is a
    // <span>), so the first </div> the non-greedy match hits is the
    // wrapper's own closing tag — this removes the QR *and* its
    // "Scan to verify" caption, so a report whose QR generation failed
    // never shows a dangling caption.
    h = h.replace(/<div[^>]*\bdata-qr-wrap\b[^>]*>[\s\S]*?<\/div>/, '');
    // Fallback: strip a bare QR img if the wrapper is ever absent.
    h = h.replace(/<img[^>]*data-qr="1"[^>]*>/, '');
    return h;
  }

  async function printReport(invoiceId, opts) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results to print', 'err'); return; }
    var invPaid = d.inv && d.inv.status === 'paid';
    var qrImg = null;
    try {
      var jsOk = await App.ensureJsPDF();
      if (jsOk) {
        var url = await getReportPdfUrl(invoiceId);
        /* fallback: if backend upload fails or invoice unpaid, generate QR with invoice reference */
        if (!url) url = 'https://optix-lab-medsync.pages.dev/#/invoice/' + invoiceId;
        qrImg = qrDataUrlFor(url);
      }
    } catch (e) { qrImg = null; }
    var html = reportHtml(d, opts);
    if (qrImg) html = html.replace('data-qr="1"', 'data-qr="1" src="' + qrImg + '"');
    else html = stripQrImg(html);
    App.print('Lab Report — ' + d.inv.no, html, { noHeader: true });
  }

  /* print choice dialog: with or without the lab letterhead header */
  function printReportChoice(invoiceId) {
    /* find all previous reports for this patient */
    var prevList = [];
    try {
      var curInv = invOf(invoiceId);
      if (curInv && curInv.patientId) {
        prevList = DB.all('invoices')
          .filter(function (inv) {
            return inv.patientId === curInv.patientId && inv.id !== invoiceId &&
              joinedRows('ready').some(function (r) { return r.invoice.id === inv.id; });
          })
          .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      }
    } catch (e) {}
    var cmpHtml = '';
    if (prevList.length) {
      cmpHtml = '<div style="margin-top:14px;border:1px solid var(--line);border-radius:8px;padding:10px;max-height:180px;overflow:auto">' +
        '<div style="font-weight:700;margin-bottom:8px">Previous Reports <span class="muted" style="font-weight:400">(select to include in comparison)</span></div>';
      prevList.forEach(function (p, i) {
        cmpHtml += '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-bottom:1px solid var(--line)">' +
          '<input type="checkbox" class="prCmpSel" value="' + App.esc(p.id) + '"' + (i === 0 ? ' checked' : '') + ' style="width:16px;height:16px"> ' +
          '<span><strong>' + App.esc(p.no || p.id) + '</strong> <span class="muted">' + App.esc(App.d(p.createdAt)) + '</span></span></label>';
      });
      cmpHtml += '</div>';
    }
    App.modal('Print Report',
      '<p style="margin-bottom:16px">Print this report with or without the lab header?</p>' +
      '<div style="display:flex;gap:12px">' +
      '<button class="btn btn-primary" id="prWithHead" style="flex:1;padding:14px">With Header</button>' +
      '<button class="btn btn-ghost" id="prNoHead" style="flex:1;padding:14px">Without Header</button>' +
      '</div>' + cmpHtml +
      '<p class="muted" style="margin-top:12px;font-size:12px;margin-bottom:0">Use "Without Header" when printing on pre-printed letterhead paper.</p>',
      { onOpen: function (ov, close) {
          function selCmps() {
            var out = [];
            ov.querySelectorAll('.prCmpSel:checked').forEach(function (c) { out.push(c.value); });
            return out;
          }
          ov.querySelector('#prWithHead').addEventListener('click', function () {
            close();
            var sels = selCmps();
            if (sels.length) printWithComparison(invoiceId, sels[0], {});
            else printReport(invoiceId, {});
          });
          ov.querySelector('#prNoHead').addEventListener('click', function () {
            close();
            var sels = selCmps();
            if (sels.length) printWithComparison(invoiceId, sels[0], { noLabHeader: true });
            else printReport(invoiceId, { noLabHeader: true });
          });
        }
      });
  }

  /* print current + previous report with auto-comparison on one page */
  async function printWithComparison(newInvId, oldInvId, opts) {
    var dNew = reportData(newInvId), dOld = reportData(oldInvId);
    if (!dNew || !dOld) { App.toast('Could not load both reports', 'err'); return; }
    /* generate comparison table HTML */
    var cmpHtml = buildComparisonTable(dOld, dNew);
    /* full new report + comparison on one page */
    var qrImg = null;
    try {
      var jsOk = await App.ensureJsPDF();
      if (jsOk) {
        var url = await getReportPdfUrl(newInvId);
        if (!url) url = 'https://optix-lab-medsync.pages.dev/app/#/invoice/' + newInvId;
        qrImg = qrDataUrlFor(url);
      }
    } catch (e) {}
    var html = reportHtml(dNew, opts);
    if (qrImg) html = html.replace('data-qr="1"', 'data-qr="1" src="' + qrImg + '"');
    else html = stripQrImg(html);
    html += '<div style="page-break-before:always"></div>' + cmpHtml;
    App.print('Lab Report with Comparison — ' + dNew.inv.no, html, { noHeader: true });
  }

  /* build comparison table HTML from two report datasets (old vs new) */
  function buildComparisonTable(dOld, dNew) {
    function indexResults(d) {
      var map = {};
      (d.readyRows || []).forEach(function (r) {
        var tid = (r.item && (r.item.testId || r.item.id)) || '';
        var tname = (r.item && r.item.name) || (r.test && r.test.name) || tid;
        var params = (r.test && r.test.params) || [];
        var vals = (r.res && r.res.values) || {};
        if (!map[tid]) map[tid] = { name: tname, params: {} };
        params.forEach(function (p) {
          map[tid].params[p.name] = { val: vals[p.name] || '—', unit: p.unit || '', ref: p.ref || '' };
        });
      });
      return map;
    }
    var mOld = indexResults(dOld), mNew = indexResults(dNew);
    var allTids = [];
    Object.keys(mOld).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });
    Object.keys(mNew).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });
    function numVal(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
    var rowsHtml = '';
    allTids.forEach(function (tid) {
      var tO = mOld[tid], tN = mNew[tid];
      var tname = (tN && tN.name) || (tO && tO.name) || tid;
      rowsHtml += '<tr><td colspan="5" style="background:#eef;font-weight:800;padding:8px">' + App.esc(tname) + '</td></tr>';
      var pnames = [];
      [tO, tN].forEach(function (t) {
        if (t) Object.keys(t.params).forEach(function (pn) { if (pnames.indexOf(pn) < 0) pnames.push(pn); });
      });
      pnames.forEach(function (pn) {
        var pO = tO && tO.params[pn], pN = tN && tN.params[pn];
        var vO = pO ? pO.val : '—', vN = pN ? pN.val : '—';
        var ref = (pN && pN.ref) || (pO && pO.ref) || '', unit = (pN && pN.unit) || (pO && pO.unit) || '';
        var changed = vO !== vN && vO !== '—' && vN !== '—';
        var vs = changed ? ' style="color:#c00;font-weight:800"' : '';
        var nO = numVal(vO), nN = numVal(vN), trend = '';
        if (changed && nO !== null && nN !== null) trend = nN > nO ? ' ↑' : (nN < nO ? ' ↓' : ' =');
        rowsHtml += '<tr' + (changed ? ' style="background:#fff8e1"' : '') + '>' +
          '<td>' + App.esc(pn) + '</td><td class="muted">' + App.esc(ref) + '</td>' +
          '<td class="muted">' + App.esc(unit) + '</td>' +
          '<td' + vs + '><strong>' + App.esc(vO) + '</strong></td>' +
          '<td' + vs + '><strong>' + App.esc(vN) + '</strong>' + trend + '</td></tr>';
      });
    });
    return '<div style="font-family:inherit">' +
      '<h2 style="text-align:center">Report Comparison</h2>' +
      '<p style="text-align:center" class="muted">' + App.esc(dNew.pat.name || '') + '</p>' +
      '<table class="table"><thead><tr><th>Parameter</th><th>Normal Value</th><th>Unit</th>' +
      '<th>Previous<br><span class="muted">' + App.esc(dOld.inv.no) + ' (' + App.d(dOld.inv.createdAt) + ')</span></th>' +
      '<th>Current<br><span class="muted">' + App.esc(dNew.inv.no) + ' (' + App.d(dNew.inv.createdAt) + ')</span></th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  // Report preview modal with Print + Share on WhatsApp actions
  function viewReport(invoiceId) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results to view', 'err'); return; }
    var close = App.modal('Lab Report — ' + App.esc(d.inv.no),
      '<div class="report-preview" style="max-height:62vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:20px;background:#fff">' +
        stripQrImg(reportHtml(d)) +
      '</div>' +
      '<div class="actions" style="margin-top:16px">' +
        '<button class="btn btn-ghost" id="rvClose">Close</button>' +
        '<button class="btn btn-ghost" id="rvWa">' + WA_ICON + ' Share on WhatsApp</button>' +
        '<button class="btn btn-primary" id="rvPrint">' + PRINT_ICON + ' Print Report</button>' +
      '</div>',
      { wide: true, onOpen: function (ov, close) {
          document.getElementById('rvClose').addEventListener('click', close);
          document.getElementById('rvPrint').addEventListener('click', function () { close(); printReportChoice(invoiceId); });
          document.getElementById('rvWa').addEventListener('click', function () { shareReportWhatsApp(invoiceId); });
        }
      });
  }

  /* ---------- report PDF builder (jsPDF) ---------- */

  // Returns { dataUri } or null (error toasted).
  // qrDataUrl (optional): QR image data URL embedded in the header.
  function buildReportPdf(invoiceId, qrDataUrl) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results for PDF', 'err'); return null; }
    var JSPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JSPDF) { App.toast('PDF engine not loaded — check connection and reload', 'err'); return null; }

    var s = d.s, inv = d.inv, pat = d.pat;
    var doc = new JSPDF({ unit: 'mm', format: 'a4' });
    var W = 210, M = 12, CW = W - 2 * M;
    var y = M;

    function need(h) { if (y + h > 280) { doc.addPage(); y = M; } }
    function txt(t, x, yy, opts) {
      // jsPDF renders a string[] as multiple lines; keep that working
      // (patient grid / wrapped footer lines pass splitTextToSize arrays).
      if (Array.isArray(t)) t = t.map(function (l) { return String(l == null ? '' : l); });
      else t = String(t == null ? '' : t);
      doc.text(t, x, yy, opts || {});
    }
    function dash(v) { return (v == null || v === '') ? '—' : String(v); }
    function addImg(dataUrl, x, yy, w, h) {
      try {
        var fmt = /image\/png/i.test(dataUrl) ? 'PNG' : (/image\/gif/i.test(dataUrl) ? 'GIF' : 'JPEG');
        doc.addImage(dataUrl, fmt, x, yy, w, h);
        return true;
      } catch (e) { return false; }
    }

    /* ----- header: logo + lab (left), patient/case nos + QR (right) ----- */

    // Accent hex -> RGB (default navy #1B1B6E); accepts "#rrggbb" or "rrggbb".
    function hdrAccentRgb(hex) {
      var raw = String(hex || '').trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$/.test(raw)) raw = raw.split('').map(function (c) { return c + c; }).join('');
      if (!/^[0-9a-fA-F]{6}$/.test(raw)) raw = '1B1B6E';
      var v = parseInt(raw, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var A = hdrAccentRgb(s.accent);
    var showQr = s.showQr !== false && !!qrDataUrl;
    var showTagline = s.showTagline !== false && !!s.tagline;

    var qrS = 26;                                  // QR size (mm)
    var headH = showQr ? qrS : 23;                 // header block height

    // --- left: logo (~18mm) + lab name + subtitle ---
    if (s.logo) addImg(s.logo, M, y, 18, 18);
    var htx = M + (s.logo ? 22 : 0);
    doc.setFont('times', 'bold'); doc.setFontSize(18);
    doc.setTextColor(A[0], A[1], A[2]);
    txt(s.labName || 'Optix LAB MedSync', htx, y + 9);
    if (showTagline) {
      doc.setFont('times', 'italic'); doc.setFontSize(11);
      doc.setTextColor(A[0], A[1], A[2]);
      txt(s.tagline, htx, y + 15.5);
    }

    // --- right: Patient No. / Case # right-aligned with wide letter spacing ---
    var hnx = W - M - (showQr ? qrS + 4 : 0);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    txt('Patient No.:', hnx, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    txt(dash(pat.id), hnx, y + 10, { align: 'right', charSpace: 1.4 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    txt('Case #:', hnx, y + 15.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    txt(dash(inv.no || inv.id), hnx, y + 20.5, { align: 'right', charSpace: 1.4 });

    // --- QR 26mm at far right ---
    if (showQr) addImg(qrDataUrl, W - M - qrS, y, qrS, qrS);

    y += headH + 2;

    // --- optional report banner (only when s.reportTitle is set) ---
    if (s.reportTitle) {
      doc.setFillColor(A[0], A[1], A[2]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
      doc.rect(M, y, CW, 8, 'F');
      txt(s.reportTitle, M + CW / 2, y + 5.6, { align: 'center' });
      y += 8 + 2;
    }

    // --- navy divider line; y now sits below the header ---
    doc.setDrawColor(A[0], A[1], A[2]); doc.setLineWidth(0.6);
    doc.line(M, y, W - M, y);
    y += 5;

    /* ----- patient info: 2-column grid (ref: Chughtai report) ----- */
    (function () {
      var pat = d.pat || {}, inv = d.inv || {}, s = d.s || {};
      var docName = d.doc ? d.doc.name : '';

      var ageSex = [pat.age ? pat.age + ' Yr(s)' : '', pat.gender || '']
        .filter(function (x) { return x; }).join(' / ');

      // Reference label set + order. Registration Location = lab head office,
      // Destination Location = main lab (same mapping as reportHtml).
      var left = [
        ['Patient Name',          pat.name],
        ['Father / Husband Name', pat.father || pat.fatherName],
        ['Age / Sex',             ageSex],
        ['Blood Group',           pat.blood || 'Unknown'],
        ['NIC',                   pat.cnic],
        ['Phone',                 pat.phone],
        ['Address',               pat.address]
      ];
      var right = [
        ['Registration Date',     inv.createdAt ? App.dt(inv.createdAt) : ''],
        ['Collect Report At',     d.maxReported ? App.dt(d.maxReported) : ''],
        ['Registration Location', s.headOffice],
        ['Destination Location',  s.mainLab],
        ['Reference',             docName],
        ['Consultant',            docName]
      ];

      var COL_W   = CW / 2;            // 93 mm per column
      var VAL_OFF = 44;               // label -> value offset (matches reference)
      var WRAP_W  = COL_W - VAL_OFF - 2; // value wrap width (~47 mm)
      var LH      = 4.6;              // line height
      var ROW_PAD = 2.4;              // breathing room between rows

      doc.setFontSize(9);
      var rows = Math.max(left.length, right.length);
      for (var i = 0; i < rows; i++) {
        var lLines = left[i]  ? doc.splitTextToSize(dash(left[i][1]),  WRAP_W) : [''];
        var rLines = right[i] ? doc.splitTextToSize(dash(right[i][1]), WRAP_W) : [''];
        var rh = Math.max(lLines.length, rLines.length) * LH + ROW_PAD;
        need(rh);

        if (left[i]) {
          doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
          txt(left[i][0] + ':', M, y);
          doc.setFont('helvetica', 'normal');
          txt(lLines, M + VAL_OFF, y);
        }
        if (right[i]) {
          var rx = M + COL_W;
          doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
          txt(right[i][0] + ':', rx, y);
          doc.setFont('helvetica', 'normal');
          txt(rLines, rx + VAL_OFF, y);
        }
        y += rh;
      }

      /* thin divider rule below the grid (ref: light-grey full-width rule) */
      y += 1.5;
      need(4);
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      y += 5;
    })();

    /* ----- test tables: section title + RESULT box, grey bar, rows ----- */
    (function () {
      var s = d.s || {}, inv = d.inv || {};

      // ---- geometry ----
      var RBW  = 30;                // RESULT box width (~30mm per reference)
      var GREY = [169, 169, 169];   // #A9A9A9 header fill
      var INK  = [20, 20, 20];
      var RED  = [198, 20, 20];     // abnormal value color
      var CX_TEST = M + 2;          // param name column
      var CX_REF  = M + 55;         // NORMAL VALUE column
      var CX_UNIT = M + 84;         // UNIT column
      var RX      = W - M - 2;      // right-aligned result value x
      var LINE    = 4.6;            // row line height

      var showBc = (s.showBarcode !== false);   // default true
      var BOX_H  = showBc ? 24 : 17.5;

      // ---- "15-Jun-2026 14:56" style timestamp ----
      var MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      function p2(n) { return (n < 10 ? '0' : '') + n; }
      function fmtTs(v) {
        var dt = new Date(v);
        if (!v || isNaN(dt.getTime())) return '';
        return p2(dt.getDate()) + '-' + MONS[dt.getMonth()] + '-' + dt.getFullYear() +
               ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes());
      }

      // ---- inline abnormal check: "low - high" refs, also "<x" / ">x" style ----
      // Returns -1 (low), 1 (high), 0 (normal / not parseable).
      function rangeFlag(ref, valStr) {
        var v = parseFloat(String(valStr == null ? '' : valStr).trim());
        if (isNaN(v)) return 0;
        var rs = String(ref == null ? '' : ref).replace(/,/g, '');
        var m = rs.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to|\u2013)\s*(-?\d+(?:\.\d+)?)/i);
        if (m) {
          var lo = parseFloat(m[1]), hi = parseFloat(m[2]);
          if (v < lo) return -1;
          if (v > hi) return 1;
          return 0;
        }
        var m2 = rs.match(/(<=|<|>=|>)\s*(-?\d+(?:\.\d+)?)/);
        if (m2) {
          var b = parseFloat(m2[2]), op = m2[1];
          if ((op === '<' && v >= b) || (op === '<=' && v > b)) return 1;
          if ((op === '>' && v <= b) || (op === '>=' && v < b)) return -1;
          return 0;
        }
        return 0;
      }

      // ---- pseudo-barcode: thin vertical rects derived from the case # chars ----
      function drawBarcode(bx, byy, bw, bh, seed) {
        var str = String(seed == null || seed === '' ? '0000' : seed);
        var bars = [], total = 0, i, c, w, g;
        for (i = 0; i < str.length; i++) {
          c = str.charCodeAt(i);
          w = 0.35 + (((c * 7 + i * 13) % 5) * 0.16);   // 0.35 - 0.99
          g = 0.30 + (((c * 3 + i * 11) % 3) * 0.20);   // 0.30 - 0.70
          bars.push({ w: w, g: g });
          total += w + g;
        }
        var scale = Math.min(1, (bw - 4) / total);
        var x = bx + bw / 2 - (total * scale) / 2;
        doc.setFillColor(INK[0], INK[1], INK[2]);
        for (i = 0; i < bars.length; i++) {
          doc.rect(x, byy, bars[i].w * scale, bh, 'F');
          x += (bars[i].w + bars[i].g) * scale;
        }
      }

      // ---- sub-reference lines for "(See Below)" style params ----
      // Supports p.refLines (array of strings), p.subRefs ([{label,ref}] or
      // strings), or p.refNote (newline-separated string).
      function subRefLines(p) {
        if (p.refLines && p.refLines.length) return p.refLines;
        if (p.subRefs && p.subRefs.length) return p.subRefs.map(function (sr) {
          return typeof sr === 'string' ? sr : ((sr.label ? sr.label + ': ' : '') + (sr.ref || ''));
        });
        if (p.refNote) return String(p.refNote).split(/\n+/).filter(function (l) { return l.trim(); });
        return null;
      }

      // ---- the RESULT box (top-right of each section) ----
      function resultBox(bx, byy, caseNo, tsStr) {
        var cx = bx + RBW / 2, yy = byy + 5.5;
        doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.4);
        doc.rect(bx, byy, RBW, BOX_H);                       // outer border
        doc.setFillColor(GREY[0], GREY[1], GREY[2]);
        doc.rect(bx, byy, RBW, 5.5, 'F');                    // grey RESULT strip
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        txt('RESULT', cx, byy + 3.9, { align: 'center' });
        if (showBc) {
          drawBarcode(bx, yy + 1, RBW, 6.5, caseNo);
          yy += 8.5;
        } else {
          yy += 1.5;
        }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        txt(dash(caseNo), cx, yy + 3.4, { align: 'center' });
        if (tsStr) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
          doc.setTextColor(60, 60, 60);
          txt(tsStr, cx, yy + 7.2, { align: 'center' });
        }
      }

      // ---- grey header bar: TEST | NORMAL VALUE | UNIT ----
      function tableHead() {
        need(9);
        doc.setFillColor(GREY[0], GREY[1], GREY[2]);
        doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.35);
        doc.rect(M, y, CW, 7, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        txt('TEST', CX_TEST, y + 4.8);
        txt('NORMAL VALUE', CX_REF, y + 4.8);
        txt('UNIT', CX_UNIT, y + 4.8);
        y += 7;
      }

      // ---- build one param row (lines pre-wrapped, height pre-computed) ----
      function buildRow(p, vals) {
        var valStr = vals[p.name] != null ? String(vals[p.name]) : '';
        var refStr = p.ref || '—';
        var nameW = CX_REF - CX_TEST - 2;
        var refW  = CX_UNIT - CX_REF - 2;
        var unitW = RX - 36 - CX_UNIT - 2;   // keep clear of right-aligned value
        var nameL = doc.splitTextToSize(p.name || '', Math.max(10, nameW));
        var refL  = doc.splitTextToSize(refStr, Math.max(10, refW));
        var unitL = doc.splitTextToSize(p.unit || '—', Math.max(10, unitW));
        var valL  = valStr ? doc.splitTextToSize(valStr, 34) : [''];
        var n = Math.max(nameL.length, refL.length, unitL.length, valL.length);
        var subs = null, sl = subRefLines(p);
        if (sl) {
          subs = [];
          sl.forEach(function (s) {
            doc.splitTextToSize(s, CW - 6).forEach(function (l) { subs.push(l); });
          });
          if (!subs.length) subs = null;
        }
        return {
          name: nameL, ref: refL, unit: unitL, val: valL, subs: subs,
          abnormal: rangeFlag(refStr, valStr) !== 0,
          rh: n * LINE + 2.5
        };
      }

      // ---- draw one param row: bold name | ref | unit | right-aligned value ----
      // No gridlines. Abnormal values are bold red.
      function tableRow(row) {
        need(row.rh);
        var li;
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        for (li = 0; li < row.name.length; li++) txt(row.name[li], CX_TEST, y + LINE + li * LINE);
        doc.setFont('helvetica', 'normal');
        for (li = 0; li < row.ref.length; li++) txt(row.ref[li], CX_REF, y + LINE + li * LINE);
        for (li = 0; li < row.unit.length; li++) txt(row.unit[li], CX_UNIT, y + LINE + li * LINE);
        if (row.abnormal) { doc.setFont('helvetica', 'bold'); doc.setTextColor(RED[0], RED[1], RED[2]); }
        else { doc.setFont('helvetica', 'bold'); doc.setTextColor(INK[0], INK[1], INK[2]); }
        for (li = 0; li < row.val.length; li++) txt(row.val[li], RX, y + LINE + li * LINE, { align: 'right' });
        y += row.rh;
        if (row.subs && row.subs.length) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          doc.setTextColor(INK[0], INK[1], INK[2]);
          row.subs.forEach(function (s) { txt(s, CX_TEST, y + 4.2); y += 4.2; });
          y += 1;
        }
      }

      /* ----- one section per ready row ----- */
      var caseNo = inv.no || inv.id;

      d.readyRows.forEach(function (r) {
        var test = r.test || {};
        var params = Array.isArray(test.params) ? test.params : [];
        var vals = (r.res && r.res.values) || {};

        // Section title (kept clear of the RESULT box on the right).
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
        var titleLines = doc.splitTextToSize(
          testName(r) + (testCode(r) ? ' (' + testCode(r) + ')' : ''), CW - RBW - 6);
        var titleH = titleLines.length * 6;

        // Build rows up-front so the whole section page-breaks cleanly.
        var rows = params.length
          ? params.map(function (p) { return buildRow(p, vals); })
          : [buildRow({ name: 'Result', ref: '', unit: '' },
                      { Result: vals['Result'] != null ? String(vals['Result']) : '' })];

        var rowsH = rows.reduce(function (a, row) {
          return a + row.rh + (row.subs ? row.subs.length * 4.2 + 1 : 0);
        }, 0);

        var noteLines = null, noteH = 0;
        var tnote = test.note || test.notes || '';
        if (tnote) {
          noteLines = doc.splitTextToSize(String(tnote), CW - 4);
          noteH = 6 + noteLines.length * 4.4;
        }
        var remLines = null, remH = 0;
        if (vals['Remarks']) {
          remLines = doc.splitTextToSize('Remarks: ' + vals['Remarks'], CW - 4);
          remH = remLines.length * 4.4 + 2;
        }

        need(Math.max(titleH, BOX_H) + 2 + 7 + rowsH + noteH + remH + 6);

        // Title (left) + RESULT box (right).
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        titleLines.forEach(function (tl, i) { txt(tl, M, y + 5 + i * 6); });
        resultBox(W - M - RBW, y - 1, caseNo,
                  fmtTs((r.res && r.res.reportedAt) || d.maxReported || inv.createdAt));
        y += Math.max(titleH, BOX_H) + 2;

        // Grey bar + rows.
        tableHead();
        rows.forEach(tableRow);

        // Optional test-level note.
        if (noteLines) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          doc.setTextColor(INK[0], INK[1], INK[2]);
          txt('Note:', M, y + 4.5);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          doc.setTextColor(70, 70, 70);
          txt(noteLines, M, y + 8.9);
          y += noteH;
        }
        // Remarks (existing behavior).
        if (remLines) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          txt(remLines, M, y + 4.5);
          y += remH;
        }
        y += 5;
      });
    })();

    if (d.pendingCount) {
      need(8);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(180, 120, 20);
      txt('Note: ' + d.pendingCount + ' test(s) from this invoice are still pending.', M, y);
      y += 7;
    }
    if (s.footerNote) {
      need(8);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      txt(doc.splitTextToSize(s.footerNote, CW), M, y);
      y += 6;
    }

    // ----- footer: verification note, signatories, address block -----
    need(50);

    // 1) Bold centered verification lines (as in the reference report)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 20, 20);
    var fVerNote = s.verNote || s.verificationNote || 'Electronically verified report. No signatures necessary.';
    var fVerLines = doc.splitTextToSize(fVerNote, CW);
    txt(fVerLines, W / 2, y, { align: 'center' });
    y += fVerLines.length * 4.6 + 1.5;
    txt('Lab reports should be interpreted by a physician in correlation with clinical and radiologic findings.', W / 2, y, { align: 'center' });
    y += 6.5;

    // 2) Thick black rule
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.9);
    doc.line(M, y, W - M, y);
    y += 7;

    // 3) Signatories — spread evenly across the full content width (any count)
    var fSigs = (Array.isArray(s.signatories) ? s.signatories : [])
      .filter(function (g) { return g && (g.name || g.title); });
    if (fSigs.length) {
      var fSw = CW / fSigs.length;      // column width per signatory
      var fSigBlockH = 0;
      fSigs.forEach(function (g, k) {
        var fCx = M + fSw * (k + 0.5);  // column center
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
        txt(g.name || '', fCx, y, { align: 'center' });
        var fSy = y + 4.3;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(105, 105, 105);
        if (g.qual)  { txt(g.qual,  fCx, fSy, { align: 'center' }); fSy += 3.9; }
        if (g.title) { txt(g.title, fCx, fSy, { align: 'center' }); fSy += 3.9; }
        if (fSy - y > fSigBlockH) fSigBlockH = fSy - y;
      });
      y += fSigBlockH + 5;
    } else {
      // Signature lines removed per user request — no fallback
    }

    // 4) Address block — bold, centered (3 lines as in the reference report)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
    var fAddrLines = [];
    fAddrLines.push('Head Office: ' + (s.headOffice || s.address || '—') +
      '    Call Center: ' + (s.callCenter || s.phone || '—'));
    var fMainLine = 'Main Lab: ' + (s.mainLab || '—');
    if (s.mainLabPhone) fMainLine += '   Ph: ' + s.mainLabPhone;
    fAddrLines.push(fMainLine);
    var fContactBits = [];
    if (s.phone)   fContactBits.push('Phone: ' + s.phone);
    if (s.website) fContactBits.push('Web: ' + s.website);
    if (s.email)   fContactBits.push('Email: ' + s.email);
    if (fContactBits.length) fAddrLines.push(fContactBits.join('   '));
    fAddrLines.forEach(function (ln) {
      var fWl = doc.splitTextToSize(ln, CW);
      txt(fWl, W / 2, y, { align: 'center' });
      y += fWl.length * 4.6;
    });
    y += 2;

    // 5) Powered-by line (small grey, centered)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    txt('Powered by System Optix', W / 2, y, { align: 'center' });
    y += 5;

    var dataUri;
    try { dataUri = doc.output('datauristring'); }
    catch (e) { App.toast('Could not build PDF: ' + e.message, 'err'); return null; }
    return { dataUri: dataUri };
  }

  /* ---------- dashboard-style stat cards: shared compact CSS now in app.css ---------- */

  var STAT_CSS = '';

  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var STAT_ICONS = {
    alert: svgIcon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    check: svgIcon('<path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/>'),
    cal: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    clock: svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')
  };

  function statCard(icon, tint, label, value, sub) {
    return '<div class="stat" data-tint="' + tint + '" style="--sc:var(--' + tint + ')">' +
      '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft)">' + icon + '</div>' +
      '<div class="lb">' + App.esc(label) + '</div>' +
      '<div class="vl">' + value + '</div>' +
      '<div class="dl">' + sub + '</div>' +
      '</div>';
  }

  /* ---------- main render ---------- */

  function render() {
    var pendingRows = joinedRows('pending');
    var readyRows = joinedRows('ready');
    var pendingPatientGroups = [];
    var readyPatientGroups = [];

    // ---- dashboard-style stat cards (real data) ----
    var today = App.today();
    var mKey = today.slice(0, 7);
    function dayKey(d) { return String(d || '').slice(0, 10); }
    var reportedToday = readyRows.filter(function (r) { return r.res && dayKey(r.res.reportedAt) === today; }).length;
    var reportedMonth = readyRows.filter(function (r) { return r.res && dayKey(r.res.reportedAt).slice(0, 7) === mKey; }).length;
    var oldestDays = null;
    pendingRows.forEach(function (r) {
      var c = r.invoice && r.invoice.createdAt;
      if (!c) return;
      var d = Math.floor((Date.now() - new Date(c).getTime()) / 86400000);
      if (d < 0) d = 0;
      oldestDays = (oldestDays === null) ? d : Math.max(oldestDays, d);
    });
    var statsHtml = STAT_CSS +
      '<div class="pgstat"><div class="stat-grid">' +
      statCard(STAT_ICONS.alert, 'amber', 'Pending Results', pendingRows.length, 'awaiting entry') +
      statCard(STAT_ICONS.check, 'green', 'Reported Today', reportedToday, 'results completed') +
      statCard(STAT_ICONS.cal, 'blue', 'Reported This Month', reportedMonth, 'this month') +
      statCard(STAT_ICONS.clock, 'brand', 'Oldest Pending', oldestDays === null ? '—' : oldestDays, oldestDays === null ? 'no pending' : 'days old') +
      '</div></div>';

    var q = query.trim().toLowerCase();

    /* ready patient groups count for the tab badge (computed before tabsHtml) */
    var readyGroupsCount = groupByPatient(readyRows).length;

    var tabsHtml =
      '<div class="toolbar" style="margin-bottom:16px;flex-wrap:wrap">' +
        '<input class="input search" id="resSearch" placeholder="Search invoice no / patient..." value="' + App.esc(query) + '" style="max-width:280px;flex:1;min-width:200px">' +
        '<div style="display:flex;gap:8px;margin-left:auto">' +
          '<button class="btn ' + (tab === 'pending' ? 'btn-primary' : 'btn-ghost') + '" data-tab="pending">Pending Entry <span class="badge b-pending" style="margin-left:6px">' + pendingRows.length + '</span></button>' +
          '<button class="btn ' + (tab === 'ready' ? 'btn-primary' : 'btn-ghost') + '" data-tab="ready">Ready Reports <span class="badge b-ready" style="margin-left:6px">' + readyGroupsCount + '</span></button>' +
        '</div>' +
      '</div>';

    var bodyHtml = '';
    if (tab === 'pending') {
      var pgroups = groupByPatient(pendingRows).filter(function (pg) {
        if (!q) return true;
        var p = pg.patient || {};
        var invMatch = pg.rows.some(function (r) { return (r.invoice.no || '').toLowerCase().indexOf(q) > -1; });
        return invMatch ||
               (p.name || '').toLowerCase().indexOf(q) > -1 ||
               (p.phone || '').indexOf(q) > -1 ||
               (p.id || '').toLowerCase().indexOf(q) > -1;
      });
      if (!pgroups.length) {
        bodyHtml = App.empty(query ? 'No pending results match your search.' : 'All caught up — no pending results.');
      } else {
        var prowsHtml = pgroups.map(function (pg, pi) {
          var pat = pg.patient || {};
          var invNos = {};
          pg.rows.forEach(function (r) { invNos[r.invoice.no || r.invoice.id] = true; });
          var testNames = pg.rows.map(function (r) { return testName(r); }).join(', ');
          return '<tr>' +
            '<td><span class="mono">' + App.esc(pat.id || '—') + '</span></td>' +
            '<td><a class="link pt-name" data-patenter="' + pi + '" href="javascript:void(0)"><strong>' + App.esc(pat.name || '—') + '</strong></a></td>' +
            '<td class="muted">' + App.esc([pat.age ? pat.age + ' yrs' : '', pat.gender || ''].filter(Boolean).join(' / ') || '—') + '</td>' +
            '<td class="muted">' + App.esc(pat.phone || '—') + '</td>' +
            '<td class="muted">' + App.esc(Object.keys(invNos).join(', ')) + '</td>' +
            '<td><span class="badge b-pending">' + pg.rows.length + ' pending</span></td>' +
            '<td class="actions"><button class="btn btn-primary btn-sm" data-patenter="' + pi + '">Enter Results</button></td></tr>';
        }).join('');
        // stash for the click handlers below
        pendingPatientGroups = pgroups;
        bodyHtml =
          '<div class="card"><div class="card-b">' +
          '<div class="tbl-wrap"><table class="table"><thead><tr>' +
          '<th>Patient ID</th><th>Patient Name</th><th>Age / Gender</th><th>Phone</th><th>Invoice(s)</th><th>Status</th><th></th>' +
          '</tr></thead><tbody>' + prowsHtml + '</tbody></table></div>' +
          '</div></div>';
      }
    } else {
      var rpgroups = groupByPatient(readyRows).filter(function (pg) {
        if (!q) return true;
        var p = pg.patient || {};
        var invMatch = pg.rows.some(function (r) { return (r.invoice.no || '').toLowerCase().indexOf(q) > -1; });
        return invMatch ||
               (p.name || '').toLowerCase().indexOf(q) > -1 ||
               (p.phone || '').indexOf(q) > -1 ||
               (p.id || '').toLowerCase().indexOf(q) > -1;
      });
      if (!rpgroups.length) {
        bodyHtml = App.empty(query ? 'No ready reports match your search.' : 'No ready reports yet.');
      } else {
        var rprowsHtml = rpgroups.map(function (pg, pi) {
          var pat = pg.patient || {};
          // group this patient's ready rows by invoice for per-report actions
          var invMap = {}, invOrder = [];
          pg.rows.forEach(function (r) {
            var iid = r.invoice.id;
            if (!invMap[iid]) { invMap[iid] = { invoice: r.invoice, rows: [], maxRep: '' }; invOrder.push(iid); }
            invMap[iid].rows.push(r);
            if (r.res && r.res.reportedAt && r.res.reportedAt > invMap[iid].maxRep) invMap[iid].maxRep = r.res.reportedAt;
          });
          var invCells = invOrder.map(function (iid) {
            return '<span class="mono">' + App.esc(invMap[iid].invoice.no || iid) + '</span>';
          }).join('<br>');
          var testCount = pg.rows.length;
          var lastRep = '';
          pg.rows.forEach(function (r) { if (r.res && r.res.reportedAt && r.res.reportedAt > lastRep) lastRep = r.res.reportedAt; });
          var actHtml = invOrder.map(function (iid) {
            var inv = invMap[iid].invoice;
            /* check if patient has an older report for comparison */
            var hasOld = false, oldInvId = null;
            try {
              var allInvs = DB.all('invoices')
                .filter(function (x) {
                  return x.patientId === pat.id && x.id !== iid &&
                    joinedRows('ready').some(function (r) { return r.invoice.id === x.id; });
                })
                .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
              if (allInvs.length) { hasOld = true; oldInvId = allInvs[0].id; }
            } catch (e) {}
            var cmpBtn = hasOld
              ? ' <button class="btn btn-ghost btn-sm" data-rcmp="' + App.esc(inv.id) + '|' + App.esc(oldInvId) + '" style="background:#e3f2fd;color:#1565c0;border:1px solid #bbdefb">⇄ Compare</button>'
              : '';
            return '<div style="margin-bottom:4px;white-space:nowrap">' +
              '<button class="btn btn-ghost btn-sm" data-rview="' + App.esc(inv.id) + '">View</button> ' +
              '<button class="btn btn-primary btn-sm" data-rprint="' + App.esc(inv.id) + '">' + PRINT_ICON + ' Print</button>' + cmpBtn + '</div>';
          }).join('');
          return '<tr>' +
            '<td><span class="mono">' + App.esc(pat.id || '—') + '</span></td>' +
            '<td><a class="link" data-rviewfirst="' + pi + '" href="javascript:void(0)"><strong>' + App.esc(pat.name || '—') + '</strong></a></td>' +
            '<td class="muted">' + App.esc([pat.age ? pat.age + ' yrs' : '', pat.gender || ''].filter(Boolean).join(' / ') || '—') + '</td>' +
            '<td class="muted">' + App.esc(pat.phone || '—') + '</td>' +
            '<td>' + invCells + '</td>' +
            '<td><span class="badge b-ready">' + testCount + ' done</span></td>' +
            '<td class="muted">' + App.esc(lastRep ? App.dt(lastRep) : '—') + '</td>' +
            '<td class="actions">' + actHtml + '</td></tr>';
        }).join('');
        readyPatientGroups = rpgroups;
        bodyHtml =
          '<div class="card"><div class="card-b">' +
          '<div class="tbl-wrap"><table class="table"><thead><tr>' +
          '<th>Patient ID</th><th>Patient Name</th><th>Age / Gender</th><th>Phone</th><th>Invoice(s)</th><th>Status</th><th>Reported</th><th></th>' +
          '</tr></thead><tbody>' + rprowsHtml + '</tbody></table></div>' +
          '</div></div>';
      }
    }

    var v = document.getElementById('view');
    v.innerHTML =
      statsHtml + tabsHtml + bodyHtml;

    // wire tabs
    v.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); });
    });
    // wire search (keep focus, don't full re-render on each keystroke)
    var si = document.getElementById('resSearch');
    si.addEventListener('input', function () { query = si.value; render(); var n = document.getElementById('resSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    // wire patient-name / Enter Results buttons (pending tab) → bulk entry form
    v.querySelectorAll('[data-patenter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pg = pendingPatientGroups[+b.getAttribute('data-patenter')];
        if (pg && pg.rows.length) openBulkEntry(pg.patient || {}, pg.rows);
      });
    });
    // wire view/print (ready tab patient list)
    v.querySelectorAll('[data-rview]').forEach(function (b) {
      b.addEventListener('click', function () { viewReport(b.getAttribute('data-rview')); });
    });
    v.querySelectorAll('[data-rprint]').forEach(function (b) {
      b.addEventListener('click', function () { printReportChoice(b.getAttribute('data-rprint')); });
    });
    v.querySelectorAll('[data-rcmp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var ids = (b.getAttribute('data-rcmp') || '').split('|');
        if (ids.length === 2) compareReports(ids[1], ids[0]);
      });
    });
    v.querySelectorAll('[data-rviewfirst]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pg = readyPatientGroups[+b.getAttribute('data-rviewfirst')];
        if (pg && pg.rows.length) viewReport(pg.rows[0].invoice.id);
      });
    });
  }

  App.route('#/results', render);

  /* exposed so the Reports page "Finalized Patient Reports" archive can view/print */
  App.viewLabReport = viewReport;
  App.printLabReport = printReportChoice;
  /* exposed so the Patient Profile page can enter results directly */
  App.enterLabResult = openEntry;

  /* ---- report comparison: 2 invoices side by side with auto-diff ---- */
  function compareReports(invId1, invId2) {
    var d1 = reportData(invId1), d2 = reportData(invId2);
    if (!d1 || !d2) { App.toast('Both reports need ready results to compare', 'err'); return; }
    var s = d1.s || {};
    /* index results by testId -> param name -> value */
    function indexResults(d) {
      var map = {};
      (d.readyRows || []).forEach(function (r) {
        var tid = (r.item && (r.item.testId || r.item.id)) || '';
        var tname = (r.item && r.item.name) || (r.test && r.test.name) || tid;
        var params = (r.test && r.test.params) || [];
        var vals = (r.res && r.res.values) || {};
        if (!map[tid]) map[tid] = { name: tname, params: {} };
        params.forEach(function (p) {
          map[tid].params[p.name] = { val: vals[p.name] || '—', unit: p.unit || '', ref: p.ref || '' };
        });
      });
      return map;
    }
    var m1 = indexResults(d1), m2 = indexResults(d2);
    var allTids = [];
    Object.keys(m1).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });
    Object.keys(m2).forEach(function (k) { if (allTids.indexOf(k) < 0) allTids.push(k); });

    function numVal(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
    function trend(v1, v2) {
      var n1 = numVal(v1), n2 = numVal(v2);
      if (n1 === null || n2 === null || v1 === '—' || v2 === '—') return '';
      if (n2 > n1) return ' <span style="color:#c00;font-weight:700">↑</span>';
      if (n2 < n1) return ' <span style="color:#c00;font-weight:700">↓</span>';
      return ' <span style="color:#090">=</span>';
    }

    var rowsHtml = '';
    allTids.forEach(function (tid) {
      var t1 = m1[tid], t2 = m2[tid];
      var tname = (t1 && t1.name) || (t2 && t2.name) || tid;
      rowsHtml += '<tr><td colspan="5" style="background:#eef;font-weight:800;padding:8px">' + App.esc(tname) + '</td></tr>';
      var pnames = [];
      [t1, t2].forEach(function (t) {
        if (t) Object.keys(t.params).forEach(function (pn) { if (pnames.indexOf(pn) < 0) pnames.push(pn); });
      });
      pnames.forEach(function (pn) {
        var p1 = t1 && t1.params[pn], p2 = t2 && t2.params[pn];
        var v1 = p1 ? p1.val : '—', v2 = p2 ? p2.val : '—';
        var ref = (p1 && p1.ref) || (p2 && p2.ref) || '', unit = (p1 && p1.unit) || (p2 && p2.unit) || '';
        var changed = v1 !== v2 && v1 !== '—' && v2 !== '—';
        var valStyle = changed ? ' style="color:#c00;font-weight:800"' : '';
        rowsHtml += '<tr' + (changed ? ' style="background:#fff8e1"' : '') + '>' +
          '<td>' + App.esc(pn) + '</td>' +
          '<td class="muted">' + App.esc(ref) + '</td>' +
          '<td class="muted">' + App.esc(unit) + '</td>' +
          '<td' + valStyle + '><strong>' + App.esc(v1) + '</strong></td>' +
          '<td' + valStyle + '><strong>' + App.esc(v2) + '</strong>' + trend(v1, v2) + '</td></tr>';
      });
    });

    var html =
      '<div style="font-family:inherit;max-width:900px;margin:0 auto">' +
      '<h2 style="text-align:center">Report Comparison</h2>' +
      '<p style="text-align:center" class="muted">' + App.esc(d1.pat.name || '') + ' — ' +
      App.esc(d1.inv.no) + ' (' + App.d(d1.inv.createdAt) + ') vs ' +
      App.esc(d2.inv.no) + ' (' + App.d(d2.inv.createdAt) + ')</p>' +
      '<table class="table"><thead><tr><th>Parameter</th><th>Normal Value</th><th>Unit</th>' +
      '<th>' + App.esc(d1.inv.no) + '<br><span class="muted">' + App.d(d1.inv.createdAt) + '</span></th>' +
      '<th>' + App.esc(d2.inv.no) + '<br><span class="muted">' + App.d(d2.inv.createdAt) + '</span></th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      '<p class="muted" style="font-size:12px">↑ increased &nbsp; ↓ decreased &nbsp; = unchanged &nbsp; highlighted rows differ between reports</p>' +
      '<div style="text-align:center;margin-top:16px"><button class="btn btn-primary" id="cmpPrint">Print Comparison</button></div>' +
      '</div>';
    App.modal('Compare Reports', html, { wide: true, onOpen: function (ov, close) {
      ov.querySelector('#cmpPrint').addEventListener('click', function () {
        App.print('Report Comparison — ' + (d1.pat.name || ''), html, { noHeader: true });
      });
    }});
  }
  App.compareReports = compareReports;
  /* exposed for Lab Profile preview QR */
  App.qrDataUrlFor = qrDataUrlFor;
  /* sample report preview for Lab Profile settings (uses provided settings, not DB) */
  /* sample report preview for Lab Profile settings (uses provided settings, not DB).
     Redesigned demo (worker 18/20): Chughtai-like data exercising the new
     features — 3 tests in 2 categories (department dividers), 1 abnormal
     value (Hemoglobin 11.8 g/dL vs 13.0-17.0, auto-detected), 1 per-test
     Note. `s` passes through untouched so every new setting key flows to
     reportHtml. */
  App.sampleReportPreview = function (s) {
    s = s || {};
    var now = new Date().toISOString();

    var sampleRows = [
      {
        item: { name: 'Complete Blood Count', code: 'CBC', testId: 'sample1' },
        test: {
          /* category -> department divider (worker 05 sections convention) */
          category: 'Haematology',
          params: [
            { name: 'Hemoglobin', unit: 'g/dL', ref: '13.0 – 17.0', type: 'number' },
            { name: 'WBC Count', unit: '/µL', ref: '4,000 – 11,000', type: 'number' },
            { name: 'Platelets', unit: '/µL', ref: '150,000 – 400,000', type: 'number' }
          ]
        },
        res: {
          values: { 'Hemoglobin': '11.8', 'WBC Count': '7,500', 'Platelets': '250,000' },
          /* Abnormal demo: 11.8 g/dL is below the 13.0–17.0 reference range;
             the report auto-detects it from value + ref (flags kept as hook). */
          flags: { 'Hemoglobin': 'L' }
        },
        invoice: { id: 'preview', no: 'INV-0042' }
      },
      {
        item: { name: 'Serum Electrolytes', code: 'ELEC', testId: 'sample2' },
        test: {
          /* second category -> second department divider */
          category: 'Chemical Pathology',
          /* per-test note (worker 05 testNoteHtml convention: "Note:" block) */
          note: 'Serum electrolytes should always be interpreted in the light of the clinical findings.',
          params: [
            { name: 'Sodium', unit: 'mmol/L', ref: '135 – 145', type: 'number' },
            { name: 'Potassium', unit: 'mmol/L', ref: '3.5 – 5.5', type: 'number' },
            { name: 'Chloride', unit: 'mmol/L', ref: '98 – 107', type: 'number' }
          ]
        },
        res: { values: { 'Sodium': '140', 'Potassium': '4.2', 'Chloride': '103' } },
        invoice: { id: 'preview', no: 'INV-0042' }
      },
      {
        item: { name: 'Blood Sugar (Fasting)', code: 'BSF', testId: 'sample3' },
        test: {
          /* same category as above -> no extra divider; groups under it */
          category: 'Chemical Pathology',
          params: [
            { name: 'Glucose', unit: 'mg/dL', ref: '70 – 100', type: 'number' }
          ]
        },
        res: { values: { 'Glucose': '92' } },
        invoice: { id: 'preview', no: 'INV-0042' }
      }
    ];

    return reportHtml({
      inv: { id: 'preview', no: 'INV-0042', createdAt: now },
      pat: {
        id: 'P-10042', name: 'Muhammad Ahmad Khan', father: 'Muhammad Ashfaq Khan',
        age: 42, gender: 'Male', blood: 'B+', cnic: '35202-3456789-1',
        phone: '0301-4567890', address: 'House 14, Block C, Johar Town, Lahore'
      },
      s: s, /* pass-through: all new settings keys flow to reportHtml */
      doc: { name: 'Dr. Ayesha Raza' },
      readyRows: sampleRows,
      pendingCount: 0,
      maxReported: now
    });
  };
})();
