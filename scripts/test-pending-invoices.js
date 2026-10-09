'use strict';

// Real app permissions and invoice module; isolated DOM/DB fixtures, no production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let session = { userId: 'u1', labId: 'lab1', role: 'reception', name: 'Reception' };
const tables = {
  settings: [{ id: 'main', customRoles: [{ id: 'limited', pages: ['invoices'], money: false }] }],
  patients: [{ id: 'p1', name: 'Alice <Patient>', phone: '03001234567' }, { id: 'p2', name: 'Bob', phone: '03007654321' }],
  invoices: [
    { id: 'unpaid', no: 'INV-001', patientId: 'p1', createdAt: '2026-10-08T12:00:00', subtotal: 100, total: 100, paid: 0, due: 100, status: 'unpaid' },
    { id: 'partial', no: 'INV-002', patientId: 'p2', createdAt: '2026-10-09T12:00:00', subtotal: 100, total: 100, paid: 40, due: '60', status: 'partial' },
    { id: 'paid', no: 'INV-003', createdAt: '2026-10-09T12:00:00', total: 100, paid: 100, due: 0, status: 'paid' },
    { id: 'zero', no: 'INV-004', createdAt: '2026-10-09T12:00:00', total: 0, paid: 0, due: 0, status: 'unpaid' },
    { id: 'credit', no: 'INV-005', createdAt: '2026-10-09T12:00:00', total: 100, paid: 110, due: -10, status: 'partial' },
    { id: 'stale', no: 'INV-006', createdAt: '2026-10-07T12:00:00', subtotal: 25, total: 25, paid: 0, due: 25, status: 'paid' }
  ],
  payments: [{ id: 'pay1', invoiceId: 'partial', amount: 40, date: '2026-10-09T12:00:00' }],
  results: [{ invoiceId: 'paid', status: 'pending' }, { invoiceId: 'unpaid', status: 'ready' }],
  onlinepay_claims: [{ invoiceId: 'paid', status: 'pending' }, { invoiceId: 'partial', status: 'pending' }]
};
const DB = {
  all: table => (tables[table] || []).slice(),
  get: (table, id) => (tables[table] || []).find(row => row.id === id) || null,
  insert(table, row) { const saved = Object.assign({ id: table + '-' + tables[table].length }, row); tables[table].push(saved); return saved; },
  update(table, id, patch) { Object.assign(this.get(table, id), patch); }
};
function element(attrs = {}) {
  const listeners = {};
  let html = '', children = [];
  return {
    attrs, value: attrs.value || '', style: {}, textContent: '', classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} },
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      children = (value.match(/<[a-z][^>]*>/gi) || []).map(tag => element(Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])
      )));
    },
    getAttribute(key) { return attrs[key]; }, setAttribute(key, value) { attrs[key] = value; },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn({ target: this, preventDefault() {} })); },
    querySelectorAll(selector) {
      const matches = item => selector[0] === '#' ? item.attrs.id === selector.slice(1) :
        selector[0] === '[' ? Object.hasOwn(item.attrs, selector.slice(1, -1)) :
          selector[0] === '.' ? (item.attrs.class || '').split(' ').includes(selector.slice(1)) : false;
      return children.flatMap(item => [...(matches(item) ? [item] : []), ...item.querySelectorAll(selector)]);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
}
const view = element();
const document = {
  readyState: 'loading', body: element(), documentElement: element(),
  addEventListener() {}, querySelectorAll() { return []; },
  getElementById: id => id === 'view' ? view : view.querySelector('#' + id)
};
const context = vm.createContext({
  DB, document, console, location: { hash: '#/invoices/pending' }, navigator: { userAgent: '', platform: '' },
  localStorage: { getItem: key => key === 'labpos_session' ? JSON.stringify(session) : null },
  setTimeout() {}, setInterval() {}, clearTimeout() {}, addEventListener() {}
});
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
load('assets/js/app.js');
const App = context.App;
assert.equal(App.currentKey(), 'invoices');
assert.equal(App.canPage(App.currentKey()), true);
session.role = 'technician';
assert.equal(App.canPage(App.currentKey()), false);
session.role = 'custom'; session.roleId = 'limited';
assert.equal(App.canPage(App.currentKey()), true);
assert.equal(App.hideMoney(), true);
session.role = 'reception';
const routes = {};
let modal, modalTitle, closed, lastToast;
Object.assign(App, {
  route: (name, fn) => { routes[name] = fn; }, barcodeHtml() {},
  toast: message => { lastToast = message; }, today: () => '2026-10-09',
  modal(title, body, options) {
    modalTitle = title; modal = element(); modal.innerHTML = body; closed = false;
    const close = () => { closed = true; };
    options.onOpen(modal, close); return close;
  }
});
load('assets/js/mod-invoices.js');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
vm.runInContext(html.match(/window\.__LAZY_ROUTES = \{[\s\S]*?\n\};/)[0], context);
assert.equal(context.__LAZY_ROUTES['#/invoices/pending'], 'assets/js/mod-invoices.js');
assert.equal(context.__LAZY_ROUTES['#/invoices'], 'assets/js/mod-invoices.js');
const appSource = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
assert.match(appSource, /label: 'Pending Invoices', route: '#\/invoices\/pending'/);
assert.match(appSource, /label: 'POS Slips', route: '#\/receipts'/);
const field = id => document.getElementById(id);
function change(id, value, event = 'change') { field(id).value = value; field(id).fire(event); }
function rows() { return field('pi-rows').innerHTML; }
function stat(label, value) { assert.match(view.innerHTML, new RegExp('>' + label + '</div>\\s*<div[^>]*>' + value + '</div>')); }
function collect(id, amount) {
  const button = view.querySelectorAll('[data-collect]').find(el => el.attrs['data-collect'] === id);
  assert.ok(button, 'Collect is available for ' + id); button.fire('click');
  assert.equal(modalTitle, 'Collect Payment & Concession');
  modal.querySelector('#pm-amount').value = amount;
  modal.querySelector('#pm-amount').fire('input');
  modal.querySelector('#pm-save').fire('click');
}
routes['#/invoices/pending']();
stat('Pending Invoices', '3'); stat('Outstanding Amount', 'Rs 185'); stat('Unpaid Invoices', '2'); stat('Partial Invoices', '1');
assert.match(rows(), /INV-001/); assert.match(rows(), /INV-002/); assert.match(rows(), /INV-006/);
assert.doesNotMatch(rows(), /INV-00[345]/);
assert.match(rows(), /Alice &lt;Patient&gt;/);
assert.ok(rows().indexOf('INV-006') < rows().indexOf('INV-001'), 'oldest first');
assert.match(rows(), /href="#\/invoice\/unpaid"[^>]*>View/);
change('pi-q', '03007654321', 'input');
assert.match(rows(), /INV-002/); assert.doesNotMatch(rows(), /INV-001/);
stat('Pending Invoices', '3'); // summaries remain global
change('pi-q', 'alice', 'input'); assert.match(rows(), /INV-001/);
change('pi-q', 'INV-006', 'input'); assert.match(rows(), /INV-006/);
change('pi-q', '', 'input'); change('pi-status', 'partial'); assert.match(rows(), /INV-002/); assert.doesNotMatch(rows(), /INV-001/);
change('pi-date', '2026-10-08'); assert.match(rows(), /No pending invoices match these filters/);
field('pi-clear').fire('click'); change('pi-date', '2026-10-08'); assert.match(rows(), /INV-001/); assert.doesNotMatch(rows(), /INV-002/);
field('pi-clear').fire('click');
collect('unpaid', 101); assert.equal(closed, false); assert.match(lastToast, /cannot exceed/); assert.equal(DB.get('invoices', 'unpaid').due, 100);
modal.querySelector('#pm-cancel').fire('click');
collect('unpaid', 30); assert.equal(closed, true); assert.equal(DB.get('invoices', 'unpaid').due, 70);
stat('Outstanding Amount', 'Rs 155'); stat('Partial Invoices', '2');
collect('unpaid', 70); assert.equal(DB.get('invoices', 'unpaid').status, 'paid'); assert.doesNotMatch(rows(), /INV-001/);
stat('Pending Invoices', '2'); stat('Outstanding Amount', 'Rs 85');
session.role = 'custom'; session.roleId = 'limited'; routes['#/invoices/pending']();
assert.doesNotMatch(view.innerHTML + rows(), /Rs |data-collect|>Due</); stat('Outstanding Amount', 'Hidden');
assert.match(rows(), />View</);
session.role = 'reception'; routes['#/invoices/pending']();
collect('partial', 60); collect('stale', 25);
assert.match(rows(), /No pending invoices\. There are no outstanding balances/);
stat('Pending Invoices', '0'); stat('Outstanding Amount', 'Rs 0');
assert.equal(tables.payments.length, 5, 'each collection creates one payment');
assert.equal(tables.onlinepay_claims[0].status, 'pending', 'claims are separate');
routes['#/invoices']();
assert.match(field('inv-rows').innerHTML, /INV-001/); assert.match(field('inv-rows').innerHTML, /INV-003/);
console.log('PASS: pending route/lazy map, role gating, summaries, positive balances, search/date/status, View, shared partial/full collection, validation, money visibility, empty state, All Invoices regression');
