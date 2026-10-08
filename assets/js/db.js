/* Optix Medical Sync — DB layer (localStorage). Exposes window.DB. See SPEC.md for schema.
   MULTI-TENANT: each lab gets its own isolated store under 'labpos_db_' + labId.
   The registry 'labpos_labs_v1' lists all labs. Switch stores with DB.useLab(labId). */
(function () {
  'use strict';

  /* ---------------- multi-tenant ---------------- */
  var REG_KEY = 'labpos_labs_v1';   /* lab registry: { labs: [{id,name,adminUsername,createdAt,active}] } */
  var LAST_KEY = 'labpos_last_lab'; /* last used lab (login page preview) */
  var LEGACY_KEY = 'labpos_db_v1';  /* old single-lab key — migrated to lab1, kept as backup */
  var KEY = LEGACY_KEY;
  var currentLabId = null;

  function keyFor(labId) { return 'labpos_db_' + labId; }

  function loadRegistry() {
    try {
      var r = JSON.parse(localStorage.getItem(REG_KEY) || 'null');
      if (r && Array.isArray(r.labs)) return r;
    } catch (e) {}
    return null;
  }
  function saveRegistry(reg) {
    try { localStorage.setItem(REG_KEY, JSON.stringify(reg)); } catch (e) {}
  }
  function labById(id) {
    var reg = loadRegistry();
    if (!reg || !id) return null;
    for (var i = 0; i < reg.labs.length; i++) {
      if (reg.labs[i].id === id) return reg.labs[i];
    }
    return null;
  }

  /* First run: build the registry. An existing single-lab database is migrated
     into the default lab ('lab1'); the legacy key is left untouched as backup. */
  function ensureRegistry() {
    var reg = loadRegistry();
    if (reg) return reg;
    var legacy = null;
    try { legacy = localStorage.getItem(LEGACY_KEY); } catch (e) {}
    var labName = 'Optix Medical Sync';
    if (legacy) {
      try {
        var s = JSON.parse(legacy);
        if (s && s.settings && s.settings.labName) labName = s.settings.labName;
      } catch (e) {}
    }
    reg = { labs: [{ id: 'lab1', name: labName, adminUsername: 'admin', createdAt: new Date().toISOString(), active: true }] };
    saveRegistry(reg);
    if (legacy) {
      try { localStorage.setItem(keyFor('lab1'), legacy); } catch (e) {}
    }
    return reg;
  }

  /* Remote mode: when served by the LabPOS server, /api-config.js sets
     window.LABPOS_API and DB.init() loads the server dump into `store`.
     All reads stay synchronous; writes go to memory + fire-and-forget API. */
  var API = null;
  var remote = false;   /* server data loaded + authenticated: writes mirror to the API */
  var cloud = false;    /* a token-auth cloud API is configured (login goes through the server) */
  var inflight = 0;     /* unfinished API writes (the background refresh waits for 0) */
  var SESS_KEY = 'labpos_session';
  function sessToken() {
    try { var s = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); return (s && s.token) || ''; } catch (e) { return ''; }
  }
  function sessRole() {
    try { var s = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); return (s && s.role) || ''; } catch (e) { return ''; }
  }
  function authHeaders(extra) {
    var h = extra || {};
    var t = sessToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }
  function clearSession() { try { localStorage.removeItem(SESS_KEY); } catch (e) {} }
  function fireAuthError() { try { if (window.DB && typeof window.DB.onAuthError === 'function') window.DB.onAuthError(); } catch (e) {} }
  function fireWriteError(msg, code) { try { if (window.DB && typeof window.DB.onWriteError === 'function') window.DB.onWriteError(msg, code); } catch (e) {} }
  var unreachable = false; /* the configured server did not answer (slow / offline): keep the session, offer Retry */
  function loadDump() {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, 60000) : null;
    return window.fetch(API + '/api/dump', { cache: 'no-store', headers: authHeaders(), signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (to) clearTimeout(to);
      if (r.status === 401) { var e = new Error('auth'); e.auth = true; throw e; }
      if (r.status === 403) { /* suspended lab: say so instead of looking like a network problem */
        return r.json().catch(function () { return {}; }).then(function (j) {
          var e2 = new Error((j && j.error) || 'This lab account is suspended. Please contact support.'); e2.auth = true; e2.suspended = (j && j.code === 'SUSPENDED');
          try { window.__loginNote = e2.message; } catch (x) {}
          throw e2;
        });
      }
      if (!r.ok) throw new Error('dump failed');
      return r.json();
    }).then(function (dump) {
      if (!dump || !dump.settings || !dump.seq) throw new Error('bad dump');
      return dump;
    }, function (e) { if (to) clearTimeout(to); throw e; });
  }
  function apiWrite(method, table, id, body) {
    if (!remote || !API) return;
    var url = API + '/api/' + table + (id ? '/' + encodeURIComponent(id) : '');
    inflight++;
    try {
      fetch(url, {
        method: method,
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        inflight--;
        if (r.ok) return;
        if (r.status === 401) { fireAuthError(); return; }
        if (r.status === 409) { /* another PC took this record number: pull fresh data */
          fireWriteError('Another user saved at the same time. Data refreshed — please re-check and retry.');
          if (window.DB) window.DB.refresh();
          return;
        }
        return r.json().catch(function () { return {}; }).then(function (j) {
          fireWriteError((j && j.error) || ('Server rejected the change (' + r.status + ')'), j && j.code);
          if (r.status === 402 && window.DB) setTimeout(function () { window.DB.refresh(); }, 300); /* subscription expired / plan limit: drop the unsaved local change */
        });
      }).catch(function () {
        inflight--;
        fireWriteError('Could not reach the server — the last change was NOT saved. Check your connection.');
      });
    } catch (e) { inflight--; }
  }

  /* bulk writes (CSV / 5000-test catalog import, price updates): rows are queued per table and sent
     as a few batched requests instead of thousands of single ones */
  var bulkQ = {}, bulkTimer = null;
  function bulkWrite(table, row) {
    if (!remote || !API) return;
    (bulkQ[table] = bulkQ[table] || []).push(row);
    if (!bulkTimer) bulkTimer = setTimeout(flushBulk, 60);
  }
  function flushBulk() {
    bulkTimer = null;
    var q = bulkQ; bulkQ = {};
    Object.keys(q).forEach(function (table) {
      var rows = q[table];
      for (var i = 0; i < rows.length; i += 400) {
        (function (chunk) {
          inflight++;
          fetch(API + '/api/bulk/' + table, {
            method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ rows: chunk })
          }).then(function (r) {
            inflight--;
            if (r.ok) return;
            if (r.status === 401) { fireAuthError(); return; }
            return r.json().catch(function () { return {}; }).then(function (j) {
              fireWriteError((j && j.error) || ('Server rejected the import (' + r.status + ')'), j && j.code);
              if (r.status === 402 && window.DB) setTimeout(function () { window.DB.refresh(); }, 300);
            });
          }).catch(function () { inflight--; fireWriteError('Could not reach the server — the import was NOT saved.'); });
        })(rows.slice(i, i + 400));
      }
    });
  }

  var ID_CONF = {
    users:    { prefix: 'U',  digits: 2 },
    doctors:  { prefix: 'D',  digits: 2 },
    tests:    { prefix: 'T',  digits: 3 },
    patients: { prefix: 'P',  digits: 4 },
    invoices: { prefix: null, digits: 4 }, /* uses settings.invoicePrefix */
    payments: { prefix: 'PM', digits: 4 },
    expenses: { prefix: 'EX', digits: 4 },
    results:  { prefix: 'R',  digits: 4 },
    report_templates: { prefix: 'TPL', digits: 3 },
    report_schedules: { prefix: 'SCH', digits: 3 },
    wa_log: { prefix: 'WAL', digits: 4 },
    samples: { prefix: 'S', digits: 5 },
    closings: { prefix: 'CL', digits: 4 },
    stock_items: { prefix: 'SI', digits: 3 },
    stock_moves: { prefix: 'SM', digits: 5 },
    email_log: { prefix: 'EL', digits: 5 },
    panels: { prefix: 'PN', digits: 3 },
    ref_labs: { prefix: 'RL', digits: 3 },
    outsourced: { prefix: 'OS', digits: 5 }
  };
  var ARRAY_TABLES = ['users', 'patients', 'tests', 'doctors', 'invoices', 'payments', 'expenses', 'results', 'report_templates', 'report_schedules', 'wa_log', 'samples', 'closings', 'stock_items', 'stock_moves', 'email_log', 'panels', 'ref_labs', 'outsourced'];

  /* ---------------- storage ---------------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function save(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (e) { /* quota — ignore, app continues in-memory */ }
  }
  function copy(o) { return o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)); }

  function pad(n, digits) {
    var s = String(n);
    while (s.length < digits) s = '0' + s;
    return s;
  }

  function nextId(store, table) {
    var conf = ID_CONF[table];
    store.seq[table] = (store.seq[table] || 0) + 1;
    var prefix = conf.prefix;
    if (table === 'invoices') prefix = (store.settings && store.settings.invoicePrefix) || 'INV';
    return prefix + '-' + pad(store.seq[table], conf.digits);
  }

  /* Recompute seq counters from existing ids (used after import). */
  function normalizeSeq(store) {
    ARRAY_TABLES.forEach(function (t) {
      var conf = ID_CONF[t], max = 0;
      (store[t] || []).forEach(function (row) {
        var m = String(row.id || '').match(/(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      store.seq[t] = Math.max(store.seq[t] || 0, max);
    });
  }

  /* ---------------- seed ---------------- */
  function isoDaysAgo(days, h, min) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(h || 10, min || 0, 0, 0);
    return d.toISOString();
  }

  function seedStore(opts) {
    opts = opts || {};
    var store = {
      seq: { users: 0, doctors: 0, tests: 0, patients: 0, invoices: 0, payments: 0, expenses: 0, results: 0, wa_log: 0, samples: 0 },
      settings: {
        id: 'main',
        labName: opts.labName || 'Optix Medical Sync',
        tagline: 'Accurate • Fast • Trusted',
        address: 'Main Road, Gulberg, Lahore',
        phone: '0300-1234567',
        email: 'info@citybloodlab.pk',
        invoicePrefix: 'INV',
        footerNote: '',
        currency: 'PKR',
        whatsapp: { provider: 'ultramsg', instanceId: '', token: '', baseUrl: '', labNumber: '', autoPatient: true, autoDoctor: false },
        signatories: [
          { name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist' },
          { name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP', title: '' },
          { name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist' },
          { name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Lab Technologist' }
        ]
      },
      users: [], patients: [], tests: [], doctors: [],
      invoices: [], payments: [], expenses: [], results: [],
      wa_log: [], samples: [], stock_items: [], stock_moves: [], email_log: [], panels: [], ref_labs: [], outsourced: []
    };

    function put(table, obj) {
      var conf = ID_CONF[table];
      store.seq[table]++;
      if (!obj.id) {
        var prefix = conf.prefix || (store.settings.invoicePrefix || 'INV');
        obj.id = prefix + '-' + pad(store.seq[table], conf.digits);
      }
      if (table === 'invoices' && !obj.no) obj.no = obj.id;
      store[table].push(obj);
      return obj;
    }

    /* users — per-tenant admin comes from opts.admin when provided */
    var _adm = opts.admin || {};
    put('users', { id: 'U-01', name: _adm.name || 'Administrator', username: _adm.username || 'admin', password: _adm.password || 'admin123', role: 'admin', active: true });
    put('users', { id: 'U-02', name: 'Rizwan Ahmed', username: 'reception', password: 'rec123', role: 'reception', active: true });
    put('users', { id: 'U-03', name: 'Sana Iqbal', username: 'technician', password: 'tech123', role: 'technician', active: true });

    /* doctors */
    put('doctors', { id: 'D-01', name: 'Dr. Ahmed Khan', clinic: 'City Clinic, Gulberg', phone: '0301-1112223', commissionPct: 15 });
    put('doctors', { id: 'D-02', name: 'Dr. Sara Malik', clinic: 'Health Center, Model Town', phone: '0321-4445556', commissionPct: 10 });

    /* tests: [code, name, category, price, sampleType, tat, params] */
    /* Default report templates — per-test fields used by result entry, print and PDF */
    var TP = {
      'CBC': [
        { name: 'Hb', unit: 'g/dl', ref: '11.5 - 16', refMale: '13.0 - 17.0', refFemale: '12.0 - 15.0', type: 'number' },
        { name: 'Total RBC', unit: 'x10^12/l', ref: '4 - 6', refMale: '4.5 - 5.5', refFemale: '3.8 - 4.8', type: 'number' },
        { name: 'HCT', unit: '%', ref: '36 - 46', refMale: '40 - 50', refFemale: '36 - 46', type: 'number' },
        { name: 'MCV', unit: 'fl', ref: '75 - 95', type: 'number' },
        { name: 'MCH', unit: 'pg', ref: '26 - 32', type: 'number' },
        { name: 'MCHC', unit: 'g/dl', ref: '30 - 35', type: 'number' },
        { name: 'Platelet Count', unit: 'x10^9/l', ref: '150 - 400', type: 'number' },
        { name: 'WBC Count (TLC)', unit: 'x10^9/l', ref: '4 - 11', type: 'number' },
        { name: 'Neutrophils', unit: '%', ref: '40 - 75', type: 'number' },
        { name: 'Lymphocytes', unit: '%', ref: '20 - 50', type: 'number' },
        { name: 'Monocytes', unit: '%', ref: '02 - 10', type: 'number' },
        { name: 'Eosinophils', unit: '%', ref: '01 - 06', type: 'number' }
      ],
      'HB': [{ name: 'Hemoglobin', unit: 'g/dL', ref: '13.5–17.5', type: 'number' }],
      'ESR': [{ name: 'ESR', unit: 'mm/hr', ref: '0–20', type: 'number' }],
      'PLT': [{ name: 'Platelet Count', unit: 'x10^9/l', ref: '150 – 400', type: 'number' }],
      'BGRP': [{ name: 'ABO Group', unit: '', ref: '', type: 'text' }, { name: 'Rh Factor', unit: '', ref: 'Positive / Negative', type: 'text' }],
      'PTINR': [
        { name: 'Prothrombin Time', unit: 'sec', ref: '11–13', type: 'number' },
        { name: 'Control', unit: 'sec', ref: '', type: 'number' },
        { name: 'INR', unit: 'ratio', ref: '0.9–1.1', type: 'number' }
      ],
      'RETIC': [{ name: 'Reticulocyte Count', unit: '%', ref: '0.5–2.5', type: 'number' }],
      'LFT': [
        { name: 'Bilirubin – Total', unit: 'mg/dL', ref: '0.3–1.2', type: 'number' },
        { name: 'Bilirubin – Direct', unit: 'mg/dL', ref: '0.0–0.3', type: 'number' },
        { name: 'ALT (SGPT)', unit: 'U/L', ref: '7–56', type: 'number' },
        { name: 'AST (SGOT)', unit: 'U/L', ref: '10–40', type: 'number' },
        { name: 'Alkaline Phosphatase', unit: 'U/L', ref: '44–147', type: 'number' },
        { name: 'Total Protein', unit: 'g/dL', ref: '6.0–8.3', type: 'number' },
        { name: 'Albumin', unit: 'g/dL', ref: '3.5–5.5', type: 'number' }
      ],
      'RFT': [
        { name: 'Urea', unit: 'mg/dL', ref: '15–40', type: 'number' },
        { name: 'Creatinine', unit: 'mg/dL', ref: '0.6–1.2', type: 'number' },
        { name: 'Sodium', unit: 'mmol/L', ref: '135–145', type: 'number' },
        { name: 'Potassium', unit: 'mmol/L', ref: '3.5–5.1', type: 'number' }
      ],
      'ELEC': [
        { name: 'Sodium', unit: 'mmol/L', ref: '135–145', type: 'number' },
        { name: 'Potassium', unit: 'mmol/L', ref: '3.5–5.1', type: 'number' },
        { name: 'Chloride', unit: 'mmol/L', ref: '98–107', type: 'number' },
        { name: 'Bicarbonate', unit: 'mmol/L', ref: '22–28', type: 'number' }
      ],
      'CA': [{ name: 'Serum Calcium', unit: 'mg/dL', ref: '8.5–10.5', type: 'number' }],
      'UA': [{ name: 'Uric Acid', unit: 'mg/dL', ref: '3.4–7.0', type: 'number' }],
      'CRP': [{ name: 'C-Reactive Protein', unit: 'mg/L', ref: '< 3.0', type: 'number' }],
      'FBS': [{ name: 'Glucose – Fasting', unit: 'mg/dL', ref: '70–100', type: 'number' }],
      'RBS': [{ name: 'Glucose – Random', unit: 'mg/dL', ref: '< 140', type: 'number' }],
      'HBA1C': [{ name: 'HbA1c', unit: '%', ref: '< 5.7', type: 'number' }],
      'OGTT': [
        { name: 'Glucose – Fasting', unit: 'mg/dL', ref: '70–100', type: 'number' },
        { name: 'Glucose – 2 Hour', unit: 'mg/dL', ref: '< 140', type: 'number' }
      ],
      'LIPID': [
        { name: 'Total Cholesterol', unit: 'mg/dL', ref: '< 200', type: 'number' },
        { name: 'Triglycerides', unit: 'mg/dL', ref: '< 150', type: 'number' },
        { name: 'HDL', unit: 'mg/dL', ref: '> 40', type: 'number' },
        { name: 'LDL', unit: 'mg/dL', ref: '< 100', type: 'number' }
      ],
      'CHOL': [{ name: 'Total Cholesterol', unit: 'mg/dL', ref: '< 200', type: 'number' }],
      'TG': [{ name: 'Triglycerides', unit: 'mg/dL', ref: '< 150', type: 'number' }],
      'HBSAG': [{ name: 'Result', unit: '', ref: 'Non-Reactive', type: 'text' }],
      'AHCV': [{ name: 'Result', unit: '', ref: 'Non-Reactive', type: 'text' }],
      'HIV': [{ name: 'Result', unit: '', ref: 'Non-Reactive', type: 'text' }],
      'NS1': [{ name: 'Dengue NS1', unit: '', ref: 'Negative', type: 'text' }],
      'WIDAL': [{ name: 'Result', unit: '', ref: 'Negative', type: 'text' }],
      'TYPHI': [
        { name: 'IgG', unit: '', ref: 'Negative', type: 'text' },
        { name: 'IgM', unit: '', ref: 'Negative', type: 'text' }
      ],
      'TSH': [{ name: 'TSH', unit: 'µIU/mL', ref: '0.27–4.2', type: 'number' }],
      'TFT': [
        { name: 'T3', unit: 'ng/mL', ref: '0.8–2.0', type: 'number' },
        { name: 'T4', unit: 'µg/dL', ref: '5.1–14.1', type: 'number' },
        { name: 'TSH', unit: 'µIU/mL', ref: '0.27–4.2', type: 'number' }
      ],
      'TESTO': [{ name: 'Testosterone – Total', unit: 'ng/dL', ref: '264–916', type: 'number' }],
      'VITD': [{ name: 'Vitamin D (25-OH)', unit: 'ng/mL', ref: '30–100', type: 'number' }],
      'B12': [{ name: 'Vitamin B12', unit: 'pg/mL', ref: '200–900', type: 'number' }],
      'FERR': [{ name: 'Ferritin', unit: 'ng/mL', ref: '30–400', type: 'number' }],
      'URE': [
        { name: 'Colour', unit: '', ref: 'Pale yellow', type: 'text' },
        { name: 'Appearance', unit: '', ref: 'Clear', type: 'text' },
        { name: 'pH', unit: '', ref: '4.6–8.0', type: 'number' },
        { name: 'Specific Gravity', unit: '', ref: '1.005–1.030', type: 'number' },
        { name: 'Protein', unit: '', ref: 'Negative', type: 'text' },
        { name: 'Glucose', unit: '', ref: 'Negative', type: 'text' },
        { name: 'Pus Cells', unit: '/hpf', ref: 'Nil', type: 'text' },
        { name: 'RBCs', unit: '/hpf', ref: 'Nil', type: 'text' },
        { name: 'Epithelial Cells', unit: '/hpf', ref: 'Few', type: 'text' }
      ],
      'UCUL': [{ name: 'Culture Result', unit: '', ref: 'No growth', type: 'text' }],
      'UPT': [{ name: 'Result', unit: '', ref: '', type: 'text' }]
    };
    var T = [
      ['CBC', 'Complete Blood Count', 'Hematology', 800, 'Blood', 'Same day', []],
      ['ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 300, 'Blood', 'Same day', []],
      ['HB', 'Hemoglobin', 'Hematology', 250, 'Blood', 'Same day', []],
      ['PLT', 'Platelet Count', 'Hematology', 400, 'Blood', 'Same day', []],
      ['BGRP', 'Blood Group (ABO/Rh)', 'Hematology', 350, 'Blood', 'Same day', []],
      ['PTINR', 'PT / INR', 'Hematology', 900, 'Blood', 'Same day', []],
      ['RETIC', 'Reticulocyte Count', 'Hematology', 600, 'Blood', 'Next day', []],
      ['LFT', 'Liver Function Test', 'Biochemistry', 1200, 'Serum', 'Same day', []],
      ['RFT', 'Renal Function Test (KFT)', 'Biochemistry', 1200, 'Serum', 'Same day', []],
      ['ELEC', 'Serum Electrolytes', 'Biochemistry', 900, 'Serum', 'Same day', []],
      ['CA', 'Serum Calcium', 'Biochemistry', 600, 'Serum', 'Same day', []],
      ['UA', 'Uric Acid', 'Biochemistry', 450, 'Serum', 'Same day', []],
      ['CRP', 'C-Reactive Protein', 'Biochemistry', 800, 'Serum', 'Same day', []],
      ['FBS', 'Fasting Blood Glucose', 'Diabetes', 300, 'Blood', 'Same day', []],
      ['RBS', 'Random Blood Glucose', 'Diabetes', 300, 'Blood', 'Same day', []],
      ['HBA1C', 'HbA1c (Glycated Hemoglobin)', 'Diabetes', 1100, 'Blood', 'Same day', []],
      ['OGTT', 'Oral Glucose Tolerance Test', 'Diabetes', 900, 'Blood', 'Next day', []],
      ['LIPID', 'Lipid Profile', 'Lipid', 1300, 'Serum', 'Same day', []],
      ['CHOL', 'Total Cholesterol', 'Lipid', 450, 'Serum', 'Same day', []],
      ['TG', 'Triglycerides', 'Lipid', 450, 'Serum', 'Same day', []],
      ['HBSAG', 'HBsAg (Hepatitis B)', 'Serology', 700, 'Serum', 'Same day', []],
      ['AHCV', 'Anti-HCV (Hepatitis C)', 'Serology', 700, 'Serum', 'Same day', []],
      ['HIV', 'HIV Screening', 'Serology', 900, 'Serum', 'Same day', []],
      ['NS1', 'Dengue NS1 Antigen', 'Serology', 1200, 'Serum', 'Same day', []],
      ['WIDAL', 'Widal Test', 'Serology', 600, 'Serum', 'Same day', []],
      ['TYPHI', 'Typhidot (IgG/IgM)', 'Serology', 800, 'Serum', 'Same day', []],
      ['TSH', 'Thyroid Stimulating Hormone', 'Hormones', 900, 'Serum', 'Same day', []],
      ['TFT', 'Thyroid Profile (T3/T4/TSH)', 'Hormones', 1800, 'Serum', 'Next day', []],
      ['TESTO', 'Testosterone (Total)', 'Hormones', 1500, 'Serum', 'Next day', []],
      ['VITD', 'Vitamin D (25-OH)', 'Hormones', 2500, 'Serum', 'Next day', []],
      ['B12', 'Vitamin B12', 'Hormones', 2200, 'Serum', 'Next day', []],
      ['FERR', 'Ferritin', 'Hormones', 1400, 'Serum', 'Same day', []],
      ['URE', 'Urine Routine Examination', 'Urine', 400, 'Urine', 'Same day', []],
      ['UCUL', 'Urine Culture & Sensitivity', 'Urine', 1500, 'Urine', '2 days', []],
      ['UPT', 'Urine Pregnancy Test', 'Urine', 500, 'Urine', 'Same day', []]
    ];
    T.forEach(function (t) {
      put('tests', { code: t[0], name: t[1], category: t[2], price: t[3], sampleType: t[4], tat: t[5], active: true, params: TP[t[0]] || t[6] });
    });
    var testByCode = {};
    store.tests.forEach(function (t) { testByCode[t.code] = t; });

    /* ---- demo data: only for the default lab (fresh tenants start clean) ---- */
    if (opts.demoData !== false) {

    /* patients */
    var P = [
      ['Muhammad Imran', 42, 'Male', '0301-4567890', 'House 12, Street 5, Gulberg III, Lahore'],
      ['Ayesha Bibi', 35, 'Female', '0321-9876543', 'Flat 4, Al-Rehman Plaza, Model Town, Lahore'],
      ['Muhammad Aslam', 58, 'Male', '0333-1122334', 'Village Rakh, Tehsil Cantt, Lahore'],
      ['Fatima Noor', 27, 'Female', '0345-6677889', 'House 88, Block C, DHA Phase 5, Lahore'],
      ['Bilal Hussain', 31, 'Male', '0300-4455667', 'Street 9, Samanabad, Lahore'],
      ['Zainab Tariq', 45, 'Female', '0322-7788990', 'House 3, Main Boulevard, Johar Town, Lahore']
    ];
    P.forEach(function (p, i) {
      put('patients', { name: p[0], age: p[1], gender: p[2], phone: p[3], address: p[4], createdAt: isoDaysAgo(30 - i * 4, 11, 0) });
    });

    /* invoices + payments + results */
    /* [daysAgo, hour, min, patientIdx(1-based), doctorId|null, testCodes, discount, paid, method, createdBy] */
    var INV = [
      [6, 10, 30, 1, 'D-01', ['CBC', 'ESR'], 0, 1100, 'Cash', 'reception'],
      [6, 12, 15, 2, null, ['HBA1C'], 100, 1000, 'Cash', 'reception'],
      [5, 9, 45, 3, 'D-02', ['LIPID', 'FBS'], 0, 800, 'Cash', 'reception'],
      [5, 15, 20, 4, 'D-01', ['CBC', 'URE', 'HBSAG'], 150, 0, null, 'reception'],
      [3, 11, 5, 5, null, ['LFT', 'RFT'], 200, 2200, 'Bank', 'admin'],
      [3, 16, 40, 1, 'D-02', ['TSH'], 0, 900, 'Card', 'reception'],
      [2, 10, 10, 6, 'D-01', ['VITD', 'CA'], 0, 1500, 'Cash', 'reception'],
      [1, 9, 30, 2, null, ['CBC', 'ESR', 'CRP'], 0, 1900, 'Cash', 'reception'],
      [1, 14, 0, 3, 'D-01', ['HBA1C', 'LIPID'], 200, 0, null, 'reception'],
      [0, 10, 0, 4, 'D-02', ['NS1', 'CBC'], 0, 2000, 'Cash', 'reception']
    ];
    /* ready result values for param-based tests (older invoices) */
    var READY_VALS = {
      'CBC': { 'Hb': '14.2', 'Total RBC': '4.8', 'HCT': '42', 'MCV': '88', 'MCH': '29', 'MCHC': '33', 'Platelet Count': '248', 'WBC Count (TLC)': '7.6', 'Neutrophils': '60', 'Lymphocytes': '30', 'Monocytes': '6', 'Eosinophils': '3' },
      'HBA1C': { 'HbA1c': '6.8' },
      'LIPID': { 'Total Cholesterol': '198', 'Triglycerides': '142', 'HDL': '52', 'LDL': '118' },
      'ESR': { 'Result': '18 mm/hr' },
      'FBS': { 'Result': '104 mg/dL' },
      'URE': { 'Result': 'Normal — no abnormality detected' },
      'HBSAG': { 'Result': 'Non-Reactive' },
      'LFT': { 'Result': 'Within normal limits' },
      'RFT': { 'Result': 'Within normal limits' },
      'TSH': { 'Result': '2.4 µIU/mL' }
    };
    INV.forEach(function (r, idx) {
      var items = r[5].map(function (code) {
        var t = testByCode[code];
        return { testId: t.id, code: t.code, name: t.name, price: t.price };
      });
      var subtotal = items.reduce(function (s, it) { return s + it.price; }, 0);
      var total = subtotal - r[6];
      var paid = r[7];
      var due = total - paid;
      var status = due <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
      var createdAt = isoDaysAgo(r[0], r[1], r[2]);
      var inv = put('invoices', {
        patientId: store.patients[r[3] - 1].id,
        doctorId: r[4],
        items: items,
        subtotal: subtotal, discount: r[6], total: total,
        paid: paid, due: due, status: status,
        createdAt: createdAt, createdBy: r[9]
      });
      if (paid > 0) {
        put('payments', {
          invoiceId: inv.id, amount: paid, method: r[8],
          date: createdAt, note: 'Seed payment', createdBy: r[9]
        });
      }
      /* one result row per item; first 6 invoices => ready */
      var ready = idx < 6;
      items.forEach(function (it) {
        var t = testByCode[it.code];
        put('results', {
          invoiceId: inv.id,
          testId: it.testId,
          values: ready ? (READY_VALS[it.code] || { 'Result': 'Normal' }) : {},
          status: ready ? 'ready' : 'pending',
          reportedAt: ready ? isoDaysAgo(r[0], Math.min(r[1] + 5, 20), 15) : null,
          reportedBy: ready ? 'technician' : null
        });
      });
    });

    /* expenses: [daysAgo, title, category, amount, createdBy] */
    var EXP = [
      [6, 'CBC Reagent Kit (100 tests)', 'Supplies', 8500, 'admin'],
      [4, 'Electricity Bill — September', 'Utilities', 3200, 'admin'],
      [2, 'Staff Salary Advance', 'Salary', 15000, 'admin'],
      [1, 'Cleaning & Disinfectant Supplies', 'Supplies', 1200, 'reception']
    ];
    EXP.forEach(function (e) {
      put('expenses', { title: e[1], category: e[2], amount: e[3], date: isoDaysAgo(e[0], 12, 0), note: 'Seed expense', createdBy: e[4] });
    });

    } /* end demo data */

    return store;
  }

  /* ---------------- public API ---------------- */
  var store = null;

  /* one-time migrations applied per store */
  function applyMigrations() {
    /* rebrand: existing installs seeded with the old default name */
    if (store && store.settings && (store.settings.labName === 'City Blood Lab' || store.settings.labName === 'Optxic LAB')) {
      store.settings.labName = 'Optix Medical Sync'; save(store);
    }
    /* existing installs lack the WhatsApp config object */
    if (store && store.settings && !store.settings.whatsapp) {
      store.settings.whatsapp = { provider: 'ultramsg', instanceId: '', token: '', baseUrl: '', labNumber: '', autoPatient: true, autoDoctor: false };
      save(store);
    }
    /* existing installs lack the WhatsApp auto-send toggles (backfill without
       clobbering values the lab already set) */
    if (store && store.settings && store.settings.whatsapp) {
      var _wa = store.settings.whatsapp, _waDirty = false;
      if (_wa.autoPatient == null) { _wa.autoPatient = true; _waDirty = true; }
      if (_wa.autoDoctor == null) { _wa.autoDoctor = false; _waDirty = true; }
      if (_waDirty) save(store);
    }
    /* existing installs lack the WhatsApp send log */
    if (store && !Array.isArray(store.wa_log)) {
      store.wa_log = [];
      if (!store.seq) store.seq = {};
      if (store.seq.wa_log == null) store.seq.wa_log = 0;
      save(store);
    }
    /* existing installs lack the sample-tracking table */
    if (store && !Array.isArray(store.samples)) {
      store.samples = [];
      if (!store.seq) store.seq = {};
      if (store.seq.samples == null) store.seq.samples = 0;
      save(store);
    }
    /* existing installs lack the panel (corporate client) table */
    if (store && !Array.isArray(store.panels)) {
      store.panels = [];
      if (!store.seq) store.seq = {};
      if (store.seq.panels == null) store.seq.panels = 0;
      save(store);
    }
    /* existing installs lack the outsourced-test tables */
    if (store && (!Array.isArray(store.ref_labs) || !Array.isArray(store.outsourced))) {
      if (!Array.isArray(store.ref_labs)) store.ref_labs = [];
      if (!Array.isArray(store.outsourced)) store.outsourced = [];
      if (!store.seq) store.seq = {};
      if (store.seq.ref_labs == null) store.seq.ref_labs = 0;
      if (store.seq.outsourced == null) store.seq.outsourced = 0;
      save(store);
    }
    /* existing installs lack the email log */
    if (store && !Array.isArray(store.email_log)) {
      store.email_log = [];
      if (!store.seq) store.seq = {};
      if (store.seq.email_log == null) store.seq.email_log = 0;
      save(store);
    }
    /* existing installs lack the stock tables */
    if (store && (!Array.isArray(store.stock_items) || !Array.isArray(store.stock_moves))) {
      if (!Array.isArray(store.stock_items)) store.stock_items = [];
      if (!Array.isArray(store.stock_moves)) store.stock_moves = [];
      if (!store.seq) store.seq = {};
      if (store.seq.stock_items == null) store.seq.stock_items = 0;
      if (store.seq.stock_moves == null) store.seq.stock_moves = 0;
      save(store);
    }
    /* existing installs lack the daily cash-closing table */
    if (store && !Array.isArray(store.closings)) {
      store.closings = [];
      if (!store.seq) store.seq = {};
      if (store.seq.closings == null) store.seq.closings = 0;
      save(store);
    }
    /* existing installs lack default signatory doctors — seed from reference */
    if (store && store.settings && (!store.settings.signatories || !store.settings.signatories.length)) {
      store.settings.signatories = [
        { name: 'DR. AAFRINISH AMANAT', qual: 'MBBS, M.Phil (Histopathology)', title: 'Consultant Pathologist' },
        { name: 'DR. YUMNA KHAN', qual: 'B.Sc, MBBS, FCPS, RMP', title: '' },
        { name: 'ABDAL INAM UL HAQ KHANZADA', qual: 'M.Phil (Microbiology)', title: 'Lab Technologist' },
        { name: 'ABDUL WAHEED KHANZADA', qual: 'MA, MLT (AFIP)', title: 'Lab Technologist' }
      ];
      save(store);
    }
  }

  /* Switch to a lab's isolated store. Falls back to the first registered lab.
     Returns the lab record (copy) or null when no labs exist. */
  function useLab(labId) {
    var reg = ensureRegistry();
    var lab = labById(labId) || (reg.labs.length ? reg.labs[0] : null);
    if (!lab) return null;
    currentLabId = lab.id;
    KEY = keyFor(lab.id);
    store = load();
    if (!store) {
      store = seedStore({ labName: lab.name, demoData: lab.id === 'lab1' });
      save(store);
    }
    applyMigrations();
    /* auto-seed 5000 tests if catalog is loaded and fewer than 100 tests exist */
    try {
      if (store && typeof TEST_CATALOG_5000 !== 'undefined' && TEST_CATALOG_5000.length) {
        var existingNames = {};
        (store.tests || []).forEach(function (t) { existingNames[(t.name || '').toLowerCase()] = 1; });
        if (Object.keys(existingNames).length < 100) {
          var added = 0;
          TEST_CATALOG_5000.forEach(function (ct, i) {
            var nm = (ct.name || '').toLowerCase();
            if (!ct.name || existingNames[nm]) return;
            existingNames[nm] = 1;
            store.seq.tests++;
            store.tests.push({
              id: 't' + Date.now() + '_' + i + '_' + added,
              code: 'T' + (10000 + i),
              name: ct.name, category: ct.category || 'General', price: 0,
              sampleType: 'Blood', tat: 'Same day', active: true,
              params: ct.params || []
            });
            added++;
          });
          if (added) save(store);
        }
      }
    } catch (e) {}
    try { localStorage.setItem(LAST_KEY, lab.id); } catch (e) {}
    return copy(lab);
  }

  /* boot: registry + migration, then load the last-used lab as the preview
     store (the login page reads branding from it before anyone logs in) */
  ensureRegistry();
  var _lastLab = null;
  try { _lastLab = localStorage.getItem(LAST_KEY); } catch (e) {}
  useLab(_lastLab || 'lab1');

  function persist() { if (!remote) save(store); }

  window.DB = {
    get KEY() { return KEY; },

    /* ---- multi-tenant ---- */
    useLab: useLab,
    currentLab: function () { var l = labById(currentLabId); return l ? copy(l) : null; },
    currentLabId: function () { return currentLabId; },
    labs: function () { if (cloud) return []; var r = loadRegistry(); return r ? copy(r.labs) : []; },
    labById: function (id) { var l = labById(id); return l ? copy(l) : null; },

    /* Load server data when running under the LabPOS server/Electron app.
       Must be awaited before first render (app.js does this). Falls back to
       localStorage silently when no server is present. */
    init: function () {
      var base = null;
      try { base = window.LABPOS_API || null; } catch (e) {}
      if (!base || !window.fetch) return Promise.resolve(false);
      API = base; unreachable = false;
      /* a doctor's login only ever sees the doctor dashboard: it must not (and cannot) download the lab's data */
      if (sessToken() && sessRole() === 'doctor') { cloud = true; remote = false; return Promise.resolve(true); }
      return loadDump().then(function (dump) {
        store = dump; remote = true;
        if (sessToken()) cloud = true; /* valid token = token-auth cloud API; no token = open desktop server */
        return true;
      }).catch(function (err) {
        cloud = true; remote = false;
        if (err && err.auth) {
          /* token-auth cloud API: no valid session -> login page, data loads after sign-in */
          clearSession();
          return window.fetch(API + '/api/public-info').then(function (r) { return r.ok ? r.json() : null; }).then(function (info) {
            if (info && info.labName) {
              store.settings.labName = info.labName;
              if (info.tagline) store.settings.tagline = info.tagline;
              if (info.logo) store.settings.logo = info.logo;
            }
            return true;
          }).catch(function () { return true; });
        }
        /* server configured but slow / unreachable: never fall back to the local demo store and NEVER drop a valid session
           just because the network is slow — the app shows "Retry" (or the login page when nobody is signed in). */
        unreachable = true;
        return true;
      });
    },
    isUnreachable: function () { return unreachable; },
    isRemote: function () { return remote; },
    isCloud: function () { return cloud; },
    /* Server-side login (cloud mode). Resolves {user, token}; rejects with a user-facing message. */
    cloudLogin: function (username, password, lab) {
      return window.fetch(API + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, lab: lab || '' })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || 'Login failed (' + r.status + ')');
          return j;
        });
      }, function () { throw new Error('Cannot reach the server. Check your internet connection.'); }).then(function (j) {
        try { localStorage.setItem(SESS_KEY, JSON.stringify({ token: j.token, role: j.user && j.user.role })); } catch (e) {}
        if (j.user && j.user.role === 'doctor') { cloud = true; remote = false; return j; }
        return loadDump().then(function (dump) { store = dump; remote = true; return j; });
      });
    },
    /* SaaS endpoints (/api/saas/*): signup, plans, my subscription, payment requests. Resolves the JSON; rejects with a message. */
    saas: function (method, path, body) {
      if (!API || !window.fetch) return Promise.reject(new Error('Server not configured'));
      return window.fetch(API + '/api/saas/' + path, {
        method: method, headers: authHeaders({ 'Content-Type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && sessToken()) fireAuthError();
          if (!r.ok) { var e = new Error(j.error || ('Request failed (' + r.status + ')')); e.code = j.code; e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error('Cannot reach the server. Check your internet connection.'); });
    },
    /* the lab's own linked WhatsApp number (/api/wa/*): status, link (QR), unlink, send. Resolves the JSON; rejects with a message. */
    waGw: function (method, path, body) {
      if (!API || !window.fetch) return Promise.reject(new Error('Server not configured'));
      return window.fetch(API + '/api/wa/' + path, {
        method: method, headers: authHeaders({ 'Content-Type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && sessToken()) fireAuthError();
          if (!r.ok) { var e = new Error(j.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error('Cannot reach the server. Check your internet connection.'); });
    },
    /* report sharing (/api/share/*): email + Slack. Resolves the JSON; rejects with a message. */
    share: function (method, path, body) {
      if (!API || !window.fetch) return Promise.reject(new Error('Server not configured'));
      return window.fetch(API + '/api/share/' + path, {
        method: method, headers: authHeaders({ 'Content-Type': 'application/json' }), body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && sessToken()) fireAuthError();
          if (!r.ok) { var e = new Error(j.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error('Cannot reach the server. Check your internet connection.'); });
    },
    /* use the session returned by signup (same as a login) */
    adoptSession: function (j) {
      try { localStorage.setItem(SESS_KEY, JSON.stringify({ token: j.token })); } catch (e) {}
      return loadDump().then(function (dump) { store = dump; remote = true; cloud = true; return j; });
    },
    changePassword: function (current, next) {
      return window.fetch(API + '/api/auth/change-password', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ current: current, next: next })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || 'Could not change password');
          if (j.token) { try { var s = JSON.parse(localStorage.getItem(SESS_KEY) || '{}'); s.token = j.token; localStorage.setItem(SESS_KEY, JSON.stringify(s)); } catch (e) {} } /* new token for this session */
          return true;
        });
      });
    },
    /* Pull fresh server data (other PCs' work). Skipped while our own writes are in flight. */
    refresh: function () {
      if (!remote || !API || inflight > 0) return Promise.resolve(false);
      return loadDump().then(function (dump) { if (inflight === 0) { store = dump; return true; } return false; })
        .catch(function (e) { if (e && e.auth) fireAuthError(); return false; });
    },
    authHeaders: authHeaders,
    onAuthError: null,
    onWriteError: null,

    all: function (table) {
      if (table === 'settings') return [copy(store.settings)];
      if (ARRAY_TABLES.indexOf(table) < 0) return [];
      return copy(store[table] || []);
    },

    get: function (table, id) {
      if (table === 'settings') return id === 'main' ? copy(store.settings) : null;
      var rows = store[table] || [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === id) return copy(rows[i]);
      }
      return null;
    },

    /* like insert, but with an id the caller chose (e.g. the invoice that carries its patient's number). Returns null when that id is already taken. */
    insertAs: function (table, id, obj) {
      if (table === 'settings' || ARRAY_TABLES.indexOf(table) < 0 || !id) return null;
      var rows = (store[table] = store[table] || []);
      for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) return null; }
      var row = copy(obj) || {};
      row.id = id;
      if (table === 'invoices' && !row.no) row.no = row.id;
      rows.push(row);
      persist();
      apiWrite('POST', table, null, row);
      return copy(row);
    },

    insert: function (table, obj) {
      if (table === 'settings' || ARRAY_TABLES.indexOf(table) < 0) return null;
      var row = copy(obj) || {};
      row.id = nextId(store, table);
      if (table === 'invoices' && !row.no) row.no = row.id;
      (store[table] = store[table] || []).push(row);
      persist();
      apiWrite('POST', table, null, row);
      return copy(row);
    },

    /* upsert a row (keeps its id, or generates one) — used by imports and bulk price updates */
    put: function (table, obj) {
      if (table === 'settings' || ARRAY_TABLES.indexOf(table) < 0 || !obj) return null;
      var row = copy(obj) || {};
      var rows = (store[table] = store[table] || []);
      if (!row.id) row.id = nextId(store, table);
      var at = -1;
      for (var i = 0; i < rows.length; i++) { if (rows[i].id === row.id) { at = i; break; } }
      if (at >= 0) rows[at] = row; else rows.push(row);
      persist();
      bulkWrite(table, row);
      return copy(row);
    },

    update: function (table, id, patch) {
      if (table === 'settings') {
        if (id !== 'main') return null;
        Object.keys(patch || {}).forEach(function (k) {
          if (k !== 'id') store.settings[k] = copy(patch[k]);
        });
        persist();
        apiWrite('PUT', 'settings', 'main', store.settings);
        return copy(store.settings);
      }
      var rows = store[table] || [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === id) {
          Object.keys(patch || {}).forEach(function (k) {
            if (k !== 'id') rows[i][k] = copy(patch[k]);
          });
          persist();
          apiWrite('PUT', table, id, rows[i]);
          if (remote && table === 'users') delete rows[i].password; /* never keep plaintext in memory */
          return copy(rows[i]);
        }
      }
      return null;
    },

    remove: function (table, id) {
      if (table === 'settings' || ARRAY_TABLES.indexOf(table) < 0) return false;
      var rows = store[table] || [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === id) { rows.splice(i, 1); persist(); apiWrite('DELETE', table, id); return true; }
      }
      return false;
    },

    reset: function () {
      if (remote && API) {
        return window.fetch(API + '/api/admin/reseed', { method: 'POST', headers: authHeaders() }).then(function (r) {
          if (!r.ok) throw new Error('reseed failed');
          return r.json();
        }).then(function (dump) { store = dump; return true; });
      }
      var _rlab = labById(currentLabId);
      store = seedStore({ labName: _rlab ? _rlab.name : undefined, demoData: currentLabId === 'lab1' });
      persist();
      return Promise.resolve(true);
    },

    export: function () { return JSON.stringify(store); },

    import: function (json) {
      var data = typeof json === 'string' ? JSON.parse(json) : json;
      var tables = (data && data.tables) || data; /* accept both {tables:{...}} and flat dumps */
      if (!tables || typeof tables !== 'object') throw new Error('Invalid backup file');
      ARRAY_TABLES.forEach(function (t) {
        if (!Array.isArray(tables[t])) tables[t] = []; /* backfill tables added after the backup was made */
      });
      if (!tables.settings || typeof tables.settings !== 'object') throw new Error('Invalid backup: missing settings');
      if (!tables.seq || typeof tables.seq !== 'object') tables.seq = {};
      if (remote && API) {
        return window.fetch(API + '/api/restore', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(tables)
        }).then(function (r) {
          if (!r.ok) throw new Error('restore failed');
          return r.json();
        }).then(function () {
          return loadDump();
        }).then(function (dump) { store = dump; return true; });
      }
      store = {
        seq: tables.seq, settings: tables.settings,
        users: tables.users, patients: tables.patients, tests: tables.tests,
        doctors: tables.doctors, invoices: tables.invoices, payments: tables.payments,
        expenses: tables.expenses, results: tables.results,
        report_templates: tables.report_templates, report_schedules: tables.report_schedules,
        wa_log: tables.wa_log, samples: tables.samples, closings: tables.closings, stock_items: tables.stock_items || [], stock_moves: tables.stock_moves || [], email_log: tables.email_log || [], panels: tables.panels || [], ref_labs: tables.ref_labs || [], outsourced: tables.outsourced || []
      };
      normalizeSeq(store);
      persist();
      return Promise.resolve(true);
    }
  };
})();
