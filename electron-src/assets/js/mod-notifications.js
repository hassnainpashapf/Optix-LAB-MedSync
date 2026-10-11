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
    function timestamp(v) {
      if (!v || isNaN(new Date(v).getTime())) return '';
      return App.esc(App.dt(v));
    }
    var html = '<style>' +
      '.notification-list{display:flex;flex-direction:column}' +
      '.notification-row{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);min-width:0}' +
      '.notification-row:last-child{border-bottom:0}' +
      '.notification-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8;flex:none;margin:7px 2px 0 2px}' +
      '.notification-row.is-urgent .notification-dot{background:#dc2626;box-shadow:0 0 0 3px #fdecec}' +
      '.notification-main{min-width:0;flex:1}.notification-line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
      '.notification-title{font-size:13.5px;font-weight:700;color:var(--ink);overflow-wrap:anywhere}' +
      '.notification-meta{font-size:11.5px;color:var(--muted);white-space:nowrap}' +
      '.notification-detail{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}' +
      '.notification-action{flex:none;align-self:center;font-size:12px;font-weight:700;color:#1d4ed8;white-space:nowrap}' +
      '.notification-priority{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#b91c1c;background:#fdecec;border-radius:999px;padding:2px 7px;white-space:nowrap}' +
      '@media(max-width:640px){.notification-row{gap:8px}.notification-action{font-size:11.5px;white-space:normal;text-align:right;max-width:92px}}' +
      '</style>' +
      '<div class="card"><div class="card-h" style="flex-wrap:wrap;gap:12px"><div><h3>Notifications</h3>' +
      '<p class="muted" style="margin:4px 0 0">' + alerts.length + ' actionable alerts · ' + high + ' critical / high priority</p></div>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-notification-mute aria-pressed="' + muted + '" style="margin-left:auto">' + (muted ? 'Unmute alert sounds' : 'Mute alert sounds') + '</button></div>' +
      '<div class="card-b"><p class="muted" style="margin:0 0 8px;font-size:12px">' + (muted ? 'Alert sounds are muted on this device.' : 'Sounds play only for new critical or high-priority alerts after you interact with this app. Browser audio settings apply.') +
      ' Alerts update while the app is open; existing alerts are silent.</p>' +
      (alerts.length ? '<div class="notification-list" role="list">' + alerts.map(function (a) {
        var urgent = a.severity === 'warning' ? false : true;
        var time = timestamp(a.timestamp);
        return '<div class="notification-row' + (urgent ? ' is-urgent' : '') + '" role="listitem" aria-label="' + App.esc((urgent ? 'High priority, ' : '') + 'Action required: ' + a.title) + '">' +
          '<span class="notification-dot" aria-hidden="true"></span>' +
          '<div class="notification-main"><div class="notification-line"><span class="notification-title">' + App.esc(a.title) + '</span>' +
          (urgent ? '<span class="notification-priority">High priority</span>' : '<span class="notification-meta">Action required</span>') +
          (time ? '<span class="notification-meta">' + time + '</span>' : '') + '</div>' +
          '<div class="notification-detail">' + App.esc(a.detail) + '</div></div>' +
          '<a class="notification-action" href="' + App.esc(a.href) + '">' + App.esc(a.action) + ' &rarr;</a></div>';
      }).join('') + '</div>' : App.empty('All clear — no actionable alerts for your role.')) + '</div></div>';
    if (view.__notificationHtml !== html || !view.querySelector('[data-notification-mute]')) {
      view.innerHTML = html; view.__notificationHtml = html;
    }
  };
  App.route('#/notifications', function () { App.notifications.start(); });
})();
