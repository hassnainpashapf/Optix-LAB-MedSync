'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(attrs) {
  const classes = new Set();
  return {
    getAttribute: key => attrs[key] || null,
    setAttribute: (key, value) => { attrs[key] = value; },
    classList: {
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    }
  };
}
for (const base of ['', 'electron-tools/installer/app-stage-win7']) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', base, 'assets/js/app.js'), 'utf8');
  const start = source.indexOf('  function markActive(key) {');
  const end = source.indexOf('  /* folders open / close', start);
  assert.ok(start >= 0 && end > start);
  const parent = element({ 'data-nav': 'tests' });
  const routes = ['#/tests', '#/tests/regular', '#/tests/generic'];
  const children = routes.map(route => element({ 'data-href': route }));
  const group = element({ 'data-grp': 'tests' });
  group.querySelector = selector => selector === '.nav-par' ? parent :
    children.find(child => child.classList.contains('on')) || null;
  const context = {
    location: { hash: '' }, sidebarNavKey: key => key,
    document: { querySelectorAll: selector => ({
      '.nav-it': [parent], '.nav-sub-it': children, '.nav-fold': [], '.nav-grp': [group]
    })[selector] || [] }
  };
  vm.runInNewContext(source.slice(start, end) + '\nthis.run = markActive;', context);
  for (const route of [...routes, '#/tests/regular?query=x', '#/tests', '#/tests/generic?query=x']) {
    context.location.hash = route;
    context.run('tests');
    assert.deepEqual(routes.filter((_, i) => children[i].classList.contains('on')), [route.split('?')[0]], base + ': exactly one selected catalog child');
    assert.ok(parent.classList.contains('active'));
    assert.ok(group.classList.contains('open'));
    assert.equal(parent.getAttribute('aria-expanded'), 'true');
  }
}
console.log('PASS: web/desktop catalog selection is exclusive across routes, query strings and repeated transitions');
