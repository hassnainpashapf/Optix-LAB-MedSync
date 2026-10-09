'use strict';

// Deterministic route/UI checks using the real DB and stock balance calculation.
process.env.TZ = 'Asia/Karachi';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let now = '2026-12-31T18:59:00.000Z'; // Dec 31, 23:59 local
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return new Date(now).getTime(); }
}
let session = { userId: 'admin1', role: 'admin', roleId: 'stock-reader', name: 'Test Admin', labId: 'lab1' }, lastToast;
const store = { seq: {}, settings: { id: 'main', labName: 'PO test lab', customRoles: [{ id: 'stock-reader', pages: ['stock'] }] }, users: [], tests: [], patients: [], invoices: [], stock_items: [], stock_moves: [] };
const storage = new Map([['labpos_db_lab1', JSON.stringify(store)]]);
function element(attrs = {}) {
  const listeners = {};
  let html = '', children = [];
  return {
    attrs, value: attrs.value || '', style: {}, classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} },
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      children = (value.match(/<[a-z][^>]*>/gi) || []).map(tag => element(Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])
      )));
    },
    getAttribute(key) { return attrs[key]; },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn({ target: this })); },
    querySelectorAll(selector) {
      return children.filter(item => selector[0] === '#' ? item.attrs.id === selector.slice(1) :
        selector[0] === '[' && Object.hasOwn(item.attrs, selector.slice(1, -1)));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
}
const view = element();
const context = vm.createContext({
  Date: Clock, console, location: { hash: '#/stock/orders' }, navigator: { platform: '', userAgent: '' },
  document: { readyState: 'loading', body: element(), documentElement: element(),
    getElementById: id => id === 'view' ? view : id === 'skCss' ? {} : view.querySelector('#' + id),
    addEventListener() {}, querySelectorAll() { return []; } },
  localStorage: {
    getItem: key => key === 'labpos_session' ? JSON.stringify(session) : storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
  },
  setTimeout() {}, setInterval() {}, clearTimeout() {}, addEventListener() {},
  fetch() { throw new Error('No supplier transmission or network calls expected'); }
});
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
load('assets/js/db.js');
load('assets/js/app.js');
const routes = {};
Object.assign(context.App, { route: (name, fn) => { routes[name] = fn; }, toast: message => { lastToast = message; } });
load('assets/js/mod-stock.js');
function visit(tab = 'orders', section = 'stock') {
  context.location.hash = '#/' + section + '/' + tab;
  routes['#/' + section + '/:tab']({ tab });
}
const orders = () => JSON.parse(JSON.stringify(context.DB.get('settings', 'main').stockPurchaseOrders || []));
const field = id => context.document.getElementById(id);
const quantity = id => view.querySelectorAll('[data-po-qty]').find(e => e.attrs['data-po-qty'] === id);
const remove = id => view.querySelectorAll('[data-po-remove]').find(e => e.attrs['data-po-remove'] === id).fire('click');
const stockSnapshot = () => JSON.stringify([context.DB.all('stock_items'), context.DB.all('stock_moves')]);
function item(id, onHand, reorderLevel, active = true, expiry = '') {
  context.DB.insertAs('stock_items', id, { name: id + ' <reagent>', vendor: 'Supplier & Co', unit: 'tests', reorderLevel, active });
  if (onHand) context.DB.insert('stock_moves', { itemId: id, type: onHand < 0 ? 'out' : 'in', qty: Math.abs(onHand), expiry });
}
item('low', 3.2, 10); item('at-level', 5, 5); item('out', 0, 0); item('negative', -2, 3);
item('healthy', 20, 10); item('inactive', 0, 10, false); item('expiry-only', 20, 10, true, '2026-01-01');
const originalStock = stockSnapshot();
for (const role of ['reception', 'technician', 'custom']) {
  session.role = role;
  visit();
  assert.equal(orders().length, 0, 'non-admin visit cannot generate');
}
session.role = 'admin';
visit('orders', 'inventory');
assert.equal(orders().length, 0, 'generation belongs to Stock');
visit('moves');
assert.equal(orders().length, 1, 'any Stock route creates current draft');
visit();
assert.equal(orders()[0].id, 'PO-2026-12');
assert.deepEqual(orders()[0].items.map(i => [i.itemId, i.qty]), [['low', 7], ['at-level', 1], ['out', 1], ['negative', 5]]);
assert.deepEqual(orders()[0].items[0], { itemId: 'low', name: 'low <reagent>', vendor: 'Supplier & Co', unit: 'tests', onHand: 3.2, reorderLevel: 10, qty: 7 });
assert.match(view.innerHTML, /low &lt;reagent&gt;/);
assert.match(view.innerHTML, /Nothing runs automatically while the app is closed/);
for (const invalid of ['0', '-1', '2.5', 'Infinity', '']) {
  quantity('low').value = invalid; field('skPoSave').fire('click');
  assert.match(lastToast, /whole quantity/); assert.equal(orders()[0].items[0].qty, 7);
}
quantity('low').value = '12'; field('skPoSave').fire('click');
assert.equal(orders()[0].items[0].qty, 12);
const adminSave = field('skPoSave');
quantity('low').value = '99'; session.role = 'technician'; adminSave.fire('click');
assert.equal(orders()[0].items[0].qty, 12, 'permission rechecked at save time');
remove('out'); assert.equal(orders()[0].items.length, 4, 'permission rechecked at remove time');
visit(); assert.equal(field('skPoSave'), null); assert.equal(quantity('low'), undefined);
session.role = 'admin'; visit();
remove('out'); visit(); assert.equal(orders()[0].items.length, 3, 'removed line is not regenerated');
load('assets/js/db.js'); visit();
assert.equal(orders().length, 1, 'DB reload retains the monthly marker');
assert.equal(orders()[0].items[0].qty, 12, 'edited quantities survive DB reload');
assert.equal(stockSnapshot(), originalStock, 'generation and edits never mutate stock');

now = '2026-12-31T19:01:00.000Z'; // Jan 1 locally, still Dec 31 UTC
visit();
assert.equal(orders().length, 2);
assert.equal(orders()[1].id, 'PO-2027-01', 'year rollover uses local calendar date');
assert.equal(orders()[1].items[0].qty, 7, 'new month takes fresh stock snapshot');
visit(); assert.equal(orders().length, 2);
field('skPoSelect').value = 'PO-2026-12'; field('skPoSelect').fire('change');
assert.equal(quantity('low').value, '12', 'history displays earlier edited draft');
assert.equal(stockSnapshot(), originalStock);

// Removing all lines leaves the record intact, including across app reload.
visit();
for (const id of ['low', 'at-level', 'out', 'negative']) remove(id);
load('assets/js/db.js'); visit();
assert.equal(orders()[1].items.length, 0); assert.match(view.innerHTML, /will not be generated again/);
assert.equal(orders().length, 2);
for (const it of context.DB.all('stock_items')) context.DB.update('stock_items', it.id, { active: false });
const inactiveStock = stockSnapshot();
now = '2027-02-01T00:00:00.000Z'; visit(); visit();
assert.equal(orders().length, 3); assert.equal(orders()[2].items.length, 0, 'initially empty month recorded once');
assert.equal(stockSnapshot(), inactiveStock);
now = '2027-05-10T00:00:00.000Z'; visit();
assert.deepEqual(orders().map(o => o.id), ['PO-2026-12', 'PO-2027-01', 'PO-2027-02', 'PO-2027-05'], 'missed months are not backfilled');
assert.ok(orders().every(o => o.status === 'draft'));
assert.equal(context.DB.get('settings', 'main').labName, 'PO test lab', 'other settings preserved');
assert.match(fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8'), /label: 'Purchase Orders', route: '#\/stock\/orders'/);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
vm.runInContext(html.match(/window\.__LAZY_ROUTES = \{[\s\S]*?\n\};/)[0], context);
assert.equal(context.__LAZY_ROUTES['#/stock/:tab'], 'assets/js/mod-stock.js');
console.log('PASS: monthly Purchase Orders routes, local year/month rollover, dedup/reload, low/out snapshots, qty validation/edit/removal, admin guards, history, empty months, no backfill, no stock mutation or supplier calls');
