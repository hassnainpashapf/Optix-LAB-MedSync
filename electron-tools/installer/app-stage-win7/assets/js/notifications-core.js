/* Shared notification monitor: current lab cache only, one timer per signed-in shell.
   Dashboard is lazy; observing an alert never acknowledges it or changes its source. */
(function () {
  'use strict';
  var A = window.App;
  if (!A || A.notifications) return;
  var timer = null, identity = '', previous = null, audio = null, unlocked = false;
  var snapshot = { items: [], error: false }, muteKey = 'labpos_notifications_muted';
  function allowed(key) { return A.canPage(key) && (!A.featureOn || A.featureOn(key)); }
  function active() { return !!A.session() && allowed('notifications') && !/^#\/(portal|login|signup|forgot|reset)/.test(location.hash); }
  function muted() { try { return localStorage.getItem(muteKey) === '1'; } catch (e) { return false; } }
  function collect() {
    var items = [];
    if (!active()) return items;
    function add(id, severity, title, detail, href, category) {
      items.push({ id: id, severity: severity, title: title, detail: detail, href: href, category: category });
    }
    if (allowed('results')) {
      DB.all('results').forEach(function (r) {
        if (!r.critical || !r.critical.length || r.criticalAck) return;
        var test = DB.get('tests', r.testId) || {}, invoice = DB.get('invoices', r.invoiceId) || {};
        add('critical:' + r.id, 'critical', 'Unacknowledged critical result',
          (invoice.no || r.invoiceId || 'Report') + ' · ' + (test.name || r.testId || 'Lab result') + ' · ' + r.critical.map(function (c) { return c.name + ': ' + c.value + (c.unit ? ' ' + c.unit : ''); }).join('; '),
          '#/results/ready', 'Results');
      });
    }
    var stockRoute = allowed('inventory') ? '#/inventory/alerts' : (allowed('stock') ? '#/stock/alerts' : '');
    if (stockRoute && A.stockState) {
      A.stockState().rows.forEach(function (r) {
        var name = r.item.name || 'Stock item', id = r.item.id;
        if (r.out) add('stock:out:' + id, 'high', 'Out of stock: ' + name, 'Replenish this item.', stockRoute, 'Stock');
        else if (r.low) add('stock:low:' + id, 'normal', 'Low stock: ' + name, r.onHand + ' ' + (r.item.unit || 'units') + ' remaining; reorder level ' + r.item.reorderLevel + '.', stockRoute, 'Stock');
        var expiryRoute = stockRoute;
        if (r.expired) add('stock:expired:' + id, 'high', 'Expired stock: ' + name, r.expiredQty + ' ' + (r.item.unit || 'units') + ' expired. Review and remove unusable stock.', expiryRoute, 'Stock');
        if (r.soon) add('stock:soon:' + id, 'normal', 'Stock expiring soon: ' + name, r.soonQty + ' ' + (r.item.unit || 'units') + ' within the configured expiry warning window.', expiryRoute, 'Stock');
      });
    }
    // The verification destination displays amounts, so money-hidden roles cannot receive its alerts.
    if (allowed('onlinepay') && !A.hideMoney()) {
      DB.all('onlinepay_claims').forEach(function (c) {
        if (c.status === 'pending') add('claim:' + c.id, 'normal', 'Online payment awaiting verification',
          A.money(c.amount) + ' · ' + (c.patientName || 'Payment claim'), '#/online-payments', 'Payments');
      });
    }
    if (allowed('invoices')) {
      var hide = A.hideMoney();
      DB.all('invoices').forEach(function (inv) {
        if (Number(inv.due) > 0) add('invoice:' + inv.id, 'normal', 'Pending invoice: ' + (inv.no || inv.id),
          hide ? 'Payment pending · amounts hidden for your role.' : A.money(inv.due) + ' outstanding.',
          '#/invoice/' + encodeURIComponent(inv.id), 'Invoices');
      });
    }
    var rank = { critical: 0, high: 1, normal: 2 };
    return items.sort(function (a, b) { return rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id); });
  }
  function contextKey() {
    var s = A.session() || {};
    return JSON.stringify([s.labId, s.lab, s.userId, s.role, s.roleId, s.loginAt,
      A.roleDef ? A.roleDef(s) : null, A.labFeatures]);
  }
  function paint() {
    var bell = document.getElementById('notificationBell'), count = document.getElementById('notificationCount');
    var urgent = snapshot.items.some(function (a) { return a.severity === 'critical' || a.severity === 'high'; });
    var label = snapshot.error ? 'Notifications unavailable — open to retry' : 'Notifications: ' + snapshot.items.length + ' actionable alerts' + (urgent ? ', urgent alerts need attention' : '');
    if (bell) { bell.hidden = !active(); bell.setAttribute('aria-label', label); bell.setAttribute('title', label); }
    if (count) { count.hidden = !snapshot.error && !snapshot.items.length; count.textContent = snapshot.error ? '!' : (snapshot.items.length > 99 ? '99+' : String(snapshot.items.length)); count.className = 'notification-count' + (urgent ? ' urgent' : ''); }
    if (A.paintNotifications && location.hash.split('?')[0] === '#/notifications') A.paintNotifications(snapshot);
  }
  function chirp() {
    if (!unlocked || muted() || !audio || audio.state !== 'running' || document.hidden) return;
    try {
      var oscillator = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.08, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = function () { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(t); oscillator.stop(t + 0.22);
    } catch (e) { /* Audio is optional; visual alerts remain available. */ }
  }
  function refresh(silent) {
    if (!active()) { stop(); paint(); return snapshot; }
    var key = contextKey();
    if (key !== identity) { stop(); identity = key; }
    try {
      var items = collect(), next = Object.create(null), fresh = false;
      items.forEach(function (a) {
        if (a.severity !== 'critical' && a.severity !== 'high') return;
        next[a.id] = true;
        if (previous && !previous[a.id]) fresh = true;
      });
      previous = next;
      snapshot = { items: items, error: false };
      if (fresh && !silent) chirp();
    } catch (e) { snapshot = { items: [], error: true }; }
    paint();
    return snapshot;
  }
  function gesture(e) {
    if (!e.isTrusted || !active()) return;
    if (unlocked && audio && audio.state === 'running') return;
    refresh(true); // anything present before audio activation is the silent baseline
    if (muted()) return;
    try {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audio) audio = new Audio();
      unlocked = true;
      if (audio.state === 'suspended') { var p = audio.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e2) { unlocked = false; }
  }
  function start() {
    if (!active()) { stop(); paint(); return; }
    refresh();
    if (timer !== null) return;
    timer = setInterval(function () { if (!document.hidden) { refresh(); if (active() && timer === null) start(); } }, 15000);
    document.addEventListener('click', gesture);
    document.addEventListener('keydown', gesture);
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null; identity = ''; previous = null; unlocked = false;
    snapshot = { items: [], error: false };
    document.removeEventListener('click', gesture);
    document.removeEventListener('keydown', gesture);
    if (audio) { try { var p = audio.close(); if (p && p.catch) p.catch(function () {}); } catch (e) {} audio = null; }
  }
  function setMuted(value) {
    try { localStorage.setItem(muteKey, value ? '1' : '0'); } catch (e) {}
    refresh(true);
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', function () { if (document.getElementById('notificationBell')) start(); });
  window.addEventListener('storage', function () { if (document.getElementById('notificationBell')) start(); });
  A.notifications = { start: start, stop: stop, refresh: refresh, collect: collect, muted: muted, setMuted: setMuted, allowed: allowed };
})();
