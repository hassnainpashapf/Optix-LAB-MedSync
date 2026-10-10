'use strict';

/* Synthetic regression for the desktop ready-report customer messages.
   It loads the message builders from both desktop copies so staging cannot
   silently drift from electron-src. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const files = [
  'electron-src/assets/js/mod-results.js',
  'electron-tools/installer/app-stage-win7/assets/js/mod-results.js'
];

function loadMessages(relative) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
  const waStart = source.indexOf('  function waCfg()');
  const waEnd = source.indexOf('  /* ---------- critical values ----------\n');
  const smsStart = source.indexOf('  var SMS_TPL = {');
  const smsEnd = source.indexOf('  /* shared with Settings (mod-admin.js) */');
  assert(waStart >= 0 && waEnd > waStart, relative + ': WhatsApp message block not found');
  assert(smsStart >= 0 && smsEnd > smsStart, relative + ': SMS message block not found');

  const settings = {
    id: 'main', labName: 'Synthetic Lab',
    whatsapp: { provider: 'gateway', gatewayNumber: '923001234567', token: 'WHATSAPP_SECRET' },
    sms: { enabled: true },
    opEnabled: true,
    opPaymentUrl: 'https://payments.example.test/invoice/INV-42?token=public-checkout-token',
    opJazzcashNo: '0300-1234567', opJazzcashTitle: 'Synthetic Lab',
    opInstructions: 'Use invoice INV-42 as the payment reference.',
    sessionToken: 'SESSION_SECRET'
  };
  const tables = { settings: [settings] };
  const DB = {
    get(table, id) { return (tables[table] || []).find((row) => row.id === id) || null; },
    all(table) { return tables[table] || []; }
  };
  const App = {
    d() { return '10-Oct-2026'; },
    money(value) { return 'Rs ' + Number(value || 0).toLocaleString('en-US'); },
    normWa(value) { return String(value || '').replace(/\D/g, ''); },
    toast() {}
  };
  const context = vm.createContext({ DB, App, window: {}, console, Promise, setTimeout, clearTimeout });
  const code = '(function () {\n' + source.slice(waStart, waEnd) + '\n' + source.slice(smsStart, smsEnd) +
    '\nreturn { wa: { patientMsg: waPatientMessage, doctorMsg: waDoctorMessage, dueMsg: waDueMessage }, sms: { patientMsg: smsPatientMessage, dueMsg: smsDueMessage }, settings: DB.get(\'settings\', \'main\') };\n})()';
  return vm.runInContext(code, context, { filename: relative });
}

const invoice = { id: 'i42', no: 'INV-42', total: 1800, paid: 1000, due: 800, status: 'partial', createdAt: '2026-10-10T09:00:00Z' };
const outputs = files.map((file) => {
  const messages = loadMessages(file);
  const settings = messages.settings;
  const wa = messages.wa.patientMsg(invoice, { name: 'Ayesha' }, ['CBC'], 'https://reports.example.test/r/report-42');
  const sms = messages.sms.patientMsg(invoice, { name: 'Ayesha' }, ['CBC']);
  const due = messages.wa.dueMsg(invoice, { name: 'Ayesha' }, ['CBC']);
  const doctor = messages.wa.doctorMsg(invoice, { name: 'Dr. Khan' }, { name: 'Ayesha' }, ['CBC'], '');

  for (const message of [wa, sms, due]) {
    assert.match(message, /INV-42/);
    assert.match(message, /Total: Rs 1,800/);
    assert.match(message, /Due: Rs 800/);
    assert.match(message, /Status: Part-paid/);
    assert.match(message, /Online payment available/);
    assert.match(message, /https:\/\/payments\.example\.test\/invoice\/INV-42\?token=public-checkout-token/);
    assert.doesNotMatch(message, /WHATSAPP_SECRET|SESSION_SECRET/);
  }
  assert.match(wa, /Your laboratory report is ready\./, 'existing WhatsApp ready wording is preserved');
  assert.match(sms, /your lab report \(Invoice INV-42, 10-Oct-2026\) is ready\./, 'existing SMS ready wording is preserved');
  assert.doesNotMatch(doctor, /Online payment available|0300-1234567|public-checkout-token/, 'payment details stay patient-facing');

  const paidInvoice = Object.assign({}, invoice, { paid: 1800, due: 0, status: 'paid' });
  const paid = messages.wa.patientMsg(paidInvoice, { name: 'Ayesha' }, ['CBC'], '');
  assert.match(paid, /Status: Paid/);
  assert.doesNotMatch(paid, /Online payment available|public-checkout-token/, 'paid reports have no payment CTA');

  settings.opEnabled = false;
  const unavailable = messages.sms.patientMsg(invoice, { name: 'Ayesha' }, ['CBC']);
  assert.doesNotMatch(unavailable, /Online payment available|public-checkout-token/, 'disabled payment settings degrade without a broken link');
  settings.opEnabled = true;
  settings.opPaymentUrl = 'javascript:alert(1)';
  const invalidUrl = messages.wa.patientMsg(invoice, { name: 'Ayesha' }, ['CBC'], '');
  assert.doesNotMatch(invalidUrl, /javascript:alert|Pay online:/, 'non-public URL schemes are not sent');
  settings.opPaymentUrl = 'https://payments.example.test/invoice/INV-42?token=public-checkout-token';

  return { wa, sms, due };
});

assert.deepEqual(outputs[0], outputs[1], 'electron-src and staged ready-message builders stay in parity');
console.log('PASS: desktop ready-report invoice summary, payment CTA/link gating, secret exclusion, and source/staged parity');
