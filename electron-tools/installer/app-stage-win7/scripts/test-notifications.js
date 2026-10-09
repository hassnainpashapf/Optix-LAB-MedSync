'use strict';
// Actual app permissions, inventory calculator, notification lifecycle and lazy view.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const listeners = {}, windowListeners = {}, intervals = new Map(), storage = {};
let nextTimer = 0, sounds = 0, audioCreated = 0, audioClosed = 0, failRead = false;
let session = { userId: 'u1', labId: 'lab1', role: 'admin', name: 'Admin' };
const tables = {
  settings: [{ id: 'main', customRoles: [{ id: 'limited', pages: ['invoices', 'onlinepay'], money: false }], stockExpiryDays: 30 }],
  tests: [{ id: 't1', name: '<Unsafe test>' }],
  results: [{ id: 'r1', invoiceId: 'i1', testId: 't1', critical: [{ name: 'Potassium', value: '9', unit: 'mmol/L' }] },
    { id: 'ack', critical: [{}], criticalAck: { by: 'Doctor' } }],
  stock_items: [{ id: 'out', name: 'Out kit' }, { id: 'low', name: 'Low kit', reorderLevel: 5 },
    { id: 'expired', name: 'Expired kit' }, { id: 'soon', name: 'Soon kit' }, { id: 'inactive', active: false }],
  stock_moves: [{ itemId: 'low', type: 'in', qty: 3 }, { itemId: 'expired', type: 'in', qty: 10, expiry: '2000-01-01' },
    { itemId: 'soon', type: 'in', qty: 10, expiry: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }],
  invoices: [{ id: 'i1', no: 'INV-1', due: 73123 }, { id: 'paid', due: 0 }],
  onlinepay_claims: [{ id: 'c1', status: 'pending', amount: 9876 }, { id: 'done', status: 'approved', amount: 12 }]
};
const reads = [];
const DB = {
  all(table) { reads.push(table); if (failRead) throw Error('Unavailable'); return tables[table] || []; },
  get(table, id) { return (tables[table] || []).find(r => r.id === id); },
  labById: () => ({ active: true }), useLab() {},
  update(table, id, patch) { Object.assign(this.get(table, id), patch); }
};
function node() {
  return { innerHTML: '', textContent: '', hidden: false, attrs: {}, style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, appendChild() {},
    querySelector(selector) { return nodes[selector.slice(1)]; } };
}
const nodes = { notificationBell: node(), notificationCount: node(), notificationList: node(), notificationMute: node(), notificationRefresh: node(), view: node() };
const document = {
  readyState: 'loading', hidden: false, body: node(), head: node(), documentElement: node(),
  getElementById: id => nodes[id] || null, createElement: node, querySelectorAll: () => [],
  addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
  removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); }
};
function Audio() { audioCreated++; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
Audio.prototype.createOscillator = function () { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { sounds++; }, stop() { this.onended(); } }; };
Audio.prototype.createGain = function () { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; };
Audio.prototype.close = function () { audioClosed++; return Promise.resolve(); };
const context = vm.createContext({
  DB, document, console, AudioContext: Audio,
  location: { hash: '#/dashboard' }, navigator: { userAgent: '', platform: '' },
  localStorage: { getItem: key => key === 'labpos_session' ? JSON.stringify(session) : storage[key], setItem: (key, value) => { storage[key] = value; } },
  setTimeout() {}, clearTimeout() {},
  setInterval(fn) { const id = ++nextTimer; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); },
  addEventListener(type, fn) { (windowListeners[type] || (windowListeners[type] = [])).push(fn); }
});
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
load('assets/js/app.js');
// App has unrelated sync/update monitors; isolate notification-owned resources.
intervals.clear();
const baseClicks = (listeners.click || new Set()).size;
const baseKeys = (listeners.keydown || new Set()).size;
load('assets/js/notifications-core.js');
const A = context.App, N = A.notifications;
const initialData = JSON.stringify(tables);
const ids = () => Array.from(N.collect(), a => a.id);
assert.equal(A.canPage('notifications'), true);
assert.deepEqual(ids(), ['critical:r1', 'stock:expired:expired', 'stock:out:out', 'claim:c1', 'invoice:i1', 'stock:low:low', 'stock:soon:soon']);
assert.equal(JSON.stringify(tables), initialData, 'reading notifications never mutates source data');
session.role = 'reception'; reads.length = 0;
assert.deepEqual(ids(), ['claim:c1', 'invoice:i1']);
assert(!reads.includes('results') && !reads.includes('stock_items'));
session.role = 'technician'; reads.length = 0;
assert(ids().includes('critical:r1'));
assert(!reads.includes('onlinepay_claims') && !reads.includes('invoices'));
session.role = 'custom'; session.roleId = 'limited'; reads.length = 0;
assert.equal(A.canPage('notifications'), true);
assert.deepEqual(ids(), ['invoice:i1']);
assert(!JSON.stringify(N.collect()).includes('73123'));
assert(!reads.includes('onlinepay_claims'), 'money-hidden roles cannot reach amount-bearing claim queue');
tables.settings[0].customRoles[0].pages = ['stock'];
assert(N.collect().every(a => a.category === 'Stock' && a.href === '#/stock/alerts'));
tables.settings[0].customRoles[0].pages = [];
assert.equal(N.collect().length, 0);
session.role = 'doctor'; assert.equal(N.collect().length, 0);
session = { userId: 'u1', labId: 'lab1', role: 'admin' };
A.labFeatures = { features: { results: false, stock: false, inventory: false, onlinepay: false, invoices: false } };
assert.equal(N.collect().length, 0);
A.labFeatures = null;
N.start(); N.start(); N.start();
assert.equal(intervals.size, 1); assert.equal(sounds, 0); assert.equal(audioCreated, 0);
assert.equal(nodes.notificationCount.className, 'notification-count urgent');
assert.equal(nodes.notificationCount.textContent, '7');
function critical(id) { tables.results.push({ id, critical: [{ name: 'New', value: 10 }] }); }
critical('before-gesture'); N.refresh();
assert.equal(sounds, 0);
function click(trusted) { for (const fn of [...listeners.click]) fn({ isTrusted: trusted }); }
click(false); assert.equal(audioCreated, 0);
click(true); assert.equal(audioCreated, 1); assert.equal(sounds, 0);
critical('after-gesture'); N.refresh(); assert.equal(sounds, 1);
N.start(); N.refresh(); N.refresh(); assert.equal(sounds, 1, 'no repeated chirp on route rendering');
tables.onlinepay_claims.push({ id: 'normal', status: 'pending', amount: 10 }); N.refresh(); assert.equal(sounds, 1);
N.setMuted(true); assert.equal(storage.labpos_notifications_muted, '1');
critical('muted'); N.refresh(); assert.equal(sounds, 1);
N.setMuted(false); N.refresh(); assert.equal(sounds, 1, 'unmuting never replays old alerts');
critical('fresh'); N.refresh(); assert.equal(sounds, 2);
failRead = true; assert.equal(N.refresh().error, true); failRead = false;
N.refresh(); assert.equal(sounds, 2, 'read recovery does not replay known alerts');
session.labId = 'lab2'; N.start(); assert.equal(intervals.size, 1); assert.equal(sounds, 2); assert.equal(audioClosed, 1);
critical('new-lab'); N.refresh(); assert.equal(sounds, 2, 'new session needs a gesture');
click(true); critical('new-lab-gesture'); N.refresh(); assert.equal(sounds, 3);
let route;
A.route = (pattern, fn) => { assert.equal(pattern, '#/notifications'); route = fn; };
load('assets/js/mod-notifications.js');
context.location.hash = '#/notifications'; route();
assert(nodes.notificationList.innerHTML.includes('&lt;Unsafe test&gt;'));
assert(!nodes.notificationList.innerHTML.includes('<Unsafe test>'));
assert(nodes.notificationList.innerHTML.includes('href="#/invoice/i1"'));
assert(nodes.notificationList.innerHTML.includes('href="#/inventory/alerts"'));
session.role = 'custom'; session.roleId = 'limited'; N.start();
assert(nodes.notificationList.innerHTML.includes('All caught up'));
assert.equal(nodes.notificationCount.hidden, true);
tables.settings[0].customRoles[0].pages = ['invoices', 'onlinepay']; N.start();
assert(nodes.notificationList.innerHTML.includes('amounts hidden'));
assert(!nodes.notificationList.innerHTML.includes('73,123') && !nodes.notificationList.innerHTML.includes('9,876'));
assert.equal(nodes.notificationCount.className, 'notification-count');
session = null; N.refresh();
assert.equal(intervals.size, 0); assert.equal(listeners.click.size, baseClicks); assert.equal(listeners.keydown.size, baseKeys);
assert.equal(nodes.notificationBell.hidden, true);
session = { userId: 'u2', labId: 'lab1', role: 'admin' }; N.start();
assert.equal(intervals.size, 1);
windowListeners.pagehide.forEach(fn => fn());
assert.equal(intervals.size, 0); assert.equal(listeners.click.size, baseClicks);
// A browser that keeps audio suspended must never produce a delayed/autoplay chirp.
context.AudioContext = function () { Audio.call(this); this.state = 'suspended'; };
context.AudioContext.prototype = Object.create(Audio.prototype);
context.AudioContext.prototype.resume = function () { return Promise.reject(Error('Autoplay blocked')); };
N.start(); click(true); const soundsBeforeBlocked = sounds;
critical('blocked'); N.refresh(); assert.equal(sounds, soundsBeforeBlocked);
N.setMuted(true); N.stop(); N.start(); assert.equal(N.muted(), true, 'mute survives monitor restart');
N.stop(); assert.equal(intervals.size, 0);
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(index.includes("'#/notifications': 'assets/js/mod-notifications.js'"));
assert(!/<script src="assets\/js\/mod-notifications.js/.test(index));
console.log('Notifications: real alert aggregation, roles/features, money hiding, escaping, lazy route, empty/error states, gesture-only new urgent sound, mute, session isolation and timer cleanup passed.');
