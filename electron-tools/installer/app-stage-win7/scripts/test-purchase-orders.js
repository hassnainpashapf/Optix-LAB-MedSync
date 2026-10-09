'use strict';

// Exercise the desktop's actual app helpers, route and controls with isolated data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
let session = { role: 'admin', userId: 'admin1', labId: 'lab1', name: 'Admin' };
let now = new Date(2026, 9, 1, 0, 5);
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
}
const tables = {
  settings: { id: 'main', labName: 'Unchanged lab', stockPurchaseOrders: [] },
  stock_items: [
    { id: 'low', name: 'Low <kit>', unit: 'tests', vendor: 'Vendor', reorderLevel: 10, active: true },
    { id: 'out', name: 'Out', unit: 'box', reorderLevel: 0, active: true },
    { id: 'at', name: 'At threshold', reorderLevel: 5 },
    { id: 'ok', name: 'Expired only', reorderLevel: 2 },
    { id: 'inactive', name: 'Inactive', reorderLevel: 20, active: false }
  ],
  stock_moves: [
    { itemId: 'low', type: 'in', qty: 7.2 },
    { itemId: 'at', type: 'in', qty: 5 },
    { itemId: 'ok', type: 'in', qty: 10, expiry: '2020-01-01' }
  ]
};
const stockBefore = JSON.stringify([tables.stock_items, tables.stock_moves]);
let writes = 0, toast = '';
const DB = {
  all: table => clone(tables[table] || []),
  get: (table, id) => table === 'settings' ? clone(tables.settings) : clone((tables[table] || []).find(row => row.id === id) || null),
  update(table, id, patch) { assert.equal(table, 'settings'); assert.equal(id, 'main'); assert.deepEqual(Object.keys(patch), ['stockPurchaseOrders']); writes++; Object.assign(tables.settings, clone(patch)); return clone(tables.settings); },
  labById: () => ({ active: true }), useLab() {},
  insert() { throw Error('Purchase orders must not insert stock or send anything'); }
};
function element(attrs = {}) {
  let html = '', children = [];
  const listeners = {};
  return {
    attrs, value: attrs.value || '', style: {}, appendChild() {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      children = (value.match(/<[a-z][^>]*>/gi) || []).map(tag => element(Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])
      )));
    },
    getAttribute: key => attrs[key],
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn({ target: this })); },
    querySelectorAll(selector) {
      return children.filter(child => selector[0] === '#' ? child.attrs.id === selector.slice(1) : Object.hasOwn(child.attrs, selector.slice(1, -1)));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
}
const view = element(), events = {};
const document = {
  readyState: 'loading', body: element(), head: element(), documentElement: element(),
  createElement: () => element(), addEventListener() {}, querySelectorAll: () => [],
  getElementById: id => id === 'view' ? view : id === 'skCss' ? {} : view.querySelector('#' + id)
};
const context = vm.createContext({
  DB, document, Date: Clock, console, location: { hash: '#/dashboard' }, navigator: { userAgent: '', platform: '' },
  localStorage: { getItem: key => key === 'labpos_session' ? JSON.stringify(session) : null },
  setTimeout() {}, setInterval() {}, clearTimeout() {},
  addEventListener(name, fn) { (events[name] || (events[name] = [])).push(fn); }
});
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
load('assets/js/app.js');
const App = context.App;
// First authenticated app visit generates the draft even before opening Stock.
events.hashchange.forEach(fn => fn());
assert.equal(writes, 1);
let order = tables.settings.stockPurchaseOrders[0];
assert.equal(order.id, 'PO-2026-10');
assert.equal(order.status, 'draft');
assert.deepEqual(order.items.map(it => [it.itemId, it.qty]), [['low', 3], ['out', 1], ['at', 1]]);
assert.deepEqual(Object.keys(order.items[0]).sort(), ['itemId', 'name', 'vendor', 'unit', 'onHand', 'reorderLevel', 'qty'].sort());
App.ensureMonthlyPurchaseOrder();
assert.equal(writes, 1, 'repeat visit does not write');
const snapshot = clone(order.items[0]);
tables.stock_items[0].name = 'Renamed';
App.ensureMonthlyPurchaseOrder();
assert.deepEqual(tables.settings.stockPurchaseOrders[0].items[0], snapshot);
tables.stock_items[0].name = 'Low <kit>';

App.editPurchaseOrderItem(order.id, 'low', 42);
App.editPurchaseOrderItem(order.id, 'out', null);
App.ensureMonthlyPurchaseOrder();
assert.equal(tables.settings.stockPurchaseOrders[0].items[0].qty, 42);
assert.equal(tables.settings.stockPurchaseOrders[0].items.length, 2);
for (const invalid of [0, -1, 1.2, NaN, Infinity, '2']) assert.throws(() => App.editPurchaseOrderItem(order.id, 'low', invalid), /positive whole/);
assert.throws(() => App.editPurchaseOrderItem(order.id, 'missing', 2), /no longer/);
for (const role of ['technician', 'reception', 'custom']) {
  session.role = role;
  assert.equal(App.ensureMonthlyPurchaseOrder(new Date(2026, 10, 1)), null);
  assert.throws(() => App.editPurchaseOrderItem(order.id, 'low', 2), /administrators/);
}
session.role = 'admin';
now = new Date(2026, 10, 1, 0, 5);
App.ensureMonthlyPurchaseOrder();
assert.equal(tables.settings.stockPurchaseOrders.length, 2);
assert.equal(tables.settings.stockPurchaseOrders[1].id, 'PO-2026-11');
assert.equal(tables.settings.stockPurchaseOrders[1].items[0].qty, 3);
assert.equal(tables.settings.stockPurchaseOrders[0].items[0].qty, 42);
// Empty months are persisted, do not regenerate when stock later becomes low.
const realState = App.stockState;
App.stockState = () => ({ rows: [] });
App.ensureMonthlyPurchaseOrder(new Date(2026, 11, 1));
App.stockState = realState;
let count = writes;
App.ensureMonthlyPurchaseOrder(new Date(2026, 11, 25));
assert.equal(writes, count);
assert.deepEqual(tables.settings.stockPurchaseOrders[2].items, []);
App.ensureMonthlyPurchaseOrder(new Date(2027, 0, 1));
assert.equal(tables.settings.stockPurchaseOrders[3].id, 'PO-2027-01');
assert.equal(App.stockPurchaseMonth(new Date(2026, 8, 30, 23, 59)), '2026-09', 'month uses local date, not UTC');
tables.settings.stockPurchaseOrders = clone(tables.settings.stockPurchaseOrders);
count = writes;
App.ensureMonthlyPurchaseOrder();
assert.equal(writes, count, 'deduplication uses persisted records rather than object identity');

const routes = {};
App.route = (route, handler) => { routes[route] = handler; };
App.toast = message => { toast = message; };
load('assets/js/mod-stock.js');
context.location.hash = '#/stock/purchase-orders';
routes['#/stock/:tab']({ tab: 'purchase-orders' });
assert.match(view.innerHTML, /Purchase Orders/);
assert.match(view.innerHTML, /Low &lt;kit&gt;/);
assert.match(view.innerHTML, /PO-2026-10/);
assert.match(view.innerHTML, /PO-2026-11 — Current month/);
assert.doesNotMatch(view.innerHTML, /data-recv|skRecv|skMove/);
view.querySelector('#skPoQty0').value = '9';
view.querySelectorAll('[data-po-save]')[0].fire('click');
assert.equal(tables.settings.stockPurchaseOrders[1].items[0].qty, 9);
view.querySelectorAll('[data-po-remove]')[0].fire('click');
assert.equal(tables.settings.stockPurchaseOrders[1].items.length, 2);
let history = view.querySelector('#skPoHistory');
history.value = 'PO-2026-12'; history.fire('change');
assert.match(view.innerHTML, /This monthly draft is empty/);
history = view.querySelector('#skPoHistory');
history.value = 'PO-2026-10'; history.fire('change');
assert.equal(view.querySelector('#skPoQty0').value, '42', 'history retains edited quantities');
const staleButton = view.querySelectorAll('[data-po-remove]')[0];
session.role = 'technician';
count = writes;
staleButton.fire('click');
assert.equal(writes, count);
assert.match(toast, /administrators/);
routes['#/stock/:tab']({ tab: 'purchase-orders' });
assert.doesNotMatch(view.innerHTML, /data-po-save|data-po-remove/);
assert.match(view.innerHTML, /Only administrators/);
session = null;
routes['#/stock/:tab']({ tab: 'purchase-orders' });
assert.match(view.innerHTML, /do not have access/);
assert.equal(JSON.stringify([tables.stock_items, tables.stock_moves]), stockBefore, 'generation and editing never mutate inventory');
assert.equal(tables.settings.labName, 'Unchanged lab');
console.log('Desktop purchase orders: visit generation, local month/year rollover, deduplication, empty month, snapshots, edits, history, permissions and no inventory mutation passed.');
