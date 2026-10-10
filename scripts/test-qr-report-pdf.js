'use strict';

// Synthetic records only. Real bundled jsPDF/config/modules, mocked upload transport.
// Run: node scripts/test-qr-report-pdf.js (web, desktop source and staged desktop).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const words = (prefix, count) => Array.from({ length: count }, (_, i) => prefix + i).join(' ');

async function suite(folder) {
  const { jsPDF } = require(path.join(folder, 'assets/vendor/jspdf.umd.min.js'));
  let tables, receipt, uploads = [], prints = [], messages = [], native = false, outputFailure = '', qrTargets = [];
  function RecordingPdf(options) {
    const doc = new jsPDF(options);
    receipt = { doc, text: [], line: [], rect: [], circle: [], triangle: [], images: [] };
    const page = () => doc.internal.getCurrentPageInfo().pageNumber;
    const text = doc.text;
    doc.text = function (value, x, y, options) {
      (Array.isArray(value) ? value : [value]).forEach((value, i) => receipt.text.push({
        value: String(value), x, y: y + i * doc.getFontSize() * doc.getLineHeightFactor() / doc.internal.scaleFactor,
        width: doc.getTextWidth(String(value)), align: options && options.align, page: page()
      }));
      return text.apply(doc, arguments);
    };
    for (const kind of ['line', 'rect', 'circle', 'triangle']) {
      const original = doc[kind];
      doc[kind] = function (...args) {
        receipt[kind].push({ args, page: page(), color: doc.getDrawColor(), fill: doc.getFillColor() });
        return original.apply(doc, args);
      };
    }
    const addImage = doc.addImage;
    doc.addImage = function (...args) { receipt.images.push({ args, page: page() }); return addImage.apply(doc, args); };
    const output = doc.output;
    doc.output = function (...args) {
      if (outputFailure === 'throw') throw new Error('fixture output failure');
      if (outputFailure === 'empty') return undefined;
      if (outputFailure === 'invalid') return 'not a PDF data URI';
      return output.apply(doc, args);
    };
    return doc;
  }
  const DB = {
    all: name => tables[name] || [],
    get: (name, id) => (tables[name] || []).find(record => record.id === id) || null,
    update(name, id, changes) { Object.assign(this.get(name, id), changes); },
    authHeaders: headers => Object.assign({}, headers, { 'X-Fixture-Auth': 'fixture' })
  };
  const App = {
    esc, route() {}, toast: message => messages.push(message), ensureJsPDF: async () => true,
    print: (title, html) => prints.push({ title, html }), isNative: () => native,
    visitNos: () => ({ labText: 'INV # 01 - 10/2026', labCode: 'INV01-10-2026', caseText: 'P # 01 - 09/10', caseCode: 'P01-09-10', cas: 1 })
  };
  const context = vm.createContext({
    App, DB, console, setTimeout() {}, location: {},
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem: () => null }, jspdf: { jsPDF: RecordingPdf },
    LABPOS_API: 'https://fixture.invalid',
    qrcode: () => ({ addData: url => qrTargets.push(url), make() {}, createDataURL: () => pixel }),
    fetch: async (url, options) => {
      assert.equal(url, 'https://fixture.invalid/api/report-pdfs');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Fixture-Auth'], 'fixture');
      const body = JSON.parse(options.body);
      assert.ok(Buffer.from(body.pdfBase64, 'base64').toString('latin1').startsWith('%PDF-'));
      uploads.push(body);
      return { json: async () => ({ url: 'https://fixture.invalid/r/' + body.key }) };
    }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(folder, 'assets/js/graph-config.js'), 'utf8'), context);
  let source = fs.readFileSync(path.join(folder, 'assets/js/mod-results.js'), 'utf8');
  source = source.replace(/\}\)\(\);\s*$/, 'App.testPdf = buildReportPdf; App.testData = reportData; App.testHtml = reportHtml; App.testPrint = printReport; })();');
  vm.runInContext(source, context);

  function fixture() {
    uploads = []; prints = []; messages = []; native = false; outputFailure = ''; qrTargets = [];
    context.location.href = '';
    tables = {
      patients: [{ id: 'p', name: 'Synthetic Patient', father: 'Synthetic Parent', age: 34, gender: 'Female', blood: 'O+', phone: '0300-0000000', address: 'Fixture Street' }],
      invoices: [{ id: 'i', no: 'CURRENT-001', patientId: 'p', doctorId: 'd', status: 'paid', reportPdfKey: 'rpt-fixture-stable', createdAt: '2026-10-09T08:00:00Z', regLocation: 'Fixture Reception', destLocation: 'Fixture Lab', reference: 'Fixture Reference', items: [{ testId: 't', name: 'OGTT Extended' }, { testId: 'pending', name: 'Pending assay' }] }],
      doctors: [{ id: 'd', name: 'Fixture Consultant' }],
      settings: [{ id: 'main', labName: 'Fixture Laboratory', showQr: true, showBarcode: true }],
      tests: [{ id: 't', name: 'OGTT Extended', code: 'OGTT', params: [
        { name: 'Glucose 0 min', ref: '70-140', unit: 'mg/dL', type: 'number' },
        { name: 'Glucose 30 min', ref: '70-140', unit: 'mg/dL', type: 'number' },
        { name: 'Glucose 60 min', ref: '70-140', unit: 'mg/dL', type: 'number' },
        { name: 'History only', ref: '1-10', unit: 'mg' }
      ] }, { id: 'pending', name: 'Pending assay', params: [{ name: 'Hidden pending value' }] }],
      results: [{ id: 'r', invoiceId: 'i', testId: 't', status: 'ready', reportedAt: '2026-10-09T10:00:00Z', values: { 'Glucose 0 min': '91', 'Glucose 30 min': 'not measured', 'Glucose 60 min': '172' } },
        { id: 'rp', invoiceId: 'i', testId: 'pending', status: 'pending', values: { 'Hidden pending value': '999999' } }]
    };
    for (const [id, date, patientId, status, value] of [
      ['older', '2026-09-02', 'p', 'ready', '108'], ['newer', '2026-10-02', 'p', 'ready', '109'],
      ['oldest', '2026-08-02', 'p', 'ready', '107'], ['other-patient', '2026-10-05', 'other', 'ready', '106'],
      ['unready', '2026-10-06', 'p', 'pending', '105']
    ]) {
      tables.invoices.push({ id, no: id.toUpperCase(), patientId, createdAt: date + 'T08:00:00Z', items: [{ testId: 't', name: 'OGTT Extended' }] });
      tables.results.push({ id: 'r-' + id, invoiceId: id, testId: 't', status, reportedAt: date + 'T10:00:00Z', values: { 'History only': value, 'Glucose 0 min': '88' } });
    }
  }
  const text = value => receipt.text.filter(t => t.value === value);
  function build(opts, pre) {
    const before = JSON.stringify(tables);
    const out = App.testPdf('i', pixel, pre, opts);
    assert.ok(out && out.dataUri.includes('base64,'));
    const bytes = Buffer.from(out.dataUri.split('base64,')[1], 'base64').toString('latin1');
    assert.ok(bytes.startsWith('%PDF-'));
    assert.ok(bytes.includes('Synthetic Patient'));
    assert.equal(JSON.stringify(tables), before, 'PDF drawing is read-only');
    return out;
  }
  function bounds() {
    for (const t of receipt.text) {
      const left = t.x - (t.align === 'right' ? t.width : t.align === 'center' ? t.width / 2 : 0);
      assert.ok(left >= 11.5 && left + t.width <= 198.5, 'Horizontal text bounds: ' + JSON.stringify(t));
      assert.ok(t.y >= 11 && t.y <= 293.1, 'Vertical text bounds: ' + JSON.stringify(t));
    }
    for (const kind of ['line', 'rect', 'circle', 'triangle']) {
      for (const shape of receipt[kind]) {
        const a = shape.args;
        const points = kind === 'rect' ? [[a[0], a[1]], [a[0] + a[2], a[1] + a[3]]]
          : kind === 'circle' ? [[a[0] - a[2], a[1] - a[2]], [a[0] + a[2], a[1] + a[2]]]
          : kind === 'triangle' ? [[a[0], a[1]], [a[2], a[3]], [a[4], a[5]]]
          : [[a[0], a[1]], [a[2], a[3]]];
        for (const [x, y] of points) assert.ok(x >= 11.5 && x <= 198.5 && y >= 11 && y <= 293.1, kind + ' bounds: ' + JSON.stringify(shape));
      }
    }
    for (let page = 1; page <= receipt.doc.getNumberOfPages(); page++) {
      const footer = text('Electronically verified report. No signatures necessary.').find(t => t.page === page);
      assert.ok(footer, 'Footer on every page');
      const separator = receipt.line.find(l => l.page === page && l.args[0] === 12 && l.args[2] === 198 && l.args[1] > footer.y);
      assert.ok(separator);
      for (const t of receipt.text.filter(t => t.page === page && /^(Sub\d|Note\d|Remark\d|Row\d|Value\d|Reference\d|Parameter\d)/.test(t.value))) {
        assert.ok(t.y < footer.y - 3, 'Body must stay above footer: ' + JSON.stringify(t));
      }
      for (const c of receipt.circle.filter(c => c.page === page)) assert.ok(c.args[1] + c.args[2] < footer.y - 3);
    }
  }
  function graphParity(expectedPoints = 2, band = true) {
    const g = App.graphFor(tables.tests[0]);
    const svg = App.renderGraphSvg(g, tables.results[0].values);
    const circles = [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)"/g)].map(m => [+m[1], +m[2]]);
    assert.equal(receipt.circle.length, circles.length, 'Same configured numeric points as HTML');
    assert.equal(circles.length, expectedPoints, 'Only actual numeric measurements are plotted');
    const graphTitle = text(g.title)[0];
    assert.ok(graphTitle, 'Configured graph title');
    assert.ok(text('Unit: ' + g.unit).length);
    const plotTop = graphTitle.y + 4.5;
    circles.forEach(([sx, sy], i) => {
      const circle = receipt.circle[i];
      assert.equal(circle.page, graphTitle.page);
      assert.ok(Math.abs((circle.args[0] - 29) / 132 - (sx - 52) / 494) < 0.001, 'Preserve x-slot spacing');
      assert.ok(Math.abs((circle.args[1] - plotTop) / 52 - (sy - 34) / 240) < 0.001, 'Same values/reference-aware scale as SVG');
      if (i) assert.ok(receipt.line.some(l => l.page === circle.page && l.args[0] === receipt.circle[i - 1].args[0] && l.args[1] === receipt.circle[i - 1].args[1] && l.args[2] === circle.args[0] && l.args[3] === circle.args[1]), 'Real vector series segment connects actual points');
    });
    assert.equal(receipt.rect.some(r => r.args[0] === 29 && r.args[2] === 132 && r.args[3] > 0 && r.args[4] === 'F'), band, 'Configured reference band only');
  }

  fixture();
  const opts = { compareIds: ['older', 'oldest', 'newer', 'other-patient', 'unready'], noLabHeader: false };
  const optsBefore = JSON.stringify(opts);
  build(opts); bounds(); graphParity();
  for (const value of ['CURRENT-001', 'NEWER', 'OLDER', 'History only', '109', '108', 'Glucose 0 min', '91', '172']) assert.ok(text(value).length, 'Expected content: ' + value);
  for (const value of ['OLDEST', 'OTHER-PATIENT', 'UNREADY', '107', '106', '105', '999999', 'Hidden pending value']) assert.equal(text(value).length, 0, 'Excluded content: ' + value);
  assert.ok(receipt.text.some(t => /02-Oct-2026/.test(t.value)) && receipt.text.some(t => /02-Sep-2026/.test(t.value)), 'Comparison timestamps');
  assert.equal(text('109')[0].x, 166); assert.equal(text('108')[0].x, 196);
  assert.ok(text('Note: 1 test(s) from this invoice are still pending.').length);
  assert.equal(JSON.stringify(opts), optsBefore);
  for (const label of ['Patient Name', 'Father / Husband Name', 'Age / Sex', 'Blood Group', 'Phone', 'Address', 'Registration Date', 'Reporting Date', 'Registration Location', 'Destination Location', 'Reference', 'Consultant']) assert.ok(text(label + ':').length, 'Preserved field: ' + label);
  for (const value of ['Synthetic Parent', '34 Yr(s) / Female', 'O+', '0300-0000000', 'Fixture Street', 'Fixture Reception', 'Fixture Lab', 'Fixture Reference', 'Fixture Consultant']) assert.ok(text(value).length, 'Preserved field value: ' + value);
  if (folder === path.join(root, 'electron-src')) {
    assert.equal(text('Patient Name:')[0].x, 12);
    assert.equal(text('Registration Date:')[0].x, 105, 'Source retains side-by-side patient/visit layout');
    assert.equal(text('Patient Name:')[0].y, text('Registration Date:')[0].y);
    assert.equal(typeof App.reportHtml, 'function', 'Source reportHtml export retained');
  }
  build(); bounds();
  assert.equal(text('History only').length, 0, 'Default remains current-only');
  assert.equal(text('NEWER').length, 0);

  // Invoice IDs can be longer than a page; full IDs belong in a paginated
  // legend, while repeated column identifiers stay bounded and unambiguous.
  fixture();
  const longCurrent = 'CURID' + 'X'.repeat(5200), longPrevious = words('OldID', 450);
  tables.invoices[0].no = longCurrent;
  tables.invoices.find(i => i.id === 'newer').no = longPrevious;
  build({ compareIds: ['newer'] }); bounds(); graphParity();
  const legend = receipt.text.filter(t => t.x === 12).flatMap(t => t.value.match(/(?:CURID)?X+/g) || []).join('');
  assert.equal(legend, longCurrent, 'Entire unbroken invoice ID preserved across page headers/footers');
  const allDrawn = receipt.text.map(t => t.value).join(' ');
  for (let i = 0; i < 450; i++) assert.equal((allDrawn.match(new RegExp('\\bOldID' + i + '\\b', 'g')) || []).length, 1);
  assert.ok(text('Report 1 (see ID above)').length && text('Report 2 (see ID above)').length);
  const boxes = receipt.rect.filter(r => r.args[2] === 30 && r.args.length === 4);
  assert.ok(boxes.length >= 2 && boxes.every(r => r.args[3] <= 30), 'Repeating boxes have bounded height');
  for (const box of boxes) {
    const [x, y, w, h] = box.args;
    for (const t of receipt.text.filter(t => t.page === box.page && t.align === 'center' && t.x === x + w / 2 && t.y >= y && t.y <= y + h)) {
      assert.ok(t.x - t.width / 2 >= x && t.x + t.width / 2 <= x + w, 'Identifier text stays inside its column box');
    }
  }

  // All physical lines survive pagination: table cells, subrefs, notes and remarks.
  fixture();
  tables.tests[0].params.push({ name: 'Narrative', ref: 'See below', refLines: Array.from({ length: 100 }, (_, i) => 'Sub' + i + ' reference guidance') });
  tables.results[0].values.Narrative = words('Value', 350);
  const longName = words('Parameter', 200);
  tables.tests[0].params.push({ name: longName, ref: words('Reference', 200), unit: 'mg/dL' });
  tables.results[0].values[longName] = 'present';
  tables.tests[0].note = words('Note', 900);
  tables.results[0].values.Remarks = words('Remark', 900);
  build(opts); bounds(); graphParity();
  assert.ok(receipt.doc.getNumberOfPages() >= 6 && receipt.doc.getNumberOfPages() < 50);
  for (const [prefix, count] of [['Value', 350], ['Sub', 100], ['Note', 900], ['Remark', 900], ['Parameter', 200], ['Reference', 200]]) {
    const drawn = receipt.text.map(t => t.value).join(' ');
    for (let i = 0; i < count; i++) assert.equal((drawn.match(new RegExp('\\b' + prefix + i + '\\b', 'g')) || []).length, 1, 'Preserve every token exactly once: ' + prefix + i);
  }
  assert.ok(text('PREVIOUS').length > 2, 'Comparison headers repeat for continued rows');

  // A free-text test also supports historical values and oversized current cells.
  fixture();
  tables.tests[0].params = [];
  tables.results[0].values = { Result: words('Row', 500) };
  tables.results.find(r => r.invoiceId === 'newer').values = { Result: 'Previous free text' };
  build({ compareIds: ['newer'] }); bounds();
  assert.equal(receipt.circle.length, 0);
  assert.ok(receipt.text.filter(t => t.x === 196).map(t => t.value).join(' ').includes('Previous free text'));
  assert.equal(receipt.text.filter(t => /\bRow499\b/.test(t.value)).length, 1);

  // Fewer than two numeric points deliberately produces no graph, just like HTML.
  fixture();
  tables.results[0].values['Glucose 60 min'] = 'unavailable';
  build(); assert.equal(receipt.circle.length, 0);
  fixture();
  tables.tests[0].name = 'Synthetic timed assay';
  tables.tests[0].params = ['Basal', '30 min', '60 min'].map(name => ({ name, type: 'number', unit: 'mmol/L' }));
  tables.results[0].values = { Basal: '0', '30 min': '-2.5', '60 min': '4.5 units' };
  build(); bounds(); graphParity(3, false);
  fixture();
  build({ noLabHeader: true }); bounds();
  assert.equal(text('Fixture Laboratory').length, 0);
  assert.ok(text('Patient Name:').length && text('Consultant:').length);
  assert.equal(receipt.images.length, 0, 'No letterhead QR on preprinted report');
  build({}, { hdr: { url: pixel, ratio: 0.04 }, ftr: { url: pixel, ratio: 0.04 } });
  assert.ok(receipt.images.length >= 2, 'Custom precomputed header/footer retained');

  // Real print -> PDF -> upload path, with only fetch mocked. Stable QR key and options.
  fixture();
  const before = JSON.stringify(tables);
  await App.testPrint('i', { compareIds: ['older', 'newer'], noLabHeader: true });
  assert.equal(uploads.length, 1); assert.equal(uploads[0].key, 'rpt-fixture-stable');
  const uploadedPdf = Buffer.from(uploads[0].pdfBase64, 'base64').toString('latin1');
  assert.ok(uploadedPdf.includes('History only') && uploadedPdf.includes('NEWER') && uploadedPdf.includes('OLDER'), 'Uploaded bytes contain comparisons');
  assert.ok(text('NEWER').length && text('OLDER').length);
  assert.equal(text('Fixture Laboratory').length, 0);
  assert.ok(prints[0].html.includes('History only'));
  assert.equal(JSON.stringify(tables), before, 'Upload changes no clinical records; existing key retained');
  native = true;
  await App.testPrint('i', { compareIds: ['older'] });
  assert.equal(uploads.length, 2); assert.equal(uploads[1].key, uploads[0].key);
  assert.equal(context.location.href, 'https://fixture.invalid/r/rpt-fixture-stable');
  assert.ok(text('OLDER').length); assert.equal(text('NEWER').length, 0);
  tables.invoices[0].status = 'unpaid';
  assert.equal(await App.getReportPdfUrl('i'), null); assert.equal(uploads.length, 2);
  assert.ok(await App.getReportPdfUrl('i', true)); assert.equal(uploads.length, 3, 'Legacy force caller remains compatible');

  fixture();
  delete tables.invoices[0].reportPdfKey;
  const clinicalBefore = JSON.stringify(tables.results);
  await App.getReportPdfUrl('i', false, { compareIds: ['newer'] });
  const createdKey = tables.invoices[0].reportPdfKey;
  assert.match(createdKey, /^rpt-i-[A-Za-z0-9]{6}$/);
  await App.getReportPdfUrl('i');
  assert.equal(uploads[0].key, uploads[1].key, 'First assigned QR key remains stable on refresh');
  assert.equal(JSON.stringify(tables.results), clinicalBefore);

  fixture();
  const graphFor = App.graphFor;
  App.graphFor = () => { throw new Error('fixture graph failure'); };
  assert.equal(await App.getReportPdfUrl('i'), null);
  assert.equal(uploads.length, 0, 'Never upload silently incomplete graph PDF');
  assert.ok(messages.some(m => /complete report PDF.*fixture graph failure/.test(m)));
  App.graphFor = graphFor;
  for (const failure of ['throw', 'empty', 'invalid']) {
    fixture(); outputFailure = failure;
    const beforeFailure = JSON.stringify(tables);
    await App.testPrint('i', { compareIds: ['newer'] });
    assert.equal(uploads.length, 0, 'Never upload invalid/missing output');
    assert.equal(prints.length, 1, 'Browser retains HTML print fallback');
    assert.ok(prints[0].html.includes('History only'));
    assert.ok(!qrTargets.some(t => String(t).indexOf('#/invoice/') >= 0), 'A failed PDF never prints a staff-login invoice link as the QR');
    assert.ok(messages.some(m => /Could not build PDF:/.test(m)), 'Output failure is reported');
    assert.equal(JSON.stringify(tables), beforeFailure, 'Failure never changes key or clinical records');
    native = true;
    await App.testPrint('i', { compareIds: ['newer'] });
    assert.equal(context.location.href, '', 'Native does not navigate to a failed PDF');
    assert.equal(uploads.length, 0);
  }
  console.log('PASS: ' + (path.relative(root, folder) || 'web') + ' QR PDF: actual PDF/config graph geometry, selected comparisons, pagination/bounds, patient fields, print/native upload options, stable key, gating, custom parts, immutability and explicit failure.');
}

(async () => {
  await suite(root);
  await suite(path.join(root, 'electron-src'));
  await suite(path.join(root, 'electron-tools/installer/app-stage-win7'));
})().catch(error => { console.error(error); process.exitCode = 1; });
