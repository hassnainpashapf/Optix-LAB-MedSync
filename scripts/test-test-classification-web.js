'use strict';

// Exercise the real web test catalog through its All Tests classification flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'assets/js/mod-masters.js'), 'utf8');
const tests = [
  Object.freeze({ id: 'regular-1', code: 'R<1&', name: 'Alpha <script>', category: 'H<ematology', sampleType: 'Blood', tat: 'Same day', price: 125, active: true, params: [{ name: 'Hb' }], isPackage: false, type: 'regular' }),
  Object.freeze({ id: 'generic-1', code: 'G1', name: 'Beta Generic', category: 'Biochemistry', sampleType: 'Serum', tat: '24 hours', price: 200, active: true, params: [{ name: 'ALT' }], isPackage: true, includes: ['regular-1'], type: 'generic', templateKey: 'CBC' }),
  Object.freeze({ id: 'regular-2', code: 'R2', name: 'Gamma Template Import', category: 'Microbiology', sampleType: 'Swab', tat: '48 hours', price: 300, active: false, params: [{ name: 'Culture' }], isPackage: false, type: 'regular', templateKey: 'LEGACY' })
];
const records = new Map(tests.map(test => [test.id, test]));
const writes = [];
const toasts = [];
const routes = {};

function parseAttrs(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
    if (match[1] !== 'input' && match[1] !== 'button' && match[1] !== 'option' && match[1] !== 'span' && match[1] !== 'div' && match[1] !== 'table' && match[1] !== 'thead' && match[1] !== 'tbody' && match[1] !== 'tr' && match[1] !== 'td' && match[1] !== 'th' && match[1] !== 'strong' && match[1] !== 'select' && match[1] !== 'p' && match[1] !== 'a' && match[1] !== 'label') attrs[match[1]] = match[2] === undefined ? '' : match[2];
  }
  return attrs;
}

function element(attrs = {}) {
  let html = '';
  let children = [];
  const listeners = {};
  const node = {
    attrs,
    listeners,
    value: attrs.value || '',
    checked: Object.hasOwn(attrs, 'checked'),
    disabled: Object.hasOwn(attrs, 'disabled'),
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = String(value);
      children = [...html.matchAll(/<([a-z][\w-]*)(?:\s[^>]*)?>/gi)].map(match => element(parseAttrs(match[0])));
    },
    getAttribute(key) { return attrs[key] === undefined ? null : attrs[key]; },
    hasAttribute(key) { return Object.hasOwn(attrs, key); },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    fire(type) { (listeners[type] || []).forEach(fn => fn.call(node, { target: node })); },
    querySelectorAll(selector) {
      return children.filter(child => {
        if (selector[0] === '#') return child.attrs.id === selector.slice(1);
        if (selector[0] === '.') return (child.attrs.class || '').split(' ').includes(selector.slice(1));
        if (selector[0] === '[') {
          const attr = selector.slice(1, -1).split('=')[0];
          return child.hasAttribute(attr);
        }
        return false;
      });
    },
    querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
    closest() { return null; },
    focus() {}
  };
  return node;
}

const view = element();
const document = {
  getElementById(id) {
    if (id === 'view') return view;
    return view.querySelectorAll('#' + id)[0] || null;
  }
};
const DB = {
  all(table) {
    assert.equal(table, 'tests', 'catalog only reads the tests table');
    return [...records.values()];
  },
  get(table, id) {
    assert.equal(table, 'tests');
    return records.get(id) || null;
  },
  update(table, id, value) {
    assert.equal(table, 'tests');
    writes.push({ id, value });
    records.set(id, Object.freeze(Object.assign({}, records.get(id), value)));
    return records.get(id);
  }
};
const App = {
  route(name, render) { routes[name] = render; },
  canPage() { return false; },
  confirm() { return Promise.resolve(true); },
  toast(message, kind) { toasts.push({ message, kind }); },
  icon() { return ''; },
  empty(message) { return message; },
  money(value) { return 'Rs ' + value; },
  esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  },
  modal() {},
  nav() {}
};
const context = vm.createContext({ App, DB, document, console, Promise, localStorage: { getItem: () => JSON.stringify({ role: 'admin' }) }, sessionStorage: { setItem() {} }, location: { hash: '#/tests' }, Date, setTimeout });
context.window = context;
vm.runInContext(source, context, { filename: 'assets/js/mod-masters.js' });

const renderTests = routes['/tests'];
assert.equal(typeof renderTests, 'function');
assert.equal(routes['/tests/regular'], renderTests);

function control(id) {
  const found = document.getElementById(id);
  assert.ok(found, 'control exists: ' + id);
  return found;
}
function rowChecks() { return document.getElementById('t-rows').querySelectorAll('[data-test-select]'); }
function check(id, checked = true) {
  const checkbox = rowChecks().find(item => item.getAttribute('data-test-select') === id);
  assert.ok(checkbox, 'row checkbox exists: ' + id);
  checkbox.checked = checked;
  checkbox.fire('change');
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

async function main() {
  renderTests();
  assert.equal(control('t-select-all').getAttribute('type'), 'checkbox');
  assert.equal(rowChecks().length, 3, 'one checkbox per actual test row');
  assert.equal(document.getElementById('t-rows').querySelectorAll('[data-test-select]').length, 3, 'department headers do not get checkboxes');
  assert.match(document.getElementById('t-rows').innerHTML, /R&lt;1&amp;/);
  assert.match(document.getElementById('t-rows').innerHTML, /Alpha &lt;script&gt;/);
  assert.doesNotMatch(document.getElementById('t-rows').innerHTML, /<script>/);
  assert.match(document.getElementById('t-rows').innerHTML, />Generic</);
  assert.match(document.getElementById('t-rows').innerHTML, />Regular</);

// Select-all follows the currently displayed rows.
const selectAll = control('t-select-all');
selectAll.checked = true;
selectAll.fire('change');
assert.equal(rowChecks().filter(item => item.checked).length, 3);
selectAll.checked = false;
selectAll.fire('change');
assert.equal(rowChecks().filter(item => item.checked).length, 0);

// A filter prunes hidden selections: only the visible Alpha record may move.
check('regular-1');
check('generic-1');
const search = control('t-q');
search.value = 'Alpha';
search.fire('input');
assert.deepEqual(rowChecks().map(item => item.getAttribute('data-test-select')), ['regular-1']);
control('t-move-generic').fire('click');
await settle();
assert.equal(writes.length, 1);
assert.equal(writes[0].id, 'regular-1');
assert.equal(records.get('regular-1').type, 'generic');
assert.deepEqual(records.get('regular-1').params, tests[0].params);
assert.equal(records.get('regular-1').price, tests[0].price);
assert.equal(writes[0].value.templateKey, undefined);
assert.equal(rowChecks().filter(item => item.checked).length, 0, 'successful move resets selection');
assert.equal(control('t-move-generic').disabled, true);

// Generic classification preserves an existing template key and unrelated fields.
search.value = '';
search.fire('input');
check('generic-1');
check('regular-2');
control('t-move-generic').fire('click');
await settle();
assert.equal(writes.length, 3);
assert.equal(records.get('generic-1').type, 'generic');
assert.equal(records.get('generic-1').templateKey, 'CBC');
assert.equal(records.get('regular-2').type, 'generic');
assert.equal(records.get('regular-2').templateKey, 'LEGACY');
assert.equal(records.get('regular-2').active, tests[2].active);
assert.deepEqual(records.get('regular-2').params, tests[2].params);

// A saved custom test appears on the Generic route after moving by type.
context.location.hash = '#/tests/generic';
renderTests();
assert.match(document.getElementById('t-rows').innerHTML, /R&lt;1&amp;/);
assert.match(document.getElementById('t-rows').innerHTML, /Alpha &lt;script&gt;/);
context.location.hash = '#/tests';
renderTests();

// The same custom test can move back by classification and appears on Regular.
check('regular-1');
control('t-move-regular').fire('click');
await settle();
assert.equal(writes.length, 4);
assert.equal(records.get('regular-1').type, 'regular');
context.location.hash = '#/tests/regular';
renderTests();
assert.match(document.getElementById('t-rows').innerHTML, /R&lt;1&amp;/);
context.location.hash = '#/tests';
renderTests();

// Move the same records to Regular and preserve template provenance.
check('generic-1');
check('regular-2');
control('t-move-regular').fire('click');
await settle();
assert.equal(writes.length, 6);
for (const id of ['generic-1', 'regular-2']) {
  assert.equal(records.get(id).type, 'regular');
  assert.equal(records.get(id).templateKey, id === 'generic-1' ? 'CBC' : 'LEGACY');
}
assert.equal(records.get('generic-1').isPackage, tests[1].isPackage);
assert.deepEqual(records.get('generic-1').includes, tests[1].includes);
assert.equal(rowChecks().filter(item => item.checked).length, 0);

// Disabled controls still give the exact empty-selection error if invoked directly.
control('t-move-generic').fire('click');
await settle();
assert.equal(writes.length, 6, 'no writes without a selection');
  assert.equal(toasts.at(-1).message, 'No tests selected.');

// Regular Tests keeps the existing route behavior and hides classification UI.
context.location.hash = '#/tests/regular';
renderTests();
assert.equal(document.getElementById('t-select-all'), null);
assert.equal(document.getElementById('t-move-generic'), null);
assert.equal(document.getElementById('t-move-regular'), null);
assert.equal(rowChecks().length, 0);
assert.match(document.getElementById('t-rows').innerHTML, /G1/);
assert.match(document.getElementById('t-rows').innerHTML, /R2/);
assert.equal(writes.length, 6, 'route render is read-only');

  assert.match(source, /You do not have permission to edit tests\./);
  console.log('PASS: All Tests selection, filtering, select-all, classification preservation, route visibility, badges, and escaping');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
