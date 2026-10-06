/* ============================================================
   Optix LAB MedSync — Superadmin Console
   Manages lab installations: registry, version rollout, changelog.
   API contract:
     GET  /api/labs              -> [{labId,name,version,lastSeen,platform,targetVersion}]
     POST /api/labs/:id/target   -> {version}  (sets target version for a lab)
     GET  /api/version           -> {latest,minRequired,bundleUrl,changelog}
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
  lastUpdated: null
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
      render();
    });
  }).catch(function (err) {
    state.loading = false;
    if (err && err.auth) { logout(true); return; }
    state.apiDown = true;
    render();
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
  if (e.key === 'Escape') closeModal();
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

function statCard(icon, tint, label, value, sub) {
  return '<div class="stat">' +
    '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft);--sc-c:var(--' + tint + ')">' + icon + '</div>' +
    '<div class="stat-tx"><div class="lb">' + esc(label) + '</div>' +
    '<div class="vl">' + value + '</div>' +
    '<div class="dl">' + esc(sub) + '</div></div>' +
    '</div>';
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
    startAutoRefresh();
    loadData(false);
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

function renderApp() {
  document.body.className = '';
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

  $('root').innerHTML =
    '<header class="topbar">' +
    '<div class="tb-brand"><div class="brand-ico">' + IC.cloud + '</div><span class="t">Optix LAB MedSync</span> <span class="badge b-blue">SUPERADMIN</span></div>' +
    '<div class="tb-right">' +
    '<span class="api-pill ' + (state.apiDown ? 'down' : 'ok') + '" id="apiPill"><span class="pdot"></span>' + (state.apiDown ? 'API unreachable' : 'API connected') + '</span>' +
    '<button class="btn btn-sm" id="refreshBtn">Refresh</button>' +
    '<button class="btn btn-ghost btn-sm" id="logoutBtn">Logout</button>' +
    '</div></header>' +
    (state.apiDown
      ? '<div class="banner"><span>⚠</span><span>Cannot reach the API server at ' + esc(API || 'same origin') + '. Showing the last known data — check that the backend is running.</span></div>'
      : '') +
    '<main class="wrap">' +
    '<div class="page-h"><div><h1>Lab Installations</h1>' +
    '<p>Monitor connected labs and roll out software updates.' +
    (state.lastUpdated ? ' Last refreshed ' + esc(state.lastUpdated.toLocaleTimeString('en-US')) + '.' : '') + '</p></div></div>' +
    (state.loading ? '<div class="spin"></div>' :
      '<div class="stat-grid">' + stats + '</div>' +
      '<div class="card"><div class="card-h"><h3>Labs</h3><span class="sub">' + labs.length + ' installation' + (labs.length === 1 ? '' : 's') + '</span></div>' +
      labsTableHtml() + '</div>' +
      tenantsCardHtml() +
      whatsappCardHtml() +
      releaseCardHtml() +
      changelogCardHtml()) +
    '</main>';

  $('logoutBtn').addEventListener('click', function () { logout(false); });
  $('refreshBtn').addEventListener('click', function () { loadData(false); });
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

/* ---------------- auth lifecycle ---------------- */

function logout(expired) {
  clearStoredKey();
  state.key = null;
  state.loggedIn = false;
  state.labs = [];
  state.version = null;
  state.apiDown = false;
  state.loading = false;
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
    startAutoRefresh();
    loadData(false);
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
