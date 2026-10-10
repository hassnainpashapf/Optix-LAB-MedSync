'use strict';

// Exercise the real web module with isolated, immutable DB fixtures and a tiny DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const today = '2026-10-10';
const routes = {};
const reads = [], writes = [], escaped = [];
const tables = {
  home_sampling: Object.freeze([]),
  riders: Object.freeze([Object.freeze({ id: 'r1', name: 'Rider One' })])
};
const DB = new Proxy({}, {
  get(target, method) {
    if (method === 'all') return table => {
      reads.push(table);
      assert.ok(Object.hasOwn(tables, table), 'render reads only bookings and riders');
      return tables[table];
    };
    return () => { writes.push(method); assert.fail('Unexpected DB operation: ' + method); };
  }
});

function element(attrs = {}) {
  let html = '', children = [];
  const listeners = {};
  return {
    attrs, listeners, value: attrs.value || '',
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      children = (value.match(/<[a-z][^>]*>/gi) || []).map(tag => element(Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])
      )));
    },
    getAttribute(key) { return attrs[key]; },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn.call(this, { target: this })); },
    querySelectorAll(selector) {
      return children.filter(item => selector[0] === '#' ? item.attrs.id === selector.slice(1) :
        selector[0] === '[' ? Object.hasOwn(item.attrs, selector.slice(1, -1)) :
          selector[0] === '.' ? (item.attrs.class || '').split(' ').includes(selector.slice(1)) : false);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
}
const view = element();
const document = {
  addEventListener() {},
  getElementById: id => id === 'view' ? view : view.querySelector('#' + id)
};
const App = {
  route: (name, render) => { routes[name] = render; },
  today: () => today,
  d: value => value,
  money: value => 'Rs ' + value,
  esc(value) {
    escaped.push(String(value));
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }
};
const context = vm.createContext({ App, DB, document, console });
context.window = context;
const file = 'assets/js/mod-samples.js';
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
const render = routes['#/home-sampling'];
assert.equal(typeof render, 'function');
assert.equal(routes['#/samples/home'], render, 'both existing page routes render the cards');

function summaries(expected) {
  const cards = [...view.innerHTML.matchAll(/<div class="stat" data-tint="[a-z]+"><div class="stat-ico"><svg[\s\S]*?<\/svg><\/div><div class="lb">([^<]+)<\/div><div class="vl">(\d+)<\/div><div class="dl">([^<]+)<\/div><\/div>/g)];
  assert.deepEqual(cards.map(card => [card[1], Number(card[2]), card[3]]), [
    ['Today&#39;s Bookings', expected[0], 'Scheduled for today'],
    ['Pending Dispatch', expected[1], 'Scheduled · All dates'],
    ['Dispatched', expected[2], 'All dates'],
    ['Collected', expected[3], 'All dates']
  ]);
  assert.ok(view.innerHTML.indexOf('class="stat-grid"') < view.innerHTML.indexOf('class="hs-tab-bar"'), 'cards precede the filters');
  ['hsSearch', 'hsDateSelect', 'hsRiderSelect', 'hsBookBtn', 'hsRidersBtn'].forEach(id => {
    assert.ok(document.getElementById(id), 'existing control remains: ' + id);
  });
  assert.equal(view.querySelectorAll('[data-hs-tab]').length, 6);
}
function change(id, value, type = 'change') {
  const control = document.getElementById(id);
  control.value = value;
  control.fire(type);
}
function tab(status) {
  view.querySelectorAll('[data-hs-tab]').find(el => el.attrs['data-hs-tab'] === status).fire('click');
}
function booking(id, date, status, extra = {}) {
  return Object.freeze(Object.assign({
    id, bookingNo: 'BOOK-' + id, scheduledDate: date, status,
    patientName: 'Patient ' + id, riderId: 'r1', createdAt: today + 'T08:00:00'
  }, extra));
}

render();
summaries([0, 0, 0, 0]);
assert.match(view.innerHTML, /No Home Sampling Bookings Found/);
assert.deepEqual(writes, [], 'empty render does not seed bookings or riders');
tables.home_sampling = Object.freeze([
  booking('s0', today, 'scheduled'),
  booking('d0', today, 'dispatched'),
  booking('c0', today, 'collected'),
  booking('r0', today, 'received_in_lab'),
  booking('x0', today, 'cancelled'),
  booking('u0', today, 'unknown'),
  booking('s1', '2026-10-09', 'scheduled'),
  booking('s2', '2026-10-11', 'scheduled', { riderId: 'r2' }),
  booking('d1', '2026-10-09', 'dispatched'),
  booking('c1', '2026-10-11', 'collected'),
  booking('c2', '2026-01-01', 'collected'),
  booking('r1', '2026-10-09', 'received_in_lab'),
  booking('x1', '2026-10-11', 'cancelled')
]);
const snapshot = JSON.stringify(tables);
render();
summaries([6, 3, 2, 3]);
['dispatch', 'collect', 'receive'].forEach(action => assert.match(view.innerHTML, new RegExp('data-hs-action="' + action + '"')));
assert.match(view.innerHTML, /<table /);
assert.match(view.innerHTML, /data-hs-slip=/);
assert.match(view.innerHTML, /data-hs-edit=/);
assert.match(view.innerHTML, /data-hs-cancel=/);

change('hsDateSelect', 'tomorrow');
summaries([6, 3, 2, 3]);
assert.match(view.innerHTML, /BOOK-s2/);
assert.doesNotMatch(view.innerHTML, /BOOK-s0/);
change('hsRiderSelect', 'r1');
assert.doesNotMatch(view.innerHTML, /BOOK-s2/);
tab('collected');
assert.match(view.innerHTML, /BOOK-c1/);
assert.doesNotMatch(view.innerHTML, /BOOK-x1/);
change('hsSearch', 'no match', 'input');
assert.match(view.innerHTML, /No bookings match your current search and filter selections/);
summaries([6, 3, 2, 3]);
document.getElementById('hsClearFilter').fire('click');
assert.match(view.innerHTML, /BOOK-s0/);
assert.match(view.innerHTML, /BOOK-x1/);
change('hsDateSelect', 'today');
tab('cancelled');
assert.match(view.innerHTML, /BOOK-x0/);
assert.doesNotMatch(view.innerHTML, /BOOK-x1/);
summaries([6, 3, 2, 3]);

assert.equal(JSON.stringify(tables), snapshot, 'rendering and filtering leave persisted data unchanged');
assert.deepEqual(writes, []);
assert.ok(reads.includes('home_sampling'));
["Today's Bookings", 'Pending Dispatch', 'Dispatched', 'Collected', 'Scheduled for today', 'Scheduled · All dates', 'All dates', '6', '3', '2', '0'].forEach(value => {
  assert.ok(escaped.includes(value), 'summary text passes through App.esc: ' + value);
});
console.log('PASS: web home sampling summary totals, empty state, mixed dates/statuses, read-only rendering, unchanged filters/workflow controls, escaping, scoped responsive grid');
