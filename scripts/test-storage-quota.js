/* Report storage quota per lab: the plan sets a limit in MB, uploads past it are refused (413 LIMIT_STORAGE), re-uploading the same key only counts the difference,
   the usage shows in the lab view, and the superadmin can override the plan limit per lab. Throw-away sqlite server. Run: node scripts/test-storage-quota.js */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4400 + Math.floor(Math.random() * 300), B = 'http://127.0.0.1:' + PORT;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-login-'));
const SK = { 'X-Superadmin-Key': 'k' };
const j = async (method, url, body, h) => {
  const r = await fetch(B + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch (e) { d = null; }
  return { s: r.status, d };
};
const auth = (t) => ({ Authorization: 'Bearer ' + t });

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'cloud', 'server.js')], {
    cwd: path.join(__dirname, '..', 'cloud'),
    env: Object.assign({}, process.env, { DB_ADAPTER: 'sqlite', PORT: String(PORT), SQLITE_PATH: path.join(dir, 't.db'), DATA_DIR: dir, SUPERADMIN_KEY: 'k', SESSION_SECRET: 'x', ADMIN_PASSWORD: 'admin123', PHARMACY_URL: 'https://pharmacy.example', CORS_ORIGINS: 'https://example.org', MAIL_DEBUG_FILE: path.join(dir, 'mail.jsonl') }),
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(B + '/api/health'); if (r.ok) break; } catch (e) { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
    let r = await j('POST', '/api/saas/signup', { labName: 'Quota Co', ownerName: 'Owner', email: 'o@q.pk', slug: 'quota-co', username: 'owner', password: 'secret1' });
    assert.equal(r.s, 200, 'signup'); const labId = r.d.lab.id;
    r = await j('POST', '/api/auth/login', { username: 'owner', password: 'secret1', lab: 'quota-co' });
    const A = auth(r.d.token);
    const pdf = (kb) => 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(kb * 1024, 65)]).toString('base64');
    const getLab = async () => { const x = await j('GET', '/api/saas/labs', null, SK); return { d: { lab: (x.d.labs || x.d).find((l) => l.id === labId) } }; };
    const up = (key, kb) => j('POST', '/api/report-pdfs', { key, pdfBase64: pdf(kb) }, A);

    r = await getLab();
    assert.equal(r.d.lab.limits.storageMb, 200, 'trial plan default is 200 MB'); assert.equal(r.d.lab.usage.storageBytes, 0, 'nothing stored yet');

    /* a tiny limit of 1 MB set by the superadmin for this lab */
    r = await j('PUT', '/api/saas/labs/' + labId, { limitStorageMb: 1 }, SK); assert.equal(r.s, 200); assert.equal(r.d.lab.limits.storageMb, 1);
    assert.equal((await up('rep-aaaa', 600)).s, 200, 'first report fits');
    r = await up('rep-bbbb', 600); assert.equal(r.s, 413, 'second one does not fit'); assert.equal(r.d.code, 'LIMIT_STORAGE');
    assert.equal((await up('rep-aaaa', 700)).s, 200, 'replacing the same key counts only the difference');
    r = await getLab();
    assert.ok(r.d.lab.usage.storageBytes > 700 * 1024 && r.d.lab.usage.storageBytes < 800 * 1024, 'usage is the bytes of the stored report');

    /* clearing the override goes back to the plan; 0 = unlimited */
    r = await j('PUT', '/api/saas/labs/' + labId, { limitStorageMb: '' }, SK); assert.equal(r.d.lab.limits.storageMb, 200, 'cleared = plan default');
    assert.equal((await up('rep-bbbb', 600)).s, 200, 'fits again');
    r = await j('PUT', '/api/saas/labs/' + labId, { limitStorageMb: 0 }, SK); assert.equal(r.d.lab.limits.storageMb, 0, '0 = unlimited');

    /* the plan list carries the storage of every plan */
    r = await j('PUT', '/api/saas/settings', { plans: { starter: { storageMb: 750 } } }, SK);
    r = await j('GET', '/api/saas/plans'); assert.equal(r.d.plans.starter.storageMb, 750, 'plan storage editable'); assert.equal(r.d.plans.pro.storageMb, 5000);

    console.log('PASS: storage quota: plan limit, per-lab override, 413 when full, same-key replace, usage, plan list');
  } finally {
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
