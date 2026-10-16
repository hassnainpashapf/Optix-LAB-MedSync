'use strict';
// Canonical Lab Profile HTML, authenticated rendering, real browser PDF integration.
// Optional integration: NODE_PATH=<puppeteer-core modules> REPORT_CHROMIUM_PATH=<Chrome> REPORT_SAMPLE_DIR=<directory> node scripts/test-profile-pdf.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const renderer = require('../cloud/report-pdf');
function fixture(count) {
  const specs = [
    ['fbs', 'FASTING BLOOD GLUCOSE', 'FBS', [{ name: 'Glucose - Fasting', ref: '70-100', unit: 'mg/dL' }], ['85']],
    ['rbs', 'RANDOM BLOOD GLUCOSE', 'RBS', [{ name: 'Glucose - Random', ref: '< 140', unit: 'mg/dL' }], ['114']],
    ['bgrp', 'BLOOD GROUP (ABO/RH)', 'BGRP', [{ name: 'ABO Group', ref: '—' }, { name: 'Rh Factor', ref: 'Positive / Negative' }], ['O', 'Positive']],
    ['hb', 'HEMOGLOBIN', 'HB', [{ name: 'Hemoglobin', ref: '13.5-17.5', unit: 'g/dL' }], ['12.7']]
  ];
  const settings = { id: 'main', labName: 'CITY CARE LAB', tagline: 'Diagnostic & Research Center', font: 'inter', reportFontSize: 'medium', showQr: true,
    address: 'Ghala Mandi Road Opposite Ahmad Jamal Clinic Ellah Abad', phone: '0300-0722292; 03320722292', email: 'cclab6701@gmail.com',
    signatories: [
      { name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist' },
      { name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP' },
      { name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist' },
      { name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Lab Technologist' }
    ] };
  const tables = { settings: [settings], patients: [{ id: 'p', name: 'SYNTHETIC PATIENT', father: 'Sample Parent', age: 26, gender: 'Male', blood: 'O+' }],
    invoices: [{ id: 'i', no: 'SAMPLE-011', patientId: 'p', status: 'paid', createdAt: '2026-10-15T15:26:00+05:00', regLocation: 'Main Center', destLocation: 'Head Office', items: [] }], tests: [], results: [] };
  for (const [id, name, code, params, values] of specs) {
    tables.tests.push({ id, name, code, params }); tables.invoices[0].items.push({ testId: id, name, code });
    tables.results.push({ id: 'r-' + id, invoiceId: 'i', testId: id, status: 'ready', reportedAt: '2026-10-15T15:33:53+05:00', values: Object.fromEntries(params.map((p, i) => [p.name, values[i]])) });
  }
  if (count) {
    tables.tests[0].params = Array.from({ length: count }, (_, i) => ({ name: 'Parameter-' + i, ref: '0-1000', unit: 'mg/dL' }));
    tables.results[0].values = Object.fromEntries(tables.tests[0].params.map((p, i) => [p.name, 'Result-' + i]));
  }
  const App = { route() {}, esc: value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    visitNos: () => ({ labText: 'INV # 11 - 10/2026', labCode: 'INV11-10-2026', caseText: 'P # 01 - 15/10', caseCode: '01-15-10' }) };
  const DB = { get: (name, id) => (tables[name] || []).find(r => r.id === id), all: name => tables[name] || [] };
  const renderCalls = [];
  const context = vm.createContext({ App, DB, console, setTimeout, LABPOS_API: 'https://fixture.invalid',
    fetch: async (url, options) => { renderCalls.push({ url, html: JSON.parse(options.body).html }); return { ok: true, json: async () => ({ dataUri: 'data:application/pdf;base64,' + Buffer.from('%PDF-fixture').toString('base64') }) }; }, localStorage: { getItem: () => null }, document: { addEventListener() {} } });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/qrcode.min.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/mod-results.js'), 'utf8'), context);
  const qr = App.qrDataUrlFor('https://example.invalid/r/synthetic-sample');
  return { App, settings, tables, renderCalls, html: () => App.reportPdfHtml('i', qr) };
}
async function main() {
  const sample = fixture();
  const withoutQr = sample.html().replace(/ src="data:image\/gif;base64,[^"]+"/g, '');
  assert.ok(withoutQr.includes(sample.App.sampleReportPreview(sample.settings)), 'PDF embeds the exact HTML that the Lab Profile preview produces');
  for (const font of ['inter', 'jakarta', 'roboto', 'poppins', 'opensans', 'lato', 'montserrat']) {
    sample.settings.font = font;
    assert.ok(sample.html().includes('font-family:'));
  }
  sample.settings.headerHtml = '<section>Custom header {{lab_no}} {{qr}}</section>';
  sample.settings.footerHtml = '<section>Custom footer preserved</section>';
  assert.ok(sample.html().includes('Custom header INV # 11 - 10/2026'));
  assert.ok(sample.html().includes('Custom footer preserved'));
  assert.ok(!sample.html().includes('{{qr}}'));
  const unsavedHtml = sample.App.sampleReportPreview(sample.settings);
  const profilePdf = await sample.App.renderLabProfilePdf(unsavedHtml, { font: 'poppins' });
  assert.ok(profilePdf.dataUri);
  assert.equal(sample.renderCalls[0].url, 'https://fixture.invalid/api/report-pdf/render');
  assert.ok(sample.renderCalls[0].html.includes(unsavedHtml), 'Settings PDF uses the current unsaved preview, not another data snapshot');
  assert.ok(sample.renderCalls[0].html.includes('font-family:"Poppins"'));
  const settingsSource = fs.readFileSync(path.join(root, 'assets/js/mod-admin.js'), 'utf8');
  assert.ok(settingsSource.includes('App.renderLabProfilePdf(html, ps)') && settingsSource.includes('id="spPrevPdf"'), 'Lab Profile exposes its own PDF download');
  delete sample.settings.headerHtml; delete sample.settings.footerHtml; sample.settings.font = 'inter';
  assert.throws(() => renderer.documentHtml('bad'), /complete report/);
  assert.throws(() => renderer.documentHtml('rpt-page' + 'x'.repeat(8 * 1024 * 1024)), /complete report/);
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1/', 'http://169.254.169.254/', 'https://example.invalid/']) assert.equal(renderer.allowedResource(url), false);
  assert.ok(renderer.documentHtml(sample.html()).includes('data:font/woff2;base64,'), 'Fonts ship inside the report document for offline desktop printing');
  const routes = {}, auth = () => {};
  renderer.register({ post: (url, ...handlers) => { routes[url] = handlers; } }, auth, async () => Buffer.from('%PDF-1.7\nfixture'));
  const handlers = routes['/api/report-pdf/render']; assert.equal(handlers[0], auth);
  function response() { return { code: 200, headers: {}, status(n) { this.code = n; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(value) { this.body = value; } }; }
  let res = response(); await handlers[1]({ body: { html: sample.html() } }, res); assert.equal(res.code, 200); assert.match(res.body.dataUri, /^data:application\/pdf;base64,JVBER/);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  res = response(); await handlers[1]({ body: { html: 'bad' } }, res); assert.equal(res.code, 400);
  for (const folder of ['electron-src/server', 'electron-tools/installer/app-stage-win7/server']) assert.equal(fs.readFileSync(path.join(root, folder, 'report-pdf.js'), 'utf8'), fs.readFileSync(path.join(root, 'cloud/report-pdf.js'), 'utf8'));
  // Exercise Electron's isolated local renderer without requiring a GUI in CI.
  let desktopWindow;
  class FakeWindow {
    constructor(options) {
      desktopWindow = this; this.options = options; this.destroyed = false;
      this.webContents = {
        session: { webRequest: { onBeforeRequest: fn => { this.requestFilter = fn; } } },
        setWindowOpenHandler: fn => { this.windowHandler = fn; },
        executeJavaScript: async code => { assert.ok(code.includes('document.fonts.ready')); },
        printToPDF: async options => { assert.equal(options.pageSize, 'A4'); assert.equal(options.printBackground, true); return Buffer.from('%PDF-desktop'); }
      };
    }
    async loadURL(url) { assert.ok(decodeURIComponent(url).includes('Content-Security-Policy')); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
  }
  const desktopModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron-src/report-pdf.js'), 'utf8'), {
    module: desktopModule, Buffer, setTimeout, clearTimeout,
    require: name => name === 'electron' ? { BrowserWindow: FakeWindow } : renderer
  });
  assert.equal((await desktopModule.exports.render(sample.html())).toString(), '%PDF-desktop');
  assert.equal(desktopWindow.options.webPreferences.nodeIntegration, false);
  assert.equal(desktopWindow.options.webPreferences.sandbox, true);
  assert.equal(desktopWindow.options.webPreferences.javascript, false);
  assert.equal(desktopWindow.destroyed, true, 'Hidden renderer is closed after export');
  desktopWindow.requestFilter({ url: 'http://127.0.0.1/private' }, result => assert.equal(result.cancel, true));
  console.log('PASS: one Lab Profile template, custom parts, bundled fonts, auth, request boundaries and desktop copies');
  if (!process.env.REPORT_CHROMIUM_PATH) { console.log('Browser integration requires REPORT_CHROMIUM_PATH.'); return; }
  const out = process.env.REPORT_SAMPLE_DIR || path.join(root, 'work/profile-pdf-tests'); fs.mkdirSync(out, { recursive: true });
  for (const [name, data] of [['lab-profile-report', sample], ['lab-profile-long-report', fixture(90)]]) {
    const html = data.html();
    const pdf = await renderer.chromiumPdf(html);
    assert.ok(pdf.subarray(0, 5).toString() === '%PDF-');
    assert.ok(pdf.includes(Buffer.from('Inter')), 'Selected profile font is embedded in PDF');
    fs.writeFileSync(path.join(out, name + '.pdf'), pdf);
    fs.writeFileSync(path.join(out, name + '.html'), html);
  }
  // Renderer must refuse missing assets rather than silently omit a logo.
  await assert.rejects(renderer.chromiumPdf(sample.html() + '<img src="data:image/png;base64,broken">'), /image could not be loaded/);
  console.log('PASS: real Chromium A4 PDFs, multi-page report and explicit missing-image failure');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
