/* LabPOS — app framework: hash router, auth, shell, shared UI helpers.
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
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
  };
  function icon(name, size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || IC.grid) + '</svg>';
  }

  /* ---------------- nav + permissions ---------------- */
  var NAV = [
    { key: 'dashboard', label: 'Dashboard',  icon: 'grid',      route: '#/dashboard' },
    { key: 'tests',     label: 'Tests',      icon: 'flask',     route: '#/tests' },
    { key: 'billing',   label: 'New Bill',   icon: 'receipt',   route: '#/billing' },
    { key: 'results',   label: 'Lab Results',icon: 'clipboard', route: '#/results' },
    { key: 'invoices',  label: 'Invoices',   icon: 'file',      route: '#/invoices' },
    { key: 'dues',      label: 'Dues',       icon: 'wallet',    route: '#/dues' },
    { key: 'patients',  label: 'Patients',   icon: 'users',     route: '#/patients' },
    { key: 'doctors',   label: 'Doctors',    icon: 'steth',     route: '#/doctors' },
    { key: 'expenses',  label: 'Expenses',   icon: 'coins',     route: '#/expenses' },
    { key: 'reports',   label: 'Reports',    icon: 'chart',     route: '#/reports' },
    { key: 'settings',  label: 'Settings',   icon: 'gear',      route: '#/settings' }
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
    settings:  ['admin']
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
      return s && s.userId ? s : null;
    } catch (e) { return null; }
  }
  function logout() {
    localStorage.removeItem(SKEY);
    location.hash = '#/login';
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
    setTimeout(function () { t.classList.add('t-in'); }, 10);
    setTimeout(function () {
      t.classList.remove('t-in');
      setTimeout(function () { t.remove(); }, 350);
    }, 3200);
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

  /* ---------------- print ---------------- */
  function printDoc(title, bodyHTML) {
    var s = {};
    try { s = window.DB.get('settings', 'main') || {}; } catch (e) {}
    var css = '' +
      '*{margin:0;padding:0;box-sizing:border-box}' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;font-size:13px}' +
      '.ph{text-align:center;border-bottom:3px double #0d9488;padding-bottom:12px;margin-bottom:16px}' +
      '.ph h1{font-size:24px;color:#0d9488;letter-spacing:.5px}' +
      '.ph .tag{font-size:12px;color:#555;margin:2px 0}' +
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
      '<style>' + css + '</style></head><body>' +
      '<div class="ph"><h1>' + esc(s.labName || 'Optix LAB MedSync') + '</h1>' +
      '<div class="tag">' + esc(s.tagline || '') + '</div>' +
      '<div class="addr">' + esc(s.address || '') + ' &nbsp;•&nbsp; ' + esc(s.phone || '') +
      (s.email ? ' &nbsp;•&nbsp; ' + esc(s.email) : '') + '</div></div>' +
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
  function nav(path) {
    if (location.hash === path) render();
    else location.hash = path;
  }
  function currentKey() { return routeKey(location.hash); }

  function render() {
    var hash = location.hash || '';
    var s = session();

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
    if (!matched) { location.hash = '#/dashboard'; return; }

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
    var items = NAV.filter(function (n) { return can(n.key, s.role); }).map(function (n) {
      return '<a href="' + n.route + '" class="nav-it' + (n.key === activeKey ? ' active' : '') + '" data-nav="' + n.key + '">' +
        '<span class="nav-ic">' + icon(n.icon, 19) + '</span><span class="nav-lb">' + n.label + '</span></a>';
    }).join('');
    document.getElementById('sidebar').innerHTML =
      '<div class="brand"><span class="brand-mark">' + icon('flask', 22) + '</span>' +
      '<span class="brand-tx"><b>' + esc(st.labName || 'Optix LAB MedSync') + '</b><small>Lab POS</small></span></div>' +
      '<div class="nav-sec">Main Menu</div>' +
      '<nav class="nav">' + items + '</nav>' +
      '<div class="side-foot"><div class="side-ver">LabPOS v1.0</div></div>';
    /* topbar */
    var navItem = NAV.filter(function (n) { return n.key === activeKey; })[0];
    document.getElementById('topbar').innerHTML =
      '<style>' +
      '.tb-profile{padding-right:6px}' +
      '.tb-div{width:1px;align-self:stretch;background:var(--line);margin:3px 0}' +
      '.tb-logout{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;flex:none}' +
      '.tb-logout:hover{background:#fee2e2;color:var(--red)}' +
      '.tb-logout svg{display:block}' +
      '</style>' +
      '<button class="btn btn-ghost btn-sm nav-toggle" id="navToggle" aria-label="Menu">' + icon('menu', 18) + '</button>' +
      '<h1 class="page-title">' + esc(navItem ? navItem.label : '') + '</h1>' +
      '<div class="top-right">' +
        '<span class="top-date">' + esc(d(new Date())) + '</span>' +
        '<span class="user-chip tb-profile"><span class="avatar">' + esc((s.name || 'U').charAt(0).toUpperCase()) + '</span>' +
        '<span class="user-tx"><b>' + esc(s.name) + '</b>' + badge(s.role) + '</span>' +
        '<span class="tb-div"></span>' +
        '<button class="tb-logout" id="logoutBtn" title="Logout" aria-label="Logout">' + icon('logout', 16) + '</button></span>' +
      '</div>';
    document.getElementById('logoutBtn').addEventListener('click', logout);
    var nt = document.getElementById('navToggle');
    if (nt) nt.addEventListener('click', function () { document.body.classList.toggle('side-open'); });
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
    document.body.className = 'login-mode';
    document.body.innerHTML =
      '<div class="login-wrap">' +
        '<div class="login-brand">' +
          '<div class="lb-inner">' +
            '<span class="brand-mark lg">' + icon('flask', 30) + '</span>' +
            '<h1>' + esc(st.labName || 'Optix LAB MedSync') + '</h1>' +
            '<p class="lb-tag">' + esc(st.tagline || 'Accurate • Fast • Trusted') + '</p>' +
            '<ul class="lb-feats">' +
              '<li>' + icon('check', 15) + ' Complete billing & invoicing</li>' +
              '<li>' + icon('check', 15) + ' Test results & lab reports</li>' +
              '<li>' + icon('check', 15) + ' Dues, doctors & daily reports</li>' +
            '</ul>' +
            '<p class="lb-foot">' + esc(st.address || '') + '<br>' + esc(st.phone || '') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="login-side">' +
          '<form class="login-card" id="loginForm" autocomplete="off">' +
            '<h2>Welcome back</h2>' +
            '<p class="login-sub">Sign in to your lab workspace</p>' +
            '<div class="login-err" id="loginErr" hidden></div>' +
            '<label class="label">Username<input class="input" id="liUser" placeholder="Enter username" autofocus></label>' +
            '<label class="label">Password<input class="input" id="liPass" type="password" placeholder="Enter password"></label>' +
            '<button class="btn btn-primary btn-block" type="submit">Sign In</button>' +
            '<div class="login-div"><span>or</span></div>' +
            '<a class="btn btn-ghost btn-block" href="https://labpos-superadmin.pages.dev/" target="_blank" rel="noopener">Superadmin Login</a>' +
            '<p class="login-hint">Default access — admin / admin123</p>' +
          '</form>' +
        '</div>' +
      '</div>';
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = document.getElementById('liUser').value.trim();
      var p = document.getElementById('liPass').value;
      var err = document.getElementById('loginErr');
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
      localStorage.setItem(SKEY, JSON.stringify({
        userId: found.id, name: found.name, role: found.role, loginAt: new Date().toISOString()
      }));
      location.hash = '#/dashboard';
    });
  }

  /* ---------------- public API ---------------- */
  window.App = {
    route: route,
    nav: nav,
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
    empty: empty,
    badge: badge,
    icon: icon,
    renderShell: renderShell,
    session: session,
    logout: logout,
    can: can,
    currentKey: currentKey
  };

  window.addEventListener('hashchange', render);
  function boot() {
    if (boot.done) return;
    boot.done = true;
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
