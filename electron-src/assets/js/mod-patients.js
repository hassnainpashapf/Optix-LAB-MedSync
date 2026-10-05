/* LabPOS — Patients module (Agent 7)
   Routes: #/patients (list + search + add) and #/patient/:id (profile + history + edit/delete).
   Depends on: window.DB, window.App (see SPEC.md). Touches no other files. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  function curRole() {
    try {
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      return s && s.role ? s.role : null;
    } catch (e) { return null; }
  }
  function canEdit() {
    var r = curRole();
    return r === 'admin' || r === 'reception';
  }
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var a = parts[0] ? parts[0][0] : '?';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return App.esc((a + b).toUpperCase());
  }
  function patientStats(p) {
    var invs = DB.all('invoices').filter(function (i) { return i.patientId === p.id; });
    var spent = invs.reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var due = invs.reduce(function (s, i) { return s + (+i.due || 0); }, 0);
    invs.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return { visits: invs.length, spent: spent, due: due, invoices: invs };
  }
  function avatarHTML(name, size) {
    var s = size || 44;
    return '<span class="pt-avatar" style="width:' + s + 'px;height:' + s + 'px;font-size:' +
      Math.round(s * 0.38) + 'px">' + initials(name) + '</span>';
  }

  /* ---------- view painter (writes straight into #view; no dependency beyond App.route) ---------- */
  function paint(html, onMount) {
    var v = document.getElementById('view');
    if (!v) return;
    v.innerHTML = html;
    try { window.scrollTo(0, 0); } catch (e) {}
    if (onMount) onMount();
  }
  /* route handlers may be invoked as fn(params) or fn(el, params) — accept both */
  function getParams(a, b) {
    if (b && typeof b === 'object' && b.id) return b;
    if (a && typeof a === 'object' && a.id) return a;
    return {};
  }

  var listQuery = '';

  /* ---------- patient form (add / edit) ---------- */
  function formHTML(p) {
    p = p || {};
    function val(k) { return App.esc(p[k] == null ? '' : p[k]); }
    function sel(v) { return p.gender === v ? ' selected' : ''; }
    return '' +
      '<form id="ptf-form" class="form-grid" novalidate>' +
      '<div class="form-row"><label class="label" for="ptf-name">Full Name *</label>' +
      '<input class="input" id="ptf-name" maxlength="80" placeholder="e.g. Muhammad Ali" value="' + val('name') + '">' +
      '<div class="f-err" id="ptf-e-name"></div></div>' +
      '<div class="form-2col">' +
      '<div class="form-row"><label class="label" for="ptf-age">Age *</label>' +
      '<input class="input" id="ptf-age" type="number" min="1" max="120" placeholder="e.g. 45" value="' + val('age') + '">' +
      '<div class="f-err" id="ptf-e-age"></div></div>' +
      '<div class="form-row"><label class="label" for="ptf-gender">Gender *</label>' +
      '<select class="select" id="ptf-gender">' +
      '<option value="">Select…</option>' +
      '<option value="Male"' + sel('Male') + '>Male</option>' +
      '<option value="Female"' + sel('Female') + '>Female</option>' +
      '<option value="Other"' + sel('Other') + '>Other</option>' +
      '</select><div class="f-err" id="ptf-e-gender"></div></div>' +
      '</div>' +
      '<div class="form-row"><label class="label" for="ptf-phone">Phone</label>' +
      '<input class="input" id="ptf-phone" maxlength="20" placeholder="e.g. 0300-1234567" value="' + val('phone') + '">' +
      '<div class="f-err" id="ptf-e-phone"></div></div>' +
      '<div class="form-row"><label class="label" for="ptf-address">Address</label>' +
      '<textarea class="input" id="ptf-address" rows="2" maxlength="200" placeholder="Street, area, city">' + val('address') + '</textarea></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="ptf-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (p.id ? 'Save Changes' : 'Add Patient') + '</button>' +
      '</div></form>';
  }
  function setErr(id, msg) {
    var e = document.getElementById(id);
    if (e) e.textContent = msg || '';
    var input = e && e.parentElement ? e.parentElement.querySelector('.input,.select') : null;
    if (input) input.classList.toggle('input-invalid', !!msg);
  }
  function bindForm(close, existing, afterSave) {
    var form = document.getElementById('ptf-form');
    if (!form) return;
    document.getElementById('ptf-cancel').addEventListener('click', close);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = document.getElementById('ptf-name').value.trim();
      var ageRaw = document.getElementById('ptf-age').value.trim();
      var gender = document.getElementById('ptf-gender').value;
      var phone = document.getElementById('ptf-phone').value.trim();
      var address = document.getElementById('ptf-address').value.trim();
      var ok = true;
      setErr('ptf-e-name', ''); setErr('ptf-e-age', ''); setErr('ptf-e-gender', ''); setErr('ptf-e-phone', '');
      if (name.length < 2) { setErr('ptf-e-name', 'Please enter the full name.'); ok = false; }
      var age = parseInt(ageRaw, 10);
      if (!ageRaw || isNaN(age) || age < 1 || age > 120) { setErr('ptf-e-age', 'Enter a valid age (1–120).'); ok = false; }
      if (!gender) { setErr('ptf-e-gender', 'Please select gender.'); ok = false; }
      if (phone && !/^[+\d][\d\s\-()]{5,19}$/.test(phone)) { setErr('ptf-e-phone', 'Enter a valid phone number.'); ok = false; }
      if (!ok) return;
      var data = { name: name, age: age, gender: gender, phone: phone, address: address };
      if (existing && existing.id) {
        DB.update('patients', existing.id, data);
        App.toast('Patient details updated.');
      } else {
        data.createdAt = new Date().toISOString();
        DB.insert('patients', data);
        App.toast('Patient added successfully.');
      }
      close();
      if (afterSave) afterSave();
    });
  }
  function openPatientModal(existing, afterSave) {
    // NOTE: App.modal may invoke onOpen synchronously, before it returns the
    // close fn — so bind a lazy wrapper, not the (still undefined) return value.
    var api = {};
    api.close = App.modal(existing ? 'Edit Patient' : 'Add New Patient', formHTML(existing || {}), {
      onOpen: function () { bindForm(function () { api.close(); }, existing, afterSave); }
    });
  }

  /* ---------- delete ---------- */
  function deletePatient(p, afterDelete) {
    var st = patientStats(p);
    if (st.visits > 0) {
      App.toast('Cannot delete: this patient has ' + st.visits + ' invoice(s) on record.', 'err');
      return;
    }
    App.confirm('Delete patient "' + p.name + '" (' + p.id + ')? This cannot be undone.').then(function (yes) {
      if (!yes) return;
      DB.remove('patients', p.id);
      App.toast('Patient deleted.');
      if (afterDelete) afterDelete();
    });
  }

  /* ---------- #/patients : list ---------- */
  function rowHTML(p) {
    var st = patientStats(p);
    var edit = canEdit();
    return '<tr>' +
      '<td><span class="mono">' + App.esc(p.id) + '</span></td>' +
      '<td><a class="pt-name" href="#/patient/' + App.esc(p.id) + '">' + avatarHTML(p.name, 34) +
      '<span><strong>' + App.esc(p.name) + '</strong><small>' + App.esc(p.phone || '—') + '</small></span></a></td>' +
      '<td>' + App.esc(p.age) + ' yrs · ' + App.esc(p.gender) + '</td>' +
      '<td>' + App.esc(p.phone || '—') + '</td>' +
      '<td class="num">' + st.visits + '</td>' +
      '<td class="num">' + App.money(st.spent) + '</td>' +
      '<td class="num">' + (st.due > 0
        ? '<span class="due-amt">' + App.money(st.due) + '</span>'
        : '<span class="muted">—</span>') + '</td>' +
      '<td class="actions">' +
      '<a class="btn btn-ghost btn-sm" href="#/patient/' + App.esc(p.id) + '">View</a>' +
      (edit ? '<button class="btn btn-ghost btn-sm" data-edit="' + App.esc(p.id) + '">Edit</button>' +
        '<button class="btn btn-ghost btn-sm btn-danger-ghost" data-del="' + App.esc(p.id) + '">Delete</button>' : '') +
      '</td></tr>';
  }
  function renderList() {
    var all = DB.all('patients').slice().sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var q = listQuery.trim().toLowerCase();
    var rows = all.filter(function (p) {
      if (!q) return true;
      return (p.name || '').toLowerCase().indexOf(q) > -1 ||
        (p.phone || '').toLowerCase().indexOf(q) > -1 ||
        (p.id || '').toLowerCase().indexOf(q) > -1;
    });
    var withDue = all.filter(function (p) { return patientStats(p).due > 0; }).length;
    var totalDue = all.reduce(function (s, p) { return s + patientStats(p).due; }, 0);
    var edit = canEdit();

    var html = '' +
      '<div class="page-head"><div><h1>Patients</h1><p class="muted">' + all.length + ' registered patients</p></div>' +
      (edit ? '<button class="btn btn-primary" id="pt-add">+ Add Patient</button>' : '') + '</div>' +
      '<div class="stat-grid stat-grid-3">' +
      '<div class="stat"><div class="stat-ic teal">👥</div><div><div class="stat-v">' + all.length + '</div><div class="stat-l">Total Patients</div></div></div>' +
      '<div class="stat"><div class="stat-ic amber">⏳</div><div><div class="stat-v">' + withDue + '</div><div class="stat-l">Patients with Due</div></div></div>' +
      '<div class="stat"><div class="stat-ic red">💰</div><div><div class="stat-v">' + App.money(totalDue) + '</div><div class="stat-l">Total Outstanding</div></div></div>' +
      '</div>' +
      '<div class="card"><div class="card-b">' +
      '<div class="toolbar"><input class="input search" id="pt-search" placeholder="Search by name, phone or patient ID…" value="' + App.esc(listQuery) + '">' +
      '<span class="muted" id="pt-count">' + rows.length + ' shown</span></div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr>' +
      '<th>ID</th><th>Patient</th><th>Age / Gender</th><th>Phone</th><th class="num">Visits</th>' +
      '<th class="num">Total Spent</th><th class="num">Due</th><th></th>' +
      '</tr></thead><tbody id="pt-rows">' +
      (rows.length ? rows.map(rowHTML).join('') : '') +
      '</tbody></table></div>' +
      (rows.length ? '' : App.empty('No patients found. ' + (edit ? 'Click “Add Patient” to register the first one.' : ''))) +
      '</div></div>';

    paint(html, function () {
      var search = document.getElementById('pt-search');
      search.addEventListener('input', function () {
        listQuery = search.value;
        var qq = listQuery.trim().toLowerCase();
        var filtered = all.filter(function (p) {
          if (!qq) return true;
          return (p.name || '').toLowerCase().indexOf(qq) > -1 ||
            (p.phone || '').toLowerCase().indexOf(qq) > -1 ||
            (p.id || '').toLowerCase().indexOf(qq) > -1;
        });
        document.getElementById('pt-rows').innerHTML = filtered.map(rowHTML).join('');
        document.getElementById('pt-count').textContent = filtered.length + ' shown';
        var emptyBox = document.querySelector('#view .empty');
        if (emptyBox) emptyBox.style.display = filtered.length ? 'none' : '';
        bindRowButtons();
      });
      // keep focus + caret at end while typing
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      var addBtn = document.getElementById('pt-add');
      if (addBtn) addBtn.addEventListener('click', function () { openPatientModal(null, renderList); });
      bindRowButtons();
    });

    function bindRowButtons() {
      document.querySelectorAll('#pt-rows [data-edit]').forEach(function (b) {
        b.onclick = function () {
          var p = DB.get('patients', b.getAttribute('data-edit'));
          if (p) openPatientModal(p, renderList);
        };
      });
      document.querySelectorAll('#pt-rows [data-del]').forEach(function (b) {
        b.onclick = function () {
          var p = DB.get('patients', b.getAttribute('data-del'));
          if (p) deletePatient(p, renderList);
        };
      });
    }
  }

  /* ---------- #/patient/:id : detail ---------- */
  function renderDetail(a, b) {
    var params = getParams(a, b);
    var p = DB.get('patients', params.id);
    if (!p) { App.toast('Patient not found.', 'err'); App.nav('#/patients'); return; }
    var st = patientStats(p);
    var edit = canEdit();

    var invRows = st.invoices.map(function (inv) {
      var testNames = (inv.items || []).map(function (it) { return it.name || it.code; }).join(', ');
      return '<tr>' +
        '<td><a class="link" href="#/invoice/' + App.esc(inv.id) + '"><span class="mono">' + App.esc(inv.no || inv.id) + '</span></a></td>' +
        '<td>' + App.d(inv.createdAt) + '</td>' +
        '<td class="tests-cell">' + App.esc(testNames || '—') + '</td>' +
        '<td class="num">' + App.money(inv.total) + '</td>' +
        '<td class="num">' + App.money(inv.paid) + '</td>' +
        '<td class="num">' + ((+inv.due || 0) > 0 ? '<span class="due-amt">' + App.money(inv.due) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td>' + App.badge(inv.status) + '</td>' +
        '<td class="actions"><a class="btn btn-ghost btn-sm" href="#/invoice/' + App.esc(inv.id) + '">View</a></td></tr>';
    }).join('');

    var html = '' +
      '<div class="page-head"><div><a class="back-link" href="#/patients">← All Patients</a><h1>Patient Profile</h1></div>' +
      (edit ? '<div class="head-actions"><button class="btn btn-ghost" id="pt-edit">Edit Details</button>' +
        '<button class="btn btn-danger" id="pt-del">Delete</button></div>' : '') + '</div>' +

      '<div class="card pt-profile"><div class="card-b pt-profile-in">' +
      avatarHTML(p.name, 72) +
      '<div class="pt-id-block"><h2>' + App.esc(p.name) + ' <span class="badge b-id mono">' + App.esc(p.id) + '</span></h2>' +
      '<div class="pt-meta">' +
      '<span>🎂 ' + App.esc(p.age) + ' years</span><span>⚧ ' + App.esc(p.gender) + '</span>' +
      '<span>📞 ' + App.esc(p.phone || '—') + '</span>' +
      (p.address ? '<span>📍 ' + App.esc(p.address) + '</span>' : '') +
      '<span>🗓 Registered ' + App.d(p.createdAt) + '</span>' +
      '</div></div></div></div>' +

      '<div class="stat-grid stat-grid-3">' +
      '<div class="stat"><div class="stat-ic blue">🧾</div><div><div class="stat-v">' + st.visits + '</div><div class="stat-l">Total Visits</div></div></div>' +
      '<div class="stat"><div class="stat-ic teal">💳</div><div><div class="stat-v">' + App.money(st.spent) + '</div><div class="stat-l">Total Spent</div></div></div>' +
      '<div class="stat"><div class="stat-ic ' + (st.due > 0 ? 'red' : 'green') + '">⏳</div><div><div class="stat-v">' + App.money(st.due) + '</div><div class="stat-l">Outstanding Due</div></div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h3>Invoice History</h3><span class="muted">' + st.visits + ' invoice(s)</span></div>' +
      '<div class="card-b">' +
      (st.invoices.length
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Invoice No</th><th>Date</th><th>Tests</th>' +
          '<th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th><th></th></tr></thead>' +
          '<tbody>' + invRows + '</tbody></table></div>'
        : App.empty('No invoices yet for this patient.')) +
      '</div></div>';

    paint(html, function () {
      if (!edit) return;
      document.getElementById('pt-edit').addEventListener('click', function () {
        openPatientModal(p, function () { renderDetail({ id: p.id }); });
      });
      document.getElementById('pt-del').addEventListener('click', function () {
        deletePatient(p, function () { App.nav('#/patients'); });
      });
    });
  }

  /* ---------- route registration ---------- */
  App.route('/patients', renderList);
  App.route('/patient/:id', renderDetail);
})();
