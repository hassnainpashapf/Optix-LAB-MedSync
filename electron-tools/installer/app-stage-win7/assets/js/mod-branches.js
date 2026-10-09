/* Standalone branch management — desktop lab administrator only. */
(function () {
  'use strict';
  function allowed() { return App.session && App.session() && App.session().role === 'admin'; }
  function render() {
    if (!allowed()) { App.toast('Access denied for your role.', 'err'); App.nav('#/dashboard'); return; }
    var branches = DB.all('branches').slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    var active = branches.filter(function (b) { return b.is_active; }).length;
    var view = document.getElementById('view');
    view.innerHTML = '<div class="page-head"><div><h1>Branches</h1><p class="muted">Manage your lab locations and their contact details.</p></div><button class="btn btn-primary" id="branchAdd">+ Add Branch</button></div>'
       + '<div class="stat-grid"><div class="stat" data-tint="blue"><span class="stat-ico">' + App.icon('grid') + '</span><span class="lb">Total Branches</span><strong class="vl">' + branches.length + '</strong><span class="dl">Registered locations</span></div>'
       + '<div class="stat" data-tint="green"><span class="stat-ico">' + App.icon('check') + '</span><span class="lb">Active</span><strong class="vl">' + active + '</strong><span class="dl">Open locations</span></div>'
       + '<div class="stat" data-tint="brand"><span class="stat-ico">' + App.icon('check') + '</span><span class="lb">Available Slots</span><strong class="vl">Unlimited</strong><span class="dl">No desktop plan limit</span></div>'
       + '<div class="stat" data-tint="red"><span class="stat-ico">' + App.icon('x') + '</span><span class="lb">Inactive Branches</span><strong class="vl">' + (branches.length - active) + '</strong><span class="dl">Not currently operating</span></div></div>'
      + '<div class="card"><div class="card-h"><h3>All Branches</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr><th>Name</th><th>Code</th><th>Address</th><th>Phone</th><th>Manager</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
      + (branches.length ? branches.map(function (b) { return '<tr><td><strong>' + App.esc(b.name) + '</strong></td><td>' + App.esc(b.code || '—') + '</td><td>' + App.esc(b.address || '—') + '</td><td>' + App.esc(b.phone || '—') + '</td><td>' + App.esc(b.manager_name || '—') + '</td><td><span class="badge ' + (b.is_active ? 'b-paid">Active' : 'b-unpaid">Inactive') + '</span></td><td><button class="btn btn-ghost btn-sm" data-edit="' + App.esc(b.id) + '">Edit</button> <button class="btn btn-ghost btn-sm" data-toggle="' + App.esc(b.id) + '">' + (b.is_active ? 'Deactivate' : 'Activate') + '</button> <button class="btn btn-ghost btn-sm" data-delete="' + App.esc(b.id) + '">Delete</button></td></tr>'; }).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px">No branches yet. Add your first branch above.</td></tr>')
      + '</tbody></table></div></div></div>';
    document.getElementById('branchAdd').addEventListener('click', function () { edit(null); });
    view.querySelectorAll('[data-edit]').forEach(function (btn) { btn.addEventListener('click', function () { edit(DB.get('branches', btn.getAttribute('data-edit'))); }); });
    view.querySelectorAll('[data-toggle]').forEach(function (btn) { btn.addEventListener('click', function () {
      var b = DB.get('branches', btn.getAttribute('data-toggle'));
      if (!b || !allowed()) return;
      if (b.is_active && active <= 1) return App.toast('Cannot deactivate the last active branch.', 'err');
      App.confirm((b.is_active ? 'Deactivate' : 'Activate') + ' branch "' + b.name + '"?').then(function (ok) { if (!ok || !allowed()) return; DB.update('branches', b.id, { is_active: !b.is_active }); App.toast('Branch updated.'); render(); });
    }); });
    view.querySelectorAll('[data-delete]').forEach(function (btn) { btn.addEventListener('click', function () {
      var b = DB.get('branches', btn.getAttribute('data-delete'));
      if (!b || !allowed()) return;
      App.confirm('Permanently delete branch "' + b.name + '"? This cannot be undone.').then(function (ok) { if (!ok || !allowed()) return; DB.remove('branches', b.id); App.toast('Branch deleted.'); render(); });
    }); });
  }
  function edit(branch) {
    if (!allowed()) return;
    var b = branch || {};
    App.modal(branch ? 'Edit Branch' : 'Add Branch', '<div class="form-grid">'
      + '<div><label class="label">Branch name *</label><input class="input" id="bfName" maxlength="60" value="' + App.esc(b.name || '') + '"></div>'
      + '<div><label class="label">Branch code</label><input class="input" id="bfCode" maxlength="20" value="' + App.esc(b.code || '') + '"' + (branch ? ' disabled' : '') + '></div>'
      + '<div style="grid-column:1/-1"><label class="label">Address</label><input class="input" id="bfAddr" maxlength="140" value="' + App.esc(b.address || '') + '"></div>'
      + '<div><label class="label">Phone</label><input class="input" id="bfPhone" maxlength="20" value="' + App.esc(b.phone || '') + '"></div>'
      + '<div><label class="label">Manager name</label><input class="input" id="bfMgr" maxlength="60" value="' + App.esc(b.manager_name || '') + '"></div></div>'
      + '<div class="modal-actions"><button class="btn btn-ghost" id="bfCancel">Cancel</button><button class="btn btn-primary" id="bfSave">' + (branch ? 'Save Changes' : 'Add Branch') + '</button></div>', {
      onOpen: function (ov, close) {
        document.getElementById('bfCancel').addEventListener('click', close);
        document.getElementById('bfSave').addEventListener('click', function () {
          if (!allowed()) return;
          var name = document.getElementById('bfName').value.trim(), code = document.getElementById('bfCode').value.trim();
          if (!name) return App.toast('Branch name is required.', 'err');
          if (!branch && code && DB.all('branches').some(function (x) { return String(x.code || '').toLowerCase() === code.toLowerCase(); })) return App.toast('A branch with this code already exists.', 'err');
          var data = { name: name, address: document.getElementById('bfAddr').value.trim(), phone: document.getElementById('bfPhone').value.trim(), manager_name: document.getElementById('bfMgr').value.trim() };
          if (branch) DB.update('branches', branch.id, data);
          else { data.code = code; data.is_active = true; DB.insert('branches', data); }
          close(); App.toast(branch ? 'Branch updated.' : 'Branch added.'); render();
        });
      }
    });
  }
  App.route('#/branches', render);
})();
