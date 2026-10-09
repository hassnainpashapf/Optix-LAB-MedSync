/* Lazy notifications dashboard; shared monitor owns refresh/audio lifecycle. */
(function () {
  'use strict';
  var A = window.App, N = A.notifications;
  function paint(state) {
    var host = document.getElementById('notificationList');
    if (!host) return;
    if (!N.allowed('notifications')) { host.innerHTML = A.empty('You do not have access to notifications.'); return; }
    var mute = document.getElementById('notificationMute');
    if (mute) { mute.textContent = N.muted() ? 'Unmute alert sound' : 'Mute alert sound'; mute.setAttribute('aria-pressed', String(N.muted())); }
    if (state.error) { host.innerHTML = A.empty('Could not read alerts. Refresh to retry.'); return; }
    if (!state.items.length) { host.innerHTML = A.empty('All caught up. No actionable alerts for your role.'); return; }
    host.innerHTML = '<p class="muted" style="font-size:12px">' + state.items.length + ' messages · urgent items appear first</p><div class="notif-feed">' + state.items.map(function (a) {
      var urgent = a.severity === 'critical' || a.severity === 'high';
      return '<article class="notif-msg ' + (urgent ? 'is-urgent' : '') + '">' +
        '<div class="notif-msg-meta"><b>' + A.esc(a.category) + '</b><span class="badge ' + (urgent ? 'b-unpaid' : 'b-pending') + '">' + A.esc(a.severity === 'normal' ? 'Attention' : a.severity.toUpperCase()) + '</span></div>' +
        '<h3>' + A.esc(a.title) + '</h3><p>' + A.esc(a.detail) + '</p>' +
        '<a class="btn btn-sm btn-secondary" href="' + A.esc(a.href) + '">Open ' + A.esc(a.category.toLowerCase()) + '</a>' +
        (a.category === 'Results' ? ' <button class="btn btn-sm btn-danger" data-notification-ack="' + A.esc(a.id.slice(9)) + '">Acknowledge after informing doctor</button>' : '') + '</article>';
    }).join('') + '</div>';
  }
  A.paintNotifications = paint;
  A.route('#/notifications', function () {
    var view = document.getElementById('view');
    if (!N || !N.allowed('notifications')) { view.innerHTML = A.empty('You do not have access to notifications.'); return; }
    view.innerHTML = '<div class="card"><div class="card-b"><h2>Notifications</h2>' +
      '<p class="muted">Messages from your lab, with alert sounds retained for new critical or high-priority items.</p>' +
      '<div class="actions"><button class="btn btn-secondary" id="notificationRefresh">Refresh</button> ' +
      '<button class="btn btn-ghost" id="notificationMute" aria-pressed="false">Mute alert sound</button></div>' +
      '<div id="notificationList"></div></div></div>';
    view.querySelector('#notificationRefresh').addEventListener('click', function () { N.refresh(); });
    view.querySelector('#notificationMute').addEventListener('click', function () { N.setMuted(!N.muted()); });
    view.querySelector('#notificationList').addEventListener('click', function (e) {
      var button = e.target.closest('[data-notification-ack]');
      if (!button || !N.allowed('results') || !N.allowed('notifications')) return;
      var id = button.getAttribute('data-notification-ack');
      var sessionKey = JSON.stringify(A.session());
      var result = DB.get('results', id);
      if (!result || !result.critical || !result.critical.length || result.criticalAck) { N.refresh(); return; }
      A.confirm('Have you informed the doctor about this critical result?').then(function (yes) {
        if (!yes || JSON.stringify(A.session()) !== sessionKey || !N.allowed('results') || !N.allowed('notifications') || location.hash !== '#/notifications') return;
        var current = DB.get('results', id);
        if (!current || current.criticalAck || current.reportedAt !== result.reportedAt) { N.refresh(); return; }
        try { DB.update('results', id, { criticalAck: { by: A.session().name || 'user', at: new Date().toISOString() } }); N.refresh(); }
        catch (err) { A.toast('Could not acknowledge the result. Please retry.', 'err'); }
      });
    });
    N.refresh();
  });
})();
