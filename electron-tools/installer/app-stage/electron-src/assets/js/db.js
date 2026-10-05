/* LabPOS — DB layer (localStorage). Exposes window.DB. See SPEC.md for schema. */
(function () {
  'use strict';

  var KEY = 'labpos_db_v1';

  /* Remote mode: when served by the LabPOS server, /api-config.js sets
     window.LABPOS_API and DB.init() loads the server dump into `store`.
     All reads stay synchronous; writes go to memory + fire-and-forget API. */
  var API = null;
  var remote = false;
  function apiWrite(method, table, id, body) {
    if (!remote || !API) return;
    var url = API + '/api/' + table + (id ? '/' + encodeURIComponent(id) : '');
    try {
      fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).catch(function () { /* offline — memory still updated */ });
    } catch (e) {}
  }

  var ID_CONF = {
    users:    { prefix: 'U',  digits: 2 },
    doctors:  { prefix: 'D',  digits: 2 },
    tests:    { prefix: 'T',  digits: 3 },
    patients: { prefix: 'P',  digits: 4 },
    invoices: { prefix: null, digits: 4 }, /* uses settings.invoicePrefix */
    payments: { prefix: 'PM', digits: 4 },
    expenses: { prefix: 'EX', digits: 4 },
    results:  { prefix: 'R',  digits: 4 }
  };
  var ARRAY_TABLES = ['users', 'patients', 'tests', 'doctors', 'invoices', 'payments', 'expenses', 'results'];

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

  function seedStore() {
    var store = {
      seq: { users: 0, doctors: 0, tests: 0, patients: 0, invoices: 0, payments: 0, expenses: 0, results: 0 },
      settings: {
        id: 'main',
        labName: 'Optxic LAB',
        tagline: 'Accurate • Fast • Trusted',
        address: 'Main Road, Gulberg, Lahore',
        phone: '0300-1234567',
        email: 'info@citybloodlab.pk',
        invoicePrefix: 'INV',
        footerNote: 'Get well soon. Reports available on counter & phone.',
        currency: 'PKR'
      },
      users: [], patients: [], tests: [], doctors: [],
      invoices: [], payments: [], expenses: [], results: []
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

    /* users */
    put('users', { id: 'U-01', name: 'Administrator', username: 'admin', password: 'admin123', role: 'admin', active: true });
    put('users', { id: 'U-02', name: 'Rizwan Ahmed', username: 'reception', password: 'rec123', role: 'reception', active: true });
    put('users', { id: 'U-03', name: 'Sana Iqbal', username: 'technician', password: 'tech123', role: 'technician', active: true });

    /* doctors */
    put('doctors', { id: 'D-01', name: 'Dr. Ahmed Khan', clinic: 'City Clinic, Gulberg', phone: '0301-1112223', commissionPct: 15 });
    put('doctors', { id: 'D-02', name: 'Dr. Sara Malik', clinic: 'Health Center, Model Town', phone: '0321-4445556', commissionPct: 10 });

    /* tests: [code, name, category, price, sampleType, tat, params] */
    var CBC_P = [{ name: 'Hemoglobin', unit: 'g/dL', ref: '13.5–17.5' }, { name: 'TLC', unit: '/µL', ref: '4,000–11,000' }, { name: 'Platelets', unit: '/µL', ref: '150,000–450,000' }, { name: 'ESR', unit: 'mm/hr', ref: '0–20' }];
    var A1C_P = [{ name: 'HbA1c', unit: '%', ref: '< 5.7' }];
    var LIP_P = [{ name: 'Total Cholesterol', unit: 'mg/dL', ref: '< 200' }, { name: 'Triglycerides', unit: 'mg/dL', ref: '< 150' }, { name: 'HDL', unit: 'mg/dL', ref: '> 40' }, { name: 'LDL', unit: 'mg/dL', ref: '< 100' }];
    var T = [
      ['CBC', 'Complete Blood Count', 'Hematology', 800, 'Blood', 'Same day', CBC_P],
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
      ['HBA1C', 'HbA1c (Glycated Hemoglobin)', 'Diabetes', 1100, 'Blood', 'Same day', A1C_P],
      ['OGTT', 'Oral Glucose Tolerance Test', 'Diabetes', 900, 'Blood', 'Next day', []],
      ['LIPID', 'Lipid Profile', 'Lipid', 1300, 'Serum', 'Same day', LIP_P],
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
      put('tests', { code: t[0], name: t[1], category: t[2], price: t[3], sampleType: t[4], tat: t[5], active: true, params: t[6] });
    });
    var testByCode = {};
    store.tests.forEach(function (t) { testByCode[t.code] = t; });

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
      'CBC': { 'Hemoglobin': '14.2', 'TLC': '7,600', 'Platelets': '248,000', 'ESR': '14' },
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

    return store;
  }

  /* ---------------- public API ---------------- */
  var store = load();
  if (!store) { store = seedStore(); save(store); }
  /* one-time rebrand: existing installs seeded with the old default name */
  if (store && store.settings && store.settings.labName === 'City Blood Lab') {
    store.settings.labName = 'Optxic LAB'; save(store);
  }

  function persist() { if (!remote) save(store); }

  window.DB = {
    KEY: KEY,

    /* Load server data when running under the LabPOS server/Electron app.
       Must be awaited before first render (app.js does this). Falls back to
       localStorage silently when no server is present. */
    init: function () {
      var base = null;
      try { base = window.LABPOS_API || null; } catch (e) {}
      if (!base || !window.fetch) return Promise.resolve(false);
      return window.fetch(base + '/api/dump', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('dump failed');
        return r.json();
      }).then(function (dump) {
        if (!dump || !dump.settings || !dump.seq) throw new Error('bad dump');
        API = base; remote = true; store = dump;
        return true;
      }).catch(function () { API = null; remote = false; return false; });
    },
    isRemote: function () { return remote; },

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

    insert: function (table, obj) {
      if (table === 'settings' || ARRAY_TABLES.indexOf(table) < 0) return null;
      var row = copy(obj) || {};
      row.id = nextId(store, table);
      if (table === 'invoices' && !row.no) row.no = row.id;
      store[table].push(row);
      persist();
      apiWrite('POST', table, null, row);
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
        return window.fetch(API + '/api/admin/reseed', { method: 'POST' }).then(function (r) {
          if (!r.ok) throw new Error('reseed failed');
          return r.json();
        }).then(function (dump) { store = dump; return true; });
      }
      store = seedStore();
      persist();
      return Promise.resolve(true);
    },

    export: function () { return JSON.stringify(store); },

    import: function (json) {
      var data = typeof json === 'string' ? JSON.parse(json) : json;
      var tables = (data && data.tables) || data; /* accept both {tables:{...}} and flat dumps */
      if (!tables || typeof tables !== 'object') throw new Error('Invalid backup file');
      ARRAY_TABLES.forEach(function (t) {
        if (!Array.isArray(tables[t])) throw new Error('Invalid backup: missing table ' + t);
      });
      if (!tables.settings || typeof tables.settings !== 'object') throw new Error('Invalid backup: missing settings');
      if (!tables.seq || typeof tables.seq !== 'object') tables.seq = {};
      if (remote && API) {
        return window.fetch(API + '/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tables)
        }).then(function (r) {
          if (!r.ok) throw new Error('restore failed');
          return r.json();
        }).then(function () {
          return window.fetch(API + '/api/dump', { cache: 'no-store' }).then(function (r) { return r.json(); });
        }).then(function (dump) { store = dump; return true; });
      }
      store = {
        seq: tables.seq, settings: tables.settings,
        users: tables.users, patients: tables.patients, tests: tables.tests,
        doctors: tables.doctors, invoices: tables.invoices, payments: tables.payments,
        expenses: tables.expenses, results: tables.results
      };
      normalizeSeq(store);
      persist();
      return Promise.resolve(true);
    }
  };
})();
