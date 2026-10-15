/* ============================================================
   Optix Medical Sync — SIM Setting module
   Routes: #/sms (SIM Setting page under Tools)
   The lab's own phone app sends SMS from its SIM in the background.
   Depends on: window.DB, window.App
   ============================================================ */
(function () {
  'use strict';

  function denied() { App.toast('You do not have access to SIM Setting.', 'err'); App.nav('#/dashboard'); }

    /* ---- SIM Setting (server outbox -> the lab's own phone app sends from the SIM) ---- */
    function smsDefaults() {
      return {
        enabled: false, simNumber: '',
        autoPatient: true, autoDoctor: false, autoCritical: true,
        tplPatient: '', tplDoctor: '', tplCritical: '', tplDue: ''
      };
    }
    function smsCfg() {
      try { var s = DB.get('settings', 'main') || {}; return Object.assign(smsDefaults(), s.sms || {}); }
      catch (e) { return smsDefaults(); }
    }
    function smsTplDefaults() {
      return {
        tplPatient: '{lab}: Assalam-o-Alaikum {patient}, your lab report (Invoice {invoice}, {date}) is ready. Tests: {tests}. Please collect it from the lab. Thank you.',
        tplDoctor: '{lab}: Assalam-o-Alaikum {doctor}, the lab report of your patient {patient} (Invoice {invoice}) is ready. Thank you.',
        tplCritical: '{lab}: URGENT — critical result for {patient} (Invoice {invoice}): {test} = {value}. Please contact the lab immediately.',
        tplDue: '{lab}: Assalam-o-Alaikum {patient}, your lab report (Invoice {invoice}) is ready. A balance of {due} is pending. Please clear it at the lab. Thank you.'
      };
    }
    function smsTplText(kind) {
      var c = smsCfg(), t = smsTplDefaults();
      var custom = (c[kind] || '').trim();
      return custom || t[kind] || '';
    }

    function renderSetSms() {
      var s = DB.get('settings', 'main') || {};
      var c = Object.assign(smsDefaults(), s.sms || {});
      var t = smsTplDefaults();

      function rowSwitch(id, checked, title, desc) {
        return '<div class="wa-row-item">'
          + '<div class="wa-row-content">'
          + '  <div class="wa-row-title"><span>' + title + '</span></div>'
          + '  <p class="wa-row-desc">' + desc + '</p>'
          + '</div>'
          + '<label class="wa-switch" title="Toggle ' + App.esc(title) + '">'
          + '  <input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>'
          + '  <span class="wa-slider"></span>'
          + '</label>'
          + '</div>';
      }

      function smsLogRow(r) {
        var st = String(r.status || 'pending');
        var badge = st === 'sent' || st === 'delivered'
          ? '<span class="badge b-ready">' + App.esc(st.toUpperCase()) + '</span>'
          : st === 'failed'
            ? '<span class="badge b-pending" style="background:#fee2e2;color:#b91c1c;border-color:#fca5a5">' + App.esc(st.toUpperCase()) + '</span>'
            : '<span class="badge b-pending">' + App.esc(st.toUpperCase()) + '</span>';
        var retry = (st === 'failed') ? ' <button class="btn btn-sm btn-ghost" data-sms-retry="' + App.esc(r.id) + '">Retry</button>' : '';
        var when = ''; try { when = App.dt(r.ts); } catch (e) { when = String(r.ts || ''); }
        return '<tr><td style="white-space:nowrap">' + App.esc(when) + '</td>' +
          '<td>' + App.esc(r.to || '') + '<div class="muted" style="font-size:11px">' + App.esc(r.toName || '') + '</div></td>' +
          '<td>' + App.esc(r.kind || '') + '</td>' +
          '<td>' + App.esc(r.invoiceNo || r.invoiceId || '') + '</td>' +
          '<td>' + badge + (r.error ? '<div class="muted" style="font-size:11px;max-width:220px">' + App.esc(String(r.error).slice(0, 120)) + '</div>' : '') + retry + '</td></tr>';
      }
      function paintSmsLog(rows) {
        var tb = document.getElementById('smsLogBody'); if (!tb) return;
        tb.innerHTML = (rows && rows.length)
          ? rows.map(smsLogRow).join('')
          : '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">No SMS sent yet.</td></tr>';
        tb.querySelectorAll('[data-sms-retry]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-sms-retry');
            DB.smsApi('POST', 'retry', { id: id }).then(function () { App.toast('Re-queued'); loadSmsLog(); }, function (e) { App.toast((e && e.message) || 'Retry failed', 'err'); });
          });
        });
      }
      function loadSmsLog() {
        var tb = document.getElementById('smsLogBody'); if (!tb) return;
        tb.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Loading…</td></tr>';
        DB.smsApi('GET', 'log?limit=100', undefined).then(
          function (j) { paintSmsLog((j && j.rows) || []); },
          function () { paintSmsLog([]); }
        );
      }

      /* phone gateway card: only inside the native Android app */
      /* phone gateway card: only inside the native Android app */
      var gw = (window.App && App.smsGw && App.smsGw.available()) ? App.smsGw : null;
      var gwCard;
      if (gw) {
        gwCard = '<div class="card sms-card sms-wide"><div class="card-h"><h3>Phone gateway</h3><span class="muted" style="font-size:12px">this phone sends the SMS</span></div>'
          + '<div class="card-b">'
          + rowSwitch('smsGwOn', false, 'SMS Gateway', 'When ON, this phone checks the server every minute and sends queued SMS from your SIM.')
          + '<div id="smsGwStatus" class="muted" style="font-size:12px;margin-top:6px">Checking gateway status…</div>'
          + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" id="smsGwPerm">Allow SMS permission</button></div>'
          + '<p class="muted" style="font-size:12px;margin:8px 0 0">For reliable sending, set this app\u2019s battery usage to <b>Unrestricted</b> (Android Settings → Apps → Optix Lab → Battery).</p>'
          + '</div></div>';
      } else {
        gwCard = '';
      }

      var apkDownloadPath = 'assets/apk/Optix-SMS-Gateway.apk';
      var origin = (typeof location !== 'undefined' && location.origin && location.origin.indexOf('http') === 0) ? location.origin : 'https://labpos-api.150.230.52.29.sslip.io';
      var fullApkUrl = origin.replace(/\/+$/, '') + '/' + apkDownloadPath;
      var apkQrImg = '';
      try {
        if (typeof qrcode !== 'undefined') {
          var q = qrcode(0, 'M');
          q.addData(fullApkUrl);
          q.make();
          apkQrImg = q.createDataURL(4, 4);
        }
      } catch (e) {}

      var apkCard =
        '<div class="card sms-card sms-wide sms-apk-banner" style="background:linear-gradient(135deg,#f0fdf4 0%,#e0f2fe 100%);border:2px solid #86efac;border-radius:18px;overflow:hidden;box-shadow:0 4px 16px rgba(34,197,94,0.08)">'
        + '<div class="card-b" style="padding:20px 24px;display:grid;grid-template-columns:minmax(0,1.8fr) minmax(220px,1fr);gap:24px;align-items:center">'
        + '  <div style="display:flex;flex-direction:column;gap:12px">'
        + '    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '      <span style="font-size:26px">📱</span>'
        + '      <h3 style="margin:0;font-size:18px;font-weight:800;color:#0f172a">Optix SIM SMS Gateway APK (Dedicated Mobile App)</h3>'
        + '      <span class="badge b-ready" style="font-size:11px;padding:3px 9px;background:#dcfce7;color:#15803d;border:1px solid #86efac">Dedicated SIM Gateway</span>'
        + '    </div>'
        + '    <p style="margin:0;font-size:13.5px;color:#334155;line-height:1.55">'
        + '      Admin apne Android mobile me yeh special APK install karein. Yeh app background me phone ke SIM card se automated patient &amp; doctor report SMS alerts send karti hai — <b>zero API cost</b> aur standard SIM SMS bundle rates par!'
        + '    </p>'
        + '    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;background:#ffffffcc;border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;font-size:12px;color:#1e293b">'
        + '      <div style="display:flex;align-items:flex-start;gap:8px"><span style="font-weight:800;color:#16a34a">1.</span><span>APK download &amp; mobile me install karein</span></div>'
        + '      <div style="display:flex;align-items:flex-start;gap:8px"><span style="font-weight:800;color:#16a34a">2.</span><span>App open karke SMS Permission allow karein</span></div>'
        + '      <div style="display:flex;align-items:flex-start;gap:8px"><span style="font-weight:800;color:#16a34a">3.</span><span>Apna SIM number add karein &amp; <b>Link SIM</b> dabayein</span></div>'
        + '      <div style="display:flex;align-items:flex-start;gap:8px"><span style="font-weight:800;color:#16a34a">4.</span><span>Test SMS send karein &amp; Dashboard par live status dekhein</span></div>'
        + '    </div>'
        + '    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:4px">'
        + '      <a class="btn btn-primary" id="smsDownloadApkBtn" href="' + apkDownloadPath + '" download="Optix-SMS-Gateway.apk" style="display:inline-flex;align-items:center;gap:8px;padding:9px 18px;font-weight:700;border-radius:10px">'
        + '        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>'
        + '        <span>Download APK (3.9 MB)</span>'
        + '      </a>'
        + '      <button type="button" class="btn btn-ghost" id="smsCopyApkLink" style="display:inline-flex;align-items:center;gap:6px;padding:9px 14px;font-size:12.5px;background:#fff">'
        + '        📋 Copy Download Link'
        + '      </button>'
        + '    </div>'
        + '  </div>'
        + '  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;border:1.5px dashed #86efac;border-radius:14px;padding:14px;text-align:center">'
        + (apkQrImg ? '    <img src="' + apkQrImg + '" alt="Scan to Download APK" style="width:130px;height:130px;border-radius:8px;display:block">' : '<div style="width:130px;height:130px;display:grid;place-items:center;background:#f1f5f9;color:#64748b;font-size:11px">QR Code</div>')
        + '    <div style="font-size:11px;font-weight:700;color:#15803d;margin-top:8px">📱 Mobile se Scan karein</div>'
        + '    <div style="font-size:10.5px;color:#64748b">Direct download on Android</div>'
        + '  </div>'
        + '</div>'
        + '</div>';

      var html = '<style>'
        + '.sms-set-wrap{max-width:1240px;margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}'
        + '.sms-set-wrap>.sms-wide{grid-column:1/-1}'
        + '.sms-set-wrap .card{margin:0;border:1.5px solid #8c9ab3;border-radius:14px;display:flex;flex-direction:column;height:100%}'
        + '.sms-set-wrap .card-h{padding:11px 16px;min-height:50px;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box}.sms-set-wrap .card-b{padding:12px 16px}'
        + '.sms-tpl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}'
        + '.wa-row-item{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid var(--line2)}'
        + '.wa-row-item:first-child{border-top:none;padding-top:2px}'
        + '.wa-row-content{flex:1;min-width:0}'
        + '.wa-row-title{font-size:14px;font-weight:700;color:var(--ink);margin-bottom:2px}'
        + '.wa-row-desc{font-size:12.5px;color:var(--muted);line-height:1.45;margin:0}'
        + '.wa-switch{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;cursor:pointer;margin-top:2px}'
        + '.wa-switch input{opacity:0;width:0;height:0;position:absolute}'
        + '.wa-slider{position:absolute;inset:0;background-color:#cbd5e1;border-radius:99px;transition:.2s ease}'
        + '.wa-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:#fff;border-radius:50%;transition:.2s ease;box-shadow:0 1px 3px rgba(0,0,0,.25)}'
        + '.wa-switch input:checked + .wa-slider{background-color:#16a34a}'
        + '.wa-switch input:checked + .wa-slider:before{transform:translateX(20px)}'
        + '@media(max-width:1000px){.sms-set-wrap{grid-template-columns:1fr}.sms-tpl-grid{grid-template-columns:1fr}}'
        + '.sms-card .card-b{display:flex;flex-direction:column;gap:10px;flex:1}'
        + '.sms-auto-card .card-b{display:flex;flex-direction:column;justify-content:space-between;flex:1}'
        + '.sms-auto-card .wa-row-item{flex:1;display:flex;align-items:center;justify-content:space-between;padding:12px 0}'
        + '.sms-auto-card .wa-row-item:first-child{border-top:none;padding-top:0}'
        + '.sms-auto-card .wa-switch{margin-top:0}'
        + '.sms-field label{display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--mut)}'
        + '.sms-field input,.sms-field textarea,.sms-field select{width:100%;padding:9px 12px;border:1.5px solid #8c9ab3;border-radius:10px;font-size:14px;background:#fff}.sms-field input:focus,.sms-field textarea:focus,.sms-field select:focus{outline:none;border-color:#2f6df6;box-shadow:0 0 0 3px rgba(47,109,246,.16)}'
        + '.sms-field textarea{min-height:64px;resize:vertical}'
        + '.sms-hint{font-size:12px;color:var(--mut)}'
        + '.sms-log-table{width:100%;border-collapse:collapse;font-size:13px}'
        + '.sms-log-table th{text-align:left;font-size:11px;text-transform:uppercase;color:var(--mut);padding:8px 10px;border-bottom:1px solid var(--line2)}'
        + '.sms-log-table td{padding:8px 10px;border-bottom:1px solid var(--line2);vertical-align:top}'
        + '</style>'
        + '<div class="sms-set-wrap">'
        + apkCard

        + '<div class="card sms-card"><div class="card-h"><h3>SIM Setting &amp; Mobile Link</h3><span id="smsConnBadge"></span></div><div class="card-b">'
        + rowSwitch('smsEnabled', !!c.enabled, 'Enable SMS', 'Queue SMS messages whenever reports are ready or alerts fire — just like WhatsApp.')
        + '<div class="sms-field"><label>SIM / Mobile Number</label>'
        + '  <div style="display:flex;gap:8px">'
        + '    <input id="smsSimNumber" placeholder="0300-1234567" value="' + App.esc(c.simNumber || '') + '" style="flex:1">'
        + '    <button type="button" class="btn btn-primary" id="smsLinkBtn" style="white-space:nowrap;padding:0 16px;font-weight:700">Link SIM</button>'
        + '  </div>'
        + '<div class="sms-hint">The SIM number in your phone. Patients will see SMS delivered from this number.</div></div>'
        + '<div id="smsLiveStatusBanner" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:#f1f5f9;font-size:12.5px;color:#334155;border:1px solid #cbd5e1">'
        + '  <span id="smsStatusDot" style="width:10px;height:10px;border-radius:50%;background:#94a3b8;flex-shrink:0"></span>'
        + '  <span id="smsStatusText" style="flex:1">Checking phone connection…</span>'
        + '</div>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
        + '  <button class="btn btn-ghost" id="smsTestSend" style="font-weight:600">📤 Send Test SMS</button>'
        + '  <span id="smsTestMsg" class="sms-hint"></span>'
        + '</div>'
        + '</div></div>'

        + (gwCard || '')

        + '<div class="card sms-card sms-auto-card"><div class="card-h"><h3>Automatic SMS</h3></div><div class="card-b">'
        + rowSwitch('smsAutoPatient', !!c.autoPatient, 'Report ready \u2192 patient', 'Automatically SMS the patient when their full report is ready (same moment WhatsApp would send).')
        + rowSwitch('smsAutoDoctor', !!c.autoDoctor, 'Report ready \u2192 referring doctor', 'Automatically SMS the referring doctor when the report is ready.')
        + rowSwitch('smsAutoCritical', !!c.autoCritical, 'Critical result alerts', 'Immediately SMS the referring doctor and the lab number on critical values.')
        + '</div></div>'

        + '<div class="card sms-card sms-wide"><div class="card-h"><h3>Message templates</h3></div><div class="card-b">'
        + '<div class="sms-hint" style="margin-bottom:2px">Plain text. Placeholders: {lab} {patient} {doctor} {invoice} {date} {tests} {total} {due}. Leave blank to use the default.</div>'
        + '<div class="sms-tpl-grid">'
        + '<div class="sms-field"><label>Report ready — patient</label><textarea id="smsTplPatient" placeholder="' + App.esc(t.tplPatient) + '">' + App.esc(c.tplPatient || '') + '</textarea></div>'
        + '<div class="sms-field"><label>Report ready — doctor</label><textarea id="smsTplDoctor" placeholder="' + App.esc(t.tplDoctor) + '">' + App.esc(c.tplDoctor || '') + '</textarea></div>'
        + '<div class="sms-field"><label>Critical alert</label><textarea id="smsTplCritical" placeholder="' + App.esc(t.tplCritical) + '">' + App.esc(c.tplCritical || '') + '</textarea></div>'
        + '<div class="sms-field"><label>Balance pending — patient</label><textarea id="smsTplDue" placeholder="' + App.esc(t.tplDue) + '">' + App.esc(c.tplDue || '') + '</textarea></div>'
        + '</div></div></div>'

        + '<div class="card sms-card sms-wide"><div class="card-h"><h3>SMS log</h3><button class="btn btn-sm btn-ghost" id="smsRetryAll">Retry all failed</button></div>'
        + '<div class="card-b" style="overflow-x:auto"><table class="sms-log-table"><thead><tr><th>When</th><th>To</th><th>Type</th><th>Invoice</th><th>Status</th></tr></thead>'
        + '<tbody id="smsLogBody"><tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Loading…</td></tr></tbody></table></div></div>'

        + '<div class="sms-wide" style="margin:0 0 14px"><button class="btn btn-primary" id="smsSaveAll" style="padding:10px 26px;font-weight:700">Save SMS settings</button></div>'
        + '</div>';

      document.getElementById('view').innerHTML = html;

      function g(id) { return document.getElementById(id); }
      function collect() {
        var st = DB.get('settings', 'main') || {}, sc = Object.assign(smsDefaults(), st.sms || {});
        sc.enabled = !!(g('smsEnabled') && g('smsEnabled').checked);
        if (g('smsSimNumber')) sc.simNumber = g('smsSimNumber').value.trim();
        if (g('smsAutoPatient')) sc.autoPatient = g('smsAutoPatient').checked;
        if (g('smsAutoDoctor')) sc.autoDoctor = g('smsAutoDoctor').checked;
        if (g('smsAutoCritical')) sc.autoCritical = g('smsAutoCritical').checked;
        if (g('smsTplPatient')) sc.tplPatient = g('smsTplPatient').value.trim();
        if (g('smsTplDoctor')) sc.tplDoctor = g('smsTplDoctor').value.trim();
        if (g('smsTplCritical')) sc.tplCritical = g('smsTplCritical').value.trim();
        if (g('smsTplDue')) sc.tplDue = g('smsTplDue').value.trim();
        return sc;
      }
      function saveSms(notify) {
        var st = DB.get('settings', 'main') || {};
        st.sms = collect();
        DB.update('settings', 'main', st);
        if (notify !== false) App.toast('SMS settings saved');
        return true;
      }

      var saveBtn = g('smsSaveAll');
      if (saveBtn) saveBtn.addEventListener('click', function () { saveSms(true); refreshSmsStatus(); });
      ['smsEnabled', 'smsAutoPatient', 'smsAutoDoctor', 'smsAutoCritical'].forEach(function (id) {
        var el = g(id);
        if (el) el.addEventListener('change', function () { if (saveSms(false)) App.toast((this.checked ? 'Switched ON' : 'Switched OFF') + ' \u2014 saved'); });
      });
      var simInput = g('smsSimNumber');
      if (simInput) simInput.addEventListener('change', function () { saveSms(false); });
      ['smsTplPatient', 'smsTplDoctor', 'smsTplCritical', 'smsTplDue'].forEach(function (id) {
        var el = g(id);
        if (el) el.addEventListener('change', function () { saveSms(false); });
      });

      var copyBtn = g('smsCopyApkLink');
      if (copyBtn) copyBtn.addEventListener('click', function () {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(fullApkUrl);
            App.toast('APK download link copied to clipboard!');
          } else {
            prompt('Copy APK Download Link:', fullApkUrl);
          }
        } catch (e) {
          prompt('Copy APK Download Link:', fullApkUrl);
        }
      });

      var linkBtn = g('smsLinkBtn');
      if (linkBtn) linkBtn.addEventListener('click', function () {
        var num = (g('smsSimNumber') && g('smsSimNumber').value.trim()) || '';
        if (!num) { App.toast('Enter your SIM phone number first', 'err'); return; }
        linkBtn.disabled = true;
        linkBtn.textContent = 'Linking…';
        DB.smsApi('POST', 'link', { simNumber: num }).then(function (j) {
          linkBtn.disabled = false;
          linkBtn.textContent = 'Link SIM';
          if (j && j.ok) {
            saveSms(false);
            App.toast('SIM Number linked successfully! Mobile connected.', 'ok');
            refreshSmsStatus();
          } else {
            App.toast((j && j.error) || 'Failed to link SIM', 'err');
          }
        }, function (e) {
          linkBtn.disabled = false;
          linkBtn.textContent = 'Link SIM';
          App.toast((e && e.message) || 'Server unreachable', 'err');
        });
      });

      function setBadge(ok, txt) {
        var b = g('smsConnBadge'); if (!b) return;
        b.innerHTML = '<span class="badge ' + (ok ? 'b-ready' : 'b-pending') + '">' + App.esc(txt) + '</span>';
      }
      function refreshSmsStatus() {
        setBadge(false, 'CHECKING\u2026');
        var banner = g('smsLiveStatusBanner');
        var dot = g('smsStatusDot');
        var text = g('smsStatusText');
        DB.smsApi('GET', 'status', undefined).then(function (j) {
          if (j && j.ok) {
            var isConn = !!j.connected;
            var num = j.simNumber || (g('smsSimNumber') && g('smsSimNumber').value.trim()) || '';
            var bits = [j.enabled ? 'ON' : 'OFF'];
            if (j.pending) bits.push(j.pending + ' QUEUED');
            if (j.failed) bits.push(j.failed + ' FAILED');
            if (isConn) {
              bits.unshift('CONNECTED');
              setBadge(true, bits.join(' \u00B7 '));
              if (banner) {
                banner.style.background = '#f0fdf4';
                banner.style.borderColor = '#86efac';
                banner.style.color = '#15803d';
              }
              if (dot) {
                dot.style.background = '#22c55e';
                dot.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
              }
              if (text) {
                text.innerHTML = '<b>🟢 SIM Connected: ' + App.esc(num || 'Active') + '</b>' + (j.deviceModel ? ' &middot; ' + App.esc(j.deviceModel) : '') + (j.lastPoll ? ' &middot; Phone seen ' + App.dt(j.lastPoll) : '') + ' &middot; Ready to send SMS';
              }
            } else if (num) {
              bits.unshift('PHONE WAITING');
              setBadge(false, bits.join(' \u00B7 '));
              if (banner) {
                banner.style.background = '#fffbeb';
                banner.style.borderColor = '#fde68a';
                banner.style.color = '#b45309';
              }
              if (dot) {
                dot.style.background = '#f59e0b';
                dot.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.25)';
              }
              if (text) {
                text.innerHTML = '<b>🟡 SIM Configured: ' + App.esc(num) + '</b> &middot; Waiting for phone connection. Install the APK and open app on phone.';
              }
            } else {
              bits.unshift('NOT LINKED');
              setBadge(false, bits.join(' \u00B7 '));
              if (banner) {
                banner.style.background = '#f8fafc';
                banner.style.borderColor = '#e2e8f0';
                banner.style.color = '#64748b';
              }
              if (dot) {
                dot.style.background = '#94a3b8';
                dot.style.boxShadow = 'none';
              }
              if (text) {
                text.textContent = '⚪ Phone not connected yet. Download the APK on mobile and link your SIM number.';
              }
            }
          } else setBadge(false, 'ERROR');
        }, function () { setBadge(false, 'SERVER UNREACHABLE'); });
      }
      refreshSmsStatus();

      var tsBtn = g('smsTestSend');
      if (tsBtn) tsBtn.addEventListener('click', function () {
        var b = this; saveSms(false); b.disabled = true;
        var msgEl = g('smsTestMsg'); if (msgEl) msgEl.textContent = 'Queueing test SMS…';
        var sc = collect();
        if (!sc.simNumber) { b.disabled = false; if (msgEl) msgEl.textContent = 'Enter your SIM number above first.'; return; }
        var labName = (DB.get('settings', 'main') || {}).labName || 'Optix Medical Sync';
        DB.smsApi('POST', 'queue', {
          to: sc.simNumber,
          text: labName + ': Test SMS from your lab SIM Gateway. If you received this on your mobile, SMS service is fully linked and working!',
          kind: 'test'
        }).then(function (j) {
          b.disabled = false;
          if (j && j.ok) {
            var smsId = j.id;
            if (msgEl) msgEl.innerHTML = '<span style="color:#2563eb">⏳ Test SMS queued (ID: ' + App.esc(smsId) + '). Phone is sending via SIM…</span>';
            loadSmsLog(); refreshSmsStatus();
            var pollCount = 0;
            var pollTimer = setInterval(function () {
              pollCount++;
              DB.smsApi('GET', 'status', undefined).then(function (st) {
                if (st && st.connected) refreshSmsStatus();
              });
              DB.smsApi('GET', 'log?limit=5', undefined).then(function (res) {
                var row = res && res.rows && res.rows.find(function (r) { return r.id === smsId; });
                if (row) {
                  if (row.status === 'sent' || row.status === 'delivered') {
                    clearInterval(pollTimer);
                    if (msgEl) msgEl.innerHTML = '<span style="color:#16a34a;font-weight:700">✅ Test SMS sent successfully from SIM!</span>';
                    loadSmsLog(); refreshSmsStatus();
                  } else if (row.status === 'failed') {
                    clearInterval(pollTimer);
                    if (msgEl) msgEl.innerHTML = '<span style="color:#dc2626;font-weight:700">❌ Sending failed: ' + App.esc(row.error || 'Gateway error') + '</span>';
                    loadSmsLog(); refreshSmsStatus();
                  }
                }
                if (pollCount >= 15) {
                  clearInterval(pollTimer);
                  if (msgEl && !msgEl.textContent.includes('✅') && !msgEl.textContent.includes('❌')) {
                    msgEl.textContent = 'Test SMS queued. Your mobile phone will pick it up on its next check cycle.';
                  }
                }
              });
            }, 2000);
          } else {
            if (msgEl) msgEl.textContent = 'Could not queue the test SMS.';
          }
        }, function (e) {
          b.disabled = false;
          if (msgEl) msgEl.textContent = 'Failed: ' + (e && e.message ? e.message : 'server unreachable');
        });
      });

      /* phone gateway card wiring (native app only) */
      function paintGwStatus() {
        var el = g('smsGwStatus'); if (!el || !gw) return;
        gw.status().then(function (st) {
          var sw = g('smsGwOn'); if (sw) sw.checked = !!st.enabled;
          var bits = [st.enabled ? 'Gateway is ON' : 'Gateway is OFF'];
          if (st.lastPoll) { try { bits.push('last check ' + App.dt(st.lastPoll)); } catch (e) { bits.push('last check ' + String(st.lastPoll)); } }
          if (st.sentCount) bits.push(st.sentCount + ' sent');
          if (!st.permission) bits.push('SMS permission not granted');
          el.textContent = bits.join(' \u00B7 ');
        }, function () { el.textContent = 'Could not read gateway status.'; });
      }
      if (gw) {
        paintGwStatus();
        var gwSw = g('smsGwOn');
        if (gwSw) gwSw.addEventListener('change', function () {
          var on = gwSw.checked;
          gw.setEnabled(on).then(function () {
            App.toast(on ? 'SMS Gateway ON \u2014 this phone will now send queued SMS' : 'SMS Gateway OFF');
            paintGwStatus();
          }, function (e) {
            gwSw.checked = !on;
            App.toast((e && e.message) || 'Could not change gateway state', 'err');
          });
        });
        var permBtn = g('smsGwPerm');
        if (permBtn) permBtn.addEventListener('click', function () {
          gw.requestPermission().then(function (r) {
            var ok = !!(r && r.granted);
            App.toast(ok ? 'SMS permission granted' : 'SMS permission was not granted \u2014 the gateway cannot send without it.', ok ? undefined : 'err');
            paintGwStatus();
          }, function (e) { App.toast((e && e.message) || 'Permission request failed', 'err'); });
        });
      }

      loadSmsLog();
      var raBtn = g('smsRetryAll');
      if (raBtn) raBtn.addEventListener('click', function () {
        DB.smsApi('POST', 'retry', { all: true }).then(function (j) { App.toast('Re-queued ' + ((j && j.requeued) || 0) + ' message(s)'); loadSmsLog(); }, function (e) { App.toast((e && e.message) || 'Retry failed', 'err'); });
      });
    }

  /* (openSmsSettingsTab is defined below in the footer -> #/sms) */

  /* ---- page renderer ---- */
  function renderSmsPage() {
    var s = null;
    try { s = App.session(); } catch (e) {}
    if (!s || (s.role !== 'admin' && s.role !== 'reception' && !(s.role === 'custom' && App.canPage('sms')))) return denied();
    renderSetSms(); /* renders into #view and wires its own events */
  }

  App.route('#/sms', renderSmsPage);
  App.route('#/sms/log', function () { App.nav('#/sms'); });

  /* kept for compatibility with callers that open the old settings tab */
  App.openSmsSettingsTab = function () { App.nav('#/sms'); };

})();
