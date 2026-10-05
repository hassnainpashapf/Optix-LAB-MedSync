/* ============================================================
   LabPOS — Lab Results module
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
  function shareReportWhatsApp(invoiceId) {
    var inv = invOf(invoiceId);
    if (!inv) return;
    var pat = patOf(inv.patientId);
    var ph = waPhone(pat.phone);
    if (!ph) { App.toast('No WhatsApp number on patient record', 'err'); return; }
    var s = DB.get('settings', 'main') || {};
    var msg = (s.labName || 'Lab') + '\nAssalam-o-Alaikum ' + (pat.name || '') + ',\n' +
      'Your lab report is ready.\nInvoice: ' + inv.no + ' (' + App.d(inv.createdAt) + ')\n' +
      'Please collect it from the lab or reply here. Shukriya!';
    window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), '_blank');
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
        return '<tr>' +
          '<td><strong>' + App.esc(p.name) + '</strong></td>' +
          '<td><input class="input" data-pi="' + i + '" value="' + App.esc(v) + '" placeholder="Enter value"></td>' +
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
      { onOpen: function () {
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

  function printReport(invoiceId) {
    var inv = invOf(invoiceId);
    if (!inv) { App.toast('Invoice not found', 'err'); return; }
    var pat = patOf(inv.patientId);
    var s = DB.get('settings', 'main') || {};
    var doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;

    var readyRows = joinedRows('ready').filter(function (r) { return r.invoice.id === invoiceId; });
    var pendingCount = joinedRows('pending').filter(function (r) { return r.invoice.id === invoiceId; }).length;
    if (!readyRows.length) { App.toast('No ready results to print', 'err'); return; }

    var maxReported = '';
    readyRows.forEach(function (r) {
      if (r.res && r.res.reportedAt && r.res.reportedAt > maxReported) maxReported = r.res.reportedAt;
    });

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

    var html =
      '<div style="border-bottom:3px solid #0d9488;padding-bottom:12px;margin-bottom:16px">' +
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
        info('Reported', maxReported ? App.dt(maxReported) : '—') +
        info('Referred By', doc ? doc.name : 'Self') +
        info('Tests', readyRows.length + (pendingCount ? ' (' + pendingCount + ' pending)' : '')) +
      '</div>' +
      testsHtml +
      (pendingCount ? '<p style="color:#d97706"><em>Note: ' + pendingCount + ' test(s) from this invoice are still pending.</em></p>' : '') +
      '<p style="color:#64748b;margin-top:18px"><em>' + App.esc(s.footerNote || '') + '</em></p>' +
      '<div style="display:flex;justify-content:space-between;margin-top:48px">' +
        '<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #0f1e2e;padding-top:6px">Lab Technologist</div></div>' +
        '<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #0f1e2e;padding-top:6px">Pathologist</div></div>' +
      '</div>' +
      '<p style="text-align:center;color:#64748b;margin-top:32px">— End of Report —</p>';

    App.print('Lab Report — ' + inv.no, html);
  }

  /* ---------- main render ---------- */

  function render() {
    var pendingRows = joinedRows('pending');
    var readyRows = joinedRows('ready');
    var pendingGroups = groupByInvoice(pendingRows);
    var readyGroups = groupByInvoice(readyRows);

    var q = query.trim().toLowerCase();
    function matches(g) {
      if (!q) return true;
      return (g.invoice.no || '').toLowerCase().indexOf(q) > -1 ||
             (g.patient.name || '').toLowerCase().indexOf(q) > -1 ||
             ((g.patient.phone || '')).indexOf(q) > -1;
    }

    var tabsHtml =
      '<div class="toolbar" style="margin-bottom:16px">' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn ' + (tab === 'pending' ? 'btn-primary' : 'btn-ghost') + '" data-tab="pending">Pending Entry <span class="badge b-pending" style="margin-left:6px">' + pendingRows.length + '</span></button>' +
          '<button class="btn ' + (tab === 'ready' ? 'btn-primary' : 'btn-ghost') + '" data-tab="ready">Ready Reports <span class="badge b-ready" style="margin-left:6px">' + readyGroups.length + '</span></button>' +
        '</div>' +
        '<input class="input search" id="resSearch" placeholder="Search invoice no / patient..." value="' + App.esc(query) + '" style="max-width:280px">' +
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
            '<button class="btn btn-ghost btn-sm" data-wa="' + App.esc(inv.id) + '">WhatsApp</button>' +
            '<button class="btn btn-primary btn-sm" data-print="' + App.esc(inv.id) + '">Print Report</button></div></div>' +
            '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th>Status</th><th>Reported</th><th></th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table></div></div>';
        }).join('');
      }
    }

    var v = document.getElementById('view');
    v.innerHTML =
      '<div class="page-h"><h1>Lab Results</h1><p class="muted">Enter test results and print laboratory reports.</p></div>' +
      tabsHtml + bodyHtml;

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
    v.querySelectorAll('[data-wa]').forEach(function (b) {
      b.addEventListener('click', function () { shareReportWhatsApp(b.getAttribute('data-wa')); });
    });
    v.querySelectorAll('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () { var id = b.getAttribute('data-clear'); if (id) clearResult(id); });
    });
  }

  App.route('#/results', render);
})();
