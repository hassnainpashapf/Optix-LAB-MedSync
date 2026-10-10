'use strict';

/* VM regression for the patient-facing report-ready WhatsApp/SMS builders. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const settings = {
  id: 'main', labName: 'Test Lab', currency: 'PKR', opEnabled: true,
  opJazzcashNo: '0300-1112223', opInstructions: 'Send the TID after payment.',
  whatsapp: { token: 'wa-provider-secret' }
};
const invoice = {
  id: 'i1', no: 'INV-2042', patientId: 'p1', createdAt: '2026-10-10T10:00:00Z',
  total: 1500, paid: 500, due: 1000, status: 'partial', privateToken: 'must-not-leak'
};
const tables = {
  settings: [settings], patients: [{ id: 'p1', name: 'Ayesha Patient', phone: '03001234567' }],
  invoices: [invoice], results: [], wa_log: [], tests: []
};
const DB = {
  all(table) { return (tables[table] || []).slice(); },
  get(table, id) { return (tables[table] || []).find(row => row.id === id) || null; },
  insert() {}, update() {}, remove() {},
  isCloud() { return false; }
};
const noop = function () {};
const App = {
  normWa(value) { return String(value || '').replace(/\D/g, ''); },
  money(value) { return 'Rs ' + Math.round(Number(value) || 0).toLocaleString('en-US'); },
  d(value) { return '10 Oct 2026'; },
  esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  route: noop, toast: noop, nav: noop, confirm: () => Promise.resolve(false),
  session: () => ({ role: 'reception' }), can: () => true,
  ensureJsPDF: () => Promise.resolve(true),
  getInvoicePaymentUrl(id) { return 'https://pay.example.test/invoices/' + id; }
};
const document = {
  body: { contains: () => false },
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop })
};
const context = vm.createContext({
  App, DB, document, console, window: null, location: { hash: '#/results/ready' }, navigator: {},
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, sessionStorage: { getItem: () => null },
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop, fetch: noop,
  Promise, FormData: function () {}, URL: function () {}
});
context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/mod-results.js'), 'utf8'), context, {
  filename: 'assets/js/mod-results.js'
});

const testNames = ['Complete Blood Count'];
const report = App.wa.patientMsg(invoice, tables.patients[0], testNames, 'https://reports.example.test/r/report-key');
assert.match(report, /Your laboratory report is ready\./);
assert.match(report, /\*Invoice:\* INV-2042/);
assert.match(report, /Invoice summary:/);
assert.match(report, /Total: Rs 1,500/);
assert.match(report, /Due: Rs 1,000/);
assert.match(report, /Status: Partial/);
assert.match(report, /Online payment: https:\/\/pay\.example\.test\/invoices\/i1/);
assert.match(report, /Report \(PDF\): https:\/\/reports\.example\.test\/r\/report-key/);
assert.doesNotMatch(report, /must-not-leak|0300-1112223|apiKey|password|token/i);

/* Existing paid/unpaid gating remains: payment CTA is only for a balance due. */
const paid = Object.assign({}, invoice, { id: 'paid', no: 'INV-2043', paid: 1500, due: 0, status: 'paid' });
const paidMessage = App.wa.patientMsg(paid, tables.patients[0], testNames, 'https://reports.example.test/r/paid');
assert.match(paidMessage, /Status: Paid/);
assert.doesNotMatch(paidMessage, /Online payment|Pay online/);

/* A configured option still works without a public link, without inventing a URL. */
delete App.getInvoicePaymentUrl;
const noLink = App.wa.patientMsg(invoice, tables.patients[0], testNames, '');
assert.match(noLink, /Online payment is available\. Please use the payment instructions on your invoice/);
assert.doesNotMatch(noLink, /https?:\/\//);
settings.opEnabled = false;
const disabled = App.wa.patientMsg(invoice, tables.patients[0], testNames, '');
assert.doesNotMatch(disabled, /Online payment|Pay online/);
settings.opEnabled = true;

const sms = App.sms.patientMsg(invoice, tables.patients[0], testNames);
assert.match(sms, /Invoice summary:/);
assert.match(sms, /Total: Rs 1,500/);
assert.match(sms, /Due: Rs 1,000/);
assert.match(sms, /Status: Partial/);
assert.match(sms, /Online payment is available/);

console.log('PASS: report-ready WhatsApp/SMS invoice summary, payment gating, public-link reuse, and no private fields');
