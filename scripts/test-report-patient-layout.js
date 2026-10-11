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
// Default header = one band: PATIENT list on the left half, company block on the right half.
// The left list keeps every field reportHeaderRows gives (identity first, then Inv # / P #, then the visit fields).
const identityLabels = ['Patient Name', 'Father / Husband Name', 'Age / Sex', 'Blood Group', 'Phone', 'CNIC', 'Address'];
const visitLabels = ['Inv #', 'P #', 'Registration Date', 'Reporting Date', 'Registration Location', 'Destination Location', 'Reference', 'Consultant'];
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
function checkSections(page = 1, lab = 'Layout Lab') {
  const identity = identityLabels.map(label => first(label + ':', page));
  const visit = visitLabels.map(label => first(label + ':', page));
  const all = identity.concat(visit);
  all.forEach(t => assert.equal(t.x, 12, 'Patient labels are in the left column: ' + t.value));
  for (let i = 1; i < all.length; i++) assert.ok(all[i].y > all[i - 1].y, 'Patient rows keep their order: ' + all[i].value);
  assert.ok(Math.max(...identity.map(t => t.y)) < Math.min(...visit.map(t => t.y)), 'All identity fields precede all visit fields');
  assert.ok(first('PATIENT', page).y < identity[0].y, 'Caption sits above the list');
  const company = first(lab, page);
  assert.ok(company.x >= 105, 'Company block is in the right half');
  assert.ok(company.y < visit[visit.length - 1].y, 'Company block shares the band with the patient list');
  const rule = pdf.lines.find(l => l.page === page && l.x1 === 12 && l.x2 === 198 && l.y1 === l.y2 && l.y1 > visit[visit.length - 1].y);
  assert.ok(rule, 'One full-width rule closes the band');
  assert.ok(!pdf.lines.some(l => l.page === page && l.x1 === 12 && l.x2 === 198 && l.y1 === l.y2 && l.y1 > identity[0].y && l.y1 < visit[visit.length - 1].y), 'No divider inside the band (no second grid)');
}
// The result table starts after the last patient row (it may be on a later page when the band itself is long).
function checkResultsAfterBand(name = 'Hemoglobin') {
  const c = first('Consultant:', 1), r = pdf.text.find(t => t.value === name);
  assert.ok(r, 'Missing PDF text: ' + name);
  assert.ok(r.page > c.page || (r.page === c.page && r.y > c.y), 'Results come after the patient band');
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
const patientStart = html.indexOf('class="rpt-band-patient"');
const companyStart = html.indexOf('class="rpt-band-company"');
assert.ok(patientStart > 0 && companyStart > patientStart && companyStart > patientStart, 'Patient block first (left), company block second (right)');
assert.ok(html.indexOf('Layout Lab') > companyStart, 'Lab name lives in the company block');
assert.ok(!html.includes('class="rpt-info') && !html.includes('rpt-info-patient'), 'Patient info is not shown twice (no separate grid below the header)');
const patientHtml = html.slice(patientStart, companyStart), bandEnd = html.indexOf('</thead>', companyStart);
[...identityLabels, ...visitLabels].forEach(label => assert.ok(patientHtml.includes(label + ':'), 'HTML band has ' + label));
assert.match(html.slice(0, patientStart), /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, 'Two equal halves');
assert.match(patientHtml, /Patient &lt;One&gt;/);
assert.match(patientHtml, /overflow-wrap:anywhere/);
assert.match(html.slice(companyStart, bandEnd), /<hr[^>]+width:100%/, 'Thin rule closes the band');
assert.ok(html.indexOf('Blood Analysis') > bandEnd);
// custom header and "Without Header" keep the old header + grid, untouched
tables.settings[0].headerHtml = '<div>Custom Letterhead</div>';
let legacy = App.reportHtml(App.testReportData('i'));
assert.ok(legacy.includes('Custom Letterhead') && legacy.includes('class="rpt-info-patient"') && !legacy.includes('rpt-band'), 'Custom header: header wins, old patient grid below');
tables.settings[0].headerHtml = '';
legacy = App.reportHtml(App.testReportData('i'), { noLabHeader: true });
assert.ok(legacy.includes('class="rpt-info-patient"') && !legacy.includes('rpt-band') && !legacy.includes('Layout Lab'), 'Without Header: patient grid only');
// no logo / tagline / header text: nothing stray
assert.ok(!html.includes('<img src='), 'No logo, no image');
assert.ok(!html.includes('rpt-htext'), 'Empty header text renders nothing');
checkSections();
checkResultsAfterBand();
assert.equal(first('Patient <One>').value, 'Patient <One>');
assert.ok(first('Patient <One>').x > 12 && first('Patient <One>').x < 105, 'Name value is in the left half');
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
const locationLines = pdf.text.filter(t => t.page === start.page && t.x === 49.5 && t.y >= start.y && t.y < end.y);
assert.ok(locationLines.length > 1);
assert.equal(locationLines.map(t => t.value).join(' '), location, 'Wrapping preserves every location word');
checkResultsAfterBand();
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

// Stress the band: long lab name + tagline, logo, QR, 6-line header text and a very long patient name.
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
fixture();
const hdrLines = ['Plot 12-B, Block 7, Main Boulevard, Gulberg III, Lahore, Punjab, Pakistan', 'Phone: 042-111-222-333 | WhatsApp: 0300-1234567', 'Email: info@alshifa-diagnostics.com.pk', 'Web: www.alshifa-diagnostics.com.pk', 'Open 24 hours, 7 days a week', 'Home sampling available city-wide'];
Object.assign(tables.settings[0], { labName: 'Al-Shifa International Clinical Laboratory & Diagnostic Centre (Pvt) Ltd', tagline: 'Quality diagnostics you can trust, every single day of the year', logo: pixel, showQr: true, headerText: hdrLines.join('\n'), accent: '#0b6b3a', labNameColor: '#b91c1c' });
tables.patients[0].name = 'Muhammad Abdul Rahman Siddiqui Al-Hashmi Bin Abdullah Bin Muhammad Khan Durrani Yousafzai';
html = App.reportHtml(App.testReportData('i'));
assert.ok(html.indexOf('rpt-htext') > html.indexOf('class="rpt-band-company"'), 'Header text moved into the company block');
hdrLines.forEach(l => assert.ok(html.includes(App.esc ? esc(l) : l)));
assert.ok(html.includes('color:#b91c1c') && html.includes('color:#0b6b3a'), 'Lab-name colour and accent colour are used');
assert.ok(html.includes('data-qr="1"') && html.includes('<img src="' + pixel + '"'), 'QR placeholder and logo are in the band');
pdf = null;
assert.match(App.testReportPdf('i', pixel).dataUri, /^data:application\/pdf;/);
const left = pdf.text.filter(t => t.page === 1 && t.x < 108 && !t.align), right = pdf.text.filter(t => t.page === 1 && t.x >= 108 && t.y < first('Hemoglobin').y - 5 && !t.align);
for (const t of left.filter(t => t.y < first('Consultant:').y + 1)) assert.ok(t.x + t.width <= 102.1, 'Patient text stays in the left half: ' + t.value);
for (const t of right) assert.ok(t.x + t.width <= 198.1, 'Company text stays on the page: ' + t.value);
hdrLines.forEach(l => assert.ok(pdf.text.some(t => t.page === 1 && t.x === 108 && l.startsWith(t.value.trim().slice(0, 12))), 'Header text line in PDF: ' + l));
const name = pdf.text.filter(t => t.page === 1 && t.x === 49.5 && /Muhammad|Al-Hashmi|Durrani|Yousafzai|Siddiqui|Abdullah/.test(t.value));
assert.ok(name.length >= 3, 'Long patient name wraps over several lines');
assert.equal(name.map(t => t.value).join(' '), tables.patients[0].name);
const lastCompany = Math.max(...pdf.text.filter(t => t.page === 1 && t.x >= 108 && !t.align && t.y < first('Hemoglobin').y - 5).map(t => t.y));
const bandRule = pdf.lines.find(l => l.page === 1 && l.x1 === 12 && l.x2 === 198 && l.y1 > lastCompany && l.y1 > first('Consultant:').y);
assert.ok(bandRule && bandRule.y1 < first('Hemoglobin').y, 'The rule closes the band below both halves, results follow');
checkSections(1, 'Al-Shifa International'); checkPageBounds();

console.log('PASS: HTML/PDF PATIENT|COMPANY band (left/right halves, one rule, no second grid), custom/no-header legacy layout, long lab name/header text/patient name, unchanged fields/fallbacks, long locations, multi-page headers, oversized-field pagination, bounds and data immutability.');
