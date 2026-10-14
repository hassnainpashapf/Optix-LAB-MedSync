/* Optix Medical Sync — Patients module (Agent 7)
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
    return r === 'admin' || r === 'reception' || (r === 'custom' && App.canPage('patients'));
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
    '.pt-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;margin-top:6px;font-size:13px;color:var(--muted)}' +
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

  var STAT_TINTS = {
    brand: { sc: '#0284c7', line: '#6fa6cf', soft: '#ebf4f9', circle: '#ddecf5' },
    blue:  { sc: '#2563eb', line: '#7aa7e6', soft: '#e7f0fe', circle: '#dde9fb' },
    amber: { sc: '#d97706', line: '#e0b25c', soft: '#fef4e2', circle: '#fde8c8' },
    green: { sc: '#16a34a', line: '#5fbf8a', soft: '#e6f7f0', circle: '#d8f2e4' },
    red:   { sc: '#dc2626', line: '#e08080', soft: '#fdecec', circle: '#fad2d2' }
  };

  function statCard(icon, tint, label, value, sub) {
    var c = STAT_TINTS[tint] || STAT_TINTS.blue;
    return '<div class="stat" data-tint="' + tint + '" style="--sc:' + c.sc + '">' +
      '<div class="stat-ico" style="color:' + c.sc + ';background:' + c.soft + '">' + icon + '</div>' +
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
    '.ptf-tinfo{flex:1;min-width:0;overflow-wrap:anywhere}' +
    '.ptf-trefs{display:block;margin-top:4px;font-size:12px;color:var(--muted);font-weight:400;white-space:normal}' +
    '.ptf-tref{display:block;margin-top:2px}' +
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
      var searchTerms = (nm + (t.aliases ? (' ' + t.aliases.join(' ')) : '')).toLowerCase();
      var type = t.type === 'generic' ? 'generic' : 'regular';
      return '<label class="ptf-trow" data-ttype="' + type + '" data-tname="' + App.esc(searchTerms) + '"' + (type === 'generic' ? ' style="display:none"' : '') + '>' +
        '<input type="checkbox" class="ptf-tchk" value="' + App.esc(t.id) + '" data-price="' + (+t.price || 0) + '">' +
        '<span class="ptf-tinfo"><strong>' + App.esc(nm) + '</strong>' +
        (t.isPackage ? ' <span class="badge b-ready">Package</span>' : '') +
        '<span class="ptf-trefs" data-ref-test="' + App.esc(t.id) + '"></span></span>' +
        '<span class="ptf-tprice">' + App.money(+t.price || 0) + '</span></label>';
    }).join('');
    return PTF_TSTYLE +
      '<div class="form-row ptf-wide"><label class="label" for="ptf-ttype">Test type</label>' +
      '<select class="select" id="ptf-ttype"><option value="regular">Regular Tests</option><option value="generic">Generic Tests</option><option value="all">All Tests</option></select>' +
      '<div class="muted" style="font-size:12px;margin:6px 0">Selections from both types are kept when you switch. Generic templates must be imported as real lab tests before ordering.</div>' +
      '<label class="label" for="ptf-tsearch">Order Tests <span class="ptf-opt">(optional — sent to Lab Results)</span></label>' +
      '<input class="input" id="ptf-tsearch" placeholder="Search tests…" autocomplete="off">' +
      '<div class="muted" style="font-size:12px;margin-top:6px">Normal ranges below follow age and gender (child ranges take priority under 13). These are reference ranges, not patient results.</div>' +
      '<div class="ptf-tlist" id="ptf-tlist">' + rows + '</div>' +
      '<div class="ptf-tempty" id="ptf-tempty" hidden>No active tests match this type and search.</div>' +
      '<div class="muted" id="ptf-tcatalog" style="font-size:12px;margin-top:6px" role="status"></div>' +
      '<div class="ptf-tsum" id="ptf-tsum">0 selected • Rs 0</div></div>';
  }
  /* Results are lazy-loaded. Match mod-results refFor until its shared helper is available. */
  function patientTestRef(param, patient) {
    if (App.refFor) return App.refFor(param, patient);
    if (!param) return '';
    var age = parseFloat(patient && patient.age), gender = String((patient && patient.gender) || '').toLowerCase().charAt(0);
    if (!isNaN(age) && age < 13 && param.refChild) return param.refChild;
    if (gender === 'm' && param.refMale) return param.refMale;
    if (gender === 'f' && param.refFemale) return param.refFemale;
    return param.ref || '';
  }
  function testReferenceHTML(test, patient) {
    var tests = test.isPackage && test.includes && test.includes.length ? test.includes.map(function (id) { return DB.get('tests', id); }) : [test];
    return tests.map(function (t) {
      if (!t) return '<span class="ptf-tref">Included test unavailable.</span>';
      var title = test.isPackage ? App.esc(t.name || t.code || 'Test') + ' — ' : '';
      var params = Array.isArray(t.params) ? t.params : [];
      if (!params.length) return '<span class="ptf-tref">' + title + 'No reference ranges configured.</span>';
      return params.map(function (param) {
        var ref = patientTestRef(param, patient);
        return '<span class="ptf-tref">' + title + App.esc(param.name || 'Parameter') + ': Normal range ' +
          App.esc(ref || 'not configured') + (ref && param.unit ? ' ' + App.esc(param.unit) : '') + '</span>';
      }).join('');
    }).join('');
  }
  /* corporate / panel client: the patient's bills go to the client's account at the client's prices */
  function panelFieldHTML(p) {
    var pans = (DB.all('panels') || []).filter(function (x) { return x.active !== false || x.id === (p && p.panelId); });
    if (!pans.length) return '';
    return '<div class="form-2col"><div class="form-row"><label class="label" for="ptf-panel">Corporate client <span class="ptf-opt">(optional)</span></label>' +
      '<select class="select" id="ptf-panel"><option value="">None - patient pays</option>' + pans.map(function (x) { return '<option value="' + App.esc(x.id) + '"' + ((p && p.panelId) === x.id ? ' selected' : '') + '>' + App.esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-row"><label class="label" for="ptf-panelref">Employee / student ID <span class="ptf-opt">(optional)</span></label>' +
      '<input class="input" id="ptf-panelref" maxlength="40" value="' + App.esc((p && p.panelRef) || '') + '"></div></div>';
  }
  /* CNIC: 13 digits shown as 00000-0000000-0. cnicDigits strips everything but digits; cnicFormat re-inserts the dashes as you type. */
  function cnicDigits(v) { return String(v == null ? '' : v).replace(/\D/g, '').slice(0, 13); }
  function cnicFormat(v) {
    var d = cnicDigits(v);
    return d.length > 12 ? d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12) : (d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d);
  }
  /* Blood group is optional on every staff patient form */
  function isRealBlood(v) { v = String(v == null ? '' : v).trim(); return !!v && !/^(unknown|select.*|n\/?a|none|-+)$/i.test(v); }
  var PTF_FSTYLE = '<style>' +
    '#ptf-form.form-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:10px 14px}' +
    '#ptf-form .form-2col{display:contents}' +
    '#ptf-form .form-row{grid-column:span 2;gap:4px}' +
    '#ptf-form .ptf-wide{grid-column:1/-1}' +
    '#ptf-form .ptf-half{grid-column:span 3}' +
    '#ptf-form .label{margin:0}' +
    '#ptf-form .input,#ptf-form .select,#ptf-form textarea.input{border:1.5px solid #8c9ab3;background:#fff}' +
    '#ptf-form .input:focus,#ptf-form .select:focus{border-color:#2f6df6;box-shadow:0 0 0 3px rgba(47,109,246,.16)}' +
    '#ptf-form textarea.input{min-height:0;resize:vertical}' +
    '#ptf-form .f-err{min-height:0;margin:0}#ptf-form .f-err:empty{display:none}' +
    '#ptf-form .modal-actions{grid-column:1/-1;margin-top:4px}' +
    '@media(max-width:900px){#ptf-form.form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#ptf-form .form-row{grid-column:span 1}#ptf-form .ptf-half{grid-column:1/-1}}' +
    '@media(max-width:560px){#ptf-form.form-grid{grid-template-columns:1fr}}' +
    '</style>';
  function formHTML(p) {
    p = p || {};
    function val(k) { return App.esc(p[k] == null ? '' : p[k]); }
    function sel(v) { return p.gender === v ? ' selected' : ''; }
    var branches = (DB.all('branches') || []).filter(function (b) { return b && b.is_active !== false; });
    var regDefault = String(App.visitDefaults().regLocation || '').trim().toLowerCase();
    var defaultBranch = branches.filter(function (b) {
      return regDefault && [b.name, b.code].some(function (v) { return String(v || '').trim().toLowerCase() === regDefault; });
    })[0];
    var bloods = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    var docOpts = '<option value="">Self / Walk-in</option>' +
      DB.all('doctors').slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }).map(function (d) {
        return '<option value="' + App.esc(d.id) + '"' + ((p.doctorId || '') === d.id ? ' selected' : '') + '>' +
          App.esc(d.name) + '</option>';
      }).join('');
    return '' +
      PTF_FSTYLE + '<form id="ptf-form" class="form-grid" novalidate>' +
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
      '<div class="form-row"><label class="label" for="ptf-blood">Blood Group</label>' +
      '<select class="select" id="ptf-blood">' +
      App.optionsHtml('bloodGroup', isRealBlood(p.blood) ? p.blood : '', 'Select blood group') +
      '</select><div class="f-err" id="ptf-e-blood"></div></div>' +
      '</div>' +
      '<div class="form-row"><label class="label" for="ptf-whatsapp">Mobile / WhatsApp No.</label>' +
      '<div class="ptf-phone-wrap"><input class="input" id="ptf-whatsapp" maxlength="20" placeholder="e.g. 0300-1234567" value="' + (p.whatsapp || p.phone ? App.esc(p.whatsapp || p.phone) : '') + '">' +
      '<span id="ptf-wa2">' + waBtn(waTarget(p), 'Chat on WhatsApp') + '</span></div>' +
      '<div class="f-err" id="ptf-e-whatsapp"></div></div>' +
      '<div class="form-row"><label class="label" for="ptf-cnic">CNIC <span style="font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0;font-size:10px">(optional)</span></label>' +
      '<input class="input" id="ptf-cnic" inputmode="numeric" autocomplete="off" maxlength="15" placeholder="00000-0000000-0" value="' + App.esc(cnicDigits(p.cnic).length === 13 ? cnicFormat(p.cnic) : (p.cnic || '')) + '">' +
      '<div class="f-err" id="ptf-e-cnic"></div></div>' +
      '<div class="form-row"><label class="label" for="ptf-doctor">Consultant</label>' +
      '<select class="select" id="ptf-doctor">' + docOpts + '</select></div>' +
      panelFieldHTML(p) +
      '<div class="form-2col">' +
      '<div class="form-row"><label class="label" for="ptf-regdate">Registration Date &amp; Time</label>' +
      '<input class="input" id="ptf-regdate" type="datetime-local" value="' + App.toLocalInput(p.createdAt) + '">' +
      '<div class="muted" style="font-size:11.5px;margin-top:3px">Filled in automatically. Change it if needed.</div></div>' +
      (!p.id ? '<div class="form-row"><label class="label" for="ptf-regloc">Registration Location</label>' +
      '<input class="input" id="ptf-regloc" list="ptf-regloc-dl" maxlength="120" value="' + App.esc(App.visitDefaults().regLocation) + '">' + App.datalistHtml('ptf-regloc-dl', 'regLocation', App.visitDefaults().regLocation) + '</div>' : '<div></div>') +
      '</div>' +
      (!p.id ? '<div class="form-row"><label class="label" for="ptf-destloc">Destination Location <span class="ptf-opt">(where the report is for)</span></label>' +
      '<input class="input" id="ptf-destloc" list="ptf-destloc-dl" maxlength="120" value="' + App.esc(App.visitDefaults().destLocation) + '">' + App.datalistHtml('ptf-destloc-dl', 'destLocation', App.visitDefaults().destLocation) + '</div>' +
      (branches.length ? '<div class="form-row"><label class="label" for="ptf-branch">Branch</label><select class="select" id="ptf-branch"><option value="">Unassigned</option>' + branches.map(function (b) { return '<option value="' + App.esc(b.id) + '"' + (defaultBranch && defaultBranch.id === b.id ? ' selected' : '') + '>' + App.esc(b.name || b.code || b.id) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="form-row"><label class="label" for="ptf-specimen">Specimen <span class="ptf-opt">(shown on the report)</span></label><select class="select" id="ptf-specimen">' + App.optionsHtml('specimen', App.listOptions('specimen')[0] || '') + '</select></div>' +
      '<div class="form-row"><label class="label" for="ptf-ref">Reference <span class="ptf-opt">(shown on the report)</span></label><select class="select" id="ptf-ref">' + App.optionsHtml('reference', App.listOptions('reference')[0] || '') + '</select></div>' : '') +
      '<div class="form-row ptf-half"><label class="label" for="ptf-address">Address</label>' +
      '<textarea class="input" id="ptf-address" rows="2" maxlength="200" placeholder="Street, area, city">' + val('address') + '</textarea></div>' +
      '<div class="form-row ptf-half"><label class="label" for="ptf-notes">Notes / Medical History</label>' +
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
    /* tidy order, three fields per row: name / father / phone, age / gender / blood group, date of birth / CNIC / consultant, ... */
    ['name', 'father', 'whatsapp', 'age', 'gender', 'blood', 'dob', 'cnic', 'doctor', 'panel', 'panelref', 'regdate', 'regloc', 'destloc', 'specimen', 'ref', 'branch', 'address', 'notes'].forEach(function (k, i) {
      var el = document.getElementById('ptf-' + k), row = el && el.closest ? el.closest('.form-row') : null;
      if (row) row.style.order = String(i + 1);
    });
    var tt = document.getElementById('ptf-ttype'), ttRow = tt && tt.closest ? tt.closest('.form-row') : null;
    if (ttRow) ttRow.style.order = '30';
    var acts = form.querySelector('.modal-actions'); if (acts) acts.style.order = '40';
    document.getElementById('ptf-cancel').addEventListener('click', close);
    // the one number box: the WhatsApp button next to it follows what is typed, and a number that already exists is flagged
    var phoneInput = document.getElementById('ptf-whatsapp');
    var waWrap2 = document.getElementById('ptf-wa2');
    if (phoneInput && waWrap2) {
      phoneInput.addEventListener('input', function () {
        waWrap2.innerHTML = waBtn(phoneInput.value, 'Chat on WhatsApp');
        checkDuplicate();
      });
    }
    /* CNIC: dashes are added while typing (00000-0000000-0); pasting with dashes or spaces works too */
    var cnicInput = document.getElementById('ptf-cnic');
    if (cnicInput) cnicInput.addEventListener('input', function () {
      var f = cnicFormat(cnicInput.value);
      if (f !== cnicInput.value) cnicInput.value = f;
      setErr('ptf-e-cnic', '');
    });
    var bloodInput = document.getElementById('ptf-blood');
    if (bloodInput) bloodInput.addEventListener('change', function () { if (isRealBlood(bloodInput.value)) setErr('ptf-e-blood', ''); });
    // duplicate detection: warn if the phone number matches an existing patient
    var dupWarn = document.createElement('div');
    dupWarn.id = 'ptf-dupwarn';
    dupWarn.style.cssText = 'display:none;margin-top:12px;padding:12px;border:1px solid var(--amber);border-radius:8px;background:var(--amber-soft)';
    if (form) form.insertBefore(dupWarn, form.firstChild);
    function normPhone(p) { return (p || '').replace(/\D/g, '').replace(/^92/, '0'); }
    function checkDuplicate() {
      if (!dupWarn) return;
      var phone = normPhone(phoneInput ? phoneInput.value : '');
      var found = null, matchBy = '';
      if (phone) {
        var all = DB.all('patients');
        for (var i = 0; i < all.length; i++) {
          var p = all[i];
          if (existing && p.id === existing.id) continue;
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
    setTimeout(checkDuplicate, 300);
    // order-tests picker (add mode only): search filter + live selection summary
    var tSearch = document.getElementById('ptf-tsearch');
    var tList = document.getElementById('ptf-tlist');
    var tSum = document.getElementById('ptf-tsum');
    var tType = document.getElementById('ptf-ttype');
    var templateLoad = null, templatesDrawn = false;
    function paintTestReferences() {
      if (!tList) return;
      var patient = { age: document.getElementById('ptf-age').value, gender: document.getElementById('ptf-gender').value };
      var refs = tList.querySelectorAll('[data-ref-test]');
      for (var i = 0; i < refs.length; i++) {
        var test = DB.get('tests', refs[i].getAttribute('data-ref-test'));
        refs[i].innerHTML = test ? testReferenceHTML(test, patient) : 'Test unavailable.';
      }
    }
    function paintTSum() {
      if (!tList || !tSum) return;
      var n = 0, amt = 0, names = [];
      var chks = tList.querySelectorAll('.ptf-tchk:checked');
      var pnSel = document.getElementById('ptf-panel'), pn = pnSel && pnSel.value ? DB.get('panels', pnSel.value) : null;
      for (var i = 0; i < chks.length; i++) {
        var test = DB.get('tests', chks[i].value); if (!test) continue;
        n++; names.push(test.name); amt += pn ? App.panelPrice(pn, test) : (+test.price || 0);
      }
      tSum.textContent = n + ' selected across both types • ' + App.money(amt) + (pn ? ' (' + pn.name + ' rates, billed to their account)' : '') + (names.length ? ' — ' + names.join(', ') : '');
      paintTestReferences();
    }
    function filterTests() {
      var q = tSearch.value.trim().toLowerCase(), type = tType.value, visible = 0;
      var rows = tList.querySelectorAll('.ptf-trow');
      for (var i = 0; i < rows.length; i++) {
        var show = (type === 'all' || rows[i].getAttribute('data-ttype') === type) && (!q || (rows[i].getAttribute('data-tname') || '').indexOf(q) >= 0);
        rows[i].style.display = show ? '' : 'none';
        if (show) visible++;
      }
      document.getElementById('ptf-tempty').hidden = !!visible;
      document.getElementById('ptf-tcatalog').hidden = type === 'regular';
      paintTestReferences();
    }
    function showTemplateAvailability() {
      if (templatesDrawn) return;
      var status = document.getElementById('ptf-tcatalog');
      if (!App.testCatalog) {
        if (templateLoad) return;
        status.textContent = 'Loading common template availability…';
        templateLoad = App.loadScript('assets/js/mod-masters.js');
        templateLoad.then(function () {
          templateLoad = null;
          if (document.getElementById('ptf-tlist') !== tList) return;
          if (!App.testCatalog) throw new Error('Templates unavailable');
          showTemplateAvailability(); filterTests();
        }).catch(function () {
          templateLoad = null;
          if (document.getElementById('ptf-tlist') === tList) status.textContent = 'Template availability could not be loaded. Saved tests remain selectable; switch test type to retry.';
        });
        return;
      }
      var html = App.testCatalog.templates().map(function (tpl) {
        var t = tpl.test;
        if (t && t.type === 'generic' && t.active !== false) return '';
        var message = t ? (t.active === false ? 'Saved test is inactive — ask an administrator to activate it.' : 'Already saved as a Regular test: ' + t.name + '. Choose Regular Tests to order it.') :
          'Not imported — unavailable. Ask an administrator to use All Tests Catalog → Generic Tests → Add to catalog.';
        return '<div class="ptf-trow" data-ttype="generic" data-tname="' + App.esc(tpl.name.toLowerCase()) + '"><span><strong>' + App.esc(tpl.name) + '</strong><br><span class="muted">' + App.esc(message) + '</span></span></div>';
      }).join('');
      tList.insertAdjacentHTML('beforeend', html);
      templatesDrawn = true;
      status.textContent = 'Only saved, active tests have a selection checkbox. Templates alone cannot be ordered.';
    }
    if (tSearch && tList) {
      tSearch.addEventListener('input', filterTests);
      tType.addEventListener('change', function () { if (tType.value !== 'regular') showTemplateAvailability(); filterTests(); });
      tList.addEventListener('change', paintTSum);
      document.getElementById('ptf-gender').addEventListener('change', paintTestReferences);
      document.getElementById('ptf-age').addEventListener('input', paintTestReferences);
      document.getElementById('ptf-age').addEventListener('change', paintTestReferences);
      var pnSel0 = document.getElementById('ptf-panel'); if (pnSel0) pnSel0.addEventListener('change', paintTSum);
      paintTSum();
      filterTests();
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = document.getElementById('ptf-name').value.trim();
      var ageRaw = document.getElementById('ptf-age').value.trim();
      var gender = document.getElementById('ptf-gender').value;
      var num = document.getElementById('ptf-whatsapp').value.trim();   /* the single mobile / WhatsApp number */
      var address = document.getElementById('ptf-address').value.trim();
      var father = document.getElementById('ptf-father').value.trim();
      var dob = document.getElementById('ptf-dob').value;
      var blood = document.getElementById('ptf-blood').value;
      var cnicEl = document.getElementById('ptf-cnic'), cnicRaw = cnicEl ? cnicEl.value.trim() : '';
      var doctorId = document.getElementById('ptf-doctor').value || null;
      var panelEl = document.getElementById('ptf-panel'), panelId = panelEl ? (panelEl.value || null) : null, panelRef = panelEl ? document.getElementById('ptf-panelref').value.trim() : '';
      var notes = document.getElementById('ptf-notes').value.trim();
      var regISO = App.fromLocalInput(document.getElementById('ptf-regdate').value);
      var regLocEl = document.getElementById('ptf-regloc'), destLocEl = document.getElementById('ptf-destloc');
      var regLoc = regLocEl ? regLocEl.value.trim() : '', destLoc = destLocEl ? destLocEl.value.trim() : '', refEl = document.getElementById('ptf-ref'), refVal = refEl ? refEl.value : '', spEl = document.getElementById('ptf-specimen'), spVal = spEl ? spEl.value : '';
      var branchEl = document.getElementById('ptf-branch'), branchId = branchEl ? (branchEl.value || null) : null;
      var ok = true;
      var firstBad = null;
      function bad(field, errId, msg) { setErr(errId, msg); ok = false; if (!firstBad) firstBad = document.getElementById(field); }
      setErr('ptf-e-name', ''); setErr('ptf-e-age', ''); setErr('ptf-e-gender', ''); setErr('ptf-e-whatsapp', ''); setErr('ptf-e-blood', ''); setErr('ptf-e-cnic', '');
      if (name.length < 2) bad('ptf-name', 'ptf-e-name', 'Please enter the full name.');
      var age = parseInt(ageRaw, 10);
      if (!ageRaw || isNaN(age) || age < 1 || age > 120) bad('ptf-age', 'ptf-e-age', 'Enter a valid age (1–120).');
      if (!gender) bad('ptf-gender', 'ptf-e-gender', 'Please select gender.');
      if (num && !/^[+\d][\d\s\-()]{5,19}$/.test(num)) bad('ptf-whatsapp', 'ptf-e-whatsapp', 'Enter a valid mobile number.');
      /* CNIC is optional; when filled it needs 13 digits (an unchanged old value is left alone) */
      var cnic = cnicDigits(cnicRaw).length === 13 ? cnicFormat(cnicRaw) : cnicRaw;
      if (cnicRaw && cnicDigits(cnicRaw).length !== 13 && !(existing && existing.id && cnicRaw === String(existing.cnic || ''))) bad('ptf-cnic', 'ptf-e-cnic', 'CNIC must have 13 digits (00000-0000000-0).');
      if (!ok) { if (firstBad && firstBad.focus) firstBad.focus(); return; }
      if (tList) {
        var selected = tList.querySelectorAll('.ptf-tchk:checked');
        for (var si = 0; si < selected.length; si++) {
          var savedTest = DB.get('tests', selected[si].value);
          if (!savedTest || savedTest.active === false) { App.toast('A selected test is no longer available. Deselect it before saving.', 'err'); return; }
        }
      }
      var data = { name: name, age: age, gender: gender, address: address,
        father: father, dob: dob,
        blood: isRealBlood(blood) ? blood : '', doctorId: doctorId, notes: notes };
      if (cnicEl) data.cnic = cnic;
      /* one number serves WhatsApp, reports and the patient portal; an existing patient's numbers are only touched when the box was changed */
      if (!(existing && existing.id) || num !== String(existing.whatsapp || existing.phone || '')) { data.phone = num; data.whatsapp = num; }
      if (panelEl) { data.panelId = panelId; data.panelRef = panelRef; }
      if (existing && existing.id) {
        if (document.getElementById('ptf-regdate').value && document.getElementById('ptf-regdate').value !== App.toLocalInput(existing.createdAt)) data.createdAt = regISO;   /* only when the person changed it */
        DB.update('patients', existing.id, data);
        App.toast('Patient details updated.');
      } else {
        data.createdAt = regISO;
        var np = DB.insert('patients', data);
        // order tests → unpaid invoice + pending lab results (add mode only)
        var tMsg = 'Patient added successfully.';
        var tListEl = document.getElementById('ptf-tlist');
        if (tListEl && np && np.id) {
          var tIds = [];
          var chks = tListEl.querySelectorAll('.ptf-tchk:checked');
          for (var ci = 0; ci < chks.length; ci++) tIds.push(chks[ci].value);
          var items = [], pnl = panelId ? DB.get('panels', panelId) : null;
          tIds.forEach(function (tid) {
            var t = DB.get('tests', tid);
            if (!t) return;
            items.push({ testId: t.id, code: t.code, name: t.name, price: pnl ? App.panelPrice(pnl, t) : (+t.price || 0),
              isPackage: !!t.isPackage, includes: t.isPackage ? (t.includes || []) : null });
          });
          if (items.length && !(App.limitHit && App.limitHit('invoices'))) {
            var bTotal = items.reduce(function (a, l) { return a + (+l.price || 0); }, 0);
            var vn = App.nextVisitNos(regISO);
            var invData = {
              labNo: vn.labNo, caseNo: vn.caseNo,
              patientId: np.id, doctorId: null, items: items,
              subtotal: bTotal, discount: 0, total: bTotal, paid: pnl ? bTotal : 0, due: pnl ? 0 : bTotal,
              status: pnl ? 'paid' : 'unpaid', panelId: pnl ? pnl.id : null, branchId: branchId, regLocation: regLoc, destLocation: destLoc, reference: refVal, specimen: spVal, createdAt: regISO, createdBy: ptUser()
            };
            var inv = DB.insert('invoices', invData);
            DB.update('invoices', inv.id, { no: inv.id });
            try { App.outsourceSync(inv.id, true); } catch (e) { if (window.console) console.error(e); }
            items.forEach(function (l) {
              var tids = (l.isPackage && l.includes && l.includes.length) ? l.includes : [l.testId];
              tids.forEach(function (tid) {
                DB.insert('results', { invoiceId: inv.id, testId: tid, values: {},
                  status: 'pending', reportedAt: null, reportedBy: null });
              });
            });
            try { if (window.Samples) Samples.createForInvoice(inv); } catch (e) { if (window.console) console.error(e); }
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
        (p.cnic || '').toLowerCase().indexOf(q) > -1 ||
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

  /* ==========================================================================
     PATIENT CLINICAL INTELLIGENCE: VITALS & ORGAN OVERVIEW (NEXURA CARE SPEC)
     ========================================================================== */

  var DAYS_DATA = [
    { day: '09', name: 'Sat', avg: 28, peak: '24%', peakBpm: '126 BPM', peakTime: '04:15 PM', low: '6%', lowBpm: '98 BPM', lowTime: '01:20 AM', desc: 'Mild autonomic recovery during early morning rest. Work-related stressors stabilized in evening.' },
    { day: '10', name: 'Sun', avg: 25, peak: '22%', peakBpm: '118 BPM', peakTime: '03:30 PM', low: '5%', lowBpm: '92 BPM', lowTime: '02:10 AM', desc: 'Restful circadian profile. Low systemic physiological load achieved during daytime inactivity.' },
    { day: '11', name: 'Mon', avg: 35, peak: '31%', peakBpm: '138 BPM', peakTime: '11:45 AM', low: '8%', lowBpm: '102 BPM', lowTime: '03:00 AM', desc: 'Sympathetic tone spiked during late morning peak activity. Cortisol stress markers elevated.' },
    { day: '12', name: 'Tue', avg: 30, peak: '29%', peakBpm: '134 BPM', peakTime: '02:15 PM', low: '7%', lowBpm: '100 BPM', lowTime: '01:45 AM', desc: 'Moderate stress profile during afternoon tasks with steady cardiovascular compensation.' },
    { day: '13', name: 'Wed', avg: 32, peak: '27%', peakBpm: '132 BPM', peakTime: '05:48 PM', low: '7%', lowBpm: '104 BPM', lowTime: '12:39 AM', desc: 'Baseline stress achieved during relaxation. Elevated stress markers directly linked to work-related workload and external factors.' },
    { day: '14', name: 'Thu', avg: 31, peak: '28%', peakBpm: '130 BPM', peakTime: '04:20 PM', low: '8%', lowBpm: '106 BPM', lowTime: '02:00 AM', desc: 'Stable autonomic index. Mild evening sympathetic surge linked to ambient temperature.' },
    { day: '15', name: 'Fri', avg: 29, peak: '26%', peakBpm: '128 BPM', peakTime: '06:10 PM', low: '6%', lowBpm: '99 BPM', lowTime: '01:15 AM', desc: 'Weekly taper in physical strain observed. Parasympathetic tone dominant overnight.' }
  ];

  var ORGAN_DATA = {
    lung: {
      key: 'lung',
      name: 'Lung',
      system: 'Pulmonary System',
      effTitle: 'Lung Capacity Efficiency',
      risk: 'Moderate Risk',
      riskClass: 'moderate',
      score: 79,
      barGrad: 'linear-gradient(90deg, #38bdf8 0%, #2563eb 100%)',
      rehabSub: 'Daily targets for your lung health',
      rehabPlan: [
        { title: 'Early Ambulation', desc: 'Short Walk - 15 minutes.' },
        { title: 'Medication & Therapy Tracking', desc: 'Scheduled bronchodilator therapy Every 12 h.' },
        { title: 'Hydration & Safety', desc: '2.5L water intake and monitoring Air Quality.' },
        { title: 'Respiratory Exercises', desc: '3x Daily (Pursed-Lip & Diaphragmatic).' },
        { title: 'Anti-Inflammatory Diet', desc: 'High Omega-3 and Magnesium intake.' },
        { title: 'BMI & Lean Mass', desc: 'Monitoring weight loss due to Breathing.' },
        { title: 'Stress & Anxiety Management', desc: 'Monitoring stress hormones breathing.' }
      ],
      medsSub: 'Monitor prescribed pulmonary treatments',
      meds: [
        { icon: '🧪', name: 'Ventolin', dose: '1-2 puffs as needed (Rescue Inhaler).' },
        { icon: '💊', name: 'Pulmicort', dose: '1-2 inhalations every 12 hours.' },
        { icon: '🧴', name: 'Mucosolvan', dose: '1 tablet (30mg) three times daily' }
      ],
      warningTitle: 'Warning',
      warningDesc: 'Pulmonary findings: elevated airway resistance, imagined lung symptoms Rate 7.2%.'
    },
    liver: {
      key: 'liver',
      name: 'Liver',
      system: 'Hepatic System',
      effTitle: 'Liver Function Efficiency',
      risk: 'Optimal / Healthy',
      riskClass: 'normal',
      score: 91,
      barGrad: 'linear-gradient(90deg, #34d399 0%, #059669 100%)',
      rehabSub: 'Daily targets for hepatic detoxification & bile clearance',
      rehabPlan: [
        { title: 'Antioxidant Hydration', desc: 'Warm lemon water & green tea daily.' },
        { title: 'Fructose & Sugar Avoidance', desc: 'Zero processed corn syrups or sweetened drinks.' },
        { title: 'Cruciferous Vegetables', desc: 'Broccoli, cauliflower, and cabbage for glutathione.' },
        { title: 'Hepatotoxic Drug Shield', desc: 'Avoid unnecessary acetaminophen or NSAID intake.' },
        { title: 'Physical Activity', desc: '30 mins daily walking to reduce hepatic steatosis.' },
        { title: 'Lipid Profile Follow-up', desc: 'Quarterly ALT, AST, and Alk Phos monitoring.' },
        { title: 'Intermittent Fasting', desc: '14-hour overnight fast to facilitate autophagy.' }
      ],
      medsSub: 'Monitor prescribed hepatoprotective therapies',
      meds: [
        { icon: '💊', name: 'Heptral (SAMe)', dose: '500mg twice daily between meals.' },
        { icon: '🧪', name: 'Essentiale Forte', dose: '1 capsule three times daily with meals.' },
        { icon: '🌿', name: 'Silymarin (Milk Thistle)', dose: '140mg twice daily with water.' }
      ],
      warningTitle: 'Hepatic Status',
      warningDesc: 'Hepatic findings: normal synthetic function, ALT/AST within therapeutic baseline.'
    },
    heart: {
      key: 'heart',
      name: 'Heart',
      system: 'Cardiovascular System',
      effTitle: 'Cardiac Ejection Efficiency',
      risk: 'Normal / Low Risk',
      riskClass: 'normal',
      score: 88,
      barGrad: 'linear-gradient(90deg, #fb7185 0%, #e11d48 100%)',
      rehabSub: 'Daily targets for cardiovascular resilience & circulation',
      rehabPlan: [
        { title: 'Graded Aerobic Training', desc: '20 minutes brisk walking in target HR zone.' },
        { title: 'BP & Pulse Monitoring', desc: 'Record resting morning and evening vitals.' },
        { title: 'Sodium Restriction', desc: '< 2g daily sodium intake to reduce cardiac preload.' },
        { title: 'Cardioprotective Nutrition', desc: 'Mediterranean diet rich in leafy greens & olive oil.' },
        { title: 'Statin & Lipid Tracking', desc: 'Strict daily compliance with lipid-lowering regimen.' },
        { title: 'Sleep & Recovery', desc: 'Minimum 7.5 hours uninterrupted restful sleep.' },
        { title: 'Vagal Nerve Exercises', desc: 'Slow deep diaphragmatic breath (6 breaths/min).' }
      ],
      medsSub: 'Monitor prescribed cardiovascular treatments',
      meds: [
        { icon: '💊', name: 'Concor (Bisoprolol)', dose: '2.5mg once daily every morning.' },
        { icon: '💊', name: 'Lipitor (Atorvastatin)', dose: '20mg once daily at bedtime.' },
        { icon: '🩸', name: 'Lowplat (Aspirin)', dose: '75mg once daily after lunch.' }
      ],
      warningTitle: 'Cardiac Finding',
      warningDesc: 'Cardiovascular findings: mild resting tachycardia (86 bpm), systolic compliance stable.'
    },
    kidneys: {
      key: 'kidneys',
      name: 'Kidneys',
      system: 'Renal System',
      effTitle: 'Glomerular Filtration Efficiency',
      risk: 'Mild Risk / Monitored',
      riskClass: 'moderate',
      score: 84,
      barGrad: 'linear-gradient(90deg, #22d3ee 0%, #0891b2 100%)',
      rehabSub: 'Daily targets for renal protection & electrolyte balance',
      rehabPlan: [
        { title: 'Precision Hydration', desc: '2.8L structured water intake across the day.' },
        { title: 'Electrolyte Balance', desc: 'Balanced potassium and low phosphorus dietary intake.' },
        { title: 'Nephrotoxic Shield', desc: 'Strict contraindication for diclofenac & ibuprofen.' },
        { title: 'Microalbuminuria Screen', desc: 'Periodic spot urine protein:creatinine ratio.' },
        { title: 'Blood Pressure Target', desc: 'Keep systolic BP under 125 mmHg consistently.' },
        { title: 'Protein Moderation', desc: '0.8g per kg body weight to spare glomeruli.' },
        { title: 'Uric Acid Clearance', desc: 'Avoid purine-dense organ meats and shellfish.' }
      ],
      medsSub: 'Monitor prescribed nephrological treatments',
      meds: [
        { icon: '💊', name: 'Ketosteril', dose: '3 tablets three times daily during meals.' },
        { icon: '🧪', name: 'Urals Effervescent', dose: '1 sachet dissolved in water twice daily.' },
        { icon: '💊', name: 'Cozaar (Losartan)', dose: '50mg once daily for renal protection.' }
      ],
      warningTitle: 'Renal Alert',
      warningDesc: 'Renal findings: eGFR estimated at 84 mL/min, serum creatinine stable.'
    },
    brain: {
      key: 'brain',
      name: 'Brain',
      system: 'Neuro-Cognitive Vitality System',
      effTitle: 'Cognitive Vitality & Stress Index',
      risk: 'Elevated Stress',
      riskClass: 'moderate',
      score: 68,
      barGrad: 'linear-gradient(90deg, #c4b5fd 0%, #7c3aed 100%)',
      rehabSub: 'Daily targets for neuroprotection and mental calm',
      rehabPlan: [
        { title: 'Circadian Rhythm Sync', desc: 'Direct morning sunlight exposure for 15 mins.' },
        { title: 'Cognitive Recovery Pause', desc: '5-minute mindfulness pauses every 90 mins.' },
        { title: 'Neurotrophic Nutrition', desc: 'Walnuts, blueberries, and DHA Omega-3 fatty acids.' },
        { title: 'Blue Light Curfew', desc: 'No digital screens within 60 mins before sleep.' },
        { title: 'Aerobic Neurogenesis', desc: 'Moderate cardio to boost BDNF production.' },
        { title: 'Hydration for Neural Speed', desc: '500ml water immediately upon waking.' },
        { title: 'Stress Hormone Clearing', desc: 'Box breathing: 4s inhale, 4s hold, 4s exhale, 4s hold.' }
      ],
      medsSub: 'Monitor prescribed cognitive and stress therapies',
      meds: [
        { icon: '💊', name: 'Citicoline (Cognizin)', dose: '500mg once daily after breakfast.' },
        { icon: '💊', name: 'Magnesium L-Threonate', dose: '144mg elemental at night.' },
        { icon: '🧪', name: 'Neurobion Forte', dose: '1 tablet once daily with lunch.' }
      ],
      warningTitle: 'Neuro Finding',
      warningDesc: 'Neurological findings: heightened sympathetic tone, stress markers 32% elevated.'
    }
  };

  /* Helper to render glowing radial gauge */
  function renderRadialGaugeSvg(pct) {
    var p = Math.max(0, Math.min(100, pct || 32));
    var r = 46;
    var c = 2 * Math.PI * r; // ~289.02
    var offset = c - (p / 100) * c;
    return '<svg viewBox="0 0 120 120" width="120" height="120" style="overflow:visible;display:block">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="8" stroke-dasharray="3,3" />' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#2563eb" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 0.6s ease" />' +
      '</svg>';
  }

  /* Helper to render carousel thumb SVG */
  function renderOrganThumbSvg(key) {
    if (key === 'lung') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M18 6 L22 6 L22 14 L18 14 Z" fill="#0284c7"/><path d="M18 14 C15 15 9 17 7 21 C5 25 5 30 7 33 C9 36 13 36 16 35 C17 34 18 30 18 26 Z" fill="#38bdf8"/><path d="M22 14 C25 15 31 17 33 21 C35 25 35 30 33 33 C31 36 27 36 24 35 C23 34 22 30 22 26 Z" fill="#f43f5e"/></svg>';
    }
    if (key === 'liver') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M8 19 C10 12 17 10 28 11 C33 11 34 14 34 18 C34 23 30 29 24 31 C18 32 10 30 7 26 C6 24 7 21 8 19 Z" fill="#10b981"/><circle cx="21" cy="27" r="2.5" fill="#06b6d4"/></svg>';
    }
    if (key === 'heart') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M15 14 C11 17 10 23 13 28 C15 32 19 35 20 36 C21 35 28 30 30 24 C31 19 29 14 24 13 C21 13 18 15 17 16 C16 15 15 14 15 14 Z" fill="#e11d48"/><path d="M18 12 C18 7 23 7 24 11" stroke="#f43f5e" stroke-width="2" fill="none"/></svg>';
    }
    if (key === 'kidneys') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M13 14 C9 15 7 19 7 23 C7 27 9 31 13 31 C15 31 16 29 15 26 C14 23 15 19 16 17 C15 15 14 14 13 14 Z" fill="#06b6d4"/><path d="M27 14 C31 15 33 19 33 23 C33 27 31 31 27 31 C25 31 24 29 25 26 C26 23 25 19 24 17 C25 15 26 14 27 14 Z" fill="#06b6d4"/><line x1="19" y1="8" x2="19" y2="34" stroke="#ef4444" stroke-width="1.5"/></svg>';
    }
    if (key === 'brain') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M12 24 C8 20 9 14 15 10 C20 6 26 7 29 11 C32 16 31 22 28 25 C24 28 19 29 16 28 C13 27 11 25 12 24 Z" fill="#8b5cf6"/><line x1="18" y1="28" x2="20" y2="34" stroke="#7c3aed" stroke-width="2.5"/></svg>';
    }
    return '';
  }

  /* Full Detailed Stage Organ SVGs */
  function renderStageOrganSvg(key) {
    if (key === 'lung') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg lung-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="lungHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>' +
        '    <stop offset="70%" stop-color="#0284c7" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="tracheaGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
        '    <stop offset="0%" stop-color="#0ea5e9"/>' +
        '    <stop offset="50%" stop-color="#38bdf8"/>' +
        '    <stop offset="100%" stop-color="#0284c7"/>' +
        '  </linearGradient>' +
        '  <linearGradient id="leftLungGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.28"/>' +
        '    <stop offset="60%" stop-color="#0284c7" stop-opacity="0.14"/>' +
        '    <stop offset="100%" stop-color="#0369a1" stop-opacity="0.32"/>' +
        '  </linearGradient>' +
        '  <linearGradient id="rightLungGrad" x1="100%" y1="0%" x2="0%" y2="100%">' +
        '    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.25"/>' +
        '    <stop offset="60%" stop-color="#0ea5e9" stop-opacity="0.14"/>' +
        '    <stop offset="100%" stop-color="#0284c7" stop-opacity="0.32"/>' +
        '  </linearGradient>' +
        '  <filter id="vitalsGlow" x="-20%" y="-20%" width="140%" height="140%">' +
        '    <feGaussianBlur stdDeviation="3.5" result="blur"/>' +
        '    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
        '  </filter>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#lungHalo)"/>' +
        '<path d="M162 20 L178 20 L178 95 L162 95 Z" fill="url(#tracheaGrad)" rx="3"/>' +
        '<line x1="160" y1="32" x2="180" y2="32" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="44" x2="180" y2="44" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="56" x2="180" y2="56" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="68" x2="180" y2="68" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="80" x2="180" y2="80" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="92" x2="180" y2="92" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M162 95 C140 100 85 115 65 155 C45 195 40 250 55 295 C68 335 110 345 145 330 C155 325 158 300 156 260 C155 220 158 140 162 95 Z" fill="url(#leftLungGrad)" stroke="#38bdf8" stroke-width="1.8" filter="url(#vitalsGlow)"/>' +
        '<path d="M178 95 C200 100 255 115 275 155 C295 195 300 250 285 295 C272 335 230 345 195 330 C182 315 180 275 186 240 C190 205 183 140 178 95 Z" fill="url(#rightLungGrad)" stroke="#38bdf8" stroke-width="1.8" filter="url(#vitalsGlow)"/>' +
        '<path d="M166 95 C155 115 130 140 115 170 C105 190 95 225 90 260" stroke="#0ea5e9" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M130 140 C110 135 85 145 75 165" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M115 170 C130 190 135 225 132 255" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M100 205 C80 215 70 240 68 270" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M115 240 C125 270 120 295 105 315" stroke="#0284c7" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M90 260 C80 285 85 305 95 320" stroke="#38bdf8" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<path d="M174 95 C185 115 210 140 225 170 C235 190 245 225 250 260" stroke="#0ea5e9" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M210 140 C230 135 255 145 265 165" stroke="#f43f5e" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M225 170 C210 190 205 225 208 255" stroke="#f43f5e" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M240 205 C260 215 270 240 272 270" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M225 240 C215 270 220 295 235 315" stroke="#0284c7" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M250 260 C260 285 255 305 245 320" stroke="#f43f5e" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<circle cx="75" cy="165" r="3.5" fill="#38bdf8" filter="url(#vitalsGlow)"/>' +
        '<circle cx="68" cy="270" r="3" fill="#38bdf8"/>' +
        '<circle cx="95" cy="320" r="3.5" fill="#bae6fd"/>' +
        '<circle cx="105" cy="315" r="3" fill="#38bdf8"/>' +
        '<circle cx="132" cy="255" r="3.5" fill="#0284c7"/>' +
        '<circle cx="265" cy="165" r="3.5" fill="#fb7185" filter="url(#vitalsGlow)"/>' +
        '<circle cx="272" cy="270" r="3" fill="#38bdf8"/>' +
        '<circle cx="245" cy="320" r="3.5" fill="#fb7185"/>' +
        '<circle cx="235" cy="315" r="3" fill="#38bdf8"/>' +
        '<circle cx="208" cy="255" r="3.5" fill="#f43f5e"/>' +
        '<path d="M75 165 Q60 180 58 205" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '<path d="M265 165 Q280 180 282 205" stroke="#f43f5e" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '<path d="M90 260 Q75 280 72 300" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '<path d="M250 260 Q265 280 268 300" stroke="#f43f5e" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '</svg>';
    }
    if (key === 'liver') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg liver-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="liverHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/>' +
        '    <stop offset="70%" stop-color="#047857" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#047857" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="liverGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#34d399"/>' +
        '    <stop offset="50%" stop-color="#059669"/>' +
        '    <stop offset="100%" stop-color="#064e3b"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#liverHalo)"/>' +
        '<path d="M175 40 L195 40 L195 130 L175 130 Z" fill="#0284c7" rx="4"/>' +
        '<path d="M75 170 C85 110 150 95 240 100 C275 102 285 125 285 160 C285 200 260 250 210 265 C160 280 90 260 70 230 C60 215 65 190 75 170 Z" fill="url(#liverGrad)" stroke="#6ee7b7" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M185 100 C185 140 180 190 170 265" stroke="#a7f3d0" stroke-width="2.5" stroke-dasharray="4 2" fill="none"/>' +
        '<path d="M175 240 C175 225 190 220 195 235 C200 250 195 275 185 280 C175 280 170 260 175 240 Z" fill="#06b6d4" stroke="#67e8f9" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M175 220 C165 195 145 175 120 165" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M145 180 C135 155 110 145 95 145" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M175 220 C195 195 225 180 250 175" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M215 190 C230 165 250 155 265 150" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="120" cy="165" r="3.5" fill="#38bdf8"/>' +
        '<circle cx="95" cy="145" r="3" fill="#38bdf8"/>' +
        '<circle cx="250" cy="175" r="3.5" fill="#38bdf8"/>' +
        '<circle cx="265" cy="150" r="3.5" fill="#38bdf8"/>' +
        '</svg>';
    }
    if (key === 'heart') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg heart-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="heartHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.32"/>' +
        '    <stop offset="70%" stop-color="#be123c" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#be123c" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="aortaGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#f43f5e"/>' +
        '    <stop offset="50%" stop-color="#e11d48"/>' +
        '    <stop offset="100%" stop-color="#9f1239"/>' +
        '  </linearGradient>' +
        '  <linearGradient id="myoGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#fb7185"/>' +
        '    <stop offset="50%" stop-color="#e11d48"/>' +
        '    <stop offset="100%" stop-color="#881337"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#heartHalo)"/>' +
        '<path d="M125 40 L145 40 L145 120 L125 120 Z" fill="#0284c7" rx="4"/>' +
        '<path d="M150 110 C150 50 205 45 215 95 L195 105 C190 70 168 70 168 110 Z" fill="url(#aortaGrad)"/>' +
        '<path d="M165 65 L165 30 L175 30 L175 65 Z" fill="#e11d48"/>' +
        '<path d="M182 60 L188 30 L198 32 L192 65 Z" fill="#e11d48"/>' +
        '<path d="M200 68 L212 35 L222 38 L210 75 Z" fill="#e11d48"/>' +
        '<path d="M140 105 C150 100 185 100 205 120 L190 135 C175 122 155 122 145 125 Z" fill="#0ea5e9"/>' +
        '<path d="M120 130 C95 160 85 220 110 270 C130 310 165 350 175 355 C185 350 240 290 255 230 C265 180 245 130 205 125 C180 120 155 135 145 145 C135 135 125 125 120 130 Z" fill="url(#myoGrad)" stroke="#fb7185" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M160 145 C165 180 150 220 165 270 C170 295 175 330 175 345" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M158 190 C140 205 125 235 120 260" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M162 230 C175 245 185 265 190 285" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M180 155 C205 170 225 195 235 225" stroke="#fbbf24" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M210 185 C220 215 225 245 220 270" stroke="#fbbf24" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<circle cx="165" cy="270" r="3.5" fill="#38bdf8" filter="url(#vitalsGlow)"/>' +
        '<circle cx="235" cy="225" r="3" fill="#fbbf24"/>' +
        '<circle cx="175" cy="345" r="3.5" fill="#38bdf8"/>' +
        '</svg>';
    }
    if (key === 'kidneys') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg kidneys-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="renalHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.32"/>' +
        '    <stop offset="70%" stop-color="#0891b2" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#0891b2" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="kidneyGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#22d3ee"/>' +
        '    <stop offset="50%" stop-color="#0891b2"/>' +
        '    <stop offset="100%" stop-color="#164e63"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#renalHalo)"/>' +
        '<path d="M158 50 L168 50 L168 310 L158 310 Z" fill="#ef4444" rx="2"/>' +
        '<path d="M172 50 L182 50 L182 310 L172 310 Z" fill="#0284c7" rx="2"/>' +
        '<path d="M225 105 C235 90 260 90 270 105 L265 115 L230 115 Z" fill="#f59e0b" stroke="#fbbf24" stroke-width="1.5"/>' +
        '<path d="M240 115 C280 120 295 160 295 200 C295 245 275 285 240 285 C220 285 210 265 215 240 C220 215 220 180 215 155 C210 135 220 115 240 115 Z" fill="url(#kidneyGrad)" stroke="#67e8f9" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M168 190 L218 190" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M172 202 L218 202" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M218 225 C215 250 205 280 200 340" stroke="#fcd34d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M70 120 C80 105 105 105 115 120 L110 130 L75 130 Z" fill="#f59e0b" stroke="#fbbf24" stroke-width="1.5"/>' +
        '<path d="M100 130 C60 135 45 175 45 215 C45 260 65 300 100 300 C120 300 130 280 125 255 C120 230 120 195 125 170 C130 150 120 130 100 130 Z" fill="url(#kidneyGrad)" stroke="#67e8f9" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M122 205 L158 205" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M122 217 L172 217" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M122 240 C125 265 135 295 140 340" stroke="#fcd34d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '</svg>';
    }
    if (key === 'brain') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg brain-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="brainHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.35"/>' +
        '    <stop offset="70%" stop-color="#6d28d9" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#6d28d9" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="brainGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#c4b5fd"/>' +
        '    <stop offset="50%" stop-color="#8b5cf6"/>' +
        '    <stop offset="100%" stop-color="#5b21b6"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#brainHalo)"/>' +
        '<path d="M155 270 L185 270 L180 340 L160 340 Z" fill="#6d28d9" rx="3"/>' +
        '<path d="M115 250 C110 280 145 295 160 270 Z" fill="#7c3aed"/>' +
        '<path d="M225 250 C230 280 195 295 180 270 Z" fill="#7c3aed"/>' +
        '<path d="M90 220 C65 190 65 130 115 85 C160 45 220 50 250 95 C280 140 275 195 245 230 C215 260 170 265 150 260 C120 255 105 240 90 220 Z" fill="url(#brainGrad)" stroke="#c4b5fd" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M100 135 C125 125 145 145 165 130 C185 115 210 120 230 105" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M110 170 C135 160 155 180 180 165 C205 150 235 160 250 140" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M120 205 C145 195 170 215 195 200 C220 185 240 200 245 180" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M145 75 C160 95 155 115 170 125" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M190 80 C205 100 200 120 215 130" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="115" cy="85" r="3" fill="#a78bfa" filter="url(#vitalsGlow)"/>' +
        '<circle cx="230" cy="105" r="3.5" fill="#fbcfe8" filter="url(#vitalsGlow)"/>' +
        '<circle cx="180" cy="165" r="4" fill="#67e8f9" filter="url(#vitalsGlow)"/>' +
        '<circle cx="145" cy="195" r="3" fill="#ddd6fe"/>' +
        '<circle cx="245" cy="180" r="3" fill="#fbcfe8"/>' +
        '</svg>';
    }
    return '';
  }

  /* Render Rehabilitation Plan items */
  function renderRehabPlanHtml(plan) {
    return (plan || []).map(function (item, idx) {
      return '<div class="vitals-rehab-item">' +
        '<div class="vitals-rehab-badge">' + (idx + 1) + '</div>' +
        '<div class="vitals-rehab-text">' +
        '  <div class="rehab-item-title">' + App.esc(item.title) + '</div>' +
        '  <div class="rehab-item-desc">' + App.esc(item.desc) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* Render Medication Adherence list */
  function renderMedListHtml(meds) {
    return (meds || []).map(function (m) {
      return '<div class="vitals-med-item">' +
        '<div class="vitals-med-icon-box">' + m.icon + '</div>' +
        '<div class="vitals-med-details">' +
        '  <div class="med-name">' + App.esc(m.name) + '</div>' +
        '  <div class="med-dosage">' + App.esc(m.dose) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- #/patient/:id : detail (Vitals & Clinical Overview Default) ---------- */
  function renderDetail(a, b, explicitTab) {
    var params = getParams(a, b);
    var p = DB.get('patients', params.id);
    if (!p) { App.toast('Patient not found.', 'err'); App.nav('#/patients'); return; }
    var st = patientStats(p);
    var edit = canEdit();

    // Determine initial active view ('vitals' or 'history')
    var activeTab = explicitTab || (params && params.tab) || 'vitals';
    var curOrganKey = 'lung';
    var curDayIdx = 4; // Day 13 Wed default
    var zoomLevel = 1.0;

    var smpSum = {};
    try { if (window.Samples) smpSum = Samples.summaryMap(); } catch (e) {}

    /* Find latest ready invoice for report button */
    var latestReadyInv = null;
    try {
      var readyInvs = st.invoices.filter(function (inv) {
        return (inv.status === 'ready' || inv.status === 'collected') ||
          (DB.all('results').some(function (r) { return r.invoiceId === inv.id && r.status === 'ready'; }));
      });
      latestReadyInv = readyInvs[0] || st.invoices[0] || null;
    } catch (e) { latestReadyInv = st.invoices[0] || null; }

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
        '<td>' + App.badge(inv.status) + (window.Samples ? Samples.chipHTML(smpSum[inv.id]) : '') + '</td>' +
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
          res = DB.all('results').filter(function (r) { return r.invoiceId === inv.id && r.testId === item.testId; })
            .sort(function (a, b) { return (b.status === 'ready' ? 1 : 0) - (a.status === 'ready' ? 1 : 0) || String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')); })[0] || null;
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

    /* Date timeline pills HTML */
    var datePillsHtml = DAYS_DATA.map(function (d, idx) {
      var isAct = idx === curDayIdx;
      return '<div class="vitals-day-pill' + (isAct ? ' active' : '') + '" data-day-idx="' + idx + '">' +
        '<div class="day-num">' + d.day + '</div>' +
        '<div class="day-name">' + d.name + '</div>' +
        '</div>';
    }).join('');

    /* Carousel thumbnails HTML */
    var organKeys = ['liver', 'lung', 'heart', 'kidneys', 'brain'];
    var carouselThumbsHtml = organKeys.map(function (k) {
      var o = ORGAN_DATA[k];
      var isAct = k === curOrganKey;
      return '<div class="vitals-organ-pill' + (isAct ? ' active' : '') + '" data-organ-pill="' + k + '">' +
        '<div class="organ-thumb-svg">' + renderOrganThumbSvg(k) + '</div>' +
        '<div class="organ-pill-label">' + o.name + '</div>' +
        '</div>';
    }).join('');

    var curOrg = ORGAN_DATA[curOrganKey];
    var curDay = DAYS_DATA[curDayIdx];

    /* Full Page Container HTML */
    var html = '' + WA_CSS +
      '<div class="vitals-view-wrap">' +
      // Top Navigation / Breadcrumbs Row
      '<div class="vitals-breadcrumb-row">' +
      '  <div class="vitals-breadcrumb">' +
      '    <a class="vitals-nav-arrow" href="#/patients" title="Back to All Patients">←</a>' +
      '    <span class="vitals-nav-arrow" style="opacity:0.4;cursor:default">→</span>' +
      '    <span style="display:inline-flex;align-items:center;gap:6px;margin-left:4px">' +
      '      <span>👥</span>' +
      '      <a class="vitals-bc-item" href="#/patients">Patients</a>' +
      '      <span class="vitals-bc-sep">></span>' +
      '      <span class="vitals-bc-item">Patients Profile</span>' +
      '      <span class="vitals-bc-sep">></span>' +
      '      <span class="vitals-bc-curr">Vitals Overview</span>' +
      '    </span>' +
      '  </div>' +

      // Top Actions Bar (View Toggle + Lab Report + Billing)
      '  <div class="vitals-top-actions">' +
      '    <div class="vitals-tab-toggle">' +
      '      <button class="vitals-tab-btn' + (activeTab === 'vitals' ? ' active' : '') + '" id="btnTabVitals">🧬 Vitals Overview</button>' +
      '      <button class="vitals-tab-btn' + (activeTab === 'history' ? ' active' : '') + '" id="btnTabHistory">📋 Invoices & History (' + st.visits + ')</button>' +
      '    </div>' +
      (latestReadyInv ? '    <button class="btn btn-ghost btn-sm" id="btnTopReport" data-inv="' + App.esc(latestReadyInv.id) + '">📄 View Lab Report</button>' : '') +
      '    <a class="btn btn-primary btn-sm" href="#/billing/' + App.esc(p.id) + '">+ New Bill</a>' +
      (edit ? '    <button class="btn btn-ghost btn-sm" id="pt-edit">Edit Details</button>' +
              '    <button class="btn btn-ghost btn-sm btn-danger-ghost" id="pt-del">Delete</button>' : '') +
      '  </div>' +
      '</div>' +

      // TAB 1: NEXURA CARE VITALS OVERVIEW DASHBOARD
      '<div id="vitalsTabWrap" style="' + (activeTab === 'vitals' ? '' : 'display:none') + '">' +
      '  <div class="vitals-header-title-block">' +
      '    <h1>' + App.esc(p.name) + ' Vitals Overview</h1>' +
      '    <p>Real-time monitoring of current physiological metrics and trends.</p>' +
      '  </div>' +

      '  <div class="vitals-main-grid">' +
      // LEFT COLUMN (~60%)
      '    <div class="vitals-left-col">' +
      // CARD 1: Stress Patterns Overview
      '      <div class="vitals-card">' +
      '        <div class="vitals-card-head">' +
      '          <h3>Stress Patterns Overview</h3>' +
      '          <div class="vitals-month-pill" id="btnMonthPicker">April, 2026 ▾</div>' +
      '        </div>' +

      // Date Timeline Strip (09 Sat -> 15 Fri)
      '        <div class="vitals-timeline-strip">' +
      '          <button class="vitals-timeline-arrow" id="btnDayPrev">‹</button>' +
      '          <div style="display:flex;align-items:center;gap:6px;overflow-x:auto;flex:1;justify-content:space-around" id="vitalsDaysTrack">' +
      datePillsHtml +
      '          </div>' +
      '          <button class="vitals-timeline-arrow" id="btnDayNext">›</button>' +
      '        </div>' +

      // Stress Gauge + Trends Info
      '        <div class="vitals-stress-row">' +
      '          <div class="vitals-radial-gauge-box" id="gaugeBox">' +
      renderRadialGaugeSvg(curDay.avg) +
      '            <div class="vitals-gauge-inner">' +
      '              <div class="gauge-pct" id="gaugePctText">' + curDay.avg + '%</div>' +
      '              <div class="gauge-lbl">Avg Stres Level</div>' +
      '            </div>' +
      '          </div>' +

      '          <div class="vitals-stress-info">' +
      '            <h4>Daily Stress Trends</h4>' +
      '            <p id="stressTrendsDesc">' + App.esc(curDay.desc) + '</p>' +
      '            <div class="vitals-peak-stats">' +
      '              <div class="vitals-stat-item">' +
      '                <span class="vitals-stat-lbl">↗ Highest Peak</span>' +
      '                <span class="vitals-stat-val" id="highestPeakVal"><span>' + curDay.peak + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.peakBpm + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.peakTime + '</span></span>' +
      '              </div>' +
      '              <div class="vitals-stat-item">' +
      '                <span class="vitals-stat-lbl">✓ Lowest Point</span>' +
      '                <span class="vitals-stat-val" id="lowestPointVal"><span>' + curDay.low + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.lowBpm + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.lowTime + '</span></span>' +
      '              </div>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +

      // SUB-CARDS ROW: Daily Rehabilitation Plan + Capacity Efficiency / Medication Adherence
      '      <div class="vitals-subcards-row">' +
      // Sub-card A: Daily Rehabilitation Plan
      '        <div class="vitals-card">' +
      '          <div class="vitals-card-head">' +
      '            <h3>Daily Rehabilitation Plan</h3>' +
      '            <button class="card-action-btn" title="More options">⋮</button>' +
      '          </div>' +
      '          <div class="vitals-subcard-subtitle" id="rehabSubtitle">' + App.esc(curOrg.rehabSub) + '</div>' +
      '          <div class="vitals-rehab-list" id="rehabListWrap">' +
      renderRehabPlanHtml(curOrg.rehabPlan) +
      '          </div>' +
      '        </div>' +

      // Sub-card B: Organ Capacity Efficiency + Medication Adherence
      '        <div class="vitals-card">' +
      '          <div class="vitals-efficiency-section">' +
      '            <div class="vitals-card-head" style="margin-bottom:6px">' +
      '              <h3 id="organEffTitle">' + App.esc(curOrg.effTitle) + '</h3>' +
      '              <button class="card-action-btn" title="Efficiency options">⋮</button>' +
      '            </div>' +
      '            <div class="vitals-risk-tag ' + curOrg.riskClass + '" id="organRiskTag">' + App.esc(curOrg.risk) + '</div>' +
      '            <div class="vitals-big-score" id="organScoreVal">' + curOrg.score + '%</div>' +
      '            <div class="vitals-progress-track">' +
      '              <div class="vitals-progress-fill" id="organProgressFill" style="width:' + curOrg.score + '%;background:' + curOrg.barGrad + '"></div>' +
      '            </div>' +
      '            <div class="vitals-progress-labels">' +
      '              <span>0</span><span>100%</span>' +
      '            </div>' +
      '          </div>' +

      // Medication Adherence section
      '          <div>' +
      '            <div class="vitals-card-head" style="margin-bottom:4px">' +
      '              <h3>Medication Adherence</h3>' +
      '              <button class="card-action-btn" title="Medication options">⋮</button>' +
      '            </div>' +
      '            <div class="vitals-subcard-subtitle" id="medsSubtitle">' + App.esc(curOrg.medsSub) + '</div>' +
      '            <div class="vitals-med-list" id="medsListWrap">' +
      renderMedListHtml(curOrg.meds) +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      // RIGHT COLUMN: INTERACTIVE ORGAN ANATOMICAL MODEL STAGE (~40%)
      '    <div class="vitals-right-col">' +
      '      <div class="vitals-stage-card">' +
      // Floating Zoom / Pan Controls
      '        <div class="vitals-stage-controls">' +
      '          <button class="stage-ctrl-btn" id="btnZoomIn" title="Zoom In">+</button>' +
      '          <button class="stage-ctrl-btn" id="btnZoomReset" title="Reset View">✥</button>' +
      '          <button class="stage-ctrl-btn" id="btnZoomOut" title="Zoom Out">−</button>' +
      '        </div>' +

      // Central Organ Visualizer Display
      '        <div class="vitals-organ-canvas-wrap">' +
      '          <div class="vitals-organ-interactive-box" id="organInteractiveBox">' +
      renderStageOrganSvg(curOrganKey) +
      '          </div>' +
      '        </div>' +

      // Floating Clinical Warning Callout Card
      '        <div class="vitals-floating-warning" id="organWarningCard">' +
      '          <div class="vitals-warning-badge-row">' +
      '            <span>⚠️</span><span id="warningBadgeTitle">' + App.esc(curOrg.warningTitle) + '</span>' +
      '          </div>' +
      '          <p class="vitals-warning-desc" id="warningBadgeDesc">' + App.esc(curOrg.warningDesc) + '</p>' +
      '        </div>' +

      // Bottom Organ Carousel Selector
      '        <div class="vitals-organ-carousel">' +
      '          <button class="vitals-carousel-nav" id="btnCarouselPrev">‹</button>' +
      '          <div class="vitals-carousel-track" id="organCarouselTrack">' +
      carouselThumbsHtml +
      '          </div>' +
      '          <button class="vitals-carousel-nav" id="btnCarouselNext">›</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      // TAB 2: INVOICES & HISTORY (Traditional records, lab tests, trends, comparison)
      '<div id="historyTabWrap" style="' + (activeTab === 'history' ? '' : 'display:none') + '">' +
      '  <div class="card pt-profile" style="margin-top:16px"><div class="card-b pt-profile-in">' +
      avatarHTML(p.name, 72) +
      '  <div class="pt-id-block"><h2>' + App.esc(p.name) + ' <span class="badge b-id mono">' + App.esc(p.id) + '</span></h2>' +
      '  <div class="pt-meta">' +
      '  <span>🎂 ' + App.esc(p.age) + ' years</span><span>⚧ ' + App.esc(p.gender) + '</span>' +
      '  <span>📞 ' + App.esc(p.phone || '—') + ' ' + ((p.whatsapp || p.phone) ? waBtn(waTarget(p), 'Chat on WhatsApp') : '') + '</span>' +
      (p.father ? '  <span>👤 ' + App.esc(p.father) + '</span>' : '') +
      (p.dob ? '  <span>🎂 ' + App.esc(p.dob) + '</span>' : '') +
      (p.blood ? '  <span>🩸 ' + App.esc(p.blood) + '</span>' : '') +
      (p.cnic ? '  <span>🪪 ' + App.esc(p.cnic) + '</span>' : '') +
      (p.whatsapp ? '  <span>💬 ' + App.esc(p.whatsapp) + ' ' + waBtn(p.whatsapp, 'Chat on WhatsApp') + '</span>' : '') +
      (p.email ? '  <span>📧 ' + App.esc(p.email) + '</span>' : '') +
      '  <span>👨‍⚕️ ' + App.esc(docName) + '</span>' +
      (p.address ? '  <span>📍 ' + App.esc(p.address) + '</span>' : '') +
      '  <span>🗓 Registered ' + App.dt(p.createdAt) + '</span>' +
      '  </div>' +
      (p.notes ? '  <div class="pt-notes" style="margin-top:10px;font-size:13px;color:#5b6b80">📝 ' + App.esc(p.notes) + '</div>' : '') +
      '  </div></div></div>' +

      '  <div class="stat-grid stat-grid-3" style="margin-top:16px">' +
      '  <div class="stat"><div class="stat-ic blue">🧾</div><div><div class="stat-v">' + st.visits + '</div><div class="stat-l">Total Visits</div></div></div>' +
      '  <div class="stat"><div class="stat-ic teal">💳</div><div><div class="stat-v">' + App.money(st.spent) + '</div><div class="stat-l">Total Spent</div></div></div>' +
      '  <div class="stat"><div class="stat-ic ' + (st.due > 0 ? 'red' : 'green') + '">⏳</div><div><div class="stat-v">' + App.money(st.due) + '</div><div class="stat-l">Outstanding Due</div></div></div>' +
      '  </div>' +

      '  <div class="card" style="margin-top:16px"><div class="card-h"><h3>Lab Tests</h3><span class="muted">' + testRows.length + ' test(s)</span></div>' +
      '  <div class="card-b">' +
      (testRows.length
        ? '    <div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th>Invoice No</th><th>Date</th><th>Status</th><th></th></tr></thead>' +
          '    <tbody>' + labTestRowsHtml + '</tbody></table></div>'
        : App.empty('No tests ordered yet for this patient.')) +
      '  </div></div>' +

      '  <div class="card" id="trCard" style="display:none;margin-top:16px"><div class="card-h" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0">Result Trends</h3><span class="muted">parameter-wise history</span></div>' +
      '  <a href="#/reports/trends?patientId=' + App.esc(p.id) + '" class="btn btn-primary btn-sm" style="margin-left:auto">📈 Open Trends &amp; Delta Dashboard &rarr;</a></div>' +
      '  <div class="card-b" id="trHost"></div></div>' +

      '  <div class="card" style="margin-top:16px"><div class="card-h"><h3>Invoice History</h3><span class="muted">' + st.visits + ' invoice(s)</span>' +
      '  <button class="btn btn-primary btn-sm" id="cmpBtn" style="display:none;margin-left:auto">Compare Selected (2)</button></div>' +
      '  <div class="card-b">' +
      (st.invoices.length
        ? '    <p class="muted" style="font-size:12px;margin-top:0">Tick any 2 invoices to compare their reports side by side.</p>' +
          '    <div class="tbl-wrap"><table class="table"><thead><tr><th></th><th>Invoice No</th><th>Date</th><th>Tests</th>' +
          '    <th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th><th></th></tr></thead>' +
          '    <tbody>' + invRows + '</tbody></table></div>'
        : App.empty('No invoices yet for this patient.')) +
      '  </div></div>' +
      '</div>' +
      '</div>';

    paint(html, function () {
      /* Tab Switcher */
      var btnVitals = document.getElementById('btnTabVitals');
      var btnHistory = document.getElementById('btnTabHistory');
      var vitalsWrap = document.getElementById('vitalsTabWrap');
      var historyWrap = document.getElementById('historyTabWrap');

      function switchTab(t) {
        activeTab = t;
        if (btnVitals) btnVitals.classList.toggle('active', t === 'vitals');
        if (btnHistory) btnHistory.classList.toggle('active', t === 'history');
        if (vitalsWrap) vitalsWrap.style.display = t === 'vitals' ? '' : 'none';
        if (historyWrap) historyWrap.style.display = t === 'history' ? '' : 'none';
      }

      if (btnVitals) btnVitals.addEventListener('click', function () { switchTab('vitals'); });
      if (btnHistory) btnHistory.addEventListener('click', function () { switchTab('history'); });

      /* Date Timeline Click Handling */
      function updateDay(idx) {
        if (idx < 0) idx = 0;
        if (idx >= DAYS_DATA.length) idx = DAYS_DATA.length - 1;
        curDayIdx = idx;
        var day = DAYS_DATA[curDayIdx];

        document.querySelectorAll('#vitalsDaysTrack .vitals-day-pill').forEach(function (pill, i) {
          pill.classList.toggle('active', i === curDayIdx);
        });

        var gBox = document.getElementById('gaugeBox');
        if (gBox) {
          gBox.innerHTML = renderRadialGaugeSvg(day.avg) +
            '<div class="vitals-gauge-inner"><div class="gauge-pct">' + day.avg + '%</div><div class="gauge-lbl">Avg Stres Level</div></div>';
        }
        var desc = document.getElementById('stressTrendsDesc');
        if (desc) desc.textContent = day.desc;

        var hPeak = document.getElementById('highestPeakVal');
        if (hPeak) hPeak.innerHTML = '<span>' + day.peak + '</span><span class="vitals-stat-sep">|</span><span>' + day.peakBpm + '</span><span class="vitals-stat-sep">|</span><span>' + day.peakTime + '</span>';

        var lPoint = document.getElementById('lowestPointVal');
        if (lPoint) lPoint.innerHTML = '<span>' + day.low + '</span><span class="vitals-stat-sep">|</span><span>' + day.lowBpm + '</span><span class="vitals-stat-sep">|</span><span>' + day.lowTime + '</span>';
      }

      document.querySelectorAll('#vitalsDaysTrack .vitals-day-pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
          var idx = parseInt(pill.getAttribute('data-day-idx'), 10);
          updateDay(idx);
        });
      });

      var dayPrev = document.getElementById('btnDayPrev');
      if (dayPrev) dayPrev.addEventListener('click', function () { updateDay(curDayIdx - 1); });
      var dayNext = document.getElementById('btnDayNext');
      if (dayNext) dayNext.addEventListener('click', function () { updateDay(curDayIdx + 1); });

      /* Organ Selection in Carousel */
      function switchOrgan(key) {
        if (!ORGAN_DATA[key]) return;
        curOrganKey = key;
        var org = ORGAN_DATA[curOrganKey];

        document.querySelectorAll('#organCarouselTrack .vitals-organ-pill').forEach(function (pill) {
          pill.classList.toggle('active', pill.getAttribute('data-organ-pill') === key);
        });

        // Update Stage SVG with smooth fade
        var box = document.getElementById('organInteractiveBox');
        if (box) {
          box.style.opacity = '0.3';
          setTimeout(function () {
            box.innerHTML = renderStageOrganSvg(key);
            box.style.opacity = '1';
          }, 150);
        }

        // Update Warning Card
        var wTitle = document.getElementById('warningBadgeTitle');
        if (wTitle) wTitle.textContent = org.warningTitle;
        var wDesc = document.getElementById('warningBadgeDesc');
        if (wDesc) wDesc.textContent = org.warningDesc;

        // Update Capacity Efficiency Section
        var effTitle = document.getElementById('organEffTitle');
        if (effTitle) effTitle.textContent = org.effTitle;
        var riskTag = document.getElementById('organRiskTag');
        if (riskTag) {
          riskTag.textContent = org.risk;
          riskTag.className = 'vitals-risk-tag ' + org.riskClass;
        }
        var scoreVal = document.getElementById('organScoreVal');
        if (scoreVal) scoreVal.textContent = org.score + '%';
        var progFill = document.getElementById('organProgressFill');
        if (progFill) {
          progFill.style.width = org.score + '%';
          progFill.style.background = org.barGrad;
        }

        // Update Rehab Plan
        var rSub = document.getElementById('rehabSubtitle');
        if (rSub) rSub.textContent = org.rehabSub;
        var rWrap = document.getElementById('rehabListWrap');
        if (rWrap) rWrap.innerHTML = renderRehabPlanHtml(org.rehabPlan);

        // Update Medication List
        var mSub = document.getElementById('medsSubtitle');
        if (mSub) mSub.textContent = org.medsSub;
        var mWrap = document.getElementById('medsListWrap');
        if (mWrap) mWrap.innerHTML = renderMedListHtml(org.meds);
      }

      document.querySelectorAll('#organCarouselTrack .vitals-organ-pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
          switchOrgan(pill.getAttribute('data-organ-pill'));
        });
      });

      var carPrev = document.getElementById('btnCarouselPrev');
      if (carPrev) carPrev.addEventListener('click', function () {
        var idx = organKeys.indexOf(curOrganKey);
        var nxt = (idx - 1 + organKeys.length) % organKeys.length;
        switchOrgan(organKeys[nxt]);
      });
      var carNext = document.getElementById('btnCarouselNext');
      if (carNext) carNext.addEventListener('click', function () {
        var idx = organKeys.indexOf(curOrganKey);
        var nxt = (idx + 1) % organKeys.length;
        switchOrgan(organKeys[nxt]);
      });

      /* Zoom Controls */
      var boxEl = document.getElementById('organInteractiveBox');
      function applyZoom(z) {
        zoomLevel = Math.max(0.75, Math.min(1.75, z));
        if (boxEl) boxEl.style.transform = 'scale(' + zoomLevel + ')';
      }
      var zIn = document.getElementById('btnZoomIn');
      if (zIn) zIn.addEventListener('click', function () { applyZoom(zoomLevel + 0.25); });
      var zOut = document.getElementById('btnZoomOut');
      if (zOut) zOut.addEventListener('click', function () { applyZoom(zoomLevel - 0.25); });
      var zReset = document.getElementById('btnZoomReset');
      if (zReset) zReset.addEventListener('click', function () { applyZoom(1.0); });

      /* Lab Results Module loader helper */
      function ensureResultsMod(cb) {
        if (App.enterLabResult && App.viewLabReport && App.printLabReport) { cb(); return; }
        App.loadScript('assets/js/mod-results.js').then(cb, function () { App.toast('Could not load lab results module', 'err'); });
      }

      /* View Lab Report Button in Header */
      var btnTopReport = document.getElementById('btnTopReport');
      if (btnTopReport) {
        btnTopReport.addEventListener('click', function () {
          var invId = btnTopReport.getAttribute('data-inv');
          if (invId) ensureResultsMod(function () { App.viewLabReport(invId); });
        });
      }

      /* Lab test actions in History tab: enter result / view / print */
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

      /* Result trends */
      var hasRes = false;
      try { hasRes = DB.all('results').some(function (r) { return r.status === 'ready' && st.invoices.some(function (i) { return i.id === r.invoiceId; }); }); } catch (e) {}
      if (hasRes) ensureResultsMod(function () {
        var card = document.getElementById('trCard'), host = document.getElementById('trHost');
        if (card && host && App.renderPatientTrends) { card.style.display = ''; App.renderPatientTrends(host, p); }
      });

      /* Report comparison */
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
      var editBtn = document.getElementById('pt-edit');
      if (editBtn) editBtn.addEventListener('click', function () {
        openPatientModal(p, function () { renderDetail({ id: p.id }); });
      });
      var delBtn = document.getElementById('pt-del');
      if (delBtn) delBtn.addEventListener('click', function () {
        deletePatient(p, function () { App.nav('#/patients'); });
      });
    });
  }

  /* ---------- #/patients/new : dedicated full-page add form ---------- */
  function renderAddPage() {
    if (!canEdit()) { App.toast('Not allowed.', 'err'); App.nav('#/patients'); return; }
    var html = '<div class="card"><div class="card-b">' + formHTML({}) + '</div></div>';
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
  App.route('/patient/:id/vitals', function (params) { renderDetail(params, null, 'vitals'); });
  App.route('/patient/:id/history', function (params) { renderDetail(params, null, 'history'); });
})();
