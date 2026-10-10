'use strict';

// Synthetic records, real bundled jsPDF and per-page drawing/font receipts.
// Run: node scripts/test-report-footer-order.js (web, desktop source, staged desktop).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const contactKeys = ['address', 'headOffice', 'mainLab', 'phone', 'callCenter', 'website', 'email'];
const contactLabels = ['', 'Head Office: ', 'Previous Lab: ', 'Phone: ', 'Call Center: ', 'Web: ', 'Email: '];

function suite(folder) {
  const { jsPDF } = require(path.join(folder, 'assets/vendor/jspdf.umd.min.js'));
  let tables, pdf;
  function RecordingPdf(options) {
    const doc = new jsPDF(options);
    pdf = { doc, text: [], measures: [], lines: [], images: [] };
    const page = () => doc.internal.getCurrentPageInfo().pageNumber;
    const text = doc.text, split = doc.splitTextToSize, line = doc.line, image = doc.addImage;
    doc.text = function (value, x, y, options) {
      const values = Array.from(Array.isArray(value) ? value : [value], String);
      pdf.text.push({ values, x, y, page: page(), style: doc.getFont().fontStyle,
        size: doc.getFontSize(), align: options && options.align,
        widths: values.map(v => doc.getTextWidth(v)),
        bottom: y + (values.length - 1) * doc.getFontSize() * doc.getLineHeightFactor() / doc.internal.scaleFactor });
      return text.apply(doc, arguments);
    };
    doc.splitTextToSize = function (value, width) {
      const result = split.apply(doc, arguments);
      pdf.measures.push({ value, width, style: doc.getFont().fontStyle, size: doc.getFontSize(), values: Array.from(result) });
      return result;
    };
    doc.line = function (x1, y1, x2, y2) {
      pdf.lines.push({ x1, y1, x2, y2, page: page() });
      return line.apply(doc, arguments);
    };
    doc.addImage = function (...args) { pdf.images.push({ args, page: page() }); return image.apply(doc, args); };
    return doc;
  }
  const App = { esc, route() {}, toast(message) { throw new Error(message); },
    visitNos: () => ({ labText: 'INV # 001', labCode: '001', caseText: 'P # 01', caseCode: '01', cas: 1 }) };
  const DB = {
    all: name => tables[name] || [],
    get: (name, id) => (tables[name] || []).find(record => record.id === id) || null
  };
  const context = vm.createContext({
    App, DB, console, setTimeout() {},
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem: () => null }, jspdf: { jsPDF: RecordingPdf }
  });
  context.window = context;
  let source = fs.readFileSync(path.join(folder, 'assets/js/mod-results.js'), 'utf8');
  // Private entry points are exposed only in the test VM, following the report suites.
  source = source.replace(/\}\)\(\);\s*$/, 'App.testData = reportData; App.testHtml = reportHtml; App.testPdf = buildReportPdf; App.testDisclaimer = DEFAULT_DISCLAIMER; })();');
  vm.runInContext(source, context, { filename: 'mod-results.js' });

  function fixture(rows = 1) {
    const params = Array.from({ length: rows }, (_, i) => ({ name: 'Analyte ' + i, ref: '1-10', unit: 'mg' }));
    tables = {
      patients: [{ id: 'p', name: 'Synthetic Patient', age: 34, gender: 'Female' }],
      invoices: [{ id: 'i', no: 'FIXTURE-001', patientId: 'p', createdAt: '2026-10-09T08:00:00Z', items: [{ testId: 't', name: 'Synthetic Assay' }] }],
      settings: [{ id: 'main', labName: 'Synthetic Laboratory', showQr: false, showBarcode: false,
        footerText: 'Fixture footer text', verNote: 'Fixture verification text',
        address: '123 Synthetic Avenue', headOffice: 'Synthetic Headquarters', mainLab: 'Synthetic Previous Site',
        phone: '000-000-0000', callCenter: '000-000-0001', website: 'https://fixture.invalid', email: 'reports@fixture.invalid',
        signatories: [{ name: 'Synthetic Signatory', qual: 'Fixture Qualification', title: 'Fixture Director', regNo: 'FIX-001', sigImg: pixel, stampImg: pixel },
          { name: 'Inactive Signatory', active: false }] }],
      tests: [{ id: 't', name: 'Synthetic Assay', params }],
      results: [{ id: 'r', invoiceId: 'i', testId: 't', status: 'ready', reportedAt: '2026-10-09T10:00:00Z',
        values: Object.fromEntries(params.map((p, i) => [p.name, 'Value' + i])) }]
    };
  }
  function render(pre) {
    const before = JSON.stringify(tables);
    const html = App.testHtml(App.testData('i'));
    const result = App.testPdf('i', null, pre);
    assert.ok(Buffer.from(result.dataUri.split('base64,')[1], 'base64').toString('latin1').startsWith('%PDF-'));
    assert.equal(JSON.stringify(tables), before, 'Rendering leaves records unchanged');
    return html;
  }
  function one(value, page) {
    const start = pdf.text.find(t => t.page === page && t.values.join(' ') === tables.settings[0].footerText);
    const matches = pdf.text.filter(t => t.page === page && t.y >= start.y && t.values.join(' ') === value);
    assert.equal(matches.length, 1, 'Exactly one footer field per page: ' + value + ' / ' + page);
    return matches[0];
  }
  function checkDefault() {
    const s = tables.settings[0];
    const note = s.disclaimer || (s.footerNote !== 'Get well soon. Reports available on counter & phone.' && s.footerNote) || App.testDisclaimer;
    const address = contactKeys.map((key, i) => s[key] ? contactLabels[i] + s[key] : '').filter(Boolean).join(' | ');
    const html = render();
    const footer = context.reportFooterHtml({ s });
    assert.ok(html.includes(footer), 'Actual report uses default footer');
    const noteAt = footer.indexOf(esc(note));
    assert.ok(noteAt > footer.indexOf(s.signatories[0].name));
    assert.ok(footer.indexOf(s.footerText) < footer.indexOf(s.verNote));
    assert.ok(footer.indexOf(s.verNote) < footer.indexOf(s.signatories[0].name));
    assert.ok(!footer.includes('Inactive Signatory'));
    assert.ok(footer.includes('Fixture Qualification') && footer.includes('Fixture Director (FIX-001)'));
    const poweredAt = footer.indexOf('Powered by System Optix');
    assert.ok(poweredAt > noteAt);
    if (address) {
      const addressAt = footer.indexOf(esc(address));
      assert.ok(addressAt > noteAt && poweredAt > addressAt, 'HTML NOTE precedes full address/contact block');
      assert.match(footer.slice(0, addressAt).match(/<div[^>]*>$/)[0], /font-weight:700(?:;|")/, 'Entire contact block inherits bold');
      const noteAndAddress = footer.slice(footer.indexOf('<div class="rpt-disc"'), addressAt);
      assert.equal((noteAndAddress.match(/border-(?:top|bottom):1px solid #000/g) || []).length, 1, 'Single HTML separator between NOTE and address');
      const measurement = pdf.measures.find(m => m.value === address && m.width === 186 && m.size === 9);
      assert.ok(measurement && measurement.style === 'bold', 'Measure address with the bold drawing font');
      const reference = new jsPDF({ unit: 'mm', format: 'a4' });
      reference.setFont('helvetica', 'bold'); reference.setFontSize(9);
      assert.deepEqual(measurement.values, reference.splitTextToSize(address, 186), 'Real bold font wrapping');
    }
    for (let page = 1; page <= pdf.doc.getNumberOfPages(); page++) {
      const first = one(s.footerText, page), ver = one(s.verNote, page), sig = one('Synthetic Signatory', page);
      const noteDraw = one(note, page), powered = one('Powered by System Optix', page);
      assert.ok(first.bottom < ver.y && ver.bottom < sig.y && sig.bottom < noteDraw.y);
      one('Fixture Qualification', page); one('Fixture Director (FIX-001)', page);
      assert.equal(pdf.images.filter(i => i.page === page).length, 2, 'Signature and stamp retained on every page');
      assert.equal(noteDraw.style, 'normal', 'Disclaimer stays normal after bold address measurement');
      if (address) {
        const addr = one(address, page);
        assert.ok(noteDraw.bottom < addr.y && addr.bottom < powered.y, 'NOTE above address above powered-by on every PDF page');
        assert.equal(addr.style, 'bold'); assert.equal(addr.align, 'center');
        assert.ok(addr.widths.every(w => w <= 186.01), 'Bold wrapped contact lines fit content width');
        assert.equal(pdf.lines.filter(l => l.page === page && l.x1 === 12 && l.x2 === 198 && l.y1 > noteDraw.bottom && l.y1 < addr.y).length, 1, 'Single PDF separator between NOTE and address');
      } else {
        assert.ok(noteDraw.bottom < powered.y, 'Address-free footer still contains disclaimer and powered-by');
      }
      assert.ok(powered.y <= 285, 'Footer stays inside bottom margin');
      for (const t of pdf.text.filter(t => t.page === page)) {
        assert.ok(t.y >= 12 && t.bottom <= 293.1, 'All text stays on page');
        if (/^(Analyte |Value\d)/.test(t.values[0])) assert.ok(t.bottom < first.y - 3, 'Results stay above reserved footer area');
      }
    }
    for (let i = 0; i < tables.tests[0].params.length; i++) {
      assert.equal(pdf.text.filter(t => t.values.includes('Value' + i)).length, 1, 'No result lost or duplicated at page boundaries');
    }
    return address;
  }

  fixture(); checkDefault();
  fixture(75);
  tables.settings[0].address = Array.from({ length: 65 }, (_, i) => 'District' + i).join(' ');
  const longAddress = checkDefault();
  assert.ok(pdf.doc.getNumberOfPages() > 2, 'Long-address multi-page fixture');
  assert.ok(one(longAddress, 1).values.length > 3, 'Exercise multiple bold wrapped address lines');
  fixture(); contactKeys.forEach(key => { delete tables.settings[0][key]; }); checkDefault();
  fixture(); contactKeys.filter(key => key !== 'phone').forEach(key => { delete tables.settings[0][key]; }); checkDefault();
  fixture(); tables.settings[0].disclaimer = 'NOTE: Fixture custom disclaimer retained.'; checkDefault();
  fixture(); tables.settings[0].footerNote = 'NOTE: Fixture legacy note retained.'; checkDefault();
  fixture(); tables.settings[0].footerNote = 'Get well soon. Reports available on counter & phone.'; checkDefault();

  // HTML overrides and the rasterized custom-footer PDF path keep their priority.
  fixture(75);
  tables.settings[0].footerHtml = '<section>Fixture custom footer override</section>';
  const custom = { url: pixel, ratio: 0.04 };
  const html = render({ ftr: custom });
  assert.ok(html.includes('<div class="rpt-footer">' + tables.settings[0].footerHtml + '</div>'));
  assert.ok(!html.includes('class="rpt-disc"') && !html.includes('Fixture verification text'));
  assert.ok(pdf.doc.getNumberOfPages() > 1);
  for (let page = 1; page <= pdf.doc.getNumberOfPages(); page++) {
    const images = pdf.images.filter(i => i.page === page);
    assert.equal(images.length, 1, 'Custom footer image is used on every page');
    assert.equal(images[0].args[0], pixel);
    assert.equal(images[0].args[2], 12);
    assert.ok(Math.abs(images[0].args[3] - (285 - 186 * custom.ratio - 2)) < 0.001);
    assert.equal(images[0].args[4], 186);
    assert.ok(Math.abs(images[0].args[5] - 186 * custom.ratio) < 0.001);
  }
  assert.ok(!pdf.text.some(t => /Fixture verification text|NOTE:|Powered by System Optix|Synthetic Signatory/.test(t.values.join(' '))), 'Default footer not drawn over custom footer');
  console.log('PASS: ' + (path.relative(root, folder) || 'web') + ' footer: NOTE above bold full contact block, real font wrapping, every-page bounds/content, sparse contacts and custom overrides.');
}

suite(root);
suite(path.join(root, 'electron-src'));
suite(path.join(root, 'electron-tools/installer/app-stage-win7'));
