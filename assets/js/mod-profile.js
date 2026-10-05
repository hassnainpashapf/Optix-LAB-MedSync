/* Optix LAB MedSync — Profile module (#/profile)
   Personal account settings: photo, name, username, email, phone, address, password. */
(function () {
  'use strict';

  var SKEY = 'labpos_session';
  var PHOTO_MAX = 192; /* max dimension for stored profile photo */

  function val(id) {
    var e = document.getElementById(id);
    return e ? e.value.trim() : '';
  }

  function renderPhoto(preview, photo, name) {
    if (photo) {
      preview.innerHTML = '<img src="' + photo + '" alt="">';
    } else {
      preview.innerHTML = '<span>' + App.esc((name || 'U').charAt(0).toUpperCase()) + '</span>';
    }
  }

  function handlePhotoFile(file, cb) {
    if (!file || !/^image\//.test(file.type)) { App.toast('Please choose an image file', 'err'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, PHOTO_MAX / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        cb(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { App.toast('Could not read that image', 'err'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function render() {
    var view = document.getElementById('view');
    var s = App.session();
    if (!s) return;
    var u = null;
    try { u = DB.get('users', s.userId); } catch (e) {}
    if (!u) {
      view.innerHTML = '<div class="card"><div class="card-b">User not found.</div></div>';
      return;
    }

    var photo = u.photo || '';
    var photoDirty = false;

    view.innerHTML =
    '<style>' +
    '.pf-wrap{max-width:760px;margin:0 auto}' +
    '.pf-head{margin-bottom:18px}' +
    '.pf-head h2{font-size:24px;letter-spacing:-.02em;color:#131845;margin:0 0 6px}' +
    '.pf-head p{color:var(--muted);margin:0;font-size:14px}' +
    '.pf-card{margin-bottom:18px}' +
    '.pf-photo-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap}' +
    '.pf-photo{width:88px;height:88px;border-radius:50%;background:var(--brand-grad);color:#fff;display:grid;place-items:center;font-size:32px;font-weight:800;overflow:hidden;flex:none;box-shadow:0 4px 14px rgba(13,148,136,.3)}' +
    '.pf-photo img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.pf-photo-btns{display:flex;gap:10px;flex-wrap:wrap}' +
    '.pf-sec-t{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 4px}' +
    '.pf-actions{margin-top:4px;display:flex;gap:10px}' +
    '</style>' +

    '<div class="pf-wrap">' +
    '<div class="pf-head"><h2>Profile Settings</h2><p>Manage your personal account details. Changes apply to your login immediately.</p></div>' +

    '<div class="card pf-card"><div class="card-h"><h3>Account</h3></div><div class="card-b">' +
      '<div class="pf-photo-row">' +
        '<div class="pf-photo" id="pfPhoto"></div>' +
        '<div class="pf-photo-btns">' +
          '<button class="btn btn-sm btn-ghost" id="pfUploadBtn" type="button">Upload photo</button>' +
          '<button class="btn btn-sm btn-ghost" id="pfRemoveBtn" type="button">Remove</button>' +
          '<input type="file" id="pfFile" accept="image/*" hidden>' +
        '</div>' +
      '</div>' +
      '<div class="form-grid" style="margin-top:16px">' +
        '<div class="form-2col">' +
          '<div class="form-row"><label class="label" for="pfName">Full Name *</label>' +
          '<input class="input" id="pfName" maxlength="60" value="' + App.esc(u.name || '') + '"></div>' +
          '<div class="form-row"><label class="label" for="pfUsername">Username *</label>' +
          '<input class="input" id="pfUsername" maxlength="40" value="' + App.esc(u.username || '') + '"></div>' +
        '</div>' +
        '<div class="form-2col">' +
          '<div class="form-row"><label class="label" for="pfEmail">Email</label>' +
          '<input class="input" id="pfEmail" type="email" maxlength="80" placeholder="you@example.com" value="' + App.esc(u.email || '') + '"></div>' +
          '<div class="form-row"><label class="label" for="pfPhone">Phone</label>' +
          '<input class="input" id="pfPhone" type="tel" maxlength="20" placeholder="03xx-xxxxxxx" value="' + App.esc(u.phone || '') + '"></div>' +
        '</div>' +
        '<div class="form-row"><label class="label" for="pfAddress">Address</label>' +
        '<input class="input" id="pfAddress" maxlength="120" placeholder="Street, area, city" value="' + App.esc(u.address || '') + '"></div>' +
      '</div>' +
    '</div></div>' +

    '<div class="card pf-card"><div class="card-h"><h3>Change Password</h3></div><div class="card-b">' +
      '<p class="pf-sec-t">Leave blank to keep your current password</p>' +
      '<div class="form-grid" style="margin-top:10px">' +
        '<div class="form-row"><label class="label" for="pfCurPw">Current Password</label>' +
        '<input class="input" id="pfCurPw" type="password" autocomplete="current-password"></div>' +
        '<div class="form-2col">' +
          '<div class="form-row"><label class="label" for="pfNewPw">New Password</label>' +
          '<input class="input" id="pfNewPw" type="password" autocomplete="new-password"></div>' +
          '<div class="form-row"><label class="label" for="pfCfmPw">Confirm New Password</label>' +
          '<input class="input" id="pfCfmPw" type="password" autocomplete="new-password"></div>' +
        '</div>' +
      '</div>' +
    '</div></div>' +

    '<div class="pf-actions"><button class="btn btn-primary" id="pfSave" type="button">Save Changes</button></div>' +
    '</div>';

    var preview = document.getElementById('pfPhoto');
    renderPhoto(preview, photo, u.name);

    document.getElementById('pfUploadBtn').addEventListener('click', function () {
      document.getElementById('pfFile').click();
    });
    document.getElementById('pfFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      handlePhotoFile(f, function (dataUrl) {
        photo = dataUrl; photoDirty = true;
        renderPhoto(preview, photo, val('pfName'));
        App.toast('Photo ready — press Save Changes');
      });
      e.target.value = '';
    });
    document.getElementById('pfRemoveBtn').addEventListener('click', function () {
      photo = ''; photoDirty = true;
      renderPhoto(preview, photo, val('pfName'));
    });

    document.getElementById('pfSave').addEventListener('click', function () {
      var name = val('pfName'), username = val('pfUsername');
      var email = val('pfEmail'), phone = val('pfPhone'), address = val('pfAddress');
      var curPw = val('pfCurPw'), newPw = val('pfNewPw'), cfmPw = val('pfCfmPw');

      if (!name) { App.toast('Full name is required', 'err'); return; }
      if (!username) { App.toast('Username is required', 'err'); return; }
      /* username must stay unique */
      var clash = DB.all('users').some(function (x) {
        return x.id !== u.id && String(x.username || '').toLowerCase() === username.toLowerCase();
      });
      if (clash) { App.toast('That username is already taken', 'err'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { App.toast('Please enter a valid email', 'err'); return; }

      var patch = { name: name, username: username, email: email, phone: phone, address: address };
      if (photoDirty) patch.photo = photo || null;

      if (curPw || newPw || cfmPw) {
        if (!curPw || !newPw || !cfmPw) { App.toast('Fill all three password fields to change your password', 'err'); return; }
        if (curPw !== u.password) { App.toast('Current password is incorrect', 'err'); return; }
        if (newPw.length < 4) { App.toast('New password must be at least 4 characters', 'err'); return; }
        if (newPw !== cfmPw) { App.toast('New passwords do not match', 'err'); return; }
        patch.password = newPw;
      }

      var saved = DB.update('users', u.id, patch);
      if (!saved) { App.toast('Could not save changes', 'err'); return; }

      /* keep the header/menu in sync with the new name */
      try {
        var sess = App.session() || {};
        sess.name = saved.name;
        localStorage.setItem(SKEY, JSON.stringify(sess));
      } catch (e) {}

      App.toast(patch.password ? 'Profile and password updated' : 'Profile updated');
      App.nav('#/profile'); /* re-render shell (avatar/menu) + view */
    });
  }

  App.route('/profile', render);
})();
