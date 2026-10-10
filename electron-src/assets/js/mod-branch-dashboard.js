/* Branch analytics dashboard (#/branch-dashboard). */
(function () {
  'use strict';

  function dayKey(value) { return String(value || '').slice(0, 10); }
  function periodStart(period, today) {
    if (period === 'all') return '';
    var days = period === '90' ? 90 : 30, d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - days + 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  App.route('#/branch-dashboard', function () {
    var me = App.session();
    if (!me || me.role !== 'admin') {
      App.toast('Not allowed.', 'err');
      App.nav('#/dashboard');
      return;
    }

    var view = document.getElementById('view');
    var canSeeMoney = !App.hideMoney() && App.canPage('finance');
    var period = '30', customStart = '', customEnd = '';
    var today = App.today();

    function analytics(start, end) {
      var branches = DB.all('branches') || [], branchById = {}, branchByLabel = {}, data = {};
      branches.forEach(function (b) {
        if (!b || !b.id) return;
        branchById[b.id] = b;
        [b.name, b.code].forEach(function (label) {
          var key = String(label || '').trim().toLowerCase();
          if (key) branchByLabel[key] = b.id;
        });
        data[b.id] = { id: b.id, name: b.name || b.code || b.id, billed: 0, collected: 0, due: 0, invoices: 0, tests: {} };
      });
      data.unassigned = { id: 'unassigned', name: 'Unassigned', billed: 0, collected: 0, due: 0, invoices: 0, tests: {} };
      function branchFor(inv) {
        var id = inv.branchId && branchById[inv.branchId] ? inv.branchId : null;
        if (!id) id = branchByLabel[String(inv.regLocation || '').trim().toLowerCase()] || null;
        return data[id] || data.unassigned;
      }
      function matchesDate(value) {
        var day = dayKey(value);
        return !!day && (!start || day >= start) && day <= end;
      }
      var invoices = DB.all('invoices') || [], invoiceBranches = {};
      invoices.forEach(function (inv) {
        if (!inv || !inv.id) return;
        var branch = branchFor(inv);
        invoiceBranches[inv.id] = branch;
        branch.due += Math.max(0, +inv.due || 0);
        if (!matchesDate(inv.createdAt)) return;
        branch.billed += +inv.total || 0;
        branch.invoices++;
        (inv.items || []).forEach(function (item) {
          var ids = item.isPackage && item.includes && item.includes.length ? item.includes : [item.testId || ''];
          ids.forEach(function (testId) {
            var test = testId && DB.get('tests', testId);
            var key = testId || item.code || item.name || 'unknown';
            var name = (test && test.name) || item.name || 'Unnamed test';
            branch.tests[key] = branch.tests[key] || { name: name, count: 0 };
            branch.tests[key].count++;
          });
        });
      });
      if (canSeeMoney) {
        (DB.all('payments') || []).forEach(function (payment) {
          if (!payment || !matchesDate(payment.date)) return;
          var branch = invoiceBranches[payment.invoiceId];
          if (branch) branch.collected += +payment.amount || 0;
        });
      }

      var branchRows = Object.keys(data).map(function (key) { return data[key]; })
        .filter(function (branch) { return branch.invoices || branch.due || branch.collected; })
        .sort(function (a, b) { return b.billed - a.billed || a.name.localeCompare(b.name); });
      var revenue = branchRows.length
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Branch</th>' +
          (canSeeMoney ? '<th class="num">Billed</th><th class="num">Collected</th><th class="num">Outstanding</th>' : '') +
          '<th class="num">Invoices</th></tr></thead><tbody>' +
          branchRows.map(function (b) {
            return '<tr><td><span class="bd-name">' + App.esc(b.name) + '</span></td>' +
              (canSeeMoney ? '<td class="num">' + App.money(b.billed) + '</td><td class="num">' + App.money(b.collected) + '</td><td class="num">' + App.money(b.due) + '</td>' : '') +
              '<td class="num">' + b.invoices + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : App.empty('No branch activity in this period.');

      var chart = '';
      if (canSeeMoney && branchRows.length) {
        var max = branchRows.reduce(function (value, b) { return Math.max(value, b.billed, b.collected, b.due); }, 0) || 1;
        var plotX = 155, plotWidth = 620, rowHeight = 66;
        var bars = branchRows.map(function (b, i) {
          var y = 25 + i * rowHeight;
          var metrics = [
            { label: 'Billed', value: b.billed, color: '#3b82f6' },
            { label: 'Collected', value: b.collected, color: '#10b981' },
            { label: 'Outstanding', value: b.due, color: '#f59e0b' }
          ];
          return '<text x="0" y="' + (y + 27) + '" class="bd-chart-label">' + App.esc(b.name) + '</text>' +
            metrics.map(function (m, index) {
              var barY = y + index * 15, width = plotWidth * m.value / max;
              return '<rect x="' + plotX + '" y="' + barY + '" width="' + width.toFixed(2) + '" height="9" rx="4" fill="' + m.color + '"><title>' +
                App.esc(m.label + ': ' + App.money(m.value)) + '</title></rect><text x="' + (plotX + width + 7).toFixed(2) + '" y="' + (barY + 8) + '" class="bd-chart-value">' +
                App.esc(App.money(m.value)) + '</text>';
            }).join('');
        }).join('');
        chart = '<div class="bd-chart-scroll"><svg class="bd-chart" viewBox="0 0 960 ' + (35 + branchRows.length * rowHeight) + '" role="img" aria-label="Branch comparison of billed revenue, collections and outstanding balances">' +
          '<line x1="' + plotX + '" y1="12" x2="' + plotX + '" y2="' + (24 + branchRows.length * rowHeight) + '" stroke="#dbe4f0"/>' + bars +
          '</svg></div><div class="bd-legend"><span><i style="background:#3b82f6"></i>Billed</span><span><i style="background:#10b981"></i>Collected</span><span><i style="background:#f59e0b"></i>Outstanding</span></div>';
      }

      var testRows = [];
      Object.keys(data).forEach(function (id) {
        var branch = data[id];
        Object.keys(branch.tests).forEach(function (key) {
          testRows.push({ branch: branch.name, name: branch.tests[key].name, count: branch.tests[key].count });
        });
      });
      testRows.sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
      testRows = testRows.slice(0, 20);
      var tests = testRows.length
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Branch</th><th>Test</th><th class="num">Orders</th></tr></thead><tbody>' +
          testRows.map(function (r) { return '<tr><td><span class="bd-name">' + App.esc(r.branch) + '</span></td><td>' + App.esc(r.name) + '</td><td class="num">' + r.count + '</td></tr>'; }).join('') +
          '</tbody></table></div>'
        : App.empty('No test orders in this period.');
      return { revenue: revenue, tests: tests, chart: chart, branchRows: branchRows, testRows: testRows };
    }

    function csvReport(report) {
      var rows = [['Branch summary'], canSeeMoney
        ? ['Branch', 'Billed', 'Collected', 'Outstanding', 'Invoices']
        : ['Branch', 'Invoices']];
      report.branchRows.forEach(function (b) {
        rows.push(canSeeMoney
          ? [b.name, b.billed, b.collected, b.due, b.invoices]
          : [b.name, b.invoices]);
      });
      rows.push([], ['Test demand'], ['Branch', 'Test', 'Orders']);
      report.testRows.forEach(function (r) { rows.push([r.branch, r.name, r.count]); });
      return '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    }

    function exportReport(report, start, end) {
      try {
        var blob = new Blob([csvReport(report)], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url;
        link.download = 'branch-dashboard-' + (start || 'all') + '-to-' + end + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        App.toast('Could not export the branch report.', 'err');
        throw error;
      }
    }

    function rangeError() {
      if (!customStart || !customEnd) return 'Choose both dates for the custom range.';
      if (customStart > customEnd) return 'The start date must be on or before the end date.';
      if (customEnd > today) return 'The end date cannot be in the future.';
      return '';
    }

    function paint() {
      var start = period === 'custom' ? customStart : periodStart(period, today);
      var end = period === 'custom' ? customEnd : today;
      var error = period === 'custom' ? rangeError() : '';
      var report = error ? null : analytics(start, end);
      var customInputs = period === 'custom'
        ? '<label class="bd-date-label">From <input class="input" id="bdStart" type="date" value="' + App.esc(customStart) + '" max="' + today + '"></label>' +
          '<label class="bd-date-label">To <input class="input" id="bdEnd" type="date" value="' + App.esc(customEnd) + '" min="' + App.esc(customStart) + '" max="' + today + '"></label>'
        : '';
      view.innerHTML = '<div class="bd-page"><style>' +
        '.bd-page{--ink:#131845;--muted:#5b6b80}.bd-page .card-h h3{font-size:17px;font-weight:600!important;color:var(--ink)}.bd-page .bd-sub{font-size:13px;color:var(--muted);margin-top:3px}.bd-page .bd-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}.bd-page .bd-grid .card-h h3{font-size:15px}.bd-page .bd-name{font-weight:500;color:var(--ink)}.bd-page .tbl-wrap{max-height:480px;overflow:auto}.bd-controls{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}.bd-controls .select{max-width:155px}.bd-date-label{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px}.bd-date-label .input{width:145px;padding:7px 8px}.bd-error{color:#b91c1c;font-size:13px;margin:12px 0 0}.bd-chart-scroll{overflow:auto}.bd-chart{display:block;width:100%;min-width:650px;height:auto;overflow:visible}.bd-chart-label{font:12px sans-serif;fill:#131845}.bd-chart-value{font:11px sans-serif;fill:#475569}.bd-legend{display:flex;gap:16px;flex-wrap:wrap;color:#5b6b80;font-size:12px;margin-top:10px}.bd-legend span{display:inline-flex;align-items:center;gap:6px}.bd-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}.bd-export{white-space:nowrap}@media(max-width:900px){.bd-page .bd-grid{grid-template-columns:1fr}.bd-controls{justify-content:flex-start;margin:12px 0 0;width:100%}}' +
        '</style><div class="card"><div class="card-h"><div><h3>Branch Dashboard</h3><div class="bd-sub">Revenue, collections, outstanding dues and test demand by branch</div></div>' +
        '<div class="bd-controls"><select class="select" id="bdPeriod" aria-label="Report period"><option value="30"' + (period === '30' ? ' selected' : '') + '>Last 30 days</option><option value="90"' + (period === '90' ? ' selected' : '') + '>Last 90 days</option><option value="all"' + (period === 'all' ? ' selected' : '') + '>All time</option><option value="custom"' + (period === 'custom' ? ' selected' : '') + '>Custom range</option></select>' +
        customInputs + '<button class="btn btn-sm bd-export" id="bdExport" title="Downloads an Excel-compatible CSV report"' + (error ? ' disabled' : '') + '>Export CSV</button></div></div>' +
        '<div class="card-b">' + (error ? '<div class="bd-error" role="alert">' + App.esc(error) + '</div>' : '') +
        (report ? '<section class="card"><div class="card-h"><h3>Branch comparison</h3></div><div class="card-b">' +
          (canSeeMoney ? (report.chart || App.empty('No branch activity to compare in this period.')) : App.empty('Financial comparison is not available for your role.')) +
          '</div></section><div class="bd-grid"><section class="card"><div class="card-h"><h3>Branch revenue &amp; dues</h3></div><div class="card-b">' + report.revenue + '</div></section>' +
          '<section class="card"><div class="card-h"><h3>Test demand by branch</h3></div><div class="card-b">' + report.tests + '</div></section></div>' +
          '<p class="bd-sub">Revenue and collections use the selected period. Outstanding balances include all currently unpaid invoices.</p>' : '') + '</div></div></div>';
      var select = view.querySelector('#bdPeriod');
      if (select) select.addEventListener('change', function () {
        period = select.value;
        if (period === 'custom' && !customStart) {
          customStart = periodStart('30', today);
          customEnd = today;
        }
        paint();
      });
      var startInput = view.querySelector('#bdStart');
      if (startInput) startInput.addEventListener('change', function () { customStart = startInput.value; paint(); });
      var endInput = view.querySelector('#bdEnd');
      if (endInput) endInput.addEventListener('change', function () { customEnd = endInput.value; paint(); });
      var exportButton = view.querySelector('#bdExport');
      if (exportButton && report) exportButton.addEventListener('click', function () { exportReport(report, start, end); });
    }
    paint();
  });
})();
