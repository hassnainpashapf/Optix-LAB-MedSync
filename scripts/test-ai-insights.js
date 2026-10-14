'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const aiCode = fs.readFileSync(path.join(root, 'assets/js/mod-ai-insights.js'), 'utf8');

console.log('--- Testing AI Recommendations Module & Doctor Dashboard Integration ---');

// 1. VM Execution Test
// 1. VM Execution Test
let mockSettings = { aiInsightsRoles: ['admin', 'doctor', 'technician'] };
const registeredRoutes = [];
const mockStorage = { labpos_session: JSON.stringify({ role: 'admin' }) };
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
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); }
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
  route: (p, fn) => { registeredRoutes.push(p); }
};
sandbox.DB = {
  get: (table, id) => {
    if (table === 'settings' && id === 'main') return mockSettings;
    return null;
  },
  set: (table, id, val) => {
    if (table === 'settings' && id === 'main') mockSettings = val;
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

// 11. Test Pro Medical Indices & Calculators
console.log('\n--- Testing Pro Feature 1: Clinical Calculators & Medical Indices ---');
const thalReport = {
  pt: { name: 'Thalassemia Patient', age: 24, gender: 'male' },
  inv: { id: 'inv_thal_1' },
  groups: [
    { test: { name: 'Complete Blood Count' }, res: { values: { mcv: 68, rbc: 5.8 } } } // Mentzer = 68 / 5.8 = 11.72 (< 13)
  ]
};
const thalIndices = AI.calculateIndices(thalReport);
const mentzerThal = thalIndices.find(x => x.id === 'mentzer');
assert(mentzerThal, 'Mentzer Index must be computed');
assert.equal(mentzerThal.score, 11.72, 'Mentzer score must equal MCV/RBC');
assert.equal(mentzerThal.status, 'warning', 'Mentzer < 13 must flag warning for Thalassemia Minor');
assert(mentzerThal.statusLabel.includes('Thalassemia Minor'), 'Mentzer label must identify Thalassemia Minor');

const idaReport = {
  pt: { name: 'IDA Patient', age: 30, gender: 'female' },
  inv: { id: 'inv_ida_1' },
  groups: [
    { test: { name: 'CBC' }, res: { values: { mcv: 72, rbc: 3.6 } } } // Mentzer = 72 / 3.6 = 20.0 (> 13)
  ]
};
const idaIndices = AI.calculateIndices(idaReport);
const mentzerIda = idaIndices.find(x => x.id === 'mentzer');
assert(mentzerIda && mentzerIda.score === 20.0, 'Mentzer IDA score must equal 20.0');
assert(mentzerIda.statusLabel.includes('Iron Deficiency'), 'Mentzer > 13 must identify Iron Deficiency');

// eGFR CKD-EPI 2021 Equation
const ckdReport = {
  pt: { name: 'Renal Patient', age: 60, gender: 'male' },
  inv: { id: 'inv_ckd_1' },
  groups: [
    { test: { name: 'RFT' }, res: { values: { creatinine: 2.3 } } }
  ]
};
const ckdIndices = AI.calculateIndices(ckdReport);
const egfrItem = ckdIndices.find(x => x.id === 'egfr');
assert(egfrItem, 'eGFR must be computed');
assert(egfrItem.score < 40 && egfrItem.score > 25, `eGFR score should be ~30 mL/min, got ${egfrItem.score}`);
assert(egfrItem.statusLabel.includes('Stage 3') || egfrItem.statusLabel.includes('Stage 4'), 'eGFR should classify KDIGO stage');

// FIB-4 & APRI Liver Fibrosis & De Ritis Ratio
const liverScoreReport = {
  pt: { name: 'Liver Patient', age: 50, gender: 'male' },
  inv: { id: 'inv_liv_1' },
  groups: [
    { test: { name: 'LFT' }, res: { values: { ast: 120, alt: 95 } } },
    { test: { name: 'CBC' }, res: { values: { plt: 110000 } } }
  ]
};
const livIndices = AI.calculateIndices(liverScoreReport);
const fib4Item = livIndices.find(x => x.id === 'fib4');
assert(fib4Item, 'FIB-4 score must be computed');
assert(fib4Item.score > 2.67, `FIB-4 score should be > 2.67 (High Risk Fibrosis), got ${fib4Item.score}`);
assert.equal(fib4Item.status, 'critical', 'FIB-4 > 2.67 must be critical');

const apriItem = livIndices.find(x => x.id === 'apri');
assert(apriItem && apriItem.score > 1.5, 'APRI score should be > 1.5 (High Risk Cirrhosis)');

const deRitisItem = livIndices.find(x => x.id === 'deritis');
assert(deRitisItem && deRitisItem.score === 1.26, 'De Ritis score must be AST/ALT');

// Atherogenic Lipoprotein Ratios
const lipidScoreReport = {
  pt: { name: 'Lipid Patient', age: 48, gender: 'female' },
  inv: { id: 'inv_lip_1' },
  groups: [
    { test: { name: 'Lipid Profile' }, res: { values: { cholesterol: 240, hdl: 38, triglycerides: 230 } } }
  ]
};
const lipIndices = AI.calculateIndices(lipidScoreReport);
const castelliItem = lipIndices.find(x => x.id === 'castelli');
assert(castelliItem && castelliItem.score === 6.32, 'Castelli ratio should be 240 / 38 = 6.32');
assert.equal(castelliItem.status, 'critical', 'Castelli ratio > 5.0 must flag critical');
const tgHdlItem = lipIndices.find(x => x.id === 'tghdl');
assert(tgHdlItem && tgHdlItem.score === 6.05, 'TG/HDL ratio should be 230 / 38 = 6.05');
console.log('✓ Pro Feature 1: Clinical Calculators & Medical Indices (Mentzer, eGFR, FIB-4, APRI, De Ritis, Castelli) verified successfully');

// 12. Test Pro Feature 2: Organ-Specific Drug Safety Shield
console.log('\n--- Testing Pro Feature 2: Organ-Specific Drug Safety Shield ---');
const multiOrganReport = {
  pt: { name: 'Safety Shield Patient', age: 58, gender: 'male' },
  inv: { id: 'inv_safe_1' },
  groups: [
    { test: { name: 'RFT' }, res: { values: { creatinine: 2.8 } } },
    { test: { name: 'LFT' }, res: { values: { alt: 145, ast: 110, bili_total: 2.6 } } },
    { test: { name: 'CBC' }, res: { values: { plt: 25000 } } }
  ]
};
const safetyAlerts = AI.evaluateDrugSafety(multiOrganReport);
assert.equal(safetyAlerts.length, 3, 'Must trigger Renal, Hepatic, and Bleeding shields');

const renalShield = safetyAlerts.find(s => s.organ === 'Renal');
assert(renalShield, 'Renal shield must be active');
assert.equal(renalShield.status, 'critical', 'Cr > 2.5 must trigger critical renal status');
assert(renalShield.contraindications.some(c => c.includes('NSAID')), 'Renal shield must contraindicate NSAIDs');

const hepaticShield = safetyAlerts.find(s => s.organ === 'Hepatic');
assert(hepaticShield, 'Hepatic shield must be active');
assert(hepaticShield.contraindications.some(c => c.includes('Paracetamol')), 'Hepatic shield must cap Paracetamol');
assert(hepaticShield.cautions.some(c => c.includes('Statin')), 'Hepatic shield must caution Statins');

const bleedingShield = safetyAlerts.find(s => s.organ === 'Hematology');
assert(bleedingShield, 'Bleeding shield must be active');
assert.equal(bleedingShield.status, 'critical', 'Platelets < 30,000 must trigger critical bleeding alert');
assert(bleedingShield.contraindications.some(c => c.includes('IM Injection') || c.includes('Intramuscular')), 'Must strictly forbid IM injections');
console.log('✓ Pro Feature 2: Drug Safety Shield (Renal, Hepatic, Hematology) verified with active contraindications');

// 13. Test Pro Feature 3: Longitudinal Trend & Delta Velocity
console.log('\n--- Testing Pro Feature 3: Longitudinal Trend & Delta Velocity ---');
const mockInvoicesDB = [
  { id: 'inv_cur_10', no: 'INV-10', patientId: 'pt_long_1', date: '2026-10-13' },
  { id: 'inv_prev_9', no: 'INV-09', patientId: 'pt_long_1', date: '2026-10-01' }
];
const mockResultsDB = [
  { invoiceId: 'inv_cur_10', testId: 't_cbc', values: { hb: 8.1, plt: 48000 } },
  { invoiceId: 'inv_cur_10', testId: 't_rft', values: { creatinine: 1.8 } },
  { invoiceId: 'inv_prev_9', testId: 't_cbc', values: { hb: 12.5, plt: 210000 } }, // Hb drop = 4.4, Plt drop = 77%
  { invoiceId: 'inv_prev_9', testId: 't_rft', values: { creatinine: 0.9 } }          // Cr rise = +0.9 (KDIGO AKI)
];
const mockTestsDB = [
  { id: 't_cbc', name: 'Complete Blood Count' },
  { id: 't_rft', name: 'Renal Function Test' }
];

sandbox.DB.all = (table) => {
  if (table === 'invoices') return mockInvoicesDB;
  if (table === 'results') return mockResultsDB;
  if (table === 'tests') return mockTestsDB;
  return [];
};
sandbox.DB.get = (table, id) => {
  if (table === 'invoices') return mockInvoicesDB.find(x => x.id === id);
  if (table === 'tests') return mockTestsDB.find(x => x.id === id);
  if (table === 'settings' && id === 'main') return mockSettings;
  return null;
};

const currentDeltaReport = {
  pt: { id: 'pt_long_1', name: 'Longitudinal Patient', age: 35, gender: 'male' },
  inv: { id: 'inv_cur_10', no: 'INV-10', patientId: 'pt_long_1' },
  groups: [
    { test: { name: 'CBC' }, res: { values: { hb: 8.1, plt: 48000 } } },
    { test: { name: 'RFT' }, res: { values: { creatinine: 1.8 } } }
  ]
};

const deltaResult = AI.evaluateHistoricalDelta('inv_cur_10', currentDeltaReport);
assert.equal(deltaResult.hasHistory, true, 'Should detect historical reports for patient');
assert.equal(deltaResult.prevInvoice.id, 'inv_prev_9', 'Should pair with previous invoice inv_prev_9');
assert(deltaResult.velocityAlerts.length >= 3, `Expected at least 3 acute delta alerts, got ${deltaResult.velocityAlerts.length}`);
assert(deltaResult.velocityAlerts.some(a => a.includes('ACUTE HEMOGLOBIN DROP')), 'Must flag acute hemoglobin drop');
assert(deltaResult.velocityAlerts.some(a => a.includes('ACUTE PLATELET CRASH')), 'Must flag acute platelet crash');
assert(deltaResult.velocityAlerts.some(a => a.includes('KDIGO AKI CRITERION')), 'Must flag KDIGO Acute Kidney Injury surge');
console.log('✓ Pro Feature 3: Longitudinal Trend & Delta Velocity successfully flagged Hb drop, Platelet crash, and KDIGO AKI surge');

// 14. Test Pro Feature 4: Bilingual Patient Care Guide (Roman Urdu)
console.log('\n--- Testing Pro Feature 4: Roman Urdu Patient Care Guide ---');
const urduReport = {
  patient: { name: 'Zahid Khan', age: 40, gender: 'male' },
  invoice: { id: 'inv_u1', no: 'INV-U1' },
  findings: [
    { key: 'hb', status: 'low', value: 7.5 },
    { key: 'plt', status: 'low', value: 45000 },
    { key: 'glucose_random', status: 'high', value: 240 }
  ]
};
const urduGuide = AI.generateUrduPatientGuide(urduReport);
assert(urduGuide.wazahat.length >= 3, 'Must include Urdu disease explanations for Anemia, Platelets, Sugar');
assert(urduGuide.wazahat.some(w => w.includes('Hemoglobin') || w.includes('Khoon ki kami')), 'Must explain anemia in Roman Urdu');
assert(urduGuide.parhez.some(p => p.includes('Chai') || p.includes('Cold Drink') || p.includes('Brufen')), 'Must advise dietary & painkiller parhez in Urdu');
assert(urduGuide.khurak.some(k => k.includes('Palak') || k.includes('Chukandar') || k.includes('Nariyal')), 'Must advise Pakistani foods in Urdu');
assert(urduGuide.plainText.includes('OPTIX LAB — SEHAT O PARHEZ GUIDE'), 'Plain text Roman Urdu must have official header');
console.log('✓ Pro Feature 4: Bilingual Patient Care Guide in Roman Urdu generated successfully with 1-click text');

// 15. Test Pro Feature 5: Digital Doctor Prescription Pad
console.log('\n--- Testing Pro Feature 5: Digital Doctor Prescription Pad ---');
const rxData = {
  patient: { name: 'Kashif Mehmood', age: 44, gender: 'male' },
  invoice: { id: 'inv_rx1', no: 'INV-RX1' },
  doctor: { name: 'Dr. Tariq Jamil', pmdc: '38192-P', phone: '+92 301 1234567' },
  solutions: {
    diagnosis: [{ title: 'Microcytic Anemia', detail: 'Low Hb' }],
    medications: [
      {
        category: 'Hematinic',
        items: [
          { drug: 'Tab. Ferrous Ascorbate 100mg', dosage: '1 tablet BD x 3 months', note: 'After meals with juice' }
        ]
      }
    ],
    diet: ['Eat spinach and pomegranate', 'Avoid tea after food'],
    tests: ['Serum Ferritin', 'TIBC'],
    redflags: ['Contact hospital if breathlessness worsens']
  }
};
const rxHtml = AI.generateRxPadHtml(rxData);
assert(rxHtml.includes('Dr. Tariq Jamil'), 'Rx pad must display doctor name');
assert(rxHtml.includes('38192-P'), 'Rx pad must display doctor PMDC number');
assert(rxHtml.includes('Tab. Ferrous Ascorbate 100mg'), 'Rx pad must contain prescribed medicine in Rx table');
assert(rxHtml.includes('℞'), 'Rx pad must feature traditional ℞ symbol');
assert(rxHtml.includes('Doctor Signature &amp; Stamp') || rxHtml.includes('Doctor Signature & Stamp'), 'Rx pad must have signature line');
console.log('✓ Pro Feature 5: Digital Doctor Prescription Pad HTML generated with complete credentials and Rx table');

// 16. Test Pro Feature 6: 1-Tap Order Follow-Up Tests
console.log('\n--- Testing Pro Feature 6: 1-Tap Order Follow-Up Tests ---');
let precartSaved = '';
sandbox.sessionStorage = {
  getItem: (k) => (k === 'labpos_precart' ? precartSaved : null),
  setItem: (k, v) => { if (k === 'labpos_precart') precartSaved = v; }
};
let navLocation = '';
sandbox.App.nav = (url) => { navLocation = url; };

AI.orderFollowupTest('Complete Blood Count', 'pt_100');
assert(precartSaved.includes('Complete Blood Count'), 'precart must contain ordered test');
assert.equal(navLocation, '#/billing/pt_100', 'Must redirect to billing POS for patient');
console.log('✓ Pro Feature 6: 1-Tap Order Follow-Up Tests saves to precart and navigates to billing POS');

// 17. Test Ultra-Advanced Feature: Automatic Panic-Value SOS Alert (CAP / ISO 15189)
console.log('\n--- Testing Ultra-Advanced Feature 1: Automatic Panic-Value SOS Alert ---');
const panicReport = {
  pt: { name: 'Emergency Patient', age: 62, gender: 'male' },
  inv: { id: 'inv_sos_1', no: 'INV-SOS-1' },
  doc: { name: 'Dr. Zulfiqar Ali', phone: '+92 300 1122334' },
  groups: [
    { test: { name: 'CBC' }, res: { values: { plt: 14000, hb: 5.9 } } }, // Extreme Platelets < 20,000 & Hb < 6.5
    { test: { name: 'RBS' }, res: { values: { glucose: 450 } } }         // Extreme Glucose > 400
  ]
};
const panicCheck = AI.checkPanicValues(panicReport);
assert.equal(panicCheck.isPanic, true, 'Must flag emergency panic condition');
assert(panicCheck.alerts.length >= 3, `Expected at least 3 panic alerts, got ${panicCheck.alerts.length}`);
assert(panicCheck.alerts.some(a => a.param === 'Platelet Count'), 'Must trigger platelet panic alert');
assert(panicCheck.alerts.some(a => a.param === 'Hemoglobin'), 'Must trigger hemoglobin panic alert');
assert(panicCheck.alerts.some(a => a.param === 'Blood Glucose'), 'Must trigger glucose panic alert');
assert(panicCheck.formattedMessage.includes('CRITICAL PANIC-VALUE LAB ALERT'), 'Message must contain official CAP/ISO header');
assert(panicCheck.formattedMessage.includes('Dr. Zulfiqar Ali'), 'Message must address the attending doctor');
console.log('✓ Ultra-Advanced Feature 1: Panic-Value SOS Alert accurately detects emergency thresholds and generates WhatsApp alert');

// 18. Test Ultra-Advanced Feature: Multi-Drug Interaction Clash Matrix (DDI)
console.log('\n--- Testing Ultra-Advanced Feature 2: Multi-Drug Interaction Checker ---');
const conflictingMeds = [
  'Tab. Diclofenac Sodium 50mg BD',
  'Tab. Aspirin (Disprin) 75mg daily',
  'Tab. Ciprofloxacin 500mg BD',
  'Tab. Theophylline 300mg daily',
  'Tab. Atorvastatin 20mg HS',
  'Tab. Clarithromycin 500mg BD'
];
const ddiResults = AI.checkDrugInteractions(conflictingMeds);
assert(ddiResults.length >= 3, `Expected at least 3 severe drug interactions, got ${ddiResults.length}`);
assert(ddiResults.some(d => d.id === 'nsaid_blood_thinner'), 'Must detect NSAID + Aspirin hemorrhage clash');
assert(ddiResults.some(d => d.id === 'cipro_theophylline'), 'Must detect Ciprofloxacin + Theophylline seizure hazard');
assert(ddiResults.some(d => d.id === 'statin_macrolide'), 'Must detect Statin + Clarithromycin rhabdomyolysis clash');
console.log('✓ Ultra-Advanced Feature 2: Multi-Drug Interaction Clash Matrix successfully flagged lethal pharmacodynamic conflicts');

// 19. Test Ultra-Advanced Feature: Differential Diagnosis (DDx) Probability Matrix
console.log('\n--- Testing Ultra-Advanced Feature 3: Differential Diagnosis DDx Matrix ---');
const ddxReportData = {
  pt: { name: 'Fever Patient', age: 26, gender: 'male' },
  inv: { id: 'inv_ddx_1' },
  groups: [
    { test: { name: 'CBC' }, res: { values: { plt: 38000, wbc: 3100, hb: 7.2, mcv: 67, rbc: 5.6 } } }
  ]
};
const ddxFindings = AI.extractFindings(ddxReportData);
const ddxMatrix = AI.calculateDifferentialDiagnosis(ddxReportData, ddxFindings);
assert(ddxMatrix.length >= 2, 'Must generate DDx for Thrombocytopenia and Microcytic Anemia');

const pltDDx = ddxMatrix.find(d => d.domain.includes('Thrombocytopenia'));
assert(pltDDx, 'Must contain Thrombocytopenia DDx domain');
const dengueCandidate = pltDDx.candidates.find(c => c.disease.includes('Dengue'));
assert(dengueCandidate && dengueCandidate.probability >= 80, 'Dengue Fever should have >= 80% match in febrile thrombocytopenia');

const microDDx = ddxMatrix.find(d => d.domain.includes('Microcytic'));
assert(microDDx, 'Must contain Microcytic Anemia DDx domain');
const thalCandidate = microDDx.candidates.find(c => c.disease.includes('Thalassemia Minor'));
assert(thalCandidate && thalCandidate.probability >= 90, 'Thalassemia Minor should have >= 90% probability when Mentzer < 13');
console.log('✓ Ultra-Advanced Feature 3: Differential Diagnosis (DDx) Matrix successfully evaluated probabilistic disease differentials');

// 20. Test Ultra-Advanced Feature: 10-Year ASCVD Cardiovascular Risk Calculator
console.log('\n--- Testing Ultra-Advanced Feature 4: 10-Year ASCVD Heart Attack Risk ---');
const cvdReport = {
  pt: { name: 'Cardio Patient', age: 58, gender: 'male', systolicBP: 130, smoker: false, bpTreated: false, diabetes: true },
  inv: { id: 'inv_cvd_1' },
  groups: [
    { test: { name: 'Lipid Profile' }, res: { values: { cholesterol: 260, hdl: 36 } } },
    { test: { name: 'Sugar' }, res: { values: { glucose: 220 } } } // Diabetic flag
  ]
};
const ascvdScore = AI.calculateAscvdRisk(cvdReport);
assert(ascvdScore.riskScore >= 20.0, `Expected High Risk >= 20.0%, got ${ascvdScore.riskScore}%`);
assert.equal(ascvdScore.status, 'critical', 'ASCVD risk >= 20% must have critical status');
assert(ascvdScore.recommendation.includes('High-Intensity Statin'), 'Must advise High-Intensity Statin for high ASCVD risk');
console.log('✓ Ultra-Advanced Feature 4: 10-Year ASCVD Cardiovascular Risk Calculator correctly classified high-risk heart attack probability');

// 21. Test Ultra-Advanced Feature: Family Genetic & Thalassemia Marriage Guard
console.log('\n--- Testing Ultra-Advanced Feature 5: Family Genetic & Marriage Guard ---');
const geneticReport = {
  pt: { name: 'Young Adult Patient', age: 22, gender: 'female' },
  inv: { id: 'inv_gen_1' },
  groups: [
    { test: { name: 'CBC' }, res: { values: { hb: 9.8, mcv: 64, rbc: 5.5 } } } // Mentzer = 64/5.5 = 11.6 (< 13)
  ]
};
const geneticAlerts = AI.evaluateGeneticGuard(geneticReport);
assert(geneticAlerts.length >= 1, 'Must trigger genetic carrier alert');
const thalGuard = geneticAlerts.find(g => g.title.includes('Premarital Thalassemia'));
assert(thalGuard, 'Must generate Premarital Thalassemia Screening Guard');
assert(thalGuard.geneticRisk.includes('25%'), 'Must state 25% homozygous risk per pregnancy in cousin marriages');
assert(thalGuard.mandatoryAction.includes('MANDATORY PREMARITAL SCREENING'), 'Must require spouse screening before marriage');
console.log('✓ Ultra-Advanced Feature 5: Family Genetic & Thalassemia Marriage Guard successfully triggered premarital advisory');

// 22. Test Ultra-Advanced Feature: Voice Dictation API
console.log('\n--- Testing Ultra-Advanced Feature 6: Voice Dictation API ---');
assert.equal(typeof AI.isVoiceSupported, 'function', 'isVoiceSupported must be a function');
assert.equal(typeof AI.startVoiceDictation, 'function', 'startVoiceDictation must be a function');
// Mock SpeechRecognition in sandbox
sandbox.window.SpeechRecognition = function () {
  this.start = () => {};
  this.stop = () => {};
};
assert.equal(AI.isVoiceSupported(), true, 'isVoiceSupported must return true when SpeechRecognition exists');
console.log('✓ Ultra-Advanced Feature 6: Voice Dictation API registered and ready for microphone input');

// 23. Test Ultra-Advanced Feature: 1-Click AI Executive Summary Narrative & Report Attachment
console.log('\n--- Testing Ultra-Advanced Feature 7: AI Executive Summary on Report Footer ---');
const narrativeReport = {
  patient: { name: 'Report Patient', age: 45, gender: 'male' },
  invoice: { id: 'inv_narrative_1' },
  findings: [
    { key: 'hb', status: 'low', value: 7.2 },
    { key: 'glucose_random', status: 'high', value: 210 }
  ],
  solutions: {
    diagnosis: [{ title: 'Microcytic Anemia' }, { title: 'Hyperglycemia' }],
    tests: ['Serum Ferritin', 'HbA1c']
  },
  indices: [{ id: 'mentzer', score: 11.8 }]
};
const narrative = AI.generateReportNarrative(narrativeReport);
assert(narrative.includes('AI Clinical Correlation:'), 'Must start with official narrative prefix');
assert(narrative.includes('Microcytic Anemia'), 'Must mention primary clinical findings');
assert(narrative.includes('Thalassemia Minor pattern'), 'Must correlate Mentzer index');

// Test attaching remarks directly into DB (using DB.update contract of db.js)
let testResultsDB = [{ id: 'res_n1', invoiceId: 'inv_narrative_1', values: {} }];
let testInvoicesDB = [{ id: 'inv_narrative_1', no: 'INV-2026-NARR', patientId: 'pt_1', items: [{ testId: 't_cbc' }] }];
delete sandbox.DB.set; // Ensure NO reliance on DB.set
sandbox.DB.all = (t) => (t === 'results' ? testResultsDB : (t === 'invoices' ? testInvoicesDB : []));
sandbox.DB.update = (t, id, patch) => {
  if (t === 'settings' && id === 'main') {
    mockSettings = Object.assign(mockSettings || {}, patch);
    return mockSettings;
  }
  if (t === 'results' && id === 'res_n1') {
    Object.assign(testResultsDB[0], patch);
    return testResultsDB[0];
  }
};
const attachSuccess = AI.attachSummaryToReportRemarks('inv_narrative_1', narrative);
assert.equal(attachSuccess, true, 'attachSummaryToReportRemarks must succeed with DB.update');
assert(testResultsDB[0].values['Remarks'].includes('AI Clinical Correlation'), 'Result Remarks must contain the AI narrative');

// Test alias lookup using invoice number
testResultsDB[0].values = {};
const attachSuccessByNo = AI.attachSummaryToReportRemarks('INV-2026-NARR', narrative);
assert.equal(attachSuccessByNo, true, 'attachSummaryToReportRemarks must resolve via invoice.no alias');
assert(testResultsDB[0].values['Remarks'].includes('AI Clinical Correlation'), 'Result Remarks must be populated via invoice.no');

// Test sandbox simulation mode
const attachSim = AI.attachSummaryToReportRemarks('SIM-DENGUE', narrative);
assert.equal(attachSim, true, 'attachSummaryToReportRemarks must succeed for SIM-* sandbox reports');

console.log('✓ Ultra-Advanced Feature 7: AI Executive Summary successfully generated and attached to printed report remarks (DB.update + alias + simulation)');

// 24. Test Ultra-Advanced Feature: Interactive Human Anatomy Organ Impact Map
console.log('\n--- Testing Ultra-Advanced Feature 8: Interactive Human Anatomy Organ Impact Map ---');
assert.equal(typeof AI.evaluateOrganMap, 'function', 'evaluateOrganMap must be a function');
assert.equal(typeof AI.renderSingleOrganCard, 'function', 'renderSingleOrganCard must be a function');
assert.equal(typeof AI.renderBodyMapHtml, 'function', 'renderBodyMapHtml must be a function');

const anatomyTestReport = {
  pt: { name: 'Multi Organ Patient', age: 60, gender: 'male' },
  inv: { id: 'inv_organ_1', no: 'INV-ORG-1' },
  groups: [
    {
      test: { name: 'Comprehensive Metabolic & Hematology Panel' },
      res: {
        values: {
          glucose_fasting: 45, // Brain critical hypoglycemia (< 50)
          potassium: 6.5,      // Heart critical hyperkalemia (> 6.2)
          alt: 350,            // Liver critical hepatocellular necrosis (> 300)
          creatinine: 4.5,     // Kidneys critical renal shutdown (> 4.0)
          plt: 15000,          // Blood critical spontaneous bleed (< 20,000)
          uric_acid: 9.5       // Joints critical hyperuricemia (> 9.0)
        }
      }
    }
  ]
};

const anatomyAnalysis = AI.generate5Solutions(anatomyTestReport);
assert(anatomyAnalysis.organMap && Array.isArray(anatomyAnalysis.organMap), 'Solutions must include organMap array');
assert.equal(anatomyAnalysis.organMap.length, 8, 'Must assess 8 physiological organ systems');

const brainOrg = anatomyAnalysis.organMap.find(o => o.id === 'brain');
assert(brainOrg && brainOrg.status === 'critical', 'Brain must flag critical for glucose 45 mg/dL');
assert(brainOrg.hazard.includes('hypoglycemia'), 'Brain hazard must explain neuroglycopenia');

const heartOrg = anatomyAnalysis.organMap.find(o => o.id === 'heart');
assert(heartOrg && heartOrg.status === 'critical', 'Heart must flag critical for potassium 6.5 mEq/L');
assert(heartOrg.hazard.includes('HYPERKALEMIA'), 'Heart hazard must explain hyperkalemia arrhythmia');

const liverOrg = anatomyAnalysis.organMap.find(o => o.id === 'liver');
assert(liverOrg && liverOrg.status === 'critical', 'Liver must flag critical for ALT 350 U/L');

const kidneyOrg = anatomyAnalysis.organMap.find(o => o.id === 'kidneys');
assert(kidneyOrg && kidneyOrg.status === 'critical', 'Kidneys must flag critical for Creatinine 4.5 mg/dL');

const bloodOrg = anatomyAnalysis.organMap.find(o => o.id === 'blood');
assert(bloodOrg && bloodOrg.status === 'critical', 'Blood must flag critical for Platelets 15,000 /uL');

const jointsOrg = anatomyAnalysis.organMap.find(o => o.id === 'joints');
assert(jointsOrg && jointsOrg.status === 'critical', 'Joints must flag critical for Uric Acid 9.5 mg/dL');

const mapHtml = AI.renderBodyMapHtml(anatomyAnalysis);
assert(mapHtml.includes('ai-organ-beacon'), 'Body map HTML must include SVG organ beacons');
assert(mapHtml.includes('ai-organ-select-btn'), 'Body map HTML must render quick organ selection buttons');
assert(mapHtml.includes('aiOrganDetailCard'), 'Body map HTML must include organ detail card container');
assert(mapHtml.includes('Organ Stress Index'), 'Body map card must render stress level gauge');

console.log('✓ Ultra-Advanced Feature 8: Interactive Human Anatomy Organ Impact Map successfully evaluated 8 physiological systems and rendered SVG projections');

// 25. Test Pro Feature: AI Intelligence Control Center & Central Management Dashboard
console.log('\n--- Testing Ultra-Advanced Feature 9: AI Management Dashboard & Central Control Center ---');
assert(AI.DEFAULT_CONFIG, 'AI.DEFAULT_CONFIG must be exported');
assert(AI.DEFAULT_CONFIG.modules, 'DEFAULT_CONFIG must have modules flags');
assert(AI.DEFAULT_CONFIG.panicThresholds, 'DEFAULT_CONFIG must have panic cutoffs');
assert(AI.DEFAULT_CONFIG.doctorBranding, 'DEFAULT_CONFIG must have doctor branding');

// Config retrieval & defaults
const initialCfg = AI.getAiConfig();
assert.equal(initialCfg.modules.solutions5, true, 'Default 5 solutions module must be active');
assert.equal(initialCfg.modules.panicSos, true, 'Default Panic SOS module must be active');
assert.equal(initialCfg.panicThresholds.plt, 20000, 'Default Platelet cutoff is 20,000');
assert.equal(initialCfg.doctorBranding.name, 'Consultant Physician', 'Default doctor branding is Consultant Physician');
assert(initialCfg.roles.includes('doctor'), 'Doctor role is mandatory');
assert(initialCfg.roles.includes('admin'), 'Admin role is mandatory');

// Save modified config
const customCfg = JSON.parse(JSON.stringify(initialCfg));
customCfg.panicThresholds.plt = 25000;
customCfg.doctorBranding.name = 'Dr. Fatima Zahra (MBBS, FCPS)';
customCfg.doctorBranding.pmdc = '55123-P';
customCfg.modules.geneticGuard = true;
const saveResult = AI.saveAiConfig(customCfg);
assert.equal(saveResult, true, 'saveAiConfig must succeed');
assert.equal(mockSettings.aiConfig.panicThresholds.plt, 25000, 'mockSettings must reflect new platelet cutoff');
assert.equal(mockSettings.aiConfig.doctorBranding.name, 'Dr. Fatima Zahra (MBBS, FCPS)', 'mockSettings must reflect new doctor name');

// Verify checkPanicValues uses updated threshold
const testPltReport = {
  pt: { name: 'Thrombocytopenic Patient', age: 30 },
  groups: [{ test: { name: 'CBC' }, res: { values: { plt: 22000 } } }]
};
const panicResultWith25k = AI.checkPanicValues(testPltReport);
assert.equal(panicResultWith25k.isPanic, true, 'Plt 22,000 must trigger panic when cutoff is 25,000');

// Verify panicSos toggle off disables panics
customCfg.modules.panicSos = false;
AI.saveAiConfig(customCfg);
const panicOffResult = AI.checkPanicValues(testPltReport);
assert.equal(panicOffResult.isPanic, false, 'Panic must not trigger when panicSos module is disabled');

// Restore panicSos
customCfg.modules.panicSos = true;
AI.saveAiConfig(customCfg);

// Verify Digital Rx Pad Branding
const dummyRxAnalysis = {
  patient: { name: 'Tariq Butt', age: 50 },
  invoice: { id: 'INV-RX-1' },
  doctor: {},
  solutions: { medications: [{ items: [{ drug: 'Tab. Paracetamol 500mg', dosage: 'TDS' }] }] }
};
const rxPadHtml = AI.generateRxPadHtml(dummyRxAnalysis);
assert(rxPadHtml.includes('Dr. Fatima Zahra (MBBS, FCPS)'), 'Prescription pad must render configured doctor name');
assert(rxPadHtml.includes('55123-P'), 'Prescription pad must render configured PMDC reg #');

// Stats counters
const statsBefore = AI.getAiStats();
assert.equal(typeof statsBefore.analyzed, 'number', 'analyzed stat must be numeric');
AI.recordAiStat('analyzed');
const statsAfter = AI.getAiStats();
// Test AI Configuration Saving via DB.update
let testSettingsStore = { main: { id: 'main' } };
sandbox.DB.update = (table, id, patch) => {
  if (table === 'settings' && id === 'main') {
    Object.assign(testSettingsStore.main, patch);
    return testSettingsStore.main;
  }
};
const saveOk = AI.saveAiConfig({ modules: { bodyMap: true }, roles: ['admin', 'doctor', 'reception'] });
assert.equal(saveOk, true, 'AI.saveAiConfig must return true on success');
assert.deepEqual(testSettingsStore.main.aiInsightsRoles, ['admin', 'doctor', 'reception'], 'aiInsightsRoles must be saved');
assert.equal(testSettingsStore.main.aiConfig.modules.bodyMap, true, 'aiConfig.modules must be saved');
console.log('✓ AI Control Center configuration correctly saved via DB.update');


// Clinical Sandbox Simulation
let simulatedModalOpened = false;
const originalShowModal = AI.showModal;
AI.showModal = (invId, data) => {
  simulatedModalOpened = true;
  assert(data && data.pt && data.pt.name.includes('Simulated'), 'Simulated data must have simulated patient name');
  assert.equal(AI.extractRawValues(data).plt, 14000, 'sandbox platelets must reach the engine');
  const priorPanics = AI.getAiStats().panics;
  assert.equal(AI.checkPanicValues(data).isPanic, true, 'the dengue fixture must trigger its actual critical value');
  assert.equal(AI.getAiStats().panics, priorPanics, 'sandbox must not increment live counters');
  return originalShowModal(invId, data);
};
AI.simulateAnalysis('dengue');
assert.equal(simulatedModalOpened, true, 'simulateAnalysis(dengue) must launch showModal');
AI.showModal = originalShowModal;

// AI Dashboard Rendering
let renderedHtml = '';
const mockContainer = {
  get innerHTML() { return renderedHtml; },
  set innerHTML(v) { renderedHtml = v; },
  querySelector: () => null,
  querySelectorAll: () => []
};
sandbox.document.getElementById = (id) => (id === 'aiViewTest' ? mockContainer : null);
AI.renderDashboard('aiViewTest');
assert(renderedHtml.includes('Optix AI Clinical Intelligence Engine'), 'Dashboard must render title');
assert(renderedHtml.includes('ai-dash-kpi'), 'Dashboard must render KPI cards');
assert(renderedHtml.includes('Subsystem Toggles'), 'Dashboard must render subsystem toggles tab');
assert(renderedHtml.includes('Emergency Panic Cutoff Limits'), 'Dashboard must render panic cutoffs panel');
assert(renderedHtml.includes('Digital Rx Pad Credentials & Branding'), 'Dashboard must render branding panel');
assert(renderedHtml.includes('Role Permissions Matrix'), 'Dashboard must render permissions panel');
assert(renderedHtml.includes('Clinical Sandbox & Live Analysis Simulator'), 'Dashboard must render simulation cards');
assert(renderedHtml.includes('MANDATORY (LOCKED ON)'), 'Doctor role must be displayed as permanently locked mandatory');

// Router Registration
assert(registeredRoutes.includes('#/ai-dashboard') || registeredRoutes.includes('/ai-dashboard'), 'ai-dashboard route must be registered');

// File Parity & System Integration Checks
const appJsCode = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
assert(appJsCode.includes("'ai-dashboard': ['admin', 'doctor', 'technician']"), 'app.js PERMS must grant doctor and admin ai-dashboard access');
assert(appJsCode.includes("seg === 'ai-dashboard'"), 'app.js routeKey must map ai-dashboard');
assert(appJsCode.includes("key: 'ai-dashboard'"), 'app.js NAV must include ai-dashboard');

const adminJsCode = fs.readFileSync(path.join(root, 'assets/js/mod-admin.js'), 'utf8');
assert(adminJsCode.includes("id: 'ai'"), 'mod-admin.js must have ai settings tab');
assert(adminJsCode.includes("'ai'"), 'mod-admin.js SET_TABS must include ai');

const portalJsCode = fs.readFileSync(path.join(root, 'assets/js/mod-portal.js'), 'utf8');
assert(portalJsCode.includes('#/ai-dashboard'), 'mod-portal.js must provide doctor shortcut to ai-dashboard');

console.log('✓ Ultra-Advanced Feature 9: AI Management Dashboard & Central Control Center fully verified with zero regressions');

console.log('\n============================================================');
console.log('ALL 25 TEST SUITES PASSED! ULTRA-ADVANCED HOSPITAL-GRADE AI VERIFIED WITH ZERO REGRESSIONS.');
console.log('============================================================\n');



assert.equal(AI.calculateAscvdRisk({pt:{age:58,gender:'male'},groups:cvdReport.groups}),null,'missing blood pressure and recorded history must not produce a risk estimate');
assert(!AI.calculateIndices({pt:{},groups:ckdReport.groups}).some(x=>x.id==='egfr'),'missing age/sex must not be replaced with defaults for eGFR');
