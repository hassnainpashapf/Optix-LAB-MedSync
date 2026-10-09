/* In-app alerts. One controller survives shell replacements; no OS permissions or network writes. */
(function () {
  'use strict';
  if (App.notifications) return;
  var timer = null, scope = '', seen = Object.create(null), baseline = false, alerts = [], audio = null;
  var muteKey = 'labpos_notifications_muted', muted = false, active = false;
  try { muted = localStorage.getItem(muteKey) === '1'; } catch (e) {}
  function allowed(key) { return App.canPage(key) && (!App.featureOn || App.featureOn(key)); }
  function permissions() {
    var s = App.session();
    if (!s || !App.can('notifications', s.role)) return null;
    if ((!DB.isCloud || !DB.isCloud()) && DB.currentLabId && DB.currentLabId() !== s.labId) return null;
    return { session: s, critical: ['admin', 'technician'].indexOf(s.role) !== -1 && allowed('results'),
      stock: allowed('stock'), payments: allowed('onlinepay') && !App.hideMoney() };
  }
  function collect(p) {
    p = p || permissions();
    if (!p) return [];
    var out = [], ids = Object.create(null);
    function add(a) { if (!ids[a.id]) { ids[a.id] = true; out.push(a); } }
    if (p.critical) (DB.all('results') || []).forEach(function (r) {
      if (!r.id || !Array.isArray(r.critical) || !r.critical.length || r.criticalAck) return;
      var test = DB.get('tests', r.testId) || {};
      add({ id: 'critical:' + r.id, severity: 'critical', title: 'Critical lab result',
        detail: 'Result ' + r.id + ' · ' + (test.name || r.testId || 'Lab test') + ' · ' + r.critical.map(function (c) { return c.name + ': ' + c.value + (c.unit ? ' ' + c.unit : ''); }).join('; '),
        href: allowed('dashboard') ? '#/dashboard' : '#/results/ready', action: allowed('dashboard') ? 'Review & acknowledge' : 'Review results',
        signature: 'critical:' + r.id + ':' + (r.reportedAt || '') + ':' + JSON.stringify(r.critical) });
    });
    if (p.stock && App.stockState) (App.stockState().rows || []).forEach(function (r) {
      if (!r.item || !r.item.id || r.item.active === false || !(r.out || r.low || r.expired || r.soon)) return;
      var bits = [];
      if (r.out) bits.push('Out of stock'); else if (r.low) bits.push('Low stock');
      if (r.expired) bits.push('Expired stock');
      if (r.soon) bits.push('Expiring soon');
      add({ id: 'stock:' + r.item.id, severity: r.out || r.expired ? 'high' : 'warning', title: r.item.name || 'Stock item',
        detail: bits.join(' · '), href: '#/stock/alerts', action: 'Review stock',
        signature: 'stock:' + r.item.id + ':' + !!r.out + ':' + !!r.expired });
    });
    if (p.payments) (DB.all('onlinepay_claims') || []).forEach(function (c) {
      if (!c.id || c.status !== 'pending') return;
      add({ id: 'payment:' + c.id, severity: 'warning', title: 'Payment claim awaiting verification',
        detail: 'Claim ' + c.id + ' · ' + App.money(c.amount), href: '#/online-payments', action: 'Review payment', signature: 'payment:' + c.id });
    });
    var rank = { critical: 0, high: 1, warning: 2 };
    return out.sort(function (a, b) { return rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id); });
  }
  function urgent(a) { return a.severity === 'critical' || a.severity === 'high'; }
  function paint() {
    var b = document.getElementById('notificationBell'), count = document.getElementById('notificationCount');
    if (b) {
      b.classList.toggle('has-urgent', alerts.some(urgent));
      b.setAttribute('aria-label', 'Notifications: ' + alerts.length + ' actionable alert' + (alerts.length === 1 ? '' : 's'));
      b.title = alerts.length + ' actionable alert' + (alerts.length === 1 ? '' : 's');
    }
    if (count) { count.hidden = !alerts.length; count.textContent = alerts.length > 99 ? '99+' : String(alerts.length); }
    if (App.renderNotifications && (location.hash || '').split('?')[0] === '#/notifications') App.renderNotifications(alerts);
  }
  function unlock(e) {
    if (!active || muted || !e || !e.isTrusted || !permissions()) return;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!audio) audio = new Ctor();
      if (audio.state === 'suspended') { var pending = audio.resume(); if (pending && pending.catch) pending.catch(function () {}); }
    } catch (err) { /* Browser may block audio; visual alerts remain available. */ }
  }
  function sound() {
    if (muted || !audio || audio.state !== 'running' || document.hidden) return;
    try {
      var osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain); gain.connect(audio.destination);
      osc.onended = function () { osc.disconnect(); gain.disconnect(); };
      osc.start(now); osc.stop(now + 0.32);
    } catch (e) { /* No retries/queued sounds after autoplay failure. */ }
  }
  function refresh() {
    if (!active) return;
    var p = permissions();
    if (!p || /^#\/(portal|login|signup|forgot|reset)/.test(location.hash || '')) { stop(); return; }
    var key = [p.session.labId, p.session.userId, p.session.role, p.session.roleId || '', p.critical, p.stock, p.payments].join('|');
    if (key !== scope) { scope = key; baseline = false; seen = Object.create(null); }
    try { alerts = collect(p); } catch (e) { alerts = []; paint(); return; }
    var fresh = false;
    alerts.filter(urgent).forEach(function (a) { if (baseline && !seen[a.signature]) fresh = true; seen[a.signature] = true; });
    baseline = true;
    // Consume new identities even while muted/blocked: a later gesture must not replay old alerts.
    if (fresh) sound();
    paint();
  }
  function click(e) {
    var button = e.target && e.target.closest ? e.target.closest('[data-notification-mute]') : null;
    if (button) {
      refresh(); muted = !muted;
      try { localStorage.setItem(muteKey, muted ? '1' : '0'); } catch (err) {}
      if (muted && audio) closeAudio();
      paint();
    }
    unlock(e);
  }
  function storage(e) {
    if (e.key === muteKey) { muted = e.newValue === '1'; if (muted) closeAudio(); paint(); }
    else if (e.key === 'labpos_session') stop(); // Another tab changed identity; never reuse its predecessor's data snapshot.
  }
  function closeAudio() {
    var old = audio; audio = null;
    if (old) try { var pending = old.close(); if (pending && pending.catch) pending.catch(function () {}); } catch (e) {}
  }
  function start() {
    if (!permissions()) { stop(); return; }
    if (!active) {
      active = true;
      document.addEventListener('click', click);
      document.addEventListener('keydown', unlock);
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('storage', storage);
      timer = setInterval(function () { if (!document.hidden) refresh(); }, 5000);
    }
    refresh();
  }
  function stop() {
    active = false;
    if (timer !== null) clearInterval(timer);
    timer = null; scope = ''; baseline = false; seen = Object.create(null); alerts = [];
    document.removeEventListener('click', click);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('storage', storage);
    closeAudio();
    paint();
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', function () { if (document.getElementById('notificationBell')) start(); });
  App.notifications = { start: start, stop: stop, refresh: refresh, collect: collect,
    isMuted: function () { return muted; }, soundAvailable: function () { return !!(audio && audio.state === 'running'); } };
})();
