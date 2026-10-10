'use strict';

// Render the actual Home Sampling routes with isolated, read-only booking data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const today = '2031-04-12';
const routes = {}, reads = [];
let bookings = [], writes = 0;
const riders = Object.freeze([Object.freeze({ id: 'r1', name: 'Rider One' })]);
function noWrite() { writes++; throw Error('Rendering and filtering must not write or seed data'); }
const DB = {
  all(table) {
    reads.push(table);
    assert(['home_sampling', 'riders'].includes(table), 'summary reads only its real booking/rider tables');
    return table === 'home_sampling' ? bookings : riders;
  },
  insert: noWrite, update: noWrite, remove: noWrite, set: noWrite, save: noWrite
};
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function element(attrs = {}) {
  let html = '', children = [];
  const listeners = {};
  return {
    attrs, value: attrs.value || '',
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      children = (value.match(/<[a-z][^>]*>/gi) || []).map(tag => element(Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])
      )));
    },
    getAttribute: key => attrs[key],
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn.call(this, { target: this })); },
    querySelectorAll(selector) {
      return children.filter(child => selector[0] === '#'
        ? child.attrs.id === selector.slice(1) : Object.hasOwn(child.attrs, selector.slice(1, -1)));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
}
const view = element();
const document = {
  addEventListener() {},
  getElementById: id => id === 'view' ? view : view.querySelector('#' + id)
};
const App = { esc, today: () => today, d: value => value, money: value => String(value),
  route: (route, handler) => { routes[route] = handler; } };
const context = vm.createContext({ App, DB, document, console, location: { hash: '#/home-sampling' } });
context.window = context;
const filename = 'assets/js/mod-samples.js';
vm.runInContext(fs.readFileSync(path.join(root, filename), 'utf8'), context, { filename });

function summary(expected) {
  const html = view.innerHTML;
  const start = html.indexOf('<div class="hs-summary-grid">');
  const end = html.indexOf('id="hsRidersBtn"');
  assert(start >= 0 && end > start && end < html.indexOf('id="hsSearch"'), 'cards precede actions and filters');
  const cards = html.slice(start, end);
  assert.equal((cards.match(/class="card hs-summary-card"/g) || []).length, 5);
  assert.deepEqual([...cards.matchAll(/class="hs-kpi-lbl">([^<]*)</g)].map(m => m[1]),
    ["Today's Bookings", 'Pending Dispatch', 'Dispatched', 'Collected', 'Checked-in to Lab'].map(esc));
  assert.deepEqual([...cards.matchAll(/class="hs-kpi-val">([^<]*)</g)].map(m => Number(m[1])), expected);
  assert.deepEqual([...cards.matchAll(/class="hs-kpi-sub">([^<]*)</g)].map(m => m[1]),
    ['Scheduled for today', 'Scheduled — all dates', 'Dispatched — all dates', 'Collected — all dates', 'Received today']);
  assert.doesNotMatch(cards, /data-hs-|onclick=|role="button"|tabindex=/, 'summary cards are read-only');
  for (const id of ['hsSearch', 'hsDateSelect', 'hsRiderSelect', 'hsClearFilter', 'hsBookBtn', 'hsRidersBtn']) {
    assert(document.getElementById(id), id + ' remains rendered');
  }
  assert.equal(view.querySelectorAll('[data-hs-tab]').length, 6, 'all pipeline filters remain');
  assert.equal(writes, 0);
}
function change(id, value, event = 'change') {
  const control = document.getElementById(id);
  assert(control, 'filter exists: ' + id);
  control.value = value;
  control.fire(event);
}
function rows() {
  const body = view.innerHTML.match(/<tbody>([\s\S]*?)<\/tbody>/);
  return body ? (body[1].match(/<tr>/g) || []).length : 0;
}
function booking(id, status, scheduledDate, extra = {}) {
  return Object.freeze(Object.assign({ id, bookingNo: 'HS-' + id, status, scheduledDate,
    patientName: 'Patient ' + id, riderId: 'r1', timeSlot: '08:00 AM', phone: '' }, extra));
}
const mixed = Object.freeze([
  booking('today-scheduled', 'scheduled', today, { patientName: 'Patient <one>' }),
  booking('today-dispatched', 'dispatched', today),
  booking('today-collected', 'collected', today),
  booking('today-received', 'received_in_lab', today),
  booking('today-cancelled', 'cancelled', today),
  booking('today-other', 'other', today),
  booking('past-scheduled', 'scheduled', '2031-04-11', { riderId: 'r2' }),
  booking('future-scheduled', 'scheduled', '2031-04-13', { riderId: 'r2' }),
  booking('future-dispatched', 'dispatched', '2031-04-13'),
  booking('past-collected', 'collected', '2031-04-11'),
  booking('future-collected', 'collected', '2031-04-13'),
  booking('undated-collected', 'collected', undefined),
  booking('received-today', 'received_in_lab', '2031-04-11', { receivedAt: today + 'T10:00:00Z' }),
  booking('created-today', 'cancelled', '2031-04-13', { createdAt: today + 'T10:00:00Z' })
]);
for (const route of ['#/home-sampling', '#/samples/home']) {
  bookings = Object.freeze([]);
  routes[route]();
  summary([0, 0, 0, 0, 0]);
  assert.match(view.innerHTML, /No Home Sampling Bookings Found/);
  assert.equal(rows(), 0);
  bookings = undefined;
  routes[route]();
  summary([0, 0, 0, 0, 0]);

  bookings = mixed;
  const before = JSON.stringify(bookings);
  routes[route]();
  // Lab intake includes today's scheduled received booking and the older booking received today.
  summary([6, 3, 2, 4, 2]);
  assert.equal(rows(), mixed.length);
  assert.match(view.innerHTML, /Patient &lt;one&gt;/);
  for (const action of ['dispatch', 'collect', 'receive']) {
    assert(view.querySelectorAll('[data-hs-action]').some(el => el.attrs['data-hs-action'] === action), action + ' workflow still rendered');
  }
  change('hsDateSelect', 'today');
  summary([6, 3, 2, 4, 2]);
  assert.equal(rows(), 6, 'date filter still limits the table');
  view.querySelectorAll('[data-hs-tab]').find(el => el.attrs['data-hs-tab'] === 'scheduled').fire('click');
  assert.equal(rows(), 1, 'status filter still limits the table');
  summary([6, 3, 2, 4, 2]);
  change('hsSearch', 'no matching patient', 'input');
  assert.equal(rows(), 0);
  assert.match(view.innerHTML, /No bookings match your current search/);
  summary([6, 3, 2, 4, 2]);
  document.getElementById('hsClearFilter').fire('click');
  assert.equal(rows(), mixed.length, 'clear restores the full table');
  change('hsRiderSelect', 'r2');
  assert.equal(rows(), 2, 'rider filtering still works');
  summary([6, 3, 2, 4, 2]);
  document.getElementById('hsClearFilter').fire('click');
  assert.equal(JSON.stringify(bookings), before, 'render and filters never mutate source records or their order');
}
// Static layout guard; actual browser layout remains a visual smoke check.
assert.match(view.innerHTML, /\.hs-dash \.hs-summary-grid \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(view.innerHTML, /@media \(max-width: 900px\) \{ \.hs-dash \.hs-summary-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(view.innerHTML, /@media \(max-width: 540px\) \{ \.hs-dash \.hs-summary-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
assert(reads.includes('home_sampling'));
assert.equal(writes, 0);
console.log('Home Sampling cards: both routes, empty/missing data, mixed dates/statuses, escaped labels, global counts under filters, workflow controls and no writes/mutations passed.');
