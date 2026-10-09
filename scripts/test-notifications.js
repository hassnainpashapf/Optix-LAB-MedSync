'use strict';

// Real app permissions, DB and stock calculation; controlled DOM/audio/timers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let session = { userId: 'admin1', role: 'admin', labId: 'lab1', name: 'Admin', roleId: 'reader' };
const store = { seq: {}, settings: { id: 'main', customRoles: [{ id: 'reader', pages: ['stock'], money: false }] }, users: [], tests: [], patients: [], invoices: [], results: [], stock_items: [], stock_moves: [], onlinepay_claims: [] };
const storage = new Map([['labpos_db_lab1', JSON.stringify(store)], ['labpos_labs_v1', JSON.stringify({ labs: [{ id: 'lab1', active: true }, { id: 'lab2', active: true }] })]]);
function events() {
  const listeners = {};
  return { addEventListener(type, fn) { (listeners[type] ||= new Set()).add(fn); },
    removeEventListener(type, fn) { listeners[type]?.delete(fn); },
    fire(type, event = {}) { [...(listeners[type] || [])].forEach(fn => fn(event)); },
    listenerCount(type) { return listeners[type]?.size || 0; } };
}
function element(attrs = {}) {
  let html = '', children = [];
  const classes = new Set();
  return Object.assign({ attrs, style: {}, hidden: false, textContent: '',
    classList: { toggle(c, yes) { const on = yes === undefined ? !classes.has(c) : yes; if (on) classes.add(c); else classes.delete(c); return on; }, contains(c) { return classes.has(c); }, add(c) { classes.add(c); }, remove(c) { classes.delete(c); } },
    get innerHTML() { return html; }, set innerHTML(value) { html = value; children = (value.match(/<[a-z][^>]*>/gi) || []).map(tag => element(Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])))); },
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; },
    querySelectorAll(selector) { return children.filter(e => selector[0] === '#' ? e.attrs.id === selector.slice(1) : selector[0] === '[' && Object.hasOwn(e.attrs, selector.slice(1, -1))); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }, events());
}
const nodes = Object.fromEntries(['view', 'shell', 'sidebar', 'topbar'].map(id => [id, element({ id })]));
const document = Object.assign(events(), { readyState: 'loading', hidden: false, body: element(), documentElement: element(),
  getElementById(id) { return nodes[id] || nodes.topbar.querySelector('#' + id) || nodes.sidebar.querySelector('#' + id) || nodes.view.querySelector('#' + id); },
  querySelector() { return null; }, querySelectorAll() { return []; }
});
let nextTimer = 1, plays = 0, contexts = 0, closed = 0, resumeFails = false;
const timers = new Map();
class Audio {
  constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; }
  resume() { if (resumeFails) return Promise.reject(new Error('autoplay blocked')); this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; closed++; return Promise.resolve(); }
  createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { plays++; }, stop() { this.onended(); } }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
}
const context = vm.createContext(Object.assign(events(), {
  console, document, location: { hash: '#/dashboard' }, navigator: { platform: '', userAgent: '' }, AudioContext: Audio,
  matchMedia() { return { matches: false }; },
  localStorage: { getItem: k => k === 'labpos_session' ? JSON.stringify(session) : storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  setTimeout() {}, clearTimeout() {}, setInterval(fn) { const id = nextTimer++; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); }
}));
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
load('assets/js/db.js'); load('assets/js/app.js'); load('assets/js/notifications-core.js'); load('assets/js/mod-notifications.js');
const { App, DB } = context, N = App.notifications;
const baseTimers = timers.size, baseClicks = document.listenerCount('click');
const actualAll = DB.all;
let reads = [];
DB.all = table => { reads.push(table); return actualAll(table); };
function critical(id) { DB.insertAs('results', id, { testId: 't1', invoiceId: 'i1', reportedAt: '2026-10-09T00:00:00Z', critical: [{ name: 'Secret <marker>', value: '999', unit: 'mg' }] }); }
function stock(id, qty, reorder, expiry, active = true) {
  DB.insertAs('stock_items', id, { name: id + ' <reagent>', reorderLevel: reorder, active });
  if (qty) DB.insert('stock_moves', { itemId: id, type: 'in', qty, expiry });
}
critical('r1'); critical('acked'); DB.update('results', 'acked', { criticalAck: { by: 'admin' } });
stock('out', 0, 10); stock('low-expired', 2, 10, '2000-01-01'); stock('soon', 50, 1, new Date(Date.now() + 86400000).toISOString().slice(0, 10));
stock('inactive', 0, 10, '', false); stock('healthy', 100, 10);
DB.insertAs('onlinepay_claims', 'claim1', { status: 'pending', amount: 123 });
DB.insertAs('onlinepay_claims', 'done', { status: 'approved', amount: 456 });
N.start();
assert.equal(timers.size, baseTimers + 1); assert.equal(plays, 0, 'initial baseline is silent');
const initial = N.collect();
assert.equal(initial.length, 5); assert.equal(new Set(initial.map(a => a.id)).size, 5);
assert.equal(initial.find(a => a.id === 'stock:low-expired').detail, 'Low stock · Expired stock');
assert.equal(initial[0].severity, 'critical');
for (let n = 0; n < 5; n++) N.start();
assert.equal(timers.size, baseTimers + 1); assert.equal(document.listenerCount('click'), baseClicks + 1, 'one delegated listener');
App.renderShell('dashboard');
let bell = document.getElementById('notificationBell');
assert.equal(document.getElementById('notificationCount').textContent, '5');
assert.equal(bell.classList.contains('has-urgent'), true);
assert.match(bell.attrs['aria-label'], /5 actionable alerts/);
assert.match(nodes.topbar.innerHTML, /aria-label="Downloads">[\s\S]*?<\/a><a[^>]+id="notificationBell"/, 'bell immediately follows Downloads');
const click = (mute = false, trusted = true) => document.fire('click', { isTrusted: trusted, target: { closest: selector => mute && selector === '[data-notification-mute]' ? {} : null } });
click(false, false); assert.equal(contexts, 0, 'synthetic gesture cannot unlock sound');
critical('before-gesture'); N.refresh(); assert.equal(plays, 0);
click(); assert.equal(contexts, 1); N.refresh(); assert.equal(plays, 0, 'unlock does not replay blocked alerts');
critical('new'); N.refresh(); assert.equal(plays, 1, 'new critical plays once');
N.start(); N.refresh(); App.renderShell('notifications'); N.refresh();
assert.equal(plays, 1, 'shell recreation/render cannot replay');
DB.update('results', 'new', { criticalAck: { by: 'admin' } }); N.refresh();
DB.update('results', 'new', { criticalAck: null }); N.refresh(); assert.equal(plays, 1, 'same identity returning is not new');
DB.update('results', 'new', { reportedAt: '2026-10-09T01:00:00Z' }); N.refresh(); assert.equal(plays, 2, 'newly reported critical revision is new');
stock('new-low', 5, 10); N.refresh(); assert.equal(plays, 2, 'warnings stay silent');
DB.insert('stock_moves', { itemId: 'new-low', type: 'out', qty: 5 }); N.refresh(); assert.equal(plays, 3, 'stock escalation is new high alert');
click(true); assert.equal(N.isMuted(), true); assert.equal(storage.get('labpos_notifications_muted'), '1');
critical('muted'); N.refresh(); assert.equal(plays, 3);
click(true); N.refresh(); assert.equal(plays, 3, 'unmute consumes no backlog');
resumeFails = true; N.stop(); N.start(); click();
critical('blocked'); N.refresh(); assert.equal(plays, 3, 'autoplay rejection is harmless');
resumeFails = false; click(); N.refresh(); assert.equal(plays, 3);
critical('unblocked'); N.refresh(); assert.equal(plays, 4);
// Each permission boundary excludes data before reading the source, not just before rendering.
session.role = 'reception'; reads = []; N.refresh();
assert.deepEqual([...N.collect()].map(a => a.id), ['payment:claim1']);
assert.ok(!reads.includes('results') && !reads.includes('stock_items'));
App.renderShell('notifications');
assert.equal(document.getElementById('notificationCount').textContent, '1');
assert.equal(document.getElementById('notificationBell').classList.contains('has-urgent'), false);
session.role = 'technician'; reads = []; N.refresh();
assert.ok(!N.collect().some(a => a.id.startsWith('payment:'))); assert.ok(!reads.includes('onlinepay_claims'));
session.role = 'custom'; reads = []; N.refresh();
assert.ok(N.collect().every(a => a.id.startsWith('stock:'))); assert.ok(!reads.includes('results') && !reads.includes('onlinepay_claims'));
DB.update('settings', 'main', { customRoles: [{ id: 'reader', pages: ['results', 'onlinepay'], money: false }] });
reads = []; N.refresh(); assert.equal(N.collect().length, 0); assert.ok(!reads.includes('results') && !reads.includes('onlinepay_claims'));
DB.update('settings', 'main', { customRoles: [{ id: 'reader', pages: ['onlinepay'], money: true }] });
assert.equal(N.collect().length, 1);
App.labFeatures = { features: { onlinepay: false } }; assert.equal(N.collect().length, 0); App.labFeatures = null;
for (const role of ['doctor', 'unknown']) { session.role = role; reads = []; assert.equal(N.collect().length, 0); assert.deepEqual(reads, []); }
session = null; N.refresh(); assert.equal(timers.size, baseTimers); assert.ok(closed > 0);
assert.equal(document.getElementById('notificationCount').hidden, true);
session = { userId: 'other', role: 'admin', labId: 'lab2' };
reads = []; assert.equal(N.collect().length, 0); assert.deepEqual(reads, [], 'mismatched tenant snapshot is never read');
DB.useLab('lab2'); context.location.hash = '#/notifications'; N.start();
assert.match(nodes.view.innerHTML, /All clear/); assert.doesNotMatch(nodes.view.innerHTML, /Secret|claim1/);
assert.equal(plays, 4, 'new session gets a silent baseline');
context.fire('pagehide'); assert.equal(timers.size, baseTimers);
context.fire('pageshow'); assert.equal(timers.size, baseTimers + 1);
critical('escape'); N.refresh();
assert.match(nodes.view.innerHTML, /Secret &lt;marker&gt;/); assert.doesNotMatch(nodes.view.innerHTML, /Secret <marker>/);
assert.match(nodes.view.innerHTML, /href="#\/dashboard"/);
const beforeDuplicate = N.collect().length;
DB.all = table => { const list = actualAll(table); return table === 'results' ? list.concat(list) : list; };
assert.equal(N.collect().length, beforeDuplicate, 'duplicate source rows do not duplicate alerts');
for (let i = 0; i < 105; i++) DB.insertAs('onlinepay_claims', 'many-' + i, { status: 'pending', amount: 1 });
N.refresh(); assert.equal(document.getElementById('notificationCount').textContent, '99+');
assert.match(document.getElementById('notificationBell').attrs['aria-label'], /106 actionable alerts/);
click(true); assert.equal(storage.get('labpos_notifications_muted'), '1');
N.stop();
delete App.notifications; load('assets/js/notifications-core.js');
assert.equal(App.notifications.isMuted(), true, 'mute preference survives controller reload');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(index, /'#\/notifications': 'assets\/js\/mod-notifications.js'/);
assert.ok(index.indexOf('assets/js/app.js?v=') < index.indexOf('assets/js/notifications-core.js?v='));
console.log('PASS notifications: roles/read boundaries, badge, routing, dedup, new-only audio, autoplay, mute, session isolation and cleanup');
