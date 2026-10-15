'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const targetFiles = [
  'assets/js/mod-results.js',
  'electron-src/assets/js/mod-results.js',
  'electron-tools/installer/app-stage-win7/assets/js/mod-results.js'
];

console.log('--- Testing Old Reports Patient History Click & Modal Integration ---');

targetFiles.forEach(fileRel => {
  const code = fs.readFileSync(path.join(root, fileRel), 'utf8');

  // Verify markup and function presence
  assert.ok(code.includes('data-opat='), fileRel + ' must have data-opat attribute on patient name link');
  assert.ok(code.includes('function openPatientOldReports('), fileRel + ' must define openPatientOldReports function');
  assert.ok(code.includes('App.openPatientOldReports = openPatientOldReports;'), fileRel + ' must expose App.openPatientOldReports');
  assert.ok(code.includes('📋 History'), fileRel + ' must include History badge for patient link');

  // Execution simulation in VM
  const routes = {};
  let openedModal = null;
  const mockDB = {
    all: function (tbl) {
      if (tbl === 'doctors') return [{ id: 'doc1', name: 'Dr. Sarah Khan' }];
      if (tbl === 'settings') return [{ id: 'main', labName: 'Test Lab' }];
      if (tbl === 'results') {
        return [
          { id: 'res1', invoiceId: 'inv1', testId: 't1', status: 'ready', reportedAt: '2026-10-10 10:00:00' },
          { id: 'res2', invoiceId: 'inv2', testId: 't2', status: 'ready', reportedAt: '2026-10-12 11:00:00' },
          { id: 'res3', invoiceId: 'inv3', testId: 't1', status: 'ready', reportedAt: '2026-10-14 12:00:00' }
        ];
      }
      if (tbl === 'invoices') {
        return [
          { id: 'inv1', no: 'INV-101', patientId: 'p1', doctorId: 'doc1', createdAt: '2026-10-10', items: [{ testId: 't1' }], due: 0 },
          { id: 'inv2', no: 'INV-102', patientId: 'p1', doctorId: 'doc1', createdAt: '2026-10-12', items: [{ testId: 't2' }], due: 500 },
          { id: 'inv3', no: 'INV-103', patientId: 'p2', doctorId: 'doc1', createdAt: '2026-10-14', items: [{ testId: 't1' }], due: 0 }
        ];
      }
      if (tbl === 'patients') {
        return [
          { id: 'p1', name: 'Ahmad Raza', age: 35, gender: 'Male', phone: '03001234567' },
          { id: 'p2', name: 'Fatima Bibi', age: 28, gender: 'Female', phone: '03119876543' }
        ];
      }
      if (tbl === 'tests') {
        return [
          { id: 't1', name: 'Complete Blood Count (CBC)' },
          { id: 't2', name: 'Liver Function Tests (LFT)' }
        ];
      }
      return [];
    },
    get: function (tbl, id) {
      return (mockDB.all(tbl) || []).find(x => x.id === id) || null;
    }
  };

  const mockView = {
    innerHTML: '',
    querySelectorAll: function (sel) {
      if (sel === '[data-opat]') {
        return [{
          getAttribute: () => 'inv1',
          addEventListener: () => {}
        }];
      }
      return [];
    }
  };

  const sandbox = {
    window: {},
    console: console,
    DB: mockDB,
    document: {
      getElementById: (id) => id === 'view' ? mockView : null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    setTimeout: (fn) => fn(),
    App: {
      route: (r, fn) => { routes[r] = fn; },
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      d: (s) => s || '',
      dt: (s) => s || '',
      money: (n) => 'Rs ' + n,
      today: () => '2026-10-15',
      visitNos: (inv) => ({ labText: 'LAB # ' + (inv.no || inv.id), caseText: 'CASE # ' + (inv.no || inv.id) }),
      modal: (title, html, opts) => {
        openedModal = { title, html, opts };
        return () => {};
      },
      toast: () => {},
      confirm: () => Promise.resolve(true),
      nav: () => {}
    }
  };
  sandbox.window = sandbox;

  vm.runInNewContext(code, sandbox);

  // Check route registration
  assert.ok(typeof routes['#/results/old'] === 'function', 'Old Reports route must be registered');
  routes['#/results/old']();

  assert.ok(mockView.innerHTML.includes('data-opat="inv1"'), 'Old reports table must render data-opat for inv1');
  assert.ok(mockView.innerHTML.includes('Ahmad Raza'), 'Old reports table must display patient name Ahmad Raza');
  assert.ok(mockView.innerHTML.includes('History'), 'Old reports table must display History badge');

  // Trigger openPatientOldReports
  assert.ok(typeof sandbox.App.openPatientOldReports === 'function', 'App.openPatientOldReports must be callable');
  sandbox.App.openPatientOldReports('inv1');

  assert.ok(openedModal, 'openPatientOldReports must open a modal');
  assert.ok(openedModal.title.includes('Ahmad Raza'), 'Modal title must include patient name: ' + openedModal.title);
  assert.ok(openedModal.html.includes('2 Finished Reports') || openedModal.html.includes('2 Finished Report'), 'Modal must report both finished reports for Ahmad Raza');
  assert.ok(openedModal.html.includes('INV-101') && openedModal.html.includes('INV-102'), 'Modal must include both INV-101 and INV-102');
  assert.ok(!openedModal.html.includes('INV-103'), 'Modal must NOT include Fatima Bibi report INV-103');
  assert.ok(openedModal.html.includes('data-porview='), 'Modal must include View report action button');
  assert.ok(openedModal.html.includes('data-porprint='), 'Modal must include Print report action button');
  assert.ok(openedModal.html.includes('data-pordl='), 'Modal must include Download PDF action button');
  assert.ok(openedModal.html.includes('data-poredit='), 'Modal must include Edit report action button');
  assert.ok(openedModal.html.includes('id="porFilterMain"'), 'Modal must provide Filter Page button');
  assert.ok(openedModal.html.includes('id="porOpenProfile"'), 'Modal must provide Patient Profile button');
  assert.ok(openedModal.html.includes('id="porBulkShare"'), 'Modal must provide Bulk Share Reports button at the top');
  assert.ok(openedModal.html.includes('id="porSelectAll"'), 'Modal must provide Select All checkbox in table header');
  assert.ok(openedModal.html.includes('class="porRowCheck"'), 'Modal must provide selection checkboxes in table rows');
  assert.ok(code.includes('function openBulkShareModal('), 'Code must define openBulkShareModal');

  console.log('✓ ' + fileRel + ' PASSED!');
});

console.log('============================================================');
console.log('ALL OLD REPORTS PATIENT HISTORY TESTS PASSED CLEANLY!');
console.log('============================================================');
