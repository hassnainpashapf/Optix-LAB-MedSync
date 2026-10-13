'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

// Build minimal execution environment
const listeners = {};
const classes = () => {
  const set = new Set();
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    contains: c => set.has(c),
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : force;
      if (on) set.add(c); else set.delete(c);
      return on;
    }
  };
};

function createElement(id = '', tagName = 'div') {
  let inner = '';
  let attrs = {};
  const cl = classes();
  const el = {
    tagName: tagName.toUpperCase(),
    id,
    attrs,
    style: {},
    classList: cl,
    scrollTop: 0,
    getBoundingClientRect() { return { top: 10, bottom: 50, height: 40 }; },
    scrollIntoView(opts) { el.__scrolledIntoView = opts; },
    getAttribute(k) { return attrs[k]; },
    setAttribute(k, v) { attrs[k] = v; },
    addEventListener(evt, fn) { (listeners[evt] ||= []).push(fn); },
    get innerHTML() { return inner; },
    set innerHTML(val) {
      inner = val;
      el.__htmlSetCount = (el.__htmlSetCount || 0) + 1;
    },
    querySelector(sel) {
      if (sel === '.nav' || sel === '#sidebar .nav') return nav;
      if (sel === '.nav-it.active, .nav-sub-it.on') return activeEl;
      if (sel === '#sbSearch') return sbSearch;
      if (sel === '#sideClose') return sideClose;
      if (sel === '.nav-par') return groupBtn;
      if (sel === '.nav-fh') return folderBtn;
      return null;
    },
    closest: sel => null,
    remove: () => {},
    querySelectorAll(sel) {
      if (sel === '.nav-it') return [activeEl];
      if (sel === '.nav-sub-it') return [subEl];
      if (sel === '.nav-fold') return [folderEl];
      if (sel === '.nav-grp') return [groupEl];
      return [];
    }
  };
  return el;
}

const sidebar = createElement('sidebar', 'aside');
const nav = createElement('', 'nav');
nav.classList.add('nav');
nav.getBoundingClientRect = () => ({ top: 0, bottom: 500, height: 500 });

const activeEl = createElement('', 'a');
activeEl.classList.add('nav-it');
activeEl.setAttribute('data-nav', 'dashboard');

const subEl = createElement('', 'a');
subEl.classList.add('nav-sub-it');
subEl.setAttribute('data-href', '#/stock');

const groupEl = createElement('', 'div');
groupEl.classList.add('nav-grp');
groupEl.setAttribute('data-grp', 'inventory-stock');
const groupBtn = createElement('', 'button');
groupBtn.classList.add('nav-it', 'nav-par');
groupBtn.closest = sel => sel === '.nav-grp' ? groupEl : (sel === '.nav-par' ? groupBtn : null);
groupEl.querySelector = sel => sel === '.nav-par' ? groupBtn : (sel === '.nav-sub-it.on' ? (subEl.classList.contains('on') ? subEl : null) : null);

const folderEl = createElement('', 'div');
folderEl.classList.add('nav-fold');
folderEl.setAttribute('data-fold', 'acct');
const folderBtn = createElement('', 'button');
folderBtn.classList.add('nav-it', 'nav-fh');
folderBtn.closest = sel => sel === '.nav-fold' ? folderEl : (sel === '.nav-fh' ? folderBtn : null);
folderEl.querySelector = sel => sel === '.nav-fh' ? folderBtn : (sel === '.nav-it.active, .nav-sub-it.on' ? (activeEl.classList.contains('active') ? activeEl : null) : null);

const sbSearch = createElement('sbSearch', 'input');
const sideClose = createElement('sideClose', 'button');

const nodes = { sidebar, nav, topbar: createElement('topbar'), view: createElement('view'), shell: createElement('shell') };

const docListeners = {};
const document = {
  body: createElement('body'),
  getElementById(id) {
    if (nodes[id]) return nodes[id];
    const el = createElement(id);
    nodes[id] = el;
    return el;
  },
  querySelector(sel) {
    if (sel === '#sidebar .nav') return nav;
    if (sel === '#sidebar') return sidebar;
    if (sel === '.nav-it.active, .nav-sub-it.on') return activeEl;
    return null;
  },
  querySelectorAll(sel) {
    if (sel === '.nav-it') return [activeEl];
    if (sel === '.nav-sub-it') return [subEl];
    if (sel === '.nav-fold') return [folderEl];
    if (sel === '.nav-grp') return [groupEl];
    return [];
  },
  addEventListener(evt, fn) { (docListeners[evt] ||= []).push(fn); }
};

const localStorageStore = {};
const sessionStorageStore = {};

const context = vm.createContext({
  document,
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  localStorage: {
    getItem: k => localStorageStore[k] || null,
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: k => { delete localStorageStore[k]; }
  },
  sessionStorage: {
    getItem: k => sessionStorageStore[k] || null,
    setItem: (k, v) => { sessionStorageStore[k] = String(v); }
  },
  location: { hash: '#/dashboard' },
  console,
  navigator: { platform: 'MacIntel' },
  setTimeout: () => {},
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {}
});
context.window = context;

// Run db.js then app.js in context
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/db.js'), 'utf8'), context, { filename: 'db.js' });
vm.runInContext(appJs, context, { filename: 'app.js' });

// Mock session and DB
localStorageStore['labpos_session'] = JSON.stringify({ userId: 'u1', labId: 'lab1', role: 'admin', name: 'Dr. Test' });
context.DB = {
  get(table, id) {
    if (table === 'users') return { id: 'u1', name: 'Dr. Test' };
    if (table === 'settings') return { labName: 'Test Lab', logo: '' };
    return null;
  }
};

// 1. Initial render of shell
context.App.renderShell('dashboard');
assert.equal(sidebar.__htmlSetCount, 1, 'Initial render paints sidebar HTML');
assert.ok(sidebar.getAttribute('data-sb-sig'), 'Sidebar receives signature attribute');

// 2. User scrolls sidebar down to 350px
nav.scrollTop = 350;
context.window.__sbScrollTop = 350;
context.sessionStorage.setItem('labpos_sb_scroll', '350');

// 3. User navigates to a new page (e.g. expenses)
context.App.renderShell('expenses');
assert.equal(sidebar.__htmlSetCount, 1, 'Sidebar DOM is NOT destroyed on subsequent route navigation');
assert.equal(nav.scrollTop, 350, 'Sidebar scroll position is preserved without jumping back to 0');

// 4. Test markActive preserves scroll and activates items
context.location.hash = '#/stock';
context.App.markActive('stock');
assert.equal(nav.scrollTop, 350, 'markActive preserves scroll position');

// 5. Test clicking .nav-par persists group state
const parTarget = {
  closest(sel) {
    if (sel === '.nav-par') return groupBtn;
    if (sel === '.nav-grp') return groupEl;
    return null;
  }
};
const clickFns = docListeners['click'] || [];
clickFns.forEach(fn => fn({ target: parTarget }));
assert.equal(groupEl.classList.contains('open'), false, 'Group is toggled closed on click');
assert.equal(JSON.parse(localStorageStore['labpos_navgroups'])['inventory-stock'], false, 'Closed state remembered in localStorage');

// Click again to toggle open
clickFns.forEach(fn => fn({ target: parTarget }));
assert.equal(groupEl.classList.contains('open'), true, 'Group is toggled open on second click');
assert.equal(JSON.parse(localStorageStore['labpos_navgroups'])['inventory-stock'], true, 'Open state remembered in localStorage');

console.log('PASS: Sidebar scroll preservation and group state persistence verified.');
