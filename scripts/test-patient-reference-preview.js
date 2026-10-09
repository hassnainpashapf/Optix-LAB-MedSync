'use strict';

// Dependency-free interaction smoke test: real patient/results modules, in-memory DB and DOM fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hb = { name: 'Hemoglobin', unit: 'g/dL', ref: '11–18', refMale: '13–17', refFemale: '12–15', refChild: '11–14' };
const tests = [
  { id: 'hb', code: 'HB', name: 'Hemoglobin', price: 100, params: [hb] },
  { id: 'generic', code: 'GEN', name: 'Generic range test', type: 'generic', price: 200, params: [hb, { name: 'General only', ref: '< 10' }, { name: 'No female', ref: '1–9', refMale: '2–8' }, { name: 'No ranges' }] },
  { id: 'empty', name: 'Free text', params: [] },
  { id: 'package', name: 'Package', isPackage: true, includes: ['hb'], params: [] }
];
const tables = { tests, patients: [], invoices: [], results: [] };
const originalTests = JSON.stringify(tests);
const routes = {};
let elements = {}, rows = [], refs = [], checks = [], lastModal = '';

function element(attrs = {}) {
  const listeners = {};
  return {
    value: attrs.value || '', checked: false, hidden: false, style: {}, innerHTML: '', textContent: '',
    classList: { toggle() {} }, getAttribute: key => attrs[key],
    addEventListener(type, callback) { (listeners[type] || (listeners[type] = [])).push(callback); },
    fire(type) { (listeners[type] || []).forEach(callback => callback({ preventDefault() {} })); },
    insertBefore() {}, insertAdjacentHTML() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}
const view = element();
Object.defineProperty(view, 'innerHTML', { set(html) {
  elements = {};
  for (const tag of html.match(/<[^>]+\bid="[^"]+"[^>]*>/g) || []) {
    const attrs = attributes(tag);
    elements[attrs.id] = element(attrs);
  }
  checks = [...html.matchAll(/<input[^>]+class="ptf-tchk"[^>]*>/g)].map(match => element(attributes(match[0])));
  refs = [...html.matchAll(/<span[^>]+data-ref-test="[^"]+"[^>]*>/g)].map(match => element(attributes(match[0])));
  rows = [...html.matchAll(/<label[^>]+class="ptf-trow"[^>]*>/g)].map(match => element(attributes(match[0])));
  elements['ptf-ttype'].value = 'regular';
  elements['ptf-tlist'].querySelectorAll = selector => {
    if (selector === '.ptf-tchk:checked') return checks.filter(check => check.checked);
    if (selector === '[data-ref-test]') return refs;
    if (selector === '.ptf-trow') return rows;
    throw new Error('Unhandled selector: ' + selector);
  };
} });
const document = {
  getElementById: id => id === 'view' ? view : elements[id] || null,
  createElement: () => element(), addEventListener() {}, querySelectorAll() { return []; }
};
const DB = {
  all: name => tables[name] || [],
  get: (name, id) => (tables[name] || []).find(item => item.id === id) || null,
  insert(name, data) { const item = Object.assign({ id: name + '-' + ((tables[name] || []).length + 1) }, data); (tables[name] || (tables[name] = [])).push(item); return item; },
  update(name, id, patch) { Object.assign(this.get(name, id), patch); }
};
const App = {
  esc, route(name, callback) { routes[name] = callback; }, nav() {}, toast() {},
  normWa: () => '', money: amount => 'Rs ' + amount, optionsHtml: () => '', datalistHtml: () => '',
  toLocalInput: () => '', fromLocalInput: () => '2026-10-09T12:00:00Z', visitDefaults: () => ({}), listOptions: () => [],
  nextVisitNos: () => ({ labNo: 1, caseNo: 1 }), outsourceSync() {},
  testCatalog: { templates: () => [] },
  modal(title, html) { lastModal = html; return () => {}; }
};
const context = vm.createContext({ App, DB, document, console, setTimeout() {}, localStorage: { getItem: () => '{"role":"admin"}' } });
context.window = context;
context.scrollTo = () => {};
function load(name) { vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', name), 'utf8'), context, { filename: name }); }
function field(id, value, event = 'change') { elements[id].value = value; elements[id].fire(event); }
function preview(id) { return refs.find(ref => ref.getAttribute('data-ref-test') === id).innerHTML; }
function select(id, checked = true) { checks.find(check => check.value === id).checked = checked; elements['ptf-tlist'].fire('change'); }

load('mod-patients.js');
routes['/patients/new']();
assert.match(preview('hb'), /Normal range 11–18 g\/dL/);
assert.match(preview('empty'), /No reference ranges configured/);
field('ptf-age', '30', 'input');
field('ptf-gender', 'Male');
assert.match(preview('hb'), /Normal range 13–17 g\/dL/);
assert.match(preview('package'), /Hemoglobin — Hemoglobin: Normal range 13–17/);
select('hb');
field('ptf-gender', 'Female');
assert.match(preview('hb'), /Normal range 12–15 g\/dL/);
assert.equal(checks.find(check => check.value === 'hb').checked, true);
field('ptf-ttype', 'generic');
assert.equal(rows.find(row => row.getAttribute('data-ttype') === 'generic').style.display, '');
assert.match(preview('generic'), /Normal range 12–15/);
assert.match(preview('generic'), /General only: Normal range &lt; 10/);
assert.match(preview('generic'), /No female: Normal range 1–9/);
assert.match(preview('generic'), /No ranges: Normal range not configured/);
select('generic');
assert.match(elements['ptf-tsum'].textContent, /2 selected across both types/);
field('ptf-age', '12', 'input');
assert.match(preview('hb'), /Normal range 11–14/);
assert.match(preview('generic'), /Normal range 11–14/);
field('ptf-gender', 'Male');
assert.match(preview('hb'), /Normal range 11–14/);
assert.match(preview('generic'), /No female: Normal range 2–8/);
field('ptf-age', '13', 'input');
assert.match(preview('hb'), /Normal range 13–17/);
field('ptf-gender', 'Other');
assert.match(preview('hb'), /Normal range 11–18/);
field('ptf-age', '', 'input');
field('ptf-gender', 'Female');
assert.match(preview('hb'), /Normal range 12–15/);
field('ptf-tsearch', 'nonexistent', 'input');
assert.equal(elements['ptf-tempty'].hidden, false);
assert.equal(checks.filter(check => check.checked).length, 2);
field('ptf-tsearch', '', 'input');
field('ptf-ttype', 'regular');
assert.match(preview('hb'), /Normal range 12–15/);
assert.doesNotMatch(preview('hb'), /<input|<select|<textarea/);
assert.equal(tables.results.length, 0);

// The lazy-loaded report helper must agree with the initial preview, at age boundaries too.
const initialPreviews = [];
for (const age of ['', '12', '12.9', '13', '30']) {
  for (const gender of ['', 'Male', 'Female', 'Other']) {
    field('ptf-age', age, 'input'); field('ptf-gender', gender);
    initialPreviews.push({ age, gender, html: preview('generic') });
  }
}
load('mod-results.js');
for (const sample of initialPreviews) {
  field('ptf-age', sample.age, 'input'); field('ptf-gender', sample.gender);
  assert.equal(preview('generic'), sample.html, 'Report helper and preview disagree for ' + JSON.stringify(sample));
}
for (const [gender, age, expected] of [['Male', 30, '13–17'], ['Female', 30, '12–15'], ['Male', 12, '11–14'], ['Female', 13, '12–15']]) {
  App.enterLabResult({ test: tests[0], item: tests[0], invoice: { id: 'i', no: 'i' }, patient: { age, gender }, res: { values: {} } });
  assert.match(lastModal, new RegExp('<td class="muted">' + expected + '</td>'));
  assert.equal(attributes(lastModal.match(/<input[^>]+data-pi="0"[^>]*>/)[0]).value, '');
  App.enterLabResult({ test: tests[0], item: tests[0], invoice: { id: 'i', no: 'i' }, patient: { age, gender }, res: { values: { Hemoglobin: '14.2' } } });
  assert.equal(attributes(lastModal.match(/<input[^>]+data-pi="0"[^>]*>/)[0]).value, '14.2');
}

// Saving creates pending results with empty measured values, including selections hidden by type.
field('ptf-name', 'Range Test Patient');
field('ptf-age', '30', 'input');
field('ptf-gender', 'Female');
elements['ptf-form'].fire('submit');
assert.equal(tables.patients.length, 1);
assert.equal(tables.invoices.length, 1);
assert.equal(tables.invoices[0].items.length, 2);
assert.equal(tables.results.length, 2);
for (const result of tables.results) {
  assert.equal(result.status, 'pending');
  assert.equal(JSON.stringify(result.values), '{}');
}
assert.equal(JSON.stringify(tests), originalTests, 'Preview must not modify test definitions');
console.log('PASS: live gender/age ranges, child boundary, general fallback, packages, search/type selection, report helper parity, result entry, and empty pending result values.');
