/* "Sign up / sign in with Google" for products: the hub verifies a Google credential (against a fake tokeninfo server, no network),
   says who it is, and can start a new business with the apps the sign-up form asked for. Run: node scripts/test-google-verify.js */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4700 + Math.floor(Math.random() * 200), FAKE = PORT + 300, B = 'http://127.0.0.1:' + PORT;
const CID = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'google-verify-'));
const j = async (method, url, body) => {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch (e) { d = null; }
  return { s: r.status, d };
};
(async () => {
  /* a fake Google tokeninfo endpoint: credentials are plain words */
  const people = { good: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 600), email: 'sara@example.com', email_verified: 'true', name: 'Sara Khan', sub: '1' },
    other: { aud: 'someone-else.apps.googleusercontent.com', iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 600), email: 'x@example.com', email_verified: 'true', name: 'X', sub: '2' },
    unverified: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 600), email: 'u@example.com', email_verified: 'false', name: 'U', sub: '3' } };
  const fake = http.createServer((req, res) => { const id = new URL(req.url, 'http://x').searchParams.get('id_token') + ''; const p = people[id.replace(/^(.{0,20}).*/, '$1').replace(/x+$/, '')]; if (!p) { res.writeHead(400); return res.end('{}'); } res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(p)); });
  await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));
  const pad = (w) => w + 'x'.repeat(12); /* credentials must look long enough */
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'cloud', 'server.js')], { cwd: path.join(__dirname, '..', 'cloud'),
    env: Object.assign({}, process.env, { DB_ADAPTER: 'sqlite', PORT: String(PORT), SQLITE_PATH: path.join(dir, 't.db'), DATA_DIR: dir, SUPERADMIN_KEY: 'k', SESSION_SECRET: 'x', ADMIN_PASSWORD: 'admin12345', GOOGLE_CLIENT_ID: CID, GOOGLE_TOKENINFO_URL: 'http://127.0.0.1:' + FAKE }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(B + '/api/health'); if (r.ok) break; } catch (e) { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
    let r = await j('POST', '/api/auth/google-verify', { credential: pad('good') });
    assert.equal(r.s, 200); assert.equal(r.d.email, 'sara@example.com'); assert.equal(r.d.name, 'Sara Khan'); assert.ok(!('token' in r.d), 'verification opens nothing');
    r = await j('POST', '/api/auth/google-verify', { credential: pad('other') }); assert.equal(r.s, 400, 'a credential made for another Client ID is refused');
    r = await j('POST', '/api/auth/google-verify', { credential: pad('unverified') }); assert.equal(r.s, 400, 'an unverified Gmail is refused');
    r = await j('POST', '/api/auth/google-verify', { credential: 'short' }); assert.equal(r.s, 400);
    /* sign-up with Google starting the apps the form asked for */
    r = await j('GET', '/api/suite/products'); const ids = r.d.products.map((p) => p.id); assert.ok(ids.includes('pharmacy'));
    r = await j('POST', '/api/saas/google-signup', { credential: pad('good'), labName: 'Sara Pharmacy', products: ['pharmacy', 'nonsense'] });
    assert.equal(r.s, 200, 'google sign-up: ' + JSON.stringify(r.d)); assert.deepEqual(r.d.lab.products, ['pharmacy'], 'only registry products, as chosen');
    assert.deepEqual(r.d.apps, ['pharmacy'], 'the owner can open exactly those apps');
    r = await j('POST', '/api/saas/google-signup', { credential: pad('good'), labName: 'Second try' });
    assert.ok(r.s === 200 || r.s === 400 || r.s === 409, 'same Gmail again is handled, not a crash');
    console.log('PASS: google verify: verified identity only, wrong client / unverified refused, sign-up starts the chosen apps');
  } finally { srv.kill(); fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
