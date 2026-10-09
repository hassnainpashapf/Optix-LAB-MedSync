'use strict';

// Real report HTML and bundled jsPDF, with in-memory records and PDF drawing receipts.
// Run: node scripts/test-report-patient-layout.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { jsPDF } = require(path.join(root, 'assets/vendor/jspdf.umd.min.js'));
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const identityLabels = ['Patient Name', 'Father / Husband Name', 'Age / Sex', 'Blood Group', 'Phone', 'Address'];
const visitLabels = ['Registration Date', 'Reporting Date', 'Registration Location', 'Destination Location', 'Reference', 'Consultant'];
let tables, pdf;
const App = {
  esc, route() {}, toast(message) { throw new Error(message); },
  visitNos: () => ({ labText: 'INV # 001', labCode: '001', caseText: 'P # 01', caseCode: '01', cas: 1 })
};
const DB = {
  all: name => tables[name] || [],
  get: (name, id) => (tables[name] || []).find(record => record.id === id) || null
};
function RecordingPdf(options) {
  const doc = new jsPDF(options);
  pdf = { doc, text: [], lines: [] };
  const text = doc.text, line = doc.line;
  doc.text = function (value, x, y, opts) {
    const lines = Array.isArray(value) ? value : [value];
    lines.forEach((content, i) => pdf.text.push({
      value: String(content), x, y: y + i * doc.getFontSize() * doc.getLineHeightFactor() / doc.internal.scaleFactor,
      width: doc.getTextWidth(String(content)), align: opts && opts.align,
      page: doc.internal.getCurrentPageInfo().pageNumber
    }));
    return text.call(doc, value, x, y, opts);
  };
  doc.line = function (x1, y1, x2, y2) {
    pdf.lines.push({ x1, y1, x2, y2, page: doc.internal.getCurrentPageInfo().pageNumber });
    return line.apply(doc, arguments);
  };
  return doc;
}
const context = vm.createContext({
  App, DB, console, setTimeout() {},
  document: { addEventListener() {}, getElementById() { return null; } },
  localStorage: { getItem: () => null }, jspdf: { jsPDF: RecordingPdf }
});
context.window = context;
let source = fs.readFileSync(path.join(root, 'assets/js/mod-results.js'), 'utf8');
// Expose private entry points only inside this test VM; production API is unchanged.
source = source.replace(/\}\)\(\);\s*$/, 'App.testReportData = reportData; App.testReportPdf = buildReportPdf; })();');
vm.runInContext(source, context, { filename: 'mod-results.js' });

function fixture() {
  tables = {
    patients: [{ id: 'p', name: 'Patient <One>', father: 'Parent One', age: 34, gender: 'Female', blood: 'O+', phone: '0300-1234567', address: 'Patient Street' }],
    invoices: [{ id: 'i', no: 'INV-001', patientId: 'p', doctorId: 'd', createdAt: '2026-10-09T08:00:00Z', regLocation: 'Registration Office', destLocation: 'Destination Lab', reference: 'Referral One', items: [{ testId: 't', name: 'Blood Analysis' }] }],
    doctors: [{ id: 'd', name: 'Consultant One' }],
    settings: [{ id: 'main', labName: 'Layout Lab', showQr: false, showBarcode: false }],
    tests: [{ id: 't', name: 'Blood Analysis', params: [{ name: 'Hemoglobin', ref: '12-15', unit: 'g/dL' }] }],
    results: [{ id: 'r', invoiceId: 'i', testId: 't', status: 'ready', reportedAt: '2026-10-09T10:00:00Z', values: { Hemoglobin: '14.2' } }]
  };
}
function render() {
  const before = JSON.stringify(tables);
  const html = App.reportHtml(App.testReportData('i'));
  const result = App.testReportPdf('i');
  assert.match(result.dataUri, /^data:application\/pdf;/);
  assert.equal(JSON.stringify(tables), before, 'Report rendering must not change records');
  return html;
}
function first(value, page = 1) {
  const found = pdf.text.find(t => t.value === value && t.page === page);
  assert.ok(found, 'Missing PDF text: ' + value + ' on page ' + page);
  return found;
}
function checkSections(page = 1) {
  const identity = identityLabels.map(label => first(label + ':', page));
  const visit = visitLabels.map(label => first(label + ':', page));
  assert.ok(Math.max(...identity.map(t => t.y)) < Math.min(...visit.map(t => t.y)), 'All identity fields precede all visit fields');
  const divider = pdf.lines.find(l => l.page === page && l.x1 === 12 && l.x2 === 198 && l.y1 === l.y2 && l.y1 > Math.max(...identity.map(t => t.y)) && l.y1 < Math.min(...visit.map(t => t.y)));
  assert.ok(divider, 'Full-width divider separates identity and visit details');
  assert.ok(first('Layout Lab', page).y < identity[0].y, 'Letterhead stays above patient details');
}
function checkPageBounds() {
  for (let page = 1; page <= pdf.doc.getNumberOfPages(); page++) {
    const footer = first('Electronically verified report. No signatures necessary.', page);
    for (const text of pdf.text.filter(t => t.page === page)) {
      assert.ok(text.y >= 12 && text.y <= 293, 'Text stays within page: ' + JSON.stringify(text));
      if (text.align) continue;
      assert.ok(text.x + text.width <= 198.1, 'Text stays within report width: ' + JSON.stringify(text));
      if (/^(Patient Name|Registration Location|Destination Location|Consultant):$/.test(text.value)) {
        assert.ok(text.y < footer.y - 3, 'Patient/visit rows stay above footer');
      }
    }
  }
}

fixture();
let html = render();
const patientStart = html.indexOf('class="rpt-info-patient"');
const visitStart = html.indexOf('class="rpt-info-visit"');
assert.ok(patientStart > html.indexOf('Layout Lab') && visitStart > patientStart);
const patientHtml = html.slice(patientStart, visitStart), visitHtml = html.slice(visitStart, html.indexOf('</thead>', visitStart));
identityLabels.forEach(label => assert.ok(patientHtml.includes(label)));
visitLabels.forEach(label => { assert.ok(!patientHtml.includes(label)); assert.ok(visitHtml.includes(label)); });
assert.match(patientHtml, /<hr[^>]+width:100%/);
assert.match(patientHtml, /Patient &lt;One&gt;/);
assert.match(visitHtml, /overflow-wrap:anywhere/);
assert.ok(html.indexOf('Blood Analysis') > visitStart);
checkSections();
assert.ok(first('Hemoglobin').y > first('Consultant:').y);
assert.equal(first('Patient <One>').value, 'Patient <One>');
assert.equal(first('14.2').value, '14.2');
checkPageBounds();

// Missing fields retain the existing placeholders and lab/visit fallbacks.
fixture();
tables.patients[0] = { id: 'p', age: 0, whatsapp: '0311-7654321', fatherName: 'Legacy Parent' };
Object.assign(tables.invoices[0], { createdAt: 'invalid', regLocation: '', destLocation: '', reference: '', doctorId: null });
Object.assign(tables.settings[0], { headOffice: 'Default Registration', destinationLocation: 'Default Destination', reference: 'Default Reference' });
tables.results[0].reportedAt = '';
html = render();
for (const value of ['Unknown', '.', 'SELF', 'Legacy Parent', '0 Yr(s)', '0311-7654321', 'Default Registration', 'Default Destination', 'Default Reference']) {
  assert.ok(html.includes(value)); first(value);
}
assert.doesNotMatch(html, /Invalid Date|undefined|null/);
checkSections();
checkPageBounds();

// Long locations wrap across the full report width and remain above results.
fixture();
const location = Array.from({ length: 75 }, (_, i) => 'District' + i).join(' ');
tables.invoices[0].regLocation = location;
tables.invoices[0].destLocation = 'X'.repeat(360);
html = render();
assert.ok(html.includes(location));
checkSections();
const start = first('Registration Location:');
const end = first('Destination Location:');
const locationLines = pdf.text.filter(t => t.page === start.page && t.x === 56 && t.y >= start.y && t.y < end.y);
assert.ok(locationLines.length > 1);
assert.equal(locationLines.map(t => t.value).join(' '), location, 'Wrapping preserves every location word');
assert.ok(first('Hemoglobin').y > first('Consultant:').y);
checkPageBounds();

// Normal multi-page result tables repeat the full patient and visit block.
fixture();
tables.tests[0].params = Array.from({ length: 60 }, (_, i) => ({ name: 'Analyte ' + i, ref: '1-10', unit: 'mg' }));
tables.results[0].values = Object.fromEntries(tables.tests[0].params.map(p => [p.name, '5']));
render();
assert.ok(pdf.doc.getNumberOfPages() > 1);
for (let page = 1; page <= pdf.doc.getNumberOfPages(); page++) checkSections(page);
checkPageBounds();

// A single field longer than a page continues without recursion, truncation or footer overlap.
fixture();
tables.invoices[0].regLocation = Array.from({ length: 1600 }, (_, i) => 'Region' + i).join(' ');
render();
assert.ok(pdf.doc.getNumberOfPages() > 2 && pdf.doc.getNumberOfPages() < 20);
const regionLines = pdf.text.filter(t => /^Region\d/.test(t.value));
assert.equal(regionLines.map(t => t.value).join(' '), tables.invoices[0].regLocation);
for (const text of regionLines) {
  assert.ok(text.y < first('Electronically verified report. No signatures necessary.', text.page).y - 3);
  assert.ok(text.y > first('Layout Lab', text.page).y + 10);
}
first('14.2', pdf.doc.getNumberOfPages());
checkPageBounds();
console.log('PASS: HTML/PDF section order, full-width divider, unchanged fields/fallbacks, long locations, multi-page headers, oversized-field pagination, bounds and data immutability.');
