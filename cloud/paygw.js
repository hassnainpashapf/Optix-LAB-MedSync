/* Online payment gateways for subscription payments (JazzCash, Easypaisa) — pure helpers, no I/O.
   The server (server.js) stores the merchant credentials, creates the checkout for a lab's payment request and, when the gateway reports back,
   verifies the report here before the subscription is extended.
   JazzCash: "page redirection" checkout. The form is signed with HMAC-SHA256 (integrity salt); the answer that comes back is signed the same way.
   Easypaisa: Easypay hosted checkout. The request is signed with AES-128-ECB (hash key); the result is confirmed by the Instant Payment Notification (IPN),
   which the server verifies by fetching the transaction from Easypay itself (never from the browser). */
'use strict';
const crypto = require('crypto');

const JC_URL = {
  sandbox: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
  live: 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
};
const EP_URL = {
  sandbox: 'https://easypaystg.easypaisa.com.pk/easypay/',
  live: 'https://easypay.easypaisa.com.pk/easypay/',
};
const EP_HOSTS = ['easypay.easypaisa.com.pk', 'easypaystg.easypaisa.com.pk'];

const p2 = (n) => String(n).padStart(2, '0');
/* Pakistan time (UTC+5), the clock both gateways use */
function pkt(d) {
  const x = new Date(d.getTime() + 5 * 3600000);
  return x.getUTCFullYear() + p2(x.getUTCMonth() + 1) + p2(x.getUTCDate()) + p2(x.getUTCHours()) + p2(x.getUTCMinutes()) + p2(x.getUTCSeconds());
}

/* ---------------- JazzCash ---------------- */
function jcHash(salt, fields) {
  const keys = Object.keys(fields).filter((k) => /^(pp_|ppmpf_)/i.test(k) && k.toLowerCase() !== 'pp_securehash' && fields[k] !== '' && fields[k] != null).sort();
  const str = salt + '&' + keys.map((k) => String(fields[k])).join('&');
  return crypto.createHmac('sha256', salt).update(str).digest('hex').toUpperCase();
}
function jcCheckout(cfg, o) {
  const now = o.now || new Date();
  const f = {
    pp_Version: '1.1', pp_TxnType: '', pp_Language: 'EN', pp_MerchantID: cfg.merchantId, pp_SubMerchantID: '', pp_Password: cfg.password,
    pp_BankID: 'TBANK', pp_ProductID: 'RETL', pp_TxnRefNo: o.txnRef, pp_Amount: String(Math.round(o.amount * 100)), pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: pkt(now), pp_BillReference: String(o.billRef || 'subscription').replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'subscription',
    pp_Description: String(o.description || 'Subscription').replace(/[^A-Za-z0-9 .,-]/g, '').slice(0, 100), pp_TxnExpiryDateTime: pkt(new Date(now.getTime() + 3 * 3600000)),
    pp_ReturnURL: o.returnUrl, ppmpf_1: '', ppmpf_2: '', ppmpf_3: '', ppmpf_4: '', ppmpf_5: '',
  };
  f.pp_SecureHash = jcHash(cfg.salt, f);
  return { method: 'POST', url: JC_URL[cfg.mode === 'live' ? 'live' : 'sandbox'], fields: f };
}
/* the answer JazzCash posts back to the return URL: genuine only if its hash matches ours */
function jcVerify(cfg, body) {
  if (!body || !body.pp_SecureHash) return { ok: false, why: 'no signature' };
  const mine = jcHash(cfg.salt, body), theirs = String(body.pp_SecureHash).toUpperCase();
  if (mine.length !== theirs.length || !crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(theirs))) return { ok: false, why: 'bad signature' };
  return { ok: true, paid: String(body.pp_ResponseCode) === '000', txnRef: String(body.pp_TxnRefNo || ''), amount: (+body.pp_Amount || 0) / 100, message: String(body.pp_ResponseMessage || '') };
}

/* ---------------- Easypaisa ---------------- */
function epEncrypt(hashKey, text) {
  const key = Buffer.alloc(16); Buffer.from(String(hashKey), 'utf8').copy(key, 0, 0, 16);
  const c = crypto.createCipheriv('aes-128-ecb', key, null); c.setAutoPadding(true);
  return Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('base64');
}
function epCheckout(cfg, o) {
  const now = o.now || new Date(), exp = pkt(new Date(now.getTime() + 3 * 3600000));
  const p = { amount: (Math.round(o.amount * 100) / 100).toFixed(1), autoRedirect: '1', emailAddr: o.email || '', expiryDate: exp.slice(0, 8) + ' ' + exp.slice(8), orderRefNum: o.txnRef, paymentMethod: 'InitialRequest', postBackURL: o.returnUrl, storeId: cfg.storeId };
  if (!p.emailAddr) delete p.emailAddr;
  const keys = Object.keys(p).sort();
  p.merchantHashedReq = epEncrypt(cfg.hashKey, keys.map((k) => k + '=' + p[k]).join('&'));
  const q = Object.keys(p).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(p[k])).join('&');
  return { method: 'GET', url: EP_URL[cfg.mode === 'live' ? 'live' : 'sandbox'] + 'Index.jsf?' + q, fields: null };
}
/* the second step after the customer has paid: hand the auth token back to Easypay */
function epConfirmUrl(cfg, authToken, finalUrl) {
  return EP_URL[cfg.mode === 'live' ? 'live' : 'sandbox'] + 'Confirm.jsf?auth_token=' + encodeURIComponent(authToken) + '&postBackURL=' + encodeURIComponent(finalUrl);
}
/* the IPN gives us a link on Easypay's own servers that describes the transaction; only those hosts are ever contacted */
function epIpnUrlOk(u) {
  try {
    const x = new URL(String(u)), extra = process.env.PAY_TEST_IPN_HOST || ''; /* extra host: automated tests only, never set in production */
    if (extra && x.host === extra && x.protocol === 'http:') return true;
    return x.protocol === 'https:' && EP_HOSTS.indexOf(x.hostname) >= 0 && !x.username && !x.password;
  } catch (e) { return false; }
}
/* tolerant reading of Easypay's transaction JSON (field names differ between Easypay products) */
function epReadTxn(j) {
  if (!j || typeof j !== 'object') return { ok: false };
  const pick = (...ks) => { for (const k of ks) { if (j[k] != null && j[k] !== '') return j[k]; } return ''; };
  const status = String(pick('transaction_status', 'transactionStatus', 'status', 'transaction_status_code')).toUpperCase();
  return { ok: true, paid: ['PAID', 'SUCCESS', 'SUCCESSFUL', '0000', 'COMPLETED'].indexOf(status) >= 0, txnRef: String(pick('order_id', 'orderRefNumber', 'orderRefNum', 'order_ref_num', 'orderId')), amount: +pick('transaction_amount', 'amount', 'transactionAmount') || 0, status };
}

module.exports = { jcHash, jcCheckout, jcVerify, epEncrypt, epCheckout, epConfirmUrl, epIpnUrlOk, epReadTxn, pkt, EP_HOSTS };
