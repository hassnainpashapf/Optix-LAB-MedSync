const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const modPatientsSource = fs.readFileSync(path.join(root, 'assets/js/mod-patients.js'), 'utf8');
const modDashboardSource = fs.readFileSync(path.join(root, 'assets/js/mod-patient-dashboard.js'), 'utf8');

let paintedHtml = '';

const fakeDB = {
  _patients: {
    'PT-101': {
      id: 'PT-101',
      name: 'Mohamed Ahmed',
      age: 42,
      gender: 'Male',
      phone: '+92 300 1234567',
      createdAt: '2026-04-10T10:00:00.000Z'
    }
  },
  _invoices: [
    {
      id: 'INV-201',
      no: 'INV-201',
      patientId: 'PT-101',
      total: 1500,
      paid: 1500,
      due: 0,
      status: 'ready',
      createdAt: '2026-04-12T09:30:00.000Z',
      items: [{ testId: 'T-CBC', name: 'Complete Blood Count (CBC)' }]
    }
  ],
  _results: [
    {
      id: 'RES-301',
      invoiceId: 'INV-201',
      testId: 'T-CBC',
      status: 'ready',
      values: { hemoglobin: '14.5' }
    }
  ],
  get: function (tbl, id) {
    if (tbl === 'patients') return this._patients[id] || null;
    return null;
  },
  all: function (tbl) {
    if (tbl === 'patients') return Object.values(this._patients);
    if (tbl === 'invoices') return this._invoices;
    if (tbl === 'results') return this._results;
    return [];
  }
};

const fakeRoutes = {};
const fakeApp = {
  route: function (path, handler) {
    fakeRoutes[path] = handler;
  },
  nav: function () {},
  toast: function () {},
  esc: function (s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  money: function (v) { return 'Rs ' + (v || 0); },
  d: function (d) { return d ? String(d).slice(0, 10) : ''; },
  dt: function (d) { return d ? String(d).slice(0, 16) : ''; },
  badge: function (s) { return '<span>' + s + '</span>'; },
  empty: function (m) { return '<div>' + m + '</div>'; },
  normWa: function (p) { return String(p || '').replace(/[^0-9]/g, ''); },
  loadScript: function () { return Promise.resolve(); }
};

const viewEl = {
  id: 'view',
  innerHTML: '',
  style: {},
  classList: { add: function () {}, remove: function () {}, toggle: function () {} },
  querySelectorAll: function () { return []; },
  querySelector: function () { return null; }
};

Object.defineProperty(viewEl, 'innerHTML', {
  set: function (h) { paintedHtml = h; },
  get: function () { return paintedHtml; }
});

const fakeDoc = {
  getElementById: function (id) {
    if (id === 'view') return viewEl;
    return {
      id: id,
      classList: { add: function () {}, remove: function () {}, toggle: function () {} },
      style: {},
      addEventListener: function () {},
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    };
  },
  querySelectorAll: function () { return []; },
  createElement: function () { return { id: '', rel: '', href: '' }; },
  head: { appendChild: function () {} },
  addEventListener: function () {}
};

const context = {
  window: { App: fakeApp, DB: fakeDB, scrollTo: function () {} },
  document: fakeDoc,
  App: fakeApp,
  DB: fakeDB,
  localStorage: {
    getItem: function () { return JSON.stringify({ role: 'admin' }); },
    setItem: function () {}
  },
  canEdit: function () { return true; },
  canDel: function () { return true; },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console
};
context.window = context;

// Execute both modules in sandbox
vm.createContext(context);
vm.runInContext(modPatientsSource, context);
vm.runInContext(modDashboardSource, context);

console.log('--- Testing Patient Vitals & Clinical Overview Dashboard ---');

// 1. Verify routes registered
assert.ok(fakeRoutes['/patients'], 'Route /patients registered');
assert.ok(fakeRoutes['/patient/:id'], 'Route /patient/:id registered');
console.log('✓ Patient routes successfully registered');

// 2. Test rendering patient dashboard
const patient = fakeDB._patients['PT-101'];
const html = context.App.patientDashboard.render(patient);

assert.ok(html.includes('Mohamed Ahmed Vitals Overview'), 'Header contains patient name + Vitals Overview');
assert.ok(html.includes('Real-time monitoring of current physiological metrics and trends.'), 'Subtitle matches specification');
assert.ok(html.includes('Stress Patterns Overview'), 'Card 1 Stress Patterns Overview present');
assert.ok(html.includes('April, 2026'), 'Month selector present');
assert.ok(html.includes('vitals-day-pill'), 'Date timeline pills present');
assert.ok(html.includes('Avg Stres Level'), 'Avg Stress Level radial gauge present');
assert.ok(html.includes('Highest Peak'), 'Highest peak stat present');
assert.ok(html.includes('Lowest Point'), 'Lowest point stat present');
assert.ok(html.includes('132 BPM'), 'Heart rate peak 132 BPM matches screenshot');
assert.ok(html.includes('104 BPM'), 'Lowest point heart rate 104 BPM matches screenshot');
console.log('✓ Stress Patterns Overview card, date timeline, circular gauge, and peak BPM verified');

// 3. Test Rehabilitation Plan card
assert.ok(html.includes('Daily Rehabilitation Plan'), 'Daily Rehabilitation Plan card present');
assert.ok(html.includes('Early Ambulation'), 'Rehab item 1 Early Ambulation present');
assert.ok(html.includes('Short Walk - 15 minutes.'), 'Short walk desc present');
assert.ok(html.includes('Medication &amp; Therapy Tracking') || html.includes('Medication & Therapy Tracking'), 'Rehab item 2 present');
assert.ok(html.includes('Hydration &amp; Safety') || html.includes('Hydration & Safety'), 'Rehab item 3 present');
assert.ok(html.includes('Respiratory Exercises'), 'Rehab item 4 present');
assert.ok(html.includes('Anti-Inflammatory Diet'), 'Rehab item 5 present');
assert.ok(html.includes('BMI &amp; Lean Mass') || html.includes('BMI & Lean Mass'), 'Rehab item 6 present');
assert.ok(html.includes('Stress &amp; Anxiety Management') || html.includes('Stress & Anxiety Management'), 'Rehab item 7 present');
console.log('✓ Daily Rehabilitation Plan with all 7 numbered items verified');

// 4. Test Lung Capacity Efficiency and Medication Adherence
assert.ok(html.includes('Lung Capacity Efficiency'), 'Lung Capacity Efficiency title present');
assert.ok(html.includes('Moderate Risk'), 'Moderate risk tag present');
assert.ok(html.includes('79%'), 'Score 79% present');
assert.ok(html.includes('Medication Adherence'), 'Medication Adherence present');
assert.ok(html.includes('Ventolin'), 'Ventolin med present');
assert.ok(html.includes('Pulmicort'), 'Pulmicort med present');
assert.ok(html.includes('Mucosolvan'), 'Mucosolvan med present');
console.log('✓ Organ Capacity Efficiency (79% Moderate Risk) and Medication Adherence (Ventolin, Pulmicort, Mucosolvan) verified');

// 5. Test Right Stage: Anatomical Organ & Carousel
assert.ok(html.includes('vitals-stage-card'), 'Interactive organ stage card present');
assert.ok(html.includes('btnZoomIn'), 'Zoom In button present');
assert.ok(html.includes('btnZoomOut'), 'Zoom Out button present');
assert.ok(html.includes('btnZoomReset'), 'Zoom Reset button present');
assert.ok(html.includes('lung-svg'), 'Lungs anatomical SVG model present');
assert.ok(html.includes('Pulmonary findings: elevated airway resistance, imagined lung symptoms Rate 7.2%.'), 'Clinical warning callout card matches screenshot');
assert.ok(html.includes('data-organ-pill="liver"'), 'Liver thumbnail present in carousel');
assert.ok(html.includes('data-organ-pill="lung"'), 'Lung thumbnail present in carousel');
assert.ok(html.includes('data-organ-pill="heart"'), 'Heart thumbnail present in carousel');
assert.ok(html.includes('data-organ-pill="kidneys"'), 'Kidneys thumbnail present in carousel');
assert.ok(html.includes('data-organ-pill="brain"'), 'Brain thumbnail present in carousel');
console.log('✓ Anatomical Organ Stage, Zoom controls, Warning card, and 5-Organ Carousel verified');

console.log('\n============================================================');
console.log('ALL NEXURA CARE PATIENT VITALS DASHBOARD TESTS PASSED CLEANLY!');
console.log('============================================================\n');
