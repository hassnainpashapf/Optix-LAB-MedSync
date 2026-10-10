/* Appointment request review for lab staff. */
(function () {
  'use strict';
  var App = window.App, DB = window.DB, statusFilter = 'requested';
  var labels = {
    requested: 'Requested',
    confirmed: 'Confirmed',
    completed: 'Completed',
    rejected: 'Declined',
    cancelled: 'Cancelled'
  };

  function dateLabel(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return App.esc(value || '—');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function setStatus(id, status) {
    var row = DB.get('appointments', id);
    var allowed = {
      requested: ['confirmed', 'rejected'],
      confirmed: ['completed', 'cancelled']
    };
    if (!row || !allowed[row.status] || allowed[row.status].indexOf(status) < 0) {
      App.toast('This appointment can no longer be updated.', 'err');
      render();
      return;
    }
    DB.update('appointments', id, { status: status });
    App.toast('Appointment marked ' + labels[status].toLowerCase() + '.');
    render();
  }

  function render() {
    var all = (DB.all('appointments') || []).slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) || String(a.timeSlot || '').localeCompare(String(b.timeSlot || ''));
    });
    var counts = { all: all.length, requested: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0 };
    all.forEach(function (a) { if (counts[a.status] !== undefined) counts[a.status]++; });
    var visible = statusFilter === 'all' ? all : all.filter(function (a) { return a.status === statusFilter; });
    var tabs = ['requested', 'confirmed', 'completed', 'rejected', 'cancelled', 'all'].map(function (key) {
      var name = key === 'all' ? 'All' : labels[key];
      return '<button type="button" class="tab' + (statusFilter === key ? ' on' : '') + '" data-appt-filter="' + key + '">' + name + ' (' + counts[key] + ')</button>';
    }).join('');
    var rows = visible.map(function (a) {
      var patient = DB.get('patients', a.patientId), action = '';
      if (a.status === 'requested') {
        action = '<button class="btn btn-sm btn-primary" data-appt-status="confirmed" data-id="' + App.esc(a.id) + '">Confirm</button> ' +
          '<button class="btn btn-sm btn-danger" data-appt-status="rejected" data-id="' + App.esc(a.id) + '">Decline</button>';
      } else if (a.status === 'confirmed') {
        action = '<button class="btn btn-sm btn-primary" data-appt-status="completed" data-id="' + App.esc(a.id) + '">Complete</button> ' +
          '<button class="btn btn-sm btn-danger" data-appt-status="cancelled" data-id="' + App.esc(a.id) + '">Cancel</button>';
      } else action = '<span style="color:var(--muted)">—</span>';
      return '<tr><td><b>' + dateLabel(a.date) + '</b><div style="font-size:12px;color:var(--muted)">' + App.esc(a.timeSlot || '') + '</div></td>' +
        '<td><b>' + App.esc((patient && patient.name) || a.patientName || 'Patient') + '</b><div style="font-size:12px;color:var(--muted)">' + App.esc((patient && (patient.phone || patient.whatsapp)) || '') + '</div></td>' +
        '<td>' + (a.serviceType === 'home-collection' ? 'Home collection' : 'Lab visit') + '</td>' +
        '<td>' + App.esc(a.note || '—') + '</td><td>' + App.esc(labels[a.status] || a.status || '—') + '</td>' +
        '<td style="white-space:nowrap">' + action + '</td></tr>';
    }).join('');
    document.getElementById('view').innerHTML =
      '<div class="kpi-grid" style="margin-bottom:16px">' +
      '<div class="kpi t-navy"><div class="kpi-lb">TOTAL REQUESTS</div><div class="kpi-nm">' + counts.all + '</div></div>' +
      '<div class="kpi t-amber"><div class="kpi-lb">AWAITING REVIEW</div><div class="kpi-nm">' + counts.requested + '</div></div>' +
      '<div class="kpi t-green"><div class="kpi-lb">CONFIRMED</div><div class="kpi-nm">' + counts.confirmed + '</div></div>' +
      '<div class="kpi t-blue"><div class="kpi-lb">COMPLETED</div><div class="kpi-nm">' + counts.completed + '</div></div></div>' +
      '<div class="tabs" style="margin-bottom:16px">' + tabs + '</div>' +
      '<div class="card"><div class="card-b"><div class="tbl-wrap"><table class="table"><thead><tr><th>Date &amp; time</th><th>Patient</th><th>Service</th><th>Note</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">' + App.empty('No appointment requests in this view.') + '</td></tr>') +
      '</tbody></table></div></div></div>';
    var view = document.getElementById('view');
    view.querySelectorAll('[data-appt-filter]').forEach(function (button) {
      button.addEventListener('click', function () { statusFilter = button.getAttribute('data-appt-filter'); render(); });
    });
    view.querySelectorAll('[data-appt-status]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-id'), status = button.getAttribute('data-appt-status');
        if (status === 'rejected' || status === 'cancelled') {
          App.confirm('Are you sure you want to ' + (status === 'rejected' ? 'decline' : 'cancel') + ' this appointment?').then(function (ok) {
            if (ok) setStatus(id, status);
          });
        } else setStatus(id, status);
      });
    });
  }

  App.route('#/appointments', render);
})();
