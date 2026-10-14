'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modDashboardSource = fs.readFileSync(path.join(root, 'assets/js/mod-patient-dashboard.js'), 'utf8');

// Multi-invoice patient fixture
const patient = {
  id: 'PT-HIST-01',
  name: 'Tariq Mehmood',
  age: 48,
  gender: 'Male',
  phone: '+92 321 9876543'
};

const invoices = [
  // Past Invoice (September)
  {
    id: 'INV-SEPT',
    no: 'INV-SEPT',
    patientId: 'PT-HIST-01',
    createdAt: '2026-09-10T10:00:00Z',
    items: [{ testId: 'lft' }, { testId: 'rft' }, { testId: 'cbc' }]
  },
  // Current Invoice (October)
  {
    id: 'INV-OCT',
    no: 'INV-OCT',
    patientId: 'PT-HIST-01',
    createdAt: '2026-10-14T10:00:00Z',
    items: [{ testId: 'lft' }, { testId: 'rft' }, { testId: 'cbc' }]
  }
];

const tests = {
  lft: {
    id: 'lft',
    name: 'Liver Function Test',
    params: [
      { id: 'alt', name: 'ALT (SGPT)', unit: 'U/L', ref: '0-40' }
    ]
  },
  rft: {
    id: 'rft',
    name: 'Renal Function Test',
    params: [
      { id: 'creatinine', name: 'Serum Creatinine', unit: 'mg/dL', ref: '0.6-1.2' }
    ]
  },
  cbc: {
    id: 'cbc',
    name: 'Complete Blood Count',
    params: [
      { id: 'hb', name: 'Hemoglobin', unit: 'g/dL', ref: '13-17' },
      { id: 'plt', name: 'Platelets', unit: '/uL', ref: '150000-450000' }
    ]
  }
};

const results = [
  // Past values: ALT high (120), Creatinine normal (1.0), Hb low (10.0), Platelets normal (220k)
  { invoiceId: 'INV-SEPT', testId: 'lft', status: 'ready', values: { alt: '120' } },
  { invoiceId: 'INV-SEPT', testId: 'rft', status: 'ready', values: { creatinine: '1.0' } },
  { invoiceId: 'INV-SEPT', testId: 'cbc', status: 'ready', values: { hb: '10.0', plt: '220000' } },

  // Current values:
  // ALT dropped to 42 -> IMPROVED! (lower is better)
  // Creatinine rose to 2.4 -> DETERIORATED! (renal strain, lower is better)
  // Hb rose to 13.5 -> IMPROVED! (anemia recovering, higher is better)
  // Platelets dropped to 45,000 -> DETERIORATED & CRITICAL PANIC ALERT! (< 50,000)
  { invoiceId: 'INV-OCT', testId: 'lft', status: 'ready', values: { alt: '42' } },
  { invoiceId: 'INV-OCT', testId: 'rft', status: 'ready', values: { creatinine: '2.4' } },
  { invoiceId: 'INV-OCT', testId: 'cbc', status: 'ready', values: { hb: '13.5', plt: '45000' } }
];

const fakeDB = {
  get: function (tbl, id) {
    if (tbl === 'tests') return tests[id] || null;
    return null;
  },
  all: function (tbl) {
    if (tbl === 'invoices') return invoices;
    if (tbl === 'results') return results;
    return [];
  }
};

const sandbox = {
  App: {
    esc: function (s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    dt: function (d) { return d ? String(d).slice(0, 10) : ''; },
    toast: function () {}
  },
  DB: fakeDB,
  document: {
    head: { appendChild: function () {} },
    createElement: function () { return {}; },
    getElementById: function () { return null; }
  },
  localStorage: { getItem: function () { return null; } }
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(modDashboardSource, sandbox);

console.log('--- Testing Patient Longitudinal Lab Comparison, 3D Body Map & Doctor Decision Support ---');

const api = sandbox.App.patientDashboard;
const html = api.render(patient);

// 1. Verify Longitudinal Comparison Card exists
assert.ok(html.includes('Biomarker Trends &amp; Longitudinal Test Comparison'), 'Longitudinal Comparison card rendered');
assert.ok(html.includes('Improved (Behtar)'), 'Improved summary badge present');
assert.ok(html.includes('Deteriorated (Alert)'), 'Deteriorated summary badge present');

// 2. Verify specific biomarker comparisons
assert.ok(html.includes('ALT (SGPT)'), 'ALT biomarker present');
assert.ok(html.includes('Serum Creatinine'), 'Creatinine biomarker present');
assert.ok(html.includes('Hemoglobin'), 'Hemoglobin biomarker present');
assert.ok(html.includes('Platelets'), 'Platelets biomarker present');

// 3. Verify 3D Human Body Scan & Organ Focus Toggle
assert.ok(html.includes('btnMode3DBody'), '3D Full Body Scan toggle button present');
assert.ok(html.includes('btnMode3DOrgan'), '3D Organ Focus toggle button present');
assert.ok(html.includes('stage3DBodyView'), '3D Body silhouette view container present');
assert.ok(html.includes('stage3DOrganView'), '3D Organ focus view container present');
assert.ok(html.includes('data-organ-beacon="liver"'), 'Liver 3D beacon present');
assert.ok(html.includes('data-organ-beacon="kidneys"'), 'Kidneys 3D beacon present');

// 4. Verify Doctor Decision Support Matrix cleanly removed as requested
assert.ok(!html.includes('Doctor Clinical Decision Support &amp; Action Matrix'), 'Doctor Decision Matrix cleanly removed');
assert.ok(!html.includes('vitals-doctor-matrix'), 'Doctor Decision Matrix container cleanly removed');
assert.ok(!html.includes('btnLaunchFullDoctorAI'), 'Doctor Decision Matrix launch button cleanly removed');
assert.ok(html.includes('btnLaunchTrendsDoctorAI'), 'Header Full AI Analysis button present');
assert.ok(html.includes('data-inv-id="INV-OCT"'), 'Header Full AI Analysis button wired to latest invoice INV-OCT');

// 6. Verify Dedicated Biomarker Trends Page, Navigation Button & Visual Graphs:
assert.ok(html.includes('data-pd-section="pdTrends"'), 'Header navigation button for Biomarker Trends present');
assert.ok(html.includes('Biomarker Trends'), 'Header navigation button label present');
assert.ok(html.includes('id="pdTrends"'), 'Dedicated pdTrends page section present');
assert.ok(!html.includes('pd-trends-header-card'), 'Trends page redundant header card cleanly removed');
assert.ok(html.includes('pd-trends-kpi-grid'), 'Trends page KPI summary grid present');
assert.ok(html.includes('Tracked Biomarkers'), 'Tracked Biomarkers KPI card present');
assert.ok(html.includes('Positive Recovery'), 'Positive Recovery KPI card present');
assert.ok(html.includes('pd-trends-graph-card'), 'Longitudinal Trajectory Vector Graph card present');
assert.ok(html.includes('Longitudinal Trajectory Vector Graph'), 'Trajectory graph title present');
assert.ok(html.includes('STANDARD PHYSIOLOGICAL REFERENCE ZONE (NORMAL)'), 'Normal reference zone banner present in SVG');
assert.ok(html.includes('PREVIOUS: 2026-09-10'), 'Previous date milestone marker present in graph');
assert.ok(html.includes('CURRENT: 2026-10-14'), 'Current date milestone marker present in graph');
assert.ok(html.includes('pd-trends-variance-card'), 'Biomarker Variance & Delta Velocity card present');
assert.ok(html.includes('Individual Biomarker Trend Graphs'), 'Individual Biomarker Trend Graphs grid present');
assert.ok(html.includes('pd-individual-biomarkers-section'), 'Individual Biomarker section container present');
assert.ok(!html.includes('vitals-trends-preview-card'), 'Biomarker Trends preview banner cleanly removed from Overview');
assert.ok(html.includes('btnLaunchTrendsDoctorAI'), 'Full AI Analysis button moved to top patient header');

console.log('✓ All 6 verification checks for Dedicated Biomarker Trends Page, Individual Biomarker Trend Graphs, SVG Trajectory Graph, and Delta Velocity Bars PASSED CLEANLY!\n');

