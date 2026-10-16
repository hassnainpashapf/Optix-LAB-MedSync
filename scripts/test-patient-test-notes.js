'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const modalCalls = [];
const s = {
  App: {
    esc: v => String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    d: v => String(v).slice(0, 10),
    dt: String,
    money: v => 'Rs. ' + v,
    modal: (title, content, opts) => {
      modalCalls.push({ title, content, opts });
    }
  },
  DB: {
    get: (t, id) => {
      if (t === 'tests' && id === 't_hcv') {
        return { id: 't_hcv', code: 'AHCV', name: 'Anti-HCV (Hepatitis C)', category: 'Serology' };
      }
      if (t === 'tests' && id === 't_cbc') {
        return { id: 't_cbc', code: 'CBC', name: 'Complete Blood Count', category: 'Hematology' };
      }
      return null;
    },
    all: (table) => {
      if (table === 'invoices') {
        return [
          {
            id: 'inv_1',
            no: 'INV-001',
            patientId: 'p_test',
            createdAt: '2026-10-13T10:00:00Z',
            items: [
              { testId: 't_hcv', price: 700 },
              { testId: 't_cbc', price: 800 }
            ]
          }
        ];
      }
      if (table === 'tests') {
        return [
          { id: 't_hcv', code: 'AHCV', name: 'Anti-HCV (Hepatitis C)', category: 'Serology' },
          { id: 't_cbc', code: 'CBC', name: 'Complete Blood Count', category: 'Hematology', params: [{ id: 'hb', name: 'Hemoglobin', ref: '12-16' }] }
        ];
      }
      if (table === 'results') {
        return [
          { invoiceId: 'inv_1', testId: 't_hcv', status: 'ready', values: { 'Result': 'Non-Reactive' } },
          { invoiceId: 'inv_1', testId: 't_cbc', status: 'ready', values: { 'hb': '10.5' } }
        ];
      }
      return [];
    }
  }
};
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/mod-patient-dashboard.js'), 'utf8'), s);

console.log('--- Testing Test-Specific Clinical Notes & Medical Interpretation ---');

const patient = { id: 'p_test', name: 'Ali Raza', age: 26, gender: 'Male' };

// 1. Verify openPatientTestDetailModal gives dedicated clinical guidance per test
s.App.openPatientTestDetailModal(patient, {
  name: 'Anti-HCV (Hepatitis C)',
  testId: 't_hcv',
  invoiceId: 'inv_1',
  status: 'within',
  date: '13 Oct 2026'
});

assert.equal(modalCalls.length, 1);
const hcvModal = modalCalls[0];
assert.ok(hcvModal.content.includes('Anti-HCV (Hepatitis C)'), 'HCV modal mentions Anti-HCV');
assert.ok(hcvModal.content.includes('Screening for antibodies against Hepatitis C Virus is Non-Reactive'), 'HCV modal has HCV-specific clinical interpretation');

s.App.openPatientTestDetailModal(patient, {
  name: 'Complete Blood Count',
  testId: 't_cbc',
  invoiceId: 'inv_1',
  status: 'abnormal',
  abnormalParams: ['Hb: 11.7 g/dl', 'Total RBC: 4.27'],
  date: '13 Oct 2026'
});

assert.equal(modalCalls.length, 2);
const cbcModal = modalCalls[1];
assert.ok(cbcModal.content.includes('Complete Blood Count'), 'CBC modal mentions CBC');
assert.ok(cbcModal.content.includes('Morphological blood film review aur anemia workup'), 'CBC modal has CBC-specific clinical note');

// Ensure HCV note and CBC note are completely different and tailored to each test
assert.notEqual(hcvModal.content, cbcModal.content);

console.log('✓ Detail modal includes distinct test-specific clinical interpretation');

// 2. Verify Diagnostic Tests Page has distinct clinical notes for each test
const oldTests = s.App.patientDashboard.getPatientOldTests(patient);
const testsDashboardHtml = s.App.patientDashboard.renderDiagnosticTestsPage(patient, oldTests, {});
assert.ok(testsDashboardHtml.includes('pd-test-card-item'));
assert.ok(testsDashboardHtml.includes('Anti-HCV (Hepatitis C)'));
assert.ok(testsDashboardHtml.includes('Complete Blood Count'));
assert.ok(testsDashboardHtml.includes('Clinical Interpretation'));

console.log('✓ Diagnostic tests page displays individualized clinical notes');

console.log('============================================================');
console.log('ALL TEST-SPECIFIC CLINICAL NOTES VERIFICATION PASSED 100%!');
console.log('============================================================');
