/* ============================================================
   LabPOS Cloud — Superadmin Console
   Manages lab installations: registry, version rollout, changelog.
   API contract:
     GET  /api/labs              -> [{labId,name,version,lastSeen,platform,targetVersion}]
     POST /api/labs/:id/target   -> {version}  (sets target version for a lab)
     GET  /api/version           -> {latest,minRequired,bundleUrl,changelog}
   Auth: X-Superadmin-Key header. Base URL: window.SUPERADMIN_API || same-origin.
   ============================================================ */
(function () {
'use strict';

var API = String(window.SUPERADMIN_API || '').replace(/\/+$/, '');
var KEY_NAME = 'sa_key';
var ONLINE_MS = 15 * 60 * 1000;
var REFRESH_MS = 30000;

var state = {
  key: null,
  loggedIn: false,
  labs: [],
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

/* ---------------- views ---------------- */

function renderLogin() {
  $('root').innerHTML =
    '<div class="login-wrap"><div class="login-card">' +
    '<div class="brand-row"><div class="brand-ico">' + IC.cloud + '</div>' +
    '<div><div class="brand-name">LabPOS Cloud</div><div class="brand-sub">SUPERADMIN CONSOLE</div></div></div>' +
    '<h2>Welcome back</h2>' +
    '<p class="lede">Enter your superadmin key to manage lab installations, roll out updates and view the release changelog.</p>' +
    (state.loginError ? '<div class="login-err">' + esc(state.loginError) + '</div>' : '') +
    '<label class="label" for="keyInput">Superadmin key</label>' +
    '<input class="input" id="keyInput" type="password" placeholder="Paste your key here" autocomplete="off" spellcheck="false">' +
    '<button class="btn btn-primary btn-block" id="loginBtn">Sign in</button>' +
    '<div class="login-div"><span>or</span></div>' +
    '<a class="btn btn-ghost btn-block" href="https://labpos.pages.dev/">LabPOS Admin Login</a>' +
    '<p class="login-hint">The key is stored only in this tab (session storage) and sent as the X-Superadmin-Key header.</p>' +
    '</div></div>';

  var input = $('keyInput');
  input.focus();
  function submit() {
    var k = input.value.trim();
    if (!k) {
      state.loginError = 'Please paste your superadmin key.';
      renderLogin();
      return;
    }
    state.key = k;
    state.loginError = '';
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = 'Signing in…';
    api('/api/labs').then(function () {
      setStoredKey(k);
      state.loggedIn = true;
      startAutoRefresh();
      loadData(false);
    }).catch(function (err) {
      state.key = null;
      if (err && err.network) {
        state.loginError = 'Cannot reach the API server. Check that the backend is running and try again.';
      } else {
        state.loginError = 'Invalid superadmin key. Please check the key and try again.';
      }
      renderLogin();
    });
  }
  $('loginBtn').addEventListener('click', submit);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
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
  var labs = state.labs;
  var online = labs.filter(isOnline).length;
  var latest = state.version && state.version.latest;
  var upToDate = latest ? labs.filter(function (l) { return l.version === latest; }).length : 0;

  var stats =
    statCard(IC.lab, 'blue', 'Total Labs', String(labs.length), 'registered installations') +
    statCard(IC.wifi, 'green', 'Online Now', String(online), 'seen in the last 15 min') +
    statCard(IC.tag, 'brand', 'Latest Release', '<span class="ver">' + esc(latest || '—') + '</span>', 'min required: ' + (state.version && state.version.minRequired ? state.version.minRequired : '—')) +
    statCard(IC.check, 'amber', 'Up to Date', String(upToDate), 'of ' + labs.length + ' labs on latest');

  $('root').innerHTML =
    '<header class="topbar">' +
    '<div class="tb-brand"><div class="brand-ico">' + IC.cloud + '</div><span class="t">LabPOS Cloud</span> <span class="badge b-blue">SUPERADMIN</span></div>' +
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
      releaseCardHtml() +
      changelogCardHtml()) +
    '</main>';

  $('logoutBtn').addEventListener('click', function () { logout(false); });
  $('refreshBtn').addEventListener('click', function () { loadData(false); });

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
  state.loginError = expired ? 'Session expired or key rejected. Please sign in again.' : '';
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
  if (k) {
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
