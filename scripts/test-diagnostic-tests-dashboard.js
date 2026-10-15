'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('--- Testing Dedicated Diagnostic Tests Dashboard ---');

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
      if (table === 'tests' && id === 't_lft') {
        return {
          id: 't_lft',
          code: 'LFT-01',
          name: 'Liver Function Test (LFT)',
          category: 'Biochemistry',
          sampleType: 'Serum Clot',
          params: [
            { id: 'alt', name: 'ALT / SGPT', unit: 'U/L', ref: '10-40' }
          ]
        };
      }
      if (table === 'invoices' && id === 'inv_101') {
        return {
          id: 'inv_101',
          no: 'INV-2026-101',
          patientId: 'p_test',
          doctorId: 'doc_1',
          total: 2500,
          due: 0,
          paid: 2500,
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
            items: [
              { testId: 't_cbc', price: 1200 },
              { testId: 't_lft', price: 1300 }
            ]
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
            remarks: 'Mild anemia detected.',
            values: {
              hb: '10.5',
              tlc: '7500'
            }
          },
          {
            id: 'res_2',
            invoiceId: 'inv_101',
            testId: 't_lft',
            status: 'ready',
            reportedBy: 'Dr. Asad Pathologist',
            reportedAt: '2026-10-15T11:30:00.000Z',
            remarks: 'Normal hepatic profile.',
            values: {
              alt: '25'
            }
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

// 1. Verify App.patientDashboard.renderDiagnosticTestsPage is exported
assert.equal(typeof sandbox.App.patientDashboard.renderDiagnosticTestsPage, 'function', 'renderDiagnosticTestsPage must be exported');
console.log('✓ App.patientDashboard.renderDiagnosticTestsPage is exported');

// 2. Render Patient Dashboard HTML
const patient = { id: 'p_test', name: 'Ahmad Khan', age: 34, gender: 'Male' };
const html = sandbox.App.patientDashboard.render(patient);

// 3. Verify Navigation Button for pdTests
assert.ok(html.includes('data-pd-section="pdTests"'), 'Navigation button for pdTests must exist');
assert.ok(html.includes('Diagnostic Laboratory Tests &amp; Parameters') || html.includes('Diagnostic Laboratory Tests & Parameters'), 'pdTests nav title must exist');
assert.ok(html.includes('🧪'), 'pdTests icon must be 🧪');
console.log('✓ Navigation button for Diagnostic Tests is present with icon 🧪');

// 4. Verify Dedicated #pdTests Container
assert.ok(html.includes('id="pdTests"'), 'Dedicated #pdTests container must be present');
assert.ok(html.includes('class="pd-layout-tests"'), 'pd-layout-tests class must be applied');
assert.ok(html.includes('Patient Diagnostic Laboratory Tests &amp; Clinical Parameters') || html.includes('Patient Diagnostic Laboratory Tests & Clinical Parameters'), 'Dashboard heading must be present');
console.log('✓ Dedicated #pdTests container verified');

// 5. Verify 4 KPI Cards
assert.ok(html.includes('data-pd-tests-kpi="all"'), 'KPI card for total tests must exist');
assert.ok(html.includes('data-pd-tests-kpi="normal"'), 'KPI card for normal tests must exist');
assert.ok(html.includes('data-pd-tests-kpi="abnormal"'), 'KPI card for abnormal tests must exist');
assert.ok(html.includes('data-pd-tests-kpi="pending"'), 'KPI card for pending tests must exist');
console.log('✓ 4 Diagnostic KPI summary cards verified');

// 6. Verify Search Input and Filter Chips
assert.ok(html.includes('id="pdTestsSearchInput"'), 'Search input #pdTestsSearchInput must exist');
assert.ok(html.includes('data-filter="all"'), 'Filter chip for all must exist');
assert.ok(html.includes('data-filter="normal"'), 'Filter chip for normal must exist');
assert.ok(html.includes('data-filter="abnormal"'), 'Filter chip for abnormal must exist');
assert.ok(html.includes('data-filter="pending"'), 'Filter chip for pending must exist');
console.log('✓ Search input and status filter chips verified');

// 7. Verify Diagnostic Test Cards and Actions
assert.ok(html.includes('Complete Blood Count (CBC)'), 'CBC test must be rendered');
assert.ok(html.includes('Liver Function Test (LFT)'), 'LFT test must be rendered');
assert.ok(html.includes('pd-test-btn-details'), 'View Details & Parameters button must exist');
assert.ok(html.includes('pd-test-btn-print'), 'Print button on card must exist');
assert.ok(html.includes('pd-test-btn-pdf'), 'PDF button on card must exist');
assert.ok(html.includes('pd-test-btn-ai'), 'AI insights button on card must exist');
console.log('✓ Test cards and action buttons verified');

// 8. Verify Diagnostic Tests card is cleanly removed from Overview per user request
assert.ok(!html.includes('id="pdDiagnosticTestsCard"'), 'Diagnostic Tests card must not be in Overview');
assert.ok(!html.includes('Patient previous laboratory tests &amp; order history') && !html.includes('Patient previous laboratory tests & order history'), 'Overview must not contain old test history list');
console.log('✓ Diagnostic Tests card cleanly removed from Patient Overview');

console.log('============================================================');
console.log('ALL DEDICATED DIAGNOSTIC TESTS DASHBOARD TESTS PASSED CLEANLY!');
console.log('============================================================');
