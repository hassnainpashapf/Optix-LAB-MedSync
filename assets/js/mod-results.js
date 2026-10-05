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
  function clearResult(resId) {
    var r = DB.get('results', resId);
    if (!r) return;
    App.confirm('Clear this result? It will go back to pending.').then(function (ok) {
      if (!ok) return;
      DB.update('results', resId, { values: {}, status: 'pending', reportedAt: null, reportedBy: null });
      App.toast('Result cleared — back to pending');
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

  function testName(row) {
    return row.item.name || (row.test && row.test.name) || 'Test';
  }
  function testCode(row) {
    return row.item.code || (row.test && row.test.code) || '';
  }

  /* ---------- entry modal ---------- */

  function openEntry(row) {
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
            saveResult(row, params, close);
          });
        }
      });
  }

  function saveResult(row, params, close) {
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
    render();
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

  function reportHtml(d) {
    var inv = d.inv, pat = d.pat, s = d.s, readyRows = d.readyRows, pendingCount = d.pendingCount;

    var testsHtml = readyRows.map(function (r) {
      var test = r.test;
      var params = (test && Array.isArray(test.params)) ? test.params : [];
      var vals = (r.res && r.res.values) || {};
      var bodyRows;
      if (params.length) {
        bodyRows = params.map(function (p) {
          return '<tr><td>' + App.esc(p.name) + '</td>' +
            '<td><strong>' + App.esc(vals[p.name] != null ? String(vals[p.name]) : '') + '</strong></td>' +
            '<td>' + App.esc(p.unit || '') + '</td>' +
            '<td>' + App.esc(p.ref || '') + '</td></tr>';
        }).join('');
        if (vals['Remarks']) {
          bodyRows += '<tr><td colspan="4"><em>Remarks: ' + App.esc(vals['Remarks']) + '</em></td></tr>';
        }
      } else {
        bodyRows = '<tr><td>Result</td><td colspan="3"><strong>' + App.esc(vals['Result'] != null ? String(vals['Result']) : '') + '</strong></td></tr>';
      }
      return '<h3 style="margin:18px 0 6px">' + App.esc(testName(r)) +
        (testCode(r) ? ' <span style="color:#64748b;font-weight:500">(' + App.esc(testCode(r)) + ')</span>' : '') + '</h3>' +
        '<table class="table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference Range</th></tr></thead>' +
        '<tbody>' + bodyRows + '</tbody></table>';
    }).join('');

    var info = function (k, v) {
      return '<div><span style="color:#64748b">' + k + ':</span> <strong>' + App.esc(v || '—') + '</strong></div>';
    };

    return '<div style="border-bottom:3px solid #0d9488;padding-bottom:12px;margin-bottom:16px">' +
        '<h1 style="margin:0;color:#0d9488">' + App.esc(s.labName || 'Lab') + '</h1>' +
        '<div style="color:#64748b">' + App.esc(s.tagline || '') + '</div>' +
        '<div style="color:#64748b">' + App.esc(s.address || '') + ' &nbsp;•&nbsp; ' + App.esc(s.phone || '') +
        (s.email ? ' &nbsp;•&nbsp; ' + App.esc(s.email) : '') + '</div>' +
      '</div>' +
      '<h2 style="text-align:center;margin:0 0 14px">LABORATORY REPORT</h2>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;background:#f8fafc;border:1px solid #e8eef4;border-radius:10px;padding:12px 16px;margin-bottom:8px">' +
        info('Patient', pat.name) +
        info('Age / Gender', (pat.age || '') + (pat.gender ? ' / ' + pat.gender : '')) +
        info('Phone', pat.phone) +
        info('Invoice No', inv.no) +
        info('Date', App.d(inv.createdAt)) +
        info('Reported', d.maxReported ? App.dt(d.maxReported) : '—') +
        info('Referred By', d.doc ? d.doc.name : 'Self') +
        info('Tests', readyRows.length + (pendingCount ? ' (' + pendingCount + ' pending)' : '')) +
      '</div>' +
      testsHtml +
      (pendingCount ? '<p style="color:#d97706"><em>Note: ' + pendingCount + ' test(s) from this invoice are still pending.</em></p>' : '') +
      '<p style="color:#64748b;margin-top:18px;margin-bottom:4px"><em>' + App.esc(s.footerNote || '') + '</em></p>' +
      '<p style="color:#999;font-size:11px;text-align:center;margin:0">Powered by System Optix</p>' +
      '<div style="display:flex;justify-content:space-between;margin-top:48px">' +
        '<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #0f1e2e;padding-top:6px">Lab Technologist</div></div>' +
        '<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #0f1e2e;padding-top:6px">Pathologist</div></div>' +
      '</div>' +
      '<p style="text-align:center;color:#64748b;margin-top:32px">— End of Report —</p>';
  }

  function printReport(invoiceId) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results to print', 'err'); return; }
    App.print('Lab Report — ' + d.inv.no, reportHtml(d));
  }

  // Report preview modal with Print + Share on WhatsApp actions
  function viewReport(invoiceId) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results to view', 'err'); return; }
    var close = App.modal('Lab Report — ' + App.esc(d.inv.no),
      '<div class="report-preview" style="max-height:62vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:20px;background:#fff">' +
        reportHtml(d) +
      '</div>' +
      '<div class="actions" style="margin-top:16px">' +
        '<button class="btn btn-ghost" id="rvClose">Close</button>' +
        '<button class="btn btn-ghost" id="rvWa">' + WA_ICON + ' Share on WhatsApp</button>' +
        '<button class="btn btn-primary" id="rvPrint">' + PRINT_ICON + ' Print Report</button>' +
      '</div>',
      { wide: true, onOpen: function (ov, close) {
          document.getElementById('rvClose').addEventListener('click', close);
          document.getElementById('rvPrint').addEventListener('click', function () { printReport(invoiceId); });
          document.getElementById('rvWa').addEventListener('click', function () { shareReportWhatsApp(invoiceId); });
        }
      });
  }

  /* ---------- report PDF builder (jsPDF) ---------- */

  // Returns { dataUri } or null (error toasted)
  function buildReportPdf(invoiceId) {
    var d = reportData(invoiceId);
    if (!d) { App.toast('No ready results for PDF', 'err'); return null; }
    var JSPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JSPDF) { App.toast('PDF engine not loaded — check connection and reload', 'err'); return null; }

    var s = d.s, inv = d.inv, pat = d.pat;
    var doc = new JSPDF({ unit: 'mm', format: 'a4' });
    var W = 210, M = 14, CW = W - 2 * M;
    var y = M;
    var TEAL = [13, 148, 136];

    function need(h) { if (y + h > 282) { doc.addPage(); y = M; } }
    function txt(t, x, yy, opts) { doc.text(String(t == null ? '' : t), x, yy, opts || {}); }

    // header
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
    txt(s.labName || 'Optix LAB MedSync', W / 2, y, { align: 'center' }); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    if (s.tagline) { txt(s.tagline, W / 2, y, { align: 'center' }); y += 5; }
    var addr = [s.address, s.phone, s.email].filter(function (x) { return x; }).join('  •  ');
    if (addr) { doc.setFontSize(9); txt(addr, W / 2, y, { align: 'center' }); y += 6; }
    doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]); doc.setLineWidth(0.8);
    doc.line(M, y, W - M, y); y += 8;

    // title
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
    txt('LABORATORY REPORT', W / 2, y, { align: 'center' }); y += 8;

    // patient box
    var infoRows = [
      ['Patient', pat.name || '—', 'Age / Gender', (pat.age || '') + (pat.gender ? ' / ' + pat.gender : '')],
      ['Phone', pat.phone || '—', 'Invoice No', inv.no || '—'],
      ['Date', App.d(inv.createdAt), 'Reported', d.maxReported ? App.dt(d.maxReported) : '—'],
      ['Referred By', d.doc ? d.doc.name : 'Self', 'Tests', String(d.readyRows.length) + (d.pendingCount ? ' (' + d.pendingCount + ' pending)' : '')]
    ];
    var boxH = infoRows.length * 6.5 + 6;
    need(boxH + 4);
    doc.setDrawColor(220, 228, 235); doc.setFillColor(248, 250, 252); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, boxH, 2, 2, 'FD');
    var iy = y + 5.5;
    infoRows.forEach(function (r) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(100, 116, 139);
      txt(r[0] + ':', M + 5, iy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      txt(r[1], M + 38, iy);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      txt(r[2] + ':', M + CW / 2 + 5, iy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
      txt(r[3], M + CW / 2 + 38, iy);
      iy += 6.5;
    });
    y += boxH + 6;

    // test tables
    var COLS = [72, 52, 28, 30]; // param | result | unit | ref  (sum 182 = CW)
    function tableHead() {
      need(9);
      doc.setFillColor(13, 148, 136); doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      var x = M, heads = ['Parameter', 'Result', 'Unit', 'Reference Range'];
      var hh = 7;
      doc.rect(M, y, CW, hh, 'F');
      heads.forEach(function (h, i) { txt(h, x + 2, y + 4.8); x += COLS[i]; });
      y += hh;
      doc.setTextColor(20, 20, 20);
    }
    function tableRow(cells, boldVal) {
      doc.setFontSize(9.5);
      var lines = cells.map(function (c, i) { return doc.splitTextToSize(String(c == null ? '' : c), COLS[i] - 4); });
      var rh = Math.max.apply(null, lines.map(function (l) { return l.length; })) * 5 + 2.5;
      need(rh);
      var x = M;
      doc.setDrawColor(220, 228, 235); doc.setLineWidth(0.25);
      doc.rect(M, y, CW, rh);
      lines.forEach(function (ln, i) {
        doc.setFont('helvetica', (i === 1 && boldVal) ? 'bold' : 'normal');
        txt(ln, x + 2, y + 4.6);
        x += COLS[i];
      });
      // vertical separators
      var sx = M;
      for (var i = 0; i < 3; i++) { sx += COLS[i]; doc.line(sx, y, sx, y + rh); }
      y += rh;
    }

    d.readyRows.forEach(function (r) {
      var test = r.test;
      var params = (test && Array.isArray(test.params)) ? test.params : [];
      var vals = (r.res && r.res.values) || {};
      need(10);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
      var tname = testName(r) + (testCode(r) ? ' (' + testCode(r) + ')' : '');
      txt(doc.splitTextToSize(tname, CW)[0], M, y); y += 6.5;
      tableHead();
      if (params.length) {
        params.forEach(function (p) {
          tableRow([p.name, vals[p.name] != null ? String(vals[p.name]) : '', p.unit || '', p.ref || ''], true);
        });
        if (vals['Remarks']) {
          need(8);
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(100, 100, 100);
          txt('Remarks: ' + vals['Remarks'], M, y + 4.5);
          doc.setTextColor(20, 20, 20);
          y += 7;
        }
      } else {
        tableRow(['Result', vals['Result'] != null ? String(vals['Result']) : '', '', ''], true);
      }
      y += 4;
    });

    if (d.pendingCount) {
      need(8);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(180, 120, 20);
      txt('Note: ' + d.pendingCount + ' test(s) from this invoice are still pending.', M, y);
      y += 7;
    }

    if (s.footerNote) {
      need(8);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(120, 120, 120);
      txt(doc.splitTextToSize(s.footerNote, CW), M, y);
      y += 6;
    }

    // signatures
    need(24);
    y += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.3);
    doc.line(M, y, M + 55, y); doc.line(W - M - 55, y, W - M, y);
    txt('Lab Technologist', M + 27.5, y + 5, { align: 'center' });
    txt('Pathologist', W - M - 27.5, y + 5, { align: 'center' });
    y += 10;
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
    var pendingGroups = groupByInvoice(pendingRows);
    var readyGroups = groupByInvoice(readyRows);

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
    function matches(g) {
      if (!q) return true;
      return (g.invoice.no || '').toLowerCase().indexOf(q) > -1 ||
             (g.patient.name || '').toLowerCase().indexOf(q) > -1 ||
             ((g.patient.phone || '')).indexOf(q) > -1;
    }

    var tabsHtml =
      '<div class="toolbar" style="margin-bottom:16px">' +
        '<input class="input search" id="resSearch" placeholder="Search invoice no / patient..." value="' + App.esc(query) + '" style="max-width:280px">' +
        '<div style="display:flex;gap:8px;margin-left:auto">' +
          '<button class="btn ' + (tab === 'pending' ? 'btn-primary' : 'btn-ghost') + '" data-tab="pending">Pending Entry <span class="badge b-pending" style="margin-left:6px">' + pendingRows.length + '</span></button>' +
          '<button class="btn ' + (tab === 'ready' ? 'btn-primary' : 'btn-ghost') + '" data-tab="ready">Ready Reports <span class="badge b-ready" style="margin-left:6px">' + readyGroups.length + '</span></button>' +
        '</div>' +
      '</div>';

    var bodyHtml = '';
    if (tab === 'pending') {
      var groups = pendingGroups.filter(matches);
      if (!groups.length) {
        bodyHtml = App.empty(query ? 'No pending results match your search.' : 'All caught up — no pending results.');
      } else {
        bodyHtml = groups.map(function (g) {
          var inv = g.invoice, pat = g.patient;
          var rowsHtml = g.rows.map(function (r, i) {
            return '<tr><td><strong>' + App.esc(testName(r)) + '</strong>' +
              (testCode(r) ? ' <span class="muted">(' + App.esc(testCode(r)) + ')</span>' : '') + '</td>' +
              '<td class="muted">' + App.esc((r.test && r.test.sampleType) || '') + '</td>' +
              '<td class="muted">' + App.esc((r.test && r.test.tat) || '') + '</td>' +
              '<td class="actions"><button class="btn btn-primary btn-sm" data-enter="' + g.invoice.id + '|' + i + '">Enter Result</button></td></tr>';
          }).join('');
          return '<div class="card" style="margin-bottom:14px" data-inv="' + App.esc(inv.id) + '">' +
            '<div class="card-h"><div><strong>' + App.esc(inv.no) + '</strong> — ' + App.esc(pat.name || '—') +
            (pat.age ? ' <span class="muted">(' + App.esc(String(pat.age)) + (pat.gender ? '/' + App.esc(pat.gender) : '') + ')</span>' : '') + '</div>' +
            '<span class="muted">' + App.d(inv.createdAt) + ' • ' + g.rows.length + ' test(s) pending</span></div>' +
            '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th>Sample</th><th>TAT</th><th></th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table></div></div>';
        }).join('');
      }
    } else {
      var rgroups = readyGroups.filter(matches);
      if (!rgroups.length) {
        bodyHtml = App.empty(query ? 'No ready reports match your search.' : 'No ready reports yet.');
      } else {
        bodyHtml = rgroups.map(function (g) {
          var inv = g.invoice, pat = g.patient;
          var rowsHtml = g.rows.map(function (r) {
            var rep = r.res ? (App.dt(r.res.reportedAt) + (r.res.reportedBy ? ' • ' + App.esc(r.res.reportedBy) : '')) : '';
            return '<tr><td><strong>' + App.esc(testName(r)) + '</strong>' +
              (testCode(r) ? ' <span class="muted">(' + App.esc(testCode(r)) + ')</span>' : '') + '</td>' +
              '<td><span class="badge b-ready">Ready</span></td>' +
              '<td class="muted">' + App.esc(rep) + '</td>' +
              '<td class="actions"><button class="btn btn-ghost btn-sm" data-view="' + App.esc(r.res ? r.res.id : '') + '|' + App.esc(inv.id) + '|' + App.esc(r.item.testId) + '">View / Edit</button> ' +
              '<button class="btn btn-ghost btn-sm" data-clear="' + App.esc(r.res ? r.res.id : '') + '" style="color:var(--red)">Clear</button></td></tr>';
          }).join('');
          return '<div class="card" style="margin-bottom:14px">' +
            '<div class="card-h"><div><strong>' + App.esc(inv.no) + '</strong> — ' + App.esc(pat.name || '—') + '</div>' +
            '<div class="actions"><span class="muted">' + App.d(inv.createdAt) + '</span>' +
            '<button class="btn btn-ghost btn-sm" data-viewrep="' + App.esc(inv.id) + '">View</button>' +
            '<button class="btn btn-ghost btn-sm" data-wa="' + App.esc(inv.id) + '">' + WA_ICON + ' Share on WhatsApp</button>' +
            '<button class="btn btn-primary btn-sm" data-print="' + App.esc(inv.id) + '">' + PRINT_ICON + ' Print Report</button></div></div>' +
            '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th>Status</th><th>Reported</th><th></th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table></div></div>';
        }).join('');
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
    // wire enter-result buttons (pending tab)
    v.querySelectorAll('[data-enter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-enter').split('|');
        var card = b.closest('[data-inv]');
        var g = groupByInvoice(joinedRows('pending')).filter(function (x) { return x.invoice.id === parts[0]; })[0];
        if (g && g.rows[+parts[1]]) openEntry(g.rows[+parts[1]]);
      });
    });
    // wire view/edit + print (ready tab)
    v.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-view').split('|');
        var res = parts[0] ? DB.get('results', parts[0]) : null;
        var inv = invOf(parts[1]);
        if (!inv) return;
        var item = (inv.items || []).filter(function (it) { return it.testId === parts[2]; })[0];
        if (!item) return;
        openEntry({ res: res, invoice: inv, patient: patOf(inv.patientId), item: item, test: DB.get('tests', parts[2]) });
      });
    });
    v.querySelectorAll('[data-print]').forEach(function (b) {
      b.addEventListener('click', function () { printReport(b.getAttribute('data-print')); });
    });
    v.querySelectorAll('[data-viewrep]').forEach(function (b) {
      b.addEventListener('click', function () { viewReport(b.getAttribute('data-viewrep')); });
    });
    v.querySelectorAll('[data-wa]').forEach(function (b) {
      b.addEventListener('click', function () { shareReportWhatsApp(b.getAttribute('data-wa')); });
    });
    v.querySelectorAll('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () { var id = b.getAttribute('data-clear'); if (id) clearResult(id); });
    });
  }

  App.route('#/results', render);
})();
