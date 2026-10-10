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

/* multi-branch: every lab may run up to this many branches by default (per-lab override lives on lab.maxBranches) */
const DEFAULT_MAX_BRANCHES = 5;
/* ONE account system for a suite of products (like a ManageEngine / Zoho suite): every product keeps its own website and backend; this hub
   knows which products exist (the registry below, editable in the superadmin console), which ones a business has, and which a user may open.
   'lab' is the product that hosts the hub today; it cannot be removed. */
const PRODUCT_ICONS = ['flask', 'pill', 'cart', 'truck', 'users', 'chart', 'box', 'file'];
const DEFAULT_PRODUCTS = [
  { id: 'lab', name: 'Blood Test Lab', sub: 'Patients, tests, reports and invoices', color: '#0ea5a4', icon: 'flask', url: '', roles: [], host: true },
  { id: 'pharmacy', name: 'Pharmacy POS', sub: 'Medicines, stock and billing counter', color: '#2f6df6', icon: 'pill',
    url: 'https://pharmacy-pos.ellahabad.workers.dev', host: false,
    roles: [{ value: 'ADMIN', label: 'Admin' }, { value: 'MANAGER', label: 'Manager' }, { value: 'PHARMACIST', label: 'Pharmacist' }, { value: 'CASHIER', label: 'Cashier' }] },
];
const PRODUCT_ID_RE = /^[a-z][a-z0-9-]{1,19}$/;
/* validate / normalise an edited registry; throws a readable Error */
function cleanProducts(list) {
  if (!Array.isArray(list) || !list.length || list.length > 20) throw new Error('Give between 1 and 20 products.');
  const seen = {}, out = list.map((p) => {
    p = p || {};
    const id = String(p.id || '').trim().toLowerCase();
    if (!PRODUCT_ID_RE.test(id)) throw new Error('Product id "' + id + '" must be 2-20 letters / digits / dashes, starting with a letter.');
    if (seen[id]) throw new Error('Product id "' + id + '" is used twice.'); seen[id] = 1;
    const name = String(p.name || '').trim().slice(0, 40); if (!name) throw new Error('Product "' + id + '" needs a name.');
    const color = /^#[0-9a-fA-F]{6}$/.test(String(p.color || '')) ? String(p.color).toLowerCase() : '#475569';
    const url = String(p.url || '').trim().replace(/\/+$/, '').slice(0, 200);
    if (id !== 'lab' && !/^https:\/\/[^\s/]+(\/[^\s]*)?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?$/.test(url)) throw new Error('Product "' + id + '" needs its web address (https://...).');
    const roles = (Array.isArray(p.roles) ? p.roles : []).slice(0, 10).map((r) => ({ value: String((r && r.value) || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30), label: String((r && r.label) || '').trim().slice(0, 40) }))
      .filter((r) => r.value).map((r) => ({ value: r.value, label: r.label || r.value }));
    return { id, name, sub: String(p.sub || '').trim().slice(0, 80), color, icon: PRODUCT_ICONS.indexOf(p.icon) >= 0 ? p.icon : 'box', url: id === 'lab' ? '' : url, roles, host: id === 'lab' };
  });
  if (!seen.lab) throw new Error('The lab product cannot be removed.');
  return out;
}
/* per-module feature gating: keys mirror the app.js NAV; lab.features stores only explicit `false` overrides (absent = enabled) */
const FEATURE_KEYS = ['dashboard', 'patients', 'samples', 'inventory', 'results', 'tests', 'packages', 'outsourced',
  'invoices', 'dues', 'discounts', 'onlinepay', 'panels', 'doctors', 'expenses', 'finance',
  'reports', 'downloads', 'email', 'whatsapp', 'sms', 'audit', 'subscription', 'settings'];

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
  /* ---------- product registry (suite) ---------- */
  let PRODUCT_LIST = DEFAULT_PRODUCTS.map((p) => Object.assign({}, p));
  async function loadProducts() {
    try { const v = await raw.getMeta('saas_products'); if (Array.isArray(v) && v.length) PRODUCT_LIST = cleanProducts(v); } catch (e) { /* keep the defaults */ }
    return PRODUCT_LIST;
  }
  async function setProducts(list) { const c = cleanProducts(list); await raw.setMeta('saas_products', c); PRODUCT_LIST = c; return c; }
  const getProducts = () => PRODUCT_LIST.map((p) => Object.assign({}, p));
  const productIds = () => PRODUCT_LIST.map((p) => p.id);
  /* what the apps may show about a product (the address stays on the server) */
  const catalogFor = (ids) => PRODUCT_LIST.filter((p) => !ids || ids.indexOf(p.id) >= 0).map((p) => ({ id: p.id, name: p.name, sub: p.sub, color: p.color, icon: p.icon, roles: p.roles, host: !!p.host }));
  const productById = (id) => PRODUCT_LIST.filter((p) => p.id === id)[0] || null;
  function productsOf(lab) {
    const ids = productIds(), p = lab && Array.isArray(lab.products) ? lab.products.filter((x) => ids.indexOf(x) >= 0) : [];
    return p.length ? ids.filter((x) => p.indexOf(x) >= 0) : ['lab'];
  }
  /* the apps one user can open: what the business has, narrowed by user.apps. A user without an explicit list gets every product if they are
     the admin, otherwise only the lab (so switching a product on never opens it to everyone). */
  function appsFor(lab, user) {
    const prod = productsOf(lab);
    const want = user && Array.isArray(user.apps) ? user.apps : (user && user.role === 'admin' ? prod : ['lab']);
    return prod.filter((x) => want.indexOf(x) >= 0);
  }
  /* the per-product roles a user holds: user.appRoles = { pharmacy: 'CASHIER' } (plus the older user.pharmacyRole) */
  function appRolesOf(user) {
    const r = Object.assign({}, user && user.appRoles && typeof user.appRoles === 'object' ? user.appRoles : {});
    if (user && user.pharmacyRole && !r.pharmacy) r.pharmacy = user.pharmacyRole;
    return r;
  }

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
  async function saveLab(l) { await raw.put(LABS_T, l); (await loadLabs()).set(l.id, l); return l; } /* raw.put stores the whole row: maxBranches / features survive the save */
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
    await loadProducts();
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
    const users = (await st.all('users')).filter(u => u.active !== false && u.role !== 'doctor').length; /* doctor logins do not use up a staff seat */
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
    return { users: lab.limitUsers != null ? lab.limitUsers : p.users, invoicesPerMonth: lab.limitInvoices != null ? lab.limitInvoices : p.invoicesPerMonth,
      maxBranches: lab.maxBranches != null ? lab.maxBranches : DEFAULT_MAX_BRANCHES };
  }
  /* effective feature map: all-true defaults, then lab.features overrides (only `false` is stored; absent = enabled) */
  function getFeatures(lab) {
    const overrides = (lab && lab.features) || {};
    const out = {};
    for (const k of FEATURE_KEYS) out[k] = overrides[k] !== false;
    return out;
  }
  async function setFeatures(lab, features) {
    const overrides = {};
    for (const k of FEATURE_KEYS) if (features && features[k] === false) overrides[k] = false;
    lab.features = overrides;
    await saveLab(lab);
    return getFeatures(lab);
  }
  async function view(lab, withUsage) {
    const plans = await getPlans();
    const v = {
      id: lab.id, slug: lab.slug, name: lab.name, ownerName: lab.ownerName || '', ownerEmail: lab.ownerEmail || '', phone: lab.phone || '',
      plan: lab.plan, planName: (plans[lab.plan] || {}).name || lab.plan, status: effStatus(lab), rawStatus: lab.status,
      trialEndsAt: lab.trialEndsAt || null, paidUntil: lab.paidUntil || null, daysLeft: daysLeft(lab), createdAt: lab.createdAt,
      notes: lab.notes || '', legacy: !!lab.legacy, limits: await limitsOf(lab), maxBranches: lab.maxBranches != null ? lab.maxBranches : DEFAULT_MAX_BRANCHES,
      features: getFeatures(lab), history: lab.history || [], products: productsOf(lab), productInfo: catalogFor(productsOf(lab)),
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
        maxBranches: DEFAULT_MAX_BRANCHES, features: {},
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

  return { LABS_T, PAY_T, DAY, DEFAULT_PLANS, FEATURE_KEYS, DEFAULT_MAX_BRANCHES, getSettings, getPlans, loadLabs, saveLab, getLab, findBySlug, storeFor, bootstrap, effStatus, daysLeft,
    usageOf, limitsOf, view, createLab, purgeLab, addPeriod, addHistory, getFeatures, setFeatures, slugify, SLUG_RE, RESERVED, raw, productsOf, appsFor, appRolesOf, getProducts, setProducts, productIds, catalogFor, productById, loadProducts };
}

module.exports = { create, slugify, DEFAULT_PLANS, DEFAULT_SETTINGS, FEATURE_KEYS, DEFAULT_MAX_BRANCHES, DEFAULT_PRODUCTS, PRODUCT_ICONS, cleanProducts };
