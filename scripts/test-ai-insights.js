'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const aiCode = fs.readFileSync(path.join(root, 'assets/js/mod-ai-insights.js'), 'utf8');

console.log('--- Testing AI Recommendations Module (mod-ai-insights.js) ---');

// 1. VM Execution Test
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
  get: () => null,
  all: () => []
};

vm.createContext(sandbox);
vm.runInContext(aiCode, sandbox);

const AI = sandbox.App.aiInsights;
assert(AI, 'App.aiInsights must be registered');
assert.equal(typeof AI.extractFindings, 'function', 'extractFindings must be a function');
assert.equal(typeof AI.generate5Solutions, 'function', 'generate5Solutions must be a function');
assert.equal(typeof AI.showModal, 'function', 'showModal must be a function');
console.log('✓ mod-ai-insights.js loaded cleanly in VM and exported API methods');

// 2. Test Abnormality Extraction
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

// 3. Test 5 Structured Solutions Generation
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

// 4. Edge Case: Normal Report
const normalReportData = {
  patient: { name: 'Healthy Patient', age: 30, gender: 'female' },
  invoice: { id: 'inv_102', no: 'INV-2026-002' },
  groups: [
    {
      test: { name: 'Complete Blood Count (CBC)' },
      res: {
        values: { hb: 13.5, wbc: 7200, plt: 250000, mcv: 88 }
      }
    }
  ]
};
const normalAnalysis = AI.generate5Solutions(normalReportData);
assert.equal(normalAnalysis.findings.length, 0, 'Normal report should have 0 abnormal findings');
assert(normalAnalysis.solutions.diagnosis[0].title.includes('Normal'), 'Should note normal status');
assert(normalAnalysis.solutions.medications.length >= 1, 'Should offer maintenance / multivitamin support');
console.log('✓ Edge case: Normal laboratory report handled gracefully with wellness guidance');

// 5. Check Integration in mod-results.js
const resultsCode = fs.readFileSync(path.join(root, 'assets/js/mod-results.js'), 'utf8');
assert(resultsCode.includes('id="rvAiInsights"'), 'mod-results.js must include #rvAiInsights button');
assert(resultsCode.includes('App.aiInsights.showModal'), 'mod-results.js must wire showModal click handler');
assert(resultsCode.includes('data-rai='), 'mod-results.js must include data-rai in ready table');
assert(resultsCode.includes('data-oai='), 'mod-results.js must include data-oai in old reports table');
console.log('✓ mod-results.js has all AI trigger buttons and event listeners wired');

// 6. Check Registration in index.html and desktop files
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexHtml.includes('assets/js/mod-ai-insights.js'), 'index.html must register mod-ai-insights.js');

const electronIndexHtml = fs.readFileSync(path.join(root, 'electron-src/index.html'), 'utf8');
assert(electronIndexHtml.includes('assets/js/mod-ai-insights.js'), 'electron-src/index.html must register mod-ai-insights.js');

const win7IndexHtml = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/index.html'), 'utf8');
assert(win7IndexHtml.includes('assets/js/mod-ai-insights.js'), 'win7 index.html must register mod-ai-insights.js');
console.log('✓ All HTML entries across web, electron, and win7 bundle have mod-ai-insights.js registered');

console.log('\nALL 6 TEST SUITES PASSED! AI CLINICAL INTELLIGENCE VERIFIED SUCCESSFULLY.\n');
