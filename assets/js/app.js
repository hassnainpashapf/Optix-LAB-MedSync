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
    download: '<path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.5A8.4 8.4 0 1 1 21 11.5z"/><path d="M8.5 10.5h7M8.5 14h4"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 7.5 12 12.5l8.7-5"/><path d="M12 22V12.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    tube: '<path d="M8 2h8"/><path d="M9 2v16.5a3 3 0 0 0 6 0V2"/><path d="M9 11h6"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M11 8v8M15 8v8M18 8v8"/>',
    finance: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/>'
  };
  function icon(name, size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || IC.grid) + '</svg>';
  }

  /* ---------------- nav + permissions ---------------- */
  var NAV = [
    { key: 'dashboard', label: 'Dashboard',  icon: 'grid',      route: '#/dashboard', color: '#3b82f6' },
    { key: 'patients',  label: 'Patients',   icon: 'users',     route: '#/patients',  color: '#22c55e' },
    { key: 'samples',   label: 'Samples',    icon: 'tube',      route: '#/samples',   color: '#e11d48' },
    { key: 'stock',     label: 'Stock',      icon: 'box',       route: '#/stock',     color: '#0ea5e9' },
    { key: 'results',   label: 'Lab Results',icon: 'clipboard', route: '#/results',   color: '#8b5cf6',
      sub: [{ key: 'pending', label: 'Pending Entry', route: '#/results' }, { key: 'ready', label: 'Ready Reports', route: '#/results/ready' }] },
    { key: 'tests',     label: 'Tests',      icon: 'flask',     route: '#/tests',     color: '#14b8a6' },
    { key: 'invoices',  label: 'Invoices',   icon: 'file',      route: '#/invoices',  color: '#f97316' },
    { key: 'dues',      label: 'Dues',       icon: 'wallet',    route: '#/dues',      color: '#ef4444' },
    { key: 'doctors',   label: 'Doctors',    icon: 'steth',     route: '#/doctors',   color: '#ec4899' },
    { key: 'expenses',  label: 'Expenses',   icon: 'coins',     route: '#/expenses',  color: '#f59e0b' },
    { key: 'finance',   label: 'Cash & Profit', icon: 'finance', route: '#/finance', color: '#0ea5a4',
      sub: [{ key: 'closing', label: 'Daily Cash Closing', route: '#/finance' }, { key: 'profit', label: 'Profit & Loss', route: '#/finance/profit', roles: ['admin'] }] },
    { key: 'reports',   label: 'Reports',    icon: 'chart',     route: '#/reports',   color: '#6366f1' },
    { key: 'downloads', label: 'Downloads',  icon: 'download',  route: '#/downloads', color: '#06b6d4' },
    { key: 'email',     label: 'Email',      icon: 'mail',      route: '#/email',     color: '#0ea5e9', cloudOnly: true,
      sub: [{ key: 'ready', label: 'Ready to send', route: '#/email' }, { key: 'log', label: 'Email log', route: '#/email/log' }, { key: 'tpl', label: 'Templates & rules', route: '#/email/templates', roles: ['admin'] }] },
    { key: 'whatsapp',  label: 'WhatsApp',   icon: 'chat',      route: '#/whatsapp',  color: '#22c55e',
      sub: [{ key: 'ready', label: 'Ready to send', route: '#/whatsapp' }, { key: 'log', label: 'Message log', route: '#/whatsapp/log' }, { key: 'tpl', label: 'Templates & rules', route: '#/whatsapp/templates', roles: ['admin'] }] },
    { key: 'audit',     label: 'Audit Log',  icon: 'shield',    route: '#/audit',     color: '#0ea5e9' },
    { key: 'subscription', label: 'Subscription', icon: 'card',  route: '#/subscription', color: '#f59e0b', saas: true },
    { key: 'settings',  label: 'Settings',   icon: 'gear',      route: '#/settings',  color: '#64748b',
      sub: [{ key: 'profile', label: 'Lab Profile', route: '#/settings' }, { key: 'account', label: 'My Account', route: '#/settings/account' }, { key: 'templates', label: 'Report Templates', route: '#/settings/templates' },
        { key: 'whatsapp', label: 'WhatsApp', route: '#/settings/whatsapp' }, { key: 'sharing', label: 'Email & Slack', route: '#/settings/sharing' }, { key: 'portal', label: 'Patient portal', route: '#/settings/portal' }, { key: 'users', label: 'Users', route: '#/settings/users' }, { key: 'backup', label: 'Backup', route: '#/settings/backup' },
        { key: 'danger', label: 'Danger Zone', route: '#/settings/danger', danger: true }] },
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
    samples:   ['admin', 'reception', 'technician'],
    stock:     ['admin', 'technician'],
    email:     ['admin', 'reception'],
    results:   ['admin', 'technician'],
    expenses:  ['admin', 'reception'],
    finance:   ['admin', 'reception'],
    reports:   ['admin'],
    downloads:  ['admin', 'reception', 'technician'],
    whatsapp:  ['admin', 'reception'],
    audit:     ['admin'],
    subscription: ['admin'],
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
    var native = isNativeApp();
    var w = native ? null : window.open('', '_blank', 'width=920,height=720');
    if (!native && !w) { toast('Popup blocked — allow popups to print', 'err'); return; }
    var _buf = '';
    var out = { write: function (h) { _buf += h; } };
    out.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      (fd.url ? '<link rel="stylesheet" href="' + fd.url + '">' : '') +
      '<style>' + css + '</style></head><body>' +
      (noHeader ? '' :
      '<div class="ph">' + (s.logo ? '<img class="ph-logo" src="' + esc(s.logo) + '" alt="Lab logo">' : '') +
      '<h1' + (/^#[0-9a-fA-F]{6}$/.test(s.labNameColor || '') ? ' style="color:' + s.labNameColor + '"' : '') + '>' + esc(s.labName || 'Optix LAB MedSync') + '</h1>' +
      '<div class="tag">' + esc(s.tagline || '') + '</div>' +
      '<div class="addr">' + esc(s.address || '') + ' &nbsp;•&nbsp; ' + esc(s.phone || '') +
      (s.email ? ' &nbsp;•&nbsp; ' + esc(s.email) : '') + '</div></div>') +
      bodyHTML +
      (noHeader ? '' : '<div class="note">' + esc(s.footerNote || '') + ' &nbsp;•&nbsp; Printed: ' + esc(dt(new Date())) + '</div>') +
      '</body></html>');
    if (native) { showNativePrint(title, _buf); return; }
    w.document.write(_buf);
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 400);
  }

  /* Android app (WebView): popups / window.print() do not exist, so the document is shown full-screen to read or screenshot;
     lab reports are opened in the phone browser from the cloud viewer instead (see mod-results printReport). */
  function isNativeApp() { return /OptixApp/.test(navigator.userAgent || ''); }
  function showNativePrint(title, html) {
    var old = document.getElementById('nativePrint');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'nativePrint';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#2b2f36;display:flex;flex-direction:column';
    ov.innerHTML = '<div style="flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px;background:#131845;color:#fff;font:700 14px system-ui">' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(title) + '</span>' +
      '<button id="npClose" style="border:0;border-radius:10px;padding:8px 14px;font-weight:700;background:#fff;color:#131845">Close</button></div>' +
      '<iframe id="npFrame" style="flex:1;border:0;background:#fff;width:100%"></iframe>';
    document.body.appendChild(ov);
    document.getElementById('npFrame').srcdoc = html;
    document.getElementById('npClose').onclick = function () { ov.remove(); };
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

    /* patient / doctor portal: public page, works signed out and signed in */
    if (hash.indexOf('#/portal') === 0) {
      var _ph = hash;
      if (window.App && App.renderPortal) App.renderPortal(_ph);
      else App.loadScript('assets/js/mod-portal.js').then(function () { if (/^#\/portal/.test(location.hash)) App.renderPortal(location.hash); }, function () { toast('Could not load the portal', 'err'); });
      return;
    }
    /* password reset pages work signed out (and signed in: the emailed link must always open) */
    if (hash === '#/forgot' || hash.indexOf('#/reset') === 0) {
      var rf = hash === '#/forgot' ? 'renderForgot' : 'renderReset';
      if (window.App && App[rf]) App[rf](); else location.hash = '#/login';
      return;
    }
    /* auth guard */
    if (!s && hash !== '#/login' && hash !== '#/signup') { location.hash = '#/login'; return; }
    if (s && (hash === '#/login' || hash === '#/signup' || hash === '' || hash === '#')) { location.hash = '#/dashboard'; return; }
    if (!hash) { location.hash = s ? '#/dashboard' : '#/login'; return; }

    if (hash === '#/login') { if (window.App && App.renderLogin) App.renderLogin(); return; }
    if (hash === '#/signup') { if (window.App && App.renderSignup) App.renderSignup(); return; }

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
    paintSubBanner(); startSubWatch();
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

  /* ---------------- SaaS subscription state (web / Android cloud app only) ---------------- */
  var subInfo = null, subTimer = null;
  function saasOn() {
    try { return !!(window.DB && DB.isCloud && DB.isCloud()) && !(window.labposDesktop && window.labposDesktop.isDesktop) && !!window.LABPOS_API; } catch (e) { return false; }
  }
  function paintSidePlan() {
    var el = document.getElementById('sfPlan'); if (!el) return;
    var l = subInfo && subInfo.lab, s = session();
    if (!l || l.legacy || !s || s.role !== 'admin') { el.hidden = true; return; }
    var txt = l.status === 'expired' ? 'Plan expired — renew' : (l.status === 'trial' ? 'Free trial · ' + Math.max(l.daysLeft == null ? 0 : l.daysLeft, 0) + ' days left' : l.planName + (l.daysLeft != null && l.daysLeft <= 7 ? ' · ' + Math.max(l.daysLeft, 0) + ' days left' : ' plan'));
    el.textContent = txt; el.className = 'sf-plan ' + (l.status === 'expired' ? 'bad' : (l.status === 'trial' ? 'info' : 'ok')); el.hidden = false;
  }
  function paintSubBanner() {
    paintSidePlan();
    var b = document.getElementById('subBanner');
    if (!b) return;
    var l = subInfo && subInfo.lab, s = session();
    if (!l || !s || l.legacy) { b.hidden = true; return; }
    var admin = s.role === 'admin', link = admin ? '<a href="#/subscription" class="sub-cta">' + (l.status === 'expired' ? 'Renew now' : 'Choose a plan') + '</a>' : '<span class="sub-note">Ask your lab admin to renew.</span>';
    var html = '', cls = '';
    if (l.status === 'expired') {
      cls = 'bad';
      html = '<b>Your ' + (l.plan === 'trial' ? 'free trial' : 'subscription') + ' has ended.</b> The app is now read-only &mdash; you can view and print everything, but new data cannot be saved. ' + link;
    } else if (l.status === 'trial') {
      var d = l.daysLeft == null ? 14 : l.daysLeft;
      cls = d <= 3 ? 'bad' : (d <= 7 ? 'warn' : 'info');
      html = '<b>Free trial: ' + Math.max(d, 0) + ' day' + (d === 1 ? '' : 's') + ' left.</b> ' + (d <= 7 ? 'Pick a plan to keep saving data without interruption. ' : 'Everything is unlocked. ') + link;
    } else if (l.status === 'active' && l.daysLeft != null && l.daysLeft <= 5) {
      cls = l.daysLeft <= 2 ? 'bad' : 'warn';
      html = '<b>Your ' + esc(l.planName) + ' plan ends in ' + Math.max(l.daysLeft, 0) + ' day' + (l.daysLeft === 1 ? '' : 's') + '.</b> Renew to avoid interruption. ' + link;
    }
    if (!html) { b.hidden = true; return; }
    b.className = 'sub-banner ' + cls; b.innerHTML = html; b.hidden = false;
  }
  /* plan limit reached? (instant, from the local data) -> explain and stop BEFORE anything is saved */
  function limitHit(kind) {
    try {
      var l = subInfo && subInfo.lab; if (!l || l.legacy || !saasOn()) return false;
      var cap = kind === 'users' ? l.limits.users : l.limits.invoicesPerMonth; if (!cap) return false;
      var n;
      if (kind === 'users') n = DB.all('users').filter(function (u) { return u.active !== false; }).length;
      else { var m = new Date(), k = m.getFullYear() * 12 + m.getMonth(); n = DB.all('invoices').filter(function (i) { var d = new Date(i.createdAt || 0); return !isNaN(d) && d.getFullYear() * 12 + d.getMonth() === k; }).length; }
      if (n < cap) return false;
      var admin = session() && session().role === 'admin';
      modal('Plan limit reached',
        '<p style="margin:0 0 12px">' + (kind === 'users' ? 'Your <b>' + esc(l.planName) + '</b> plan allows <b>' + cap + '</b> staff users.' : 'Your <b>' + esc(l.planName) + '</b> plan allows <b>' + cap + '</b> invoices per month and this month\'s limit is used up.') + '</p><p class="muted" style="margin:0;font-size:13px">Nothing was saved.</p>' +
        '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" id="lhOk">Close</button>' + (admin ? '<a class="btn btn-primary" href="#/subscription" id="lhGo">View plans</a>' : '') + '</div>',
        { onOpen: function (ov, close) { ov.querySelector('#lhOk').addEventListener('click', close); var g = ov.querySelector('#lhGo'); if (g) g.addEventListener('click', close); } });
      return true;
    } catch (e) { return false; }
  }
  function loadSub() {
    if (!saasOn() || !session() || !window.DB || !DB.saas) return Promise.resolve(null);
    return DB.saas('GET', 'me').then(function (j) { subInfo = j; paintSubBanner(); return j; }, function () { return null; });
  }
  function startSubWatch() {
    if (subTimer || !saasOn()) return;
    subTimer = setInterval(function () { if (!document.hidden) loadSub(); }, 300000);
    loadSub().then(showWelcome);
  }
  function showWelcome() {
    var w = null;
    try { w = JSON.parse(sessionStorage.getItem('labpos_welcome') || 'null'); sessionStorage.removeItem('labpos_welcome'); } catch (e) {}
    if (!w) return;
    modal('Welcome to Optix LAB MedSync 🎉',
      '<p style="margin:0 0 12px">Your lab <b>' + esc(w.name || '') + '</b> is ready. You have a <b>' + (w.days || 14) + '-day free trial</b> with everything unlocked.</p>' +
      '<div style="background:#eef3fb;border:1px solid #cdd9f0;border-radius:12px;padding:12px 14px;margin-bottom:12px"><div class="muted" style="font-size:12px">Your Lab ID &mdash; your staff need it to sign in</div><div style="font-size:22px;font-weight:800;letter-spacing:.02em;color:#131845">' + esc(w.slug) + '</div></div>' +
      '<ol style="margin:0 0 4px 18px;padding:0;line-height:1.9;font-size:14px"><li>Open <b>Settings</b> and add your lab logo, address and phone</li><li>Review the <b>Tests</b> list (5000+ test catalog can be imported)</li><li>Add your <b>staff</b> (reception / technician) in Settings &rarr; Users</li><li>Create your first <b>patient &amp; invoice</b></li></ol>' +
      (w.google ? '<div style="background:#fff8e6;border:1px solid #f0d9a0;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px">You signed up with <b>Google</b>. Your username is <b>' + esc(w.google.username || '') + '</b>.' + (w.google.passwordSet ? '' : ' To sign in on the <b>desktop app</b> (it needs a password), use <b>Forgot password?</b> on the sign-in page once &mdash; we will email you a link.') + '</div>' : '') +
      '<div class="modal-actions" style="margin-top:14px"><a class="btn btn-ghost" href="#/settings" id="wlSet">Open Settings</a><button class="btn btn-primary" id="wlOk">Get started</button></div>',
      { onOpen: function (ov, close) { ov.querySelector('#wlOk').addEventListener('click', close); ov.querySelector('#wlSet').addEventListener('click', close); } });
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
            '<div class="sub-banner" id="subBanner" hidden></div>' +
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
    /* grouped, professional sidebar: section labels, one icon style, active state on the left */
    var SEC = { dashboard: 'Overview', patients: 'Laboratory', samples: 'Laboratory', stock: 'Laboratory', results: 'Laboratory', tests: 'Laboratory', doctors: 'Laboratory',
      invoices: 'Billing', dues: 'Billing', expenses: 'Billing', finance: 'Billing', reports: 'Insights', audit: 'Insights',
      whatsapp: 'Tools', email: 'Tools', downloads: 'Tools', subscription: 'Account', settings: 'Account' };
    var ORDER = ['dashboard', 'patients', 'samples', 'stock', 'results', 'tests', 'doctors', 'invoices', 'dues', 'expenses', 'finance', 'reports', 'audit', 'whatsapp', 'email', 'downloads', 'subscription', 'settings'];
    var visible = NAV.filter(function (n) { return n.key !== 'profile' && can(n.key, s.role) && (!n.saas || saasOn()) && (!n.cloudOnly || (!!(window.DB && DB.isCloud && DB.isCloud()) && !(window.labposDesktop && window.labposDesktop.isDesktop))); })
      .sort(function (x, y) { return ORDER.indexOf(x.key) - ORDER.indexOf(y.key); });
    var lastSec = '';
    var items = visible.map(function (n) {
      var head = '';
      if (SEC[n.key] && SEC[n.key] !== lastSec) { lastSec = SEC[n.key]; head = '<div class="nav-sec2">' + lastSec + '</div>'; }
      if (n.sub) { /* collapsible group: the parent only opens / closes the sub-menu, the children are the pages */
        var subs = n.sub.filter(function (x) { return !x.roles || x.roles.indexOf(s.role) >= 0; });
        var open = n.key === activeKey;
        return head + '<div class="nav-grp' + (open ? ' open' : '') + '" data-grp="' + n.key + '">' +
          '<button type="button" class="nav-it nav-par' + (n.key === activeKey ? ' active' : '') + '" data-nav="' + n.key + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="nav-ic">' + icon(n.icon, 20) + '</span><span class="nav-lb">' + n.label + '</span>' +
          '<svg class="nav-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>' +
          '<div class="nav-sub">' + subs.map(function (x) { return '<a href="' + x.route + '" class="nav-sub-it' + (x.danger ? ' danger' : '') + '" data-href="' + x.route + '">' + x.label + '</a>'; }).join('') + '</div></div>';
      }
      return head + '<a href="' + n.route + '" class="nav-it' + (n.key === activeKey ? ' active' : '') + '" data-nav="' + n.key + '">' +
        '<span class="nav-ic">' + icon(n.icon, 20) + '</span><span class="nav-lb">' + n.label + '</span></a>';
    }).join('');
    document.getElementById('sidebar').innerHTML =
      '<div class="brand"><span class="brand-mark">' + (st.logo ? '<img src="' + esc(st.logo) + '" alt="Lab logo">' : icon('flask', 22)) + '</span>' +
      '<span class="brand-tx"><b>' + esc(st.labName || 'Optix LAB MedSync') + '</b><small>Diagnostic Lab</small></span>' +
      '<button class="side-close" id="sideClose" aria-label="Close menu">' + icon('x', 16) + '</button></div>' +
      '<nav class="nav">' + items + '</nav>' +
      '<div class="side-foot"><a class="sf-plan" id="sfPlan" href="#/subscription" hidden></a>' +
      '<div class="sf-user"><span class="sf-av">' + esc((s.name || 'U').charAt(0).toUpperCase()) + '</span><span class="sf-tx"><b>' + esc(s.name || 'User') + '</b><small>' + esc((s.role || '').charAt(0).toUpperCase() + (s.role || '').slice(1)) + '</small></span>' +
      '<button type="button" class="sf-out" id="sideLogout" title="Log out" aria-label="Log out">' + icon('logout', 17) + '</button></div></div>';
    document.getElementById('sideLogout').addEventListener('click', logout);
    paintSidePlan();
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
        '<a class="btn btn-sm tb-qab tb-classic" href="#/finance">' + icon('finance', 14) + '<span class="tb-qa-t">Close Day</span></a>' +
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
      '.tb-qa .tb-classic{background:#fff;border:1px solid var(--bd);color:#131845;font-weight:600;box-shadow:none}' +
      '.tb-qa .tb-classic:hover{background:#ebf4f8;border-color:#8fa0c0;color:#131845;transform:none}' +
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
    /* (#navToggle itself is handled by the delegated listener in index.html; a second handler here toggled it twice = menu never opened) */
    /* mobile drawer: close on nav tap, close button, backdrop tap, Escape (delegated once) */
    if (!window.__sideDrawerWired) {
      window.__sideDrawerWired = true;
      document.addEventListener('click', function (e) {
        if (!document.body.classList.contains('side-open')) return;
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#sideClose') || t.closest('#sidebar .nav-it:not(.nav-par)') || t.closest('#sidebar .nav-sub-it')) { document.body.classList.remove('side-open'); return; }
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
    /* sub-menu: highlight the child that matches the current page and keep its group open */
    var h = (location.hash || '').split('?')[0], subs = document.querySelectorAll('.nav-sub-it');
    for (var j = 0; j < subs.length; j++) {
      var on = subs[j].getAttribute('data-href') === h;
      subs[j].classList.toggle('on', on);
    }
    /* accordion: only the group that holds the current page stays open; moving to any other page closes the rest */
    var grps = document.querySelectorAll('.nav-grp');
    for (var k = 0; k < grps.length; k++) {
      var gk = grps[k], hold = gk.getAttribute('data-grp') === key || !!gk.querySelector('.nav-sub-it.on');
      gk.classList.toggle('open', hold);
      var pk = gk.querySelector('.nav-par'); if (pk) pk.setAttribute('aria-expanded', hold ? 'true' : 'false');
    }
  }
  /* sub-menu parents open / close their group (remembered per browser); delegated once */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.nav-par') : null;
    if (!b) return;
    var g = b.closest('.nav-grp'); if (!g) return;
    var open = g.classList.toggle('open');
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { /* opening one group closes the others */
      Array.prototype.forEach.call(document.querySelectorAll('.nav-grp.open'), function (o) {
        if (o === g) return; o.classList.remove('open');
        var op = o.querySelector('.nav-par'); if (op) op.setAttribute('aria-expanded', 'false');
      });
    }
  });

  /* ---------------- login / sign-up: see mod-auth.js (App.renderLogin / App.renderSignup) ---------------- */

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
    isNative: isNativeApp,
    applyFont: applyFont,
    session: session,
    logout: logout,
    can: can,
    currentKey: currentKey,
    loadSub: loadSub,
    limitHit: limitHit,
    sub: function () { return subInfo; },
    saasOn: saasOn
  };

  window.addEventListener('hashchange', render);
  /* phones: label every table cell with its column title so the card layout (app.css) can show it */
  (function () {
    var timer = null;
    function labelTables() {
      timer = null;
      if (window.innerWidth > 640) return;
      var view = document.getElementById('view');
      if (!view) return;
      var tables = view.querySelectorAll('.tbl-wrap table.table');
      for (var t = 0; t < tables.length; t++) {
        var tb = tables[t];
        var ths = tb.querySelectorAll('thead tr:first-child th');
        if (!ths.length) continue;
        var labels = [];
        for (var h = 0; h < ths.length; h++) {
          var span = parseInt(ths[h].getAttribute('colspan') || '1', 10) || 1;
          for (var k = 0; k < span; k++) labels.push((ths[h].textContent || '').replace(/\s+/g, ' ').trim());
        }
        var rows = tb.querySelectorAll('tbody tr');
        var lim = Math.min(rows.length, 400);
        for (var r = 0; r < lim; r++) {
          var cells = rows[r].children;
          if (cells.length === 1 && cells[0].hasAttribute('colspan')) continue;
          for (var c = 0; c < cells.length; c++) {
            if (!cells[c].hasAttribute('data-label') && labels[c]) cells[c].setAttribute('data-label', labels[c]);
            /* keep a cell's mixed content (name + phone, badge + text...) together as one value block */
            if (!cells[c].hasAttribute('data-w') && !/\bactions\b/.test(cells[c].className) && cells[c].childNodes.length > 1) {
              var cv = document.createElement('span');
              cv.className = 'cv';
              while (cells[c].firstChild) cv.appendChild(cells[c].firstChild);
              cells[c].appendChild(cv);
              cells[c].setAttribute('data-w', '1');
            }
          }
        }
      }
    }
    function schedule() { if (!timer) timer = setTimeout(labelTables, 60); }
    function watch() {
      var view = document.getElementById('view');
      if (!view || view.__lblObs) return;
      view.__lblObs = true;
      new MutationObserver(schedule).observe(view, { childList: true, subtree: true });
      schedule();
    }
    window.addEventListener('hashchange', function () { setTimeout(watch, 0); schedule(); });
    window.addEventListener('resize', schedule);
    setInterval(watch, 1500); /* #view is re-created on login/logout */
  })();
  /* Android app: tell the user when a newer APK exists and let them update in one tap
     (Android always asks for the final install confirmation itself — apps cannot install silently). */
  (function () {
    if (!/OptixApp/.test(navigator.userAgent || '')) return;
    var m = /OptixApp\/(\d+)/.exec(navigator.userAgent || '');
    var cur = m ? +m[1] : 201; /* APK 2.0.1 did not report its version */
    var shown = false;
    function check() {
      if (shown || !window.LABPOS_API || !session()) return;
      try { if (+localStorage.getItem('apkUpdLater') > Date.now()) return; } catch (e) {}
      fetch(window.LABPOS_API + '/api/version', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
        if (!v || !v.apk || !(v.apk.versionCode > cur) || shown) return;
        shown = true;
        var bar = document.createElement('div');
        bar.id = 'apkUpdate';
        bar.style.cssText = 'position:fixed;left:10px;right:10px;bottom:14px;z-index:99999;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:#131845;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 13.5px/1.35 system-ui,sans-serif';
        bar.innerHTML = '<div style="flex:1"><b>New app version ' + esc(v.apk.version) + ' available</b><div style="font-weight:500;opacity:.8;font-size:12px">Tap Update &rarr; Download anyway &rarr; open the file &rarr; Install.</div></div>' +
          '<button id="apkLater" style="border:0;border-radius:9px;padding:9px 11px;background:rgba(255,255,255,.14);color:#fff;font-weight:700">Later</button>' +
          '<button id="apkGo" style="border:0;border-radius:9px;padding:9px 14px;background:#fff;color:#131845;font-weight:800">Update</button>';
        document.body.appendChild(bar);
        document.getElementById('apkLater').onclick = function () { bar.remove(); try { localStorage.setItem('apkUpdLater', String(Date.now() + 6 * 3600 * 1000)); } catch (e) {} };
        document.getElementById('apkGo').onclick = function () { location.href = v.apk.url; }; /* external host -> opens in the phone browser, which downloads the APK */
      }).catch(function () {});
    }
    setTimeout(check, 4000);
    setInterval(check, 30 * 60 * 1000);
    window.addEventListener('hashchange', function () { setTimeout(check, 1500); });
  })();

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
    DB.onWriteError = function (msg, code) {
      if (Date.now() - _lastWriteToast < 4000) return;
      _lastWriteToast = Date.now();
      if (code === 'EXPIRED' || code === 'LIMIT_USERS' || code === 'LIMIT_INVOICES') {
        var admin = session() && session().role === 'admin';
        loadSub();
        modal(code === 'EXPIRED' ? 'Subscription ended' : 'Plan limit reached',
          '<p style="margin:0 0 12px">' + esc(msg) + '</p><p class="muted" style="margin:0;font-size:13px">Nothing was saved. Your existing data is safe and can still be viewed and printed.</p>' +
          '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" id="exOk">Close</button>' + (admin ? '<a class="btn btn-primary" href="#/subscription" id="exGo">View plans</a>' : '') + '</div>',
          { onOpen: function (ov, close) { ov.querySelector('#exOk').addEventListener('click', close); var g = ov.querySelector('#exGo'); if (g) g.addEventListener('click', close); } });
        return;
      }
      toast(msg, 'err');
    };
    DB.onAuthError = function () {
      if (!session()) return;
      toast(window.__loginNote || 'Your session expired. Please sign in again.', 'err');
      setTimeout(logout, 1200);
    };
    /* new CRITICAL results saved on another PC/phone: alert here too (toast + browser notification when allowed) */
    var _critSeen = null;
    function critWatch() {
      try {
        var list = DB.all('results').filter(function (r) { return r.critical && r.critical.length && !r.criticalAck; });
        var ids = list.map(function (r) { return r.id; });
        var fresh = _critSeen === null ? [] : list.filter(function (r) { return _critSeen.indexOf(r.id) < 0; });
        _critSeen = ids;
        if (!fresh.length) return;
        var msg = '🚨 ' + fresh.length + ' new critical result' + (fresh.length > 1 ? 's' : '') + ' — open the Dashboard';
        toast(msg, 'err');
        if (window.Notification && Notification.permission === 'granted') { try { new Notification('Critical result', { body: msg }); } catch (e) {} }
      } catch (e) {}
    }
    window.__critWatch = critWatch;
    setInterval(function () {
      if (document.hidden || !session() || !DB.isRemote || !DB.isRemote() || !DB.isCloud || !DB.isCloud()) return;
      DB.refresh().then(function (ok) { if (ok) critWatch(); });
    }, 30000);
    setInterval(function () { if (_critSeen === null && session() && DB.isRemote && DB.isRemote()) critWatch(); }, 5000); /* baseline once signed in */
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
  function bootSplash(on, msg, retry) {
    var el = document.getElementById('bootSplash');
    if (!on) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'bootSplash';
      el.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:linear-gradient(135deg,#131845,#1e2a6b 60%,#5392ba);color:#fff;font:600 15px system-ui,sans-serif;text-align:center;padding:24px';
      document.body.appendChild(el);
    }
    el.innerHTML = (retry ? '' : '<div style="width:38px;height:38px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:bsSpin .8s linear infinite"></div>') +
      '<div>' + msg + '</div>' +
      (retry ? '<button id="bsRetry" style="border:0;border-radius:12px;padding:12px 26px;font-weight:800;background:#fff;color:#131845;font-size:15px">Retry</button>' : '') +
      '<style>@keyframes bsSpin{to{transform:rotate(360deg)}}</style>';
    if (retry) document.getElementById('bsRetry').onclick = function () { start(); };
  }
  /* Server configured (web / Android / desktop): wait for the data instead of guessing after 3.5s — a slow connection used to
     boot with no data and sign the user out on reload. Without a server (plain local mode) boot as before. */
  function start() {
    try {
      if (!(window.DB && DB.init)) { boot(); return; }
      var hasApi = !!window.LABPOS_API;
      if (hasApi) bootSplash(true, 'Loading your lab data…');
      var t = hasApi ? null : setTimeout(boot, 3500);
      DB.init().then(function () {
        if (t) clearTimeout(t);
        if (hasApi && DB.isUnreachable && DB.isUnreachable() && session()) {
          bootSplash(true, 'Cannot reach the server.<br><span style="font-weight:500;opacity:.8;font-size:13px">You are still signed in. Check your internet connection and try again.</span>', true);
          return;
        }
        bootSplash(false);
        boot();
      }, function () { if (t) clearTimeout(t); bootSplash(false); boot(); });
    } catch (e) { boot(); }
  }

  /* ---------- pick-from-a-menu helpers for the test / report-field editors (Tests, Settings -> Report Templates) ----------
     App.unitSelect(cls, value) -> a unit drop-down (common lab units; the current value is kept; "Other…" turns it into a text box)
     App.refPresetSelect()      -> a small drop-down beside a "Reference range" box that fills it with a usual answer */
  var UNITS = ['g/dL', 'g/dl', 'g/L', 'mg/dL', 'mg/L', 'µg/dL', 'ng/mL', 'ng/dL', 'pg/mL', 'µIU/mL', 'mIU/mL', 'IU/mL', 'IU/L', 'U/L', 'U/mL', 'mmol/L', 'm.mol/l', 'mEq/L', 'µmol/L',
    'x10^9/l', 'x10^12/l', 'x10³/µL', 'x10⁶/µL', '/µL', '/cumm', '/HPF', '/LPF', '%', 'fl', 'fL', 'pg', 'mm/hr', 'mm/1st Hour', 'sec', 'min', 'ratio', 'INR', 'COI', 'S/CO', 'Index', 'titre', 'cells/µL', 'mL/min', 'kPa', 'mmHg'];
  var REF_PRESETS = ['Negative', 'Non-Reactive', 'Positive / Negative', 'Reactive / Non-Reactive', 'Absent', 'Not detected', 'Normal', 'Clear', 'Pale yellow',
    'No growth', 'No organism isolated', 'Not seen', 'Adequate', 'A / B / AB / O', 'See report', '< 1:80'];
  App.unitSelect = function (cls, val) {
    val = val == null ? '' : String(val);
    var has = !val || UNITS.indexOf(val) >= 0;
    return '<select class="input unit-sel ' + cls + '" title="Unit"><option value="">Unit…</option>' +
      UNITS.map(function (u) { return '<option' + (u === val ? ' selected' : '') + '>' + esc(u) + '</option>'; }).join('') +
      (has ? '' : '<option selected>' + esc(val) + '</option>') + '<option value="__other">Other… (type)</option></select>';
  };
  App.refPresetSelect = function () {
    return '<select class="input ref-preset" title="Pick a usual answer" style="flex:none;width:58px;padding-left:6px;padding-right:2px"><option value="">Pick</option>' +
      REF_PRESETS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select>';
  };
  if (!window.__pickMenusWired) {
    window.__pickMenusWired = true;
    document.addEventListener('change', function (e) {
      var t = e.target; if (!t || !t.classList) return;
      if (t.classList.contains('unit-sel') && t.value === '__other') {
        var inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Unit';
        inp.className = t.className.replace('unit-sel', '').replace(/\s+/g, ' ').trim();
        t.parentNode.replaceChild(inp, t); inp.focus(); return;
      }
      if (t.classList.contains('ref-preset') && t.value) {
        var cell = t.parentNode, box = cell && cell.querySelector('input'); if (!box) return;
        box.value = t.value; t.value = '';
        box.dispatchEvent(new Event('input', { bubbles: true }));
        var row = t.closest('.tm-prow, .rt-frow');
        if (row) { var ty = row.querySelector('.tm-pt, .rt-ft'); if (ty) ty.value = 'text'; }
      }
    });
  }


  /* ---------- stock: reagents / consumables ----------
     Everything is derived from the movement log (stock_moves): in (received, with lot + expiry), out (used by a test), waste, adjust (+/-).
     Lots are used oldest-expiry first, so "expiring soon" / "expired" always describes what is really still on the shelf. */
  App.stockState = function () {
    var items = [], moves = [];
    try { items = DB.all('stock_items') || []; moves = DB.all('stock_moves') || []; } catch (e) { return { rows: [], low: 0, out: 0, soon: 0, expired: 0, alerts: 0 }; }
    var st = {}; try { st = DB.get('settings', 'main') || {}; } catch (e) {}
    var warnDays = +st.stockExpiryDays > 0 ? +st.stockExpiryDays : 30;
    var today = new Date().toISOString().slice(0, 10), warn = new Date(Date.now() + warnDays * 86400000).toISOString().slice(0, 10);
    var by = {}; moves.forEach(function (m) { (by[m.itemId] = by[m.itemId] || []).push(m); });
    var rows = items.filter(function (it) { return it.active !== false; }).map(function (it) {
      var lots = [], drawn = 0;
      (by[it.id] || []).forEach(function (m) {
        var q = +m.qty || 0;
        if (m.type === 'in') lots.push({ lot: m.lot || '', expiry: m.expiry || '', left: q });
        else if (m.type === 'adjust') { if (q >= 0) lots.push({ lot: 'adjust', expiry: '', left: q }); else drawn += -q; }
        else drawn += q;
      });
      lots.sort(function (a, b) { var x = a.expiry || '9999', y = b.expiry || '9999'; return x < y ? -1 : (x > y ? 1 : 0); });
      var rest = drawn; lots.forEach(function (l) { var t = Math.min(l.left, rest); l.left -= t; rest -= t; });
      var live = lots.filter(function (l) { return l.left > 1e-9; });
      var onHand = live.reduce(function (a, l) { return a + l.left; }, 0) - rest;
      var expiredQty = 0, soonQty = 0; var nearest = '';
      live.forEach(function (l) { if (l.expiry) { if (!nearest) nearest = l.expiry; if (l.expiry < today) expiredQty += l.left; else if (l.expiry <= warn) soonQty += l.left; } });
      var reorder = +it.reorderLevel || 0;
      return { item: it, onHand: Math.round(onHand * 1000) / 1000, lots: live, nearest: nearest, expiredQty: expiredQty, soonQty: soonQty,
        out: onHand <= 1e-9, low: onHand > 1e-9 && reorder > 0 && onHand <= reorder, expired: expiredQty > 1e-9, soon: soonQty > 1e-9 };
    });
    var c = { rows: rows, warnDays: warnDays };
    c.out = rows.filter(function (r) { return r.out; }).length; c.low = rows.filter(function (r) { return r.low; }).length;
    c.soon = rows.filter(function (r) { return r.soon; }).length; c.expired = rows.filter(function (r) { return r.expired; }).length;
    c.alerts = rows.filter(function (r) { return r.out || r.low || r.soon || r.expired; }).length;
    return c;
  };
  /* a finished result uses the stock its test is set up to use (Tests -> edit -> "Stock used per test"); once per invoice + test */
  App.stockConsume = function (invoiceId, testId) {
    try {
      var t = DB.get('tests', testId); if (!t || !Array.isArray(t.consumes) || !t.consumes.length) return;
      var ref = invoiceId + '|' + testId;
      if ((DB.all('stock_moves') || []).some(function (m) { return m.ref === ref && m.type === 'out'; })) return;
      var now = new Date().toISOString(), who = ''; try { who = (JSON.parse(localStorage.getItem('labpos_session') || '{}').name) || ''; } catch (e) {}
      t.consumes.forEach(function (c) {
        if (!(+c.qty > 0) || !DB.get('stock_items', c.itemId)) return;
        DB.insert('stock_moves', { itemId: c.itemId, type: 'out', qty: +c.qty, ref: ref, note: 'Used for ' + invoiceId, date: now.slice(0, 10), createdAt: now, by: who });
      });
    } catch (e) { /* stock bookkeeping must never block saving a result */ }
  };

  start();
})();
