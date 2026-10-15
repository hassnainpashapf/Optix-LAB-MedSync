'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('--- Testing Diagnostic Tests Click & Detail Modal Integration ---');

const patientDashboardCode = fs.readFileSync(path.join(__dirname, '../assets/js/mod-patient-dashboard.js'), 'utf8');

const modalCalls = [];
const sandbox = {
  window: {},
  document: {
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => []
  },
  App: {
    esc: v => String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    d: v => String(v).slice(0, 10),
    dt: v => String(v),
    money: v => 'Rs ' + Number(v || 0).toLocaleString(),
    modal: (title, content, opts) => {
      modalCalls.push({ title, content, opts });
    },
    aiInsights: {
      showModal: () => {}
    },
    viewLabReport: () => {},
    printLabReport: () => {}
  },
  DB: {
    get: (table, id) => {
      if (table === 'tests' && id === 't_cbc') {
        return {
          id: 't_cbc',
          code: 'CBC-01',
          name: 'Complete Blood Count (CBC)',
          category: 'Hematology',
          sampleType: 'Whole Blood EDTA',
          params: [
            { id: 'hb', name: 'Hemoglobin', unit: 'g/dL', ref: '13.0-17.0' },
            { id: 'tlc', name: 'Total Leukocyte Count (TLC)', unit: '/cumm', ref: '4000-11000' }
          ]
        };
      }
      if (table === 'invoices' && id === 'inv_101') {
        return {
          id: 'inv_101',
          no: 'INV-2026-101',
          patientId: 'p_test',
          doctorId: 'doc_1',
          total: 1200,
          due: 0,
          paid: 1200,
          createdAt: '2026-10-15T10:00:00.000Z'
        };
      }
      if (table === 'doctors' && id === 'doc_1') {
        return { id: 'doc_1', name: 'Dr. Tariq Mahmood (FCPS)' };
      }
      return null;
    },
    all: (table) => {
      if (table === 'invoices') {
        return [
          {
            id: 'inv_101',
            no: 'INV-2026-101',
            patientId: 'p_test',
            doctorId: 'doc_1',
            createdAt: '2026-10-15T10:00:00.000Z',
            items: [{ testId: 't_cbc', price: 1200 }]
          }
        ];
      }
      if (table === 'results') {
        return [
          {
            id: 'res_1',
            invoiceId: 'inv_101',
            testId: 't_cbc',
            status: 'ready',
            reportedBy: 'Dr. Asad Pathologist',
            reportedAt: '2026-10-15T11:30:00.000Z',
            remarks: 'Mild anemia detected. Morphology normal.',
            values: {
              hb: '10.5',
              tlc: '7500'
            }
          }
        ];
      }
      if (table === 'tests') {
        return [
          {
            id: 't_cbc',
            code: 'CBC-01',
            name: 'Complete Blood Count (CBC)',
            category: 'Hematology',
            sampleType: 'Whole Blood EDTA',
            params: [
              { id: 'hb', name: 'Hemoglobin', unit: 'g/dL', ref: '13.0-17.0' },
              { id: 'tlc', name: 'Total Leukocyte Count (TLC)', unit: '/cumm', ref: '4000-11000' }
            ]
          }
        ];
      }
      return [];
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(patientDashboardCode, sandbox);

// 1. Check App.openPatientTestDetailModal is exported
assert.equal(typeof sandbox.App.openPatientTestDetailModal, 'function', 'App.openPatientTestDetailModal must be exported');
console.log('✓ App.openPatientTestDetailModal exported successfully');

// 2. Render Patient Dashboard HTML and verify Diagnostic Tests items
const patient = { id: 'p_test', name: 'Ahmad Khan', age: 34, gender: 'Male' };
const renderedHtml = sandbox.App.patientDashboard.render(patient);

assert(renderedHtml.includes('pd-diag-test-item'), 'Rendered dashboard must contain pd-diag-test-item class');
assert(renderedHtml.includes('data-pd-diag-idx="0"'), 'Diagnostic test item must have data-pd-diag-idx="0"');
assert(renderedHtml.includes('View Details'), 'Diagnostic test item should display View Details badge');
assert(renderedHtml.includes('Complete Blood Count (CBC)'), 'Diagnostic test item must include CBC test');
console.log('✓ Diagnostic Tests card correctly renders interactive test item with data-pd-diag-idx and badge');

// 3. Test openPatientTestDetailModal
const oldTests = sandbox.App.patientDashboard.getPatientOldTests(patient);
assert.equal(oldTests.length, 1, 'Should find 1 old test for patient');
assert.equal(oldTests[0].status, 'abnormal', 'Test should be evaluated as abnormal because Hb 10.5 is outside 13.0-17.0');

sandbox.App.openPatientTestDetailModal(patient, oldTests[0]);
assert.equal(modalCalls.length, 1, 'App.modal should be called once');
const modal = modalCalls[0];

assert(modal.title.includes('Complete Blood Count (CBC)'), 'Modal title should mention test name');
assert(modal.content.includes('Hemoglobin'), 'Modal should display biomarker Hemoglobin');
assert(modal.content.includes('10.5'), 'Modal should display value 10.5');
assert(modal.content.includes('⚠️'), 'Abnormal value should show warning emoji');
assert(modal.content.includes('13.0-17.0'), 'Modal should display normal reference range');
assert(modal.content.includes('Abnormal'), 'Modal should display Abnormal badge');
assert(modal.content.includes('Dr. Tariq Mahmood (FCPS)'), 'Modal should display referring doctor');
assert(modal.content.includes('INV-2026-101'), 'Modal should display invoice number');
assert(modal.content.includes('View Official Report (PDF)'), 'Modal should include View Official Report button');
assert(modal.content.includes('Print Report'), 'Modal should include Print Report button');
assert(modal.content.includes('Mild anemia detected'), 'Modal should include pathologist remarks');
console.log('✓ openPatientTestDetailModal opens rich clinical detail modal with all parameters and action buttons');

// 4. Test onOpen simulation of action buttons in modal
let viewReportInvoked = false;
sandbox.App.viewLabReport = (invId) => {
  assert.equal(invId, 'inv_101');
  viewReportInvoked = true;
};

const dummyElements = {};
const fakeDov = {
  querySelector: (sel) => {
    if (!dummyElements[sel]) {
      const listeners = {};
      dummyElements[sel] = {
        addEventListener: (event, handler) => {
          listeners[event] = handler;
        },
        click: () => {
          if (listeners['click']) listeners['click']();
        }
      };
    }
    return dummyElements[sel];
  }
};

let closed = false;
modal.opts.onOpen(fakeDov, () => { closed = true; });
assert(dummyElements['#ptdViewReport'], '#ptdViewReport button must be found and wired');
dummyElements['#ptdViewReport'].click();
assert.equal(viewReportInvoked, true, 'Clicking View Report must invoke App.viewLabReport(invId)');
assert.equal(closed, true, 'Clicking View Report must close the modal');
console.log('✓ Modal action buttons wired and invoke report viewer cleanly');

console.log('============================================================');
console.log('ALL DIAGNOSTIC TESTS CLICK MODAL TESTS PASSED CLEANLY!');
console.log('============================================================');
