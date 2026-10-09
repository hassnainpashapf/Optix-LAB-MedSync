'use strict';

// Bounded regression checks for the desktop icon rail and mobile drawer.
// Run: node scripts/test-sidebar-web.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function block(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Could not locate ${start}`);
  return source.slice(from, to);
}

// CSS must keep the collapsed sidebar in flex layout and only hide labels.
const desktop = block(css, '@media(min-width:901px)', '.page-title');
assert.match(desktop, /body\.side-collapsed \.sidebar\{[^}]*width:72px[^}]*margin-left:0[^}]*transform:none/);
assert.match(desktop, /body\.side-collapsed \.sidebar \.nav\{[^}]*overflow-y:auto/);
assert.match(desktop, /body\.side-collapsed \.sidebar \.nav-it,\s*body\.side-collapsed \.sidebar \.nav-sub-it\{/);
assert.match(desktop, /body\.side-collapsed \.sidebar \.nav-lb,[\s\S]*display:none/);
assert.doesNotMatch(desktop, /body\.side-collapsed \.sidebar \.nav-sub,\s*body\.side-collapsed \.sidebar \.nav-fb\{[^}]*display\s*:/);
const mobile = block(css, '@media (max-width:900px)', '@media (max-width:560px)');
assert.match(mobile, /\.sidebar\{[^}]*position:fixed[^}]*transform:translateX\(-105%\)/);
assert.match(mobile, /body\.side-open \.sidebar\{transform:none\}/);
assert.ok(css.indexOf('body.side-collapsed .sidebar{') > css.indexOf('@media(min-width:901px)'));

// Every icon-only navigation target keeps a native tooltip and accessible name.
assert.match(js, /title="' \+ esc\(x\.label\) \+ '" aria-label="' \+ esc\(x\.label\) \+ '" class="nav-sub-it/);
assert.match(js, /title="' \+ esc\(n\.label\) \+ '" aria-label="' \+ esc\(n\.label\) \+ '" class="nav-it/);
assert.doesNotMatch(block(js, '/* folders open / close', '/* ---------------- login'), /side-collapsed/);

// Exercise the production toggle controller in a tiny VM (desktop then mobile).
function classes() {
  const set = new Set();
  return { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c),
    toggle(c, force) { const on = force === undefined ? !set.has(c) : force; if (on) set.add(c); else set.delete(c); return on; } };
}
const listeners = {};
const body = { classList: classes() };
const navToggle = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
const document = {
  body,
  getElementById(id) { return id === 'navToggle' ? navToggle : null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
};
const window = {
  matchMedia(query) { return { matches: query === '(max-width:900px)' ? this.mobile : false }; },
  mobile: false,
  addEventListener() {}
};
const context = vm.createContext({ document, window, localStorage: { getItem: () => null, setItem() {} }, location: { hash: '#/dashboard' } });
const sync = block(js, 'function syncNavToggle()', '  function markActive');
const controllerStart = js.indexOf('if (!window.__sideDrawerWired)');
const controllerEnd = js.indexOf('function syncNavToggle()', controllerStart);
const controller = js.slice(controllerStart, controllerEnd).replace(/\n  }\s*$/, '\n');
vm.runInContext(sync + controller, context, { filename: 'app.js:navigation' });
function click(target) { listeners.click.forEach(fn => fn({ target })); }
const toggleTarget = { closest: selector => selector === '#navToggle' ? navToggle : null };
click(toggleTarget);
assert.equal(body.classList.contains('side-collapsed'), true, 'desktop toggle collapses the rail');
assert.equal(navToggle.attrs['aria-expanded'], 'false');
window.mobile = true;
click(toggleTarget);
assert.equal(body.classList.contains('side-open'), true, 'mobile toggle opens the drawer');
assert.equal(body.classList.contains('side-collapsed'), true, 'mobile click does not mutate stale desktop state');

// Exercise both nested click handlers while collapsed: parents open their children
// and do not navigate away by assigning their data-route.
const nested = block(js, '/* folders open / close', '/* ---------------- login');
vm.runInContext(nested, context, { filename: 'app.js:nested-navigation' });
body.classList.remove('side-open');
window.mobile = false;
body.classList.add('side-collapsed');
function parentTarget(kind) {
  const parent = { attrs: { 'data-route': '#/parent' }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, classList: classes() };
  const group = { classList: classes(), getAttribute: () => 'group', querySelector: () => parent };
  const folder = { classList: classes(), getAttribute: () => 'folder', querySelector: () => parent };
  parent.closest = selector => selector === '.nav-grp' ? group : (selector === '.nav-fold' ? folder : null);
  return { closest(selector) {
    if (kind === 'group' && selector === '.nav-par') return parent;
    if (kind === 'folder' && selector === '.nav-fh') return parent;
    if (selector === '.nav-grp') return kind === 'group' ? group : null;
    if (selector === '.nav-fold') return kind === 'folder' ? folder : null;
    return null;
  }, parent, group, folder };
}
const folder = parentTarget('folder');
const beforeFolder = context.location.hash;
click(folder);
assert.equal(folder.folder.classList.contains('open'), true);
assert.equal(context.location.hash, beforeFolder);
const group = parentTarget('group');
const beforeGroup = context.location.hash;
click(group);
assert.equal(group.group.classList.contains('open'), true);
assert.equal(context.location.hash, beforeGroup);

console.log('PASS: desktop 72px rail, visible child icon selectors, mobile drawer scope, accessible labels, toggle behavior, and nested navigation behavior.');
