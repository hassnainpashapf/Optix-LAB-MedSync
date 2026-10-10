const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dashboardPaths = [
  'assets/js/mod-dashboard.js',
  'electron-tools/installer/app-stage-win7/assets/js/mod-dashboard.js'
];
const billingPaths = [
  'assets/js/mod-billing.js',
  'electron-tools/installer/app-stage-win7/assets/js/mod-billing.js'
];
const patientPaths = [
  'assets/js/mod-patients.js',
  'electron-tools/installer/app-stage-win7/assets/js/mod-patients.js'
];

function fixture() {
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  const isoToday = todayKey + 'T12:00:00';
  return {
    today: todayKey,
    tables: {
      branches: [
        { id: 'B01', name: 'Alpha', code: 'AL' },
        { id: 'B02', name: 'Beta', code: 'BE' }
      ],
      invoices: [
        { id: 'I1', branchId: 'B01', createdAt: isoToday, total: 100, due: 40,
          items: [{ isPackage: true, includes: ['T1', 'T2'], name: 'Panel' }] },
        { id: 'I2', createdAt: isoToday, regLocation: ' beta ', total: 50, due: 0,
          items: [{ testId: 'T1', name: 'Test One' }] },
        { id: 'I3', createdAt: '2020-01-01T10:00:00Z', total: 15, due: 20,
          items: [{ testId: 'T2', name: 'Test Two' }] }
      ],
      payments: [
        { invoiceId: 'I1', date: isoToday, amount: 60 },
        { invoiceId: 'I3', date: isoToday, amount: 20 },
        { invoiceId: 'missing', date: isoToday, amount: 999 }
      ],
      tests: [
        { id: 'T1', name: 'Test One' },
        { id: 'T2', name: 'Test Two' }
      ]
    }
  };
}

for (const relPath of dashboardPaths) {
  const source = fs.readFileSync(path.join(root, relPath), 'utf8');
  const start = source.indexOf('    function reportPeriod(period) {');
  const helperStart = start >= 0 ? start : source.indexOf('  function reportPeriod(period) {');
  const endMarker = relPath === 'assets/js/mod-dashboard.js'
    ? "  App.route('/dashboard'"
    : '    /* ---------- loading skeletons';
  const end = source.indexOf(endMarker, helperStart);
  assert.ok(helperStart >= 0 && end > helperStart, relPath + ': analytics helper block was not found');
  assert.ok(source.includes('id="dbAnalyticsPeriod"'), relPath + ': analytics period selector is missing');
  assert.match(source, /smartAnalyticsBody\(periodSelect\.value(?:,\s*showBranchMoney)?\)/, relPath + ': period changes are not wired');

  const data = fixture();
  const context = {
    dayKey: value => String(value || '').slice(0, 10),
    showBranchMoney: true,
    DB: {
      all: table => data.tables[table] || [],
      get: (table, id) => (data.tables[table] || []).find(row => row.id === id) || null
    },
    App: {
      today: () => data.today,
      esc: value => String(value == null ? '' : value),
      money: value => 'Rs ' + Math.round(value),
      empty: message => '<empty>' + message + '</empty>'
    }
  };
  vm.runInNewContext(source.slice(helperStart, end) + '\nthis.renderAnalytics = smartAnalyticsBody;', context);

  const html = context.renderAnalytics('30', true);
  assert.match(html, /Branch revenue &amp; dues/);
  assert.match(html, /<span class="db-smart-name">Alpha<\/span>/);
  assert.match(html, /<span class="db-smart-name">Beta<\/span>/);
  assert.match(html, /<span class="db-smart-name">Unassigned<\/span>/);
  assert.match(html, /Rs 100<\/td><td class="num">Rs 60<\/td><td class="num">Rs 40/);
  assert.match(html, /Rs 50<\/td><td class="num">Rs 0<\/td><td class="num">Rs 0/);
  assert.match(html, /Rs 0<\/td><td class="num">Rs 20<\/td><td class="num">Rs 20/);
  assert.match(html, /<span class="db-smart-name">Test One<\/span><\/td><td class="num">2/);
  assert.match(html, /<span class="db-smart-name">Test Two<\/span><\/td><td class="num">1/);
  assert.doesNotMatch(context.renderAnalytics('all', true), /<span class="db-smart-name">Test Two<\/span><\/td><td class="num">1/);

  context.showBranchMoney = false;
  const limitedHtml = context.renderAnalytics('30', false);
  assert.doesNotMatch(limitedHtml, /Branch revenue &amp; dues|Rs 100/);
  assert.match(limitedHtml, /<span class="db-smart-name">Test One<\/span>/);
}

for (const relPath of billingPaths) {
  const source = fs.readFileSync(path.join(root, relPath), 'utf8');
  assert.ok(source.includes('id="blBranch"'), relPath + ': bill branch selector is missing');
  assert.ok(source.includes("branchId: (document.getElementById('blBranch') || {}).value || null"), relPath + ': bill branch is not saved');
}
for (const relPath of patientPaths) {
  const source = fs.readFileSync(path.join(root, relPath), 'utf8');
  assert.ok(source.includes('id="ptf-branch"'), relPath + ': patient registration branch selector is missing');
  assert.ok(source.includes('branchId: branchId'), relPath + ': auto-invoice branch is not saved');
}

console.log('PASS: branch revenue, collections, outstanding dues, package-aware test demand, period filtering, and role-based money visibility');
