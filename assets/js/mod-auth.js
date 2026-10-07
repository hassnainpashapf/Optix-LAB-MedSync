/* ============================================================
   Optix Medical Science — sign-in + free-trial sign-up pages
   Routes: #/login, #/signup (shown only while signed out)
   Split layout: animated brand half + form half. Exposes App.renderLogin / App.renderSignup.
   ============================================================ */
(function () {
  'use strict';
  var A = window.App;
  if (!A) return;
  var SKEY = 'labpos_session', LKEY = 'labpos_lab';
  var WEB = 'https://optix-lab-medsync.pages.dev';
  var esc = A.esc, icon = A.icon;

  var IC = {
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M1 1l22 22"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M16 7l3 3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>'
  };
  function ic(n, s) {
    return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  }

  function isDesktop() { return !!(window.labposDesktop && window.labposDesktop.isDesktop); }
  function isCloud() { try { return !!(window.DB && DB.isCloud && DB.isCloud()); } catch (e) { return false; } }
  function greet() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening'); }
  function lget(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lset(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  /* ---------- brand half (shared by sign-in and sign-up) ---------- */
  var FEAT = [
    ['<path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7L21 16"/><path d="M16 16h5v5"/>', 'Works offline, syncs to the cloud'],
    ['<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7 15h10"/>', '5000+ ready lab test catalog'],
    ['<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 20h3v1"/>', 'QR-verified patient reports'],
    [IC.shield, 'Secure role-based access']
  ];
  function brandHtml(mode) {
    var feats = FEAT.map(function (f, i) {
      return '<li style="--i:' + i + '"><span class="lg-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + f[0] + '</svg></span>' + f[1] + '</li>';
    }).join('');
    var hero = mode === 'signup'
      ? 'Start your lab<br><span id="lgRot">in under a minute.</span>'
      : 'Your lab,<br><span id="lgRot">always in sync.</span>';
    var lead = mode === 'signup'
      ? '14-day free trial. No credit card. Your data stays yours &mdash; on desktop, web and mobile.'
      : 'Patients, billing, results and reports &mdash; on desktop, web and mobile.';
    return '<aside class="lg-brand" aria-hidden="true">' +
      '<div class="lg-orbs"><i></i><i></i><i></i><i></i></div><div class="lg-grid"></div>' +
      '<div class="lg-brand-in">' +
        '<div class="lg-pill"><span class="lg-dot"></span>Optix Medical Science</div>' +
        '<h2 class="lg-hero">' + hero + '</h2>' +
        '<p class="lg-lead">' + lead + '</p>' +
        '<ul class="lg-feat">' + feats + '</ul>' +
        /* live report preview: glass card with a drawing sparkline, status chips that pop in */
        '<div class="lg-demo">' +
          '<div class="lg-dh"><span class="lg-av">AK</span><div class="lg-dn"><b>Ayesha Khan</b><small>28 yrs &middot; F &middot; CBC &middot; INV-0142</small></div><span class="lg-tag">Ready</span></div>' +
          '<div class="lg-dr"><span>Haemoglobin</span><b>13.8 <i>g/dL</i></b><span class="lg-chip ok">Normal</span></div>' +
          '<div class="lg-dr"><span>WBC count</span><b>11.9 <i>x10&sup3;/&micro;L</i></b><span class="lg-chip warn">High</span></div>' +
          '<svg class="lg-spark" viewBox="0 0 240 46" preserveAspectRatio="none"><defs><linearGradient id="lgSg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8fe3ff" stop-opacity=".45"/><stop offset="1" stop-color="#8fe3ff" stop-opacity="0"/></linearGradient></defs>' +
          '<path class="lg-sp-fill" d="M0 34 L40 28 L80 31 L120 20 L160 24 L200 11 L240 14 L240 46 L0 46Z" fill="url(#lgSg)"/>' +
          '<path class="lg-sp-line" d="M0 34 L40 28 L80 31 L120 20 L160 24 L200 11 L240 14" pathLength="100"/></svg>' +
          '<span class="lg-pop lg-pop1">&#10003; Sent on WhatsApp</span><span class="lg-pop lg-pop2">&#128680; Critical alert</span>' +
        '</div>' +
        '<div class="lg-plat"><span>Windows</span><span>macOS</span><span>Android</span><span>Web</span></div>' +
        '<svg class="lg-ecg" viewBox="0 0 400 80" preserveAspectRatio="none">' +
          '<path class="lg-ecg-base" d="M0 40H60L72 40L80 14L92 66L102 28L110 40H200L212 40L220 14L232 66L242 28L250 40H400" pathLength="100"/>' +
          '<path class="lg-ecg-live" d="M0 40H60L72 40L80 14L92 66L102 28L110 40H200L212 40L220 14L232 66L242 28L250 40H400" pathLength="100"/>' +
        '</svg>' +
      '</div></aside>';
  }
  var _rot = null;
  function wireBrand(mode) {
    if (_rot) { clearInterval(_rot); _rot = null; }
    var words = mode === 'signup'
      ? ['in under a minute.', 'with 5000+ tests ready.', 'with zero setup cost.']
      : ['always in sync.', 'always in control.', 'always report-ready.', 'always one tap away.'];
    var i = 0;
    _rot = setInterval(function () {
      var e = document.getElementById('lgRot');
      if (!e) { clearInterval(_rot); _rot = null; return; }
      e.classList.add('out');
      setTimeout(function () { i = (i + 1) % words.length; e.textContent = words[i]; e.classList.remove('out'); }, 350);
    }, 3400);
  }
  function bubblesHtml() { return '<div class="lg-bubs"><i></i><i></i><i></i><i></i><i></i></div>'; }

  /* a labelled input with a leading icon: field('liUser', 'user', 'Username', {ph:'…', type:'text'}) */
  function field(id, ico, label, o) {
    o = o || {};
    return '<label class="lg-f"><span class="lg-fl">' + label + (o.opt ? ' <em>optional</em>' : '') + '</span>' +
      '<span class="lg-in">' + ic(ico, 17) + '<input class="input" id="' + id + '" type="' + (o.type || 'text') + '" placeholder="' + esc(o.ph || '') + '"' +
      (o.val ? ' value="' + esc(o.val) + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : ' autocomplete="off"') + (o.focus ? ' autofocus' : '') +
      (o.max ? ' maxlength="' + o.max + '"' : '') + ' spellcheck="false" autocapitalize="off">' +
      (o.pw ? '<button type="button" class="lg-eye" id="' + id + 'Eye" aria-label="Show password" tabindex="-1">' + ic('eye', 17) + '</button>' : '') +
      '</span>' + (o.hint ? '<small class="lg-hint" id="' + id + 'Hint">' + o.hint + '</small>' : '') + '</label>';
  }
  function wirePw(id) {
    var inp = document.getElementById(id), eye = document.getElementById(id + 'Eye');
    if (!inp || !eye) return;
    eye.addEventListener('click', function () {
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      eye.innerHTML = ic(show ? 'eyeOff' : 'eye', 17);
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    inp.addEventListener('keyup', function (e) {
      var on = e.getModifierState && e.getModifierState('CapsLock');
      var c = document.getElementById('lgCaps'); if (c) c.hidden = !on;
    });
    inp.addEventListener('blur', function () { var c = document.getElementById('lgCaps'); if (c) c.hidden = true; });
  }
  function showErr(msg) {
    var err = document.getElementById('loginErr'); if (!err) return;
    err.hidden = false; err.textContent = msg;
    var card = document.querySelector('.login-card');
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
  }
  function setSession(j, labSlug) {
    localStorage.setItem(SKEY, JSON.stringify({
      labId: 'cloud', userId: j.user.id, name: j.user.name, role: j.user.role, roleId: j.user.roleId || '',
      token: j.token, lab: labSlug || (j.lab && j.lab.slug) || '', loginAt: new Date().toISOString()
    }));
  }

  /* ---------- "Continue with Google" (shown only when the operator has set a Google Client ID in the superadmin console) ---------- */
  function googleAllowed() {
    return isCloud() && !isDesktop() && !!window.fetch && !!window.LABPOS_API && !/OptixApp|; wv\)|Electron/i.test(navigator.userAgent || '');
  }
  function wireGoogle(wrapId, btnId, onCredential) {
    if (!googleAllowed()) return;
    window.fetch(window.LABPOS_API + '/api/auth/google-config').then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
      var wrap = document.getElementById(wrapId), box = document.getElementById(btnId);
      if (!cfg || !cfg.clientId || !wrap || !box) return;
      function go() {
        try {
          window.google.accounts.id.initialize({ client_id: cfg.clientId, callback: function (resp) { if (resp && resp.credential) onCredential(resp.credential); }, ux_mode: 'popup' });
          window.google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: Math.min(360, Math.max(240, box.parentNode.clientWidth || 320)) });
          wrap.hidden = false;
        } catch (e) { /* Google script blocked: the normal form still works */ }
      }
      if (window.google && window.google.accounts && window.google.accounts.id) { go(); return; }
      var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = go; sc.onerror = function () {};
      document.head.appendChild(sc);
    }).catch(function () {});
  }

  /* create a free-trial lab straight from a Google sign-in: every field is optional, the server fills the rest from the Google account */
  function googleSignup(cred, extra) {
    var body = { credential: cred };
    Object.keys(extra || {}).forEach(function (k) { if (extra[k]) body[k] = extra[k]; });
    return DB.saas('POST', 'google-signup', body).then(function (j) {
      return DB.adoptSession(j).then(function () { return j; }, function () { return j; });
    }).then(function (j) {
      lset(LKEY, j.lab.slug); setSession(j, j.lab.slug);
      try { sessionStorage.setItem('labpos_welcome', JSON.stringify({ slug: j.lab.slug, days: j.lab.daysLeft, name: j.lab.name, google: j.google || null })); } catch (e2) {}
      location.hash = '#/dashboard';
    });
  }

  /* ---------- sign in ---------- */
  A.renderLogin = function () {
    var st = {};
    try { st = window.DB.get('settings', 'main') || {}; } catch (e) {}
    /* Cloud/web sign-in always shows the Optix brand; a lab's own logo + name appear only inside its dashboard.
       The desktop app (local install) shows its own lab's logo + name on the sign-in page. */
    var desk = isDesktop(), webCloud = isCloud() && !desk;
    if (webCloud) st = {};
    /* local (no server) multi-lab selector */
    var labs = [];
    try { labs = window.DB.labs().filter(function (l) { return l.active !== false; }); } catch (e) {}
    var cur = null; try { cur = window.DB.currentLab(); } catch (e) {}
    var selId = (cur && cur.id) || (labs[0] && labs[0].id) || 'lab1';
    var showLabId = isCloud() || desk;
    var signupHref = desk ? WEB + '/app/#/signup' : '#/signup';
    var signupAttr = desk ? ' target="_blank" rel="noopener"' : '';

    document.body.className = 'login-mode';
    document.body.innerHTML =
      '<div class="login-wrap lg-split">' + brandHtml('login') +
      '<div class="lg-form">' + bubblesHtml() +
        '<a class="lg-back" href="' + WEB + '/"' + (desk ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Back to website</a>' +
        '<form class="login-card lg-card" id="loginForm" autocomplete="off">' +
          '<div class="login-logo">' +
            '<span class="login-mark">' + (st.logo ? '<img src="' + esc(st.logo) + '" alt="Lab logo">' : icon('flask', 32)) + '</span>' +
            '<h1>' + esc(st.labName || 'Optix Medical Science') + '</h1>' +
            '<p class="login-tag">' + esc(st.tagline || 'Accurate • Fast • Trusted') + '</p>' +
          '</div>' +
          (labs.length > 1 && !showLabId
            ? '<label class="lg-f"><span class="lg-fl">Lab</span><span class="lg-in lg-sel">' + ic('building', 17) + '<select class="select" id="liLab">' +
              labs.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === selId ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select></span></label>'
            : '') +
          '<div class="login-err" id="loginErr" hidden></div>' +
          (showLabId ? field('liLabId', 'building', 'Lab ID', { ph: 'e.g. al-shifa', val: lget(LKEY), max: 30, hint: 'Shown when your lab was created. Leave empty for the main lab.' }) : '') +
          field('liUser', 'user', 'Username', { ph: 'Enter username', auto: 'username', focus: !showLabId || !!lget(LKEY) }) +
          field('liPass', 'lock', 'Password', { ph: 'Enter password', type: 'password', pw: true, auto: 'current-password' }) +
          '<div class="lg-caps" id="lgCaps" hidden>' + ic('alert', 14) + ' Caps Lock is on</div>' +
          (showLabId && !desk ? '<div class="lg-forgot" id="lgForgot" hidden><a href="#/forgot">Forgot password?</a></div>' : '') + /* shown only when the server can send email */
          '<button class="btn login-signin btn-block" type="submit"><span class="lg-bt">Sign In</span><span class="lg-ba">' + ic('arrow', 18) + '</span></button>' +
          (showLabId && !desk ? '<div class="lg-google" id="lgGoogle" hidden><div class="login-div"><span>or</span></div><div class="lg-gbtn" id="lgGBtn"></div></div>' : '') +
          (showLabId ? '<p class="lg-new">New to Optix? <a href="' + signupHref + '"' + signupAttr + '>Start your 14-day free trial</a></p>' : '') +
          (showLabId ? '<p class="lg-new" style="margin-top:6px">Patient or doctor? <a id="lgPortal" href="' + (desk ? WEB + '/app/#/portal' : '#/portal') + '"' + signupAttr + '>See your reports</a></p>' : '') +
          '<div class="login-div"><span>or</span></div>' +
          (desk
            ? '<a class="btn btn-ghost btn-block" href="' + WEB + '/superadmin/" target="_blank" rel="noopener">Superadmin Login</a>'
            : '<a class="btn btn-ghost btn-block" href="/superadmin/">Superadmin Login</a>') +
        '</form>' +
        '<p class="login-foot"><span class="lg-secure">' + ic('shield', 13) + (desk ? 'Desktop app &middot; works offline, syncs when online' : 'Secure, encrypted sign-in') + '</span>Powered by System Optix</p>' +
      '</div></div>';
    wireBrand('login');
    wirePw('liPass');
    try { /* "Forgot password?" appears only once the server has an email sender configured (SMTP) */
      var fg = document.getElementById('lgForgot');
      if (fg && window.LABPOS_API && window.fetch) window.fetch(window.LABPOS_API + '/api/auth/mail-status').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.mail) fg.hidden = false; }).catch(function () {});
    } catch (e) {}
    var _lp = document.getElementById('lgPortal'); /* carry a typed Lab ID into the patient / doctor page */
    if (_lp && !desk) _lp.addEventListener('click', function (e) { var lb = document.getElementById('liLabId'), v = lb ? lb.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : ''; if (v) { e.preventDefault(); location.hash = '#/portal/' + v; } });
    if (window.__loginNote) { showErr(window.__loginNote); window.__loginNote = ''; } /* e.g. "This lab account is suspended" */
    wireGoogle('lgGoogle', 'lgGBtn', function (cred) {
      var labEl = document.getElementById('liLabId'), lab = labEl ? labEl.value.trim().toLowerCase() : '';
      var old = document.getElementById('lgMakeLab'); if (old) old.remove();
      document.getElementById('loginErr').hidden = true;
      DB.saas('POST', 'google-login', { credential: cred, lab: lab }).then(function (j) {
        return DB.adoptSession(j).then(function () { return j; }, function () { return j; });
      }).then(function (j) {
        lset(LKEY, j.lab.slug); setSession(j, j.lab.slug); location.hash = '#/dashboard';
      }).catch(function (ex) {
        showErr((ex && ex.message) || 'Google sign-in failed. Please try again.');
        if (ex && ex.code === 'NO_LAB') { /* no lab for this Google account yet: offer to make one in one click */
          var er = document.getElementById('loginErr'), mk = document.createElement('button');
          mk.type = 'button'; mk.id = 'lgMakeLab'; mk.className = 'btn btn-primary btn-block'; mk.style.margin = '8px 0 4px';
          mk.textContent = 'Create my free 14-day trial lab with this Google account';
          mk.onclick = function () {
            mk.disabled = true; mk.textContent = 'Creating your lab…';
            googleSignup(cred, {}).catch(function (e2) { mk.disabled = false; mk.textContent = 'Create my free 14-day trial lab with this Google account'; showErr((e2 && e2.message) || 'Could not create the lab. Please try again.'); });
          };
          er.parentNode.insertBefore(mk, er.nextSibling);
        }
      });
    });

    var labSel = document.getElementById('liLab');
    if (labSel) labSel.addEventListener('change', function () {
      try {
        window.DB.useLab(labSel.value);
        var ns = window.DB.get('settings', 'main') || {};
        var h1 = document.querySelector('.login-card h1'); if (h1) h1.textContent = ns.labName || 'Optix Medical Science';
        var tg = document.querySelector('.login-tag'); if (tg) tg.textContent = ns.tagline || 'Accurate • Fast • Trusted';
        var lm = document.querySelector('.login-mark'); if (lm) lm.innerHTML = ns.logo ? '<img src="' + esc(ns.logo) + '" alt="Lab logo">' : icon('flask', 32);
      } catch (e) {}
    });

    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = document.getElementById('liUser').value.trim();
      var p = document.getElementById('liPass').value;
      var labEl = document.getElementById('liLabId');
      var lab = labEl ? labEl.value.trim().toLowerCase() : '';
      var err = document.getElementById('loginErr');
      err.hidden = true;
      if (window.DB && DB.isCloud && DB.isCloud()) {
        /* cloud: the server checks the password and returns a session token */
        var btn = document.querySelector('.login-signin');
        if (btn) { btn.disabled = true; btn.classList.add('busy'); btn.querySelector('.lg-bt').textContent = 'Signing in…'; }
        DB.cloudLogin(u, p, lab).then(function (j) {
          lset(LKEY, lab);
          setSession(j, lab);
          location.hash = '#/dashboard';
        }).catch(function (ex) {
          if (btn) { btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('.lg-bt').textContent = 'Sign In'; }
          showErr((ex && ex.message) || 'Login failed. Please try again.');
        });
        return;
      }
      /* local (no server) mode: authenticate against the selected lab's isolated store */
      var ls2 = document.getElementById('liLab');
      if (ls2) { try { window.DB.useLab(ls2.value); } catch (ex2) {} }
      var users = [];
      try { users = window.DB.all('users'); } catch (ex) {}
      var found = null;
      for (var i = 0; i < users.length; i++) {
        if (users[i].username === u && users[i].password === p && users[i].active !== false) { found = users[i]; break; }
      }
      if (!found) { showErr('Invalid username or password. Please try again.'); return; }
      var sessLab = 'lab1';
      try { sessLab = window.DB.currentLabId() || sessLab; } catch (ex3) {}
      localStorage.setItem(SKEY, JSON.stringify({ labId: sessLab, userId: found.id, name: found.name, role: found.role, roleId: found.roleId || '', loginAt: new Date().toISOString() }));
      location.hash = '#/dashboard';
    });
  };

  /* ---------- free-trial sign-up ---------- */
  A.renderSignup = function () {
    if (isDesktop() || !(window.DB && DB.saas) || !window.LABPOS_API) { location.hash = '#/login'; return; }
    document.body.className = 'login-mode';
    document.body.innerHTML =
      '<div class="login-wrap lg-split lg-signup">' + brandHtml('signup') +
      '<div class="lg-form">' + bubblesHtml() +
        '<a class="lg-back" href="#/login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Back to sign in</a>' +
        '<form class="login-card lg-card lg-wide" id="suForm" autocomplete="off">' +
          '<div class="login-logo lg-sm"><span class="login-mark">' + icon('flask', 28) + '</span></div>' +
          '<h2>Create your lab account</h2>' +
          '<p class="login-sub">Free for 14 days &mdash; no credit card needed</p>' +
          '<div class="login-err" id="loginErr" hidden></div>' +
          field('suLab', 'building', 'Lab / clinic name', { ph: 'e.g. Al Shifa Diagnostics', max: 60, focus: true }) +
          '<div class="lg-two">' + field('suOwner', 'user', 'Your name', { ph: 'Owner / manager', max: 60 }) + field('suPhone', 'phone', 'Phone', { ph: '03xx-xxxxxxx', max: 20, opt: true }) + '</div>' +
          field('suEmail', 'mail', 'Email', { ph: 'you@example.com', type: 'email', auto: 'email', max: 80 }) +
          field('suSlug', 'at', 'Lab ID', { ph: 'al-shifa', max: 30, hint: 'Your staff type this to sign in. <b id="suSlugMsg"></b>' }) +
          '<div class="lg-two">' + field('suUser', 'key', 'Admin username', { ph: 'e.g. admin', max: 30, auto: 'username' }) +
          field('suPass', 'lock', 'Password', { ph: 'Min 6 characters', type: 'password', pw: true, auto: 'new-password' }) + '</div>' +
          '<div class="lg-meter" id="suMeter"><i></i><i></i><i></i><span id="suMeterT"></span></div>' +
          '<div class="lg-caps" id="lgCaps" hidden>' + ic('alert', 14) + ' Caps Lock is on</div>' +
          '<label class="lg-terms"><input type="checkbox" id="suTerms"><span>I agree to the <a href="' + WEB + '/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="' + WEB + '/privacy.html" target="_blank" rel="noopener">Privacy Policy</a></span></label>' +
          '<button class="btn login-signin btn-block" type="submit"><span class="lg-bt">Create my lab &mdash; start free trial</span><span class="lg-ba">' + ic('arrow', 18) + '</span></button>' +
          '<div class="lg-google" id="suGoogle" hidden><div class="login-div"><span>or sign up in one click</span></div><div class="lg-gbtn" id="suGBtn"></div><p class="lg-gnote">Nothing to fill in: your name, email, lab name and Lab ID are taken from your Google account (you can change the lab details later in Settings). By continuing you agree to the <a href="' + WEB + '/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="' + WEB + '/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p></div>' +
          '<p class="lg-new">Already have an account? <a href="#/login">Sign in</a></p>' +
        '</form>' +
        '<p class="login-foot"><span class="lg-secure">' + ic('shield', 13) + 'Your lab\'s data is stored in its own isolated space</span>Powered by System Optix</p>' +
      '</div></div>';
    wireBrand('signup');
    wirePw('suPass');

    var slugTouched = false, chkT = null, slugOk = false;
    var $ = function (id) { return document.getElementById(id); };
    function slugify(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); }
    function checkSlug() {
      var v = slugify($('suSlug').value), m = $('suSlugMsg');
      slugOk = false;
      if (!v) { m.textContent = ''; return; }
      if (v.length < 3) { m.textContent = 'Too short (min 3)'; m.className = 'bad'; return; }
      m.textContent = 'Checking…'; m.className = '';
      clearTimeout(chkT);
      chkT = setTimeout(function () {
        DB.saas('GET', 'check-slug?slug=' + encodeURIComponent(v)).then(function (r) {
          if ($('suSlug') && slugify($('suSlug').value) === v) { slugOk = !!r.available; m.textContent = r.available ? '✓ Available' : '✗ ' + (r.reason || 'Not available'); m.className = r.available ? 'ok' : 'bad'; }
        }).catch(function () { slugOk = true; m.textContent = ''; });
      }, 380);
    }
    $('suLab').addEventListener('input', function () { if (!slugTouched) { $('suSlug').value = slugify($('suLab').value); checkSlug(); } });
    $('suSlug').addEventListener('input', function () { slugTouched = true; checkSlug(); });
    $('suPass').addEventListener('input', function () {
      var v = $('suPass').value, sc = 0;
      if (v.length >= 6) sc++; if (v.length >= 9 && /[a-z]/i.test(v) && /\d/.test(v)) sc++; if (v.length >= 11 && /[^a-z0-9]/i.test(v)) sc++;
      var m = $('suMeter'); m.setAttribute('data-s', v ? String(sc) : '0');
      $('suMeterT').textContent = !v ? '' : (sc <= 1 ? 'Weak' : (sc === 2 ? 'Good' : 'Strong'));
    });

    $('suForm').addEventListener('submit', function (e) {
      e.preventDefault();
      $('loginErr').hidden = true;
      var body = {
        labName: $('suLab').value.trim(), ownerName: $('suOwner').value.trim(), phone: $('suPhone').value.trim(), email: $('suEmail').value.trim(),
        slug: slugify($('suSlug').value), username: $('suUser').value.trim(), password: $('suPass').value
      };
      if (!$('suTerms').checked) { showErr('Please accept the Terms and Privacy Policy to continue.'); return; }
      var btn = document.querySelector('.login-signin');
      btn.disabled = true; btn.classList.add('busy'); btn.querySelector('.lg-bt').textContent = 'Creating your lab…';
      DB.saas('POST', 'signup', body).then(function (j) {
        /* the lab exists the moment the server says so: a failed first data download must not undo that (the boot retry loads the data) */
        return DB.adoptSession(j).then(function () { return j; }, function () { return j; });
      }).then(function (j) {
        lset(LKEY, j.lab.slug);
        setSession(j, j.lab.slug); /* after adoptSession, which stores the bare token */
        try { sessionStorage.setItem('labpos_welcome', JSON.stringify({ slug: j.lab.slug, days: j.lab.daysLeft, name: j.lab.name })); } catch (e2) {}
        location.hash = '#/dashboard';
      }).catch(function (ex) {
        btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('.lg-bt').textContent = 'Create my lab — start free trial';
        showErr((ex && ex.message) || 'Could not create the account. Please try again.');
      });
    });
    wireGoogle('suGoogle', 'suGBtn', function (cred) {
      $('loginErr').hidden = true;
      /* anything already typed in the form is used (lab name, Lab ID, username, password, phone); everything else is filled automatically */
      googleSignup(cred, { labName: $('suLab').value.trim(), slug: slugify($('suSlug').value), phone: $('suPhone').value.trim(), username: $('suUser').value.trim(), password: $('suPass').value })
        .catch(function (ex) { showErr((ex && ex.message) || 'Could not create the account. Please try again.'); });
    });
  };

  /* ---------- forgot password / reset password (emailed link) ---------- */
  function shell(mode, inner) {
    document.body.className = 'login-mode';
    document.body.innerHTML = '<div class="login-wrap lg-split">' + brandHtml('login') + '<div class="lg-form">' + bubblesHtml() +
      '<a class="lg-back" href="#/login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Back to sign in</a>' +
      inner + '<p class="login-foot"><span class="lg-secure">' + ic('shield', 13) + 'Reset links expire in 30 minutes and work once</span>Powered by System Optix</p></div></div>';
    wireBrand('login');
  }
  function doneCard(icon, title, msg, btn) {
    return '<div class="login-card lg-card" style="text-align:center"><div class="login-logo lg-sm"><span class="login-mark">' + icon + '</span></div><h2>' + title + '</h2><p class="login-sub" style="margin-bottom:18px">' + msg + '</p>' + (btn || '') + '</div>';
  }
  A.renderForgot = function () {
    shell('forgot',
      '<form class="login-card lg-card" id="fgForm" autocomplete="off">' +
        '<div class="login-logo lg-sm"><span class="login-mark">' + ic('key', 28) + '</span></div>' +
        '<h2>Forgot your password?</h2><p class="login-sub">Enter your Lab ID and username or email. We will email you a link to choose a new password.</p>' +
        '<div class="login-err" id="loginErr" hidden></div>' +
        field('fgLab', 'building', 'Lab ID', { ph: 'e.g. al-shifa', val: lget(LKEY), max: 40, hint: 'Leave empty for the main lab.' }) +
        field('fgId', 'mail', 'Username or email', { ph: 'username or you@example.com', max: 120, focus: true }) +
        '<button class="btn login-signin btn-block" type="submit"><span class="lg-bt">Send reset link</span><span class="lg-ba">' + ic('arrow', 18) + '</span></button>' +
        '<p class="lg-new">Remembered it? <a href="#/login">Sign in</a></p></form>');
    document.getElementById('fgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var lab = document.getElementById('fgLab').value.trim().toLowerCase(), id = document.getElementById('fgId').value.trim();
      if (!id) { showErr('Enter your username or email'); return; }
      var btn = document.querySelector('.login-signin'); btn.disabled = true; btn.classList.add('busy'); btn.querySelector('.lg-bt').textContent = 'Sending…';
      DB.saas('POST', '../auth/forgot', { lab: lab, identifier: id }).then(function (j) {
        document.getElementById('fgForm').outerHTML = doneCard(ic('mail', 28), 'Check your email', esc(j.message || 'If an account exists, a reset link is on its way.') + '<br><span class="muted" style="font-size:12.5px">The link works for 30 minutes.</span>', '<a class="btn login-signin btn-block" href="#/login" style="display:flex;text-decoration:none">Back to sign in</a>');
      }).catch(function (ex) { btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('.lg-bt').textContent = 'Send reset link'; showErr((ex && ex.message) || 'Could not send the email. Please try again.'); });
    });
  };
  A.renderReset = function () {
    var q = {}; (location.hash.split('?')[1] || '').split('&').forEach(function (p) { var i = p.indexOf('='); if (i > 0) { try { q[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch (x) {} } });
    if (!q.token) { shell('reset', doneCard(ic('alert', 28), 'Link not valid', 'This password reset link is incomplete. Please request a new one.', '<a class="btn login-signin btn-block" href="#/forgot" style="display:flex;text-decoration:none">Request a new link</a>')); return; }
    shell('reset',
      '<form class="login-card lg-card" id="rsForm" autocomplete="off">' +
        '<div class="login-logo lg-sm"><span class="login-mark">' + ic('lock', 28) + '</span></div>' +
        '<h2>Choose a new password</h2><p class="login-sub">' + (q.lab ? 'For Lab ID <b>' + esc(q.lab) + '</b>' : 'For your account') + '</p>' +
        '<div class="login-err" id="loginErr" hidden></div>' +
        field('rsPw', 'lock', 'New password', { ph: 'Min 6 characters', type: 'password', pw: true, auto: 'new-password', focus: true, max: 128 }) +
        '<div class="lg-meter" id="rsMeter"><i></i><i></i><i></i><span id="rsMeterT"></span></div>' +
        field('rsPw2', 'lock', 'Confirm new password', { ph: 'Type it again', type: 'password', auto: 'new-password', max: 128 }) +
        '<div class="lg-caps" id="lgCaps" hidden>' + ic('alert', 14) + ' Caps Lock is on</div>' +
        '<button class="btn login-signin btn-block" type="submit"><span class="lg-bt">Save new password</span><span class="lg-ba">' + ic('arrow', 18) + '</span></button></form>');
    wirePw('rsPw');
    document.getElementById('rsPw').addEventListener('input', function () {
      var v = this.value, sc = 0; if (v.length >= 6) sc++; if (v.length >= 9 && /[a-z]/i.test(v) && /\d/.test(v)) sc++; if (v.length >= 11 && /[^a-z0-9]/i.test(v)) sc++;
      document.getElementById('rsMeter').setAttribute('data-s', v ? String(sc) : '0'); document.getElementById('rsMeterT').textContent = !v ? '' : (sc <= 1 ? 'Weak' : (sc === 2 ? 'Good' : 'Strong'));
    });
    document.getElementById('rsForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = document.getElementById('rsPw').value, b = document.getElementById('rsPw2').value;
      if (a.length < 6) { showErr('Password must be at least 6 characters'); return; }
      if (a !== b) { showErr('The two passwords do not match'); return; }
      var btn = document.querySelector('.login-signin'); btn.disabled = true; btn.classList.add('busy'); btn.querySelector('.lg-bt').textContent = 'Saving…';
      DB.saas('POST', '../auth/reset', { token: q.token, password: a }).then(function (j) {
        try { localStorage.removeItem(SKEY); } catch (x) {} /* any old session belongs to the old password */
        if (j.lab) lset(LKEY, j.lab);
        document.getElementById('rsForm').outerHTML = doneCard(ic('check', 28), 'Password changed', 'You can now sign in with your new password' + (j.username ? ' (username: <b>' + esc(j.username) + '</b>)' : '') + '.', '<a class="btn login-signin btn-block" href="#/login" style="display:flex;text-decoration:none">Go to sign in</a>');
      }).catch(function (ex) {
        btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('.lg-bt').textContent = 'Save new password';
        showErr((ex && ex.message) || 'Could not change the password. Please try again.');
      });
    });
  };
})();
