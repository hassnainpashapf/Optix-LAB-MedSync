/* LabPOS SaaS layer — many labs (tenants) on one cloud.
   - registry of labs (plan, status, trial / paid-until) in the shared kv table `_saas_labs`
   - per-lab isolated stores (tenant-store.js); the original single-lab data is tenant "main" (empty prefix)
   - self-service signup with a free trial, plan limits (users / invoices per month), subscription status gating
   - manual payment flow (JazzCash / Easypaisa / bank transfer): the lab submits a payment reference, the operator
     approves it in the superadmin console and the subscription is extended
   Everything is stored through the same adapter as the lab data, so it works on Postgres and SQLite alike. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { wrapStore } = require('./sync-store');
const { scopeStore } = require('./tenant-store');

const LABS_T = '_saas_labs';   /* registry rows */
const PAY_T = '_saas_pay';     /* payment requests */
const DAY = 86400000;
const GRACE_DAYS = 3;          /* after paidUntil, still fully usable for a few days */
const RESERVED = ['admin', 'api', 'app', 'www', 'superadmin', 'support', 'help', 'login', 'signup', 'demo', 'test', 'optix', 'system', 'root', 'static', 'assets'];

const DEFAULT_PLANS = {
  trial:      { name: 'Free Trial',   monthly: 0,    yearly: 0,     users: 5,  invoicesPerMonth: 500,  desc: 'Everything unlocked for 14 days' },
  starter:    { name: 'Starter',      monthly: 2500, yearly: 25000, users: 3,  invoicesPerMonth: 300,  desc: 'Small collection centre' },
  pro:        { name: 'Professional', monthly: 6000, yearly: 60000, users: 10, invoicesPerMonth: 3000, desc: 'Busy diagnostic lab' },
  enterprise: { name: 'Enterprise',   monthly: 0,    yearly: 0,     users: 0,  invoicesPerMonth: 0,    desc: 'Chains & hospitals — unlimited, custom pricing' },
};
const DEFAULT_SETTINGS = {
  trialDays: 14,
  supportPhone: '', supportEmail: '', supportWhatsapp: '',
  payInstructions: 'Pay by JazzCash / Easypaisa / bank transfer, then submit the transaction ID here. Your plan is activated within a few hours.',
  payMethods: [], /* [{ name:'JazzCash', account:'03xx-xxxxxxx', title:'Account title' }] */
};

function slugify(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_RE = /^[a-zA-Z0-9._-]{3,30}$/;

function create(ctx) {
  const { raw, TABLES, hashPassword, defaultsFor } = ctx;
  const cache = { labs: null, stores: new Map() };
  const pendingSlugs = new Set(); /* slugs being created right now: reserved before the (slow) seeding so two signups cannot take the same one */

  /* ---------- settings / plans ---------- */
  async function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, (await raw.getMeta('saas_settings')) || {}); }
  async function getPlans() {
    const o = (await raw.getMeta('saas_plans')) || {};
    const out = {};
    for (const k of Object.keys(DEFAULT_PLANS)) out[k] = Object.assign({}, DEFAULT_PLANS[k], o[k] || {});
    return out;
  }

  /* ---------- registry ---------- */
  async function loadLabs(force) {
    if (cache.labs && !force) return cache.labs;
    const rows = await raw.all(LABS_T);
    cache.labs = new Map(rows.map(r => [r.id, r]));
    return cache.labs;
  }
  async function saveLab(l) { await raw.put(LABS_T, l); (await loadLabs()).set(l.id, l); return l; }
  async function getLab(id) { return (await loadLabs()).get(id || 'main') || null; }
  async function findBySlug(slug) {
    slug = String(slug || '').trim().toLowerCase();
    for (const l of (await loadLabs()).values()) if (l.slug === slug) return l;
    return null;
  }
  function storeFor(lab) {
    let s = cache.stores.get(lab.id);
    if (!s) {
      s = wrapStore(scopeStore(raw, lab.prefix || '', TABLES), 'cloud', TABLES);
      cache.stores.set(lab.id, s);
    }
    return s;
  }
  async function addHistory(lab, action, by) {
    lab.history = (lab.history || []).concat([{ ts: new Date().toISOString(), action, by: by || 'system' }]).slice(-40);
  }

  /* make sure the original deployment exists as tenant "main" (enterprise, never expires) */
  async function bootstrap(mainStore) {
    cache.stores.set('main', mainStore); /* ONE wrapStore per tenant: its sync cursor must stay strictly increasing */
    let main = await getLab('main');
    if (!main) {
      const st = (await mainStore.get('settings', 'main')) || {};
      let slug = slugify(process.env.DEFAULT_LAB_SLUG || st.labName || 'main') || 'main';
      if (RESERVED.indexOf(slug) >= 0 && !process.env.DEFAULT_LAB_SLUG) slug = 'main';
      main = { id: 'main', slug, prefix: '', name: st.labName || 'Main Lab', ownerName: '', ownerEmail: st.email || '', phone: st.phone || '',
        plan: 'enterprise', status: 'active', trialEndsAt: null, paidUntil: null, createdAt: new Date().toISOString(), legacy: true, history: [] };
      await addHistory(main, 'Registered as the default lab');
      await saveLab(main);
      console.log('[labpos-cloud] saas: default lab registered as "' + slug + '"');
    }
    return main;
  }

  /* ---------- status / limits / usage ---------- */
  function effStatus(l) {
    if (!l) return 'suspended';
    if (l.status === 'suspended') return 'suspended';
    const now = Date.now();
    if (l.plan === 'trial') return (l.trialEndsAt && now > Date.parse(l.trialEndsAt)) ? 'expired' : 'trial';
    if (l.paidUntil && now > Date.parse(l.paidUntil) + GRACE_DAYS * DAY) return 'expired';
    return 'active';
  }
  function endOf(l) { return l.plan === 'trial' ? l.trialEndsAt : l.paidUntil; }
  function daysLeft(l) { const e = endOf(l); return e ? Math.ceil((Date.parse(e) - Date.now()) / DAY) : null; }
  async function usageOf(lab) {
    const st = storeFor(lab);
    const users = (await st.all('users')).filter(u => u.active !== false).length;
    const invoices = await st.all('invoices');
    const m = new Date(); const month = m.getFullYear() * 12 + m.getMonth();
    let invMonth = 0, last = 0;
    for (const i of invoices) {
      const d = new Date(i._c || i.createdAt || 0); /* server-set creation time first: a client-chosen createdAt cannot dodge the monthly quota */
      if (!isNaN(d) && d.getFullYear() * 12 + d.getMonth() === month) invMonth++;
      last = Math.max(last, +i._u || 0);
    }
    const patients = (await st.all('patients')).length;
    return { users, invoicesThisMonth: invMonth, invoicesTotal: invoices.length, patients, lastActivity: last ? new Date(last).toISOString() : null };
  }
  async function limitsOf(lab) {
    const p = (await getPlans())[lab.plan] || DEFAULT_PLANS.starter;
    return { users: lab.limitUsers != null ? lab.limitUsers : p.users, invoicesPerMonth: lab.limitInvoices != null ? lab.limitInvoices : p.invoicesPerMonth };
  }
  async function view(lab, withUsage) {
    const plans = await getPlans();
    const v = {
      id: lab.id, slug: lab.slug, name: lab.name, ownerName: lab.ownerName || '', ownerEmail: lab.ownerEmail || '', phone: lab.phone || '',
      plan: lab.plan, planName: (plans[lab.plan] || {}).name || lab.plan, status: effStatus(lab), rawStatus: lab.status,
      trialEndsAt: lab.trialEndsAt || null, paidUntil: lab.paidUntil || null, daysLeft: daysLeft(lab), createdAt: lab.createdAt,
      notes: lab.notes || '', legacy: !!lab.legacy, limits: await limitsOf(lab), history: lab.history || [],
    };
    if (withUsage) v.usage = await usageOf(lab);
    return v;
  }

  /* ---------- create a tenant ---------- */
  async function createLab(b, by) {
    const labName = String(b.labName || '').trim();
    const ownerName = String(b.ownerName || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const phone = String(b.phone || '').trim();
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    let slug = slugify(b.slug || labName);
    if (labName.length > 100 || ownerName.length > 100 || email.length > 254 || phone.length > 30 || password.length > 128) throw new Error('One of the fields is too long');
    if (labName.length < 3) throw new Error('Enter your lab name');
    if (!ownerName) throw new Error('Enter the owner name');
    if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address');
    if (!USER_RE.test(username)) throw new Error('Username: 3-30 letters, numbers, . _ -');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    if (!SLUG_RE.test(slug)) throw new Error('Lab ID must be 3-30 letters/numbers (a hyphen is allowed in the middle)');
    if (RESERVED.indexOf(slug) >= 0 || pendingSlugs.has(slug) || await findBySlug(slug)) throw new Error('This Lab ID is already taken — try another');
    pendingSlugs.add(slug);
    let created = null;
    try {
      const settings = await getSettings();
      const id = 'l' + crypto.randomBytes(5).toString('hex');
      const now = new Date();
      const lab = { id, slug, prefix: id + '/', name: labName, ownerName, ownerEmail: email, phone, plan: 'trial', status: 'active',
        trialEndsAt: new Date(now.getTime() + (+settings.trialDays || 14) * DAY).toISOString(), paidUntil: null,
        createdAt: now.toISOString(), history: [] };
      await addHistory(lab, 'Signed up — ' + (+settings.trialDays || 14) + '-day free trial', by || 'signup');
      /* starter data: the standard test list (with normal ranges), an admin account, branding — no demo patients/invoices */
      const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
      const tests = (seed.tests || []).map(t => Object.assign({}, t));
      const st = storeFor(lab);
      created = lab;
      await st.restore({
        seq: {},
        settings: { id: 'main', labName, tagline: 'Accurate • Fast • Trusted', address: '', phone, email, invoicePrefix: 'INV', footerNote: '', currency: 'PKR', signatories: [] },
        users: [{ id: 'U-01', name: ownerName, username, password: hashPassword(password), role: 'admin', active: true, email }],
        tests: defaultsFor ? defaultsFor(tests) : tests,
      });
      await saveLab(lab);
      return lab;
    } catch (e) {
      if (created) { try { await purgeLab(created); } catch (x) { /* best effort */ } } /* never leave a half-seeded lab behind */
      throw e;
    } finally { pendingSlugs.delete(slug); }
  }

  /* remove every trace of a lab: all its tables, tombstones and audit rows, and its cached store */
  async function purgeLab(lab) {
    if (!lab || lab.id === 'main' || !lab.prefix) throw new Error('refusing to purge the default lab');
    for (const t of TABLES.concat(['_del'])) for (const r of await raw.all(lab.prefix + t)) await raw.del(lab.prefix + t, String(r.id));
    for (const k of ['seq', 'sync', 'device']) { try { await raw.setMeta(lab.prefix + k, null); } catch (e) { /* ignore */ } }
    cache.stores.delete(lab.id);
  }

  /* ---------- payments ---------- */
  function addPeriod(lab, period) {
    const base = Math.max(Date.now(), lab.paidUntil ? Date.parse(lab.paidUntil) : 0);
    return new Date(base + (period === 'yearly' ? 365 : 30) * DAY).toISOString();
  }

  return { LABS_T, PAY_T, DAY, DEFAULT_PLANS, getSettings, getPlans, loadLabs, saveLab, getLab, findBySlug, storeFor, bootstrap, effStatus, daysLeft,
    usageOf, limitsOf, view, createLab, purgeLab, addPeriod, addHistory, slugify, SLUG_RE, RESERVED, raw };
}

module.exports = { create, slugify, DEFAULT_PLANS, DEFAULT_SETTINGS };
