/* Optix Medical Sync — Doctor referral statement (opened from Doctors -> "Statement" / "Monthly statements").
   For a month: every invoice a doctor referred, the amount billed, the commission it earns (the doctor's commission % of the invoice total, the
   same rule as the Doctors page), what has already been paid out and what is still due. Print, PDF, WhatsApp (with a link to the PDF) and CSV. */
(function () {
  'use strict';
  var esc = App.esc;

  function mkOf(d) { var x = new Date(d); if (isNaN(x.getTime())) return ''; return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); }
  function monthLabel(mk) { var p = mk.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function months() {
    var out = [], n = new Date();
    for (var i = 0; i < 12; i++) { var d = new Date(n.getFullYear(), n.getMonth() - i, 1); var k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); out.push({ key: k, label: monthLabel(k) }); }
    return out;
  }
  function rs(n) { return 'Rs ' + Math.round(+n || 0).toLocaleString('en-US'); }
  function lab() { try { return DB.get('settings', 'main') || {}; } catch (e) { return {}; } }

  /* one doctor, one month */
  function compute(docId, mk) {
    var doc = DB.get('doctors', docId) || {}, pct = +doc.commissionPct || 0, tById = App.testsById();
    var rows = (DB.all('invoices') || []).filter(function (i) { return i.doctorId === docId && mkOf(i.createdAt) === mk; })
      .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); })
      .map(function (i) {
        var p = DB.get('patients', i.patientId) || {};
        var tests = (i.items || []).map(function (x) { return x.name || x.code || ''; }).filter(Boolean).join(', ');
        var total = +i.total || 0;
        return { date: i.createdAt, no: i.no || i.id, patient: p.name || '—', tests: tests, total: total, paid: +i.paid || 0, comm: App.commissionOf(i, doc, tById) };
      });
    var billed = rows.reduce(function (s, r) { return s + r.total; }, 0), comm = rows.reduce(function (s, r) { return s + r.comm; }, 0);
    var payouts = (doc.commissionPaid || []).filter(function (x) { return mkOf(x.date) === mk; });
    var paidOut = payouts.reduce(function (s, x) { return s + (+x.amount || 0); }, 0);
    var pats = {}; rows.forEach(function (r) { pats[r.patient] = 1; });
    var effPct = billed > 0 ? Math.round(comm / billed * 1000) / 10 : pct;
    return { doc: doc, pct: (doc.commissionRules || []).length ? effPct : pct, special: (doc.commissionRules || []).length > 0, mk: mk, rows: rows, referrals: rows.length, patients: Object.keys(pats).length, billed: billed, comm: comm, paidOut: paidOut, due: Math.max(0, comm - paidOut) };
  }
  function allDoctors(mk) {
    return (DB.all('doctors') || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (d) { return compute(d.id, mk); }).filter(function (s) { return s.referrals > 0 || s.paidOut > 0; });
  }

  /* ---------- HTML (preview + print) ---------- */
  var TH = 'text-align:left;padding:7px 8px;border-bottom:2px solid #131845;font-size:12px;color:#131845;text-transform:uppercase;letter-spacing:.03em';
  var TD = 'padding:7px 8px;border-bottom:1px solid #e3e8f2;font-size:12.5px;vertical-align:top';
  function detailHtml(s) {
    var d = s.doc;
    return '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + TH + '">Date</th><th style="' + TH + '">Invoice</th><th style="' + TH + '">Patient</th><th style="' + TH + '">Tests</th>' +
      '<th style="' + TH + ';text-align:right">Billed</th><th style="' + TH + ';text-align:right">Commission</th></tr></thead><tbody>' +
      (s.rows.length ? s.rows.map(function (r) {
        return '<tr><td style="' + TD + '">' + esc(App.d(r.date)) + '</td><td style="' + TD + '">' + esc(r.no) + '</td><td style="' + TD + '">' + esc(r.patient) + '</td>' +
          '<td style="' + TD + ';color:#5b6b80">' + esc(r.tests.length > 70 ? r.tests.slice(0, 68) + '…' : r.tests) + '</td><td style="' + TD + ';text-align:right">' + rs(r.total) + '</td><td style="' + TD + ';text-align:right">' + rs(r.comm) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" style="' + TD + ';text-align:center;color:#8a94a6;padding:22px">No referrals this month.</td></tr>') +
      '</tbody></table>' +
      '<div style="margin:14px 0 0 auto;max-width:340px;font-size:13.5px">' +
      line('Referrals', s.referrals + ' (' + s.patients + ' patient' + (s.patients === 1 ? '' : 's') + ')') + line('Total billed', rs(s.billed)) +
      line('Commission (' + (s.special ? 'avg ' : '') + s.pct + '%)', rs(s.comm)) + line('Already paid this month', rs(s.paidOut)) + line('Balance due', '<b style="color:' + (s.due > 0 ? '#b91c1c' : '#047857') + '">' + rs(s.due) + '</b>') + '</div>';
  }
  function line(a, b) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e3e8f2"><span style="color:#5b6b80">' + a + '</span><span>' + b + '</span></div>'; }
  function summaryHtml(list, mk) {
    var t = list.reduce(function (a, s) { a.r += s.referrals; a.b += s.billed; a.c += s.comm; a.p += s.paidOut; a.d += s.due; return a; }, { r: 0, b: 0, c: 0, p: 0, d: 0 });
    return '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + TH + '">Doctor</th><th style="' + TH + ';text-align:right">Referrals</th><th style="' + TH + ';text-align:right">Billed</th><th style="' + TH + ';text-align:right">%</th>' +
      '<th style="' + TH + ';text-align:right">Commission</th><th style="' + TH + ';text-align:right">Paid</th><th style="' + TH + ';text-align:right">Due</th></tr></thead><tbody>' +
      (list.length ? list.map(function (s) {
        return '<tr><td style="' + TD + '"><b>' + esc(s.doc.name || '') + '</b><div style="font-size:11.5px;color:#8a94a6">' + esc(s.doc.clinic || '') + '</div></td><td style="' + TD + ';text-align:right">' + s.referrals + '</td><td style="' + TD + ';text-align:right">' + rs(s.billed) + '</td>' +
          '<td style="' + TD + ';text-align:right">' + s.pct + '</td><td style="' + TD + ';text-align:right">' + rs(s.comm) + '</td><td style="' + TD + ';text-align:right">' + rs(s.paidOut) + '</td><td style="' + TD + ';text-align:right"><b>' + rs(s.due) + '</b></td></tr>';
      }).join('') + '<tr><td style="' + TD + ';font-weight:800">Total</td><td style="' + TD + ';text-align:right;font-weight:800">' + t.r + '</td><td style="' + TD + ';text-align:right;font-weight:800">' + rs(t.b) + '</td><td style="' + TD + '"></td>' +
        '<td style="' + TD + ';text-align:right;font-weight:800">' + rs(t.c) + '</td><td style="' + TD + ';text-align:right;font-weight:800">' + rs(t.p) + '</td><td style="' + TD + ';text-align:right;font-weight:800">' + rs(t.d) + '</td></tr>'
        : '<tr><td colspan="7" style="' + TD + ';text-align:center;color:#8a94a6;padding:22px">No referrals in ' + esc(monthLabel(mk)) + '.</td></tr>') + '</tbody></table>';
  }
  function printable(title, inner) {
    var L = lab();
    return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2540;padding:6px 4px">' +
      '<div style="border-bottom:3px solid #131845;padding-bottom:8px;margin-bottom:12px"><div style="font-size:22px;font-weight:800;color:#131845">' + esc(L.labName || 'Lab') + '</div>' +
      '<div style="font-size:12px;color:#5b6b80">' + esc([L.address, L.phone, L.email].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:10px">' + esc(title) + '</div>' + inner + '</div>';
  }

  /* ---------- PDF (jsPDF) ---------- */
  function buildPdf(s) {
    var JS = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF; if (!JS) return null;
    var doc = new JS({ unit: 'mm', format: 'a4' }), L = lab(), W = 210, M = 14, y = M, page = 1;
    var NAVY = [19, 24, 69];
    function head() {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]); doc.text(String(L.labName || 'Lab'), M, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 100, 120);
      doc.text(String([L.address, L.phone, L.email].filter(Boolean).join('  |  ')).slice(0, 110), M, y + 10.5);
      doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]); doc.setLineWidth(0.7); doc.line(M, y + 13, W - M, y + 13); y += 19;
    }
    head();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20); doc.text('Doctor Referral Statement - ' + monthLabel(s.mk), M, y); y += 7;
    doc.setFontSize(10.5); doc.text(String(s.doc.name || ''), M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80, 90, 110);
    doc.text(String([s.doc.clinic, s.doc.phone].filter(Boolean).join('  |  ')) + (s.doc.clinic || s.doc.phone ? '  |  ' : '') + 'Commission ' + (s.special ? 'avg ' : '') + s.pct + '%', M, y + 5); y += 11;
    var X = { date: M, no: M + 22, pat: M + 46, tests: M + 86, bill: W - M - 30, comm: W - M };
    function th() {
      doc.setFillColor(233, 237, 249); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('DATE', X.date + 1, y); doc.text('INVOICE', X.no, y); doc.text('PATIENT', X.pat, y); doc.text('TESTS', X.tests, y); doc.text('BILLED', X.bill, y, { align: 'right' }); doc.text('COMMISSION', X.comm - 1, y, { align: 'right' }); y += 6;
    }
    th();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(30, 30, 30);
    s.rows.forEach(function (r) {
      var tl = doc.splitTextToSize(String(r.tests || ''), 42).slice(0, 3), pl = doc.splitTextToSize(String(r.patient), 38).slice(0, 2), h = Math.max(tl.length, pl.length) * 4 + 2;
      if (y + h > 262) { doc.addPage(); page++; y = M; th(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(30, 30, 30); }
      doc.text(String(App.d(r.date)), X.date + 1, y); doc.text(String(r.no), X.no, y); doc.text(pl, X.pat, y); doc.text(tl, X.tests, y);
      doc.text(rs(r.total), X.bill, y, { align: 'right' }); doc.text(rs(r.comm), X.comm - 1, y, { align: 'right' });
      y += h; doc.setDrawColor(225, 230, 240); doc.setLineWidth(0.2); doc.line(M, y - 3, W - M, y - 3);
    });
    if (!s.rows.length) { doc.setTextColor(120, 130, 150); doc.text('No referrals this month.', M + 1, y); y += 8; }
    if (y + 40 > 285) { doc.addPage(); page++; y = M; }
    y += 4; var bx = W - M - 82;
    function kv(a, b, bold, red) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(red ? 185 : 40, red ? 28 : 40, red ? 28 : 40); doc.text(a, bx, y); doc.text(b, W - M, y, { align: 'right' }); y += 6; }
    kv('Referrals', s.referrals + ' (' + s.patients + ' patient' + (s.patients === 1 ? '' : 's') + ')'); kv('Total billed', rs(s.billed)); kv('Commission (' + (s.special ? 'avg ' : '') + s.pct + '%)', rs(s.comm));
    kv('Already paid this month', rs(s.paidOut)); doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]); doc.setLineWidth(0.4); doc.line(bx, y - 3.5, W - M, y - 3.5); kv('Balance due', rs(s.due), true, s.due > 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 140, 160);
    for (var p = 1; p <= page; p++) { doc.setPage(p); doc.text('Generated ' + new Date().toLocaleDateString('en-GB') + '  |  Page ' + p + ' of ' + page, W / 2, 291, { align: 'center' }); }
    return doc.output('datauristring');
  }

  /* ---------- CSV ---------- */
  function csv(list, mk, single) {
    var out = single ? [['Date', 'Invoice', 'Patient', 'Tests', 'Billed', 'Commission']] : [['Doctor', 'Clinic', 'Referrals', 'Billed', 'Commission %', 'Commission', 'Paid', 'Due']];
    if (single) list.rows.forEach(function (r) { out.push([App.d(r.date), r.no, r.patient, r.tests, Math.round(r.total), Math.round(r.comm)]); });
    else list.forEach(function (s) { out.push([s.doc.name, s.doc.clinic || '', s.referrals, Math.round(s.billed), s.pct, Math.round(s.comm), Math.round(s.paidOut), Math.round(s.due)]); });
    var text = out.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = 'doctor-statement-' + (single ? String(list.doc.name || 'doctor').replace(/[^A-Za-z0-9]+/g, '-') + '-' : 'all-') + mk + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- WhatsApp: upload the PDF, send a short summary with the link ---------- */
  function sendWa(s) {
    var d = s.doc;
    function go() {
      var cfg = App.wa.cfg();
      if (!App.wa.ready(cfg)) { App.toast('WhatsApp is not set up yet (Tools → WhatsApp → Settings)', 'err'); return; }
      var to = App.wa.phone(d.whatsapp || d.phone); if (!to) { App.toast('No WhatsApp / phone number saved for this doctor', 'err'); return; }
      App.toast('Preparing the statement…', 'info');
      Promise.resolve(App.ensureJsPDF ? App.ensureJsPDF() : true).then(function () {
        var uri = buildPdf(s); if (!uri) throw new Error('Could not build the PDF');
        var key = 'stmt-' + String(d.id).replace(/[^A-Za-z0-9]/g, '') + '-' + s.mk + '-' + Math.random().toString(36).slice(2, 8);
        var base = String(window.LABPOS_API || '').replace(/\/+$/, '');
        return fetch(base + '/api/report-pdfs', { method: 'POST', headers: (DB.authHeaders ? DB.authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' }), body: JSON.stringify({ key: key, pdfBase64: uri.slice(uri.indexOf(',') + 1) }) })
          .then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.url) throw new Error((j && j.error) || 'Could not upload the PDF'); return j.url; });
      }).then(function (url) {
        var L = lab();
        var msg = '*' + (L.labName || 'Our lab') + '*\n\nAssalam-o-Alaikum ' + (d.name || 'Doctor') + ',\n\nYour referral statement for *' + monthLabel(s.mk) + '*:\n\n' +
          '*Referrals:* ' + s.referrals + '\n*Total billed:* ' + rs(s.billed) + '\n*Commission (' + s.pct + '%):* ' + rs(s.comm) + '\n*Paid:* ' + rs(s.paidOut) + '\n*Balance due:* ' + rs(s.due) + '\n\nFull statement (PDF): ' + url + '\n\nThank you for your valued referrals.\n' + (L.labName || '');
        App.wa.send(cfg, to, msg, function (err) {
          try { App.wa.log({ kind: 'statement', invoiceId: null, to: to, toName: d.name || '', toRole: 'doctor', status: err ? 'failed' : 'sent', error: err ? String(err.message || err).slice(0, 200) : '' }); } catch (e) {}
          if (err) App.toast('WhatsApp failed: ' + String(err.message || err).slice(0, 120), 'err'); else App.toast('Statement sent to ' + (d.name || 'doctor') + ' on WhatsApp');
        });
      }).catch(function (e) { App.toast((e && e.message) || 'Could not send', 'err'); });
    }
    if (App.wa && App.wa.send) go(); else App.loadScript('assets/js/mod-results.js').then(go, function () { App.toast('Could not load WhatsApp', 'err'); });
  }

  /* ---------- the dialog ---------- */
  App.doctorStatement = function (docId) {
    var mk = months()[0].key, cur = docId || '';
    var docs = (DB.all('doctors') || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    App.modal('Doctor statement',
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px"><select class="select" id="dsMonth" style="min-width:170px">' + months().map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="dsDoc" style="min-width:220px;flex:1"><option value="">All doctors (summary)</option>' + docs.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></div>' +
      '<div id="dsBody" style="max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:10px"></div>' +
      '<div class="actions" style="margin-top:14px;flex-wrap:wrap;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" id="dsClose">Close</button><button class="btn btn-ghost" id="dsCsv">Export CSV</button><button class="btn btn-ghost" id="dsPrint">Print</button>' +
      '<button class="btn btn-ghost" id="dsPdf">Download PDF</button><button class="btn btn-primary" id="dsWa">Send on WhatsApp</button></div>',
      { wide: true, onOpen: function (ov, close) {
          var $ = function (id) { return ov.querySelector('#' + id); }, state = null;
          function paint() {
            mk = $('dsMonth').value; cur = $('dsDoc').value;
            if (cur) { state = compute(cur, mk); $('dsBody').innerHTML = detailHtml(state); }
            else { state = allDoctors(mk); $('dsBody').innerHTML = summaryHtml(state, mk); }
            $('dsPdf').style.display = $('dsWa').style.display = cur ? '' : 'none';
          }
          $('dsMonth').addEventListener('change', paint); $('dsDoc').addEventListener('change', paint); $('dsClose').addEventListener('click', close);
          $('dsCsv').addEventListener('click', function () { csv(state, mk, !!cur); });
          $('dsPrint').addEventListener('click', function () {
            var title = cur ? 'Doctor Referral Statement — ' + monthLabel(mk) + ' — ' + (state.doc.name || '') : 'Doctors — Monthly Summary — ' + monthLabel(mk);
            App.print(title, printable(title, cur ? detailHtml(state) : summaryHtml(state, mk)), { noHeader: true });
          });
          $('dsPdf').addEventListener('click', function () {
            Promise.resolve(App.ensureJsPDF ? App.ensureJsPDF() : true).then(function () {
              var uri = buildPdf(state); if (!uri) { App.toast('PDF engine not loaded — check your connection', 'err'); return; }
              var a = document.createElement('a'); a.href = uri; a.download = 'Statement-' + String(state.doc.name || 'doctor').replace(/[^A-Za-z0-9]+/g, '-') + '-' + mk + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
            });
          });
          $('dsWa').addEventListener('click', function () { sendWa(state); });
          paint();
        } });
  };
})();
