/* One login for the Lab and the Pharmacy POS: products per business, apps per user, app list in the login answer,
   one-time SSO tickets between the two sites, and the lab-data lock for users without the lab app.
   Starts its own throw-away cloud server (sqlite, temp folder). Run: node scripts/test-central-login.js */
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

    /* a new business starts with the lab only; its admin can open only the lab */
    let r = await j('POST', '/api/saas/signup', { labName: 'Both Co', ownerName: 'Owner', email: 'o@both.pk', slug: 'both-co', username: 'owner', password: 'secret1' });
    assert.equal(r.s, 200, 'signup'); const labId = r.d.lab.id;
    r = await j('POST', '/api/auth/login', { username: 'owner', password: 'secret1', lab: 'both-co' });
    assert.deepEqual(r.d.apps, ['lab'], 'default business has the lab only');
    const adminTok = r.d.token;

    /* superadmin gives the business the Pharmacy too */
    r = await j('PUT', '/api/saas/labs/' + labId, { products: ['pharmacy', 'lab'] }, SK);
    assert.equal(r.s, 200, 'superadmin sets products'); assert.deepEqual(r.d.lab.products, ['lab', 'pharmacy'], 'products kept in a fixed order');
    r = await j('PUT', '/api/saas/labs/' + labId, { products: ['crm'] }, SK); assert.equal(r.s, 400, 'unknown product refused');
    r = await j('PUT', '/api/saas/labs/' + labId, { products: [] }, SK); assert.equal(r.s, 400, 'empty product list refused');
    r = await j('POST', '/api/auth/login', { username: 'owner', password: 'secret1', lab: 'both-co' });
    assert.deepEqual(r.d.apps, ['lab', 'pharmacy'], 'the admin gets every product the business has');
    const A = auth(r.d.token);

    /* the admin decides who gets what */
    const mk = async (u, apps, extra) => j('POST', '/api/users', Object.assign({ id: 'U-' + u, username: u, name: u, role: 'reception', password: 'pass1234', apps }, extra || {}), A);
    assert.equal((await mk('both', ['lab', 'pharmacy'])).s, 200, 'user with both apps');
    assert.equal((await mk('pharm', ['pharmacy'], { pharmacyRole: 'CASHIER' })).s, 200, 'pharmacy-only user');
    assert.equal((await mk('plain', undefined)).s, 200, 'user without a list');
    assert.equal((await mk('bad', ['crm'])).s, 400, 'unknown app refused');
    assert.equal((await mk('none', [])).s, 400, 'empty app list refused');
    const login = (u) => j('POST', '/api/auth/login', { username: u, password: 'pass1234', lab: 'both-co' });
    assert.deepEqual((await login('both')).d.apps, ['lab', 'pharmacy']);
    r = await login('pharm'); assert.deepEqual(r.d.apps, ['pharmacy']); assert.equal(r.d.user.pharmacyRole, 'CASHIER', 'pharmacy role travels with the login');
    assert.equal(r.d.user.username, 'pharm', 'the username travels with the login (the pharmacy app needs it for its local account)');
    const pharmTok = r.d.token;
    assert.deepEqual((await login('plain')).d.apps, ['lab'], 'a user without a list gets the lab only, never the pharmacy by default');

    /* the public face of the suite: the main website reads this without signing in */
    const pub = await fetch(B + '/api/suite/products', { headers: { Origin: 'https://some-website.example' } }); const pj = await pub.json();
    assert.equal(pub.status, 200); assert.equal(pub.headers.get('access-control-allow-origin'), '*', 'any website may read the public product list');
    assert.deepEqual(pj.products.map((p) => p.id), ['lab', 'pharmacy', 'hospital']);
    const labP = pj.products.find((p) => p.id === 'lab'); assert.ok(labP.desc.length > 20 && labP.features.length >= 3 && labP.downloads.some((d) => d.platform === 'android'), 'product info and downloads are there');
    assert.ok(!('roles' in labP), 'roles stay private'); assert.match(labP.url, /\/app\/$/, 'the lab app address is the hub site');
    assert.equal(pj.products.find((p) => p.id === 'pharmacy').url, 'https://pharmacy-pos.ellahabad.workers.dev', 'the pharmacy address comes from the registry');
    /* the product list is a registry: the superadmin can add a product, pick roles for it, and give a business access */
    r = await j('GET', '/api/saas/products', null, SK); assert.equal(r.s, 200); assert.deepEqual(r.d.products.map((p) => p.id), ['lab', 'pharmacy', 'hospital']);
    assert.ok([401, 403].includes((await j('GET', '/api/saas/products')).s), 'registry is superadmin only');
    const reg = r.d.products.concat([{ id: 'crm', name: 'Optix CRM', sub: 'Leads and follow-ups', color: '#7c3aed', icon: 'users', url: 'https://crm.example.pk', roles: [{ value: 'agent', label: 'Agent' }, { value: 'MANAGER', label: 'Manager' }] }]);
    assert.equal((await j('PUT', '/api/saas/products', { products: reg.filter((p) => p.id !== 'lab') }, SK)).s, 400, 'the lab product cannot be removed');
    assert.equal((await j('PUT', '/api/saas/products', { products: reg.concat([{ id: 'Bad Id', name: 'x', url: 'https://x.pk' }]) }, SK)).s, 400, 'bad product id refused');
    assert.equal((await j('PUT', '/api/saas/products', { products: reg.map((p) => p.id === 'crm' ? Object.assign({}, p, { url: 'ftp://nope' }) : p) }, SK)).s, 400, 'product needs an https address');
    assert.equal((await j('PUT', '/api/saas/products', { products: reg.map((p) => p.id === 'crm' ? Object.assign({}, p, { downloads: [{ platform: 'windows', label: 'Setup', url: 'ftp://x' }] }) : p) }, SK)).s, 400, 'a download needs an https address');
    r = await j('PUT', '/api/saas/products', { products: reg }, SK); assert.equal(r.s, 200, 'product added'); assert.deepEqual(r.d.products.find((p) => p.id === 'crm').roles.map((x) => x.value), ['AGENT', 'MANAGER'], 'role values are normalised');
    const crmPre = await fetch(B + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://crm.example.pk', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(crmPre.headers.get('access-control-allow-origin'), 'https://crm.example.pk', 'a product added in the registry is allowed to call the API from its own address');
    r = await j('PUT', '/api/saas/labs/' + labId, { products: ['lab', 'pharmacy', 'crm'] }, SK); assert.equal(r.s, 200); assert.deepEqual(r.d.lab.products, ['lab', 'pharmacy', 'crm']);
    assert.deepEqual(r.d.lab.productInfo.map((p) => p.id), ['lab', 'pharmacy', 'crm'], 'the business view carries the product info for the admin screens');
    r = await login('both'); assert.deepEqual(r.d.apps, ['lab', 'pharmacy'], 'an existing user does not get the new product by themselves');
    assert.equal((await j('PUT', '/api/users/U-both', { apps: ['lab', 'crm'], appRoles: { crm: 'AGENT' } }, A)).s, 200, 'admin gives the new product + its role');
    assert.equal((await j('PUT', '/api/users/U-both', { appRoles: { crm: 'GOD' } }, A)).s, 400, 'a role the product does not list is refused');
    assert.equal((await j('PUT', '/api/users/U-both', { appRoles: { nope: 'X' } }, A)).s, 400, 'a role for an unknown app is refused');
    r = await login('both'); assert.deepEqual(r.d.apps, ['lab', 'crm']); assert.deepEqual(r.d.catalog.map((p) => p.id), ['lab', 'crm'], 'the login answer lists the apps to draw'); assert.deepEqual(r.d.user.appRoles, { crm: 'AGENT' });
    const crmTok = r.d.token;
    r = await j('POST', '/api/sso/ticket', { app: 'crm' }, auth(crmTok)); assert.match(r.d.url, /^https:\/\/crm\.example\.pk\/#\/sso\?ticket=[0-9a-f]{48}$/, 'ticket goes to the product address from the registry');
    r = await j('POST', '/api/sso/exchange', { ticket: r.d.ticket }); assert.equal(r.d.app, 'crm'); assert.equal(r.s, 200);
    r = await j('GET', '/api/auth/whoami', null, auth(crmTok)); assert.equal(r.s, 200, 'a product backend can ask who a token belongs to');
    assert.equal(r.d.user.username, 'both'); assert.equal(r.d.lab.slug, 'both-co'); assert.deepEqual(r.d.apps, ['lab', 'crm']);
    assert.equal((await j('GET', '/api/auth/whoami')).s, 401, 'whoami needs a token');
    await j('PUT', '/api/users/U-both', { apps: ['lab', 'pharmacy'], appRoles: { crm: null } }, A);

    /* a staff member cannot widen their own access */
    const bothTok = (await login('both')).d.token;
    r = await j('PUT', '/api/users/U-plain', { apps: ['lab', 'pharmacy'] }, auth((await login('plain')).d.token));
    assert.ok(r.s === 200 || r.s === 403, 'self edit answered');
    assert.deepEqual((await login('plain')).d.apps, ['lab'], 'staff cannot give themselves the pharmacy');

    /* the pharmacy-only user is locked out of lab data but can still use the shared messaging */
    assert.equal((await j('GET', '/api/patients', null, auth(pharmTok))).s, 403, 'no lab data without the lab app');
    assert.equal((await j('GET', '/api/patients', null, auth(bothTok))).s, 200, 'lab data with the lab app');
    assert.equal((await j('GET', '/api/wa/status', null, auth(pharmTok))).s, 200, 'WhatsApp status is shared');
    assert.equal((await j('GET', '/api/sms/status', null, auth(pharmTok))).s, 200, 'SIM SMS status is shared');
    r = await j('GET', '/api/saas/me', null, auth(pharmTok)); assert.deepEqual(r.d.apps, ['pharmacy']);

    /* shared email: any signed-in user of the business can send a plain message through the business mailbox */
    r = await j('POST', '/api/mail/send', { to: 'customer@example.pk', subject: 'Your order', text: 'Hello from the pharmacy' }, auth(pharmTok));
    assert.equal(r.s, 200, 'plain email sent'); assert.match(fs.readFileSync(path.join(dir, 'mail.jsonl'), 'utf8'), /Hello from the pharmacy/);
    assert.equal((await j('POST', '/api/mail/send', { to: 'not-an-email', subject: 's', text: 't' }, auth(pharmTok))).s, 400, 'bad address refused');
    assert.equal((await j('POST', '/api/mail/send', { to: 'a@b.pk', subject: '', text: 't' }, auth(pharmTok))).s, 400, 'empty subject refused');
    assert.equal((await j('POST', '/api/mail/send', { to: 'a@b.pk', subject: 's', text: 't' })).s, 401, 'email needs a signed-in user');

    /* one-time tickets */
    r = await j('POST', '/api/sso/ticket', { app: 'pharmacy' }, auth(bothTok));
    assert.equal(r.s, 200); assert.match(r.d.url, /^https:\/\/pharmacy\.example\/#\/sso\?ticket=[0-9a-f]{48}$/);
    const t1 = r.d.ticket;
    r = await j('POST', '/api/sso/exchange', { ticket: t1 });
    assert.equal(r.s, 200, 'ticket exchanged'); assert.equal(r.d.app, 'pharmacy'); assert.deepEqual(r.d.apps, ['lab', 'pharmacy']);
    assert.equal((await j('GET', '/api/saas/me', null, auth(r.d.token))).s, 200, 'the exchanged token works');
    assert.equal((await j('POST', '/api/sso/exchange', { ticket: t1 })).s, 401, 'a ticket works once');
    assert.equal((await j('POST', '/api/sso/exchange', { ticket: 'f'.repeat(48) })).s, 401, 'unknown ticket');
    assert.equal((await j('POST', '/api/sso/ticket', { app: 'lab' }, auth(pharmTok))).s, 403, 'no ticket for an app the user does not have');
    assert.equal((await j('POST', '/api/sso/ticket', { app: 'pharmacy' }, auth(pharmTok))).s, 200, 'ticket for an allowed app');
    assert.equal((await j('POST', '/api/sso/ticket', { app: 'pharmacy' })).s, 401, 'ticket needs a signed-in user');
    r = await j('POST', '/api/sso/ticket', { app: 'lab' }, auth(bothTok)); assert.match(r.d.url, /\/app\/#\/sso\?ticket=/, 'ticket back into the lab site');

    /* disabling the user kills a ticket that is still unused */
    r = await j('POST', '/api/sso/ticket', { app: 'pharmacy' }, auth(pharmTok)); const t2 = r.d.ticket;
    await j('PUT', '/api/users/U-pharm', { active: false }, A);
    assert.equal((await j('POST', '/api/sso/exchange', { ticket: t2 })).s, 401, 'inactive user cannot use a ticket');

    /* taking the pharmacy away from the business shrinks everybody's apps */
    await j('PUT', '/api/saas/labs/' + labId, { products: ['lab'] }, SK);
    assert.deepEqual((await login('both')).d.apps, ['lab'], 'user apps follow the business products');

    /* CORS lets the pharmacy site call the API */
    const pre = await fetch(B + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://pharmacy-pos.ellahabad.workers.dev', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://pharmacy-pos.ellahabad.workers.dev', 'pharmacy origin allowed');
    const bad = await fetch(B + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert.ok(!bad.headers.get('access-control-allow-origin'), 'other origins are not allowed');

    console.log('PASS: central login: business products, per-user apps, login answer, one-time SSO tickets, lab-data lock, shared messaging, CORS');
  } finally {
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
