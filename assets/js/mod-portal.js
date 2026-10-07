/* Optix Medical Science — Patient & doctor dashboard (#/portal, #/portal/<lab-id>)
   Works like a small app: sign in once with a mobile number + 6-digit code (optionally "keep me signed in on this phone"), then
   a bottom bar: Home / Reports (patient) or Home / Patients / Commission (doctor). Public page: no staff login, no staff data,
   it only talks to /api/portal/*. */
(function () {
  'use strict';
  var A = window.App, esc = A.esc, API = String(window.LABPOS_API || '').replace(/\/+$/, '');
  var SS = 'labpos_portal', LS = 'labpos_portal_ls', LLAB = 'labpos_portal_lab', LPH = 'labpos_portal_phone';
  var inApp = /OptixApp/.test(navigator.userAgent || '');
  var S = { doc: false, pwOpen: false, pwMsg: '', lab: '', info: null, step: 'phone', phone: '', token: '', data: null, role: '', view: 'home', q: '', filt: 'all', busy: false, err: '', note: '', cool: 0, remember: inApp };

  var CSS = '' +
    'body.portal-mode{background:#eef2fa;margin:0;font-family:"Plus Jakarta Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1b2540}' +
    '.pt-wrap{max-width:560px;margin:0 auto;padding:14px 14px 96px}' +
    '.pt-head{display:flex;align-items:center;gap:12px;padding:4px 2px 14px}.pt-logo{width:46px;height:46px;border-radius:13px;object-fit:cover;background:#131845;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;flex:none}' +
    '.pt-head h1{margin:0;font-size:17px;line-height:1.2;color:#131845}.pt-head p{margin:2px 0 0;font-size:12.5px;color:#5b6785}.pt-head .sp{flex:1}' +
    '.pt-ic{width:38px;height:38px;border-radius:11px;border:0;background:#fff;color:#2b3a7a;font-size:17px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(19,24,69,.08);font-family:inherit}' +
    '.pt-card{background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(19,24,69,.08);padding:18px;margin-bottom:14px}' +
    '.pt-card h2{margin:0 0 6px;font-size:17px;color:#131845}.pt-sub{margin:0 0 14px;font-size:13.5px;color:#5b6785;line-height:1.5}' +
    '.pt-in{width:100%;box-sizing:border-box;height:50px;border:1.5px solid #cdd7ee;border-radius:12px;padding:0 14px;font-size:17px;font-family:inherit;outline:none;background:#fbfcff}' +
    '.pt-in:focus{border-color:#131845;box-shadow:0 0 0 3px rgba(19,24,69,.08)}.pt-code{letter-spacing:10px;text-align:center;font-size:24px;font-weight:800}.pt-s{height:44px;font-size:15px}' +
    '.pt-btn{width:100%;height:50px;border:0;border-radius:12px;background:linear-gradient(135deg,#2b3a7a,#131845);color:#fff;font-size:16px;font-weight:800;margin-top:12px;cursor:pointer;font-family:inherit}' +
    '.pt-btn:disabled{opacity:.55;cursor:default}.pt-link{background:none;border:0;color:#2b3a7a;font-weight:700;font-size:13.5px;cursor:pointer;margin-top:10px;font-family:inherit;padding:4px}' +
    '.pt-chk{display:flex;gap:8px;align-items:center;font-size:13.5px;color:#2a3558;margin-top:12px}.pt-chk input{width:18px;height:18px;accent-color:#131845}' +
    '.pt-err{background:#fdecec;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}.pt-ok{background:#e6f7f0;color:#047857;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}' +
    '.pt-hi{font-size:20px;font-weight:800;color:#131845;margin:2px 2px 2px}.pt-hs{font-size:13px;color:#5b6785;margin:0 2px 14px}' +
    '.pt-seg{display:flex;background:#dfe6f5;border-radius:12px;padding:3px;margin-bottom:14px}.pt-seg button{flex:1;height:36px;border:0;border-radius:10px;background:none;font-weight:800;color:#44527a;font-size:13.5px;cursor:pointer;font-family:inherit}.pt-seg button.on{background:#fff;color:#131845;box-shadow:0 2px 6px rgba(19,24,69,.1)}' +
    '.pt-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.pt-st{background:#fff;border-radius:16px;padding:14px;box-shadow:0 6px 18px rgba(19,24,69,.06)}.pt-st .k{font-size:11.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#6b7694}.pt-st b{display:block;font-size:22px;margin-top:4px;color:#131845}.pt-st.red b{color:#b91c1c}.pt-st.grn b{color:#047857}' +
    '.pt-last{background:linear-gradient(135deg,#2b3a7a,#131845);color:#fff;border-radius:18px;padding:18px;margin-bottom:14px;box-shadow:0 12px 30px rgba(19,24,69,.22)}.pt-last .k{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.75}.pt-last b{display:block;font-size:18px;margin:6px 0 2px}.pt-last .m{font-size:13px;opacity:.8;margin-bottom:12px}' +
    '.pt-last a{display:block;text-align:center;text-decoration:none;background:#fff;color:#131845;border-radius:11px;padding:12px;font-weight:800}' +
    '.pt-rep{border:1px solid #e3e9f6;border-radius:14px;padding:14px;margin-bottom:10px;background:#fff}.pt-rep b{font-size:15px}.pt-rep .m{font-size:12.5px;color:#6b7694;margin-top:2px}.pt-rep .t{font-size:13.5px;margin:8px 0;color:#2a3558;line-height:1.45}' +
    '.pt-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap}.pt-chip.g{background:#e6f7f0;color:#047857}.pt-chip.o{background:#fff4e0;color:#b45309}.pt-chip.n{background:#eef1f7;color:#52607f}' +
    '.pt-open{display:block;text-align:center;text-decoration:none;background:#131845;color:#fff;border-radius:10px;padding:11px;font-weight:800;margin-top:8px}' +
    '.pt-fl{display:flex;gap:8px;margin:10px 0 14px}.pt-fl button{flex:1;height:36px;border:1.5px solid #cdd7ee;background:#fff;border-radius:99px;font-weight:700;color:#44527a;font-size:13px;cursor:pointer;font-family:inherit}.pt-fl button.on{background:#131845;color:#fff;border-color:#131845}' +
    '.pt-mo{width:100%;border-collapse:collapse;font-size:13.5px}.pt-mo th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#6b7694;text-align:right;padding:6px 4px;border-bottom:2px solid #e3e9f6}.pt-mo th:first-child,.pt-mo td:first-child{text-align:left}' +
    '.pt-mo td{padding:9px 4px;border-bottom:1px solid #eef1f7;text-align:right}.pt-foot{text-align:center;font-size:12px;color:#8a94ad;margin-top:18px}' +
    '.pt-bar{position:fixed;left:0;right:0;bottom:0;background:#fff;box-shadow:0 -6px 24px rgba(19,24,69,.10);display:flex;justify-content:center;padding:6px 8px calc(6px + env(safe-area-inset-bottom));z-index:5}' +
    '.pt-bar div{display:flex;max-width:560px;width:100%}.pt-bar button{flex:1;border:0;background:none;padding:7px 4px;font-family:inherit;font-size:11.5px;font-weight:800;color:#8590ad;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px}.pt-bar button i{font-style:normal;font-size:19px}.pt-bar button.on{color:#131845}';

  function api(path, opt) {
    opt = opt || {};
    var h = { 'Content-Type': 'application/json' }; if (opt.token) h.Authorization = 'Bearer ' + opt.token;
    return window.fetch(API + '/api/portal/' + path, { method: opt.body ? 'POST' : 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.code = j.code; throw e; } return j; });
    }, function () { throw new Error('No internet connection. Please check and try again.'); });
  }
  function slugFrom(hash) { var m = /^#\/portal\/([A-Za-z0-9-]+)/.exec(hash || ''); return m ? m[1].toLowerCase() : ''; }
  function lget(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k) || ''; } catch (e) { return ''; } }
  function lset(k, v, s) { try { var st = s ? sessionStorage : localStorage; if (v) st.setItem(k, v); else st.removeItem(k); } catch (e) {} }
  function save(days) {
    var rec = JSON.stringify({ lab: S.lab, token: S.token, at: Date.now(), days: days || 0 });
    lset(LS, '', false); lset(SS, '', true);
    if (days) lset(LS, rec, false); else lset(SS, rec, true);
    lset(LLAB, S.lab, false); lset(LPH, S.phone, false);
  }
  function clear() { lset(LS, '', false); lset(SS, '', true); S.token = ''; S.data = null; }
  function restore(slug) {
    var ls = null, ss = null; try { ls = JSON.parse(lget(LS)); } catch (e) {} try { ss = JSON.parse(lget(SS, true)); } catch (e) {}
    var r = (ls && ls.lab === slug && Date.now() - ls.at < (ls.days || 1) * 86400000 - 60000) ? ls : ((ss && ss.lab === slug && Date.now() - ss.at < 29 * 60000) ? ss : null);
    return r && r.token ? r.token : '';
  }
  function money(n) { return 'Rs ' + Math.round(+n || 0).toLocaleString('en-US'); }
  function mlabel(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  function dlabel(d) { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function nowMonth() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

  function card(x) { return '<div class="pt-card">' + x + '</div>'; }
  function msg() { return (S.err ? '<div class="pt-err">' + esc(S.err) + '</div>' : '') + (S.note ? '<div class="pt-ok">' + esc(S.note) + '</div>' : ''); }

  function repHtml(r, doc) {
    var chip = r.status === 'ready' ? '<span class="pt-chip g">Ready</span>' : (r.status === 'locked' ? '<span class="pt-chip o">Balance pending</span>' : (r.status === 'preparing' ? '<span class="pt-chip n">Getting ready</span>' : '<span class="pt-chip n">Not ready yet</span>'));
    return '<div class="pt-rep"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>' + esc(doc ? (r.patient || r.no) : r.no) + '</b><div class="m">' + (doc ? esc(r.no) + ' · ' : '') + dlabel(r.date) + '</div></div>' + chip + '</div>' +
      '<div class="t">' + esc(r.tests || '—') + '</div>' + (doc && r.total ? '<div class="m">Billed ' + money(r.total) + '</div>' : '') +
      (r.status === 'ready' && r.link ? '<a class="pt-open" href="' + esc(r.link) + '" target="_blank" rel="noopener">Open / download report</a>' : '') +
      (r.status === 'locked' ? '<div class="m" style="margin-top:6px">Balance ' + money(r.due) + ' is pending. Please clear it at the lab to get your report here.</div>' : '') +
      (r.status === 'preparing' ? '<div class="m" style="margin-top:6px">The report is finishing up. Please check again in a few minutes.</div>' : '') + '</div>';
  }
  function filtered(list) {
    var q = S.q.toLowerCase();
    return list.filter(function (r) {
      if (S.filt === 'ready' && r.status !== 'ready') return false;
      if (S.filt === 'wait' && (r.status === 'ready')) return false;
      return !q || (String(r.patient) + ' ' + r.no + ' ' + r.tests).toLowerCase().indexOf(q) >= 0;
    });
  }
  function listHtml(list, doc, empty) {
    var f = filtered(list);
    return '<input class="pt-in pt-s" id="ptQ" placeholder="Search ' + (doc ? 'patient, test or invoice' : 'test or invoice') + '…" value="' + esc(S.q) + '">' +
      '<div class="pt-fl"><button data-f="all" class="' + (S.filt === 'all' ? 'on' : '') + '">All</button><button data-f="ready" class="' + (S.filt === 'ready' ? 'on' : '') + '">Ready</button><button data-f="wait" class="' + (S.filt === 'wait' ? 'on' : '') + '">Waiting</button></div>' +
      (f.length ? f.map(function (r) { return repHtml(r, doc); }).join('') : '<p class="pt-sub" style="margin:0">' + esc(S.q || S.filt !== 'all' ? 'Nothing matches.' : empty) + '</p>');
  }

  /* ---- the dashboard ---- */
  function appHtml() {
    var d = S.data; if (!d) return card('<p class="pt-sub" style="margin:0">Loading your reports…</p>');
    var both = !!(d.patient && d.doctor), role = both ? (S.role || 'patient') : (d.doctor ? 'doctor' : 'patient'), h = '';
    if (both) h += '<div class="pt-seg"><button data-role="patient" class="' + (role === 'patient' ? 'on' : '') + '">As patient</button><button data-role="doctor" class="' + (role === 'doctor' ? 'on' : '') + '">As doctor</button></div>';
    if (role === 'patient') {
      var P = d.patient, reps = P.reports, rdy = reps.filter(function (r) { return r.status === 'ready'; }), wait = reps.filter(function (r) { return r.status !== 'ready'; }), last = rdy[0];
      if (S.view === 'reports') return h + '<div class="pt-card"><h2>All reports</h2>' + listHtml(reps, false, 'No reports yet.') + '</div>';
      h += '<div class="pt-hi">Hello, ' + esc(P.names[0] || '') + '</div><div class="pt-hs">Your reports from ' + esc(d.lab.name || 'the lab') + '</div>';
      if (last) h += '<div class="pt-last"><div class="k">Your latest report</div><b>' + esc(last.tests || last.no) + '</b><div class="m">' + esc(last.no) + ' · ' + dlabel(last.date) + '</div><a href="' + esc(last.link) + '" target="_blank" rel="noopener">Open / download report</a></div>';
      h += '<div class="pt-stats"><div class="pt-st"><div class="k">Reports</div><b>' + reps.length + '</b></div><div class="pt-st grn"><div class="k">Ready</div><b>' + rdy.length + '</b></div><div class="pt-st"><div class="k">Waiting</div><b>' + wait.length + '</b></div>' +
        '<div class="pt-st ' + (reps.some(function (r) { return r.status === 'locked'; }) ? 'red' : '') + '"><div class="k">Balance pending</div><b>' + reps.filter(function (r) { return r.status === 'locked'; }).length + '</b></div></div>';
      var recent = reps.slice(0, 3);
      h += '<div class="pt-card"><h2>Recent</h2>' + (recent.length ? recent.map(function (r) { return repHtml(r, false); }).join('') : '<p class="pt-sub" style="margin:0">No reports yet.</p>') + (reps.length > 3 ? '<button class="pt-link" data-v="reports">See all ' + reps.length + ' reports →</button>' : '') + '</div>';
      return h;
    }
    var D = d.doctor, mo = D.months, cur = mo.filter(function (m) { return m.month === nowMonth(); })[0] || { referrals: 0, billed: 0, commission: 0, paid: 0, due: 0 };
    var totDue = mo.reduce(function (a, m) { return a + m.due; }, 0), waiting = D.reports.filter(function (r) { return r.status !== 'ready'; }).length;
    if (S.view === 'patients') return h + '<div class="pt-card"><h2>Your patients\' reports</h2>' + listHtml(D.reports, true, 'No reports yet.') + '</div>';
    if (S.view === 'commission') {
      return h + '<div class="pt-card"><h2>Commission</h2><p class="pt-sub">Month by month, on the bills of the patients you referred. Total still due: <b style="color:' + (totDue > 0 ? '#b91c1c' : '#047857') + '">' + money(totDue) + '</b></p>' +
        (mo.length ? '<table class="pt-mo"><thead><tr><th>Month</th><th>Cases</th><th>Billed</th><th>Commission</th><th>Due</th></tr></thead><tbody>' + mo.map(function (m) {
          return '<tr><td><b>' + esc(mlabel(m.month)) + '</b></td><td>' + m.referrals + '</td><td>' + money(m.billed) + '</td><td>' + money(m.commission) + '</td><td style="color:' + (m.due > 0 ? '#b91c1c' : '#047857') + ';font-weight:800">' + money(m.due) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="pt-sub" style="margin:0">No referrals yet.</p>') + '</div>';
    }
    h += '<div class="pt-hi">Hello, ' + esc(D.names[0] || '') + '</div><div class="pt-hs">Your referrals to ' + esc(d.lab.name || 'the lab') + '</div>' +
      '<div class="pt-stats"><div class="pt-st"><div class="k">Cases this month</div><b>' + cur.referrals + '</b></div><div class="pt-st"><div class="k">Commission this month</div><b>' + money(cur.commission) + '</b></div>' +
      '<div class="pt-st ' + (totDue > 0 ? 'red' : 'grn') + '"><div class="k">Total commission due</div><b>' + money(totDue) + '</b></div><div class="pt-st"><div class="k">Reports waiting</div><b>' + waiting + '</b></div></div>' +
      '<div class="pt-card"><h2>Latest reports</h2>' + (D.reports.length ? D.reports.slice(0, 4).map(function (r) { return repHtml(r, true); }).join('') : '<p class="pt-sub" style="margin:0">No reports yet.</p>') + (D.reports.length > 4 ? '<button class="pt-link" data-v="patients">See all patients →</button>' : '') + '</div>';
    if (S.doc) { /* a doctor with his own username + password can change it here */
      h += '<div class="pt-card"><h2>My account</h2>' + (S.pwOpen ?
        (S.pwMsg ? '<div class="pt-err">' + esc(S.pwMsg) + '</div>' : '') + '<input class="pt-in pt-s" id="ptCur" type="password" placeholder="Current password" autocomplete="current-password"><div style="height:8px"></div><input class="pt-in pt-s" id="ptNew" type="password" placeholder="New password (min 6 characters)" autocomplete="new-password">' +
        '<button class="pt-btn" id="ptPwSave">Save new password</button><button class="pt-link" id="ptPwCancel">Cancel</button>'
        : (S.pwMsg ? '<div class="pt-ok">' + esc(S.pwMsg) + '</div>' : '') + '<button class="pt-link" id="ptPw" style="margin-top:0">Change my password</button>') + '</div>';
    }
    return h;
  }
  function barHtml() {
    var d = S.data; if (!d) return '';
    var role = (d.patient && d.doctor) ? (S.role || 'patient') : (d.doctor ? 'doctor' : 'patient');
    var tabs = role === 'patient' ? [['home', '🏠', 'Home'], ['reports', '📄', 'Reports']] : [['home', '🏠', 'Home'], ['patients', '👥', 'Patients'], ['commission', '💰', 'Commission']];
    return '<div class="pt-bar"><div>' + tabs.map(function (t) { return '<button data-v="' + t[0] + '" class="' + (S.view === t[0] ? 'on' : '') + '"><i>' + t[1] + '</i>' + t[2] + '</button>'; }).join('') + '</div></div>';
  }

  function paint() {
    if (!document.getElementById('ptCss')) { var st = document.createElement('style'); st.id = 'ptCss'; st.textContent = CSS; document.head.appendChild(st); }
    document.body.className = 'portal-mode';
    var i = S.info, name = (i && i.labName) || 'Reports portal', inApp2 = S.step === 'app';
    var h = '<div class="pt-wrap"><div class="pt-head">' + (i && i.logo ? '<img class="pt-logo" src="' + esc(i.logo) + '" alt="">' : '<div class="pt-logo">' + esc(name.charAt(0).toUpperCase()) + '</div>') +
      '<div><h1>' + esc(name) + '</h1><p>' + esc((i && i.tagline) || 'Your reports, anytime') + '</p></div><span class="sp"></span>' +
      (inApp2 ? '<button class="pt-ic" id="ptRef" title="Refresh">↻</button> <button class="pt-ic" id="ptOut" title="Sign out">⎋</button>' : '') + '</div>';
    if (!S.lab) {
      h += card('<h2>Which lab?</h2><p class="pt-sub">Enter the Lab ID printed on your invoice or shared by your lab.</p><input class="pt-in" id="ptLab" placeholder="e.g. al-shifa" autocapitalize="off"><button class="pt-btn" id="ptLabGo">Continue</button>');
    } else if (i && i.enabled === false) {
      h += card('<h2>Not available</h2><p class="pt-sub">This lab has not switched on online reports yet. Please ask the lab for your report.</p><button class="pt-link" id="ptOther">Use a different Lab ID</button>');
    } else if (!i) {
      h += card('<p class="pt-sub" style="margin:0">Loading…</p>');
    } else if (S.step === 'phone') {
      h += card('<h2>View your reports</h2><p class="pt-sub">Patients and doctors: enter the mobile number you gave the lab. We will send you a 6-digit code' + (i.whatsapp ? ' on WhatsApp' : ' by email') + '.</p>' + msg() +
        '<input class="pt-in" id="ptPhone" type="tel" inputmode="tel" placeholder="03XX XXXXXXX" value="' + esc(S.phone) + '" autocomplete="tel"><button class="pt-btn" id="ptSend"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Sending…' : 'Send me the code') + '</button>');
    } else if (S.step === 'code') {
      h += card('<h2>Enter the code</h2><p class="pt-sub">If <b>' + esc(S.phone) + '</b> is registered with the lab, a code was just sent. It is valid for 10 minutes.</p>' + msg() +
        '<input class="pt-in pt-code" id="ptCode" type="tel" inputmode="numeric" maxlength="6" placeholder="······" autocomplete="one-time-code">' +
        '<label class="pt-chk"><input type="checkbox" id="ptRem"' + (S.remember ? ' checked' : '') + '> Keep me signed in on this phone for 30 days</label>' +
        '<button class="pt-btn" id="ptVerify"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Checking…' : 'Show my reports') + '</button>' +
        '<div style="display:flex;justify-content:space-between"><button class="pt-link" id="ptResend"' + (S.cool > 0 ? ' disabled style="opacity:.5"' : '') + '>' + (S.cool > 0 ? 'Send again in ' + S.cool + 's' : 'Send a new code') + '</button><button class="pt-link" id="ptBack">Change number</button></div>');
    } else {
      h += msg() + appHtml();
    }
    h += '<div class="pt-foot">Powered by System Optix</div></div>' + (S.step === 'app' ? barHtml() : '');
    document.body.innerHTML = h; wire();
  }

  function wire() {
    function on(id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('click', fn); }
    function enter(id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') fn(); }); }
    var lg = function () { var v = (document.getElementById('ptLab').value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, ''); if (v) location.hash = '#/portal/' + v; };
    on('ptLabGo', lg); enter('ptLab', lg);
    on('ptOther', function () { lset(LLAB, '', false); S.lab = ''; S.info = null; location.hash = '#/portal'; });
    var send = function () {
      var p = (document.getElementById('ptPhone').value || '').trim(); S.phone = p; S.err = ''; S.note = '';
      if (p.replace(/\D/g, '').length < 10) { S.err = 'Enter your 11-digit mobile number (for example 0300 1234567).'; paint(); return; }
      S.busy = true; paint();
      api('request', { body: { lab: S.lab, phone: p } }).then(function () { S.busy = false; S.step = 'code'; S.cool = 30; tick(); paint(); }, function (e) { S.busy = false; S.err = e.message; paint(); });
    };
    on('ptSend', send); enter('ptPhone', send);
    var verify = function () {
      var c = (document.getElementById('ptCode').value || '').replace(/\D/g, ''); S.err = ''; S.remember = !!(document.getElementById('ptRem') || {}).checked;
      if (c.length !== 6) { S.err = 'Enter the 6-digit code.'; paint(); return; }
      S.busy = true; paint();
      api('verify', { body: { lab: S.lab, phone: S.phone, code: c, remember: S.remember } }).then(function (j) { S.busy = false; S.token = j.token; S.step = 'app'; S.data = null; S.view = 'home'; S.q = ''; S.filt = 'all'; S.role = j.patient ? 'patient' : 'doctor'; save(j.days); load(); paint(); }, function (e) { S.busy = false; S.err = e.message; paint(); });
    };
    on('ptVerify', verify); enter('ptCode', verify);
    on('ptResend', function () { if (S.cool > 0) return; S.err = ''; S.note = 'A new code was requested.'; S.busy = true; api('request', { body: { lab: S.lab, phone: S.phone } }).then(function () { S.busy = false; S.cool = 30; tick(); paint(); }, function (e) { S.busy = false; S.err = e.message; S.note = ''; paint(); }); paint(); });
    on('ptBack', function () { S.step = 'phone'; S.err = ''; S.note = ''; paint(); });
    on('ptOut', function () { if (S.doc) { A.logout(); return; } clear(); S.step = 'phone'; S.err = ''; S.note = ''; paint(); });
    on('ptRef', function () { S.data = null; paint(); if (S.doc) A.renderDoctorHome(); else load(); });
    on('ptPw', function () { S.pwOpen = true; S.pwMsg = ''; paint(); });
    on('ptPwCancel', function () { S.pwOpen = false; S.pwMsg = ''; paint(); });
    on('ptPwSave', function () {
      var cur = (document.getElementById('ptCur') || {}).value || '', nw = (document.getElementById('ptNew') || {}).value || '';
      if (nw.length < 6) { S.pwMsg = 'The new password must be at least 6 characters.'; paint(); return; }
      var sess = null; try { sess = JSON.parse(localStorage.getItem('labpos_session') || 'null'); } catch (e) {}
      window.fetch(API + '/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sess && sess.token) }, body: JSON.stringify({ current: cur, next: nw }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not change the password'); return j; }); })
        .then(function (j) { try { if (j.token && sess) { sess.token = j.token; localStorage.setItem('labpos_session', JSON.stringify(sess)); } } catch (e) {} S.pwOpen = false; S.pwMsg = 'Password changed.'; paint(); },
          function (e) { S.pwMsg = e.message; paint(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function () { S.view = b.getAttribute('data-v'); S.q = ''; S.filt = 'all'; paint(); window.scrollTo(0, 0); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-role]'), function (b) { b.addEventListener('click', function () { S.role = b.getAttribute('data-role'); S.view = 'home'; S.q = ''; S.filt = 'all'; paint(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) { b.addEventListener('click', function () { S.filt = b.getAttribute('data-f'); paint(); }); });
    var q = document.getElementById('ptQ'); if (q) q.addEventListener('input', function () { S.q = q.value; var pos = q.selectionStart; paint(); var n = document.getElementById('ptQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } });
    var f = document.getElementById('ptPhone') || document.getElementById('ptCode') || document.getElementById('ptLab'); if (f && S.step !== 'app') { try { f.focus(); } catch (e) {} }
  }
  var timer = null;
  function tick() { clearInterval(timer); timer = setInterval(function () { if (S.cool > 0) { S.cool--; var b = document.getElementById('ptResend'); if (b) { b.textContent = S.cool > 0 ? 'Send again in ' + S.cool + 's' : 'Send a new code'; if (S.cool === 0) { b.disabled = false; b.style.opacity = ''; } } } else clearInterval(timer); }, 1000); }
  function load() {
    api('data', { token: S.token }).then(function (d) { S.data = d; S.err = ''; paint(); }, function (e) {
      if (e.code === 'EXPIRED') { clear(); S.step = 'phone'; S.err = 'Your session ended. Please sign in again.'; } else { S.err = e.message; S.step = 'phone'; }
      paint();
    });
  }

  /* signed in with a doctor login (Settings -> Users & Roles): the same dashboard, loaded with the session instead of a code */
  A.renderDoctorHome = function () {
    var sess = null; try { sess = JSON.parse(localStorage.getItem('labpos_session') || 'null'); } catch (e) {}
    if (!sess || !sess.token) { location.hash = '#/login'; return; }
    S.doc = true; S.step = 'app'; S.role = 'doctor'; S.lab = S.lab || sess.lab || 'doctor';
    if (!S.data) { S.info = null; paint(); }
    window.fetch(API + '/api/doctor/me', { headers: { Authorization: 'Bearer ' + sess.token } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { A.logout(); return; }
        if (!r.ok) { S.err = j.error || 'Could not load your dashboard.'; S.data = null; S.info = { enabled: true, labName: 'Doctor dashboard' }; paint(); return; }
        S.err = ''; S.data = j; S.info = { enabled: true, labName: (j.lab && j.lab.name) || 'Doctor dashboard', tagline: 'Your referrals and commission' }; paint();
      });
    }, function () { S.err = 'No internet connection. Please check and try again.'; S.info = { enabled: true, labName: 'Doctor dashboard' }; paint(); });
  };

  A.renderPortal = function (hash) {
    /* one-tap link from the WhatsApp message: #/portal/<lab>?p=<phone>&c=<code> -> sign in without typing, then hide the code from the address bar */
    var mq = /\?(?:.*&)?p=(\d{10})&c=(\d{6})/.exec(hash || ''), tap = null;
    if (mq) { tap = { p: mq[1], c: mq[2] }; try { history.replaceState(null, '', location.href.split('#')[0] + '#/portal/' + slugFrom(hash)); } catch (e) {} }
    var slug = slugFrom(hash) || lget(LLAB) || lget('labpos_lab');
    if (slug !== S.lab) { S.lab = slug; S.info = null; S.step = 'phone'; S.err = ''; S.note = ''; S.token = ''; S.data = null; S.view = 'home'; }
    if (!S.phone) S.phone = lget(LPH);
    paint();
    if (!slug) return;
    var tk = tap ? '' : restore(slug); if (tk) { S.token = tk; S.step = 'app'; }
    if (tap) { S.phone = tap.p; S.step = 'code'; S.busy = true; }
    api('info?lab=' + encodeURIComponent(slug)).then(function (i) {
      S.info = i; if (!i.enabled) { S.step = 'phone'; S.busy = false; }
      paint();
      if (tap && i.enabled) {
        api('verify', { body: { lab: slug, phone: tap.p, code: tap.c, remember: S.remember } }).then(function (j) { S.busy = false; S.token = j.token; S.step = 'app'; S.data = null; S.view = 'home'; S.role = j.patient ? 'patient' : 'doctor'; save(j.days); load(); paint(); },
          function (e) { S.busy = false; S.step = 'phone'; S.err = 'This link has expired or was already used. Enter your number to get a new code.'; paint(); });
      } else if (tk && i.enabled) load();
    }, function (e) { S.info = { enabled: false }; S.err = e.message; paint(); });
  };
})();
