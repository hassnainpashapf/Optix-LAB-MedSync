/* Optix LAB MedSync — app framework: hash router, auth, shell, shared UI helpers.
   Exposes window.App. Loaded after db.js, before mod-*.js. */
(function () {
  'use strict';

  /* ---------------- icons (inline SVG, stroke=currentColor) ---------------- */
  var IC = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    wallet: '<path d="M20 7H4a2 2 0 0 1 0-4h14v4"/><path d="M4 7v12a2 2 0 0 0 2 2h14V7"/><circle cx="17" cy="14" r="1.4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
    steth: '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    download: '<path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'
  };
  function icon(name, size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || IC.grid) + '</svg>';
  }

  /* ---------------- nav + permissions ---------------- */
  var NAV = [
    { key: 'dashboard', label: 'Dashboard',  icon: 'grid',      route: '#/dashboard', color: '#3b82f6' },
    { key: 'patients',  label: 'Patients',   icon: 'users',     route: '#/patients',  color: '#22c55e' },
    { key: 'results',   label: 'Lab Results',icon: 'clipboard', route: '#/results',   color: '#8b5cf6' },
    { key: 'tests',     label: 'Tests',      icon: 'flask',     route: '#/tests',     color: '#14b8a6' },
    { key: 'invoices',  label: 'Invoices',   icon: 'file',      route: '#/invoices',  color: '#f97316' },
    { key: 'dues',      label: 'Dues',       icon: 'wallet',    route: '#/dues',      color: '#ef4444' },
    { key: 'doctors',   label: 'Doctors',    icon: 'steth',     route: '#/doctors',   color: '#ec4899' },
    { key: 'expenses',  label: 'Expenses',   icon: 'coins',     route: '#/expenses',  color: '#f59e0b' },
    { key: 'reports',   label: 'Reports',    icon: 'chart',     route: '#/reports',   color: '#6366f1' },
    { key: 'downloads', label: 'Downloads',  icon: 'download',  route: '#/downloads', color: '#06b6d4' },
    { key: 'settings',  label: 'Settings',   icon: 'gear',      route: '#/settings',  color: '#64748b' },
    { key: 'profile',   label: 'Profile',    icon: 'users',     route: '#/profile',   color: '#64748b' }
  ];
  var PERMS = {
    dashboard: ['admin', 'reception', 'technician'],
    billing:   ['admin', 'reception'],
    invoices:  ['admin', 'reception'],
    dues:      ['admin', 'reception'],
    patients:  ['admin', 'reception', 'technician'],
    tests:     ['admin', 'reception', 'technician'],
    doctors:   ['admin', 'reception'],
    results:   ['admin', 'technician'],
    expenses:  ['admin', 'reception'],
    reports:   ['admin'],
    downloads:  ['admin', 'reception', 'technician'],
    settings:  ['admin'],
    profile:   ['admin', 'reception', 'technician']
  };
  function routeKey(path) {
    var seg = (path || '').replace(/^#\//, '').split('/')[0];
    if (seg === 'invoice') seg = 'invoices';
    if (seg === 'patient') seg = 'patients';
    return seg || 'dashboard';
  }
  function can(key, role) {
    return (PERMS[key] || []).indexOf(role) !== -1;
  }

  /* ---------------- session ---------------- */
  var SKEY = 'labpos_session';
  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(SKEY) || 'null');
      return (s && s.userId && s.labId) ? s : null;
    } catch (e) { return null; }
  }
  function logout() {
    var wasCloud = false;
    try { wasCloud = !!(window.DB && DB.isCloud && DB.isCloud()); } catch (e) {}
    localStorage.removeItem(SKEY);
    location.hash = '#/login';
    /* cloud mode: drop the in-memory server data so nothing leaks to the next login */
    if (wasCloud) location.reload();
  }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  /* Normalize a phone number for WhatsApp (wa.me links / UltraMsg):
     strips separators; PK mobile '0300-1234567'/'03001234567' -> '923001234567';
     '+923001234567'/'923001234567' stay as-is. Returns '' when empty. */
  function normWa(num) {
    var d = String(num || '').replace(/\D/g, '');
    if (!d) return '';
    while (d.indexOf('00') === 0) d = d.slice(2); /* strip intl '00' prefix */
    if (d.charAt(0) === '0') d = '92' + d.slice(1); /* PK mobile: 0xxx -> 92xxx */
    return d;
  }
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    return 'Rs ' + Math.round(n).toLocaleString('en-US');
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toDate(v) {
    if (v instanceof Date) return v;
    var d = new Date(v);
    return isNaN(d) ? new Date() : d;
  }
  function d(v) {
    var t = toDate(v);
    return pad(t.getDate()) + ' ' + MONTHS[t.getMonth()] + ' ' + t.getFullYear();
  }
  function dt(v) {
    var t = toDate(v), h = t.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return d(t) + ', ' + h + ':' + pad(t.getMinutes()) + ' ' + ap;
  }
  function today() {
    var t = new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  function empty(msg) {
    return '<div class="empty"><div class="empty-ic">' + icon('file', 34) + '</div><p>' + esc(msg || 'No records found') + '</p></div>';
  }
  var BADGES = {
    paid: ['b-paid', 'Paid'], partial: ['b-partial', 'Partial'], unpaid: ['b-unpaid', 'Unpaid'],
    ready: ['b-ready', 'Ready'], pending: ['b-pending', 'Pending'], collected: ['b-ready', 'Collected'],
    active: ['b-ready', 'Active'], inactive: ['b-unpaid', 'Inactive'],
    admin: ['b-paid', 'Admin'], reception: ['b-partial', 'Reception'], technician: ['b-ready', 'Technician']
  };
  function badge(status) {
    var b = BADGES[String(status || '').toLowerCase()] || ['b-pending', status || '—'];
    return '<span class="badge ' + b[0] + '">' + esc(b[1]) + '</span>';
  }

  /* ---------------- toast ---------------- */
  function toast(msg, type) {
    type = type === 'err' ? 'err' : (type === 'info' ? 'info' : 'ok');
    var wrap = document.getElementById('toasts');
    if (!wrap) {
      wrap = el('<div class="toast-wrap" id="toasts"></div>');
      document.body.appendChild(wrap);
    }
    var t = el('<div class="toast t-' + type + '"><span class="t-ic">' +
      icon(type === 'err' ? 'alert' : (type === 'info' ? 'file' : 'check'), 16) +
      '</span><span>' + esc(msg) + '</span></div>');
    wrap.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 350);
    }, 4000);
  }

  /* ---------------- modal ---------------- */
  function modal(title, bodyHTML, opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    if (!root) {
      root = el('<div id="modal-root"></div>');
      document.body.appendChild(root);
    }
    var ov = el(
      '<div class="modal-ov"><div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-h"><h3>' + esc(title) + '</h3><button class="btn btn-ghost btn-sm modal-x" aria-label="Close">' + icon('x', 16) + '</button></div>' +
      '<div class="modal-b">' + bodyHTML + '</div></div></div>'
    );
    root.appendChild(ov);
    document.body.classList.add('modal-open');
    function close() {
      ov.classList.add('modal-out');
      setTimeout(function () {
        ov.remove();
        if (!root.children.length) document.body.classList.remove('modal-open');
      }, 200);
    }
    ov.querySelector('.modal-x').addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
    document.addEventListener('keydown', onKey);
    if (typeof opts.onOpen === 'function') opts.onOpen(ov, close);
    requestAnimationFrame(function () { ov.classList.add('modal-in'); });
    return close;
  }
  function confirm(msg) {
    return new Promise(function (resolve) {
      var done = false;
      function fin(v) { if (!done) { done = true; close(); resolve(v); } }
      var close = modal('Please confirm',
        '<p class="confirm-msg">' + esc(msg) + '</p>' +
        '<div class="modal-f"><button class="btn btn-ghost" data-no>Cancel</button>' +
        '<button class="btn btn-danger" data-yes>Confirm</button></div>',
        { onOpen: function (ov) {
            ov.querySelector('[data-no]').addEventListener('click', function () { fin(false); });
            ov.querySelector('[data-yes]').addEventListener('click', function () { fin(true); });
          } });
    });
  }

  /* ---------------- lab font (Settings → Lab Profile → Font) ---------------- */
  var FONTS = {
    inter:      { family: "'Inter',-apple-system,'Segoe UI',Roboto,Arial,sans-serif", url: null },
    jakarta:    { family: "'Plus Jakarta Sans','Inter',sans-serif", url: null },
    roboto:     { family: "'Roboto','Inter',sans-serif", url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap' },
    poppins:    { family: "'Poppins','Inter',sans-serif", url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
    opensans:   { family: "'Open Sans','Inter',sans-serif", url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap' },
    lato:       { family: "'Lato','Inter',sans-serif", url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap' },
    montserrat: { family: "'Montserrat','Inter',sans-serif", url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap' }
  };
  function fontDef() {
    var k = 'inter';
    try { k = (window.DB.get('settings', 'main') || {}).font || 'inter'; } catch (e) {}
    return FONTS[k] || FONTS.inter;
  }
  function applyFont() {
    var d = fontDef();
    try { document.documentElement.style.setProperty('--font', d.family); } catch (e) {}
    var old = null;
    try { old = document.querySelector('link[data-labfont]'); } catch (e) {}
    if (d.url) {
      if (!old || old.getAttribute('href') !== d.url) {
        if (old && old.parentNode) old.parentNode.removeChild(old);
        try {
          var l = document.createElement('link');
          l.rel = 'stylesheet'; l.href = d.url; l.setAttribute('data-labfont', '1');
          document.head.appendChild(l);
        } catch (e) {}
      }
    } else if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }
  }

  /* ---------------- print ---------------- */
  function printDoc(title, bodyHTML, opts) {
    var s = {};
    try { s = window.DB.get('settings', 'main') || {}; } catch (e) {}
    var noHeader = !!(opts && opts.noHeader);
    var fd = fontDef();
    var css = '' +
      '*{margin:0;padding:0;box-sizing:border-box}' +
      'body{font-family:' + fd.family + ';color:#111;padding:28px;font-size:13px}' +
      '.ph{text-align:center;border-bottom:3px double #131845;padding-bottom:12px;margin-bottom:16px}' +
      '.ph h1{font-size:24px;color:#131845;letter-spacing:.5px}' +
      '.ph .tag{font-size:12px;color:#555;margin:2px 0}' +
      '.ph-logo{width:54px;height:54px;object-fit:contain;margin:0 auto 6px;display:block}' +
      '.ph .addr{font-size:11.5px;color:#555}' +
      '.pt{display:flex;justify-content:space-between;gap:12px;margin:12px 0;padding:10px;border:1px solid #ddd;border-radius:6px;background:#fafafa}' +
      '.pt div{font-size:12px;line-height:1.7}' +
      'table{width:100%;border-collapse:collapse;margin:12px 0}' +
      'th,td{border:1px solid #bbb;padding:7px 9px;text-align:left;font-size:12.5px}' +
      'th{background:#f0f0f0}' +
      '.tot{margin-left:auto;width:260px}' +
      '.tot div{display:flex;justify-content:space-between;padding:4px 2px;font-size:13px}' +
      '.tot .grand{font-weight:bold;font-size:15px;border-top:2px solid #111;margin-top:4px;padding-top:6px}' +
      '.pf{margin-top:26px;display:flex;justify-content:space-between;font-size:11.5px;color:#555}' +
      '.note{margin-top:14px;font-size:11px;color:#666;border-top:1px dashed #bbb;padding-top:8px}' +
      '.sig{margin-top:34px;text-align:right;font-size:12px}' +
      '.sig div{margin-top:36px;border-top:1px solid #333;display:inline-block;padding-top:4px;min-width:170px;text-align:center}' +
      '@media print{body{padding:10px}.noprint{display:none}}';
    var w = window.open('', '_blank', 'width=920,height=720');
    if (!w) { toast('Popup blocked — allow popups to print', 'err'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      (fd.url ? '<link rel="stylesheet" href="' + fd.url + '">' : '') +
      '<style>' + css + '</style></head><body>' +
      (noHeader ? '' :
      '<div class="ph">' + (s.logo ? '<img class="ph-logo" src="' + esc(s.logo) + '" alt="Lab logo">' : '') +
      '<h1>' + esc(s.labName || 'Optix LAB MedSync') + '</h1>' +
      '<div class="tag">' + esc(s.tagline || '') + '</div>' +
      '<div class="addr">' + esc(s.address || '') + ' &nbsp;•&nbsp; ' + esc(s.phone || '') +
      (s.email ? ' &nbsp;•&nbsp; ' + esc(s.email) : '') + '</div></div>') +
      bodyHTML +
      '<div class="note">' + esc(s.footerNote || '') + ' &nbsp;•&nbsp; Printed: ' + esc(dt(new Date())) + '</div>' +
      '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 400);
  }

  /* ---------------- router ---------------- */
  var routes = [];
  function compile(path) {
    var names = [];
    var rx = '^' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:([a-zA-Z0-9_]+)/g, function (_, n) {
      names.push(n); return '([^/]+)';
    }) + '$';
    return { re: new RegExp(rx), names: names };
  }
  function route(path, fn) {
    var p = String(path).replace(/^#/, ''); /* normalize: '#/x' and '/x' both match hash '#/x' */
    routes.push({ path: p, fn: fn, c: compile(p) });
  }
  /* ---------------- lazy module loading ----------------
     Non-critical route modules load on first visit instead of at boot.
     window.__LAZY_ROUTES (set in index.html) maps route pattern -> script URL. */
  var lazyRoutes = [];
  var lazyPending = {};
  function loadScript(url) {
    return new Promise(function (res, rej) {
      /* cache-bust: ?v= stamp from index.html (bumped every release) so a fresh
         deploy never serves a stale cached module */
      var v = (typeof window !== 'undefined' && window.__ASSET_V) || '';
      if (v) url += (url.indexOf('?') > -1 ? '&' : '?') + 'v=' + encodeURIComponent(v);
      var sc = document.createElement('script');
      sc.src = url; sc.async = true;
      sc.onload = function () { res(); };
      sc.onerror = function () { rej(new Error('load failed: ' + url)); };
      document.head.appendChild(sc);
    });
  }
  (function initLazy() {
    var map = window.__LAZY_ROUTES || {};
    Object.keys(map).forEach(function (pat) {
      var p = String(pat).replace(/^#/, '');
      lazyRoutes.push({ pat: p, url: map[pat], re: compile(p).re });
    });
  })();
  function lazyMatch(hm) {
    for (var i = 0; i < lazyRoutes.length; i++) if (lazyRoutes[i].re.exec(hm)) return lazyRoutes[i];
    return null;
  }
  /* jsPDF (364KB) loads on demand only — used for WhatsApp report PDFs. */
  var _jspdfP = null;
  function ensureJsPDF() {
    if ((window.jspdf && window.jspdf.jsPDF) || window.jsPDF) return Promise.resolve(true);
    if (!_jspdfP) {
      _jspdfP = loadScript('assets/vendor/jspdf.umd.min.js').then(function () {
        return !!((window.jspdf && window.jspdf.jsPDF) || window.jsPDF);
      }, function () { _jspdfP = null; return false; });
    }
    return _jspdfP;
  }
  function nav(path) {
    if (location.hash === path) render();
    else location.hash = path;
  }
  function currentKey() { return routeKey(location.hash); }

  function render() {
    var hash = location.hash || '';
    var s = session();

    /* tenant guard: the session's lab must exist and be active; load its store */
    var _isCloud = false;
    try { _isCloud = !!(window.DB.isCloud && window.DB.isCloud()); } catch (e) {}
    if (s && !_isCloud) {
      var _tlab = null;
      try { _tlab = window.DB.labById(s.labId); } catch (e) {}
      if (!_tlab || _tlab.active === false) { logout(); return; }
      try { window.DB.useLab(s.labId); } catch (e) {}
    }

    /* auth guard */
    if (!s && hash !== '#/login') { location.hash = '#/login'; return; }
    if (s && (hash === '#/login' || hash === '' || hash === '#')) { location.hash = '#/dashboard'; return; }
    if (!hash) { location.hash = s ? '#/dashboard' : '#/login'; return; }

    if (hash === '#/login') { renderLogin(); return; }

    /* permission guard */
    var key = routeKey(hash);
    if (!can(key, s.role)) {
      toast('You do not have access to this section', 'err');
      if (hash !== '#/dashboard') location.hash = '#/dashboard';
      return;
    }

    /* match route */
    var matched = null, params = {};
    var hm = hash.replace(/^#/, ''); /* match without the '#' so both '#/x' and '/x' registrations work */
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].c.re.exec(hm);
      if (m) {
        matched = routes[i];
        for (var j = 0; j < routes[i].c.names.length; j++) params[routes[i].c.names[j]] = decodeURIComponent(m[j + 1]);
        break;
      }
    }
    if (!matched) {
      var lz = lazyMatch(hm);
      if (lz && !lazyPending[lz.url]) {
        /* first visit to a lazily-loaded module: show loading, fetch, re-render */
        lazyPending[lz.url] = true;
        renderShell(key);
        var lv = document.getElementById('view');
        if (lv) lv.innerHTML = '<div class="card"><div class="card-b">' + empty('Loading…') + '</div></div>';
        markActive(key);
        loadScript(lz.url).then(function () {
          lazyPending[lz.url] = false;
          render(); /* module registered its routes above; render again */
        }, function () {
          lazyPending[lz.url] = false;
          toast('Failed to load page — check connection and retry', 'err');
          location.hash = '#/dashboard';
        });
        return;
      }
      location.hash = '#/dashboard'; return;
    }

    renderShell(key);
    var view = document.getElementById('view');
    view.innerHTML = '';
    window.scrollTo(0, 0);
    try {
      var out = matched.fn(params);
      if (typeof out === 'string' && out) view.innerHTML = out; /* modules may return HTML or paint #view directly */
    }
    catch (e) {
      console.error(e);
      view.innerHTML = '<div class="card"><div class="card-b">' + empty('Something went wrong loading this page.') + '</div></div>';
    }
    markActive(key);
  }

  /* ---------------- shell ---------------- */
  function renderShell(activeKey) {
    var s = session();
    if (!s) return;
    applyFont();
    var shell = document.getElementById('shell');
    if (!shell) {
      document.body.innerHTML = '';
      document.body.className = '';
      shell = el(
        '<div class="shell" id="shell">' +
          '<aside class="sidebar" id="sidebar"></aside>' +
          '<div class="maincol">' +
            '<header class="topbar" id="topbar"></header>' +
            '<main class="view" id="view"></main>' +
          '</div>' +
        '</div>'
      );
      document.body.appendChild(shell);
    }
    /* sidebar */
    var st = {};
    try { st = window.DB.get('settings', 'main') || {}; } catch (e) {}
    var _isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
    var items = NAV.filter(function (n) { return n.key !== 'profile' && can(n.key, s.role); }).map(function (n) {
      return '<a href="' + n.route + '" class="nav-it' + (n.key === activeKey ? ' active' : '') + '" data-nav="' + n.key + '">' +
        '<span class="nav-ic" style="background:' + (n.color || '#64748b') + '1a;color:' + (n.color || '#64748b') + '">' + icon(n.icon, 19) + '</span><span class="nav-lb">' + n.label + '</span></a>';
    }).join('');
    document.getElementById('sidebar').innerHTML =
      '<div class="brand"><span class="brand-mark">' + (st.logo ? '<img src="' + esc(st.logo) + '" alt="Lab logo">' : icon('flask', 22)) + '</span>' +
      '<span class="brand-tx"><b>' + esc(st.labName || 'Optix LAB MedSync') + '</b><small>Diagnostic Lab</small></span>' +
      '<button class="side-close" id="sideClose" aria-label="Close menu">' + icon('x', 16) + '</button></div>' +
      '<div class="nav-sec">Main Menu</div>' +
      '<nav class="nav">' + items + '</nav>';
    /* topbar */
    var navItem = NAV.filter(function (n) { return n.key === activeKey; })[0];
    /* current user record (for profile photo in avatar) */
    var _me = null;
    try { _me = window.DB.get('users', s.userId); } catch (e) {}
    var _avatarInner = (_me && _me.photo) ? '<img src="' + _me.photo + '" alt="">' : esc((s.name || 'U').charAt(0).toUpperCase());
    /* time-aware greeting for the header */
    var _gh = new Date().getHours();
    var _greet = _gh < 12 ? 'Good morning' : (_gh < 17 ? 'Good afternoon' : 'Good evening');
    var _greetName = s.name ? ', ' + s.name : '';
    var _longDate = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    /* quick actions — role-aware; technicians get read-only shortcuts */
    var isTech = (s.role === 'technician');
    var tbQa = isTech
      ? '<a class="btn btn-sm tb-qab tb-classic" href="#/results">' + icon('clipboard', 14) + '<span class="tb-qa-t">Lab Results</span></a>' +
        '<a class="btn btn-sm tb-qab tb-classic" href="#/tests">' + icon('flask', 14) + '<span class="tb-qa-t">View Tests</span></a>'
      : '<a class="btn btn-sm tb-qab tb-classic" href="#/patients/new">' + icon('users', 14) + '<span class="tb-qa-t">Add Patient</span></a>' +
        '<a class="btn btn-sm tb-qab tb-classic" href="#/expenses">' + icon('wallet', 14) + '<span class="tb-qa-t">Add Expense</span></a>' +
        '<a class="btn btn-sm tb-qab tb-classic tb-icon" href="#/downloads" title="Downloads" aria-label="Downloads">' + icon('download', 16) + '</a>';
    document.getElementById('topbar').innerHTML =
      '<style>' +
      '.tb-acct{position:relative;flex:none}' +
      '.tb-div{width:1px;align-self:stretch;background:var(--line);margin:3px 0}' +
      '.tb-avatar{width:36px;height:36px;border-radius:50%;border:2px solid #fff;background:var(--brand-grad);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(19,24,69,.35);transition:transform .15s,box-shadow .15s;padding:0}' +
      '.tb-avatar:hover{transform:scale(1.07);box-shadow:0 3px 12px rgba(19,24,69,.5)}' +
      '.tb-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}' +
      '.tb-menu{position:absolute;right:0;top:calc(100% + 10px);min-width:212px;background:var(--card,#fff);border:1px solid var(--line);border-radius:14px;box-shadow:0 16px 40px rgba(15,30,46,.16);padding:6px;z-index:80}' +
      '.tb-menu-head{padding:10px 12px 12px;border-bottom:1px solid var(--line);margin-bottom:6px;display:flex;flex-direction:column;align-items:flex-start;gap:5px}' +
      '.tb-menu-head b{font-size:14px;color:var(--ink)}' +
      '.tb-menu-it{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:none;background:transparent;border-radius:9px;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;text-decoration:none;font-family:inherit;text-align:left}' +
      '.tb-menu-it:hover{background:var(--bg)}' +
      '.tb-menu-it svg{color:var(--muted);flex:none}' +
      '.tb-menu-danger{color:var(--red)}' +
      '.tb-menu-danger:hover{background:var(--red-soft)}' +
      '.tb-menu-danger svg{color:var(--red)}' +
      '.tb-qa{display:flex;gap:8px;align-items:center;margin-left:2px}' +
      '.tb-qa .tb-qab{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}' +
      '.tb-qa .tb-classic{background:#fff;border:1px solid #131845;color:#131845;font-weight:600;box-shadow:none}' +
      '.tb-qa .tb-classic:hover{background:#ebf4f8;border-color:#131845;color:#131845;transform:none}' +
      '.tb-qa .tb-classic svg{color:#131845;flex:none}' +
      '.tb-qa .tb-icon{padding:7px;border-radius:10px;min-width:34px;justify-content:center}' +
      '@media(max-width:640px){.tb-qa .tb-qa-t{display:none}.tb-qa{gap:6px}.tb-qa .tb-qab{padding:7px 9px}}' +
      '.tb-greet{display:flex;flex-direction:column;justify-content:center;line-height:1.3;min-width:0;margin-right:2px}' +
      '.tb-greet b{font-size:14.5px;font-weight:800;color:var(--ink);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}' +
      '.tb-greet span{font-size:12px;color:var(--muted);font-weight:500;white-space:nowrap}' +
      '@media (max-width:760px){.tb-greet{display:none}}' +
      '@media (max-width:900px){.tb-qa .tb-qa-t{display:none}}' +
      '@media (max-width:640px){.tb-qa{display:none}}' +
      '</style>' +
      '<button class="btn btn-ghost btn-sm nav-toggle" id="navToggle" aria-label="Menu">' + icon('menu', 18) + '</button>' +
      (activeKey === 'dashboard' ? '<div class="tb-greet"><b>' + esc(_greet + _greetName) + '</b><span>' + esc(_longDate) + '</span></div>' : '') +
      '<h1 class="page-title"' + (activeKey === 'dashboard' ? ' hidden' : '') + '>' + esc(navItem ? navItem.label : '') + '</h1>' +
      '<div class="top-right"><div class="tb-qa">' + tbQa + '</div></div>' +
      '<div class="tb-acct">' +
      '<button class="tb-avatar" id="avatarBtn" aria-label="Account menu" aria-haspopup="true" aria-expanded="false">' + _avatarInner + '</button>' +
      '<div class="tb-menu" id="userMenu" hidden>' +
      '<div class="tb-menu-head"><b>' + esc(s.name) + '</b>' + badge(s.role) + '</div>' +
      '<a class="tb-menu-it" href="#/profile">' + icon('gear', 16) + '<span>Settings</span></a>' +
      '<a class="tb-menu-it" href="#/profile">' + icon('lock', 16) + '<span>Change Password</span></a>' +
      '<button class="tb-menu-it tb-menu-danger" id="menuLogout">' + icon('logout', 16) + '<span>Log Out</span></button>' +
      '</div></div>';
    document.getElementById('menuLogout').addEventListener('click', logout);
    /* avatar dropdown: toggle, close on outside click / Escape (delegated once) */
    (function () {
      var avatarBtn = document.getElementById('avatarBtn');
      var userMenu = document.getElementById('userMenu');
      avatarBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        userMenu.hidden = !userMenu.hidden;
        avatarBtn.setAttribute('aria-expanded', String(!userMenu.hidden));
      });
      if (!window.__tbAcctWired) {
        window.__tbAcctWired = true;
        document.addEventListener('click', function (e) {
          var m = document.getElementById('userMenu');
          if (m && !m.hidden && !e.target.closest('.tb-acct')) m.hidden = true;
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            var m = document.getElementById('userMenu');
            var b = document.getElementById('avatarBtn');
            if (m && !m.hidden) { m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
          }
        });
      }
    })();
    var nt = document.getElementById('navToggle');
    if (nt) nt.addEventListener('click', function () { document.body.classList.toggle('side-open'); });
    /* mobile drawer: close on nav tap, close button, backdrop tap, Escape (delegated once) */
    if (!window.__sideDrawerWired) {
      window.__sideDrawerWired = true;
      document.addEventListener('click', function (e) {
        if (!document.body.classList.contains('side-open')) return;
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#sideClose') || t.closest('#sidebar .nav-it')) { document.body.classList.remove('side-open'); return; }
        if (t.closest('#sidebar') || t.closest('#navToggle')) return;
        document.body.classList.remove('side-open');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') document.body.classList.remove('side-open');
      });
    }
  }
  function markActive(key) {
    var links = document.querySelectorAll('.nav-it');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-nav') === key);
    }
  }

  /* ---------------- login ---------------- */
  function renderLogin() {
    var st = {};
    try { st = window.DB.get('settings', 'main') || {}; } catch (e) {}
    /* Cloud/web sign-in always shows the Optix brand; a lab's own logo + name appear only inside its dashboard.
       The desktop app (local install) shows its own lab's logo + name on the sign-in page. */
    var _desk = !!(window.labposDesktop && window.labposDesktop.isDesktop), _webCloud = false;
    try { _webCloud = !!(window.DB.isCloud && window.DB.isCloud()) && !_desk; } catch (e) {}
    if (_webCloud) st = {};
    /* multi-tenant: list active labs for the selector */
    var _labs = [];
    try { _labs = window.DB.labs().filter(function (l) { return l.active !== false; }); } catch (e) {}
    var _cur = null;
    try { _cur = window.DB.currentLab(); } catch (e) {}
    var _selId = (_cur && _cur.id) || (_labs[0] && _labs[0].id) || 'lab1';
    document.body.className = 'login-mode';
    document.body.innerHTML =
      '<div class="login-wrap lg-split">' +
        '<aside class="lg-brand" aria-hidden="true">' +
          '<div class="lg-orbs"><i></i><i></i><i></i><i></i></div>' +
          '<div class="lg-brand-in">' +
            '<div class="lg-pill"><span class="lg-dot"></span>Optix LAB MedSync</div>' +
            '<h2 class="lg-hero">Your lab,<br><span>always in sync.</span></h2>' +
            '<p class="lg-lead">Patients, billing, results and reports &mdash; on desktop, web and mobile.</p>' +
            '<ul class="lg-feat">' +
          '<li style="--i:0"><span class="lg-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7L21 16"/><path d="M16 16h5v5"/></svg></span>Works offline, syncs to the cloud</li>' +
          '<li style="--i:1"><span class="lg-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7 15h10"/></svg></span>5000+ ready lab test catalog</li>' +
          '<li style="--i:2"><span class="lg-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 20h3v1"/></svg></span>QR-verified patient reports</li>' +
          '<li style="--i:3"><span class="lg-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg></span>Secure role-based access</li>' +
            '</ul>' +
            '<svg class="lg-ecg" viewBox="0 0 400 80" preserveAspectRatio="none">' +
              '<path class="lg-ecg-base" d="M0 40H60L72 40L80 14L92 66L102 28L110 40H200L212 40L220 14L232 66L242 28L250 40H400" pathLength="100"/>' +
              '<path class="lg-ecg-live" d="M0 40H60L72 40L80 14L92 66L102 28L110 40H200L212 40L220 14L232 66L242 28L250 40H400" pathLength="100"/>' +
            '</svg>' +
          '</div>' +
        '</aside>' +
        '<div class="lg-form">' +
        '<form class="login-card" id="loginForm" autocomplete="off">' +
          '<div class="login-logo">' +
            '<span class="login-mark">' + (st.logo ? '<img src="' + esc(st.logo) + '" alt="Lab logo">' : icon('flask', 32)) + '</span>' +
            '<h1>' + esc(st.labName || 'Optix LAB MedSync') + '</h1>' +
            '<p class="login-tag">' + esc(st.tagline || 'Accurate • Fast • Trusted') + '</p>' +
          '</div>' +
          '<h2>Welcome back</h2>' +
          '<p class="login-sub">Sign in to your lab workspace</p>' +
          (_labs.length > 1
            ? '<label class="label">Lab<select class="select" id="liLab">' +
              _labs.map(function (l) {
                return '<option value="' + esc(l.id) + '"' + (l.id === _selId ? ' selected' : '') + '>' + esc(l.name) + '</option>';
              }).join('') + '</select></label>'
            : '') +
          '<div class="login-err" id="loginErr" hidden></div>' +
          '<label class="label">Username<input class="input" id="liUser" placeholder="Enter username" autofocus></label>' +
          '<label class="label">Password<input class="input" id="liPass" type="password" placeholder="Enter password"></label>' +
          '<button class="btn login-signin btn-block" type="submit">Sign In</button>' +
          '<div class="login-div"><span>or</span></div>' +
          ((window.labposDesktop && window.labposDesktop.isDesktop)
            ? '<a class="btn btn-ghost btn-block" href="https://optix-lab-medsync.pages.dev/superadmin/" target="_blank" rel="noopener">Superadmin Login</a>'
            : '<a class="btn btn-ghost btn-block" href="/superadmin/">Superadmin Login</a>') +
        '</form>' +
        '<p class="login-foot">Powered by System Optix</p>' +
        '</div>' +
      '</div>';
    /* switching labs swaps the isolated store + rebrands the card */
    var _labSel = document.getElementById('liLab');
    if (_labSel) _labSel.addEventListener('change', function () {
      try {
        window.DB.useLab(_labSel.value);
        var ns = window.DB.get('settings', 'main') || {};
        var h1 = document.querySelector('.login-card h1');
        if (h1) h1.textContent = ns.labName || 'Optix LAB MedSync';
        var tg = document.querySelector('.login-tag');
        if (tg) tg.textContent = ns.tagline || 'Accurate • Fast • Trusted';
        var lm = document.querySelector('.login-mark');
        if (lm) lm.innerHTML = ns.logo ? '<img src="' + esc(ns.logo) + '" alt="Lab logo">' : icon('flask', 32);
      } catch (e) {}
    });
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = document.getElementById('liUser').value.trim();
      var p = document.getElementById('liPass').value;
      var err = document.getElementById('loginErr');
      if (window.DB && DB.isCloud && DB.isCloud()) {
        /* cloud: the server checks the password and returns a session token */
        var btn = document.querySelector('.login-signin');
        if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
        DB.cloudLogin(u, p).then(function (j) {
          localStorage.setItem(SKEY, JSON.stringify({
            labId: 'cloud', userId: j.user.id, name: j.user.name, role: j.user.role,
            token: j.token, loginAt: new Date().toISOString()
          }));
          location.hash = '#/dashboard';
        }).catch(function (ex) {
          if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
          err.hidden = false;
          err.textContent = (ex && ex.message) || 'Login failed. Please try again.';
          var card2 = document.querySelector('.login-card');
          card2.classList.remove('shake'); void card2.offsetWidth; card2.classList.add('shake');
        });
        return;
      }
      /* authenticate against the selected lab's isolated store */
      var _ls2 = document.getElementById('liLab');
      if (_ls2) { try { window.DB.useLab(_ls2.value); } catch (ex2) {} }
      var users = [];
      try { users = window.DB.all('users'); } catch (ex) {}
      var found = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].username === u && users[i].password === p && users[i].active !== false) { found = users[i]; break; }
      }
      if (!found) {
        err.hidden = false;
        err.textContent = 'Invalid username or password. Please try again.';
        var card = document.querySelector('.login-card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        return;
      }
      var _sessLab = 'lab1';
      try { _sessLab = window.DB.currentLabId() || _sessLab; } catch (ex3) {}
      localStorage.setItem(SKEY, JSON.stringify({
        labId: _sessLab,
        userId: found.id, name: found.name, role: found.role, loginAt: new Date().toISOString()
      }));
      location.hash = '#/dashboard';
    });
  }

  /* ---------------- keyboard shortcuts ----------------
     Ctrl/Cmd+K focuses the current page's search box (non-intrusive:
     ignored when logged out, inside an input, or while a modal is open).
     Escape already closes modals (see modal()) and the account menu. */
  function _isTyping(t) {
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t.isContentEditable;
  }
  function _modalOpen() {
    return document.body.classList.contains('modal-open') ||
      !!(document.getElementById('modal-root') && document.getElementById('modal-root').children.length);
  }
  function _focusPageSearch() {
    var view = document.getElementById('view');
    if (!view) return false;
    var inp = view.querySelector('input[type="search"], input.search, input[id*="search" i], input[placeholder*="search" i]');
    if (inp && !inp.disabled && inp.offsetParent !== null) {
      inp.focus();
      try { inp.select(); } catch (e) {}
      return true;
    }
    return false;
  }
  function wireShortcuts() {
    if (window.__kbWired) return;
    window.__kbWired = true;
    document.addEventListener('keydown', function (e) {
      var s = session();
      if (!s) return; /* login screen: no shortcuts */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (_isTyping(e.target) || _modalOpen()) return;
        e.preventDefault();
        if (!_focusPageSearch()) toast('No search on this page', 'info');
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (_isTyping(e.target) || _modalOpen()) return;
    });
  }

  /* ---------------- public API ---------------- */
  window.App = {
    route: route,
    nav: nav,
    loadScript: loadScript,
    ensureJsPDF: ensureJsPDF,
    toast: toast,
    modal: modal,
    confirm: confirm,
    money: money,
    d: d,
    dt: dt,
    today: today,
    print: printDoc,
    el: el,
    esc: esc,
    normWa: normWa,
    empty: empty,
    badge: badge,
    icon: icon,
    renderShell: renderShell,
    applyFont: applyFont,
    session: session,
    logout: logout,
    can: can,
    currentKey: currentKey
  };

  window.addEventListener('hashchange', render);
  /* desktop app: small badge showing whether this PC's data has reached the cloud */
  (function () {
    if (!(window.labposDesktop && window.labposDesktop.isDesktop)) return;
    var badge = null;
    function paint(st) {
      if (!session()) { if (badge) badge.style.display = 'none'; return; }
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'syncBadge';
        badge.style.cssText = 'position:fixed;right:14px;bottom:10px;z-index:9998;font:600 11.5px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid #d6dde6;box-shadow:0 2px 8px rgba(0,0,0,.08);cursor:pointer;color:#334155';
        badge.title = 'Click to sync now';
        badge.onclick = function () { poll(true); };
        document.body.appendChild(badge);
      }
      badge.style.display = '';
      var pend = st && st.pending ? ' · ' + st.pending + ' pending' : '';
      if (st && st.syncing) { badge.textContent = '⟳ Syncing…'; badge.style.color = '#0369a1'; }
      else if (st && st.hasSession && st.online && !st.lastError) { badge.textContent = '● Synced to cloud' + pend; badge.style.color = '#15803d'; }
      else if (st && st.lastError && st.hasSession === false && /expired/i.test(st.lastError)) { badge.textContent = '○ Sign in again to sync' + pend; badge.style.color = '#b45309'; }
      else { badge.textContent = '○ Offline — saved on this PC' + pend; badge.style.color = '#b45309'; }
    }
    function poll(now) {
      if (!session() || !window.LABPOS_API) return paint(null);
      var h = window.DB && DB.authHeaders ? DB.authHeaders({}) : {};
      fetch(window.LABPOS_API + '/api/sync/' + (now ? 'now' : 'status'), { method: now ? 'POST' : 'GET', headers: h })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function () { return fetch(window.LABPOS_API + '/api/sync/status', { headers: h }).then(function (r) { return r.ok ? r.json() : null; }); })
        .then(paint).catch(function () { paint(null); });
    }
    setInterval(function () { poll(false); }, 15000);
    window.addEventListener('hashchange', function () { setTimeout(function () { poll(false); }, 800); });
  })();
  /* cloud mode: surface failed saves, handle expired sessions, pick up other PCs' changes */
  if (window.DB) {
    var _lastWriteToast = 0;
    DB.onWriteError = function (msg) {
      if (Date.now() - _lastWriteToast < 4000) return;
      _lastWriteToast = Date.now();
      toast(msg, 'err');
    };
    DB.onAuthError = function () {
      if (!session()) return;
      toast('Your session expired. Please sign in again.', 'err');
      setTimeout(logout, 1200);
    };
    setInterval(function () {
      if (document.hidden || !session() || !DB.isRemote || !DB.isRemote() || !DB.isCloud || !DB.isCloud()) return;
      DB.refresh();
    }, 30000);
  }
  function boot() {
    if (boot.done) return;
    boot.done = true;
    wireShortcuts();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 0); });
    } else {
      setTimeout(render, 0);
    }
  }
  /* Load server data first when running under the LabPOS server/Electron app.
     Falls back to local boot after 3.5s no matter what (never a blank page). */
  try {
    var p = (window.DB && DB.init) ? DB.init() : Promise.resolve(false);
    p.then(boot, boot);
    setTimeout(boot, 3500);
  } catch (e) { boot(); }
})();
