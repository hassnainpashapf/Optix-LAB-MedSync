'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('--- Testing Patient Diagnostic Reports Tab & Typography ---');

const s = {
  App: {
    esc: v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    d: v => String(v).slice(0, 10),
    dt: v => String(v),
    money: v => 'Rs. ' + Number(v).toLocaleString(),
    visitNos: inv => ({ labText: inv.no || '#' + inv.id })
  },
  DB: {
    get: (table, id) => {
      if (table === 'doctors' && id === 'd1') return { id: 'd1', name: 'Dr. Sarah Khan' };
      if (table === 'tests' && id === 't1') return { id: 't1', name: 'Complete Blood Count (CBC)', code: 'CBC' };
      if (table === 'tests' && id === 't2') return { id: 't2', name: 'Liver Function Tests (LFT)', code: 'LFT' };
      return null;
    },
    all: table => {
      if (table === 'invoices') {
        return [
          {
            id: 'inv101',
            no: 'INV-2026-001',
            patientId: 'p1',
            doctorId: 'd1',
            createdAt: '2026-10-15T10:00:00.000Z',
            total: 2500,
            due: 0,
            items: [
              { testId: 't1', name: 'Complete Blood Count (CBC)' },
              { testId: 't2', name: 'Liver Function Tests (LFT)' }
            ]
          }
        ];
      }
      if (table === 'results') {
        return [
          { invoiceId: 'inv101', testId: 't1', status: 'ready', values: {} },
          { invoiceId: 'inv101', testId: 't2', status: 'ready', values: {} }
        ];
      }
      return [];
    }
  }
};
s.window = s;
s.document = {
  head: { appendChild: () => {} },
  getElementById: () => null
};

vm.createContext(s);
const jsCode = fs.readFileSync(path.join(__dirname, '../assets/js/mod-patient-dashboard.js'), 'utf8');
vm.runInContext(jsCode, s);

const patient = {
  id: 'p1',
  name: 'Ahmed Ali',
  age: 42,
  gender: 'Male',
  phone: '03001234567',
  whatsapp: '03001234567',
  address: 'Lahore, Pakistan',
  doctorId: 'd1',
  blood: 'B+'
};

// 1. Verify getPatientReports
const reports = s.App.patientDashboard.getPatientReports(patient);
assert.equal(reports.length, 1, 'Should find 1 report for patient p1');
assert.equal(reports[0].invoiceId, 'inv101');
assert.equal(reports[0].status, 'ready');
assert.equal(reports[0].testNames.length, 2);
console.log('✓ getPatientReports successfully extracted patient report records');

// 2. Verify render output
const html = s.App.patientDashboard.render(patient);

// Verify nav button
assert.ok(html.includes('data-pd-section="pdReports"'), 'Navigation button for pdReports must exist');
assert.ok(html.includes('Diagnostic Lab Reports &amp; Downloads') || html.includes('Diagnostic Lab Reports & Downloads'), 'pdReports nav title must exist');
assert.ok(html.includes('📑'), 'pdReports icon must be 📑');
console.log('✓ Navigation button for Diagnostic Reports is present');

// Verify dedicated reports layout
assert.ok(html.includes('id="pdReports"'), 'Dedicated #pdReports container must be present');
assert.ok(html.includes('Patient Diagnostic Lab Reports &amp; Downloads'), 'Reports header title present');
assert.ok(html.includes('INV-2026-001'), 'Invoice number present in reports list');
assert.ok(html.includes('Dr. Sarah Khan'), 'Doctor name present in reports list');
assert.ok(html.includes('Complete Blood Count (CBC)'), 'Test names present in report row');
assert.ok(html.includes('pd-rep-btn-view'), 'View report button present');
assert.ok(html.includes('pd-rep-btn-print'), 'Print report button present');
assert.ok(html.includes('pd-rep-btn-pdf'), 'PDF download button present');
assert.ok(html.includes('pd-rep-btn-wa'), 'WhatsApp share button present');
assert.ok(html.includes('btnPdDownloadAllPdfs'), 'Bulk download all ready PDFs button present');
console.log('✓ Reports list table, download, print, and view buttons verified');

// 3. Verify CSS typography for Patient Details Overview
const css = fs.readFileSync(path.join(__dirname, '../assets/css/patient-dashboard.css'), 'utf8');
assert.ok(css.includes('#ptPatientDashboard #pdPatientCardTop dt'), 'dt selector present');
assert.ok(css.includes('font-weight: 700 !important') || css.includes('font-weight:700!important'), 'dt headings must be bold 700');
assert.ok(css.includes('#ptPatientDashboard #pdPatientCardTop dd'), 'dd selector present');
assert.ok(css.includes('font-weight: 400 !important') || css.includes('font-weight:400!important'), 'dd details must be unbold 400');
console.log('✓ Patient Details Overview typography: Headings bold (700) and Details unbold (400) verified');

console.log('\n============================================================');
console.log('ALL PATIENT DIAGNOSTIC REPORTS & TYPOGRAPHY TESTS PASSED CLEANLY!');
console.log('============================================================\n');
