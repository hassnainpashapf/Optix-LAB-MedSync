/* Optix Medical Sync — Corporate / panel clients (companies, schools, hospitals...) with their own rates and a monthly account (udhaar).
   A panel has: contact details, a flat discount % and/or a special price per test. Patients linked to a panel are billed at the panel's prices and the bill
   goes to the panel's account instead of the patient. The panel pays later in one go (a receipt); the monthly statement shows what was billed and what is due. */
(function () {
  'use strict';
  var esc = App.esc;

  function rs(n) { return 'Rs ' + Math.round(+n || 0).toLocaleString('en-US'); }
  function lab() { try { return DB.get('settings', 'main') || {}; } catch (e) { return {}; } }
  function mkOf(d) { var x = new Date(d); if (isNaN(x.getTime())) return ''; return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); }
  function monthLabel(mk) { var p = mk.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function months() {
    var out = [], n = new Date();
    for (var i = 0; i < 12; i++) { var d = new Date(n.getFullYear(), n.getMonth() - i, 1), k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); out.push({ key: k, label: monthLabel(k) }); }
    return out;
  }
  function prevDay(mk) { var p = mk.split('-'), d = new Date(+p[0], +p[1] - 1, 0); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function activePanels() { return (DB.all('panels') || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); }
  function canManage() { var s = App.session(); return !!s && App.canPage('panels'); }

  /* ---------- one panel, one month ---------- */
  function compute(panelId, mk) {
    var p = DB.get('panels', panelId) || {};
    var opening = App.panelAccount(p, prevDay(mk)).balance;
    var rows = (DB.all('invoices') || []).filter(function (i) { return i.panelId === panelId && mkOf(i.createdAt) === mk; })
      .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); })
      .map(function (i) {
        var pat = DB.get('patients', i.patientId) || {};
        return { date: i.createdAt, no: i.no || i.id, patient: pat.name || '—', ref: pat.panelRef || '', tests: (i.items || []).map(function (x) { return x.name || x.code || ''; }).filter(Boolean).join(', '), total: +i.total || 0 };
      });
    var recs = (p.receipts || []).filter(function (r) { return mkOf(r.date) === mk; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var billed = rows.reduce(function (s, r) { return s + r.total; }, 0), received = recs.reduce(function (s, r) { return s + (+r.amount || 0); }, 0);
    return { panel: p, mk: mk, rows: rows, receipts: recs, opening: opening, billed: billed, received: received, closing: Math.round((opening + billed - received) * 100) / 100 };
  }

  var TH = 'text-align:left;padding:7px 8px;border-bottom:2px solid #131845;font-size:12px;color:#131845;text-transform:uppercase;letter-spacing:.03em';
  var TD = 'padding:7px 8px;border-bottom:1px solid #e3e8f2;font-size:12.5px;vertical-align:top';
  function line(a, b, strong, red) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;' + (strong ? 'border-top:2px solid #131845;margin-top:4px;font-weight:800;font-size:15px;' : '') + '"><span>' + a + '</span><span' + (red ? ' style="color:#b91c1c"' : '') + '>' + b + '</span></div>'; }
  function detailHtml(s, editable) {
    var p = s.panel;
    return '<div style="margin-bottom:10px;font-size:13px"><b style="font-size:15px">' + esc(p.name || '') + '</b>' + (p.contact ? '<br>Attention: ' + esc(p.contact) : '') + (p.address ? '<br>' + esc(p.address) : '') + '</div>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + TH + '">Date</th><th style="' + TH + '">Invoice</th><th style="' + TH + '">Patient</th><th style="' + TH + '">Tests</th><th style="' + TH + ';text-align:right">Amount</th></tr></thead><tbody>' +
      (s.rows.length ? s.rows.map(function (r) {
        return '<tr><td style="' + TD + '">' + esc(App.d(r.date)) + '</td><td style="' + TD + '">' + esc(r.no) + '</td><td style="' + TD + '">' + esc(r.patient) + (r.ref ? '<div style="color:#8a94a6;font-size:11.5px">' + esc(r.ref) + '</div>' : '') + '</td>' +
          '<td style="' + TD + ';color:#5b6b80">' + esc(r.tests.length > 80 ? r.tests.slice(0, 78) + '…' : r.tests) + '</td><td style="' + TD + ';text-align:right">' + rs(r.total) + '</td></tr>';
      }).join('') : '<tr><td colspan="5" style="' + TD + ';text-align:center;color:#8a94a6;padding:22px">No bills in ' + esc(monthLabel(s.mk)) + '.</td></tr>') +
      '</tbody></table>' +
      (s.receipts.length ? '<div style="margin-top:12px;font-size:13px"><b>Payments received</b>' + s.receipts.map(function (r) { return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eef1f7"><span>' + esc(App.d(r.date)) + ' · ' + esc(r.method || '') + (r.note ? ' · ' + esc(r.note) : '') + '</span><span>' + rs(r.amount) + (editable ? ' <button class="btn btn-ghost btn-sm" data-rdel="' + esc(r.id) + '" title="Delete this payment" style="color:#b91c1c;padding:0 6px">&times;</button>' : '') + '</span></div>'; }).join('') + '</div>' : '') +
      '<div style="margin:14px 0 0 auto;max-width:340px;font-size:13.5px">' + line('Previous balance', rs(s.opening)) + line('Billed in ' + esc(monthLabel(s.mk)), rs(s.billed)) + line('Payments received', '− ' + rs(s.received)) + line('Balance due', rs(s.closing), true, s.closing > 0) + '</div>';
  }
  function printable(title, inner) {
    var L = lab();
    return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2540;padding:6px 4px">' +
      '<div style="border-bottom:3px solid #131845;padding-bottom:8px;margin-bottom:12px"><div style="font-size:22px;font-weight:800;color:#131845">' + esc(L.labName || 'Lab') + '</div>' +
      '<div style="font-size:12px;color:#5b6b80">' + esc([L.address, L.phone, L.email].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:10px">' + esc(title) + '</div>' + inner + '</div>';
  }

  function buildPdf(s) {
    var JS = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF; if (!JS) return null;
    var doc = new JS({ unit: 'mm', format: 'a4' }), L = lab(), W = 210, M = 14, y = M, page = 1, NAVY = [19, 24, 69], p = s.panel;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]); doc.text(String(L.labName || 'Lab'), M, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 100, 120); doc.text(String([L.address, L.phone, L.email].filter(Boolean).join('  |  ')).slice(0, 110), M, y + 10.5);
    doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]); doc.setLineWidth(0.7); doc.line(M, y + 13, W - M, y + 13); y += 19;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20); doc.text('Account Statement - ' + monthLabel(s.mk), M, y); y += 7;
    doc.setFontSize(10.5); doc.text(String(p.name || ''), M, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80, 90, 110);
    var sub = [p.contact ? 'Attention: ' + p.contact : '', p.address || ''].filter(Boolean).join('  |  '); if (sub) doc.text(sub.slice(0, 120), M, y + 5); y += 11;
    var X = { date: M, no: M + 22, pat: M + 46, tests: M + 90, amt: W - M };
    function th() {
      doc.setFillColor(233, 237, 249); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('DATE', X.date + 1, y); doc.text('INVOICE', X.no, y); doc.text('PATIENT', X.pat, y); doc.text('TESTS', X.tests, y); doc.text('AMOUNT', X.amt - 1, y, { align: 'right' }); y += 6;
    }
    th(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(30, 30, 30);
    s.rows.forEach(function (r) {
      var tl = doc.splitTextToSize(String(r.tests || ''), 66).slice(0, 3), pl = doc.splitTextToSize(String(r.patient + (r.ref ? ' (' + r.ref + ')' : '')), 42).slice(0, 2), h = Math.max(tl.length, pl.length) * 4 + 2;
      if (y + h > 262) { doc.addPage(); page++; y = M; th(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(30, 30, 30); }
      doc.text(String(App.d(r.date)), X.date + 1, y); doc.text(String(r.no), X.no, y); doc.text(pl, X.pat, y); doc.text(tl, X.tests, y); doc.text(rs(r.total), X.amt - 1, y, { align: 'right' });
      y += h; doc.setDrawColor(225, 230, 240); doc.setLineWidth(0.2); doc.line(M, y - 3, W - M, y - 3);
    });
    if (!s.rows.length) { doc.setTextColor(120, 130, 150); doc.text('No bills this month.', M + 1, y); y += 8; }
    if (y + 34 + s.receipts.length * 5 > 285) { doc.addPage(); page++; y = M; }
    if (s.receipts.length) { y += 3; doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40); doc.text('Payments received', M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      s.receipts.forEach(function (r) { doc.text(String(App.d(r.date)) + '  ' + String(r.method || '') + (r.note ? '  ' + String(r.note).slice(0, 50) : ''), M + 1, y); doc.text(rs(r.amount), W - M, y, { align: 'right' }); y += 5; }); }
    y += 4; var bx = W - M - 82;
    function kv(a, b, bold, red) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(red ? 185 : 40, red ? 28 : 40, red ? 28 : 40); doc.text(a, bx, y); doc.text(b, W - M, y, { align: 'right' }); y += 6; }
    kv('Previous balance', rs(s.opening)); kv('Billed in ' + monthLabel(s.mk), rs(s.billed)); kv('Payments received', '- ' + rs(s.received));
    doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]); doc.setLineWidth(0.4); doc.line(bx, y - 3.5, W - M, y - 3.5); kv('Balance due', rs(s.closing), true, s.closing > 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 140, 160);
    for (var pg = 1; pg <= page; pg++) { doc.setPage(pg); doc.text('Generated ' + new Date().toLocaleDateString('en-GB') + '  |  Page ' + pg + ' of ' + page, W / 2, 291, { align: 'center' }); }
    return doc.output('datauristring');
  }

  function csv(s) {
    var out = [['Date', 'Invoice', 'Patient', 'Reference', 'Tests', 'Amount']];
    s.rows.forEach(function (r) { out.push([App.d(r.date), r.no, r.patient, r.ref, r.tests, Math.round(r.total)]); });
    out.push([]); out.push(['', '', '', '', 'Previous balance', Math.round(s.opening)]); out.push(['', '', '', '', 'Billed', Math.round(s.billed)]); out.push(['', '', '', '', 'Received', Math.round(s.received)]); out.push(['', '', '', '', 'Balance due', Math.round(s.closing)]);
    var text = out.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = 'panel-statement-' + String(s.panel.name || 'panel').replace(/[^A-Za-z0-9]+/g, '-') + '-' + s.mk + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function sendWa(s) {
    var p = s.panel;
    function go() {
      var cfg = App.wa.cfg();
      if (!App.wa.ready(cfg)) { App.toast('WhatsApp is not set up yet (Settings → WhatsApp)', 'err'); return; }
      var to = App.wa.phone(p.whatsapp || p.phone); if (!to) { App.toast('No WhatsApp / phone number saved for this client', 'err'); return; }
      App.toast('Preparing the statement…', 'info');
      Promise.resolve(App.ensureJsPDF ? App.ensureJsPDF() : true).then(function () {
        var uri = buildPdf(s); if (!uri) throw new Error('Could not build the PDF');
        var key = 'stmt-' + String(p.id).replace(/[^A-Za-z0-9]/g, '') + '-' + s.mk + '-' + Math.random().toString(36).slice(2, 8);
        var base = String(window.LABPOS_API || '').replace(/\/+$/, '');
        return fetch(base + '/api/report-pdfs', { method: 'POST', headers: (DB.authHeaders ? DB.authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' }), body: JSON.stringify({ key: key, pdfBase64: uri.slice(uri.indexOf(',') + 1) }) })
          .then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.url) throw new Error((j && j.error) || 'Could not upload the PDF'); return j.url; });
      }).then(function (url) {
        var L = lab();
        var msg = '*' + (L.labName || 'Our lab') + '*\n\nAssalam-o-Alaikum ' + (p.contact || p.name || '') + ',\n\nYour account statement for *' + monthLabel(s.mk) + '*:\n\n' +
          '*Previous balance:* ' + rs(s.opening) + '\n*Billed this month:* ' + rs(s.billed) + '\n*Payments received:* ' + rs(s.received) + '\n*Balance due:* ' + rs(s.closing) + '\n\nFull statement (PDF): ' + url + '\n\nThank you for your trust in ' + (L.labName || 'our lab') + '.';
        App.wa.send(cfg, to, msg, function (err) {
          try { App.wa.log({ kind: 'statement', invoiceId: null, to: to, toName: p.name || '', toRole: 'panel', status: err ? 'failed' : 'sent', error: err ? String(err.message || err).slice(0, 200) : '' }); } catch (e) {}
          if (err) App.toast('WhatsApp failed: ' + String(err.message || err).slice(0, 120), 'err'); else App.toast('Statement sent to ' + (p.name || 'client') + ' on WhatsApp');
        });
      }).catch(function (e) { App.toast((e && e.message) || 'Could not send', 'err'); });
    }
    if (App.wa && App.wa.send) go(); else App.loadScript('assets/js/mod-results.js').then(go, function () { App.toast('Could not load WhatsApp', 'err'); });
  }

  /* ---------- record a payment received from the panel ---------- */
  function receiptModal(panelId, done) {
    var p = DB.get('panels', panelId); if (!p) return;
    var acc = App.panelAccount(p);
    App.modal('Payment from ' + p.name,
      '<p class="muted" style="margin-top:0">Outstanding now: <b style="color:' + (acc.balance > 0 ? '#b91c1c' : 'inherit') + '">' + rs(acc.balance) + '</b></p>' +
      '<div class="form-grid"><div><label class="label">Amount (Rs) *</label><input class="input" id="prAmt" type="number" min="1" step="any" value="' + (acc.balance > 0 ? acc.balance : '') + '"></div>' +
      '<div><label class="label">Date</label><input class="input" id="prDate" type="date" value="' + App.today() + '"></div>' +
      '<div><label class="label">Method</label><select class="select" id="prMeth">' + App.optionsHtml('paymentMethod', 'Cash') + '</select></div>' +
      '<div><label class="label">Note (cheque no. etc.)</label><input class="input" id="prNote" maxlength="80"></div></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn btn-ghost" id="prCancel">Cancel</button><button class="btn btn-primary" id="prSave">Save payment</button></div>',
      { onOpen: function (ov, close) {
        var $ = function (id) { return ov.querySelector('#' + id); };
        $('prCancel').addEventListener('click', close);
        $('prSave').addEventListener('click', function () {
          var amt = Math.round((parseFloat($('prAmt').value) || 0) * 100) / 100, date = $('prDate').value || App.today();
          if (!(amt > 0)) return App.toast('Enter the amount received.', 'err');
          var cur = DB.get('panels', panelId); if (!cur) return;
          var pay = DB.insert('payments', { invoiceId: '', panelId: panelId, amount: amt, method: $('prMeth').value, date: date, note: 'Panel payment: ' + cur.name, createdBy: (App.session() || {}).name || '' });
          var list = (cur.receipts || []).slice(); list.push({ id: 'RC-' + Date.now().toString(36), date: date, amount: amt, method: $('prMeth').value, note: $('prNote').value.trim(), paymentId: pay && pay.id || '' });
          DB.update('panels', panelId, { receipts: list });
          App.toast('Payment of ' + rs(amt) + ' saved.'); close(); if (done) done();
        });
      } });
  }

  /* ---------- statement dialog ---------- */
  function statementDialog(panelId, after) {
    var mk = months()[0].key;
    App.modal('Account statement',
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px"><select class="select" id="psMonth" style="min-width:170px">' + months().map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="psPan" style="min-width:220px;flex:1">' + activePanels().map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === panelId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></div>' +
      '<div id="psBody" style="max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:12px"></div>' +
      '<div class="actions" style="margin-top:14px;flex-wrap:wrap;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" id="psClose">Close</button><button class="btn btn-ghost" id="psCsv">Export CSV</button><button class="btn btn-ghost" id="psPrint">Print</button>' +
      '<button class="btn btn-ghost" id="psPdf">Download PDF</button><button class="btn btn-ghost" id="psWa">Send on WhatsApp</button><button class="btn btn-primary" id="psPay">Record payment</button></div>',
      { wide: true, onOpen: function (ov, close) {
        var $ = function (id) { return ov.querySelector('#' + id); }, st = null;
        function paint() {
          mk = $('psMonth').value; st = compute($('psPan').value, mk); $('psBody').innerHTML = detailHtml(st, true);
          $('psBody').querySelectorAll('[data-rdel]').forEach(function (b) {
            b.addEventListener('click', function () {
              var rid = b.getAttribute('data-rdel'), pn = DB.get('panels', $('psPan').value), rc = ((pn && pn.receipts) || []).filter(function (x) { return x.id === rid; })[0]; if (!rc) return;
              App.confirm('Delete the payment of ' + rs(rc.amount) + ' from ' + App.d(rc.date) + '? The client\'s balance goes up again.').then(function (ok) {
                if (!ok) return; try { if (rc.paymentId && DB.get('payments', rc.paymentId)) DB.remove('payments', rc.paymentId); } catch (e) {}
                DB.update('panels', pn.id, { receipts: pn.receipts.filter(function (x) { return x.id !== rid; }) }); App.toast('Payment deleted.'); paint();
              });
            });
          });
        }
        $('psMonth').addEventListener('change', paint); $('psPan').addEventListener('change', paint);
        $('psClose').addEventListener('click', function () { close(); if (after) after(); });
        $('psCsv').addEventListener('click', function () { csv(st); });
        $('psPrint').addEventListener('click', function () { var t = 'Account Statement — ' + monthLabel(mk) + ' — ' + (st.panel.name || ''); App.print(t, printable(t, detailHtml(st)), { noHeader: true }); });
        $('psPdf').addEventListener('click', function () {
          Promise.resolve(App.ensureJsPDF ? App.ensureJsPDF() : true).then(function () {
            var uri = buildPdf(st); if (!uri) { App.toast('PDF engine not loaded — check your connection', 'err'); return; }
            var a = document.createElement('a'); a.href = uri; a.download = 'Statement-' + String(st.panel.name || 'panel').replace(/[^A-Za-z0-9]+/g, '-') + '-' + mk + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
          });
        });
        $('psWa').addEventListener('click', function () { sendWa(st); });
        $('psPay').addEventListener('click', function () { receiptModal($('psPan').value, paint); });
        paint();
      } });
  }
  App.panelStatement = statementDialog;

  /* ---------- add / edit a panel ---------- */
  function panelModal(id) {
    var p = id ? DB.get('panels', id) : null;
    p = p || { name: '', contact: '', phone: '', whatsapp: '', email: '', address: '', discountPct: 0, rates: [], creditLimit: '', openingBalance: 0, notes: '', active: true };
    var tests = (DB.all('tests') || []).filter(function (t) { return t.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var body = '<div class="form-grid">' +
      '<div><label class="label">Company / school name *</label><input class="input" id="pnName" maxlength="80" value="' + esc(p.name) + '"></div>' +
      '<div><label class="label">Contact person</label><input class="input" id="pnContact" maxlength="60" value="' + esc(p.contact || '') + '"></div>' +
      '<div><label class="label">Phone</label><input class="input" id="pnPhone" value="' + esc(p.phone || '') + '" placeholder="03xx-xxxxxxx"></div>' +
      '<div><label class="label">WhatsApp</label><input class="input" id="pnWa" value="' + esc(p.whatsapp || '') + '" placeholder="for statements"></div>' +
      '<div><label class="label">Email</label><input class="input" id="pnEmail" type="email" value="' + esc(p.email || '') + '"></div>' +
      '<div><label class="label">Address</label><input class="input" id="pnAddr" maxlength="120" value="' + esc(p.address || '') + '"></div>' +
      '<div><label class="label">Discount on every test (%)</label><input class="input" id="pnDisc" type="number" min="0" max="100" step="0.5" value="' + esc(String(p.discountPct || 0)) + '"></div>' +
      '<div><label class="label">Credit limit (Rs) <span class="muted" style="font-weight:400">optional</span></label><input class="input" id="pnLimit" type="number" min="0" step="any" value="' + esc(String(p.creditLimit === '' || p.creditLimit == null ? '' : p.creditLimit)) + '"></div>' +
      '<div><label class="label">Opening balance (Rs) <span class="muted" style="font-weight:400">already owed before you start</span></label><input class="input" id="pnOpen" type="number" step="any" value="' + esc(String(p.openingBalance || 0)) + '"></div>' +
      '<div><label class="label">Status</label><label style="display:flex;align-items:center;gap:8px;font-weight:600"><input id="pnActive" type="checkbox"' + (p.active !== false ? ' checked' : '') + '> Active</label></div></div>' +
      '<div style="margin-top:14px"><label class="label">Special prices <span class="muted" style="font-weight:400">(optional &mdash; a fixed price for a test; other tests get the discount % above)</span></label>' +
      '<div id="pnRates"></div><button type="button" class="btn btn-ghost btn-sm" id="pnAddRate">+ Add special price</button></div>' +
      '<div style="margin-top:12px"><label class="label">Notes</label><input class="input" id="pnNotes" maxlength="200" value="' + esc(p.notes || '') + '"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">' + (id ? '<button class="btn btn-ghost" id="pnDel" style="color:#b91c1c;margin-right:auto">Delete</button>' : '') + '<button class="btn btn-ghost" id="pnCancel">Cancel</button><button class="btn btn-primary" id="pnSave">' + (id ? 'Save changes' : 'Add client') + '</button></div>';
    App.modal(id ? 'Edit corporate client' : 'Add corporate client', body, { wide: true, onOpen: function (ov, close) {
      var $ = function (i) { return ov.querySelector('#' + i); }, box = $('pnRates');
      function addRate(r) {
        r = r || {};
        box.insertAdjacentHTML('beforeend', '<div class="pn-rate" style="display:flex;gap:8px;margin-bottom:8px;align-items:center"><select class="select pn-rt" style="flex:1;min-width:0"><option value="">Choose test…</option>' +
          tests.map(function (t) { return '<option value="' + esc(t.id) + '"' + (r.testId === t.id ? ' selected' : '') + '>' + esc(t.name) + ' (normal ' + App.money(t.price) + ')</option>'; }).join('') + '</select>' +
          '<input class="input pn-rp" type="number" min="0" step="any" style="width:120px" placeholder="Price" value="' + (r.price == null ? '' : esc(String(r.price))) + '"><button type="button" class="btn btn-ghost btn-sm pn-rx" title="Remove">&times;</button></div>');
        var row = box.lastElementChild; row.querySelector('.pn-rx').addEventListener('click', function () { row.remove(); });
      }
      (p.rates || []).forEach(addRate);
      $('pnAddRate').addEventListener('click', function () { addRate(null); });
      $('pnCancel').addEventListener('click', close);
      if ($('pnDel')) $('pnDel').addEventListener('click', function () {
        var used = (DB.all('invoices') || []).filter(function (i) { return i.panelId === id; }).length + (DB.all('patients') || []).filter(function (x) { return x.panelId === id; }).length;
        if (used) return App.toast('This client has patients or bills. Untick "Active" instead of deleting.', 'err');
        App.confirm('Delete "' + p.name + '"?').then(function (ok) { if (!ok) return; DB.remove('panels', id); App.toast('Deleted.'); close(); render(); });
      });
      $('pnSave').addEventListener('click', function () {
        var name = $('pnName').value.trim(), disc = parseFloat($('pnDisc').value) || 0;
        if (!name) return App.toast('Enter the company / school name.', 'err');
        if (disc < 0 || disc > 100) return App.toast('Discount must be between 0 and 100%.', 'err');
        if ((DB.all('panels') || []).some(function (x) { return x.id !== id && String(x.name).toLowerCase() === name.toLowerCase(); })) return App.toast('A client with this name already exists.', 'err');
        var rates = [], seen = {}, bad = false;
        Array.prototype.forEach.call(box.querySelectorAll('.pn-rate'), function (row) {
          var t = row.querySelector('.pn-rt').value, v = parseFloat(row.querySelector('.pn-rp').value);
          if (!t && isNaN(v)) return; if (!t || isNaN(v) || v < 0 || seen[t]) { bad = true; return; } seen[t] = 1; rates.push({ testId: t, price: v });
        });
        if (bad) return App.toast('Each special price needs a test (once) and a price.', 'err');
        var lim = $('pnLimit').value === '' ? '' : Math.max(0, parseFloat($('pnLimit').value) || 0);
        var data = { name: name, contact: $('pnContact').value.trim(), phone: $('pnPhone').value.trim(), whatsapp: $('pnWa').value.trim(), email: $('pnEmail').value.trim(), address: $('pnAddr').value.trim(),
          discountPct: disc, rates: rates, creditLimit: lim, openingBalance: parseFloat($('pnOpen').value) || 0, notes: $('pnNotes').value.trim(), active: $('pnActive').checked };
        if (id) { DB.update('panels', id, data); App.toast('Saved.'); } else { data.receipts = []; DB.insert('panels', data); App.toast('Client added.'); }
        close(); render();
      });
    } });
  }

  /* ---------- the page ---------- */
  var q = '';
  function render() {
    var view = document.getElementById('view');
    if (!canManage()) { view.innerHTML = '<div class="card"><div class="card-b">' + App.empty('You do not have access to Corporate clients.') + '</div></div>'; return; }
    var list = activePanels(), thisMk = mkOf(new Date());
    var rows = list.map(function (p) { var a = App.panelAccount(p); var mb = (DB.all('invoices') || []).filter(function (i) { return i.panelId === p.id && mkOf(i.createdAt) === thisMk; }).reduce(function (s, i) { return s + (+i.total || 0); }, 0); return { p: p, acc: a, month: mb }; });
    var owed = rows.reduce(function (s, r) { return s + Math.max(0, r.acc.balance); }, 0), monthTot = rows.reduce(function (s, r) { return s + r.month; }, 0);
    var shown = rows.filter(function (r) { return !q || (r.p.name + ' ' + (r.p.contact || '') + ' ' + (r.p.phone || '')).toLowerCase().indexOf(q) >= 0; });
    var overLimit = rows.filter(function (r) { return +r.p.creditLimit > 0 && r.acc.balance > +r.p.creditLimit; }).length;
    var ICONS = {
      users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      cash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
      scale: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7l7-4 7 4"/><path d="M3 13l2-6 2 6a3.5 3.5 0 0 1-4 0z"/><path d="M17 13l2-6 2 6a3.5 3.5 0 0 1-4 0z"/><path d="M8 21h8"/></svg>',
      alert: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };
    var STAT_TINTS = {
      brand: { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
      navy:  { sc: '#0284c7', line: '#aecbe3', soft: '#ebf4f9', circle: '#ddecf5' },
      blue:  { sc: '#2563eb', line: '#a9c9ec', soft: '#e7f0fe', circle: '#dde9fb' },
      amber: { sc: '#d97706', line: '#e9cb96', soft: '#fef4e2', circle: '#fde8c8' },
      green: { sc: '#16a34a', line: '#9fd8b8', soft: '#e6f7f0', circle: '#d8f2e4' },
      red:   { sc: '#dc2626', line: '#e6aaaa', soft: '#fdecec', circle: '#fad2d2' }
    };
    function stat(label, val, sub, tint, icon) {
      var c = STAT_TINTS[tint] || STAT_TINTS.blue;
      return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + ';--sc-line:' + c.line + ';--sc-soft:' + c.soft + ';display:flex;flex-direction:column;justify-content:space-between;height:128px;min-height:128px;box-sizing:border-box;position:relative;background:linear-gradient(55deg,#ffffff 52%,' + c.soft + ' 52%);border:1.5px solid ' + c.line + ' !important;border-radius:14px;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.04);overflow:hidden">' +
        '<div style="position:absolute;top:-30px;right:-30px;width:90px;height:90px;border-radius:50%;background:' + c.circle + ';opacity:0.65;pointer-events:none"></div>' +
        '<div class="stat-ico" style="position:relative;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:' + c.sc + ';background:linear-gradient(135deg,' + c.soft + ' 0%,#ffffff 160%);box-shadow:inset 0 0 0 1px ' + c.line + ',0 1px 3px rgba(15,30,46,.06);margin-bottom:6px;flex:0 0 auto">' + icon + '</div>' +
        '<div class="lb" style="position:relative;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;flex:0 0 auto">' + App.esc(label) + '</div>' +
        '<div class="vl" style="position:relative;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 0 4px 0;flex:0 0 auto">' + val + '</div>' +
        '<div class="dl" style="position:relative;font-size:11.5px;color:var(--muted);font-weight:500;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto">' + sub + '</div>' +
        '</div>';
    }
    view.innerHTML = '<div class="stat-grid">' +
      stat('Clients', String(list.filter(function (p) { return p.active !== false; }).length), 'active corporate panels', 'brand', ICONS.users) +
      stat('Billed this month', rs(monthTot), 'on credit', 'green', ICONS.cash) +
      stat('To collect', rs(owed), 'across all clients', 'amber', ICONS.scale) +
      stat('Over credit limit', overLimit, overLimit ? 'needs recovery' : 'within limits', 'red', ICONS.alert) +
      '</div>' +
      '<div class="card"><div class="card-b">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">' +
      '<input class="input search" id="pnSearch" placeholder="Search client…" value="' + esc(q) + '" style="max-width:340px;flex:1 1 240px">' +
      '<button class="btn btn-primary" id="pnNew">+ Add client</button>' +
      '</div>' +
      (shown.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Client</th><th>Rates</th><th style="text-align:right">This month</th><th style="text-align:right">Outstanding</th><th style="text-align:right">Actions</th></tr></thead><tbody>' + shown.map(function (r) {
        var p = r.p, rr = (p.rates || []).length, lim = +p.creditLimit > 0;
        return '<tr' + (p.active === false ? ' style="opacity:.55"' : '') + '><td><strong>' + esc(p.name) + '</strong>' + (p.active === false ? ' <span class="badge b-unpaid">inactive</span>' : '') + '<div class="muted" style="font-size:12px">' + esc([p.contact, p.phone].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td style="font-size:13px">' + (+p.discountPct ? esc(String(p.discountPct)) + '% off' : '') + (+p.discountPct && rr ? ' + ' : '') + (rr ? rr + ' special price' + (rr === 1 ? '' : 's') : '') + (!+p.discountPct && !rr ? '<span class="muted">normal prices</span>' : '') + '</td>' +
          '<td style="text-align:right">' + rs(r.month) + '</td><td style="text-align:right;font-weight:800;color:' + (r.acc.balance > 0 ? '#b91c1c' : 'inherit') + '">' + rs(r.acc.balance) + (lim && r.acc.balance > +p.creditLimit ? '<div style="font-size:11px;color:#b91c1c">over limit</div>' : '') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-pay="' + esc(p.id) + '">Payment</button> <button class="btn btn-ghost btn-sm" data-stmt="' + esc(p.id) + '">Statement</button> <button class="btn btn-ghost btn-sm" data-edit="' + esc(p.id) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table></div>' : App.empty(list.length ? 'No client matches your search.' : 'No corporate clients yet. Add a company or school, give it special rates, then link patients to it.')) +
      '</div></div>';
    document.getElementById('pnNew').addEventListener('click', function () { panelModal(null); });
    document.getElementById('pnSearch').addEventListener('input', function () { q = this.value.trim().toLowerCase(); var pos = this.selectionStart; render(); var el = document.getElementById('pnSearch'); el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} });
    view.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { panelModal(b.getAttribute('data-edit')); }); });
    view.querySelectorAll('[data-stmt]').forEach(function (b) { b.addEventListener('click', function () { statementDialog(b.getAttribute('data-stmt'), render); }); });
    view.querySelectorAll('[data-pay]').forEach(function (b) { b.addEventListener('click', function () { receiptModal(b.getAttribute('data-pay'), render); }); });
  }
  App.route('#/panels', render);
})();
