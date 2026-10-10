const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/mod-branch-dashboard.js'), 'utf8');
const today = '2026-10-10';
const tables = {
  branches: [
    { id: 'B1', name: 'Alpha', code: 'A' },
    { id: 'B2', name: 'Beta', code: 'B' }
  ],
  invoices: [
    { id: 'I1', branchId: 'B1', createdAt: today, total: 100, due: 40, items: [{ testId: 'T1' }] },
    { id: 'I2', branchId: 'B2', createdAt: today, total: 50, due: 0, items: [{ testId: 'T2' }] },
    { id: 'I3', branchId: 'B1', createdAt: '2026-08-01', total: 25, due: 10, items: [{ testId: 'T3' }] }
  ],
  payments: [
    { invoiceId: 'I1', date: today, amount: 60 },
    { invoiceId: 'I2', date: today, amount: 50 }
  ],
  tests: [
    { id: 'T1', name: '=SUM(A1:A2)' },
    { id: 'T2', name: 'Test Two' },
    { id: 'T3', name: 'Old Test' }
  ]
};

function createHarness(financeAllowed) {
  const controls = {};
  ['#bdPeriod', '#bdStart', '#bdEnd', '#bdExport'].forEach(selector => {
    controls[selector] = {
      value: selector === '#bdPeriod' ? '30' : '',
      disabled: false,
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; }
    };
  });
  let html = '';
  const view = {
    querySelector: selector => controls[selector] || null
  };
  Object.defineProperty(view, 'innerHTML', {
    get: () => html,
    set: value => { html = value; }
  });
  let route;
  let exportedBlob;
  let downloadName = '';
  const App = {
    route: (_path, handler) => { route = handler; },
    session: () => ({ role: 'admin' }),
    hideMoney: () => !financeAllowed,
    canPage: () => financeAllowed,
    today: () => today,
    esc: value => String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    money: value => 'Rs ' + Math.round(value),
    empty: message => '<div>' + message + '</div>',
    toast: () => {},
    nav: () => {}
  };
  const context = {
    App,
    DB: {
      all: table => tables[table] || [],
      get: (table, id) => (tables[table] || []).find(row => row.id === id) || null
    },
    document: {
      getElementById: () => view,
      createElement: () => ({
        click() { downloadName = this.download; }
      }),
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    Blob,
    URL: {
      createObjectURL: blob => { exportedBlob = blob; return 'blob:test'; },
      revokeObjectURL: () => {}
    }
  };
  vm.runInNewContext(source, context);
  route();
  return {
    controls,
    get html() { return html; },
    export: async () => {
      controls['#bdExport'].listeners.click();
      return { name: downloadName, text: await exportedBlob.text() };
    }
  };
}

async function run() {
  const dashboard = createHarness(true);
  assert.match(dashboard.html, /Branch comparison/);
  assert.match(dashboard.html, /aria-label="Branch comparison of billed revenue, collections and outstanding balances"/);
  assert.match(dashboard.html, /value="custom"/);

  const period = dashboard.controls['#bdPeriod'];
  period.value = 'custom';
  period.listeners.change();
  assert.match(dashboard.html, /id="bdStart"/);
  assert.match(dashboard.html, /id="bdEnd"/);

  const start = dashboard.controls['#bdStart'];
  const end = dashboard.controls['#bdEnd'];
  start.value = '2026-10-01';
  start.listeners.change();
  end.value = '2026-10-05';
  end.listeners.change();
  assert.doesNotMatch(dashboard.html, /Rs 100/);
  assert.match(dashboard.html, /No test orders in this period/);

  period.value = 'all';
  period.listeners.change();
  const exported = await dashboard.export();
  assert.equal(exported.name, 'branch-dashboard-all-to-' + today + '.csv');
  assert.match(exported.text, /Branch summary/);
  assert.match(exported.text, /"Alpha","125","60","50","2"/);
  assert.match(exported.text, /Test demand/);
  assert.match(exported.text, /"'=SUM\(A1:A2\)"/);

  const limited = createHarness(false);
  assert.doesNotMatch(limited.html, /aria-label="Branch comparison of billed revenue/);
  const limitedExport = await limited.export();
  assert.match(limitedExport.text, /"Branch","Invoices"/);
  assert.doesNotMatch(limitedExport.text, /Billed|Collected|Outstanding/);
  console.log('PASS: branch comparison, custom date ranges, Excel-compatible export, formula-injection protection, and finance visibility');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
