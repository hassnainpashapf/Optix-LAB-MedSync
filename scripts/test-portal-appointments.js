#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

async function testPatientBooking() {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const fields = {
    ptApDate: { value: date },
    ptApSlot: { value: '09:00-11:00' },
    ptApType: { value: 'lab-visit' },
    ptApNote: { value: 'Morning appointment' },
    ptApPatient: { value: '' }
  };
  let submit, openAppointments, openBilling, openPayForm, startGatewayPayment, payload, paymentPayload, submittedForm;
  const submitButton = { addEventListener: (event, fn) => { if (event === 'click') submit = fn; } };
  const appointmentsTab = {
    getAttribute: (key) => key === 'data-v' ? 'appointments' : '',
    addEventListener: (event, fn) => { if (event === 'click') openAppointments = fn; }
  };
  const billingTab = {
    getAttribute: (key) => key === 'data-v' ? 'invoices' : '',
    addEventListener: (event, fn) => { if (event === 'click') openBilling = fn; }
  };
  const gatewayButton = {
    getAttribute: (key) => ({ 'data-pt-gateway': 'jazzcash', 'data-invoice': 'INV-1' }[key]),
    addEventListener: (event, fn) => { if (event === 'click') startGatewayPayment = fn; }
  };
  const payToggleButton = {
    getAttribute: (key) => key === 'data-pay' ? 'INV-1' : '',
    addEventListener: (event, fn) => { if (event === 'click') openPayForm = fn; }
  };
  const body = { innerHTML: '', className: '', appendChild: (form) => { submittedForm = form; } };
  const document = {
    body,
    head: { appendChild() {} },
    createElement: (tag) => ({
      tag, children: [], appendChild(node) { this.children.push(node); },
      submit() { submittedForm = this; }
    }),
    getElementById: (id) => id === 'ptApSubmit' ? submitButton : (fields[id] || null),
    querySelectorAll: (selector) => selector === '[data-v]' ? [appointmentsTab, billingTab] :
      (selector === '[data-pay]' ? [payToggleButton] :
        (selector === '[data-pt-gateway]' ? [gatewayButton] : []))
  };
  const storage = new Map([['labpos_portal_ls', JSON.stringify({
    lab: 'demo', token: 'test-token', at: Date.now(), days: 1
  })]]);
  const localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  };
  const patientData = {
    ok: true,
    lab: { name: 'Demo Lab' },
    patient: {
      names: ['Test Patient'],
      profiles: [{ id: 'P1', name: 'Test Patient' }],
      reports: [], invoices: [{ id: 'INV-1', no: '1001', date, total: 2500, paid: 0, due: 2500, tests: 'CBC' }],
      payments: [], appointments: [],
      paymentInfo: { enabled: true, methods: [], gateway: { jazzcash: true, easypaisa: false } }
    },
    doctor: null
  };
  const window = {
    App: {
      esc: (value) => String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[char]))
    },
    LABPOS_API: '',
    fetch: async (url, options = {}) => {
      if (url.includes('/api/portal/info')) return { ok: true, json: async () => ({ enabled: true, labName: 'Demo Lab' }) };
      if (url.includes('/api/portal/appointment')) {
        payload = JSON.parse(options.body);
        return { ok: true, status: 201, json: async () => ({ ok: true }) };
      }
      if (url.includes('/api/portal/pay')) {
        paymentPayload = JSON.parse(options.body);
        return { ok: true, status: 201, json: async () => ({
          ok: true,
          checkout: { method: 'POST', url: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/', fields: { pp_TxnRefNo: 'INV-REF', pp_SecureHash: 'signed' } }
        }) };
      }
      if (url.includes('/api/portal/data')) return { ok: true, json: async () => patientData };
      throw new Error('Unexpected URL: ' + url);
    },
    scrollTo() {},
    location: { href: '' }
  };
  const context = {
    window, document, navigator: { userAgent: '' }, localStorage, sessionStorage: localStorage,
    location: { hash: '#/portal/demo', href: 'https://example.test/app/#/portal/demo' },
    history: { replaceState() {} }, Promise, Date, URL, setInterval, clearInterval, console
  };
  vm.runInNewContext(fs.readFileSync('assets/js/mod-portal.js', 'utf8'), context);
  window.App.renderPortal(context.location.hash);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.strictEqual(typeof openAppointments, 'function');
  openAppointments();
  assert.match(body.innerHTML, /Book an appointment/);
  assert.match(body.innerHTML, /Your appointment requests/);
  assert.strictEqual(typeof submit, 'function');
  submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), {
    date, timeSlot: '09:00-11:00', serviceType: 'lab-visit',
    note: 'Morning appointment', patientId: ''
  });
  openBilling();
  openPayForm();
  assert.match(body.innerHTML, /Pay securely online/);
  assert.strictEqual(typeof startGatewayPayment, 'function');
  startGatewayPayment();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(paymentPayload)), { invoiceId: 'INV-1', gateway: 'jazzcash' });
  assert.strictEqual(submittedForm.method, 'POST');
  assert.strictEqual(submittedForm.action, 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/');
  assert.deepStrictEqual(submittedForm.children.map((input) => [input.name, input.value]), [['pp_TxnRefNo', 'INV-REF'], ['pp_SecureHash', 'signed']]);
}

async function testOfflinePortalAfterInfoFailure() {
  const patientData = {
    lab: { name: 'Demo Lab' },
    patient: { names: ['Offline Patient'], reports: [], invoices: [], payments: [], appointments: [] },
    doctor: null
  };
  const localStorage = new Map([
    ['labpos_portal_ls', JSON.stringify({ lab: 'demo', token: 'test-token', at: Date.now(), days: 1 })],
    ['labpos_portal_phone', '03001234567']
  ]);
  const body = { innerHTML: '', className: '' };
  const document = {
    body,
    head: { appendChild() {} },
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: () => null,
    querySelectorAll: () => []
  };
  const window = {
    App: { esc: (value) => String(value) },
    LABPOS_API: '',
    Capacitor: { Plugins: { OfflineCache: {
      load: async () => ({ value: JSON.stringify({
        lab: 'demo', phone: '3001234567', cachedAt: Date.now(), data: patientData
      }) })
    } } },
    fetch: async () => { throw new Error('offline'); }
  };
  const context = {
    window, document, navigator: { userAgent: 'OptixApp' },
    localStorage: {
      getItem: (key) => localStorage.get(key) || null,
      setItem: (key, value) => localStorage.set(key, value),
      removeItem: (key) => localStorage.delete(key)
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { hash: '#/portal/demo', href: 'https://example.test/app/#/portal/demo' },
    history: { replaceState() {} }, Promise, Date, setInterval, clearInterval, console
  };
  vm.runInNewContext(fs.readFileSync('assets/js/mod-portal.js', 'utf8'), context);
  window.App.renderPortal(context.location.hash);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(body.innerHTML, /Offline read-only view/);
  assert.match(body.innerHTML, /Offline Patient/);
}

function testStaffQueue() {
  let renderRoute;
  let confirmAppointment, updated;
  const appointment = {
    id: 'APT-1', patientId: 'P-1', date: '2030-01-02',
    timeSlot: '09:00-11:00', serviceType: 'lab-visit',
    note: 'Fasting', status: 'requested'
  };
  const confirmButton = {
    getAttribute: (key) => ({ 'data-id': 'APT-1', 'data-appt-status': 'confirmed' }[key]),
    addEventListener: (event, fn) => { if (event === 'click') confirmAppointment = fn; }
  };
  const view = {
    innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-appt-status]' ? [confirmButton] : []
  };
  const App = {
    route: (path, render) => { assert.strictEqual(path, '#/appointments'); renderRoute = render; },
    esc: (value) => String(value),
    toast() {},
    session: () => ({ name: 'Staff' }),
    empty: (text) => text
  };
  const DB = {
    all: () => [appointment],
    get: (table) => table === 'appointments' ? appointment : { name: 'Test Patient', phone: '03001234567' },
    update: (table, id, patch) => { updated = patch; return Object.assign(appointment, patch); }
  };
  vm.runInNewContext(fs.readFileSync('assets/js/mod-appointments.js', 'utf8'), {
    window: { App, DB },
    document: { getElementById: () => view },
    Date, Promise, console
  });
  assert.strictEqual(typeof renderRoute, 'function');
  renderRoute();
  assert.match(view.innerHTML, /AWAITING REVIEW/);
  assert.match(view.innerHTML, /Test Patient/);
  assert.match(view.innerHTML, /Fasting/);
  assert.strictEqual(typeof confirmAppointment, 'function');
  confirmAppointment();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(updated)), { status: 'confirmed' });
  assert.strictEqual(appointment.status, 'confirmed');
}

(async () => {
  await testPatientBooking();
  await testOfflinePortalAfterInfoFailure();
  testStaffQueue();
  console.log('PASS: patient booking UI, offline cached portal fallback, and staff appointment queue');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
