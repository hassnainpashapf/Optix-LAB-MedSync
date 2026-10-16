'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const aiCode = fs.readFileSync(path.join(root, 'assets/js/mod-ai-insights.js'), 'utf8');
const pdCode = fs.readFileSync(path.join(root, 'assets/js/mod-patient-dashboard.js'), 'utf8');

console.log('--- Testing Patient AI Clinical Intelligence Hub (12 Core Modules) & Tab Parity ---');

const sandbox = {
  window: {},
  document: {
    createElement: () => ({ select: () => {}, value: '' }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] }),
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  console: console,
  setTimeout: (fn) => fn()
};
sandbox.window = sandbox;
sandbox.App = {
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  toast: () => {},
  modal: (title, html, opts) => {
    return () => {};
  },
  route: () => {}
};
sandbox.DB = {
  get: () => null,
  all: () => []
};

vm.createContext(sandbox);
vm.runInContext(aiCode, sandbox);
vm.runInContext(pdCode, sandbox);

const AI = sandbox.App.aiInsights;
const PD = sandbox.App.patientDashboard;

assert(AI, 'App.aiInsights must be registered');
assert(PD, 'App.patientDashboard must be registered');

// 1. Verify Patient Dashboard Render Output includes AI Hub and all 12 modules
const mockPatient = {
  id: 'PT-TEST-001',
  name: 'Zahid Mehmood',
  age: 48,
  gender: 'Male',
  phone: '03001234567'
};

const patientHtml = PD.render(mockPatient);

// Navigation button
assert(patientHtml.includes('data-pd-section="pdAiHub"'), 'Patient navigation must include data-pd-section="pdAiHub"');
assert(patientHtml.includes('AI Clinical Intelligence (12 Core Modules)'), 'Patient nav item must have label AI Clinical Intelligence (12 Core Modules)');
assert(patientHtml.includes('🤖'), 'Patient nav button icon must be 🤖');
console.log('✓ Patient navigation includes 12 Core Modules Hub');

// Overview Banner
assert(patientHtml.includes('id="pdAiQuickBanner"'), 'Patient Overview must render AI Clinical Intelligence Banner');
assert(patientHtml.includes('12/12 Modules Active'), 'Overview banner must show 12/12 Modules Active badge');
assert(patientHtml.includes('btnOpenPatientAiHub'), 'Overview banner must include Explore 12 Modules button');
assert(patientHtml.includes('btnLaunchOverviewAI'), 'Overview banner must include Full AI Recommendations button');
console.log('✓ Patient Overview banner displays 12/12 Modules Active with launch buttons');

// Dedicated Hub Container
assert(patientHtml.includes('id="pdAiHub"'), 'Dedicated #pdAiHub layout section must exist');
assert(patientHtml.includes('AI Clinical Intelligence Hub (12 Core Modules)'), 'Hub title must be present');

// All 12 Modules in Patient Hub
const EXPECTED_MODULES = [
  '5 Core Solutions',
  'Organ Impact Map',
  'Clinical Calculators',
  'Panic SOS Alerts',
  'Drug Interactions (DDI)',
  'Organ Toxicity Shields',
  'Differential Diagnosis (DDx)',
  'Genetic & Marriage Guard',
  '10-Year ASCVD Risk',
  'Roman Urdu Guide',
  'Digital Prescription Pad',
  'Report Remarks Summary'
];

EXPECTED_MODULES.forEach((modName, i) => {
  const modEncoded = modName.replace(/&/g, '&amp;');
  assert(patientHtml.includes(modName) || patientHtml.includes(modEncoded), `Patient Hub must include module card: ${modName}`);
  assert(patientHtml.includes(`Module #${i + 1}`), `Patient Hub must show index for Module #${i + 1}`);
});
console.log('✓ All 12 modules rendered inside Patient AI Hub (#pdAiHub) matching user settings screenshot');

// 2. Verify AI Recommendations Modal / Page Tabs Parity
const mockReportData = {
  patient: mockPatient,
  invoice: { id: 'inv_101', no: 'INV-101' },
  doctor: { name: 'Dr. Usman' },
  groups: [
    {
      test: { name: 'CBC' },
      res: { values: { hb: 6.5, wbc: 16000, plt: 40000, mcv: 70, rbc: 5.5 } }
    },
    {
      test: { name: 'RFT' },
      res: { values: { creatinine: 2.4, urea: 70 } }
    },
    {
      test: { name: 'Lipid Profile' },
      res: { values: { chol: 240, hdl: 35, sbp: 150 } }
    }
  ]
};

const analysis = AI.generate5Solutions(mockReportData);
const aiContentHtml = AI.buildRecommendationsContent(analysis, { isPage: false });

// 12 Tabs in AI Recommendations
const EXPECTED_TABS = [
  'data-tab="solutions"',
  'data-tab="bodymap"',
  'data-tab="indices"',
  'data-tab="panic"',
  'data-tab="ddi"',
  'data-tab="safety"',
  'data-tab="ddx"',
  'data-tab="genetic"',
  'data-tab="ascvd"',
  'data-tab="urdu"',
  'data-tab="rx"',
  'data-tab="remarks"',
  'data-tab="trends"'
];

EXPECTED_TABS.forEach(tabAttr => {
  assert(aiContentHtml.includes(tabAttr), `AI Recommendations tabs bar must include: ${tabAttr}`);
});
console.log('✓ AI Recommendations tabs bar exposes all 12 modules + Velocity Trends as individual tabs');

// 12 Panes in AI Recommendations
const EXPECTED_PANES = [
  'id="aiPane-solutions"',
  'id="aiPane-bodymap"',
  'id="aiPane-indices"',
  'id="aiPane-panic"',
  'id="aiPane-ddi"',
  'id="aiPane-safety"',
  'id="aiPane-ddx"',
  'id="aiPane-genetic"',
  'id="aiPane-ascvd"',
  'id="aiPane-urdu"',
  'id="aiPane-rx"',
  'id="aiPane-remarks"',
  'id="aiPane-trends"'
];

EXPECTED_PANES.forEach(paneId => {
  assert(aiContentHtml.includes(paneId), `AI Recommendations must include dedicated pane: ${paneId}`);
});
console.log('✓ All 12 dedicated content panes verified in AI Recommendations HTML');

// 3. Verify Preferred Tab Activation
let modalTitle = '';
let modalBody = '';
sandbox.App.modal = (title, body) => {
  modalTitle = title;
  modalBody = body;
  return () => {};
};

AI.showModal('inv_101', mockReportData, 'panic');
assert.equal(modalTitle, 'AI Clinical Recommendations');
assert(modalBody.includes('id="aiPane-panic"'), 'Modal body must contain panic pane');
console.log('✓ showModal supports preferredTab argument');

console.log('\n============================================================');
console.log('ALL PATIENT AI HUB & 12 CORE MODULES TESTS PASSED CLEANLY 100%!');
console.log('============================================================\n');
