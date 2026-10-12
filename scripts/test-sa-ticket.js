/* One-time superadmin tickets: the console opens another product's superadmin (Hospital) without a second login.
   Run: node scripts/test-sa-ticket.js */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4700 + Math.floor(Math.random() * 250), B = 'http://127.0.0.1:' + PORT;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-ticket-'));
const j = async (method, url, body, h) => {
  const r = await fetch(B + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch (e) { d = null; }
  return { s: r.status, d };
};
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'cloud', 'server.js')], { cwd: path.join(__dirname, '..', 'cloud'),
    env: Object.assign({}, process.env, { DB_ADAPTER: 'sqlite', PORT: String(PORT), SQLITE_PATH: path.join(dir, 't.db'), DATA_DIR: dir, SUPERADMIN_KEY: 'k', SESSION_SECRET: 's' }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(B + '/api/health'); if (r.ok) break; } catch (e) { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
    const SA = { 'X-Superadmin-Key': 'k' };
    let r = await j('POST', '/api/saas/sa-ticket', { product: 'hospital' }); assert.equal(r.s, 403, 'only the signed-in superadmin can ask for a ticket');
    r = await j('POST', '/api/saas/sa-ticket', { product: 'lab' }, SA); assert.equal(r.s, 400, 'the Lab console needs no ticket');
    r = await j('POST', '/api/saas/sa-ticket', { product: 'nonsense' }, SA); assert.equal(r.s, 400);
    r = await j('POST', '/api/saas/sa-ticket', { product: 'hospital' }, SA); assert.equal(r.s, 200); assert.ok(r.d.ticket && r.d.ticket.length >= 30);
    const t1 = r.d.ticket;
    r = await j('POST', '/api/saas/sa-ticket/verify', { ticket: t1, product: 'pharmacy' }); assert.equal(r.s, 401, 'a ticket only works for its own product');
    r = await j('POST', '/api/saas/sa-ticket/verify', { ticket: t1, product: 'hospital' }); assert.equal(r.s, 401, 'a wrong try also burns the ticket');
    r = await j('POST', '/api/saas/sa-ticket', { product: 'hospital' }, SA); const t2 = r.d.ticket;
    r = await j('POST', '/api/saas/sa-ticket/verify', { ticket: t2, product: 'hospital' }); assert.equal(r.s, 200); assert.equal(r.d.product, 'hospital');
    r = await j('POST', '/api/saas/sa-ticket/verify', { ticket: t2, product: 'hospital' }); assert.equal(r.s, 401, 'single use');
    r = await j('POST', '/api/saas/sa-ticket/verify', { ticket: 'guess', product: 'hospital' }); assert.equal(r.s, 401);
    for (let i = 0; i < 40; i++) r = await j('POST', '/api/saas/sa-ticket/verify', { ticket: 'x' + i, product: 'hospital' });
    assert.equal(r.s, 429, 'guessing is rate limited');
    console.log('PASS: superadmin tickets: superadmin only, one product, single use, rate limited');
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
