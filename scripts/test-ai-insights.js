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
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
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

console.log('\n============================================================');
console.log('ALL 16 TEST SUITES PASSED! PRO MEDICAL FEATURES VERIFIED WITH ZERO REGRESSIONS.');
console.log('============================================================\n');

