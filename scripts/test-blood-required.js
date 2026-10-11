/* A NEW patient created through the API must carry a real blood group; edits, walk-in package patients and bulk imports are not blocked.
   Run: node scripts/test-blood-required.js */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const PORT = 4900 + Math.floor(Math.random() * 90), B = 'http://127.0.0.1:' + PORT;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blood-req-'));
const j = async (m, u, body, tok) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: body ? JSON.stringify(body) : undefined }); let d = null; try { d = await r.json(); } catch (e) { d = null; } return { s: r.status, d }; };
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'cloud', 'server.js')], { cwd: path.join(__dirname, '..', 'cloud'),
    env: Object.assign({}, process.env, { DB_ADAPTER: 'sqlite', PORT: String(PORT), SQLITE_PATH: path.join(dir, 't.db'), DATA_DIR: dir, SUPERADMIN_KEY: 'k', SESSION_SECRET: 'x', ADMIN_PASSWORD: 'admin12345' }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(B + '/api/health'); if (r.ok) break; } catch (e) { /* not up */ } await new Promise((r) => setTimeout(r, 250)); }
    const tok = (await j('POST', '/api/auth/login', { username: 'admin', password: 'admin12345' })).d.token;
    let n = 0; const base = () => ({ id: 'P-T' + (++n), name: 'Test Patient', age: 30, gender: 'Male', phone: '' });
    for (const bad of [undefined, '', 'Unknown', 'select blood group', 'N/A', '-']) {
      const r = await j('POST', '/api/patients', Object.assign({}, base(), bad === undefined ? {} : { blood: bad }), tok);
      assert.equal(r.s, 400, 'blood ' + JSON.stringify(bad) + ' must be refused'); assert.equal(r.d.code, 'BLOOD_REQUIRED');
    }
    let r = await j('POST', '/api/patients', Object.assign({}, base(), { blood: 'O+' }), tok); assert.equal(r.s, 200, 'a real group saves: ' + JSON.stringify(r.d)); const id = r.d.id;
    r = await j('PUT', '/api/patients/' + id, Object.assign({}, r.d, { notes: 'edited' }), tok); assert.equal(r.s, 200, 'editing an existing patient is never blocked');
    r = await j('POST', '/api/patients', { id: 'P-W1', name: 'Walk-in (10:00)', gender: 'Other', age: 30, notes: 'Created via Quick Package Deal (CBC pack)' }, tok); assert.equal(r.s, 200, 'the package walk-in patient is allowed without a group');
    r = await j('POST', '/api/bulk/patients', { rows: [{ id: 'P9001', name: 'Imported', age: 40 }] }, tok); assert.equal(r.s, 200, 'bulk imports / old-client sync are not blocked');
    console.log('PASS: blood group required on new patients (server): refused without a real group, edits/walk-in/bulk unaffected');
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
