/* Optix LAB MedSync — Patient & doctor portal (#/portal/<lab-id>)
   A person enters their mobile number, gets a 6-digit code (WhatsApp, or email), and sees their own reports (patient) or the reports of the
   patients they referred plus their monthly commission (doctor). Public page: no staff login, no staff data — it only talks to /api/portal/*. */
(function () {
  'use strict';
  var A = window.App, esc = A.esc, API = String(window.LABPOS_API || '').replace(/\/+$/, '');
  var SKEY = 'labpos_portal';
  var S = { lab: '', info: null, step: 'phone', phone: '', token: '', data: null, tab: 'patient', busy: false, err: '', note: '', cool: 0 };

  var CSS = '' +
    'body.portal-mode{background:#eef2fa;margin:0;font-family:"Plus Jakarta Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1b2540}' +
    '.pt-wrap{max-width:560px;margin:0 auto;padding:18px 16px 40px}' +
    '.pt-head{display:flex;align-items:center;gap:14px;padding:6px 2px 16px}.pt-logo{width:52px;height:52px;border-radius:14px;object-fit:cover;background:#131845;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex:none}' +
    '.pt-head h1{margin:0;font-size:19px;line-height:1.2;color:#131845}.pt-head p{margin:2px 0 0;font-size:13px;color:#5b6785}' +
    '.pt-card{background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(19,24,69,.08);padding:20px;margin-bottom:14px}' +
    '.pt-card h2{margin:0 0 6px;font-size:18px;color:#131845}.pt-sub{margin:0 0 14px;font-size:13.5px;color:#5b6785;line-height:1.5}' +
    '.pt-in{width:100%;box-sizing:border-box;height:50px;border:1.5px solid #cdd7ee;border-radius:12px;padding:0 14px;font-size:17px;font-family:inherit;outline:none;background:#fbfcff}' +
    '.pt-in:focus{border-color:#131845;box-shadow:0 0 0 3px rgba(19,24,69,.08)}.pt-code{letter-spacing:10px;text-align:center;font-size:24px;font-weight:800}' +
    '.pt-btn{width:100%;height:50px;border:0;border-radius:12px;background:linear-gradient(135deg,#2b3a7a,#131845);color:#fff;font-size:16px;font-weight:800;margin-top:12px;cursor:pointer;font-family:inherit}' +
    '.pt-btn:disabled{opacity:.55;cursor:default}.pt-link{background:none;border:0;color:#2b3a7a;font-weight:700;font-size:13.5px;cursor:pointer;margin-top:12px;font-family:inherit;padding:4px}' +
    '.pt-err{background:#fdecec;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}.pt-ok{background:#e6f7f0;color:#047857;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}' +
    '.pt-tabs{display:flex;gap:8px;margin-bottom:14px}.pt-tabs button{flex:1;height:42px;border:1.5px solid #cdd7ee;background:#fff;border-radius:12px;font-weight:800;color:#2a3558;font-size:14px;cursor:pointer;font-family:inherit}.pt-tabs button.on{background:#131845;color:#fff;border-color:#131845}' +
    '.pt-rep{border:1px solid #e3e9f6;border-radius:14px;padding:14px;margin-bottom:10px;background:#fff}.pt-rep b{font-size:15px}.pt-rep .m{font-size:12.5px;color:#6b7694;margin-top:2px}.pt-rep .t{font-size:13.5px;margin:8px 0;color:#2a3558;line-height:1.45}' +
    '.pt-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px}.pt-chip.g{background:#e6f7f0;color:#047857}.pt-chip.o{background:#fff4e0;color:#b45309}.pt-chip.n{background:#eef1f7;color:#52607f}' +
    '.pt-open{display:block;text-align:center;text-decoration:none;background:#131845;color:#fff;border-radius:10px;padding:11px;font-weight:800;margin-top:8px}' +
    '.pt-mo{width:100%;border-collapse:collapse;font-size:13.5px}.pt-mo th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#6b7694;text-align:right;padding:6px 4px;border-bottom:2px solid #e3e9f6}.pt-mo th:first-child,.pt-mo td:first-child{text-align:left}' +
    '.pt-mo td{padding:9px 4px;border-bottom:1px solid #eef1f7;text-align:right}.pt-foot{text-align:center;font-size:12px;color:#8a94ad;margin-top:18px}' +
    '.pt-out{float:right;background:none;border:0;color:#2b3a7a;font-weight:800;cursor:pointer;font-size:13px;font-family:inherit}';

  function api(path, opt) {
    opt = opt || {};
    var h = { 'Content-Type': 'application/json' }; if (opt.token) h.Authorization = 'Bearer ' + opt.token;
    return window.fetch(API + '/api/portal/' + path, { method: opt.body ? 'POST' : 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.code = j.code; throw e; } return j; });
    }, function () { throw new Error('No internet connection. Please check and try again.'); });
  }
  function slugFrom(hash) { var m = /^#\/portal\/([A-Za-z0-9-]+)/.exec(hash || ''); return m ? m[1].toLowerCase() : ''; }
  function save() { try { sessionStorage.setItem(SKEY, JSON.stringify({ lab: S.lab, token: S.token, at: Date.now() })); } catch (e) {} }
  function clear() { try { sessionStorage.removeItem(SKEY); } catch (e) {} S.token = ''; S.data = null; }
  function money(n) { return 'Rs ' + Math.round(+n || 0).toLocaleString('en-US'); }
  function mlabel(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  function dlabel(d) { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }

  function paint() {
    if (!document.getElementById('ptCss')) { var st = document.createElement('style'); st.id = 'ptCss'; st.textContent = CSS; document.head.appendChild(st); }
    document.body.className = 'portal-mode';
    var i = S.info, name = (i && i.labName) || 'Patient portal';
    var h = '<div class="pt-wrap"><div class="pt-head">' + (i && i.logo ? '<img class="pt-logo" src="' + esc(i.logo) + '" alt="">' : '<div class="pt-logo">' + esc(name.charAt(0).toUpperCase()) + '</div>') +
      '<div><h1>' + esc(name) + '</h1><p>' + esc((i && i.tagline) || 'Your reports, anytime') + '</p></div></div>';
    if (!S.lab) {
      h += card('<h2>Which lab?</h2><p class="pt-sub">Enter the Lab ID printed on your invoice or shared by your lab.</p><input class="pt-in" id="ptLab" placeholder="e.g. al-shifa" autocapitalize="off"><button class="pt-btn" id="ptLabGo">Continue</button>');
    } else if (i && i.enabled === false) {
      h += card('<h2>Not available</h2><p class="pt-sub">This lab has not switched on its online reports yet. Please ask the lab for your report.</p>');
    } else if (!i) {
      h += card('<p class="pt-sub" style="margin:0">Loading…</p>');
    } else if (S.step === 'phone') {
      h += card('<h2>View your reports</h2><p class="pt-sub">Enter the mobile number you gave the lab. We will send you a 6-digit code' + (i.whatsapp ? ' on WhatsApp' : ' by email') + '.</p>' + msg() +
        '<input class="pt-in" id="ptPhone" type="tel" inputmode="tel" placeholder="03XX XXXXXXX" value="' + esc(S.phone) + '" autocomplete="tel"><button class="pt-btn" id="ptSend"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Sending…' : 'Send me the code') + '</button>');
    } else if (S.step === 'code') {
      h += card('<h2>Enter the code</h2><p class="pt-sub">If <b>' + esc(S.phone) + '</b> is registered with the lab, a code was just sent. It is valid for 10 minutes.</p>' + msg() +
        '<input class="pt-in pt-code" id="ptCode" type="tel" inputmode="numeric" maxlength="6" placeholder="······" autocomplete="one-time-code"><button class="pt-btn" id="ptVerify"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Checking…' : 'Show my reports') + '</button>' +
        '<div style="display:flex;justify-content:space-between"><button class="pt-link" id="ptResend"' + (S.cool > 0 ? ' disabled style="opacity:.5"' : '') + '>' + (S.cool > 0 ? 'Send again in ' + S.cool + 's' : 'Send a new code') + '</button><button class="pt-link" id="ptBack">Change number</button></div>');
    } else {
      h += dataHtml();
    }
    h += '<div class="pt-foot">Powered by System Optix</div></div>';
    document.body.innerHTML = h; wire();
  }
  function card(x) { return '<div class="pt-card">' + x + '</div>'; }
  function msg() { return (S.err ? '<div class="pt-err">' + esc(S.err) + '</div>' : '') + (S.note ? '<div class="pt-ok">' + esc(S.note) + '</div>' : ''); }

  function repHtml(r, doc) {
    var chip = r.status === 'ready' ? '<span class="pt-chip g">Ready</span>' : (r.status === 'locked' ? '<span class="pt-chip o">Balance pending</span>' : (r.status === 'preparing' ? '<span class="pt-chip n">Getting ready</span>' : '<span class="pt-chip n">Not ready yet</span>'));
    return '<div class="pt-rep"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>' + esc(doc ? (r.patient || r.no) : r.no) + '</b><div class="m">' + (doc ? esc(r.no) + ' · ' : '') + dlabel(r.date) + '</div></div>' + chip + '</div>' +
      '<div class="t">' + esc(r.tests || '—') + '</div>' + (doc && r.total ? '<div class="m">Billed ' + money(r.total) + '</div>' : '') +
      (r.status === 'ready' && r.link ? '<a class="pt-open" href="' + esc(r.link) + '" target="_blank" rel="noopener">Open / download report</a>' : '') +
      (r.status === 'locked' ? '<div class="m" style="margin-top:6px">Balance ' + money(r.due) + ' is pending. Please clear it at the lab to get your report here.</div>' : '') +
      (r.status === 'preparing' ? '<div class="m" style="margin-top:6px">Your report is finishing up. Please check again in a few minutes.</div>' : '') + '</div>';
  }
  function dataHtml() {
    var d = S.data; if (!d) return card('<p class="pt-sub" style="margin:0">Loading your reports…</p>');
    var both = d.patient && d.doctor, tab = both ? S.tab : (d.doctor ? 'doctor' : 'patient');
    var h = '<div class="pt-card" style="padding:14px 18px"><button class="pt-out" id="ptOut">Sign out</button><b>' + esc((d.patient && d.patient.names[0]) || (d.doctor && d.doctor.names[0]) || '') + '</b><div class="pt-sub" style="margin:2px 0 0">Signed in. This page closes itself after 30 minutes.</div></div>';
    if (both) h += '<div class="pt-tabs"><button data-tab="patient" class="' + (tab === 'patient' ? 'on' : '') + '">My reports</button><button data-tab="doctor" class="' + (tab === 'doctor' ? 'on' : '') + '">Doctor panel</button></div>';
    if (tab === 'patient' && d.patient) {
      h += '<div class="pt-card"><h2>Your reports</h2>' + (d.patient.reports.length ? d.patient.reports.map(function (r) { return repHtml(r, false); }).join('') : '<p class="pt-sub" style="margin:0">No reports yet.</p>') + '</div>';
    } else if (d.doctor) {
      h += '<div class="pt-card"><h2>Commission</h2><p class="pt-sub">Month by month, on the bills of the patients you referred.</p>' +
        (d.doctor.months.length ? '<table class="pt-mo"><thead><tr><th>Month</th><th>Cases</th><th>Billed</th><th>Commission</th><th>Due</th></tr></thead><tbody>' + d.doctor.months.map(function (m) {
          return '<tr><td><b>' + esc(mlabel(m.month)) + '</b></td><td>' + m.referrals + '</td><td>' + money(m.billed) + '</td><td>' + money(m.commission) + '</td><td style="color:' + (m.due > 0 ? '#b91c1c' : '#047857') + ';font-weight:800">' + money(m.due) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="pt-sub" style="margin:0">No referrals yet.</p>') + '</div>' +
        '<div class="pt-card"><h2>Reports of your patients</h2>' + (d.doctor.reports.length ? d.doctor.reports.map(function (r) { return repHtml(r, true); }).join('') : '<p class="pt-sub" style="margin:0">No reports yet.</p>') + '</div>';
    }
    return h;
  }

  function wire() {
    function on(id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('click', fn); }
    function enter(id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') fn(); }); }
    var lg = function () { var v = (document.getElementById('ptLab').value || '').trim().toLowerCase(); if (v) location.hash = '#/portal/' + v.replace(/[^a-z0-9-]/g, ''); };
    on('ptLabGo', lg); enter('ptLab', lg);
    var send = function () {
      var p = (document.getElementById('ptPhone').value || '').trim(); S.phone = p; S.err = ''; S.note = '';
      if (p.replace(/\D/g, '').length < 10) { S.err = 'Enter your 11-digit mobile number (for example 0300 1234567).'; paint(); return; }
      S.busy = true; paint();
      api('request', { body: { lab: S.lab, phone: p } }).then(function () { S.busy = false; S.step = 'code'; S.cool = 30; tick(); paint(); }, function (e) { S.busy = false; S.err = e.message; paint(); });
    };
    on('ptSend', send); enter('ptPhone', send);
    var verify = function () {
      var c = (document.getElementById('ptCode').value || '').replace(/\D/g, ''); S.err = '';
      if (c.length !== 6) { S.err = 'Enter the 6-digit code.'; paint(); return; }
      S.busy = true; paint();
      api('verify', { body: { lab: S.lab, phone: S.phone, code: c } }).then(function (j) { S.busy = false; S.token = j.token; S.step = 'data'; S.data = null; S.tab = j.patient ? 'patient' : 'doctor'; save(); load(); paint(); }, function (e) { S.busy = false; S.err = e.message; paint(); });
    };
    on('ptVerify', verify); enter('ptCode', verify);
    on('ptResend', function () { if (S.cool > 0) return; S.err = ''; S.note = 'A new code was requested.'; S.busy = true; api('request', { body: { lab: S.lab, phone: S.phone } }).then(function () { S.busy = false; S.cool = 30; tick(); paint(); }, function (e) { S.busy = false; S.err = e.message; S.note = ''; paint(); }); paint(); });
    on('ptBack', function () { S.step = 'phone'; S.err = ''; S.note = ''; paint(); });
    on('ptOut', function () { clear(); S.step = 'phone'; S.err = ''; S.note = ''; paint(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { S.tab = b.getAttribute('data-tab'); paint(); }); });
    var f = document.getElementById('ptPhone') || document.getElementById('ptCode') || document.getElementById('ptLab'); if (f && S.step !== 'data') { try { f.focus(); } catch (e) {} }
  }
  var timer = null;
  function tick() { clearInterval(timer); timer = setInterval(function () { if (S.cool > 0) { S.cool--; var b = document.getElementById('ptResend'); if (b) { b.textContent = S.cool > 0 ? 'Send again in ' + S.cool + 's' : 'Send a new code'; if (S.cool === 0) { b.disabled = false; b.style.opacity = ''; } } } else clearInterval(timer); }, 1000); }
  function load() {
    api('data', { token: S.token }).then(function (d) { S.data = d; paint(); }, function (e) {
      if (e.code === 'EXPIRED') { clear(); S.step = 'phone'; S.err = 'Your session ended. Please sign in again.'; } else { S.err = e.message; S.step = 'phone'; }
      paint();
    });
  }

  A.renderPortal = function (hash) {
    var slug = slugFrom(hash);
    if (slug !== S.lab) { S.lab = slug; S.info = null; S.step = 'phone'; S.err = ''; S.note = ''; S.token = ''; S.data = null; }
    paint();
    if (!slug) return;
    var restored = false;
    try { var r = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); if (r && r.lab === slug && r.token && Date.now() - r.at < 29 * 60000) { S.token = r.token; S.step = 'data'; restored = true; } } catch (e) {}
    api('info?lab=' + encodeURIComponent(slug)).then(function (i) { S.info = i; paint(); if (restored && i.enabled) load(); }, function (e) { S.info = { enabled: false }; S.err = e.message; paint(); });
  };
})();
