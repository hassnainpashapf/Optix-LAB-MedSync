#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const paygw = require('../cloud/paygw');

const jazzcash = { merchantId: 'merchant-123', password: 'test-password', salt: 'test-salt', mode: 'sandbox' };
const jcCheckout = paygw.jcCheckout(jazzcash, {
  txnRef: 'INV123456789abcdef', amount: 2500, billRef: 'INV-1001',
  description: 'Lab invoice 1001', returnUrl: 'https://api.example.test/api/portal/pay-return/jazzcash',
  now: new Date('2026-10-10T12:00:00Z')
});
assert.strictEqual(jcCheckout.method, 'POST');
assert.strictEqual(new URL(jcCheckout.url).hostname, 'sandbox.jazzcash.com.pk');
assert.strictEqual(jcCheckout.fields.pp_Amount, '250000');
const jcResponse = Object.assign({}, jcCheckout.fields, { pp_ResponseCode: '000' });
jcResponse.pp_SecureHash = paygw.jcHash(jazzcash.salt, jcResponse);
assert.deepStrictEqual(paygw.jcVerify(jazzcash, jcResponse), {
  ok: true, paid: true, txnRef: 'INV123456789abcdef', amount: 2500, message: ''
});
assert.strictEqual(paygw.jcVerify(jazzcash, Object.assign({}, jcResponse, { pp_Amount: '250001' })).ok, false);

const easypaisa = { storeId: 'store-456', hashKey: '0123456789abcdef', mode: 'sandbox' };
const epCheckout = paygw.epCheckout(easypaisa, {
  txnRef: 'INV987654321abcdef', amount: 1250.5,
  returnUrl: 'https://api.example.test/api/portal/pay-return/easypaisa/INV987654321abcdef',
  now: new Date('2026-10-10T12:00:00Z')
});
assert.strictEqual(epCheckout.method, 'GET');
assert.strictEqual(new URL(epCheckout.url).hostname, 'easypaystg.easypaisa.com.pk');
assert.strictEqual(paygw.epReadTxn({ orderRefNum: 'INV987654321abcdef', transaction_amount: '1250.5', transaction_status: 'SUCCESS' }).paid, true);
assert.strictEqual(paygw.epIpnUrlOk('https://easypay.easypaisa.com.pk/transaction/lookup'), true);
assert.strictEqual(paygw.epIpnUrlOk('https://attacker.example.test/transaction/lookup'), false);

const server = fs.readFileSync('cloud/server.js', 'utf8');
assert(server.includes("app.post('/api/portal/pay'"));
assert(server.includes("app.post('/api/portal/pay-return/jazzcash'"));
assert(server.includes("app.get('/api/portal/pay-ipn/easypaisa'"));
assert.match(server, /patientPayConfigKey[\s\S]*encPw/);

console.log('PASS: patient gateway JazzCash/Easypaisa checkout helpers, verification, and callback routes');
