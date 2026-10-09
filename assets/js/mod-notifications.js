/* Lazy notification dashboard; all source permissions and lifecycle live in notifications-core. */
(function () {
  'use strict';
  App.renderNotifications = function (alerts) {
    var view = document.getElementById('view');
    if (!view || (location.hash || '').split('?')[0] !== '#/notifications') return;
    var s = App.session();
    if (!s || !App.can('notifications', s.role)) { view.innerHTML = ''; return; }
    var high = alerts.filter(function (a) { return a.severity === 'high' || a.severity === 'critical'; }).length;
    var muted = App.notifications.isMuted();
    var html = '<div class="card"><div class="card-h" style="flex-wrap:wrap;gap:12px"><div><h3>Notifications</h3>' +
      '<p class="muted" style="margin:6px 0 0">' + alerts.length + ' actionable alerts · ' + high + ' critical / high priority</p></div>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-notification-mute aria-pressed="' + muted + '">' + (muted ? 'Unmute alert sounds' : 'Mute alert sounds') + '</button></div>' +
      '<div class="card-b"><p class="muted" style="margin-top:0;font-size:12px">' + (muted ? 'Alert sounds are muted on this device.' : 'Sounds play only for new critical or high-priority alerts after you interact with this app. Browser audio settings apply.') +
      ' Alerts update while the app is open; existing alerts are silent.</p>' +
      (alerts.length ? '<ul style="list-style:none;padding:0;margin:0">' + alerts.map(function (a) {
        return '<li style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 0;border-bottom:1px solid var(--line)">' +
          '<span class="badge ' + (a.severity === 'warning' ? 'b-pending' : 'b-unpaid') + '">' + App.esc(a.severity) + '</span>' +
          '<div style="flex:1;min-width:180px;overflow-wrap:anywhere"><b>' + App.esc(a.title) + '</b><div class="muted" style="margin-top:4px">' + App.esc(a.detail) + '</div></div>' +
          '<a class="btn btn-sm btn-ghost" href="' + App.esc(a.href) + '">' + App.esc(a.action) + ' →</a></li>';
      }).join('') + '</ul>' : App.empty('All clear — no actionable alerts for your role.')) + '</div></div>';
    if (view.__notificationHtml !== html || !view.querySelector('[data-notification-mute]')) {
      view.innerHTML = html; view.__notificationHtml = html;
    }
  };
  App.route('#/notifications', function () { App.notifications.start(); });
})();
