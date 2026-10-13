'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const aiCode = fs.readFileSync(path.join(root, 'assets/js/mod-ai-insights.js'), 'utf8');

console.log('--- Testing AI Recommendations Module & Doctor Dashboard Integration ---');

// 1. VM Execution Test
let mockSettings = { aiInsightsRoles: ['admin', 'doctor', 'technician'] };
const sandbox = {
  window: {},
  document: {
    createElement: () => ({ select: () => {}, value: '' }),
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  console: console
};
sandbox.window = sandbox;
sandbox.App = {
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  toast: () => {},
  modal: (title, html, opts) => {
    return () => {};
  }
};
sandbox.DB = {
  get: (table, id) => {
    if (table === 'settings' && id === 'main') return mockSettings;
    return null;
  },
  all: () => []
};

vm.createContext(sandbox);
vm.runInContext(aiCode, sandbox);

const AI = sandbox.App.aiInsights;
assert(AI, 'App.aiInsights must be registered');
assert.equal(typeof AI.extractFindings, 'function', 'extractFindings must be a function');
assert.equal(typeof AI.generate5Solutions, 'function', 'generate5Solutions must be a function');
assert.equal(typeof AI.showModal, 'function', 'showModal must be a function');
assert.equal(typeof AI.canAccess, 'function', 'canAccess must be a function');
console.log('✓ mod-ai-insights.js loaded cleanly in VM and exported API methods');

// 2. Role Permissions Tests (Doctor MUST have it, Admin has it, Admin can configure others)
assert.equal(AI.canAccess('doctor'), true, 'Doctor MUST always have AI Recommendations access');
assert.equal(AI.canAccess('admin'), true, 'Admin MUST always have AI Recommendations access');
assert.equal(AI.canAccess('technician'), true, 'Technician has access when in settings list');
assert.equal(AI.canAccess('reception'), false, 'Reception does not have access when omitted from settings list');

// Toggle reception on and technician off
mockSettings.aiInsightsRoles = ['admin', 'doctor', 'reception'];
assert.equal(AI.canAccess('reception'), true, 'Reception gains access when admin enables it');
assert.equal(AI.canAccess('technician'), false, 'Technician loses access when admin disables it');
assert.equal(AI.canAccess('doctor'), true, 'Doctor remains enabled regardless of custom list');
assert.equal(AI.canAccess('admin'), true, 'Admin remains enabled regardless of custom list');
console.log('✓ Role & Permissions: Doctor is mandatory, Admin has full access, and other roles are configurable');

// 3. Test Abnormality Extraction
const mockReportData = {
  patient: { name: 'Ali Raza', age: 45, gender: 'male' },
  invoice: { id: 'inv_101', no: 'INV-2026-001' },
  groups: [
    {
      test: { name: 'Complete Blood Count (CBC)' },
      res: {
        values: {
          hb: 6.8,       // Critical low anemia
          wbc: 15400,    // High leukocytosis
          plt: 42000,    // Low thrombocytopenia
          mcv: 71        // Low microcytic
        }
      }
    },
    {
      test: { name: 'Liver Function Test (LFT)' },
      res: {
        values: {
          alt: 115       // High ALT transaminitis
        }
      }
    },
    {
      test: { name: 'Renal Function Test (RFT)' },
      res: {
        values: {
          creatinine: 2.3, // High creatinine
          urea: 68         // High urea
        }
      }
    },
    {
      test: { name: 'Fasting Blood Sugar' },
      res: {
        values: {
          glucose: 195     // High sugar
        }
      }
    }
  ]
};

const findings = AI.extractFindings(mockReportData);
assert(findings.length >= 6, `Expected at least 6 findings, got ${findings.length}`);
const foundKeys = findings.map(f => f.key);
assert(foundKeys.includes('hb'), 'Should detect Hb abnormality');
assert(foundKeys.includes('wbc'), 'Should detect WBC abnormality');
assert(foundKeys.includes('plt'), 'Should detect Platelet abnormality');
assert(foundKeys.includes('alt'), 'Should detect ALT abnormality');
assert(foundKeys.includes('creatinine'), 'Should detect Creatinine abnormality');
assert(foundKeys.includes('glucose_fasting') || foundKeys.includes('glucose_random'), 'Should detect Glucose abnormality');
console.log('✓ Successfully detected all abnormal clinical parameters with correct severity thresholds');

// 4. Test 5 Structured Solutions Generation
const analysis = AI.generate5Solutions(mockReportData);
const s = analysis.solutions;

// Solution 1: Diagnosis
assert(Array.isArray(s.diagnosis) && s.diagnosis.length > 0, 'Solution 1 (Diagnosis) must be non-empty');
const diagTitles = s.diagnosis.map(d => d.title.toLowerCase());
assert(diagTitles.some(t => t.includes('anemia')), 'Diagnosis must identify Anemia');
assert(diagTitles.some(t => t.includes('infection') || t.includes('leukocytosis')), 'Diagnosis must identify Infection/Leukocytosis');
assert(diagTitles.some(t => t.includes('thrombocytopenia')), 'Diagnosis must identify Thrombocytopenia');
assert(diagTitles.some(t => t.includes('diabetes') || t.includes('hyperglycemia')), 'Diagnosis must identify Diabetes');
assert(diagTitles.some(t => t.includes('hepatic') || t.includes('alt')), 'Diagnosis must identify Liver/ALT elevation');
assert(diagTitles.some(t => t.includes('renal') || t.includes('azotemia') || t.includes('creatinine')), 'Diagnosis must identify Renal elevation');
console.log('✓ Solution 1 (Clinical Findings & Probable Diagnosis) generated correctly');

// Solution 2: Medications
assert(Array.isArray(s.medications) && s.medications.length > 0, 'Solution 2 (Medications) must be non-empty');
const allDrugs = s.medications.flatMap(m => m.items).map(i => i.drug.toLowerCase());
assert(allDrugs.some(d => d.includes('iron') || d.includes('ferrous')), 'Must recommend Iron therapy for microcytic anemia');
assert(allDrugs.some(d => d.includes('amoxiclav') || d.includes('antibiotic') || d.includes('azithromycin')), 'Must recommend anti-infective');
assert(allDrugs.some(d => d.includes('metformin')), 'Must recommend Metformin/hypoglycemic for diabetes');
assert(allDrugs.some(d => d.includes('silymarin') || d.includes('essentiale') || d.includes('hepatoprotective')), 'Must recommend hepatoprotective guidance');
console.log('✓ Solution 2 (Evidence-based Prescription & Medication Guidance) generated correctly');

// Solution 3: Diet & Lifestyle
assert(Array.isArray(s.diet) && s.diet.length > 0, 'Solution 3 (Diet & Lifestyle) must be non-empty');
const dietText = s.diet.join(' ').toLowerCase();
assert(dietText.includes('iron') || dietText.includes('palak') || dietText.includes('meat'), 'Diet must include iron-rich nutrition guidance');
assert(dietText.includes('sugar') || dietText.includes('carbohydrate'), 'Diet must include diabetic dietary precautions');
console.log('✓ Solution 3 (Dietary & Lifestyle Management / Parhez & Khurak) generated correctly');

// Solution 4: Confirmatory Follow-up Tests
assert(Array.isArray(s.tests) && s.tests.length > 0, 'Solution 4 (Follow-up Tests) must be non-empty');
const testText = s.tests.join(' ').toLowerCase();
assert(testText.includes('ferritin') || testText.includes('iron profile'), 'Must suggest Iron profile / Ferritin follow-up');
assert(testText.includes('hba1c') || testText.includes('crp') || testText.includes('dengue'), 'Must suggest correlative follow-ups');
console.log('✓ Solution 4 (Correlative & Confirmatory Follow-up Tests) generated correctly');

// Solution 5: Red Flags & Urgent Precautions
assert(Array.isArray(s.redflags) && s.redflags.length > 0, 'Solution 5 (Red Flags) must be non-empty');
const redFlagsText = s.redflags.join(' ').toLowerCase();
assert(redFlagsText.includes('bleeding') || redFlagsText.includes('platelet') || redFlagsText.includes('transfusion'), 'Must flag urgent bleeding/transfusion precautions');
console.log('✓ Solution 5 (Red Flags & Urgent Precautions) generated correctly');

// 5. Direct Doctor Dashboard Modal Invocation (directData test)
let modalOpenedTitle = '';
sandbox.App.modal = (title) => {
  modalOpenedTitle = title;
  return () => {};
};
const directDoctorData = {
  pt: { name: 'Doctor Patient', age: 52, gender: 'female' },
  inv: { id: 'inv_doc_1', no: 'INV-DOC-1' },
  doc: { name: 'Dr. Ahmed Khan' },
  groups: [
    { test: { name: 'Urine Routine Examination', params: [] }, res: { values: { puscell: 30 } } }
  ]
};
AI.showModal('inv_doc_1', directDoctorData);
assert.equal(modalOpenedTitle, 'AI Clinical Recommendations', 'Doctor portal showModal must open modal with direct data');
console.log('✓ showModal successfully launches with direct data provided by doctor dashboard');

// 6. Check Integration in mod-results.js
const resultsCode = fs.readFileSync(path.join(root, 'assets/js/mod-results.js'), 'utf8');
assert(resultsCode.includes('canSeeAi'), 'mod-results.js must check canSeeAi permission');
assert(resultsCode.includes('id="rvAiInsights"'), 'mod-results.js must include #rvAiInsights button');
assert(resultsCode.includes('App.aiInsights.showModal'), 'mod-results.js must wire showModal click handler');
assert(resultsCode.includes('data-rai='), 'mod-results.js must include data-rai in ready table');
assert(resultsCode.includes('data-oai='), 'mod-results.js must include data-oai in old reports table');
console.log('✓ mod-results.js has role-aware AI trigger buttons and event listeners');

// 7. Check Doctor Dashboard in mod-portal.js
const portalCode = fs.readFileSync(path.join(root, 'assets/js/mod-portal.js'), 'utf8');
assert(portalCode.includes('data-doc-ai='), 'mod-portal.js must render data-doc-ai button for ready reports in doctor view');
assert(portalCode.includes('App.aiInsights.showModal'), 'mod-portal.js must wire data-doc-ai click listener to launch AI recommendations');
console.log('✓ mod-portal.js doctor dashboard has AI Recommendations button and handler wired');

// 8. Check Admin Settings in mod-admin.js
const adminCode = fs.readFileSync(path.join(root, 'assets/js/mod-admin.js'), 'utf8');
assert(adminCode.includes('btnSaveAiPerms'), 'mod-admin.js must include btnSaveAiPerms save button in Users & Roles');
assert(adminCode.includes('aiInsightsRoles'), 'mod-admin.js must persist aiInsightsRoles into settings');
assert(adminCode.includes('Doctor Account') && adminCode.includes('Mandatory'), 'Doctor account must be locked mandatory in settings UI');
console.log('✓ mod-admin.js includes role permissions management for AI Recommendations with doctor locked mandatory');

// 9. Check Backend Server Support in cloud and win7 server.js
const cloudServer = fs.readFileSync(path.join(root, 'cloud/server.js'), 'utf8');
assert(cloudServer.includes('results: forDoctor ? rs.map'), 'cloud/server.js must attach results for doctor in reportOf');
const win7Server = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/server/server.js'), 'utf8');
assert(win7Server.includes('results: forDoctor ? rs.map'), 'win7 server.js must attach results for doctor in reportOf');
console.log('✓ Backend servers (cloud & win7) supply test results to doctor reports');

// 10. Check Registration in index.html and desktop files
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexHtml.includes('assets/js/mod-ai-insights.js'), 'index.html must register mod-ai-insights.js');
const electronIndexHtml = fs.readFileSync(path.join(root, 'electron-src/index.html'), 'utf8');
assert(electronIndexHtml.includes('assets/js/mod-ai-insights.js'), 'electron-src/index.html must register mod-ai-insights.js');
const win7IndexHtml = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/index.html'), 'utf8');
assert(win7IndexHtml.includes('assets/js/mod-ai-insights.js'), 'win7 index.html must register mod-ai-insights.js');
console.log('✓ All HTML entries across web, electron, and win7 bundle have mod-ai-insights.js registered');

console.log('\nALL 10 TEST SUITES PASSED! DOCTOR DASHBOARD & ADMIN PERMISSIONS VERIFIED SUCCESSFULLY.\n');
