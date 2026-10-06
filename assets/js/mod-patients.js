/* Optix LAB MedSync — Patients module (Agent 7)
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

  /* ---------- WhatsApp chat buttons ---------- */
  var WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>';
  var WA_CSS =
    '<style>' +
    '.wa-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#e7f6ec;color:#1da851;border:1px solid #c4e9d1;vertical-align:middle;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,color .15s ease}' +
    '.wa-btn:hover{transform:scale(1.12);box-shadow:0 2px 8px rgba(29,168,81,.35);color:#0f8a41}' +
    '.wa-btn svg{display:block}' +
    '.ptf-phone-wrap{display:flex;align-items:center;gap:8px}' +
    '.ptf-phone-wrap .input{flex:1;min-width:0}' +
    '.ptf-phone-wrap .wa-btn{flex:0 0 auto}' +
    '</style>';
  function waNumber(phone) {
    return App.normWa(phone); /* shared helper (app.js) */
  }
  /* Number a WhatsApp send should go to: dedicated whatsapp field, else phone. */
  function waTarget(p) {
    return (p && (p.whatsapp || p.phone)) || '';
  }
  function waBtn(phone, title) {
    var d = waNumber(phone);
    if (!d) return '';
    return '<a class="wa-btn" href="https://wa.me/' + d + '" target="_blank" rel="noopener" title="' +
      App.esc(title || 'Chat on WhatsApp') + '">' + WA_SVG + '</a>';
  }

  /* ---------- dashboard-style stat cards: shared compact CSS now in app.css ---------- */

  var STAT_CSS = '';

  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var STAT_ICONS = {
    users: svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    userPlus: svgIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>'),
    alert: svgIcon('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    receipt: svgIcon('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/>')
  };

  function statCard(icon, tint, label, value, sub) {
    return '<div class="stat" data-tint="' + tint + '" style="--sc:var(--' + tint + ')">' +
      '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft)">' + icon + '</div>' +
      '<div class="lb">' + App.esc(label) + '</div>' +
      '<div class="vl">' + value + '</div>' +
      '<div class="dl">' + sub + '</div>' +
      '</div>';
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
  function ptUser() {
    try {
      if (window.App && App.session) {
        var as = (typeof App.session === 'function') ? App.session() : App.session;
        if (as && as.name) return as.name;
      }
      var s = JSON.parse(localStorage.getItem('labpos_session') || 'null');
      if (s && s.name) return s.name;
    } catch (e) {}
    return 'system';
  }
  /* Order-tests picker (add mode only): checkbox list of active tests */
  var PTF_TSTYLE =
    '<style>' +
    '.ptf-tlist{max-height:180px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;margin-top:8px;background:#fff}' +
    '.ptf-trow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer;font-size:13px}' +
    '.ptf-trow:last-child{border-bottom:none}' +
    '.ptf-trow:hover{background:#f4f9fd}' +
    '.ptf-tchk{width:16px;height:16px;accent-color:var(--brand);flex:none;cursor:pointer}' +
    '.ptf-tinfo{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ptf-tprice{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.ptf-tsum{font-size:12px;color:var(--muted);font-weight:600;margin-top:6px}' +
    '.ptf-opt{font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0;font-size:10px}' +
    '.ptf-tempty{padding:12px;font-size:12.5px;color:var(--muted);text-align:center}' +
    '</style>';
  function orderTestsHTML() {
    var tests = DB.all('tests').filter(function (t) { return t.active !== false; })
      .sort(function (a, b) { return String(a.code || a.name || '').localeCompare(String(b.code || b.name || '')); });
    var rows = tests.map(function (t) {
      var nm = (t.code ? t.code + ' — ' : '') + (t.name || 'Test');
      return '<label class="ptf-trow" data-tname="' + App.esc(nm.toLowerCase()) + '">' +
        '<input type="checkbox" class="ptf-tchk" value="' + App.esc(t.id) + '" data-price="' + (+t.price || 0) + '">' +
        '<span class="ptf-tinfo"><strong>' + App.esc(nm) + '</strong>' +
        (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') + '</span>' +
        '<span class="ptf-tprice">' + App.money(+t.price || 0) + '</span></label>';
    }).join('');
    return PTF_TSTYLE +
      '<div class="form-row"><label class="label" for="ptf-tsearch">Order Tests <span class="ptf-opt">(optional — sent to Lab Results)</span></label>' +
      '<input class="input" id="ptf-tsearch" placeholder="Search tests…" autocomplete="off">' +
      '<div class="ptf-tlist" id="ptf-tlist">' + (rows || '<div class="ptf-tempty">No active tests found.</div>') + '</div>' +
      '<div class="ptf-tsum" id="ptf-tsum">0 selected • Rs 0</div></div>';
  }
  function formHTML(p) {
    p = p || {};
    function val(k) { return App.esc(p[k] == null ? '' : p[k]); }
    function sel(v) { return p.gender === v ? ' selected' : ''; }
    var bloods = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    var docOpts = '<option value="">Self / Walk-in</option>' +
      DB.all('doctors').slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }).map(function (d) {
        return '<option value="' + App.esc(d.id) + '"' + ((p.doctorId || '') === d.id ? ' selected' : '') + '>' +
          App.esc(d.name) + '</option>';
      }).join('');
    return '' +
      '<form id="ptf-form" class="form-grid" novalidate>' +
      '<div class="form-row" style="grid-column:1/-1">' +
      '<button type="button" class="btn btn-ghost" id="ptf-scan" style="width:auto">📷 Scan CNIC Photo</button>' +
      '<span class="muted" style="font-size:12px;margin-left:8px">Upload a CNIC photo to auto-fill name, CNIC & DOB</span>' +
      '<input type="file" id="ptf-scanfile" accept="image/*" style="display:none">' +
      '<div id="ptf-scanstat" class="muted" style="font-size:12px;margin-top:4px"></div></div>' +
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
      '<div class="form-row"><label class="label" for="ptf-father">Father / Husband Name</label>' +
      '<input class="input" id="ptf-father" maxlength="80" placeholder="e.g. Muhammad Aslam" value="' + val('father') + '"></div>' +
      '<div class="form-2col">' +
      '<div class="form-row"><label class="label" for="ptf-dob">Date of Birth</label>' +
      '<input class="input" id="ptf-dob" type="date" value="' + val('dob') + '"></div>' +
      '<div class="form-row"><label class="label" for="ptf-cnic">CNIC</label>' +
      '<input class="input" id="ptf-cnic" maxlength="15" placeholder="e.g. 35202-1234567-1" value="' + val('cnic') + '"></div>' +
      '</div>' +
      '<div class="form-row"><label class="label" for="ptf-phone">Phone</label>' +
      '<div class="ptf-phone-wrap"><input class="input" id="ptf-phone" maxlength="20" placeholder="e.g. 0300-1234567" value="' + val('phone') + '">' +
      '<span id="ptf-wa">' + waBtn(waTarget(p), 'Chat on WhatsApp') + '</span></div>' +
      '<div class="f-err" id="ptf-e-phone"></div></div>' +
      '<div class="form-row"><label class="label" for="ptf-whatsapp">WhatsApp No.</label>' +
      '<div class="ptf-phone-wrap"><input class="input" id="ptf-whatsapp" maxlength="20" placeholder="03xxxxxxxxx" value="' + val('whatsapp') + '">' +
      '<span id="ptf-wa2">' + waBtn(waTarget(p), 'Chat on WhatsApp') + '</span></div>' +
      '<div class="f-err" id="ptf-e-whatsapp"></div></div>' +
      '<div class="form-2col">' +
      '<div class="form-row"><label class="label" for="ptf-phone2">Alternate Phone</label>' +
      '<input class="input" id="ptf-phone2" maxlength="20" placeholder="e.g. 0321-7654321" value="' + val('phone2') + '"></div>' +
      '<div class="form-row"><label class="label" for="ptf-email">Email</label>' +
      '<input class="input" id="ptf-email" type="email" maxlength="80" placeholder="e.g. name@mail.com" value="' + val('email') + '">' +
      '<div class="f-err" id="ptf-e-email"></div></div>' +
      '</div>' +
      '<div class="form-2col">' +
      '<div class="form-row"><label class="label" for="ptf-city">City</label>' +
      '<input class="input" id="ptf-city" maxlength="60" placeholder="e.g. Lahore" value="' + val('city') + '"></div>' +
      '<div class="form-row"><label class="label" for="ptf-blood">Blood Group</label>' +
      '<select class="select" id="ptf-blood">' +
      bloods.map(function (b) {
        return '<option value="' + b + '"' + ((p.blood || '') === b ? ' selected' : '') + '>' + (b || 'Select…') + '</option>';
      }).join('') +
      '</select></div>' +
      '</div>' +
      '<div class="form-2col">' +
      '<div class="form-row"><label class="label" for="ptf-ecname">Emergency Contact Name</label>' +
      '<input class="input" id="ptf-ecname" maxlength="80" placeholder="e.g. Ayesha Khan" value="' + val('ecName') + '"></div>' +
      '<div class="form-row"><label class="label" for="ptf-ecphone">Emergency Contact Phone</label>' +
      '<input class="input" id="ptf-ecphone" maxlength="20" placeholder="e.g. 0300-1234567" value="' + val('ecPhone') + '"></div>' +
      '</div>' +
      '<div class="form-row"><label class="label" for="ptf-doctor">Referred By</label>' +
      '<select class="select" id="ptf-doctor">' + docOpts + '</select></div>' +
      '<div class="form-row"><label class="label" for="ptf-address">Address</label>' +
      '<textarea class="input" id="ptf-address" rows="2" maxlength="200" placeholder="Street, area, city">' + val('address') + '</textarea></div>' +
      '<div class="form-row"><label class="label" for="ptf-notes">Notes / Medical History</label>' +
      '<textarea class="input" id="ptf-notes" rows="2" maxlength="500" placeholder="Allergies, chronic conditions, remarks…">' + val('notes') + '</textarea></div>' +
      (!p.id ? orderTestsHTML() : '') +
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
    /* CNIC photo scan with OCR */
    var scanBtn = document.getElementById('ptf-scan');
    var scanFile = document.getElementById('ptf-scanfile');
    var scanStat = document.getElementById('ptf-scanstat');
    if (scanBtn && scanFile) {
      scanBtn.addEventListener('click', function () { scanFile.click(); });
      scanFile.addEventListener('change', function () {
        var f = scanFile.files[0];
        if (!f) return;
        if (scanStat) scanStat.textContent = 'Loading OCR engine...';
        /* load Tesseract.js dynamically */
        function runOCR() {
          if (scanStat) scanStat.textContent = 'Scanning CNIC... (this may take 10-20 seconds)';
          var img = new Image();
          img.onload = function () {
            try {
              Tesseract.recognize(img, 'eng').then(function (result) {
                var text = result.data.text || '';
                if (scanStat) scanStat.textContent = 'Processing...';
                /* extract CNIC number (13 digits) */
                var cnicM = text.match(/(\d{5})[-\s]?(\d{7})[-\s]?(\d)/);
                if (cnicM) {
                  var cnic = cnicM[1] + '-' + cnicM[2] + '-' + cnicM[3];
                  var ci = document.getElementById('ptf-cnic');
                  if (ci) ci.value = cnic;
                }
                /* extract DOB (look for date patterns) */
                var dobM = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
                if (dobM) {
                  var dobStr = dobM[3] + '-' + String(dobM[2]).padStart(2, '0') + '-' + String(dobM[1]).padStart(2, '0');
                  var di = document.getElementById('ptf-dob');
                  if (di) {
                    di.value = dobStr;
                    /* calculate age */
                    try {
                      var bd = new Date(dobStr), now = new Date();
                      var age = now.getFullYear() - bd.getFullYear();
                      if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
                      var ai = document.getElementById('ptf-age');
                      if (ai && age > 0 && age < 120) ai.value = age;
                    } catch (e) {}
                  }
                }
                /* extract name (line after "Name" label) */
                var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
                for (var i = 0; i < lines.length; i++) {
                  if (/^name/i.test(lines[i]) && lines[i + 1]) {
                    var nm = lines[i + 1].replace(/[^A-Za-z ]/g, '').trim();
                    if (nm.length > 2) {
                      var ni = document.getElementById('ptf-name');
                      if (ni && !ni.value) ni.value = nm;
                      break;
                    }
                  }
                }
                if (scanStat) scanStat.textContent = '✓ Scan complete. Please verify the filled fields.';
                App.toast('CNIC scanned', 'ok');
              }).catch(function () {
                if (scanStat) scanStat.textContent = 'Scan failed. Please enter manually.';
              });
            } catch (e) {
              if (scanStat) scanStat.textContent = 'Scan failed. Please enter manually.';
            }
          };
          img.src = URL.createObjectURL(f);
        }
        if (typeof Tesseract === 'undefined') {
          var sc = document.createElement('script');
          sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
          sc.onload = runOCR;
          sc.onerror = function () { if (scanStat) scanStat.textContent = 'Could not load OCR. Check internet.'; };
          document.head.appendChild(sc);
        } else runOCR();
      });
    }
    document.getElementById('ptf-cancel').addEventListener('click', close);
    // live-update the WhatsApp button next to the phone field as the user types
    var phoneInput = document.getElementById('ptf-phone');
    var waWrap = document.getElementById('ptf-wa');
    if (phoneInput && waWrap) {
      phoneInput.addEventListener('input', function () {
        waWrap.innerHTML = waBtn(phoneInput.value, 'Chat on WhatsApp');
        checkDuplicate();
      });
    }
    // live-update the WhatsApp button next to the WhatsApp field (falls back to phone)
    var waInput = document.getElementById('ptf-whatsapp');
    var waWrap2 = document.getElementById('ptf-wa2');
    if (waInput && waWrap2) {
      waInput.addEventListener('input', function () {
        waWrap2.innerHTML = waBtn(waInput.value || (phoneInput ? phoneInput.value : ''), 'Chat on WhatsApp');
      });
    }
    // duplicate detection: warn if CNIC or phone matches an existing patient
    var cnicInput = document.getElementById('ptf-cnic');
    var dupWarn = document.createElement('div');
    dupWarn.id = 'ptf-dupwarn';
    dupWarn.style.cssText = 'display:none;margin-top:12px;padding:12px;border:1px solid var(--amber);border-radius:8px;background:var(--amber-soft)';
    if (form) form.insertBefore(dupWarn, form.firstChild);
    function normPhone(p) { return (p || '').replace(/\D/g, '').replace(/^92/, '0'); }
    function checkDuplicate() {
      if (!dupWarn) return;
      var cnic = (cnicInput ? cnicInput.value.trim() : '');
      var phone = normPhone(phoneInput ? phoneInput.value : '');
      var found = null, matchBy = '';
      if (cnic || phone) {
        var all = DB.all('patients');
        for (var i = 0; i < all.length; i++) {
          var p = all[i];
          if (existing && p.id === existing.id) continue;
          if (cnic && p.cnic && p.cnic.replace(/\D/g, '') === cnic.replace(/\D/g, '')) { found = p; matchBy = 'CNIC'; break; }
          if (phone && phone.length >= 10 && p.phone && normPhone(p.phone) === phone) { found = p; matchBy = phone; break; }
        }
      }
      if (found) {
        var invCount = DB.all('invoices').filter(function (inv) { return inv.patientId === found.id; }).length;
        dupWarn.style.display = 'block';
        dupWarn.innerHTML = '<strong>⚠️ Possible duplicate:</strong> ' + App.esc(found.name || '') +
          ' (matched by ' + App.esc(matchBy) + ') already exists with ' + invCount + ' invoice(s). ' +
          '<button type="button" class="btn btn-ghost btn-sm" id="ptf-dupview" style="margin-left:8px">View existing patient</button>';
        var dv = document.getElementById('ptf-dupview');
        if (dv) dv.addEventListener('click', function () { App.nav('#/patients/' + found.id); });
      } else {
        dupWarn.style.display = 'none';
        dupWarn.innerHTML = '';
      }
    }
    if (cnicInput) cnicInput.addEventListener('input', checkDuplicate);
    setTimeout(checkDuplicate, 300);
    // order-tests picker (add mode only): search filter + live selection summary
    var tSearch = document.getElementById('ptf-tsearch');
    var tList = document.getElementById('ptf-tlist');
    var tSum = document.getElementById('ptf-tsum');
    function paintTSum() {
      if (!tList || !tSum) return;
      var n = 0, amt = 0;
      var chks = tList.querySelectorAll('.ptf-tchk:checked');
      for (var i = 0; i < chks.length; i++) { n++; amt += (+chks[i].getAttribute('data-price') || 0); }
      tSum.textContent = n + ' selected • ' + App.money(amt);
    }
    if (tSearch && tList) {
      tSearch.addEventListener('input', function () {
        var q = tSearch.value.trim().toLowerCase();
        var rows = tList.querySelectorAll('.ptf-trow');
        for (var i = 0; i < rows.length; i++) {
          var nm = rows[i].getAttribute('data-tname') || '';
          rows[i].style.display = (!q || nm.indexOf(q) >= 0) ? '' : 'none';
        }
      });
      tList.addEventListener('change', paintTSum);
      paintTSum();
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = document.getElementById('ptf-name').value.trim();
      var ageRaw = document.getElementById('ptf-age').value.trim();
      var gender = document.getElementById('ptf-gender').value;
      var phone = document.getElementById('ptf-phone').value.trim();
      var whatsapp = document.getElementById('ptf-whatsapp').value.trim();
      var address = document.getElementById('ptf-address').value.trim();
      var father = document.getElementById('ptf-father').value.trim();
      var dob = document.getElementById('ptf-dob').value;
      var cnic = document.getElementById('ptf-cnic').value.trim();
      var phone2 = document.getElementById('ptf-phone2').value.trim();
      var email = document.getElementById('ptf-email').value.trim();
      var city = document.getElementById('ptf-city').value.trim();
      var blood = document.getElementById('ptf-blood').value;
      var ecName = document.getElementById('ptf-ecname').value.trim();
      var ecPhone = document.getElementById('ptf-ecphone').value.trim();
      var doctorId = document.getElementById('ptf-doctor').value || null;
      var notes = document.getElementById('ptf-notes').value.trim();
      var ok = true;
      setErr('ptf-e-name', ''); setErr('ptf-e-age', ''); setErr('ptf-e-gender', ''); setErr('ptf-e-phone', ''); setErr('ptf-e-email', ''); setErr('ptf-e-whatsapp', '');
      if (name.length < 2) { setErr('ptf-e-name', 'Please enter the full name.'); ok = false; }
      var age = parseInt(ageRaw, 10);
      if (!ageRaw || isNaN(age) || age < 1 || age > 120) { setErr('ptf-e-age', 'Enter a valid age (1–120).'); ok = false; }
      if (!gender) { setErr('ptf-e-gender', 'Please select gender.'); ok = false; }
      if (phone && !/^[+\d][\d\s\-()]{5,19}$/.test(phone)) { setErr('ptf-e-phone', 'Enter a valid phone number.'); ok = false; }
      if (whatsapp && !/^[+\d][\d\s\-()]{5,19}$/.test(whatsapp)) { setErr('ptf-e-whatsapp', 'Enter a valid WhatsApp number.'); ok = false; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('ptf-e-email', 'Enter a valid email address.'); ok = false; }
      if (!ok) return;
      var data = { name: name, age: age, gender: gender, phone: phone, whatsapp: whatsapp, address: address,
        father: father, dob: dob, cnic: cnic, phone2: phone2, email: email, city: city,
        blood: blood, ecName: ecName, ecPhone: ecPhone, doctorId: doctorId, notes: notes };
      if (existing && existing.id) {
        DB.update('patients', existing.id, data);
        App.toast('Patient details updated.');
      } else {
        data.createdAt = new Date().toISOString();
        var np = DB.insert('patients', data);
        // order tests → unpaid invoice + pending lab results (add mode only)
        var tMsg = 'Patient added successfully.';
        var tListEl = document.getElementById('ptf-tlist');
        if (tListEl && np && np.id) {
          var tIds = [];
          var chks = tListEl.querySelectorAll('.ptf-tchk:checked');
          for (var ci = 0; ci < chks.length; ci++) tIds.push(chks[ci].value);
          var items = [];
          tIds.forEach(function (tid) {
            var t = DB.get('tests', tid);
            if (!t) return;
            items.push({ testId: t.id, code: t.code, name: t.name, price: +t.price || 0,
              isPackage: !!t.isPackage, includes: t.isPackage ? (t.includes || []) : null });
          });
          if (items.length) {
            var bTotal = items.reduce(function (a, l) { return a + (+l.price || 0); }, 0);
            var inv = DB.insert('invoices', {
              patientId: np.id, doctorId: null, items: items,
              subtotal: bTotal, discount: 0, total: bTotal, paid: 0, due: bTotal,
              status: 'unpaid', createdAt: new Date().toISOString(), createdBy: ptUser()
            });
            items.forEach(function (l) {
              var tids = (l.isPackage && l.includes && l.includes.length) ? l.includes : [l.testId];
              tids.forEach(function (tid) {
                DB.insert('results', { invoiceId: inv.id, testId: tid, values: {},
                  status: 'pending', reportedAt: null, reportedBy: null });
              });
            });
            tMsg = 'Patient added — ' + items.length + ' test(s) sent to Lab Results.';
          }
        }
        App.toast(tMsg);
      }
      close();
      if (afterSave) afterSave(np || existing || null);
    });
  }
  function openPatientModal(existing, afterSave) {
    // NOTE: App.modal invokes onOpen synchronously and passes (ov, close) —
    // use the close param directly (the outer return value isn't assigned yet).
    App.modal(existing ? 'Edit Patient' : 'Add New Patient', formHTML(existing || {}), {
      onOpen: function (ov, close) { bindForm(close, existing, afterSave); }
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
    var regDate = '';
    try {
      if (p.createdAt) {
        var d = new Date(p.createdAt);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        regDate = d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
      }
    } catch (e) {}
    return '<tr>' +
      '<td><span class="mono">' + App.esc(p.id) + '</span></td>' +
      '<td><a class="pt-name" href="#/patient/' + App.esc(p.id) + '">' + avatarHTML(p.name, 34) +
      '<span><strong>' + App.esc(p.name) + '</strong><small>' + App.esc(p.phone || '—') + '</small></span></a></td>' +
      '<td>' + App.esc(p.age) + ' yrs · ' + App.esc(p.gender) + '</td>' +
      '<td>' + App.esc(p.phone || '—') + ((p.whatsapp || p.phone) ? ' ' + waBtn(waTarget(p), 'Chat on WhatsApp') : '') + '</td>' +
      '<td class="muted">' + App.esc(regDate || '—') + '</td>' +
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
    var edit = canEdit();

    // ---- dashboard-style stat cards (real data) ----
    var mKey = App.today().slice(0, 7);
    function mOf(d) { return String(d || '').slice(0, 7); }
    var newThisMonth = all.filter(function (p) { return mOf(p.createdAt) === mKey; }).length;
    var walkinThisMonth = DB.all('invoices').filter(function (i) {
      return mOf(i.createdAt) === mKey && (!i.patientId || !DB.get('patients', i.patientId));
    }).length;

    var html = '' + STAT_CSS + WA_CSS +
      '<div class="pgstat"><div class="stat-grid">' +
      statCard(STAT_ICONS.users, 'blue', 'Total Patients', all.length, 'registered') +
      statCard(STAT_ICONS.userPlus, 'green', 'New This Month', newThisMonth, 'joined this month') +
      statCard(STAT_ICONS.alert, 'amber', 'Patients with Dues', withDue, 'have unpaid invoices') +
      statCard(STAT_ICONS.receipt, 'brand', 'Walk-in Bills This Month', walkinThisMonth, 'unregistered patients') +
      '</div></div>' +
      '<div class="card"><div class="card-b">' +
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><input class="input search" id="pt-search" placeholder="Search by name, phone or patient ID…" value="' + App.esc(listQuery) + '" style="flex:1;min-width:0">' +
      (edit ? '<button class="btn btn-primary" id="pt-add" style="margin-left:auto;flex:none">+ Add Patient</button>' : '') + '</div>' +
      '<div class="muted" id="pt-count" style="font-size:12.5px;margin-bottom:10px">' + rows.length + ' shown</div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr>' +
      '<th>ID</th><th>Patient</th><th>Age / Gender</th><th>Phone</th><th>Registered</th><th class="num">Visits</th>' +
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
      if (addBtn) addBtn.addEventListener('click', function () { App.nav('#/patients/new'); });
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
        '<td><input type="checkbox" class="cmp-chk" data-inv="' + App.esc(inv.id) + '" title="Select for comparison"></td>' +
        '<td><a class="link" href="#/invoice/' + App.esc(inv.id) + '"><span class="mono">' + App.esc(inv.no || inv.id) + '</span></a></td>' +
        '<td>' + App.d(inv.createdAt) + '</td>' +
        '<td class="tests-cell">' + App.esc(testNames || '—') + '</td>' +
        '<td class="num">' + App.money(inv.total) + '</td>' +
        '<td class="num">' + App.money(inv.paid) + '</td>' +
        '<td class="num">' + ((+inv.due || 0) > 0 ? '<span class="due-amt">' + App.money(inv.due) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td>' + App.badge(inv.status) + '</td>' +
        '<td class="actions"><a class="btn btn-ghost btn-sm" href="#/invoice/' + App.esc(inv.id) + '">View</a></td></tr>';
    }).join('');

    var docName = 'Self';
    if (p.doctorId) { var _dd = DB.get('doctors', p.doctorId); if (_dd && _dd.name) docName = _dd.name; }

    /* lab tests for this patient: each ordered test with its result status */
    var testRows = [];
    st.invoices.forEach(function (inv) {
      (inv.items || []).forEach(function (item) {
        var res = null;
        try {
          res = DB.all('results').filter(function (r) { return r.invoiceId === inv.id && r.testId === item.testId; })[0] || null;
        } catch (e) { res = null; }
        testRows.push({ res: res, invoice: inv, item: item, test: DB.get('tests', item.testId) });
      });
    });
    testRows.sort(function (a, b) {
      var da = a.invoice.createdAt || '', db = b.invoice.createdAt || '';
      return db < da ? -1 : (db > da ? 1 : 0);
    });
    var labTestRowsHtml = testRows.map(function (tr, i) {
      var tName = App.esc(tr.item.name || (tr.test && tr.test.name) || 'Test');
      var ready = tr.res && tr.res.status === 'ready';
      var status = ready ? '<span class="badge b-ok">Ready</span>' : '<span class="badge b-warn">Pending</span>';
      var actions = ready
        ? '<button class="btn btn-ghost btn-sm" data-ptview="' + i + '">View</button> ' +
          '<button class="btn btn-ghost btn-sm" data-ptprint="' + i + '">Print</button>'
        : '<button class="btn btn-primary btn-sm" data-ptenter="' + i + '">Enter Result</button>';
      return '<tr><td><strong>' + tName + '</strong></td>' +
        '<td><span class="mono">' + App.esc(tr.invoice.no || tr.invoice.id) + '</span></td>' +
        '<td>' + App.d(tr.invoice.createdAt) + '</td>' +
        '<td>' + status + '</td>' +
        '<td class="actions">' + actions + '</td></tr>';
    }).join('');

    var html = '' + WA_CSS +
      '<div class="page-head"><div><a class="back-link" href="#/patients">← All Patients</a><h1>Patient Profile</h1></div>' +
      (edit ? '<div class="head-actions"><a class="btn btn-primary" href="#/billing/' + App.esc(p.id) + '">+ New Bill</a>' +
        '<button class="btn btn-ghost" id="pt-edit">Edit Details</button>' +
        '<button class="btn btn-danger" id="pt-del">Delete</button></div>' : '') + '</div>' +

      '<div class="card pt-profile"><div class="card-b pt-profile-in">' +
      avatarHTML(p.name, 72) +
      '<div class="pt-id-block"><h2>' + App.esc(p.name) + ' <span class="badge b-id mono">' + App.esc(p.id) + '</span></h2>' +
      '<div class="pt-meta">' +
      '<span>🎂 ' + App.esc(p.age) + ' years</span><span>⚧ ' + App.esc(p.gender) + '</span>' +
      '<span>📞 ' + App.esc(p.phone || '—') + ' ' + ((p.whatsapp || p.phone) ? waBtn(waTarget(p), 'Chat on WhatsApp') : '') + '</span>' +
      (p.father ? '<span>👤 ' + App.esc(p.father) + '</span>' : '') +
      (p.dob ? '<span>🎂 ' + App.esc(p.dob) + '</span>' : '') +
      (p.blood ? '<span>🩸 ' + App.esc(p.blood) + '</span>' : '') +
      (p.cnic ? '<span>🪪 ' + App.esc(p.cnic) + '</span>' : '') +
      (p.phone2 ? '<span>📞 ' + App.esc(p.phone2) + ' (alt)</span>' : '') +
      (p.whatsapp ? '<span>💬 ' + App.esc(p.whatsapp) + ' ' + waBtn(p.whatsapp, 'Chat on WhatsApp') + '</span>' : '') +
      (p.email ? '<span>📧 ' + App.esc(p.email) + '</span>' : '') +
      (p.city ? '<span>🏙 ' + App.esc(p.city) + '</span>' : '') +
      ((p.ecName || p.ecPhone) ? '<span>🆘 ' + App.esc([p.ecName, p.ecPhone].filter(Boolean).join(' • ')) + '</span>' : '') +
      '<span>👨‍⚕️ ' + App.esc(docName) + '</span>' +
      (p.address ? '<span>📍 ' + App.esc(p.address) + '</span>' : '') +
      '<span>🗓 Registered ' + App.d(p.createdAt) + '</span>' +
      '</div>' +
      (p.notes ? '<div class="pt-notes" style="margin-top:10px;font-size:13px;color:#5b6b80">📝 ' + App.esc(p.notes) + '</div>' : '') +
      '</div></div></div>' +

      '<div class="stat-grid stat-grid-3">' +
      '<div class="stat"><div class="stat-ic blue">🧾</div><div><div class="stat-v">' + st.visits + '</div><div class="stat-l">Total Visits</div></div></div>' +
      '<div class="stat"><div class="stat-ic teal">💳</div><div><div class="stat-v">' + App.money(st.spent) + '</div><div class="stat-l">Total Spent</div></div></div>' +
      '<div class="stat"><div class="stat-ic ' + (st.due > 0 ? 'red' : 'green') + '">⏳</div><div><div class="stat-v">' + App.money(st.due) + '</div><div class="stat-l">Outstanding Due</div></div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h3>Lab Tests</h3><span class="muted">' + testRows.length + ' test(s)</span></div>' +
      '<div class="card-b">' +
      (testRows.length
        ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th>Invoice No</th><th>Date</th><th>Status</th><th></th></tr></thead>' +
          '<tbody>' + labTestRowsHtml + '</tbody></table></div>'
        : App.empty('No tests ordered yet for this patient.')) +
      '</div></div>' +

      '<div class="card" id="trCard" style="display:none"><div class="card-h"><h3>Result Trends</h3><span class="muted">parameter-wise history</span></div>' +
      '<div class="card-b" id="trHost"></div></div>' +

      '<div class="card"><div class="card-h"><h3>Invoice History</h3><span class="muted">' + st.visits + ' invoice(s)</span>' +
      '<button class="btn btn-primary btn-sm" id="cmpBtn" style="display:none;margin-left:auto">Compare Selected (2)</button></div>' +
      '<div class="card-b">' +
      (st.invoices.length
        ? '<p class="muted" style="font-size:12px;margin-top:0">Tick any 2 invoices to compare their reports side by side.</p>' +
          '<div class="tbl-wrap"><table class="table"><thead><tr><th></th><th>Invoice No</th><th>Date</th><th>Tests</th>' +
          '<th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th><th></th></tr></thead>' +
          '<tbody>' + invRows + '</tbody></table></div>'
        : App.empty('No invoices yet for this patient.')) +
      '</div></div>';

    paint(html, function () {
      /* lab test actions: enter result / view / print */
      function ensureResultsMod(cb) {
        if (App.enterLabResult && App.viewLabReport && App.printLabReport) { cb(); return; }
        App.loadScript('assets/js/mod-results.js').then(cb, function () { App.toast('Could not load lab results module', 'err'); });
      }
      function entryRow(tr) {
        return { res: tr.res, invoice: tr.invoice, patient: p, item: tr.item, test: tr.test };
      }
      document.querySelectorAll('[data-ptenter]').forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = testRows[+b.getAttribute('data-ptenter')];
          if (!tr) return;
          ensureResultsMod(function () {
            App.enterLabResult(entryRow(tr), function () { renderDetail({ id: p.id }); });
          });
        });
      });
      document.querySelectorAll('[data-ptview]').forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = testRows[+b.getAttribute('data-ptview')];
          if (!tr) return;
          var invId = tr.invoice.id;
          ensureResultsMod(function () { App.viewLabReport(invId); });
        });
      });
      document.querySelectorAll('[data-ptprint]').forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = testRows[+b.getAttribute('data-ptprint')];
          if (!tr) return;
          var invId = tr.invoice.id;
          ensureResultsMod(function () { App.printLabReport(invId); });
        });
      });
      /* result trends: only when this patient has reported results; module loads on demand */
      var hasRes = false;
      try { hasRes = DB.all('results').some(function (r) { return r.status === 'ready' && st.invoices.some(function (i) { return i.id === r.invoiceId; }); }); } catch (e) {}
      if (hasRes) ensureResultsMod(function () {
        var card = document.getElementById('trCard'), host = document.getElementById('trHost');
        if (card && host && App.renderPatientTrends) { card.style.display = ''; App.renderPatientTrends(host, p); }
      });
      /* report comparison: select 2 invoices, compare side by side */
      var cmpBtn = document.getElementById('cmpBtn');
      var cmpChks = Array.prototype.slice.call(document.querySelectorAll('.cmp-chk'));
      function paintCmpBtn() {
        var sel = cmpChks.filter(function (c) { return c.checked; });
        if (cmpBtn) {
          cmpBtn.style.display = sel.length === 2 ? '' : 'none';
          cmpBtn.textContent = 'Compare Selected (' + sel.length + '/2)';
        }
      }
      cmpChks.forEach(function (c) {
        c.addEventListener('change', function () {
          var sel = cmpChks.filter(function (x) { return x.checked; });
          if (sel.length > 2) { c.checked = false; App.toast('Select only 2 invoices to compare', 'err'); return; }
          paintCmpBtn();
        });
      });
      if (cmpBtn) cmpBtn.addEventListener('click', function () {
        var sel = cmpChks.filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-inv'); });
        if (sel.length !== 2) return;
        ensureResultsMod(function () { App.compareReports(sel[0], sel[1]); });
      });
      paintCmpBtn();
      if (!edit) return;
      document.getElementById('pt-edit').addEventListener('click', function () {
        openPatientModal(p, function () { renderDetail({ id: p.id }); });
      });
      document.getElementById('pt-del').addEventListener('click', function () {
        deletePatient(p, function () { App.nav('#/patients'); });
      });
    });
  }

  /* ---------- #/patients/new : dedicated full-page add form ---------- */
  function renderAddPage() {
    if (!canEdit()) { App.toast('Not allowed.', 'err'); App.nav('#/patients'); return; }
    var html =
      '<div class="page-head"><div><a class="back-link" href="#/patients">← All Patients</a><h1>Add Patient</h1></div></div>' +
      '<div class="card"><div class="card-b">' + formHTML({}) + '</div></div>';
    paint(html, function () {
      bindForm(function () { App.nav('#/patients'); }, null, function (np) {
        if (np && np.id) App.nav('#/patient/' + np.id);
        else App.nav('#/patients');
      });
    });
  }

  /* ---------- route registration ---------- */
  App.route('/patients', renderList);
  App.route('/patients/new', renderAddPage);
  App.route('/patient/:id', renderDetail);
})();
