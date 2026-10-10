'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const base of ['', 'electron-tools/installer/app-stage-win7']) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', base, 'assets/js/app.js'), 'utf8');
  const declaration = source.match(/var NAV = \[[\s\S]*?\n\s*\];/);
  assert.ok(declaration, 'navigation declaration exists');
  const nav = vm.runInNewContext(declaration[0] + '\nNAV;');
  const inventory = nav.find(item => item.key === 'inventory');
  const stock = nav.find(item => item.key === 'stock');
  const expectedInventory = base ? ['#/inventory', '#/inventory/add'] : ['#/inventory'];
  const expectedStockRoutes = base
    ? ['#/stock', '#/stock/pending', '#/stock/purchase-orders', '#/stock/add', '#/stock/alerts']
    : ['#/stock/dashboard', '#/stock', '#/stock/add', '#/stock/pending', '#/stock/orders', '#/stock/alerts'];
  assert.deepEqual(Array.from(inventory.sub, item => item.route), expectedInventory);
  const routes = Array.from(stock.sub, item => item.route);
  for (const route of expectedStockRoutes) {
    assert.equal(routes.filter(value => value === route).length, 1, route + ' appears once');
  }
  assert.ok(stock.sub.some(item => item.label === 'Purchase Orders' || item.label === 'Purchase Orders' || item.label === 'Purchase Orders'), 'purchase orders retained');
  const allRoutes = [...inventory.sub, ...stock.sub].map(item => item.route);
  assert.equal(new Set(allRoutes).size, allRoutes.length, 'no repeated child links');
}

// Exercise the root web sidebar's actual filtering, grouping and HTML projection.
// The desktop NAV assertions above remain useful while its shell evolves separately.
const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/app.js'), 'utf8');
function block(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'production block exists: ' + start);
  return source.slice(from, to);
}
const context = vm.createContext({
  s: { role: 'admin', roleId: 'test' }, pages: [],
  App: {}, window: {}, location: { hash: '#/dashboard' },
  localStorage: { getItem: () => null },
  saasOn: () => false, icon: () => '',
  esc: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
});
vm.runInContext(`
  function session() { return s; }
  var DB = { get: function () { return { customRoles: [{ id: 'test', pages: pages }] }; } };
  ${block('var NAV = [', '  /* ---------------- session')}
  ${block('function sidebarNavKey(', '  function renderShell(')}
  ${block('App.featureOn = function', '  App.loadLabFeatures =')}
  var productionFeatureOn = App.featureOn;
  function sidebarHtml(activeKey) {
    ${block('var SEC = ', '    /* current user record')}
    return items;
  }
  ${block('function markActive(', '  /* folders open / close')}
`, context, { filename: 'app.js:stock-sidebar' });
const originalNav = JSON.stringify(context.NAV);
const inventoryRoutes = ['#/inventory'];
const stockRoutes = ['#/stock/dashboard', '#/stock', '#/stock/add', '#/stock/pending', '#/stock/orders', '#/stock/alerts'];

// Tiny DOM built from production HTML, with the APIs used by markActive.
function node(tag) {
  const attrs = Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], match[2]]));
  const classes = new Set((attrs.class || '').split(' '));
  return {
    attrs, getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value; },
    classList: {
      contains: key => classes.has(key), add: key => classes.add(key),
      toggle(key, on) { if (on) classes.add(key); else classes.delete(key); }
    }
  };
}
function renderedGroup(html) {
  const matches = Array.from(html.matchAll(/<div class="nav-grp[^"]*" data-grp="inventory-stock">[\s\S]*?<\/div><\/div>/g));
  assert.ok(matches.length <= 1, 'at most one combined parent');
  assert.doesNotMatch(html, /data-(?:nav|grp)="(?:inventory|stock)"/, 'no separate rendered parents');
  if (!matches.length) return null;
  const markup = matches[0][0];
  assert.match(markup, /<span class="nav-lb">Inventory &amp; Stock<\/span>/);
  assert.match(markup, /title="Inventory &amp; Stock" aria-label="Inventory &amp; Stock"/);
  const group = node(markup.match(/^<div[^>]+>/)[0]);
  const parent = node(markup.match(/<button[^>]+>/)[0]);
  const children = Array.from(markup.matchAll(/<a[^>]+>/g), match => node(match[0]));
  group.querySelector = selector => selector === '.nav-par' ? parent : children.find(child => child.classList.contains('on')) || null;
  return { group, parent, children };
}
function checkRender(expected, hash) {
  context.location.hash = hash;
  const key = context.routeKey(hash);
  const html = context.sidebarHtml(key);
  const rendered = renderedGroup(html);
  if (expected.length === 0) {
    assert.equal(!!rendered, false, 'group is absent when no authorized inventory/stock entry remains');
    return;
  }
  if (!rendered) {
    assert.match(html, /data-nav="(?:inventory|stock|inventory-stock)"/, 'an authorized inventory/stock item still renders when the group is not combined');
    return;
  }
  const { group, parent, children } = rendered;
  assert.deepEqual(children.map(child => child.attrs.href), expected);
  assert.equal(new Set(children.map(child => child.attrs.href)).size, expected.length, 'unique children');
  assert.equal(parent.attrs['data-route'], expected[0], 'parent fallback route is authorized');
  const active = key === 'inventory' || key === 'stock';
  assert.equal(parent.classList.contains('active'), active, 'initial parent active state');
  assert.equal(group.classList.contains('open'), active, 'initial parent expansion');
  assert.equal(parent.attrs['aria-expanded'], String(active));
  context.document = { querySelectorAll(selector) {
    return selector === '.nav-it' ? [parent] : selector === '.nav-sub-it' ? children : selector === '.nav-grp' ? [group] : [];
  } };
  // Reuse the same rendered DOM across route transitions, including legacy links.
  for (const [route, childRoute] of [
    ...inventoryRoutes.concat(stockRoutes).map(route => [route, route]),
    ['#/stock/moves?legacy=1', '#/stock'],
    ['#/inventory/alerts', '#/stock/alerts'],
    ['#/inventory/pending', '#/stock/pending'],
    ['#/dashboard', null]
  ]) {
    context.location.hash = route;
    context.markActive(context.routeKey(route));
    const on = route !== '#/dashboard';
    assert.equal(parent.classList.contains('active'), on, 'transition parent: ' + route);
    assert.equal(group.classList.contains('open'), on, 'transition expansion: ' + route);
    assert.equal(parent.attrs['aria-expanded'], String(on));
    assert.deepEqual(children.filter(child => child.classList.contains('on')).map(child => child.attrs.href), expected.includes(childRoute) ? [childRoute] : [], 'authorized child highlight: ' + route);
  }
  assert.equal(context.sidebarHtml(key), html, 'rerender is stable and does not mutate NAV');
}

// Independent feature gates prove all four filtered-input combinations. Use real
// can()/roleDef(): inventory custom roles historically also grant stock access.
for (const role of ['admin', 'technician', 'reception', 'doctor', 'custom']) {
  for (const pages of [[], ['inventory'], ['stock'], ['inventory', 'stock']]) {
    context.s.role = role;
    context.pages = pages;
    const permitsInventory = ['admin', 'technician'].includes(role) || (role === 'custom' && pages.includes('inventory'));
    const permitsStock = ['admin', 'technician'].includes(role) || (role === 'custom' && (pages.includes('stock') || pages.includes('inventory')));
    assert.equal(context.canPage('inventory'), permitsInventory);
    assert.equal(context.canPage('stock'), permitsStock);
    for (const inventoryOn of [false, true]) for (const stockOn of [false, true]) {
      context.App.featureOn = key => key === 'inventory' ? inventoryOn : key === 'stock' ? stockOn : true;
      const expected = (permitsInventory && inventoryOn ? inventoryRoutes : []).concat(permitsStock && stockOn ? stockRoutes : []);
      for (const hash of ['#/dashboard', '#/inventory/add', '#/stock/orders', '#/stock/moves', '#/inventory/pending', '#/inventory/alerts']) checkRender(expected, hash);
    }
    // Also retain the production feature contract: stock follows inventory's flag.
    context.App.featureOn = context.productionFeatureOn;
    for (const features of [null, {}, { inventory: false }, { inventory: true, stock: false }]) {
      context.App.labFeatures = features && { features };
      const enabled = !features || features.inventory !== false;
      assert.equal(context.App.featureOn('inventory'), enabled);
      assert.equal(context.App.featureOn('stock'), enabled);
      checkRender((permitsInventory && enabled ? inventoryRoutes : []).concat(permitsStock && enabled ? stockRoutes : []), '#/stock');
    }
  }
}
assert.equal(JSON.stringify(context.NAV), originalNav, 'underlying NAV data retained');
assert.ok(context.ROLE_PAGES.some(page => page[0] === 'inventory'));
assert.ok(context.ROLE_PAGES.some(page => page[0] === 'stock'));
for (const name of ['canPage', 'can', 'ROLE_PAGES', 'renderShell', 'currentKey']) {
  assert.ok(new RegExp(name + ':\\s*' + name).test(source), 'original export retained: ' + name);
}
console.log('PASS: web/desktop unique stock links; web combined sidebar filtering, roles/features, aliases, transitions, rerenders, escaping, and original NAV identities');
