'use strict';

// Run the actual desktop shell and active-state logic in a dependency-free VM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/app.js'), 'utf8');
function element(attrs = {}) {
  const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
  const node = {
    attrs, children: [], style: { setProperty() {} },
    classList: {
      contains: key => classes.has(key),
      add: key => classes.add(key),
      remove: key => classes.delete(key),
      toggle(key, force) {
        const on = force === undefined ? !classes.has(key) : force;
        if (on) classes.add(key); else classes.delete(key);
        return on;
      }
    },
    getAttribute: key => attrs[key] || null,
    setAttribute: (key, value) => { attrs[key] = value; },
    addEventListener() {},
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    querySelectorAll(selector) {
      const found = [];
      function visit(parent) {
        parent.children.forEach(child => {
          if (selector.split(',').some(part => {
            part = part.trim();
            if (part[0] === '#') return child.attrs.id === part.slice(1);
            return part[0] === '.' && part.slice(1).split('.').every(c => child.classList.contains(c));
          })) found.push(child);
          visit(child);
        });
      }
      visit(this);
      return found;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    get innerHTML() { return this.html || ''; },
    set innerHTML(html) {
      this.html = html;
      this.children = [];
      const stack = [this];
      for (const match of html.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)) {
        const [tag, name, rest] = match;
        if (tag.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
        const child = element(Object.fromEntries([...rest.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])));
        stack[stack.length - 1].appendChild(child);
        if (!['img', 'input', 'link', 'br', 'hr', 'meta'].includes(name) && !tag.endsWith('/>')) stack.push(child);
      }
    }
  };
  return node;
}
const body = element();
body.innerHTML = '<div id="shell"><aside id="sidebar"></aside><header id="topbar"></header></div>';
const document = {
  body, head: element(), documentElement: element(), readyState: 'loading',
  createElement: () => element(), addEventListener() {},
  getElementById: id => body.querySelector('#' + id),
  querySelector: selector => body.querySelector(selector),
  querySelectorAll: selector => body.querySelectorAll(selector)
};
let session = { role: 'test', userId: 'u1', labId: 'lab1', name: 'Tester' };
const settings = { customRoles: [{ id: 'limited', name: 'Limited', pages: [] }] };
const context = vm.createContext({
  document, console, navigator: { platform: '', userAgent: '' }, location: { hash: '#/dashboard' },
  DB: { get: table => table === 'settings' ? settings : null, isCloud: () => false },
  localStorage: { getItem: key => key === 'labpos_session' ? JSON.stringify(session) : null },
  addEventListener() {}, setTimeout() {}, setInterval() {}, clearTimeout() {}
});
context.window = context;
// Expose closure state for testing only; skip boot/network/storage side effects.
assert(source.includes('  start();\n})();'));
vm.runInContext(source.replace('  start();\n})();',
  '  window.testNav = { NAV: NAV, PERMS: PERMS, markActive: markActive, routeKey: routeKey };\n})();'), context);
const { App, testNav } = context;
const beforeNav = JSON.stringify(testNav.NAV);
const inventoryRoutes = ['#/inventory', '#/inventory/add'];
const stockRoutes = ['#/stock', '#/stock/pending', '#/stock/purchase-orders', '#/stock/add', '#/stock/alerts'];
const sidebar = document.getElementById('sidebar');
const groups = () => sidebar.querySelectorAll('.nav-grp').filter(g => g.querySelector('.nav-par').getAttribute('data-nav-keys'));
function render(hash = '#/dashboard') {
  context.location.hash = hash;
  App.renderShell(testNav.routeKey(hash));
}
function checkMenu(expected) {
  assert.equal(groups().length, expected.length ? 1 : 0, 'one merged parent iff a source entry is visible');
  const routes = sidebar.querySelectorAll('.nav-sub-it').map(n => n.getAttribute('data-href'));
  const stockLinks = routes.filter(r => /^#\/(inventory|stock)(\/|$)/.test(r));
  assert.deepEqual(stockLinks, expected, 'only authorized and feature-enabled children appear');
  assert.equal(new Set(routes).size, routes.length, 'no duplicate sidebar children');
  if (expected.length) {
    assert.match(sidebar.innerHTML, /class="nav-lb">Inventory &amp; Stock<\/span>/);
    assert.doesNotMatch(sidebar.innerHTML, />Inventory<\/span>|>Stock<\/span>/);
    if (expected.includes('#/stock/alerts')) assert.match(sidebar.innerHTML, />Alerts &amp; Expiry<\/span>/);
  }
}

// All 16 independent permission/feature combinations, using the real can/featureOn filters.
for (const invPermission of [false, true]) for (const stockPermission of [false, true]) {
  testNav.PERMS.inventory = invPermission ? ['test'] : [];
  testNav.PERMS.stock = stockPermission ? ['test'] : [];
  for (const invFeature of [false, true]) for (const stockFeature of [false, true]) {
    App.labFeatures = { features: { inventory: invFeature, stock: stockFeature } };
    const expected = [...(invPermission && invFeature ? inventoryRoutes : []), ...(stockPermission && stockFeature ? stockRoutes : [])];
    for (const route of ['#/dashboard', ...expected]) {
      render(route);
      checkMenu(expected);
      if (route !== '#/dashboard') {
        assert(groups()[0].classList.contains('open'), 'active group initially expanded');
        assert(groups()[0].querySelector('.nav-par').classList.contains('active'), 'active parent initially highlighted');
      }
    }
    assert.equal(App.canPage('inventory'), invPermission, 'render does not widen inventory permissions');
    assert.equal(App.canPage('stock'), stockPermission, 'render does not widen stock permissions');
  }
}

testNav.PERMS.inventory = ['test']; testNav.PERMS.stock = ['test'];
App.labFeatures = null;
render();
const transitions = [
  ...inventoryRoutes.map(r => [r, r]), ...stockRoutes.map(r => [r, r]),
  ['#/inventory/low-out', '#/stock/pending'], ['#/inventory/pending', '#/stock/pending'],
  ['#/inventory/expiring', '#/stock/alerts'], ['#/inventory/alerts', '#/stock/alerts'],
  ['#/stock/purchase-orders?month=2031-04', '#/stock/purchase-orders'],
  ['#/inventory/edit/item-1', null], ['#/stock/detail/lot-1', null], ['#/dashboard', null],
  ['#/stock/add', '#/stock/add'], ['#/inventory/add', '#/inventory/add']
];
for (const [route, child] of transitions) {
  context.location.hash = route;
  testNav.markActive(testNav.routeKey(route));
  const group = groups()[0], parent = group.querySelector('.nav-par');
  const active = route !== '#/dashboard';
  assert.equal(group.classList.contains('open'), active, route + ' group expansion');
  assert.equal(parent.classList.contains('active'), active, route + ' parent activation');
  assert.equal(parent.getAttribute('aria-expanded'), String(active), route + ' aria expansion');
  assert.deepEqual(group.querySelectorAll('.nav-sub-it.on').map(n => n.getAttribute('data-href')), child ? [child] : [], route + ' exact child/legacy alias');
  checkMenu([...inventoryRoutes, ...stockRoutes]);
}

// Existing custom-role semantics deliberately remain separate from presentation:
// inventory currently implies stock access; stock alone does not imply inventory.
session = { ...session, role: 'custom', roleId: 'limited' };
for (const pages of [[], ['stock'], ['inventory'], ['inventory', 'stock']]) {
  settings.customRoles[0].pages = pages;
  render();
  assert.equal(App.canPage('inventory'), pages.includes('inventory'));
  assert.equal(App.canPage('stock'), pages.length > 0);
  checkMenu([...(pages.includes('inventory') ? inventoryRoutes : []), ...(pages.length ? stockRoutes : [])]);
}
assert.equal(JSON.stringify(testNav.NAV), beforeNav, 'rendering never mutates source NAV or legacy routes');
assert(testNav.NAV.find(n => n.key === 'samples').sub.some(n => n.route === '#/samples/home'), 'Home Sampling remains');
assert(App.ROLE_PAGES.some(n => n[0] === 'inventory') && App.ROLE_PAGES.some(n => n[0] === 'stock'), 'separate settings permission identities remain');
console.log('PASS: desktop Inventory & Stock grouping, 16 visibility combinations, route transitions, legacy aliases, unique menus and unchanged permission identities');
