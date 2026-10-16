'use strict';

// Synthetic patient data, real report modules and bundled jsPDF. No live sends.
// Run: node scripts/test-report-cnic.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const cnic = '35202-1234567-1';

async function suite(folder) {
  const { jsPDF } = require(path.join(folder, 'assets/vendor/jspdf.umd.min.js'));
  let tables, receipt, uploads = [], prints = [], toasts = [];
  function RecordingPdf(options) {
    const doc = new jsPDF(options);
    receipt = { doc, text: [], lines: [] };
    const text = doc.text, line = doc.line;
    doc.text = function (value, x, y, options) {
      const lh = options && options.lineHeightFactor || doc.getLineHeightFactor();
      (Array.isArray(value) ? value : [value]).forEach((value, i) => receipt.text.push({
        value: String(value), x, y: y + i * doc.getFontSize() * lh / doc.internal.scaleFactor,
        width: doc.getTextWidth(String(value)), align: options && options.align,
        page: doc.internal.getCurrentPageInfo().pageNumber
      }));
      return text.apply(doc, arguments);
    };
    doc.line = function (x1, y1, x2, y2) {
      receipt.lines.push({ x1, y1, x2, y2, page: doc.internal.getCurrentPageInfo().pageNumber });
      return line.apply(doc, arguments);
    };
    return doc;
  }
  const DB = {
    all: name => tables[name] || [],
    get: (name, id) => (tables[name] || []).find(row => row.id === id) || null,
    update(name, id, values) { Object.assign(this.get(name, id), values); },
    authHeaders: headers => headers
  };
  const App = {
    esc, route() {}, toast: message => toasts.push(message), d: () => '10-Oct-2026',
    money: value => 'Rs ' + Number(value || 0), ensureJsPDF: async () => true,
    print: (title, html) => prints.push(html), isNative: () => false,
    visitNos: () => ({ labText: 'INV # 001', labCode: '001', caseText: 'P # 01', caseCode: '01', cas: 1 })
  };
  const context = vm.createContext({
    App, DB, console, setTimeout() {}, location: {},
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem: () => null }, jspdf: { jsPDF: RecordingPdf },
    LABPOS_API: 'https://fixture.invalid',
    qrcode: () => ({ addData() {}, make() {}, createDataURL: () => pixel }),
    fetch: async (url, options) => {
      if (url === 'https://fixture.invalid/api/report-pdf/render') {
        const html = JSON.parse(options.body).html;
        assert.ok(html.includes(cnic), 'CNIC reaches the canonical report document');
        const pdf = App.testPdf('i', html.includes('data-qr="1"') ? pixel : null, null, { noLabHeader: !html.includes('CNIC Fixture Lab') });
        return { ok: true, json: async () => ({ dataUri: 'data:application/pdf;base64,' + pdf.dataUri.split('base64,')[1] }) };
      }
      assert.equal(url, 'https://fixture.invalid/api/report-pdfs');
      const body = JSON.parse(options.body);
      uploads.push(body);
      return { json: async () => ({ url: 'https://fixture.invalid/r/' + body.key }) };
    }
  });
  context.window = context;
  let source = fs.readFileSync(path.join(folder, 'assets/js/mod-results.js'), 'utf8');
  source = source.replace(/\}\)\(\);\s*$/, 'App.testData = reportData; App.testHtml = reportHtml; App.testGrid = patientGridHtml; App.testPdf = buildReportPdf; App.testPrint = printReport; })();');
  vm.runInContext(source, context);

  function fixture(value, count = 1) {
    uploads = []; prints = []; toasts = [];
    const params = Array.from({ length: count }, (_, i) => ({ name: 'Analyte ' + i, ref: '1-10', unit: 'mg' }));
    tables = {
      patients: [{ id: 'p', name: 'Synthetic Patient', father: 'Synthetic Parent', cnic: value, age: 34, gender: 'Female', blood: 'O+', phone: '0300-0000000', address: 'Fixture Street' }],
      invoices: [{ id: 'i', no: 'INV-CNIC', patientId: 'p', doctorId: 'd', status: 'paid', due: 0, total: 500, paid: 500, reportPdfKey: 'rpt-cnic-fixture', createdAt: '2026-10-10T08:00:00Z', regLocation: 'Reception', destLocation: 'Main Lab', items: [{ testId: 't', name: 'Fixture Assay' }] }],
      doctors: [{ id: 'd', name: 'Synthetic Consultant' }],
      settings: [{ id: 'main', labName: 'CNIC Fixture Lab', showQr: true, showBarcode: false }],
      tests: [{ id: 't', name: 'Fixture Assay', params }],
      results: [{ id: 'r', invoiceId: 'i', testId: 't', status: 'ready', reportedAt: '2026-10-10T09:00:00Z', values: Object.fromEntries(params.map(p => [p.name, '5'])) }]
    };
  }
  const text = (value, page) => receipt.text.find(t => t.value === value && t.page === page);
  function checkPages(value, multiPage) {
    const pages = receipt.doc.getNumberOfPages();
    if (multiPage) assert.ok(pages > 1 && pages < 15, 'Bounded multi-page report');
    const shown = value != null && String(value).trim() !== '';
    const COLON = 12 + 186 * 0.25;          // left column: ":" at 20% of the width, value 3mm after it
    for (let page = 1; page <= pages; page++) {
      const label = text('CNIC', page), patient = text('Patient Name', page), visit = text('Registration Date', page);
      const phone = text('Phone', page), address = text('Address', page);
      const footer = text('Electronically verified report. No signatures necessary.', page);
      assert.ok(patient && visit && phone && address && footer, 'Full identity and footer on page ' + page);
      /* the CNIC row is ALWAYS printed (left column, after Phone, before Address); an empty one has nothing after the ":" */
      assert.ok(label && label.x === 14, 'CNIC label in the left column on page ' + page);
      assert.ok(receipt.text.some(t => t.page === page && t.value === ':' && t.y === label.y && Math.abs(t.x - COLON) < 0.01), 'CNIC colon aligned');
      assert.ok(label.y > phone.y && label.y < address.y, 'CNIC sits after Phone and before Address');
      assert.ok(label.y < footer.y - 3 && label.y > patient.y);
      const rendered = receipt.text.find(t => t.page === page && t.y === label.y && Math.abs(t.x - (COLON + 3)) < 0.01);
      if (shown) assert.equal(rendered && rendered.value.trim(), String(value).trim(), 'CNIC PDF value');
      else assert.ok(!rendered || rendered.value.trim() === '', 'Empty CNIC prints nothing after the colon');
      assert.ok(patient.x === 14 && visit.x === 107 && patient.y === visit.y, 'Identity left, visit right, top-aligned');
      const rule = receipt.lines.filter(l => l.page === page && l.x1 === 12 && l.x2 === 198 && l.y1 > patient.y && l.y1 < footer.y - 3 && l.y1 < (receipt.text.find(t => t.page === page && /^Analyte \d+$/.test(t.value)) || { y: Infinity }).y);
      assert.equal(rule.length, 1, 'One closing rule, no divider');
      assert.ok(rule[0].y1 > address.y && rule[0].y1 > text('Consultant', page).y, 'Rule closes the block below both columns');
      for (const item of receipt.text.filter(t => t.page === page)) {
        const left = item.x - (item.align === 'right' ? item.width : item.align === 'center' ? item.width / 2 : 0);
        assert.ok(left >= 11.5 && left + item.width <= 198.5, 'Horizontal bounds: ' + JSON.stringify(item));
        assert.ok(item.y >= 11 && item.y <= 293.1, 'Page bounds: ' + JSON.stringify(item));
        if (/^Analyte \d+$/.test(item.value)) {
          assert.ok(item.y > Math.max(address.y, text('Consultant', page).y) + 4, 'Results below complete patient block');
          assert.ok(item.y < footer.y - 3, 'Result above footer');
        }
      }
    }
    for (const param of tables.tests[0].params) assert.equal(receipt.text.filter(t => t.value === param.name).length, 1, 'Every result survives pagination');
  }
  function checkHtml(value) {
    const data = App.testData('i');
    const html = App.testHtml(data), grid = App.testGrid(data);
    assert.ok(html.includes(grid), 'Actual printable HTML includes identity grid');
    const expected = value == null ? '' : String(value).trim();
    const names = ['Patient Name', 'Father / Husband Name', 'Age / Sex', 'Blood Group', 'Phone', 'CNIC', 'Address', 'Registration Date', 'Reporting Date', 'Registration Location', 'Destination Location', 'Reference', 'Consultant'];
    assert.equal((grid.match(/>CNIC</g) || []).length, 1, 'CNIC row always present');
    const patientCol = grid.slice(grid.indexOf('class="rpt-info-patient"'), grid.indexOf('class="rpt-info-visit"'));
    assert.ok(patientCol.indexOf('>Phone<') < patientCol.indexOf('>CNIC<') && patientCol.indexOf('>CNIC<') < patientCol.indexOf('>Address<'), 'HTML: CNIC after Phone, before Address');
    const field = grid.slice(grid.indexOf('>CNIC<'), grid.indexOf('</div>', grid.indexOf('>CNIC<')));
    if (!expected) assert.ok(field.includes('&nbsp;'), 'Empty CNIC shows an empty value after the colon');
    else {
      assert.ok(field.includes(esc(expected)), 'Escaped HTML CNIC');
      if (expected.includes('<')) assert.ok(!grid.includes(expected), 'CNIC cannot inject HTML');
    }
    for (const name of names) assert.ok(grid.includes(name), 'Preserved field: ' + name);
  }

  // Populated, blank and special-character records also exercise repeated headers.
  for (const value of [cnic, '', undefined, null, '   ', '<&"\'CNIC>']) {
    const multiPage = value === cnic || value === '' || value === '<&"\'CNIC>';
    fixture(value, multiPage ? 70 : 1);
    const before = JSON.stringify(tables);
    checkHtml(value);
    const result = App.testPdf('i', pixel);
    assert.ok(result && result.dataUri.startsWith('data:application/pdf;'));
    const bytes = Buffer.from(result.dataUri.split('base64,')[1], 'base64').toString('latin1');
    assert.ok(bytes.startsWith('%PDF-'));
    if (value === cnic) assert.ok(bytes.includes(cnic), 'Real PDF bytes include patient CNIC');
    checkPages(value, multiPage);
    assert.equal(JSON.stringify(tables), before, 'Rendering preserves records');
    assert.deepEqual(toasts, []);
  }

  // QR's real print -> PDF -> upload flow, not just the HTML preview.
  fixture(cnic, 70);
  const before = JSON.stringify(tables);
  await App.testPrint('i', { noLabHeader: true });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].key, 'rpt-cnic-fixture');
  assert.ok(Buffer.from(uploads[0].pdfBase64, 'base64').toString('latin1').includes(cnic));
  assert.ok(prints[0].includes(cnic));
  assert.ok(!receipt.text.some(t => t.value === 'CNIC Fixture Lab'), 'Preprinted option preserved');
  checkPages(cnic, true);
  assert.equal(JSON.stringify(tables), before, 'Upload preserves patient/clinical records and stable key');

  // A CNIC in the patient record must not enter any ready/due/doctor message.
  for (const api of [App.wa, App.sms]) {
    const inv = tables.invoices[0], patient = tables.patients[0], doctor = tables.doctors[0];
    for (const message of [api.patientMsg(inv, patient, ['Fixture Assay'], ''), api.dueMsg(inv, patient, ['Fixture Assay']), api.doctorMsg(inv, doctor, patient, ['Fixture Assay'], '')]) {
      assert.ok(!message.includes(cnic), 'No patient CNIC in outbound SMS/WhatsApp text');
    }
  }

  console.log('PASS: ' + (path.relative(root, folder) || 'web') + ' CNIC: populated and empty (row always printed after Phone) / escaped HTML, actual multi-page PDF bounds and identity layout, QR upload, immutable records and SMS/WhatsApp exclusion.');
}

(async () => {
  for (const folder of [root, path.join(root, 'electron-src'), path.join(root, 'electron-tools/installer/app-stage-win7')]) await suite(folder);
})().catch(error => { console.error(error); process.exitCode = 1; });
