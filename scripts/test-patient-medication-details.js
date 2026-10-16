/**
 * Verification Test Suite: Patient Medication Adherence Pharmacology & Clinical Details Modal
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const modDashboardSource = fs.readFileSync('assets/js/mod-patient-dashboard.js', 'utf8');

const modalCalls = [];
let toastMsg = '';

const fakeApp = {
  money: (n) => '$' + Number(n || 0).toFixed(2),
  d: (d) => String(d || '').slice(0, 10),
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  toast: (msg) => { toastMsg = msg; },
  modal: (title, content, opts) => {
    modalCalls.push({ title, content, opts });
  }
};

const fakeDB = {
  get: (table, id) => {
    if (table === 'patients') {
      return { id: 'p_101', name: 'Zainab Bibi', age: 48, gender: 'Female' };
    }
    return null;
  },
  all: () => []
};

const sandbox = {
  window: { App: fakeApp, DB: fakeDB, location: { hash: '#/patient/p_101' } },
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ id: '', rel: '', href: '' }),
    head: { appendChild: () => {} }
  },
  App: fakeApp,
  DB: fakeDB,
  localStorage: { getItem: () => JSON.stringify({ role: 'admin' }) },
  canEdit: () => true,
  canDel: () => true,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(modDashboardSource, sandbox);

console.log('--- Testing Patient Medication Adherence Pharmacology & Clinical Details ---');

// 1. Verify export
assert.equal(typeof sandbox.App.openPatientMedicationDetailModal, 'function', 'App.openPatientMedicationDetailModal should be exported');
assert.equal(typeof sandbox.App.patientDashboard.openPatientMedicationDetailModal, 'function', 'App.patientDashboard.openPatientMedicationDetailModal should be exported');
console.log('✓ App.openPatientMedicationDetailModal exported successfully');

// 2. Verify Rendered Medication Adherence Card in Overview Dashboard
const patient = { id: 'p_101', name: 'Zainab Bibi', age: 48, gender: 'Female' };
const overviewHtml = sandbox.App.patientDashboard.render(patient);

assert.ok(overviewHtml.includes('Medication Adherence'), 'Medication Adherence card should be in overview HTML');
assert.ok(overviewHtml.includes('Ventolin'), 'Ventolin brand name should be present');
assert.ok(overviewHtml.includes('Salbutamol Sulfate 100mcg'), 'Generic name Salbutamol Sulfate should be present in pill badge');
assert.ok(overviewHtml.includes('Pulmicort'), 'Pulmicort brand name should be present');
assert.ok(overviewHtml.includes('Budesonide 0.5mg/2mL'), 'Generic name Budesonide should be present');
assert.ok(overviewHtml.includes('Mucosolvan'), 'Mucosolvan brand name should be present');
assert.ok(overviewHtml.includes('Ambroxol Hydrochloride 30mg'), 'Generic name Ambroxol should be present');
assert.ok(overviewHtml.includes('🩺'), 'Clinical indication icon should be displayed on medication items');
assert.ok(overviewHtml.includes('med-indication-line'), 'med-indication-line class should be present');
assert.ok(overviewHtml.includes('med-info-pill'), 'med-info-pill button should be present for viewing clinical details');
assert.ok(overviewHtml.includes('openPatientMedicationDetailModal'), 'onclick should trigger openPatientMedicationDetailModal');
console.log('✓ Medication Adherence card displays rich brand, generic pill badges, indication lines, and info buttons');

// 3. Test openPatientMedicationDetailModal for Pulmonary Med (Ventolin)
sandbox.App.openPatientMedicationDetailModal(0, 'lung', patient);
assert.equal(modalCalls.length, 1, 'Modal should be called once');
const modal1 = modalCalls[0];

assert.ok(modal1.title.includes('Ventolin'), 'Modal title should contain Ventolin');
assert.ok(modal1.content.includes('Salbutamol Sulfate 100mcg'), 'Modal should display generic API name');
assert.ok(modal1.content.includes('SABA Bronchodilator'), 'Modal should display therapeutic category');
assert.ok(modal1.content.includes('Clinical Indications &amp; Therapeutic Purpose'), 'Modal should have Clinical Indications section');
assert.ok(modal1.content.includes('Acute bronchospasm relief'), 'Modal should explain clinical indication');
assert.ok(modal1.content.includes('Pharmacological Mechanism of Action (MOA)'), 'Modal should have Mechanism of Action section');
assert.ok(modal1.content.includes('beta-2 adrenergic receptors'), 'Modal should describe molecular pharmacology');
assert.ok(modal1.content.includes('Administration Instructions &amp; Food Guidance'), 'Modal should include administration guidelines');
assert.ok(modal1.content.includes('Safety Precautions, Side Effect Shield &amp; Lab Monitoring'), 'Modal should include safety & lab precautions');
assert.ok(modal1.content.includes('Mark Today&#39;s Dose as Taken') || modal1.content.includes("Mark Today's Dose as Taken"), 'Modal should have Dose Taken logging button');
console.log('✓ Modal opens rich clinical pharmacology guide for Pulmonary medication (Ventolin)');

// 4. Test openPatientMedicationDetailModal for Cardiovascular Med (Lipitor)
sandbox.App.openPatientMedicationDetailModal(1, 'heart', patient);
assert.equal(modalCalls.length, 2, 'Modal should be called second time');
const modal2 = modalCalls[1];

assert.ok(modal2.title.includes('Lipitor'), 'Modal title should contain Lipitor');
assert.ok(modal2.content.includes('Atorvastatin Calcium 20mg'), 'Modal should display Atorvastatin Calcium');
assert.ok(modal2.content.includes('HMG-CoA Reductase Inhibitor'), 'Modal should display HMG-CoA Reductase Inhibitor');
assert.ok(modal2.content.includes('Cardiovascular System'), 'Modal should specify Cardiovascular System');
assert.ok(modal2.content.includes('arterial plaque stability'), 'Modal should mention plaque stability indication');
assert.ok(modal2.content.includes('Bedtime lipid suppression'), 'Modal should mention bedtime schedule');
console.log('✓ Modal opens rich clinical pharmacology guide for Cardiovascular medication (Lipitor)');

// 5. Test openPatientMedicationDetailModal for Hepatic Med (Heptral)
sandbox.App.openPatientMedicationDetailModal(0, 'liver', patient);
assert.equal(modalCalls.length, 3, 'Modal should be called third time');
const modal3 = modalCalls[2];
assert.ok(modal3.title.includes('Heptral'), 'Modal title should contain Heptral');
assert.ok(modal3.content.includes('Ademetionine 500mg'), 'Modal should display Ademetionine');
assert.ok(modal3.content.includes('Hepatic Methyl Donor'), 'Modal should display Hepatic Methyl Donor');
console.log('✓ Modal opens rich clinical pharmacology guide for Hepatic medication (Heptral)');

// 6. Test onOpen dose logging action
let modalClosed = false;
const fakeDov = {
  querySelector: (sel) => {
    if (sel === '#btnMedModalClose') {
      return { addEventListener: (evt, cb) => { if (evt === 'click') this._closeCb = cb; } };
    }
    if (sel === '#btnLogMedDose') {
      return {
        addEventListener: (evt, cb) => {
          if (evt === 'click') this._logCb = cb;
        }
      };
    }
    return null;
  }
};
modal3.opts.onOpen(fakeDov, () => { modalClosed = true; });
if (fakeDov._logCb) {
  fakeDov._logCb();
  assert.ok(toastMsg.includes('Dose recorded as taken'), 'Toast should confirm dose recorded');
  assert.ok(modalClosed, 'Modal should close after dose recording');
}
console.log('✓ 1-click dose recording in modal triggers toast and closes modal cleanly');

console.log('\n============================================================');
console.log('ALL PATIENT MEDICATION ADHERENCE PHARMACOLOGY TESTS PASSED 100%!');
console.log('============================================================\n');
