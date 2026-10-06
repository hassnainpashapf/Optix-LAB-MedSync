/* ============================================================
   Optix LAB MedSync — Superadmin Console
   Manages lab installations: registry, version rollout, changelog.
   API contract:
     GET  /api/labs              -> [{labId,name,version,lastSeen,platform,targetVersion}]
     POST /api/labs/:id/target   -> {version}  (sets target version for a lab)
     GET  /api/version           -> {latest,minRequired,bundleUrl,changelog}
   SaaS console (sections: SaaS Overview, Labs, Payments, Plans & Settings):
     GET  /api/saas/stats | /api/saas/labs | /api/saas/payments | /api/saas/settings
     POST /api/saas/labs, PUT|DELETE /api/saas/labs/:id, POST .../extend, .../reset-admin
     POST /api/saas/payments/:id/approve|reject, PUT /api/saas/settings
   Auth: local username + password gate (SHA-256 hash comparison; the
     plaintext password is never stored). A derived session token is kept
     in sessionStorage for this tab only and sent as the X-Superadmin-Key
     header. Base URL: window.SUPERADMIN_API || same-origin.
   ============================================================ */
(function () {
'use strict';

var API = String(window.SUPERADMIN_API || '').replace(/\/+$/, '');
var KEY_NAME = 'sa_key';
var ONLINE_MS = 15 * 60 * 1000;
var REFRESH_MS = 30000;

/* Superadmin credentials: username + SHA-256 hex of the password.
   The plaintext password is never stored in this file. */
var SA_USER = 'superadmin';
var SA_PASS_HASH = 'ce54c03eaffff4e1da3685f92d0a2b85f2cabb6cfd93616e8cbe15744ad2017d';

/* SHA-256 -> lowercase hex. Synchronous, UTF-8 safe. */
function sha256hex(str) {
  var ascii = unescape(encodeURIComponent(str));
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  var maxWord = Math.pow(2, 32), result = '';
  var words = [], bitLen = ascii.length * 8;
  var hash = [], k = [], primeCounter = 0, isComposite = {};
  for (var cand = 2; primeCounter < 64; cand++) {
    if (!isComposite[cand]) {
      for (var i = 0; i < 313; i += cand) isComposite[i] = cand;
      hash[primeCounter] = (Math.pow(cand, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(cand, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (var i = 0; i < ascii.length; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
  }
  words[words.length] = (bitLen / maxWord) | 0;
  words[words.length] = bitLen;
  for (var j = 0; j < words.length;) {
    var w = words.slice(j, j += 16), old = hash;
    hash = hash.slice(0, 8);
    for (var i2 = 0; i2 < 64; i2++) {
      var w15 = w[i2 - 15], w2 = w[i2 - 2], a = hash[0], e = hash[4];
      var t1 = hash[7] +
        (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i2] +
        (w[i2] = i2 < 16 ? w[i2] : (w[i2 - 16] +
          (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) +
          w[i2 - 7] +
          (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
    }
    for (var i3 = 0; i3 < 8; i3++) hash[i3] = (hash[i3] + old[i3]) | 0;
  }
  for (var i4 = 0; i4 < 8; i4++) {
    for (var j2 = 3; j2 + 1; j2--) {
      var b = (hash[i4] >> (j2 * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}
/* Shared with the lab web app (same origin): each lab (tenant) has its own
   isolated store under 'labpos_db_' + labId. The registry 'labpos_labs_v1'
   lists all tenants. The superadmin console manages tenants here. */
var TEN_REG_KEY = 'labpos_labs_v1';
function tenKey(id) { return 'labpos_db_' + id; }

function loadTenants() {
  try {
    var r = JSON.parse(localStorage.getItem(TEN_REG_KEY) || 'null');
    if (r && Array.isArray(r.labs)) return r.labs;
  } catch (e) {}
  return [];
}
function saveTenants(labs) {
  try { localStorage.setItem(TEN_REG_KEY, JSON.stringify({ labs: labs })); } catch (e) {}
}
function tenantById(id) {
  var ts = loadTenants();
  for (var i = 0; i < ts.length; i++) if (ts[i].id === id) return ts[i];
  return null;
}
function maxSeq(rows) {
  var m = 0;
  (rows || []).forEach(function (r) {
    var mm = String(r.id || '').match(/(\d+)$/);
    if (mm) m = Math.max(m, parseInt(mm[1], 10));
  });
  return m;
}

/* Build a fresh, fully isolated store for a new tenant lab.
   The test/doctor catalog is deep-cloned from the default lab's store so every
   tenant starts with the same catalog — but as its own copy (never shared).
   Falls back to a minimal built-in catalog when no source lab exists. */
function seedTenantStore(lab, admin) {
  var src = null;
  try { src = JSON.parse(localStorage.getItem(tenKey('lab1')) || 'null'); } catch (e) { src = null; }
  if (!src || !Array.isArray(src.tests) || !src.tests.length) {
    var ts = loadTenants();
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].id === lab.id) continue;
      try { src = JSON.parse(localStorage.getItem(tenKey(ts[i].id)) || 'null'); } catch (e2) { src = null; }
      if (src && Array.isArray(src.tests) && src.tests.length) break;
      src = null;
    }
  }
  var tests, doctors;
  if (src) {
    tests = JSON.parse(JSON.stringify(src.tests || []));
    doctors = JSON.parse(JSON.stringify(src.doctors || []));
  } else {
    tests = [
      { id: 'T-001', code: 'CBC', name: 'Complete Blood Count', category: 'Hematology', price: 800, sampleType: 'Blood', tat: 'Same day', active: true, params: [] },
      { id: 'T-002', code: 'ESR', name: 'Erythrocyte Sedimentation Rate', category: 'Hematology', price: 300, sampleType: 'Blood', tat: 'Same day', active: true, params: [] },
      { id: 'T-003', code: 'FBS', name: 'Fasting Blood Glucose', category: 'Diabetes', price: 300, sampleType: 'Blood', tat: 'Same day', active: true, params: [] },
      { id: 'T-004', code: 'HBA1C', name: 'HbA1c (Glycated Hemoglobin)', category: 'Diabetes', price: 1100, sampleType: 'Blood', tat: 'Same day', active: true, params: [] },
      { id: 'T-005', code: 'LFT', name: 'Liver Function Test', category: 'Biochemistry', price: 1200, sampleType: 'Serum', tat: 'Same day', active: true, params: [] },
      { id: 'T-006', code: 'URE', name: 'Urine Routine Examination', category: 'Urine', price: 400, sampleType: 'Urine', tat: 'Same day', active: true, params: [] }
    ];
    doctors = [];
  }
  var store = {
    seq: {
      users: 3, doctors: maxSeq(doctors), tests: maxSeq(tests),
      patients: 0, invoices: 0, payments: 0, expenses: 0, results: 0
    },
    settings: {
      id: 'main',
      labName: lab.name,
      tagline: 'Accurate • Fast • Trusted',
      address: '', phone: '', email: '',
      invoicePrefix: 'INV',
      footerNote: 'Get well soon. Reports available on counter & phone.',
      currency: 'PKR',
      whatsapp: waDefaults()
    },
    users: [
      { id: 'U-01', name: admin.name || 'Administrator', username: admin.username, password: admin.password, role: 'admin', active: true },
      { id: 'U-02', name: 'Reception', username: 'reception', password: 'rec123', role: 'reception', active: true },
      { id: 'U-03', name: 'Technician', username: 'technician', password: 'tech123', role: 'technician', active: true }
    ],
    patients: [], tests: tests, doctors: doctors,
    invoices: [], payments: [], expenses: [], results: []
  };
  try { localStorage.setItem(tenKey(lab.id), JSON.stringify(store)); } catch (e) {}
}

function createTenant(name, adminName, adminUser, adminPass) {
  var tenants = loadTenants();
  var id = 'lab' + Date.now().toString(36);
  var lab = { id: id, name: name, adminUsername: adminUser, createdAt: new Date().toISOString(), active: true };
  seedTenantStore(lab, { name: adminName, username: adminUser, password: adminPass });
  tenants.push(lab);
  saveTenants(tenants);
  return lab;
}
function deleteTenant(id) {
  var tenants = loadTenants();
  if (tenants.length <= 1) return { ok: false, msg: 'Cannot delete the last remaining lab.' };
  var kept = tenants.filter(function (t) { return t.id !== id; });
  if (kept.length === tenants.length) return { ok: false, msg: 'Lab not found.' };
  saveTenants(kept);
  try { localStorage.removeItem(tenKey(id)); } catch (e) {}
  return { ok: true };
}
function setTenantActive(id, active) {
  var tenants = loadTenants();
  var found = false;
  tenants.forEach(function (t) { if (t.id === id) { t.active = active; found = true; } });
  if (found) saveTenants(tenants);
  return found;
}

var state = {
  key: null,
  loggedIn: false,
  labs: [],
  tenants: [],
  waLab: null,
  version: null,
  apiDown: false,
  loading: false,
  loginError: '',
  lastUpdated: null,
  view: 'overview'
};
var refreshTimer = null;

/* ---------------- helpers ---------------- */

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function getStoredKey() {
  try { return sessionStorage.getItem(KEY_NAME); } catch (e) { return null; }
}
function setStoredKey(k) {
  try { sessionStorage.setItem(KEY_NAME, k); } catch (e) { /* private mode */ }
}
function clearStoredKey() {
  try { sessionStorage.removeItem(KEY_NAME); } catch (e) {}
}

/* Relative time: "just now", "5 min ago", "2 h ago", "3 d ago", or a date. */
function relTime(iso) {
  if (!iso) return 'never';
  var t = new Date(iso).getTime();
  if (isNaN(t)) return 'never';
  var diff = Date.now() - t;
  if (diff < 0) diff = 0;
  var m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' h ago';
  var d = Math.floor(h / 24);
  if (d < 7) return d + ' d ago';
  return new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOnline(lab) {
  if (!lab || !lab.lastSeen) return false;
  var t = new Date(lab.lastSeen).getTime();
  return !isNaN(t) && (Date.now() - t) < ONLINE_MS;
}

/* ---------------- API ---------------- */

function api(path, opts) {
  opts = opts || {};
  var headers = { 'X-Superadmin-Key': state.key || '' };
  if (opts.headers) for (var hk in opts.headers) if (opts.headers.hasOwnProperty(hk)) headers[hk] = opts.headers[hk];
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(API + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  }).then(function (res) {
    if (res.status === 401 || res.status === 403) {
      var err = new Error('auth');
      err.auth = true;
      throw err;
    }
    return res.json().catch(function () { return null; }).then(function (data) {
      if (!res.ok) {
        var e2 = new Error('HTTP ' + res.status);
        e2.status = res.status;
        e2.data = data;
        throw e2;
      }
      return data;
    });
  }).catch(function (err) {
    if (err && (err.auth || err.status)) throw err;
    var ne = new Error('network');
    ne.network = true;
    throw ne;
  });
}

function loadData(background) {
  if (!background) { state.loading = true; render(); }
  return api('/api/labs').then(function (labs) {
    return api('/api/version').then(function (ver) {
      state.labs = Array.isArray(labs) ? labs : [];
      state.version = ver || null;
      state.apiDown = false;
      state.loading = false;
      state.lastUpdated = new Date();
      /* Background refreshes only repaint the fleet view; other views own their forms. */
      if (background && state.view !== 'fleet') paintChrome(); else render();
    });
  }).catch(function (err) {
    state.loading = false;
    if (err && err.auth) { logout(true); return; }
    state.apiDown = true;
    if (background && state.view !== 'fleet') paintChrome(); else render();
  });
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(function () {
    if (document.hidden || !state.loggedIn) return;
    loadData(true);
  }, REFRESH_MS);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

/* ---------------- toast & modal ---------------- */

function toast(msg, kind) {
  var root = $('toast-root');
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' t-' + kind : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    el.classList.add('out');
    setTimeout(function () { el.remove(); }, 350);
  }, 3600);
}

function openModal(title, lede, bodyHtml, okLabel, onOk) {
  var root = $('modal-root');
  root.innerHTML =
    '<div class="modal-ov" id="mOv"><div class="modal" role="dialog" aria-modal="true">' +
    '<h3>' + esc(title) + '</h3>' +
    (lede ? '<p class="m-lede">' + esc(lede) + '</p>' : '') +
    bodyHtml +
    '<div class="m-foot"><button class="btn" id="mCancel">Cancel</button>' +
    '<button class="btn btn-primary" id="mOk">' + esc(okLabel || 'Confirm') + '</button></div>' +
    '</div></div>';
  $('mCancel').addEventListener('click', closeModal);
  $('mOv').addEventListener('click', function (e) { if (e.target === $('mOv')) closeModal(); });
  $('mOk').addEventListener('click', function () {
    var btn = $('mOk');
    btn.disabled = true;
    Promise.resolve(onOk()).then(closeModal, function (err) {
      btn.disabled = false;
      if (!err || !err.silent) toast(err && err.message ? err.message : 'Action failed.', 'err');
    });
  });
  var first = root.querySelector('input');
  if (first) first.focus();
}
function closeModal() { $('modal-root').innerHTML = ''; }
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    if ($('modal-root').innerHTML) { closeModal(); e.modalClosed = true; }
  }
});

/* ---------------- icons ---------------- */

var IC = {
  flask: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/></svg>',
  lab: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  wifi: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/></svg>',
  tag: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/></svg>',
  cloud: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 .4-8.98A6 6 0 0 0 6.2 8.6 4.8 4.8 0 0 0 7 18.2"/><path d="M12 12v6M9.5 15.5 12 13l2.5 2.5"/></svg>'
};

function statCard(icon, tint, label, value, sub, href) {
  return (href ? '<a class="stat stat-link" href="' + href + '">' : '<div class="stat">') +
    '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft);--sc-c:var(--' + tint + ')">' + icon + '</div>' +
    '<div class="stat-tx"><div class="lb">' + esc(label) + '</div>' +
    '<div class="vl">' + value + '</div>' +
    '<div class="dl">' + esc(sub) + '</div></div>' +
    (href ? '</a>' : '</div>');
}

/* ---------------- WhatsApp API config (shared with the lab app) ---------------- */

function waDefaults() {
  return { provider: 'ultramsg', instanceId: '', token: '', baseUrl: '', labNumber: '' };
}

function waPhone(p) {
  var d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.charAt(0) === '0') d = '92' + d.slice(1);
  return d;
}

/* Read the WhatsApp config from a tenant lab's isolated store. */
function loadWhatsapp(labId) {
  try {
    var raw = localStorage.getItem(tenKey(labId || 'lab1'));
    if (!raw) return waDefaults();
    var store = JSON.parse(raw);
    var w = store && store.settings && store.settings.whatsapp;
    return Object.assign(waDefaults(), w || {});
  } catch (e) { return waDefaults(); }
}

/* Write the WhatsApp config into a tenant lab's store, preserving everything
   else. If the app never ran in this browser, create a minimal store so the
   app's own migration/seed logic keeps working when it boots. */
function saveWhatsapp(labId, cfg) {
  var store = null;
  try { store = JSON.parse(localStorage.getItem(tenKey(labId || 'lab1')) || 'null'); } catch (e) { store = null; }
  if (!store || typeof store !== 'object') {
    store = {
      seq: { users: 0, doctors: 0, tests: 0, patients: 0, invoices: 0, payments: 0, expenses: 0, results: 0 },
      settings: { id: 'main' },
      users: [], doctors: [], tests: [], patients: [],
      invoices: [], payments: [], expenses: [], results: []
    };
  }
  if (!store.settings || typeof store.settings !== 'object') store.settings = { id: 'main' };
  store.settings.whatsapp = cfg;
  localStorage.setItem(tenKey(labId || 'lab1'), JSON.stringify(store));
}

function whatsappCardHtml() {
  var w = state.whatsapp || waDefaults();
  var tenants = loadTenants();
  var sel = state.waLab || (tenants[0] && tenants[0].id) || 'lab1';
  var opts = tenants.map(function (t) {
    return '<option value="' + esc(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' +
      esc(t.name) + (t.active === false ? ' (inactive)' : '') + '</option>';
  }).join('');
  return '<div class="card"><div class="card-h"><h3>WhatsApp API</h3>' +
    '<span class="sub">managed here — each lab app reads its own lab\'s settings</span>' +
    '<select class="select" id="waLabSel" style="max-width:220px;margin-left:auto">' + opts + '</select></div>' +
    '<div class="card-b">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:680px">' +
    '<div><label class="label" for="waProvider">API Provider</label><select class="select" id="waProvider">' +
    '<option value="ultramsg"' + (w.provider === 'ultramsg' ? ' selected' : '') + '>Ultramsg</option>' +
    '<option value="custom"' + (w.provider === 'custom' ? ' selected' : '') + '>Custom (Ultramsg-compatible)</option>' +
    '</select></div>' +
    '<div><label class="label" for="waInst">Instance ID *</label>' +
    '<input class="input" id="waInst" placeholder="e.g. instance12345" value="' + esc(w.instanceId) + '" spellcheck="false"></div>' +
    '<div><label class="label" for="waToken">API Token *</label>' +
    '<input class="input" id="waToken" type="password" placeholder="paste API token" autocomplete="new-password" value="' + esc(w.token) + '"></div>' +
    '<div id="waBaseWrap" style="' + (w.provider === 'custom' ? '' : 'display:none') + '">' +
    '<label class="label" for="waBase">API Base URL</label>' +
    '<input class="input" id="waBase" placeholder="https://api.example.com" value="' + esc(w.baseUrl) + '" spellcheck="false"></div>' +
    '<div style="grid-column:1/-1"><label class="label" for="waNum">Lab WhatsApp Number</label>' +
    '<input class="input" id="waNum" placeholder="0300-1234567" value="' + esc(w.labNumber) + '"></div>' +
    '</div>' +
    '<p style="margin-top:10px;font-size:12.5px;color:var(--muted);max-width:680px">' +
    'Used by the lab app to send reports and invoices directly to patients over WhatsApp. ' +
    'For Ultramsg: copy the Instance ID and Token from your Ultramsg dashboard, then use <strong>Test Connection</strong> — a test message is sent to the lab number above.</p>' +
    '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" id="waSave">Save WhatsApp Settings</button>' +
    '<button class="btn" id="waTest">Test Connection</button></div>' +
    '</div></div>';
}

function wireWhatsappCard() {
  var prov = $('waProvider');
  if (!prov) return;
  var labSel = $('waLabSel');
  if (labSel) labSel.addEventListener('change', function () {
    state.waLab = labSel.value;
    state.whatsapp = loadWhatsapp(state.waLab);
    renderApp(); /* re-render so the form shows the selected lab's config */
  });
  prov.addEventListener('change', function () {
    $('waBaseWrap').style.display = (prov.value === 'custom') ? '' : 'none';
  });
  $('waSave').addEventListener('click', function () {
    var cfg = {
      provider: prov.value,
      instanceId: $('waInst').value.trim(),
      token: $('waToken').value.trim(),
      baseUrl: $('waBase') ? $('waBase').value.trim() : '',
      labNumber: $('waNum').value.trim()
    };
    if (!cfg.instanceId) { toast('Enter the Instance ID.', 'err'); return; }
    if (!cfg.token) { toast('Enter the API Token.', 'err'); return; }
    if (cfg.provider === 'custom' && !cfg.baseUrl) { toast('Enter the API Base URL for the Custom provider.', 'err'); return; }
    try {
      saveWhatsapp(state.waLab, cfg);
      state.whatsapp = cfg;
      toast('WhatsApp settings saved for this lab.', 'ok');
    } catch (e) {
      toast('Could not save settings in this browser.', 'err');
    }
  });
  $('waTest').addEventListener('click', function () {
    var provider = prov.value;
    var inst = $('waInst').value.trim();
    var token = $('waToken').value.trim();
    var base = $('waBase') ? $('waBase').value.trim() : '';
    var to = waPhone($('waNum').value.trim());
    if (!inst) return toast('Enter the Instance ID first.', 'err');
    if (!token) return toast('Enter the API Token first.', 'err');
    if (!to) return toast('Enter the Lab WhatsApp Number to receive the test message.', 'err');
    var url = provider === 'custom'
      ? base.replace(/\/+$/, '') + '/messages/chat'
      : 'https://api.ultramsg.com/' + encodeURIComponent(inst) + '/messages/chat';
    if (provider === 'custom' && !base) return toast('Enter the API Base URL for the Custom provider.', 'err');
    var btn = $('waTest');
    btn.disabled = true; btn.textContent = 'Sending...';
    var params = 'token=' + encodeURIComponent(token) +
      '&to=' + encodeURIComponent(to) +
      '&body=' + encodeURIComponent('Test message from Optix LAB MedSync — WhatsApp integration is working.');
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        btn.disabled = false; btn.textContent = 'Test Connection';
        if (data && (data.sent || data.message === 'ok' || data.status === 'sent')) {
          toast('Test message sent successfully.', 'ok');
        } else if (data && data.error) {
          toast('API error: ' + data.error, 'err');
        } else {
          toast('Message queued. Check the lab number on WhatsApp.', 'ok');
        }
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = 'Test Connection';
        toast('Connection failed: ' + (err && err.message ? err.message : err), 'err');
      });
  });
}

/* ---------------- web-app tenants (multi-tenant labs) ---------------- */

function tenantsCardHtml() {
  var tenants = loadTenants();
  var rows = tenants.map(function (t) {
    var active = t.active !== false;
    return '<tr>' +
      '<td><strong>' + esc(t.name) + '</strong><div class="cell-sub">' + esc(t.id) + '</div></td>' +
      '<td>' + esc(t.adminUsername || '—') + '</td>' +
      '<td>' + (active ? '<span class="badge b-green">active</span>' : '<span class="badge b-red">inactive</span>') + '</td>' +
      '<td style="white-space:nowrap">' + esc(t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—') + '</td>' +
      '<td style="white-space:nowrap;text-align:right">' +
      '<button class="btn btn-sm" data-ten-toggle="' + esc(t.id) + '">' + (active ? 'Deactivate' : 'Activate') + '</button> ' +
      '<button class="btn btn-sm btn-ghost" data-ten-del="' + esc(t.id) + '" style="color:var(--red)">Delete</button>' +
      '</td></tr>';
  }).join('');
  return '<div class="card"><div class="card-h"><h3>Web App Tenants</h3>' +
    '<span class="sub">isolated lab databases — each lab sees only its own data</span>' +
    '<button class="btn btn-primary btn-sm" id="tenCreate" style="margin-left:auto">+ Create Lab</button></div>' +
    (tenants.length
      ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Lab</th><th>Admin username</th><th>Status</th><th>Created</th><th style="text-align:right">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty" style="padding:28px 20px"><h4>No tenant labs yet</h4><p>Create the first lab to get started. The default lab is created automatically when the app first runs.</p></div>') +
    '</div>';
}

function wireTenantsCard() {
  var c = $('tenCreate');
  if (c) c.addEventListener('click', createTenantModal);
  Array.prototype.forEach.call(document.querySelectorAll('[data-ten-toggle]'), function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-ten-toggle');
      var t = tenantById(id);
      if (!t) return;
      var toActive = t.active === false;
      setTenantActive(id, toActive);
      toast('Lab "' + t.name + '" ' + (toActive ? 'activated.' : 'deactivated. Its users can no longer log in.'), 'ok');
      renderApp();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-ten-del]'), function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-ten-del');
      var t = tenantById(id);
      if (!t) return;
      openModal(
        'Delete lab',
        'This permanently deletes "' + t.name + '" and ALL of its data (patients, invoices, tests, everything). This cannot be undone.',
        '<p style="font-size:13px;color:var(--muted)">Type the lab name to confirm: <strong>' + esc(t.name) + '</strong></p>' +
        '<input class="input" id="mDelName" placeholder="' + esc(t.name) + '" autocomplete="off" spellcheck="false">',
        'Delete permanently',
        function () {
          if ($('mDelName').value.trim() !== t.name) {
            toast('Lab name did not match. Deletion cancelled.', 'err');
            return Promise.reject({ silent: true });
          }
          var r = deleteTenant(id);
          if (!r.ok) { toast(r.msg, 'err'); return Promise.reject({ silent: true }); }
          if (state.waLab === id) state.waLab = null;
          toast('Lab "' + t.name + '" deleted.', 'ok');
          return Promise.resolve().then(function () { renderApp(); });
        }
      );
    });
  });
}

function createTenantModal() {
  var tenants = loadTenants();
  var taken = {};
  tenants.forEach(function (t) { if (t.adminUsername) taken[String(t.adminUsername).toLowerCase()] = true; });
  openModal(
    'Create lab',
    'A brand-new isolated database is created for this lab — its own patients, invoices, tests, users and settings. Nothing is shared with other labs.',
    '<label class="label" for="mLabName">Lab name *</label>' +
    '<input class="input" id="mLabName" placeholder="e.g. City Diagnostics" autocomplete="off" spellcheck="false">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">' +
    '<div><label class="label" for="mAdmName">Admin full name</label>' +
    '<input class="input" id="mAdmName" placeholder="Administrator" autocomplete="off" spellcheck="false"></div>' +
    '<div><label class="label" for="mAdmUser">Admin username *</label>' +
    '<input class="input" id="mAdmUser" placeholder="e.g. cityadmin" autocomplete="off" spellcheck="false"></div>' +
    '<div><label class="label" for="mAdmPass">Admin password *</label>' +
    '<input class="input" id="mAdmPass" type="password" placeholder="min 4 characters" autocomplete="new-password"></div>' +
    '<div><label class="label" for="mAdmPass2">Confirm password *</label>' +
    '<input class="input" id="mAdmPass2" type="password" placeholder="repeat password" autocomplete="new-password"></div>' +
    '</div>' +
    '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">The lab also gets default <strong>reception / rec123</strong> and <strong>technician / tech123</strong> logins, plus the standard test catalog.</p>',
    'Create lab',
    function () {
      var name = $('mLabName').value.trim();
      var admName = $('mAdmName').value.trim() || 'Administrator';
      var admUser = $('mAdmUser').value.trim();
      var p1 = $('mAdmPass').value, p2 = $('mAdmPass2').value;
      if (!name) { toast('Enter a lab name.', 'err'); return Promise.reject({ silent: true }); }
      if (!admUser) { toast('Enter an admin username.', 'err'); return Promise.reject({ silent: true }); }
      if (!/^[a-zA-Z0-9_.-]{3,}$/.test(admUser)) { toast('Username: 3+ characters, letters/numbers/._- only.', 'err'); return Promise.reject({ silent: true }); }
      if (['reception', 'technician'].indexOf(admUser.toLowerCase()) >= 0) { toast('That username is reserved for staff logins.', 'err'); return Promise.reject({ silent: true }); }
      if (taken[admUser.toLowerCase()]) { toast('That admin username is already used by another lab.', 'err'); return Promise.reject({ silent: true }); }
      if (p1.length < 4) { toast('Password must be at least 4 characters.', 'err'); return Promise.reject({ silent: true }); }
      if (p1 !== p2) { toast('Passwords do not match.', 'err'); return Promise.reject({ silent: true }); }
      var lab = createTenant(name, admName, admUser, p1);
      if (!state.waLab) state.waLab = lab.id;
      toast('Lab "' + name + '" created. Its admin can log in with ' + admUser + '.', 'ok');
      return Promise.resolve().then(function () { renderApp(); });
    }
  );
}

/* ---------------- views ---------------- */

function renderLogin() {
  document.body.className = 'login-mode';
  $('root').innerHTML =
    '<div class="login-wrap">' +
    '<form class="login-card" id="saLoginForm" autocomplete="off">' +
    '<div class="login-logo">' +
    '<span class="login-mark">' + IC.flask + '</span>' +
    '<h1>Optix LAB MedSync</h1>' +
    '<p class="login-tag">Superadmin Console</p>' +
    '</div>' +
    '<h2>Welcome back</h2>' +
    '<p class="login-sub">Sign in to manage your labs</p>' +
    (state.loginError ? '<div class="login-err">' + esc(state.loginError) + '</div>' : '<div class="login-err" hidden></div>') +
    '<label class="label">Username<input class="input" id="userInput" type="text" placeholder="Enter username" autocomplete="username" autocapitalize="off" spellcheck="false" autofocus></label>' +
    '<label class="label">Password<input class="input" id="passInput" type="password" placeholder="Enter password" autocomplete="current-password"></label>' +
    '<button class="btn login-signin btn-block" type="submit" id="loginBtn">Sign In</button>' +
    '<div class="login-div"><span>or</span></div>' +
    '<a class="btn btn-ghost btn-block" href="/app/">App Login</a>' +
    '</form>' +
    '<p class="login-foot">Powered by System Optix</p>' +
    '</div>';

  var uEl = $('userInput'), pEl = $('passInput');
  uEl.focus();
  function submit() {
    var u = uEl.value.trim().toLowerCase();
    var p = pEl.value;
    if (!u || !p) {
      state.loginError = 'Please enter your username and password.';
      var keepU = uEl.value;
      renderLogin();
      $('userInput').value = keepU;
      $('userInput').focus();
      return;
    }
    if (u !== SA_USER || sha256hex(p) !== SA_PASS_HASH) {
      state.loginError = 'Invalid username or password. Please try again.';
      var keepU2 = uEl.value;
      renderLogin();
      $('userInput').value = keepU2;
      $('passInput').focus();
      return;
    }
    var token = 'up:' + sha256hex(u + ':' + p);
    state.key = token;
    state.loginError = '';
    setStoredKey(token);
    state.loggedIn = true;
    enterApp();
  }
  $('saLoginForm').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  uEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pEl.focus(); } });
}

function labsTableHtml() {
  var labs = state.labs;
  if (!labs.length) {
    return '<div class="empty"><div class="e-ico">' + IC.lab + '</div>' +
      '<h4>No labs connected yet</h4>' +
      '<p>Labs appear here automatically after their first heartbeat to the cloud API.</p></div>';
  }
  var rows = labs.map(function (lab) {
    var online = isOnline(lab);
    var target = lab.targetVersion || '';
    var pending = target && target !== lab.version;
    return '<tr>' +
      '<td><span class="dot ' + (online ? 'dot-on' : 'dot-off') + '"></span>' +
      '<strong style="font-size:13px">' + (online ? 'Online' : 'Offline') + '</strong></td>' +
      '<td><strong>' + esc(lab.name || 'Unnamed lab') + '</strong>' +
      '<div class="cell-sub">' + esc(lab.labId || '') + '</div></td>' +
      '<td>' + esc(lab.platform || '—') + '</td>' +
      '<td><span class="ver">' + esc(lab.version || '—') + '</span></td>' +
      '<td>' + (target
        ? '<span class="ver">' + esc(target) + '</span>' +
          (pending ? ' <span class="badge b-amber">update pending</span>' : ' <span class="badge b-green">up to date</span>')
        : '<span style="color:var(--faint)">—</span>') + '</td>' +
      '<td style="white-space:nowrap">' + esc(relTime(lab.lastSeen)) + '</td>' +
      '<td><button class="btn btn-sm btn-primary" data-push="' + esc(lab.labId || '') + '">Push update</button></td>' +
      '</tr>';
  }).join('');
  return '<div class="tbl-wrap"><table class="table"><thead><tr>' +
    '<th>Status</th><th>Lab</th><th>Platform</th><th>Version</th><th>Target</th><th>Last seen</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function releaseCardHtml() {
  var v = state.version || {};
  var latest = v.latest || '—';
  var minReq = v.minRequired || '—';
  return '<div class="card"><div class="card-h"><h3>Release</h3>' +
    (state.apiDown ? '<span class="badge b-red">API unreachable</span>' : '<span class="badge b-green">API connected</span>') +
    '</div><div class="card-b">' +
    '<div class="rel-row"><span class="k">Latest version</span><span class="v"><span class="ver">' + esc(latest) + '</span></span></div>' +
    '<div class="rel-row"><span class="k">Minimum required</span><span class="v"><span class="ver">' + esc(minReq) + '</span></span></div>' +
    '<div class="rel-row"><span class="k">Bundle</span><span class="v">' +
    (v.bundleUrl ? '<a href="' + esc(v.bundleUrl) + '" target="_blank" rel="noopener">Download bundle</a>' : '<span style="color:var(--faint)">—</span>') +
    '</span></div>' +
    '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" id="pushAllBtn" ' + (state.labs.length && v.latest ? '' : 'disabled') + '>Push latest to all labs</button>' +
    '</div>' +
    '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Sets every lab\'s target version to <strong>' + esc(latest) + '</strong>. Labs pick it up on their next heartbeat.</p>' +
    '</div></div>';
}

function changelogCardHtml() {
  var v = state.version || {};
  var log = v.changelog;
  return '<div class="card"><div class="card-h"><h3>Changelog</h3><span class="sub">release notes for ' + esc(v.latest || '—') + '</span></div>' +
    '<div class="card-b">' +
    (log ? '<div class="changelog">' + esc(log) + '</div>'
         : '<div class="empty" style="padding:28px 20px"><h4>No changelog published</h4><p>The backend has not published release notes for this version.</p></div>') +
    '</div></div>';
}

/* ---------------- app shell (chrome + navigation) ---------------- */

var NAV = [
  { id: 'overview', label: 'SaaS Overview' },
  { id: 'labs', label: 'Labs' },
  { id: 'payments', label: 'Payments' },
  { id: 'settings', label: 'Plans & Settings' },
  { id: 'fleet', label: 'Fleet & Updates' }
];

function viewFromHash() {
  var h = String(location.hash || '').replace(/^#/, '');
  for (var i = 0; i < NAV.length; i++) if (NAV[i].id === h) return h;
  return 'overview';
}

function navHtml() {
  return '<nav class="nav" aria-label="Sections"><div class="nav-in">' + NAV.map(function (n) {
    var badge = '';
    if (n.id === 'payments') {
      badge = '<span class="nav-badge" id="navPayBadge"' + (state.pending > 0 ? '' : ' hidden') + '>' + (state.pending > 99 ? '99+' : state.pending) + '</span>';
    }
    return '<a class="nav-i' + (state.view === n.id ? ' on' : '') + '" href="#' + n.id + '">' + esc(n.label) + badge + '</a>';
  }).join('') + '</div></nav>';
}

function paintChrome() {
  var el = $('chrome');
  if (!el) return;
  el.innerHTML =
    '<div class="hdr"><header class="topbar">' +
    '<div class="tb-brand"><div class="brand-ico">' + IC.cloud + '</div><span class="t">Optix LAB MedSync</span> <span class="badge b-blue">SUPERADMIN</span></div>' +
    '<div class="tb-right">' +
    '<span class="api-pill ' + (state.apiDown ? 'down' : 'ok') + '" id="apiPill"><span class="pdot"></span>' + (state.apiDown ? 'API unreachable' : 'API connected') + '</span>' +
    '<button class="btn btn-sm" id="refreshBtn">Refresh</button>' +
    '<button class="btn btn-ghost btn-sm" id="logoutBtn">Logout</button>' +
    '</div></header>' + navHtml() + '</div>' +
    (state.apiDown
      ? '<div class="banner"><span>⚠</span><span>Cannot reach the API server at ' + esc(API || 'same origin') + '. Showing the last known data — check that the backend is running.</span></div>'
      : '');
  $('logoutBtn').addEventListener('click', function () { logout(false); });
  $('refreshBtn').addEventListener('click', refreshCurrent);
}

function setPending(n) {
  state.pending = n || 0;
  var b = $('navPayBadge');
  if (b) {
    b.textContent = state.pending > 99 ? '99+' : String(state.pending);
    if (state.pending > 0) b.removeAttribute('hidden'); else b.setAttribute('hidden', '');
  }
}

/* ---------------- fleet & updates view (original console page) ---------------- */

function fleetViewHtml() {
  var labs = state.labs;
  var online = labs.filter(isOnline).length;
  var latest = state.version && state.version.latest;
  var upToDate = latest ? labs.filter(function (l) { return l.version === latest; }).length : 0;
  /* Web-app tenants (multi-tenant labs, same-origin localStorage). */
  state.tenants = loadTenants();
  if (!state.waLab || !tenantById(state.waLab)) {
    state.waLab = state.tenants.length ? state.tenants[0].id : 'lab1';
  }
  /* WhatsApp config lives in the selected tenant's isolated store. */
  state.whatsapp = loadWhatsapp(state.waLab);

  var stats =
    statCard(IC.lab, 'blue', 'Total Labs', String(labs.length), 'registered installations') +
    statCard(IC.wifi, 'green', 'Online Now', String(online), 'seen in the last 15 min') +
    statCard(IC.tag, 'brand', 'Latest Release', '<span class="ver">' + esc(latest || '—') + '</span>', 'min required: ' + (state.version && state.version.minRequired ? state.version.minRequired : '—')) +
    statCard(IC.check, 'amber', 'Up to Date', String(upToDate), 'of ' + labs.length + ' labs on latest');

  return '<div class="page-h"><div><h1>Lab Installations</h1>' +
    '<p>Monitor connected labs and roll out software updates.' +
    (state.lastUpdated ? ' Last refreshed ' + esc(state.lastUpdated.toLocaleTimeString('en-US')) + '.' : '') + '</p></div></div>' +
    (state.loading ? '<div class="spin"></div>' :
      '<div class="stat-grid">' + stats + '</div>' +
      '<div class="card"><div class="card-h"><h3>Labs</h3><span class="sub">' + labs.length + ' installation' + (labs.length === 1 ? '' : 's') + '</span></div>' +
      labsTableHtml() + '</div>' +
      tenantsCardHtml() +
      whatsappCardHtml() +
      releaseCardHtml() +
      changelogCardHtml());
}

function wireFleet() {
  wireTenantsCard();
  wireWhatsappCard();
  Array.prototype.forEach.call(document.querySelectorAll('[data-push]'), function (btn) {
    btn.addEventListener('click', function () {
      var labId = btn.getAttribute('data-push');
      var lab = state.labs.filter(function (l) { return l.labId === labId; })[0] || {};
      pushUpdateModal(lab);
    });
  });
  var pushAll = $('pushAllBtn');
  if (pushAll) pushAll.addEventListener('click', pushAllModal);
}

function paintMain() {
  var main = $('main');
  if (!main) return;
  var v = state.view;
  if (v === 'fleet') { main.innerHTML = fleetViewHtml(); wireFleet(); }
  else if (v === 'labs') { main.innerHTML = labsViewHtml(); wireLabsView(); }
  else if (v === 'payments') { main.innerHTML = paymentsViewHtml(); wirePaymentsView(); }
  else if (v === 'settings') { main.innerHTML = settingsViewHtml(); wireSettingsView(); }
  else { main.innerHTML = overviewViewHtml(); wireOverviewView(); }
  Array.prototype.forEach.call(main.querySelectorAll('[data-retry]'), function (b) {
    b.addEventListener('click', refreshCurrent);
  });
}

function renderApp() {
  document.body.className = '';
  $('root').innerHTML = '<div id="chrome"></div><main class="wrap" id="main"></main>';
  paintChrome();
  paintMain();
}

/* Switch section: show cached data immediately, then (re)load it. */
function applyView() {
  var v = viewFromHash();
  var changed = v !== state.view;
  state.view = v;
  if (!state.loggedIn) return;
  closeDrawer();
  if (!$('main')) { renderApp(); } else { paintChrome(); paintMain(); }
  if (changed) window.scrollTo(0, 0);
  loadViewData(v, false);
}

function loadViewData(v, silent) {
  if (v === 'overview') return loadOverview(silent);
  if (v === 'labs') return loadSaasLabs(silent);
  if (v === 'payments') return loadPayments(silent);
  if (v === 'settings') return loadSettings(silent);
  if (v === 'fleet') return loadData(!!silent);
}

function refreshCurrent() { loadViewData(state.view, false); }

window.addEventListener('hashchange', applyView);

/* ---------------- actions ---------------- */

function pushUpdateModal(lab) {
  var latest = (state.version && state.version.latest) || '';
  openModal(
    'Push update',
    'Set the target version for “' + (lab.name || lab.labId) + '”. The lab installs it on its next heartbeat.',
    '<label class="label" for="mVer">Target version</label>' +
    '<input class="input" id="mVer" value="' + esc(latest) + '" placeholder="e.g. 2.4.0" spellcheck="false">' +
    '<p style="margin-top:10px;font-size:12.5px;color:var(--muted)">Current: <strong>' + esc(lab.version || '—') + '</strong> · Latest release: <strong>' + esc(latest || '—') + '</strong></p>',
    'Push update',
    function () {
      var ver = $('mVer').value.trim();
      if (!ver) { toast('Enter a version number.', 'err'); return Promise.reject({ silent: true }); }
      return api('/api/labs/' + encodeURIComponent(lab.labId) + '/target', {
        method: 'POST', body: { version: ver }
      }).then(function () {
        toast('Target version ' + ver + ' set for ' + (lab.name || lab.labId) + '.', 'ok');
        loadData(true);
      }).catch(function (err) {
        if (err && err.auth) { logout(true); return; }
        toast('Failed to push update. ' + (err && err.network ? 'API unreachable.' : ''), 'err');
      });
    }
  );
}

function pushAllModal() {
  var latest = (state.version && state.version.latest) || '';
  var n = state.labs.length;
  openModal(
    'Push latest to all labs',
    'This sets the target version of all ' + n + ' lab' + (n === 1 ? '' : 's') + ' to ' + latest + '.',
    '<label class="label" for="mVerAll">Target version</label>' +
    '<input class="input" id="mVerAll" value="' + esc(latest) + '" spellcheck="false">',
    'Push to all',
    function () {
      var ver = $('mVerAll').value.trim();
      if (!ver) { toast('Enter a version number.', 'err'); return Promise.reject({ silent: true }); }
      var jobs = state.labs.map(function (lab) {
        return api('/api/labs/' + encodeURIComponent(lab.labId) + '/target', {
          method: 'POST', body: { version: ver }
        }).then(function () { return true; }, function () { return false; });
      });
      return Promise.all(jobs).then(function (results) {
        var ok = results.filter(Boolean).length;
        if (ok === n) toast('Update pushed to all ' + n + ' labs.', 'ok');
        else toast('Pushed to ' + ok + ' of ' + n + ' labs. Some failed — try again.', 'err');
        loadData(true);
      });
    }
  );
}

/* ============================================================
   SaaS console: overview, labs, payments, plans & settings
   ============================================================ */

var PAY_POLL_MS = 60000;
var payTimer = null;
var PLAN_KEYS = ['trial', 'starter', 'pro', 'enterprise'];
var PLAN_DEFAULT_NAMES = { trial: 'Free Trial', starter: 'Starter', pro: 'Professional', enterprise: 'Enterprise' };
var STATUS_LABEL = { trial: 'Trial', active: 'Active', expired: 'Expired', suspended: 'Suspended' };
var STATUS_CLS = { trial: 'b-blue', active: 'b-green', expired: 'b-amber', suspended: 'b-red' };

state.pending = 0;
state.stats = null;
state.slabs = null;
state.payments = null;
state.payTab = 'pending';
state.settingsData = null;
state.labFilter = 'all';
state.labQuery = '';
state.drawerLab = null;
state.ld = { overview: false, labs: false, payments: false, settings: false };
state.er = { overview: null, labs: null, payments: null, settings: null };

/* ---------------- small helpers ---------------- */

function ic(inner, size) {
  var n = size || 22;
  return '<svg width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}
IC.users = ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');
IC.receipt = ic('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>');
IC.wallet = ic('<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 9h-5a2 2 0 0 0 0 4h5V9z"/>');
IC.trend = ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>');
IC.clock = ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
IC.pause = ic('<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>');
IC.alert = ic('<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>');
IC.card = ic('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>');
IC.plus = ic('<path d="M12 5v14M5 12h14"/>', 16);
IC.search = ic('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', 16);
IC.close = ic('<path d="M18 6 6 18M6 6l12 12"/>', 20);
IC.trash = ic('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', 15);

function fmtDate(iso) {
  if (!iso) return '—';
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '—';
  return t.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '—';
  return t.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function money(n) { return 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
function num(n) { return (Number(n) || 0).toLocaleString('en-US'); }
function dateInput(iso) { return iso ? String(iso).slice(0, 10) : ''; }
function isoFromDate(v) { return v ? v + 'T12:00:00.000Z' : ''; }

function errMsg(err) {
  if (err && err.network) return 'Cannot reach the API server. Check your connection and try again.';
  if (err && err.data && err.data.error) return String(err.data.error);
  return (err && err.message) || 'Something went wrong.';
}
function handleErr(err) {
  if (err && err.auth) { logout(true); return; }
  toast(errMsg(err), 'err');
}
/* For openModal handlers: surface API errors through the modal's own toast. */
function failP(err) {
  if (err && err.auth) { closeModal(); logout(true); return Promise.reject({ silent: true }); }
  return Promise.reject(new Error(errMsg(err)));
}
function planName(key) {
  var p = state.settingsData && state.settingsData.plans && state.settingsData.plans[key];
  return (p && p.name) || PLAN_DEFAULT_NAMES[key] || key || '—';
}
function statusBadge(s) {
  return '<span class="badge ' + (STATUS_CLS[s] || 'b-gray') + '">' + esc(STATUS_LABEL[s] || s || '—') + '</span>';
}
function planBadge(key) {
  return '<span class="badge b-gray">' + esc(planName(key)) + '</span>';
}
function daysLeftHtml(l) {
  if (l.status === 'suspended') return '<span class="muted-t">—</span>';
  if (l.status === 'expired') return '<span class="dl-bad">Expired</span>';
  if (l.daysLeft == null) return '<span class="muted-t">—</span>';
  var cls = l.daysLeft <= 3 ? 'dl-bad' : (l.daysLeft <= 7 ? 'dl-warn' : '');
  return '<span class="' + cls + '">' + l.daysLeft + ' d</span>';
}
function limitStr(n) { return n ? num(n) : '∞'; }
function usageHtml(used, limit) {
  var over = limit > 0 && used >= limit;
  return '<span class="us"><span class="' + (over ? 'dl-bad' : '') + '">' + num(used) + '</span> <span class="muted-t">/ ' + limitStr(limit) + '</span></span>';
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
}
function genPassword() {
  var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
  var buf = null;
  try { buf = new Uint8Array(10); (window.crypto || window.msCrypto).getRandomValues(buf); } catch (e) { buf = null; }
  for (var i = 0; i < 10; i++) out += chars.charAt((buf ? buf[i] : Math.floor(Math.random() * 256)) % chars.length);
  return out;
}
function findLab(id) {
  var a = state.slabs || [];
  for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
  return null;
}
function pageHead(title, sub, actionsHtml) {
  return '<div class="page-h"><div><h1>' + esc(title) + '</h1><p>' + esc(sub) + '</p></div>' +
    (actionsHtml ? '<div class="page-act">' + actionsHtml + '</div>' : '') + '</div>';
}
function errorCard(msg) {
  return '<div class="card"><div class="empty"><div class="e-ico err">' + IC.alert + '</div>' +
    '<h4>Could not load this section</h4><p>' + esc(msg) + '</p>' +
    '<button class="btn btn-primary btn-sm" data-retry style="margin-top:14px">Try again</button></div></div>';
}
function clickRows(container, attr, fn) {
  if (!container) return;
  function pick(e) {
    var el = e.target;
    while (el && el !== container) {
      if (el.nodeType === 1 && el.hasAttribute(attr)) return el;
      el = el.parentNode;
    }
    return null;
  }
  container.addEventListener('click', function (e) {
    var row = pick(e);
    if (row) fn(row.getAttribute(attr));
  });
  container.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var row = pick(e);
    if (row) { e.preventDefault(); fn(row.getAttribute(attr)); }
  });
}

/* Load a section's data. Silent loads keep the current screen and fail quietly. */
function loadSection(key, fetcher, apply, silent) {
  if (!silent) { state.ld[key] = true; state.er[key] = null; if (state.view === key && state.loggedIn) paintMain(); }
  return fetcher().then(function (data) {
    state.ld[key] = false; state.er[key] = null;
    apply(data);
  }, function (err) {
    state.ld[key] = false;
    if (err && err.auth) { logout(true); return; }
    if (!silent) {
      state.er[key] = errMsg(err);
      var have = { overview: state.stats, labs: state.slabs, payments: state.payments, settings: state.settingsData }[key];
      if (have) toast(errMsg(err), 'err'); /* stale data stays on screen, so say why the refresh failed */
    }
  }).then(function () {
    if (state.view === key && state.loggedIn) paintMain();
  });
}

function loadOverview(silent) {
  return loadSection('overview', function () {
    return Promise.all([api('/api/saas/stats'), api('/api/saas/labs')]);
  }, function (r) {
    state.stats = r[0];
    state.slabs = (r[1] && r[1].labs) || [];
    setPending(r[0] && r[0].pendingPayments);
  }, silent);
}
function loadSaasLabs(silent) {
  return loadSection('labs', function () { return api('/api/saas/labs'); }, function (r) {
    state.slabs = (r && r.labs) || [];
    setPending(r && r.pendingPayments);
  }, silent);
}
function loadPayments(silent) {
  return loadSection('payments', function () { return api('/api/saas/payments'); }, function (r) {
    state.payments = Array.isArray(r) ? r : [];
    state.pending = state.payments.filter(function (p) { return p.status === 'pending'; }).length;
    setPending(state.pending);
  }, silent);
}
function loadSettings(silent) {
  return loadSection('settings', function () { return api('/api/saas/settings'); }, function (r) {
    state.settingsData = { settings: r.settings || {}, plans: r.plans || {} };
  }, silent);
}

/* Cheap poll for the nav badge (and live-refresh the open section). */
function pollPending() {
  if (!state.loggedIn || document.hidden) return;
  api('/api/saas/stats').then(function (st) {
    state.stats = st;
    setPending(st && st.pendingPayments);
    if (state.view === 'payments') loadPayments(true);
    else if (state.view === 'overview') paintMain();
  }).catch(function (err) { if (err && err.auth) logout(true); });
}
function startPoll() {
  stopPoll();
  payTimer = setInterval(pollPending, PAY_POLL_MS);
}
function stopPoll() { if (payTimer) { clearInterval(payTimer); payTimer = null; } }

/* ---------------- 1. SaaS Overview ---------------- */

function overviewViewHtml() {
  var head = pageHead('SaaS Overview', 'Subscriptions, revenue and usage across every lab.');
  if (!state.stats) {
    return head + (state.er.overview ? errorCard(state.er.overview) : '<div class="spin"></div>');
  }
  var s = state.stats, L = s.labs || {};
  var row1 =
    statCard(IC.lab, 'brand', 'Total labs', num(s.total), 'registered labs') +
    statCard(IC.clock, 'blue', 'On trial', num(L.trial), 'free trial running') +
    statCard(IC.check, 'green', 'Active paid', num(L.active), 'paying customers') +
    statCard(IC.alert, 'amber', 'Expired', num(L.expired), 'need renewal') +
    statCard(IC.pause, 'red', 'Suspended', num(L.suspended), 'blocked by operator');
  var pend = s.pendingPayments || 0;
  var row2 =
    statCard(IC.trend, 'green', 'MRR', money(s.mrr), 'monthly recurring') +
    statCard(IC.wallet, 'brand', 'Revenue this month', money(s.revenueThisMonth), 'approved payments') +
    statCard(IC.users, 'blue', 'Active users', num(s.users), 'across all labs') +
    statCard(IC.receipt, 'brand', 'Invoices this month', num(s.invoicesThisMonth), 'created by all labs') +
    statCard(IC.card, pend > 0 ? 'red' : 'amber', 'Pending payments', num(pend), pend > 0 ? 'review and approve →' : 'nothing waiting', '#payments');

  var labs = state.slabs || [];
  var soon = labs.filter(function (l) {
    return l.status === 'expired' || ((l.status === 'trial' || l.status === 'active') && l.daysLeft != null && l.daysLeft <= 7);
  }).sort(function (a, b) {
    var da = a.status === 'expired' ? -1 : (a.daysLeft == null ? 999 : a.daysLeft);
    var db = b.status === 'expired' ? -1 : (b.daysLeft == null ? 999 : b.daysLeft);
    return da - db;
  }).slice(0, 6);
  var recent = labs.slice().sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  }).slice(0, 6);

  function listRow(l, right) {
    return '<div class="list-row" data-lab="' + esc(l.id) + '" tabindex="0" role="button">' +
      '<div class="lr-main"><strong>' + esc(l.name) + '</strong><div class="cell-sub">' + esc(l.slug) + '</div></div>' +
      '<div class="lr-side">' + right + '</div></div>';
  }
  var soonHtml = soon.length
    ? soon.map(function (l) {
      var sub = l.status === 'expired'
        ? 'ended ' + esc(fmtDate(l.plan === 'trial' ? l.trialEndsAt : l.paidUntil))
        : daysLeftHtml(l) + ' left';
      return listRow(l, statusBadge(l.status) + '<div class="lr-sub">' + sub + '</div>');
    }).join('')
    : '<div class="empty" style="padding:30px 20px"><h4>All clear</h4><p>No trials or subscriptions are ending in the next 7 days.</p></div>';
  var recentHtml = recent.length
    ? recent.map(function (l) {
      return listRow(l, planBadge(l.plan) + '<div class="lr-sub">' + esc(fmtDate(l.createdAt)) + '</div>');
    }).join('')
    : '<div class="empty" style="padding:30px 20px"><h4>No labs yet</h4><p>New sign-ups will appear here.</p></div>';

  return head +
    '<div class="grp-t">Labs</div><div class="stat-grid g5">' + row1 + '</div>' +
    '<div class="grp-t">Business</div><div class="stat-grid g5">' + row2 + '</div>' +
    '<div class="grid-2">' +
    '<div class="card"><div class="card-h"><h3>Needs attention</h3><span class="sub">expired or ending within 7 days</span></div>' + soonHtml + '</div>' +
    '<div class="card"><div class="card-h"><h3>Recent sign-ups</h3><a class="sub" href="#labs">View all labs →</a></div>' + recentHtml + '</div>' +
    '</div>';
}
function wireOverviewView() {
  var main = $('main');
  clickRows(main, 'data-lab', openDrawer);
}

/* ---------------- 2. Labs ---------------- */

function labMatches(l, q) {
  if (!q) return true;
  var hay = [l.name, l.slug, l.ownerName, l.ownerEmail, l.phone].join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
}
function filteredLabs() {
  var q = state.labQuery.trim().toLowerCase();
  return (state.slabs || []).filter(function (l) {
    return (state.labFilter === 'all' || l.status === state.labFilter) && labMatches(l, q);
  });
}

function labsViewHtml() {
  var head = pageHead('Labs', 'Every lab on the platform — plans, usage and account actions.',
    '<button class="btn btn-primary" id="newLabBtn">' + IC.plus + ' New lab</button>');
  if (!state.slabs) {
    return head + (state.er.labs ? errorCard(state.er.labs) : '<div class="spin"></div>');
  }
  return head +
    '<div class="card"><div class="toolbar">' +
    '<div class="search"><span class="s-ico">' + IC.search + '</span>' +
    '<input class="input" id="labSearch" type="search" placeholder="Search name, Lab ID, owner, email or phone" autocomplete="off" spellcheck="false" value="' + esc(state.labQuery) + '"></div>' +
    '<div class="chips" id="labChips">' + labChipsHtml() + '</div></div>' +
    '<div id="labsList">' + labsListHtml() + '</div></div>';
}
function labChipsHtml() {
  var all = state.slabs || [];
  var items = [['all', 'All'], ['trial', 'Trial'], ['active', 'Active'], ['expired', 'Expired'], ['suspended', 'Suspended']];
  return items.map(function (it) {
    var n = it[0] === 'all' ? all.length : all.filter(function (l) { return l.status === it[0]; }).length;
    return '<button type="button" class="chip' + (state.labFilter === it[0] ? ' on' : '') + '" data-chip="' + it[0] + '">' +
      esc(it[1]) + '<span class="n">' + n + '</span></button>';
  }).join('');
}
function labsListHtml() {
  var all = state.slabs || [];
  if (!all.length) {
    return '<div class="empty"><div class="e-ico">' + IC.lab + '</div><h4>No labs yet</h4>' +
      '<p>Labs appear here when they sign up, or you can create one by hand.</p></div>';
  }
  var labs = filteredLabs();
  if (!labs.length) {
    return '<div class="empty"><div class="e-ico">' + IC.search + '</div><h4>No labs match</h4>' +
      '<p>Try a different search or status filter.</p></div>';
  }
  var rows = labs.map(function (l) {
    var u = l.usage || {}, lim = l.limits || {};
    return '<tr class="row-click" data-lab="' + esc(l.id) + '" tabindex="0">' +
      '<td class="td-main"><strong>' + esc(l.name) + '</strong><div class="cell-sub">' + esc(l.slug) + '</div></td>' +
      '<td data-label="Owner"><div class="own"><strong>' + esc(l.ownerName || '—') + '</strong>' +
      (l.ownerEmail ? '<span>' + esc(l.ownerEmail) + '</span>' : '') +
      (l.phone ? '<span>' + esc(l.phone) + '</span>' : '') + '</div></td>' +
      '<td data-label="Plan">' + planBadge(l.plan) + '</td>' +
      '<td data-label="Status">' + statusBadge(l.status) + '</td>' +
      '<td data-label="Days left">' + daysLeftHtml(l) + '</td>' +
      '<td data-label="Users">' + usageHtml(u.users, lim.users) + '</td>' +
      '<td data-label="Invoices / mo">' + usageHtml(u.invoicesThisMonth, lim.invoicesPerMonth) + '</td>' +
      '<td data-label="Last activity" class="nw">' + esc(relTime(u.lastActivity)) + '</td>' +
      '<td data-label="Created" class="nw">' + esc(fmtDate(l.createdAt)) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="tbl-wrap"><table class="table stack"><thead><tr>' +
    '<th>Lab</th><th>Owner</th><th>Plan</th><th>Status</th><th>Days left</th><th>Users</th><th>Invoices / mo</th><th>Last activity</th><th>Created</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function paintLabsList() {
  var list = $('labsList');
  if (list) list.innerHTML = labsListHtml();
  var chips = $('labChips');
  if (chips) chips.innerHTML = labChipsHtml();
}
function wireLabsView() {
  var nb = $('newLabBtn');
  if (nb) nb.addEventListener('click', newLabModal);
  var search = $('labSearch');
  if (search) search.addEventListener('input', function () {
    state.labQuery = search.value;
    var list = $('labsList');
    if (list) list.innerHTML = labsListHtml();
  });
  var chips = $('labChips');
  if (chips) chips.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== chips && !(b.getAttribute && b.getAttribute('data-chip'))) b = b.parentNode;
    if (!b || b === chips) return;
    state.labFilter = b.getAttribute('data-chip');
    paintLabsList();
  });
  clickRows($('labsList'), 'data-lab', openDrawer);
}

/* ---- lab detail drawer ---- */

function openDrawer(id) {
  if (!findLab(id)) return;
  state.drawerLab = id;
  var root = $('drawer-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'drawer-root';
    document.body.appendChild(root);
  }
  document.body.classList.add('no-scroll');
  paintDrawer(true);
}
function closeDrawer() {
  state.drawerLab = null;
  var root = $('drawer-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !e.modalClosed && state.drawerLab) closeDrawer();
});

function kv(k, v) {
  return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + v + '</span></div>';
}

function drawerHtml(l) {
  var u = l.usage || {}, lim = l.limits || {};
  var suspended = l.rawStatus === 'suspended';
  var planOpts = PLAN_KEYS.map(function (k) {
    return '<option value="' + k + '"' + (l.plan === k ? ' selected' : '') + '>' + esc(planName(k)) + '</option>';
  }).join('');
  var hist = (l.history || []).slice().reverse().map(function (h) {
    return '<li><div class="tl-a">' + esc(h.action) + '</div><div class="tl-m">' + esc(fmtDateTime(h.ts)) + (h.by ? ' · ' + esc(h.by) : '') + '</div></li>';
  }).join('');
  var endLabel = l.plan === 'trial' ? 'Trial ends' : 'Paid until';
  var endVal = l.plan === 'trial' ? l.trialEndsAt : l.paidUntil;

  return '<div class="dr-head"><div class="dr-title"><h3>' + esc(l.name) + '</h3>' +
    '<div class="dr-sub"><span class="cell-sub" style="margin:0">' + esc(l.slug) + '</span>' + statusBadge(l.status) + planBadge(l.plan) + '</div></div>' +
    '<button class="icon-btn" id="drClose" aria-label="Close">' + IC.close + '</button></div>' +
    '<div class="dr-body">' +

    '<div class="dr-sec"><div class="kv-grid">' +
    kv(endLabel, esc(fmtDate(endVal)) + (l.daysLeft != null && l.status !== 'suspended' ? ' <span class="muted-t">(' + (l.status === 'expired' ? 'expired' : l.daysLeft + ' d left') + ')</span>' : '')) +
    kv('Created', esc(fmtDate(l.createdAt))) +
    kv('Users', usageHtml(u.users, lim.users)) +
    kv('Invoices this month', usageHtml(u.invoicesThisMonth, lim.invoicesPerMonth)) +
    kv('Patients', num(u.patients)) +
    kv('Invoices total', num(u.invoicesTotal)) +
    kv('Last activity', esc(relTime(u.lastActivity))) +
    kv('Owner', esc(l.ownerName || '—')) +
    '</div>' +
    '<div class="own-links">' +
    (l.ownerEmail ? '<a href="mailto:' + esc(l.ownerEmail) + '">' + esc(l.ownerEmail) + '</a>' : '') +
    (l.phone ? '<a href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a>' : '') + '</div></div>' +

    '<div class="dr-sec"><h4>Quick actions</h4><div class="qa">' +
    '<button class="btn btn-sm" data-ext="7">Extend +7 days</button>' +
    '<button class="btn btn-sm" data-ext="14">+14 days</button>' +
    '<button class="btn btn-sm" data-ext="30">+30 days</button>' +
    (suspended
      ? '<button class="btn btn-sm btn-primary" id="drReact">Re-activate</button>'
      : '<button class="btn btn-sm btn-warn" id="drSuspend">Suspend</button>') +
    '</div><p class="hint">Extending adds days to the ' + (l.plan === 'trial' ? 'trial end' : 'paid-until') + ' date (from today if it has already passed).</p></div>' +

    '<div class="dr-sec"><h4>Edit lab</h4><div class="fgrid">' +
    '<div><label class="label" for="dfPlan">Plan</label><select class="select" id="dfPlan">' + planOpts + '</select></div>' +
    '<div><label class="label" for="dfState">Account state</label><select class="select" id="dfState">' +
    '<option value="active"' + (!suspended ? ' selected' : '') + '>Active</option>' +
    '<option value="suspended"' + (suspended ? ' selected' : '') + '>Suspended</option></select></div>' +
    '<div><label class="label" for="dfTrial">Trial ends</label><input class="input" type="date" id="dfTrial" value="' + esc(dateInput(l.trialEndsAt)) + '"></div>' +
    '<div><label class="label" for="dfPaid">Paid until</label><input class="input" type="date" id="dfPaid" value="' + esc(dateInput(l.paidUntil)) + '"></div>' +
    '<div><label class="label" for="dfLimU">Max users</label><input class="input" type="number" min="0" id="dfLimU" value="' + esc(lim.users) + '"></div>' +
    '<div><label class="label" for="dfLimI">Max invoices / month</label><input class="input" type="number" min="0" id="dfLimI" value="' + esc(lim.invoicesPerMonth) + '"></div>' +
    '<div class="span2"><p class="hint" style="margin:-4px 0 0">Limits: 0 = unlimited. Clear a field to go back to the plan default.</p></div>' +
    '<div class="span2"><label class="label" for="dfName">Lab name</label><input class="input" id="dfName" value="' + esc(l.name) + '"></div>' +
    '<div><label class="label" for="dfOwner">Owner name</label><input class="input" id="dfOwner" value="' + esc(l.ownerName) + '"></div>' +
    '<div><label class="label" for="dfPhone">Phone</label><input class="input" id="dfPhone" value="' + esc(l.phone) + '"></div>' +
    '<div class="span2"><label class="label" for="dfEmail">Owner email</label><input class="input" id="dfEmail" value="' + esc(l.ownerEmail) + '"></div>' +
    '<div class="span2"><label class="label" for="dfNotes">Internal notes</label><textarea class="input" id="dfNotes" rows="3" placeholder="Visible to operators only">' + esc(l.notes) + '</textarea></div>' +
    '</div><div style="margin-top:14px"><button class="btn btn-primary" id="drSave">Save changes</button></div></div>' +

    '<div class="dr-sec danger"><h4>Account</h4>' +
    '<div class="danger-row"><div><strong>Reset admin password</strong><p class="hint">Set a new password for this lab\'s admin login.</p></div>' +
    '<button class="btn btn-sm" id="drReset">Reset password</button></div>' +
    '<div class="danger-row"><div><strong>Delete lab</strong><p class="hint">' +
    (l.legacy ? 'The original default lab cannot be deleted.' : 'Permanently removes the lab and all of its data.') + '</p></div>' +
    '<button class="btn btn-sm btn-outline-danger" id="drDelete"' + (l.legacy ? ' disabled' : '') + '>' + IC.trash + ' Delete</button></div></div>' +

    '<div class="dr-sec"><h4>Timeline</h4>' +
    (hist ? '<ul class="timeline">' + hist + '</ul>' : '<p class="hint">No history yet.</p>') + '</div>' +
    '</div>';
}

function paintDrawer(animate) {
  var root = $('drawer-root');
  var l = findLab(state.drawerLab);
  if (!root || !l) { closeDrawer(); return; }
  var prevScroll = 0;
  var oldBody = root.querySelector('.drawer');
  if (oldBody) prevScroll = oldBody.scrollTop;
  root.innerHTML = '<div class="dr-ov" id="drOv"><aside class="drawer' + (animate ? ' dr-in' : '') + '" role="dialog" aria-modal="true" aria-label="Lab details">' + drawerHtml(l) + '</aside></div>';
  var dr = root.querySelector('.drawer');
  if (prevScroll) dr.scrollTop = prevScroll;
  $('drOv').addEventListener('mousedown', function (e) { if (e.target === $('drOv')) closeDrawer(); });
  $('drClose').addEventListener('click', closeDrawer);

  Array.prototype.forEach.call(root.querySelectorAll('[data-ext]'), function (btn) {
    btn.addEventListener('click', function () {
      var days = parseInt(btn.getAttribute('data-ext'), 10);
      doLabCall(btn, api('/api/saas/labs/' + encodeURIComponent(l.id) + '/extend', { method: 'POST', body: { days: days } }),
        'Extended ' + l.name + ' by ' + days + ' days.');
    });
  });
  var sus = $('drSuspend');
  if (sus) sus.addEventListener('click', function () {
    openModal('Suspend lab', 'Suspending blocks "' + l.name + '" from using the app until you re-activate it.', '',
      'Suspend lab', function () {
        return api('/api/saas/labs/' + encodeURIComponent(l.id), { method: 'PUT', body: { status: 'suspended' } }).then(function (r) {
          applyLab(r.lab); toast('Lab suspended.', 'ok');
        }, failP);
      });
  });
  var re = $('drReact');
  if (re) re.addEventListener('click', function () {
    doLabCall(re, api('/api/saas/labs/' + encodeURIComponent(l.id), { method: 'PUT', body: { status: 'active' } }), 'Lab re-activated.');
  });
  $('drSave').addEventListener('click', function () { saveLabForm(l, $('drSave')); });
  $('drReset').addEventListener('click', function () { resetAdminModal(l); });
  var del = $('drDelete');
  if (del && !l.legacy) del.addEventListener('click', function () { deleteLabModal(l); });
}

function doLabCall(btn, promise, okMsg) {
  if (btn) btn.disabled = true;
  return promise.then(function (r) {
    if (r && r.lab) applyLab(r.lab);
    toast(okMsg, 'ok');
  }, function (err) {
    if (btn) btn.disabled = false;
    handleErr(err);
  });
}

/* Replace a lab in the cache and repaint everything that shows it. */
function applyLab(lab) {
  if (!lab) return;
  var a = state.slabs || (state.slabs = []);
  var found = false;
  for (var i = 0; i < a.length; i++) if (a[i].id === lab.id) { a[i] = lab; found = true; }
  if (!found) a.unshift(lab);
  if (state.drawerLab === lab.id) paintDrawer(false);
  if (state.view === 'labs') paintLabsList();
  else if (state.view === 'overview') paintMain();
  api('/api/saas/stats').then(function (st) {
    state.stats = st; setPending(st && st.pendingPayments);
    if (state.view === 'overview') paintMain();
  }).catch(function () {});
}

function saveLabForm(l, btn) {
  var body = {};
  var lim = l.limits || {};
  var plan = $('dfPlan').value;
  if (plan !== l.plan) body.plan = plan;
  var st = $('dfState').value;
  if (st !== l.rawStatus) body.status = st;
  var tr = $('dfTrial').value;
  if (tr !== dateInput(l.trialEndsAt)) body.trialEndsAt = isoFromDate(tr);
  var pd = $('dfPaid').value;
  if (pd !== dateInput(l.paidUntil)) body.paidUntil = isoFromDate(pd);
  var lu = $('dfLimU').value.trim();
  if (lu !== String(lim.users)) body.limitUsers = lu;
  var li = $('dfLimI').value.trim();
  if (li !== String(lim.invoicesPerMonth)) body.limitInvoices = li;
  var name = $('dfName').value.trim();
  if (!name) { toast('Lab name cannot be empty.', 'err'); return; }
  if (name !== l.name) body.name = name;
  var map = { dfOwner: ['ownerName', l.ownerName], dfPhone: ['phone', l.phone], dfEmail: ['ownerEmail', l.ownerEmail], dfNotes: ['notes', l.notes] };
  Object.keys(map).forEach(function (id) {
    var v = $(id).value.trim();
    if (v !== String(map[id][1] || '')) body[map[id][0]] = v;
  });
  if (!Object.keys(body).length) { toast('No changes to save.'); return; }
  doLabCall(btn, api('/api/saas/labs/' + encodeURIComponent(l.id), { method: 'PUT', body: body }), 'Changes saved.');
}

function resetAdminModal(l) {
  openModal('Reset admin password',
    'Choose a new password for the admin of "' + l.name + '". Share it with the owner securely.',
    '<label class="label" for="mNewPw">New password (min 6 characters)</label>' +
    '<div class="inline-row"><input class="input" id="mNewPw" autocomplete="off" spellcheck="false" placeholder="e.g. Lab@2026">' +
    '<button type="button" class="btn" id="mGenPw">Generate</button></div>',
    'Reset password',
    function () {
      var pw = $('mNewPw').value;
      if (pw.length < 6) { toast('Password must be at least 6 characters.', 'err'); return Promise.reject({ silent: true }); }
      return api('/api/saas/labs/' + encodeURIComponent(l.id) + '/reset-admin', { method: 'POST', body: { password: pw } }).then(function (r) {
        toast('Password reset for admin "' + (r && r.username || 'admin') + '".', 'ok');
        return api('/api/saas/labs').then(function (x) { state.slabs = x.labs || state.slabs; if (state.drawerLab) paintDrawer(false); }, function () {});
      }, failP);
    });
  $('mGenPw').addEventListener('click', function () { $('mNewPw').value = genPassword(); $('mNewPw').focus(); });
}

function deleteLabModal(l) {
  openModal('Delete lab',
    'This permanently deletes "' + l.name + '" and ALL of its data — patients, invoices, tests, users and payments. This cannot be undone.',
    '<p style="font-size:13px;color:var(--muted);margin-bottom:8px">Type the Lab ID to confirm: <strong>' + esc(l.slug) + '</strong></p>' +
    '<input class="input" id="mDelSlug" placeholder="' + esc(l.slug) + '" autocomplete="off" spellcheck="false">',
    'Delete permanently',
    function () {
      if ($('mDelSlug').value.trim() !== l.slug) {
        toast('Lab ID did not match. Deletion cancelled.', 'err');
        return Promise.reject({ silent: true });
      }
      return api('/api/saas/labs/' + encodeURIComponent(l.id), { method: 'DELETE', headers: { 'X-Confirm-Slug': l.slug } }).then(function () {
        state.slabs = (state.slabs || []).filter(function (x) { return x.id !== l.id; });
        closeDrawer();
        toast('Lab "' + l.name + '" deleted.', 'ok');
        if (state.view === 'labs') paintMain();
        loadViewData(state.view, true);
        pollPending();
      }, failP);
    });
}

function newLabModal() {
  openModal('New lab',
    'Create a lab by hand. It starts on the free trial with the standard test catalogue and one admin login.',
    '<div class="m-grid">' +
    '<div class="span2"><label class="label" for="nlName">Lab name *</label><input class="input" id="nlName" placeholder="e.g. City Diagnostics" autocomplete="off" spellcheck="false"></div>' +
    '<div><label class="label" for="nlOwner">Owner name *</label><input class="input" id="nlOwner" autocomplete="off"></div>' +
    '<div><label class="label" for="nlPhone">Phone</label><input class="input" id="nlPhone" autocomplete="off" placeholder="0300-1234567"></div>' +
    '<div class="span2"><label class="label" for="nlEmail">Email *</label><input class="input" id="nlEmail" type="email" autocomplete="off" spellcheck="false"></div>' +
    '<div class="span2"><label class="label" for="nlSlug">Lab ID *</label><input class="input" id="nlSlug" autocomplete="off" spellcheck="false" placeholder="city-diagnostics"><p class="hint" style="margin-top:4px">3-30 letters or numbers; a hyphen is allowed in the middle. Used at lab login.</p></div>' +
    '<div><label class="label" for="nlUser">Admin username *</label><input class="input" id="nlUser" autocomplete="off" spellcheck="false" placeholder="e.g. cityadmin"></div>' +
    '<div><label class="label" for="nlPass">Admin password *</label><div class="inline-row"><input class="input" id="nlPass" autocomplete="off" spellcheck="false" placeholder="min 6 chars"><button type="button" class="btn btn-sm" id="nlGen">Generate</button></div></div>' +
    '</div>',
    'Create lab',
    function () {
      var body = {
        labName: $('nlName').value.trim(), ownerName: $('nlOwner').value.trim(), email: $('nlEmail').value.trim(),
        phone: $('nlPhone').value.trim(), slug: $('nlSlug').value.trim(), username: $('nlUser').value.trim(), password: $('nlPass').value
      };
      return api('/api/saas/labs', { method: 'POST', body: body }).then(function (r) {
        toast('Lab "' + body.labName + '" created. Admin login: ' + body.username + '.', 'ok');
        if (r && r.lab) { applyLab(r.lab); setTimeout(function () { openDrawer(r.lab.id); }, 60); }
      }, failP);
    });
  var touched = false;
  $('nlSlug').addEventListener('input', function () { touched = true; });
  $('nlName').addEventListener('input', function () { if (!touched) $('nlSlug').value = slugify($('nlName').value); });
  $('nlGen').addEventListener('click', function () { $('nlPass').value = genPassword(); });
}

/* ---------------- 3. Payments ---------------- */

function payTabsHtml() {
  var all = state.payments || [];
  var tabs = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];
  return tabs.map(function (t) {
    var n = all.filter(function (p) { return p.status === t[0]; }).length;
    return '<button type="button" class="tab' + (state.payTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) +
      '<span class="n' + (t[0] === 'pending' && n > 0 ? ' hot' : '') + '">' + n + '</span></button>';
  }).join('');
}

function paymentsViewHtml() {
  var head = pageHead('Payments', 'Review payment requests from labs. Approving activates the plan and extends the paid-until date.');
  if (!state.payments) {
    return head + (state.er.payments ? errorCard(state.er.payments) : '<div class="spin"></div>');
  }
  return head + '<div class="card"><div class="tabs" id="payTabs">' + payTabsHtml() + '</div><div id="payList">' + paymentsListHtml() + '</div></div>';
}

function paymentsListHtml() {
  var rows = (state.payments || []).filter(function (p) { return p.status === state.payTab; });
  if (!rows.length) {
    var msg = { pending: ['All caught up', 'No payment requests are waiting for review.'],
      approved: ['No approved payments yet', 'Approved payments will be listed here.'],
      rejected: ['No rejected payments', 'Rejected payments will be listed here.'] }[state.payTab];
    return '<div class="empty"><div class="e-ico">' + IC.card + '</div><h4>' + msg[0] + '</h4><p>' + msg[1] + '</p></div>';
  }
  var pend = state.payTab === 'pending';
  var trs = rows.map(function (p) {
    return '<tr>' +
      '<td class="td-main"><strong>' + esc(p.labName || '—') + '</strong><div class="cell-sub">' + esc(p.labSlug || p.labId) + '</div></td>' +
      '<td data-label="Plan" class="nw"><span>' + planBadge(p.plan) + ' <span class="muted-t" style="text-transform:capitalize">' + esc(p.period) + '</span></span></td>' +
      '<td data-label="Amount" class="nw"><strong>' + money(p.amount) + '</strong></td>' +
      '<td data-label="Method">' + esc(p.method || '—') + '</td>' +
      '<td data-label="Reference"><span class="ver">' + esc(p.reference || '—') + '</span></td>' +
      '<td data-label="Note" class="note-c">' + (p.note ? esc(p.note) : '<span class="muted-t">—</span>') + '</td>' +
      '<td data-label="Submitted" class="nw">' + esc(fmtDateTime(p.createdAt)) + '</td>' +
      (pend
        ? '<td class="td-act"><div class="act"><button class="btn btn-sm btn-primary" data-approve="' + esc(p.id) + '">Approve</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-reject="' + esc(p.id) + '">Reject</button></div></td>'
        : '<td data-label="Decision" class="dec-c"><div>' + esc(fmtDateTime(p.decidedAt)) + '' + '</div>' +
          (p.decisionNote ? '<div class="muted-t">' + esc(p.decisionNote) + '</div>' : '') + '</td>') +
      '</tr>';
  }).join('');
  return '<div class="tbl-wrap"><table class="table stack"><thead><tr>' +
    '<th>Lab</th><th>Plan</th><th>Amount</th><th>Method</th><th>Reference</th><th>Note</th><th>Submitted</th><th>' + (pend ? 'Action' : 'Decision') + '</th>' +
    '</tr></thead><tbody>' + trs + '</tbody></table></div>';
}

function paintPayments() {
  var t = $('payTabs'), l = $('payList');
  if (t) t.innerHTML = payTabsHtml();
  if (l) l.innerHTML = paymentsListHtml();
}

function wirePaymentsView() {
  var tabs = $('payTabs');
  if (tabs) tabs.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== tabs && !(b.getAttribute && b.getAttribute('data-tab'))) b = b.parentNode;
    if (!b || b === tabs) return;
    state.payTab = b.getAttribute('data-tab');
    paintPayments();
  });
  var list = $('payList');
  if (list) list.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== list && !(b.getAttribute && (b.getAttribute('data-approve') || b.getAttribute('data-reject')))) b = b.parentNode;
    if (!b || b === list) return;
    var id = b.getAttribute('data-approve') || b.getAttribute('data-reject');
    decidePaymentModal(id, b.hasAttribute('data-approve') ? 'approve' : 'reject');
  });
}

function decidePaymentModal(id, action) {
  var p = (state.payments || []).filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  var approve = action === 'approve';
  var summary = '<div class="pay-sum"><div><span class="k">Lab</span><strong>' + esc(p.labName) + '</strong></div>' +
    '<div><span class="k">Plan</span><strong>' + esc(planName(p.plan)) + ' · ' + esc(p.period) + '</strong></div>' +
    '<div><span class="k">Amount</span><strong>' + money(p.amount) + '</strong></div>' +
    '<div><span class="k">Reference</span><strong>' + esc(p.method || '') + ' · ' + esc(p.reference || '') + '</strong></div></div>';
  openModal(approve ? 'Approve payment' : 'Reject payment',
    approve ? 'This activates the ' + planName(p.plan) + ' plan and extends paid-until by ' + (p.period === 'yearly' ? '365' : '30') + ' days.' : 'The lab stays on its current plan. You can leave a note explaining why.',
    summary + '<label class="label" for="mPayNote" style="margin-top:14px">Note' + (approve ? ' (optional)' : ' to the lab (optional)') + '</label>' +
    '<textarea class="input" id="mPayNote" rows="2" maxlength="200" placeholder="' + (approve ? 'e.g. Verified in bank statement' : 'e.g. Transaction ID not found') + '"></textarea>',
    approve ? 'Approve' : 'Reject',
    function () {
      return api('/api/saas/payments/' + encodeURIComponent(id) + '/' + action, { method: 'POST', body: { note: $('mPayNote').value.trim() } }).then(function (r) {
        var arr = state.payments || [];
        for (var i = 0; i < arr.length; i++) if (arr[i].id === id && r && r.payment) arr[i] = r.payment;
        setPending(arr.filter(function (x) { return x.status === 'pending'; }).length);
        if (r && r.lab && state.slabs) {
          var found = false;
          for (var j = 0; j < state.slabs.length; j++) if (state.slabs[j].id === r.lab.id) { state.slabs[j] = r.lab; found = true; }
          if (!found) state.slabs.unshift(r.lab);
        }
        toast(approve ? 'Payment approved. ' + (r && r.lab ? r.lab.name + ' is now on ' + r.lab.planName + '.' : '') : 'Payment rejected.', 'ok');
        if (state.view === 'payments') paintPayments();
      }, failP);
    });
}

/* ---------------- 4. Plans & Settings ---------------- */

function numField(id, label, val, hint) {
  return '<div><label class="label" for="' + id + '">' + label + '</label>' +
    '<input class="input" type="number" min="0" step="1" id="' + id + '" value="' + esc(val == null ? 0 : val) + '"></div>';
}

function planCardHtml(key, p) {
  var prices = key === 'trial' ? '<div class="plan-note">Free during the trial period</div>' :
    '<div class="fgrid">' + numField('pl_' + key + '_monthly', 'Monthly (Rs)', p.monthly) + numField('pl_' + key + '_yearly', 'Yearly (Rs)', p.yearly) + '</div>';
  return '<div class="plan-card" data-plan="' + key + '">' +
    '<div class="plan-h"><span class="badge ' + (key === 'enterprise' ? 'b-blue' : key === 'trial' ? 'b-gray' : 'b-green') + '">' + esc(key) + '</span></div>' +
    '<label class="label" for="pl_' + key + '_name">Plan name</label>' +
    '<input class="input" id="pl_' + key + '_name" value="' + esc(p.name) + '" maxlength="60">' +
    '<div style="height:12px"></div>' + prices +
    '<div style="height:12px"></div><div class="fgrid">' +
    numField('pl_' + key + '_users', 'Max users', p.users) + numField('pl_' + key + '_inv', 'Invoices / month', p.invoicesPerMonth) + '</div>' +
    '<p class="hint" style="margin-top:4px">0 means unlimited.</p>' +
    '<label class="label" for="pl_' + key + '_desc" style="margin-top:10px">Description</label>' +
    '<textarea class="input" id="pl_' + key + '_desc" rows="2" maxlength="140">' + esc(p.desc) + '</textarea></div>';
}

function methodRowHtml(m, i) {
  return '<div class="pm-row"><div class="pm-grid">' +
    '<div><label class="label">Method</label><input class="input pm-name" value="' + esc(m.name) + '" placeholder="JazzCash" maxlength="60"></div>' +
    '<div><label class="label">Account number</label><input class="input pm-acc" value="' + esc(m.account) + '" placeholder="0300-1234567" maxlength="60"></div>' +
    '<div><label class="label">Account title</label><input class="input pm-title" value="' + esc(m.title) + '" placeholder="Account holder name" maxlength="80"></div>' +
    '</div><button type="button" class="icon-btn danger" data-pm-del="' + i + '" aria-label="Remove method" title="Remove">' + IC.trash + '</button></div>';
}
function methodsHtml(list) {
  if (!list.length) return '<p class="hint" style="margin:0 0 4px">No payment methods yet. Labs will see only the instructions above.</p>';
  return list.map(methodRowHtml).join('');
}

function settingsViewHtml() {
  var save = '<button class="btn btn-primary" id="setSave">Save changes</button>';
  var head = pageHead('Plans & Settings', 'Pricing, limits and the payment details labs see when they upgrade.', save);
  if (!state.settingsData) {
    return head + (state.er.settings ? errorCard(state.er.settings) : '<div class="spin"></div>');
  }
  var s = state.settingsData.settings || {}, plans = state.settingsData.plans || {};
  var cards = PLAN_KEYS.map(function (k) { return planCardHtml(k, plans[k] || {}); }).join('');
  return head +
    '<div class="card"><div class="card-h"><h3>Plans</h3><span class="sub">prices in Pakistani rupees</span></div>' +
    '<div class="card-b"><div class="plan-grid">' + cards + '</div></div></div>' +

    '<div class="grid-2 settings-2">' +
    '<div class="card"><div class="card-h"><h3>Trial &amp; support</h3></div><div class="card-b">' +
    '<div style="max-width:200px"><label class="label" for="stTrial">Trial length (days)</label>' +
    '<input class="input" type="number" min="1" max="90" id="stTrial" value="' + esc(s.trialDays == null ? 14 : s.trialDays) + '"></div>' +
    '<p class="hint" style="margin:4px 0 14px">Applies to new sign-ups (1-90 days).</p>' +
    '<div class="fgrid"><div><label class="label" for="stPhone">Support phone</label><input class="input" id="stPhone" value="' + esc(s.supportPhone) + '" placeholder="0300-1234567"></div>' +
    '<div><label class="label" for="stWa">Support WhatsApp</label><input class="input" id="stWa" value="' + esc(s.supportWhatsapp) + '" placeholder="0300-1234567"></div>' +
    '<div class="span2"><label class="label" for="stEmail">Support email</label><input class="input" id="stEmail" value="' + esc(s.supportEmail) + '" placeholder="support@example.com"></div></div>' +
    '</div></div>' +
    '<div class="card"><div class="card-h"><h3>Payment instructions</h3><span class="sub">shown on the lab\'s upgrade screen</span></div><div class="card-b">' +
    '<label class="label" for="stInstr">Instructions</label>' +
    '<textarea class="input" id="stInstr" rows="6" maxlength="600">' + esc(s.payInstructions) + '</textarea></div></div>' +
    '</div>' +

    '<div class="card"><div class="card-h"><h3>Payment methods</h3><span class="sub">accounts labs can pay into (up to 8)</span>' +
    '<button class="btn btn-sm" id="pmAdd" style="margin-left:auto">' + IC.plus + ' Add method</button></div>' +
    '<div class="card-b" id="pmList">' + methodsHtml(s.payMethods || []) + '</div></div>' +
    '<div class="save-bar"><button class="btn btn-primary" id="setSave2">Save changes</button></div>';
}

function collectMethods() {
  var out = [];
  Array.prototype.forEach.call(document.querySelectorAll('#pmList .pm-row'), function (row) {
    out.push({
      name: row.querySelector('.pm-name').value.trim(),
      account: row.querySelector('.pm-acc').value.trim(),
      title: row.querySelector('.pm-title').value.trim()
    });
  });
  return out;
}

function wireSettingsView() {
  if (!state.settingsData) return;
  var s1 = $('setSave'), s2 = $('setSave2');
  if (s1) s1.addEventListener('click', saveSettings);
  if (s2) s2.addEventListener('click', saveSettings);
  var add = $('pmAdd');
  if (add) add.addEventListener('click', function () {
    var list = collectMethods();
    if (list.length >= 8) { toast('You can add up to 8 payment methods.', 'err'); return; }
    list.push({ name: '', account: '', title: '' });
    $('pmList').innerHTML = methodsHtml(list);
    var rows = document.querySelectorAll('#pmList .pm-name');
    if (rows.length) rows[rows.length - 1].focus();
  });
  var pm = $('pmList');
  if (pm) pm.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== pm && !(b.getAttribute && b.getAttribute('data-pm-del') != null)) b = b.parentNode;
    if (!b || b === pm) return;
    var list = collectMethods();
    list.splice(parseInt(b.getAttribute('data-pm-del'), 10), 1);
    pm.innerHTML = methodsHtml(list);
  });
}

function saveSettings() {
  var cur = state.settingsData;
  var trial = parseInt($('stTrial').value, 10);
  if (!(trial >= 1 && trial <= 90)) { toast('Trial length must be between 1 and 90 days.', 'err'); return; }
  var plans = {};
  for (var i = 0; i < PLAN_KEYS.length; i++) {
    var k = PLAN_KEYS[i], old = cur.plans[k] || {};
    var name = $('pl_' + k + '_name').value.trim();
    if (!name) { toast('Every plan needs a name.', 'err'); $('pl_' + k + '_name').focus(); return; }
    var n = function (suffix, fallback) {
      var el = $('pl_' + k + '_' + suffix);
      if (!el) return fallback;
      var v = parseInt(el.value, 10);
      return isNaN(v) || v < 0 ? 0 : v;
    };
    plans[k] = {
      name: name, monthly: n('monthly', old.monthly || 0), yearly: n('yearly', old.yearly || 0),
      users: n('users', 0), invoicesPerMonth: n('inv', 0), desc: $('pl_' + k + '_desc').value.trim()
    };
  }
  var methods = collectMethods().filter(function (m) { return m.name || m.account || m.title; });
  for (var j = 0; j < methods.length; j++) {
    if (!methods[j].name || !methods[j].account) { toast('Each payment method needs a name and an account number.', 'err'); return; }
  }
  var body = {
    settings: {
      trialDays: trial, supportPhone: $('stPhone').value.trim(), supportEmail: $('stEmail').value.trim(),
      supportWhatsapp: $('stWa').value.trim(), payInstructions: $('stInstr').value.trim(), payMethods: methods
    },
    plans: plans
  };
  var btns = [$('setSave'), $('setSave2')];
  btns.forEach(function (b) { if (b) { b.disabled = true; b.textContent = 'Saving...'; } });
  api('/api/saas/settings', { method: 'PUT', body: body }).then(function (r) {
    state.settingsData = { settings: r.settings || body.settings, plans: r.plans || plans };
    toast('Settings saved.', 'ok');
    if (state.view === 'settings') paintMain();
  }, function (err) {
    btns.forEach(function (b) { if (b) { b.disabled = false; b.textContent = 'Save changes'; } });
    handleErr(err);
  });
}

/* ---------------- entering / leaving the console ---------------- */

function enterApp() {
  state.view = viewFromHash();
  startAutoRefresh();
  startPoll();
  renderApp();
  loadViewData(state.view, false);
  if (state.view !== 'fleet') loadData(true);
  if (state.view !== 'payments') pollPending();
  /* plan names for badges everywhere */
  if (state.view !== 'settings') loadSection('settings', function () { return api('/api/saas/settings'); }, function (r) {
    state.settingsData = { settings: r.settings || {}, plans: r.plans || {} };
  }, true).then(function () { if (state.view === 'labs' || state.view === 'overview' || state.view === 'payments') paintMain(); });
}

/* ---------------- auth lifecycle ---------------- */

function logout(expired) {
  clearStoredKey();
  state.key = null;
  state.loggedIn = false;
  state.labs = [];
  state.version = null;
  state.apiDown = false;
  state.loading = false;
  state.stats = null; state.slabs = null; state.payments = null; state.settingsData = null; state.pending = 0;
  state.ld = { overview: false, labs: false, payments: false, settings: false };
  state.er = { overview: null, labs: null, payments: null, settings: null };
  closeDrawer();
  closeModal();
  stopPoll();
  state.loginError = expired ? 'Session expired. Please sign in again.' : '';
  stopAutoRefresh();
  renderLogin();
}

function render() {
  if (state.loggedIn) renderApp();
  else renderLogin();
}

/* ---------------- boot ---------------- */

function boot() {
  var k = getStoredKey();
  if (k && k.indexOf('up:') === 0) {
    state.key = k;
    state.loggedIn = true;
    enterApp();
  } else {
    renderLogin();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
