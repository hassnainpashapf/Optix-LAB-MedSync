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
          '<textarea class="input" data-bfree="' + ti + '" rows="4" placeholder="Type the test result here...">' + App.esc(ft) + '</textarea></div>';
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
        '<div class="form-grid" style="margin-top:12px"><div>' +
        '<label class="label">Remarks (optional)</label>' +
        '<input class="input" id="resRemarks" value="' + App.esc(existing['Remarks'] || '') + '" placeholder="e.g. Sample hemolyzed, repeat advised">' +
        '</div></div>';
    } else {
      var ft = existing['Result'] != null ? String(existing['Result']) : '';
      body =
        '<div class="form-grid"><div>' +
        '<label class="label">Result</label>' +
        '<textarea class="input" id="resFree" rows="6" placeholder="Type the test result here...">' + App.esc(ft) + '</textarea>' +
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
    return {
      inv: inv,
      pat: patOf(inv.patientId),
      s: DB.get('settings', 'main') || {},
      doc: inv.doctorId ? DB.get('doctors', inv.doctorId) : null,
      readyRows: readyRows,
      pendingCount: pendingCount,
      maxReported: maxReported
    };
  }

  function reportHtml(d, opts) {
    var inv = d.inv || {}, pat = d.pat || {}, s = d.s || {};
    var readyRows = d.readyRows || [], pendingCount = d.pendingCount || 0;
    var doc = d.doc || null;
    var docName = doc ? doc.name : '';
    var noLabHeader = !!(opts && opts.noLabHeader);

    /* ---------- header: lab logo + info left, patient/case/QR right ---------- */
    var addrLine = [s.address, s.phone, s.email].filter(function (x) { return x; }).join(' • ');
    var headHtml =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:12px;margin-bottom:10px;border-bottom:2px solid #131845">' +
        '<div style="display:flex;gap:12px;align-items:flex-start;min-width:0">' +
          (s.logo ? '<img src="' + App.esc(s.logo) + '" style="width:54px;height:54px;object-fit:contain;flex:none" alt="">' : '') +
          '<div style="min-width:0">' +
            '<h1 style="margin:0;color:#131845;font-size:22px">' + App.esc(s.labName || 'Optix LAB MedSync') + '</h1>' +
            (s.tagline ? '<div style="color:#555;font-size:12px">' + App.esc(s.tagline) + '</div>' : '') +
            (addrLine ? '<div style="color:#555;font-size:11px">' + App.esc(addrLine) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;flex:none">' +
          '<div style="font-size:12px;font-weight:700">Patient No.:</div>' +
          '<div style="font-size:12px;margin:2px 0 6px">' + App.esc(pat.id || '—') + '</div>' +
          '<div style="font-size:12px;font-weight:700">Case #:</div>' +
          '<div style="font-size:12px;margin:2px 0 6px">' + App.esc(inv.no || inv.id || '—') + '</div>' +
          '<img data-qr="1" style="width:110px;height:110px" alt="">' +
        '</div>' +
      '</div>';

    /* ---------- patient info: 2 columns ---------- */
    var ageSex = [pat.age ? pat.age + ' Yr(s)' : '', pat.gender || ''].filter(function (x) { return x; }).join(' / ');
    var prow = function (k, v) {
      return '<div style="display:flex;gap:10px;padding:3px 0;font-size:12.5px">' +
        '<span style="font-weight:700;flex:none;min-width:170px">' + k + ':</span>' +
        '<span>' + App.esc(v == null || v === '' ? '—' : String(v)) + '</span></div>';
    };
    var infoHtml =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 40px;margin:4px 0 6px">' +
        '<div>' +
          prow('Patient Name', pat.name) +
          prow('Father / Husband Name', pat.father) +
          prow('Age / Sex', ageSex) +
          prow('Blood Group', pat.blood || 'Unknown') +
          prow('NIC', pat.cnic) +
          prow('Phone', pat.phone) +
          prow('Address', pat.address) +
        '</div>' +
        '<div>' +
          prow('Registration Date', inv.createdAt ? App.dt(inv.createdAt) : '') +
          prow('Collect Report At', d.maxReported ? App.dt(d.maxReported) : '') +
          prow('Registration Location', s.headOffice) +
          prow('Destination Location', s.mainLab) +
          prow('Reference', docName) +
          prow('Consultant', docName) +
        '</div>' +
      '</div>' +
      '<hr style="border:none;border-top:1px solid #ccc;margin:8px 0 4px">';

    /* ---------- test tables: TEST | NORMAL VALUE | UNIT | RESULT ---------- */
    var testsHtml = readyRows.map(function (r) {
      var test = r.test;
      var params = (test && Array.isArray(test.params)) ? test.params : [];
      var vals = (r.res && r.res.values) || {};
      var bodyRows;
      if (params.length) {
        bodyRows = params.map(function (p) {
          return '<tr><td>' + App.esc(p.name) + '</td>' +
            '<td>' + App.esc(p.ref || '—') + '</td>' +
            '<td>' + App.esc(p.unit || '—') + '</td>' +
            '<td><strong>' + App.esc(vals[p.name] != null ? String(vals[p.name]) : '') + '</strong></td></tr>';
        }).join('');
        if (vals['Remarks']) {
          bodyRows += '<tr><td colspan="4"><em>Remarks: ' + App.esc(vals['Remarks']) + '</em></td></tr>';
        }
      } else {
        bodyRows = '<tr><td>Result</td><td>—</td><td>—</td><td><strong>' +
          App.esc(vals['Result'] != null ? String(vals['Result']) : '') + '</strong></td></tr>';
      }
      return '<h3 style="margin:18px 0 6px;font-size:15px">' + App.esc(testName(r)) +
        (testCode(r) ? ' <span style="color:#64748b;font-weight:500">(' + App.esc(testCode(r)) + ')</span>' : '') + '</h3>' +
        '<table class="table"><thead><tr><th>TEST</th><th>NORMAL VALUE</th><th>UNIT</th><th>RESULT</th></tr></thead>' +
        '<tbody>' + bodyRows + '</tbody></table>';
    }).join('');

    /* ---------- footer: verification note, signatories, address block ---------- */
    var verNote = s.verNote || s.verificationNote || 'Electronically verified report. No signatures necessary.';
    var sigs = (Array.isArray(s.signatories) ? s.signatories : []).filter(function (g) { return g && (g.name || g.qual || g.title); });
    var sigHtml;
    if (sigs.length) {
      sigHtml = '<div style="display:flex;justify-content:space-between;gap:10px;border-top:2px solid #111;margin-top:22px;padding-top:14px">' +
        sigs.map(function (g) {
          return '<div style="flex:1;text-align:center">' +
            '<div style="font-weight:800;font-size:12.5px">' + App.esc(g.name || '') + '</div>' +
            (g.qual ? '<div style="font-size:10.5px;color:#444">' + App.esc(g.qual) + '</div>' : '') +
            (g.title ? '<div style="font-size:10.5px;color:#444">' + App.esc(g.title) + '</div>' : '') +
          '</div>';
        }).join('') + '</div>';
    } else {
      sigHtml = '<div style="display:flex;justify-content:space-between;margin-top:40px">' +
        '<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #0f1e2e;padding-top:6px;font-size:12px">Lab Technologist</div></div>' +
        '<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #0f1e2e;padding-top:6px;font-size:12px">Pathologist</div></div>' +
      '</div>';
    }
    var ab = [];
    if (s.headOffice) ab.push('<div><strong>Head Office:</strong> ' + App.esc(s.headOffice) + (s.callCenter ? ' &nbsp;<strong>Call Center:</strong> ' + App.esc(s.callCenter) : '') + '</div>');
    if (s.mainLab) ab.push('<div><strong>Main Lab:</strong> ' + App.esc(s.mainLab) + (s.mainLabPhone ? ' &nbsp;<strong>Ph:</strong> ' + App.esc(s.mainLabPhone) : '') + '</div>');
    var abLast = [s.phone ? 'Phone: ' + App.esc(s.phone) : '', s.website ? 'Web: ' + App.esc(s.website) : '', s.email ? 'Email: ' + App.esc(s.email) : ''].filter(function (x) { return x; }).join(' &nbsp; ');
    if (abLast) ab.push('<div>' + abLast + '</div>');
    var addrHtml = ab.length ? '<div style="text-align:center;font-size:12px;margin-top:16px;line-height:1.8">' + ab.join('') + '</div>' : '';

    var headOut = noLabHeader ? '' : (s.headerHtml ? s.headerHtml : headHtml);
    var footOut = s.footerHtml ? s.footerHtml :
      '<p style="text-align:center;font-weight:700;font-size:12.5px;margin:22px 0 0">' + App.esc(verNote) + '</p>' +
      sigHtml + addrHtml +
      '<p style="color:#999;font-size:11px;text-align:center;margin:14px 0 0">Powered by System Optix</p>';

    return headOut + infoHtml + testsHtml +
      (pendingCount ? '<p style="color:#d97706"><em>Note: ' + pendingCount + ' test(s) from this invoice are still pending.</em></p>' : '') +
      (s.footerNote ? '<p style="color:#64748b;margin-top:18px;margin-bottom:4px"><em>' + App.esc(s.footerNote) + '</em></p>' : '') +
      footOut;
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
    return String(html).replace(/<img[^>]*data-qr="1"[^>]*>/, '');
  }

  async function printReport(invoiceId, opts) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results to print', 'err'); return; }
    var invPaid = d.inv && d.inv.status === 'paid';
    var qrImg = null, noQrReason = null;
    try {
      var jsOk = await App.ensureJsPDF();
      if (jsOk) {
        var url = await getReportPdfUrl(invoiceId);
        if (url) qrImg = qrDataUrlFor(url);
        else noQrReason = invPaid ? 'upload failed' : 'payment pending — QR activates when paid';
      } else noQrReason = 'upload failed';
    } catch (e) { noQrReason = 'upload failed'; }
    var html = reportHtml(d, opts);
    if (qrImg) html = html.replace('data-qr="1"', 'data-qr="1" src="' + qrImg + '"');
    else html = stripQrImg(html);
    if (noQrReason) App.toast('Report printed without QR (' + noQrReason + ')', invPaid ? 'err' : 'info');
    App.print('Lab Report — ' + d.inv.no, html, { noHeader: true });
  }

  /* print choice dialog: with or without the lab letterhead header */
  function printReportChoice(invoiceId) {
    App.modal('Print Report',
      '<p style="margin-bottom:16px">Print this report with or without the lab header?</p>' +
      '<div style="display:flex;gap:12px">' +
      '<button class="btn btn-primary" id="prWithHead" style="flex:1;padding:14px">With Header</button>' +
      '<button class="btn btn-ghost" id="prNoHead" style="flex:1;padding:14px">Without Header</button>' +
      '</div>' +
      '<p class="muted" style="margin-top:12px;font-size:12px;margin-bottom:0">Use "Without Header" when printing on pre-printed letterhead paper.</p>',
      { onOpen: function (ov, close) {
          ov.querySelector('#prWithHead').addEventListener('click', function () { close(); printReport(invoiceId, {}); });
          ov.querySelector('#prNoHead').addEventListener('click', function () { close(); printReport(invoiceId, { noLabHeader: true }); });
        }
      });
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
    function txt(t, x, yy, opts) { doc.text(String(t == null ? '' : t), x, yy, opts || {}); }
    function dash(v) { return (v == null || v === '') ? '—' : String(v); }
    function addImg(dataUrl, x, yy, w, h) {
      try {
        var fmt = /image\/png/i.test(dataUrl) ? 'PNG' : (/image\/gif/i.test(dataUrl) ? 'GIF' : 'JPEG');
        doc.addImage(dataUrl, fmt, x, yy, w, h);
        return true;
      } catch (e) { return false; }
    }

    /* ----- header: logo + lab (left), patient/case nos + QR (right) ----- */
    var qrS = 26;
    if (s.logo) addImg(s.logo, M, y, 15, 15);
    var tx = M + (s.logo ? 19 : 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(27, 27, 110);
    txt(s.labName || 'Optix LAB MedSync', tx, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70, 70, 70);
    var ty = y + 11;
    if (s.tagline) { txt(s.tagline, tx, ty); ty += 4.5; }
    var sub = [s.address, s.phone, s.email].filter(function (x) { return x; }).join('  •  ');
    if (sub) { doc.setFontSize(8); doc.setTextColor(120, 120, 120); txt(doc.splitTextToSize(sub, 105)[0], tx, ty); }
    if (qrDataUrl) addImg(qrDataUrl, W - M - qrS, y, qrS, qrS);
    var nx = W - M - qrS - 3;
    doc.setFontSize(9); doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold'); txt('Patient No.:', nx, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal'); txt(dash(pat.id), nx, y + 8.5, { align: 'right' });
    doc.setFont('helvetica', 'bold'); txt('Case #:', nx, y + 14, { align: 'right' });
    doc.setFont('helvetica', 'normal'); txt(dash(inv.no || inv.id), nx, y + 18.5, { align: 'right' });
    y += qrS + 3;
    doc.setDrawColor(19, 24, 69); doc.setLineWidth(0.7);
    doc.line(M, y, W - M, y); y += 6;

    /* ----- patient info: two columns ----- */
    var ageSex = (pat.age ? pat.age + ' Yr(s)' : '') + (pat.gender ? (pat.age ? ' / ' : '') + pat.gender : '');
    var left = [
      ['Patient Name', pat.name],
      ['Father / Husband Name', pat.father || pat.fatherName],
      ['Age / Sex', ageSex],
      ['Blood Group', pat.blood || 'Unknown'],
      ['NIC', pat.cnic],
      ['Phone', pat.phone],
      ['Address', pat.address]
    ];
    var right = [
      ['Registration Date', App.dt(inv.createdAt)],
      ['Reported At', d.maxReported ? App.dt(d.maxReported) : null],
      ['Referred By', d.doc ? d.doc.name : 'Self'],
      ['Email', pat.email],
      ['City', pat.city],
      ['Tests', d.readyRows.length + (d.pendingCount ? ' (' + d.pendingCount + ' pending)' : '')]
    ];
    var rows = Math.max(left.length, right.length);
    for (var i = 0; i < rows; i++) {
      var lL = left[i] ? doc.splitTextToSize(dash(left[i][1]), 50) : [''];
      var rL = right[i] ? doc.splitTextToSize(dash(right[i][1]), 50) : [''];
      var hgt = Math.max(lL.length, rL.length) * 4.4 + 1.4;
      need(hgt);
      if (left[i]) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
        txt(left[i][0] + ':', M, y);
        doc.setFont('helvetica', 'normal');
        txt(lL, M + 36, y);
      }
      if (right[i]) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
        txt(right[i][0] + ':', M + CW / 2, y);
        doc.setFont('helvetica', 'normal');
        txt(rL, M + CW / 2 + 36, y);
      }
      y += hgt;
    }
    y += 2;
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y); y += 6;

    /* ----- test tables: TEST | NORMAL VALUE | UNIT | RESULT ----- */
    var COLS = [64, 58, 28, 32]; // sums to 182 = CW
    function tableHead() {
      need(9);
      doc.setFillColor(154, 160, 166); doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.rect(M, y, CW, 7, 'F');
      var heads = ['TEST', 'NORMAL VALUE', 'UNIT', 'RESULT'], x = M;
      heads.forEach(function (h, k) {
        if (k === 3) txt(h, x + COLS[k] - 2, y + 4.8, { align: 'right' });
        else txt(h, x + 2, y + 4.8);
        x += COLS[k];
      });
      y += 7;
    }
    function tableRow(cells) {
      doc.setFontSize(9);
      var lines = cells.map(function (c, k) { return doc.splitTextToSize(String(c == null ? '' : c), COLS[k] - 4); });
      var rh = Math.max.apply(null, lines.map(function (l) { return l.length; })) * 4.4 + 2.5;
      need(rh);
      var x = M;
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.25);
      doc.rect(M, y, CW, rh);
      lines.forEach(function (ln, k) {
        doc.setFont('helvetica', (k === 0 || k === 3) ? 'bold' : 'normal');
        doc.setTextColor(20, 20, 20);
        if (k === 3) txt(ln, x + COLS[k] - 2, y + 4.6, { align: 'right' });
        else txt(ln, x + 2, y + 4.6);
        x += COLS[k];
      });
      var sx = M;
      for (var k = 0; k < 3; k++) { sx += COLS[k]; doc.line(sx, y, sx, y + rh); }
      y += rh;
    }

    d.readyRows.forEach(function (r) {
      var test = r.test;
      var params = (test && Array.isArray(test.params)) ? test.params : [];
      var vals = (r.res && r.res.values) || {};
      need(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(20, 20, 20);
      txt(doc.splitTextToSize(testName(r) + (testCode(r) ? ' (' + testCode(r) + ')' : ''), CW)[0], M, y);
      y += 6;
      tableHead();
      if (params.length) {
        params.forEach(function (p) {
          tableRow([p.name, p.ref || '—', p.unit || '—', vals[p.name] != null ? String(vals[p.name]) : '']);
        });
        if (vals['Remarks']) {
          need(8);
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(100, 100, 100);
          txt('Remarks: ' + vals['Remarks'], M, y + 4.5); y += 7;
        }
      } else {
        tableRow(['Result', '—', '—', vals['Result'] != null ? String(vals['Result']) : '']);
      }
      y += 4;
    });

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

    /* ----- footer: verification note, signatories, address block ----- */
    need(42);
    doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.6);
    doc.line(M, y, W - M, y); y += 6;
    var verNote = s.verNote || s.verificationNote || 'Electronically verified report. No signatures necessary.';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
    txt(verNote, W / 2, y, { align: 'center' }); y += 5;
    txt('Lab reports should be interpreted by a physician in correlation with clinical and radiologic findings.', W / 2, y, { align: 'center' }); y += 9;
    var sigs = (Array.isArray(s.signatories) ? s.signatories : []).filter(function (g) { return g && (g.name || g.title); });
    if (sigs.length) {
      var sw = CW / sigs.length;
      sigs.forEach(function (g, k) {
        var cx = M + sw * (k + 0.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
        txt(g.name || '', cx, y, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
        var sy = y + 4;
        if (g.qual) { txt(g.qual, cx, sy, { align: 'center' }); sy += 3.8; }
        if (g.title) { txt(g.title, cx, sy, { align: 'center' }); }
      });
      y += 14;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
      doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.3);
      doc.line(M, y, M + 52, y); doc.line(W - M - 52, y, W - M, y);
      txt('Lab Technologist', M + 26, y + 5, { align: 'center' });
      txt('Pathologist', W - M - 26, y + 5, { align: 'center' });
      y += 11;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
    txt('Head Office: ' + (s.headOffice || s.address || '—') + '    Call Center: ' + (s.callCenter || s.phone || '—'), W / 2, y, { align: 'center' }); y += 4.5;
    var ab2 = [];
    if (s.mainLab) ab2.push('Main Lab: ' + s.mainLab);
    if (s.mainLabPhone) ab2.push('Ph: ' + s.mainLabPhone);
    if (s.phone) ab2.push('Phone: ' + s.phone);
    if (s.website) ab2.push('Web: ' + s.website);
    if (s.email) ab2.push('Email: ' + s.email);
    if (ab2.length) { txt(ab2.join('   '), W / 2, y, { align: 'center' }); y += 5; }
    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    txt('Powered by System Optix', W / 2, y, { align: 'center' });

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

    var tabsHtml =
      '<div class="toolbar" style="margin-bottom:16px;flex-wrap:wrap">' +
        '<input class="input search" id="resSearch" placeholder="Search invoice no / patient..." value="' + App.esc(query) + '" style="max-width:280px;flex:1;min-width:200px">' +
        '<div style="display:flex;gap:8px;margin-left:auto">' +
          '<button class="btn ' + (tab === 'pending' ? 'btn-primary' : 'btn-ghost') + '" data-tab="pending">Pending Entry <span class="badge b-pending" style="margin-left:6px">' + pendingRows.length + '</span></button>' +
          '<button class="btn ' + (tab === 'ready' ? 'btn-primary' : 'btn-ghost') + '" data-tab="ready">Ready Reports <span class="badge b-ready" style="margin-left:6px">' + readyGroups.length + '</span></button>' +
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
            return '<div style="margin-bottom:4px;white-space:nowrap">' +
              '<button class="btn btn-ghost btn-sm" data-rview="' + App.esc(inv.id) + '">View</button> ' +
              '<button class="btn btn-primary btn-sm" data-rprint="' + App.esc(inv.id) + '">' + PRINT_ICON + ' Print</button></div>';
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
  /* sample report preview for Lab Profile settings (uses provided settings, not DB) */
  App.sampleReportPreview = function (s) {
    s = s || {};
    var now = new Date().toISOString();
    var sampleRows = [
      {
        item: { name: 'Complete Blood Count', code: 'CBC', testId: 'sample1' },
        test: { params: [
          { name: 'Hemoglobin', unit: 'g/dL', ref: '13.0 – 17.0', type: 'number' },
          { name: 'WBC Count', unit: '/µL', ref: '4,000 – 11,000', type: 'number' },
          { name: 'Platelets', unit: '/µL', ref: '150,000 – 400,000', type: 'number' }
        ] },
        res: { values: { 'Hemoglobin': '14.2', 'WBC Count': '7,500', 'Platelets': '250,000' } },
        invoice: { id: 'preview', no: 'INV-0001' }
      },
      {
        item: { name: 'Blood Sugar (Fasting)', code: 'BSF', testId: 'sample2' },
        test: { params: [
          { name: 'Glucose', unit: 'mg/dL', ref: '70 – 100', type: 'number' }
        ] },
        res: { values: { 'Glucose': '92' } },
        invoice: { id: 'preview', no: 'INV-0001' }
      }
    ];
    return reportHtml({
      inv: { id: 'preview', no: 'INV-0001', createdAt: now },
      pat: { id: 'P-0001', name: 'Sample Patient', father: 'Sample Father', age: 35, gender: 'Male',
             blood: 'B+', cnic: '35202-1234567-1', phone: '0300-1234567', address: '123 Sample Street, Lahore' },
      s: s,
      doc: { name: 'Dr. Sample Doctor' },
      readyRows: sampleRows,
      pendingCount: 0,
      maxReported: now
    });
  };
})();
