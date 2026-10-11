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
const identityLabels = ['Patient Name', 'Father / Husband Name', 'Age / Sex', 'Blood Group', 'Phone', 'CNIC', 'Address'];
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
// Two-column geometry (mm): left column starts at the margin with ":" at 20% of the width,
// right column starts at 50% with ":" at 70%; values follow the colon.
const M = 12, CW = 186, LX = M, LCOLON = M + CW * 0.2, RX = M + CW * 0.5, RCOLON = M + CW * 0.69, COLON_W = 3;
const near = (a, b) => Math.abs(a - b) < 0.01;
function label(name, x, page = 1) {
  const found = pdf.text.find(t => t.value === name && t.page === page && near(t.x, x));
  assert.ok(found, 'Missing PDF label: ' + name + ' at x=' + x + ' on page ' + page);
  return found;
}
function checkSections(page = 1, labels = { left: identityLabels, right: visitLabels }) {
  const left = labels.left.map(name => label(name, LX, page));
  const right = labels.right.map(name => label(name, RX, page));
  // Identity fields live in the left column, visit fields in the right one, both top-aligned.
  assert.ok(near(left[0].y, right[0].y), 'Both columns start on the same line');
  left.forEach((t, i) => i && assert.ok(t.y > left[i - 1].y, 'Left column keeps its order: ' + t.value));
  right.forEach((t, i) => i && assert.ok(t.y > right[i - 1].y, 'Right column keeps its order: ' + t.value));
  // label | ":" | value alignment: every label has a ":" in the colon column on its own line.
  for (const [group, colonX] of [[left, LCOLON], [right, RCOLON]]) {
    for (const t of group) {
      const colon = pdf.text.find(c => c.value === ':' && c.page === page && near(c.x, colonX) && near(c.y, t.y));
      assert.ok(colon, 'Colon aligned for ' + t.value);
      assert.ok(t.x + t.width < colonX, 'Label ends before the colon: ' + t.value);
      const value = pdf.text.find(v => v.page === page && near(v.x, colonX + COLON_W) && near(v.y, t.y));
      assert.ok(value, 'Value follows the colon for ' + t.value);
    }
  }
  // No divider between the groups; exactly one full-width rule closes the block below both columns.
  const lastY = Math.max(...left.map(t => t.y), ...right.map(t => t.y));
  const firstY = Math.min(left[0].y, right[0].y);
  const rules = pdf.lines.filter(l => l.page === page && l.x1 === M && l.x2 === 198 && l.y1 === l.y2);
  const result = pdf.text.find(t => t.page === page && /^(Hemoglobin|Analyte \d+)$/.test(t.value));
  const between = rules.filter(l => l.y1 > firstY - 3 && l.y1 < (result ? result.y : Infinity));
  assert.equal(between.length, 1, 'Exactly one rule between the first field and the results');
  assert.ok(between[0].y1 > lastY, 'That one thin rule closes the block below both columns (no divider between the groups)');
  assert.ok(first('Layout Lab', page).y < firstY, 'Letterhead stays above patient details');
  // Columns never overlap: left-column text stays left of the right column.
  for (const t of pdf.text.filter(t => t.page === page && !t.align && t.y >= firstY && t.y <= lastY + 20 && t.x < RX - 1 && t.x > M - 1))
    assert.ok(t.x + t.width <= RX - 4, 'Left column text stays out of the right column: ' + JSON.stringify(t));
}
function checkPageBounds() {
  for (let page = 1; page <= pdf.doc.getNumberOfPages(); page++) {
    const footer = first('Electronically verified report. No signatures necessary.', page);
    for (const text of pdf.text.filter(t => t.page === page)) {
      assert.ok(text.y >= 12 && text.y <= 293, 'Text stays within page: ' + JSON.stringify(text));
      if (text.align) continue;
      assert.ok(text.x + text.width <= 198.1, 'Text stays within report width: ' + JSON.stringify(text));
      if (/^(Patient Name|Registration Location|Destination Location|Consultant)$/.test(text.value)) {
        assert.ok(text.y < footer.y - 3, 'Patient/visit rows stay above footer');
      }
    }
  }
}

fixture();
let html = render();
const colsStart = html.indexOf('class="rpt-info-cols"');
const patientStart = html.indexOf('class="rpt-info-patient"');
const visitStart = html.indexOf('class="rpt-info-visit"');
assert.ok(colsStart > html.indexOf('Layout Lab') && patientStart > colsStart && visitStart > patientStart);
const blockEnd = html.indexOf('</thead>', visitStart);
const patientHtml = html.slice(patientStart, visitStart), visitHtml = html.slice(visitStart, blockEnd);
const labelsIn = part => [...part.matchAll(/font-weight:bold;overflow-wrap:anywhere">([^<]*)<\/span><span>:<\/span>/g)].map(m => m[1]);
assert.deepEqual(labelsIn(patientHtml), identityLabels, 'Left column: identity fields in order');
assert.deepEqual(labelsIn(visitHtml), visitLabels, 'Right column: visit fields in order');
assert.match(html.slice(colsStart, patientStart), /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, 'Two equal columns');
assert.match(patientHtml, /grid-template-columns:minmax\(140px,40%\) 8px minmax\(0,1fr\)/, 'Left rows: label | colon | value');
assert.match(visitHtml, /grid-template-columns:minmax\(128px,38%\) 8px minmax\(0,1fr\)/, 'Right rows: label | colon | value');
assert.equal((html.slice(colsStart, blockEnd).match(/<hr/g) || []).length, 1, 'Exactly one rule in the block');
assert.ok(!patientHtml.includes('<hr') && visitHtml.includes('<hr') && visitHtml.indexOf('<hr') > visitHtml.indexOf('Consultant'), 'The only rule closes the block below both columns');
assert.match(visitHtml, /<hr[^>]+width:100%/);
assert.match(patientHtml, /Patient &lt;One&gt;/);
assert.match(patientHtml, /overflow-wrap:anywhere/);
assert.match(visitHtml, /overflow-wrap:anywhere/);
assert.ok(patientHtml.includes('>CNIC<'), 'CNIC row is always shown, even when the patient has none');
assert.ok(html.indexOf('Blood Analysis') > visitStart);
checkSections();
assert.ok(first('Hemoglobin').y > label('Consultant', RX).y);
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

// Long locations wrap inside the right column (hanging indent under the value) and remain above results.
fixture();
const location = Array.from({ length: 30 }, (_, i) => 'District' + i).join(' ');
tables.invoices[0].regLocation = location;
tables.invoices[0].destLocation = 'X'.repeat(120);
html = render();
assert.ok(html.includes(location));
checkSections();
const start = label('Registration Location', RX);
const end = label('Destination Location', RX);
const locationLines = pdf.text.filter(t => t.page === start.page && near(t.x, RCOLON + COLON_W) && t.y >= start.y && t.y < end.y);
assert.ok(locationLines.length > 1);
assert.equal(locationLines.map(t => t.value).join(' '), location, 'Wrapping preserves every location word');
for (const t of locationLines) assert.ok(t.x + t.width <= 198.1, 'Wrapped location stays inside the page');
assert.ok(label('Destination Location', RX).y > locationLines[locationLines.length - 1].y, 'Destination Location starts below the wrapped lines');
assert.ok(first('Hemoglobin').y > label('Consultant', RX).y);
checkPageBounds();

// Normal multi-page result tables repeat the full patient and visit block.
fixture();
tables.tests[0].params = Array.from({ length: 60 }, (_, i) => ({ name: 'Analyte ' + i, ref: '1-10', unit: 'mg' }));
tables.results[0].values = Object.fromEntries(tables.tests[0].params.map(p => [p.name, '5']));
render();
assert.ok(pdf.doc.getNumberOfPages() > 1);
for (let page = 1; page <= pdf.doc.getNumberOfPages(); page++) checkSections(page);
checkPageBounds();

// CNIC row sits after Phone and before Address, filled or empty.
assert.ok(label('CNIC', LX).y > label('Phone', LX).y && label('CNIC', LX).y < label('Address', LX).y, 'PDF: empty CNIC row between Phone and Address');
fixture();
tables.patients[0].cnic = '35202-1234567-1';
html = render();
assert.deepEqual(labelsIn(html.slice(html.indexOf('class="rpt-info-patient"'), html.indexOf('class="rpt-info-visit"'))), identityLabels, 'HTML: CNIC between Phone and Address');
checkSections(1, { left: identityLabels, right: visitLabels });
first('35202-1234567-1');
assert.ok(label('CNIC', LX).y > label('Phone', LX).y && label('CNIC', LX).y < label('Address', LX).y, 'PDF: CNIC between Phone and Address');

// Long identity values wrap inside the left column with a hanging indent and never reach the right column.
fixture();
const longName = Array.from({ length: 14 }, (_, i) => 'Name' + i).join(' ');
const longAddress = Array.from({ length: 30 }, (_, i) => 'Street' + i).join(' ');
Object.assign(tables.patients[0], { name: longName, father: longName + ' Father', address: longAddress });
html = render();
assert.ok(html.includes(longName) && html.includes(longAddress));
checkSections();
for (const [field, text] of [['Patient Name', longName], ['Address', longAddress]]) {
  const row = label(field, LX), next = pdf.text.filter(t => t.page === 1 && t.x === LX && t.y > row.y).sort((a, b) => a.y - b.y)[0];
  const lines = pdf.text.filter(t => t.page === 1 && near(t.x, LCOLON + COLON_W) && t.y >= row.y - 0.01 && (!next || t.y < next.y - 0.01) && /^(Name|Street)\d/.test(t.value));
  assert.ok(lines.length > 1, field + ' wraps onto more lines');
  assert.equal(lines.map(t => t.value).join(' '), text, field + ' keeps every word when wrapped');
  lines.forEach(t => assert.ok(t.x + t.width <= RX - 4, 'Hanging-indent line stays in the left column'));
}
assert.ok(label('Father / Husband Name', LX).y > label('Patient Name', LX).y + 4.6 * 2, 'Wrapped name pushes the next row down');
assert.ok(near(label('Registration Date', RX).y, label('Patient Name', LX).y), 'Right column unaffected and top-aligned');
checkPageBounds();

// "Without Header" (preprinted paper): same two-column block, no letterhead.
fixture();
App.testReportPdf('i', undefined, undefined, { noLabHeader: true });
assert.ok(!pdf.text.some(t => t.value === 'Layout Lab'), 'No letterhead with Without Header');
label('Patient Name', LX); label('Registration Date', RX); label('Address', LX);
assert.equal(pdf.lines.filter(l => l.page === 1 && l.x1 === M && l.x2 === 198 && l.y1 === l.y2 && l.y1 > label('Patient Name', LX).y && l.y1 < label('Consultant', RX).y).length, 0, 'No divider with Without Header');

// Custom header HTML (s.headerHtml) is left as is; only the patient block below it changed.
fixture();
tables.settings[0].headerHtml = '<div class="custom-hdr">CUSTOM HEADER</div>';
html = render();
assert.ok(html.includes('CUSTOM HEADER') && html.indexOf('CUSTOM HEADER') < html.indexOf('class="rpt-info-cols"'));
assert.ok(!html.includes('rpt-info-cols"') || html.split('class="rpt-info-cols"').length === 2, 'One patient block with a custom header');

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
console.log('PASS: HTML/PDF two-column label|colon|value block, no divider + one closing rule, CNIC row always shown, unchanged fields/fallbacks, long locations, multi-page headers, oversized-field pagination, bounds and data immutability.');
