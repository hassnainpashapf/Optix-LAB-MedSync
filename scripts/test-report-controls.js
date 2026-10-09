'use strict';

// Isolated DOM/DB smoke fixture, following the other dependency-free module tests.
// Runs the real route and event handlers; does not access production lab data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const routes = {}, tables = { report_templates: [] };
let focused, toast, printed, modal, download, nextId = 1;
const attrsOf = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
function element(tagName, attrs = {}) {
  const listeners = {};
  return {
    tagName, attrs, value: attrs.value || '', options: [],
    getAttribute: key => attrs[key],
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) {
      assert.ok(listeners[type]?.length, `${attrs.id} has a ${type} handler`);
      listeners[type].forEach(fn => fn({ target: this }));
    },
    focus() { focused = attrs.id; },
    click() { download = this.download; }, remove() {}
  };
}
let html = '', nodes = [];
const view = {
  get innerHTML() { return html; },
  set innerHTML(value) {
    html = value;
    nodes = [...value.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(m => element(m[1], attrsOf(m[2])));
    for (const m of value.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const select = nodes.find(n => n.attrs.id === attrsOf(m[1]).id);
      select.options = [...m[2].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(o => ({
        value: attrsOf(o[1]).value, label: o[2], selected: /\bselected\b/.test(o[1])
      }));
      select.value = (select.options.find(o => o.selected) || select.options[0])?.value || '';
    }
  }
};
const document = {
  getElementById: id => id === 'view' ? view : nodes.find(n => n.attrs.id === id) || null,
  querySelectorAll(selector) {
    if (/^\[[\w-]+\]$/.test(selector)) return nodes.filter(n => Object.hasOwn(n.attrs, selector.slice(1, -1)));
    return [];
  },
  createElement: tag => element(tag), body: { appendChild() {} }
};
const DB = {
  all: table => (tables[table] || []).slice(),
  get: (table, id) => (tables[table] || []).find(row => row.id === id) || null,
  insert(table, row) { const saved = { ...row, id: String(nextId++) }; (tables[table] ||= []).push(saved); return saved; },
  remove(table, id) { tables[table] = tables[table].filter(row => row.id !== id); },
  currentLabId: () => 'test', labs: () => []
};
const App = {
  route: (name, fn) => { routes[name] = fn; },
  today: () => '2026-10-09',
  esc: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  money: value => 'Rs ' + value, d: value => value, empty: value => value, testsById: () => ({}),
  toast: value => { toast = value; }, print: (title, body) => { printed = { title, body }; },
  modal: (title, body) => { modal = { title, body }; }
};
const context = vm.createContext({
  App, DB, document, console, Blob, URL: { createObjectURL: () => 'blob:test' }, setTimeout() {},
  localStorage: { getItem: key => key === 'labpos_session' ? '{"role":"admin"}' : null }
});
context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/mod-admin.js'), 'utf8'), context);
const field = id => { const node = document.getElementById(id); assert.ok(node, id + ' exists'); return node; };
function change(id, value) { field(id).value = value; field(id).fire('change'); }
function range(preset, from, to) {
  assert.equal(field('repPreset').value, preset);
  assert.equal(field('repFrom').value, from);
  assert.equal(field('repTo').value, to);
}
function controls() {
  assert.equal(field('repPreset').tagName, 'select');
  assert.equal(document.querySelectorAll('[data-preset]').length, 0);
  for (const id of ['repPreset', 'repFrom', 'repTo', 'repTplSel']) {
    assert.ok(nodes.some(n => n.tagName === 'label' && n.attrs.for === id), id + ' has a label');
  }
  assert.equal(field('repTplName').attrs['aria-label'], 'Template name');
  for (const id of ['repCsv', 'repBuilder', 'repSchedBtn', 'repPrint', 'tplApply', 'tplDel', 'tplSave']) field(id);
  assert.equal(nodes.filter(n => (n.attrs.class || '').split(' ').includes('rep-control-card')).length, 2);
}
routes['#/reports/:tab']({ tab: 'tests' });
controls();
range('thisMonth', '2026-10-01', '2026-10-09');
assert.deepEqual(field('repPreset').options.map(o => o.label), [
  'Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'This Month', 'Last Month', 'Custom Range'
]);
for (const [preset, from, to] of [
  ['today', '2026-10-09', '2026-10-09'], ['yesterday', '2026-10-08', '2026-10-08'],
  ['last7', '2026-10-03', '2026-10-09'], ['last30', '2026-09-10', '2026-10-09'],
  ['thisMonth', '2026-10-01', '2026-10-09'], ['lastMonth', '2026-09-01', '2026-09-30']
]) {
  change('repPreset', preset); range(preset, from, to);
  assert.equal(focused, 'repPreset', 'keyboard focus survives re-render');
}
change('repPreset', 'custom'); range('custom', '2026-09-01', '2026-09-30');
change('repFrom', '2026-08-11'); range('custom', '2026-08-11', '2026-09-30');
change('repTo', '2026-08-20'); range('custom', '2026-08-11', '2026-08-20');
field('tplSave').fire('click'); assert.match(toast, /Enter a template name/);
field('tplApply').fire('click'); assert.match(toast, /Select a template/);
field('tplDel').fire('click'); assert.match(toast, /Select a template/);
field('repTplName').value = 'August <custom>';
field('tplSave').fire('click');
const saved = tables.report_templates[0];
assert.deepEqual([saved.name, saved.preset, saved.type, saved.from, saved.to],
  ['August <custom>', 'custom', 'tests', '2026-08-11', '2026-08-20']);
assert.match(html, /August &lt;custom>/);
change('repPreset', 'today');
field('repTplSel').value = saved.id; field('tplApply').fire('click');
range('custom', '2026-08-11', '2026-08-20');
const fixed = DB.insert('report_templates', { name: 'Saved finance', type: 'finance', preset: 'last7', from: '2026-06-01', to: '2026-06-07' });
field('repTplSel').value = fixed.id; field('tplApply').fire('click');
range('last7', '2026-06-01', '2026-06-07'); // applying templates keeps stored dates, not a newly calculated preset
assert.match(html, /Finance Summary/);
field('repPrint').fire('click'); assert.match(printed.title, /Finance.*2026-06-01/);
field('repCsv').fire('click'); assert.equal(download, 'report-finance-2026-06-01-to-2026-06-07.csv');
field('repBuilder').fire('click'); assert.match(modal.title, /Builder/);
field('repSchedBtn').fire('click'); assert.match(modal.title, /Scheduled Reports/);
assert.match(modal.body, /<select[^>]*id="schedPreset"/);
field('repTplSel').value = saved.id; field('tplDel').fire('click');
assert.equal(DB.get('report_templates', saved.id), null);
assert.equal(field('repTplSel').options.some(o => o.value === saved.id), false);
for (const tab of ['tests', 'finance', 'dues', 'patients', 'labs']) {
  routes['#/reports/:tab']({ tab }); controls(); range('last7', '2026-06-01', '2026-06-07');
}
console.log('PASS: Reports select presets, labeled controls, keyboard focus, date edits, saved template state/type, Save/Apply/Delete, action wiring, all report tabs');
