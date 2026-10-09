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
      var gw = (window.App && App.smsGw && App.smsGw.available()) ? App.smsGw : null;
      var gwCard;
      if (gw) {
        gwCard = '<div class="card sms-card"><div class="card-h"><h3>Phone gateway</h3><span class="muted" style="font-size:12px">this phone sends the SMS</span></div>'
          + '<div class="card-b">'
          + rowSwitch('smsGwOn', false, 'SMS Gateway', 'When ON, this phone checks the server every minute and sends queued SMS from your SIM.')
          + '<div id="smsGwStatus" class="muted" style="font-size:12px;margin-top:6px">Checking gateway status…</div>'
          + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" id="smsGwPerm">Allow SMS permission</button></div>'
          + '<p class="muted" style="font-size:12px;margin:8px 0 0">For reliable sending, set this app\u2019s battery usage to <b>Unrestricted</b> (Android Settings → Apps → Optix Lab → Battery).</p>'
          + '</div></div>';
      } else {
        gwCard = '<div class="card sms-card"><div class="card-b">'
          + '<p class="muted" style="font-size:13px;margin:0">\U0001F4F2 SMS messages go out from <b>your own mobile phone</b> through the Optix lab app — no extra app or setup needed. Open this page in the app on the phone that holds the SIM and switch the gateway ON there.</p>'
          + '</div></div>';
      }

      var html = '<style>'
        + '.sms-set-wrap{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:14px}'
        + '.sms-set-head{padding:6px 2px}'
        + '.sms-set-title{font-size:20px;font-weight:800;margin:0}'
        + '.sms-set-sub{color:var(--mut);font-size:13px;margin:4px 0 0}'
        + '.sms-brand-ico{width:44px;height:44px;border-radius:12px;background:#e0f2fe;display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}'
        + '.sms-card .card-b{display:flex;flex-direction:column;gap:10px}'
        + '.sms-field label{display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--mut)}'
        + '.sms-field input,.sms-field textarea,.sms-field select{width:100%;padding:9px 10px;border:1px solid var(--line2);border-radius:8px;font-size:14px;background:var(--bg)}'
        + '.sms-field textarea{min-height:64px;resize:vertical}'
        + '.sms-hint{font-size:12px;color:var(--mut)}'
        + '.sms-log-table{width:100%;border-collapse:collapse;font-size:13px}'
        + '.sms-log-table th{text-align:left;font-size:11px;text-transform:uppercase;color:var(--mut);padding:8px 10px;border-bottom:1px solid var(--line2)}'
        + '.sms-log-table td{padding:8px 10px;border-bottom:1px solid var(--line2);vertical-align:top}'
        + '</style>'
        + '<div class="sms-set-wrap">'
        + '<div class="sms-set-head">'
        + '  <div style="display:flex;align-items:center;gap:14px"><div class="sms-brand-ico">\U0001F4F2</div>'
        + '  <div><h2 class="sms-set-title">SIM Setting</h2>'
        + '  <p class="sms-set-sub">Send report alerts as plain SMS from your own SIM card — the Optix app on your phone does the sending.</p></div></div>'
        + '</div>'

        + '<div class="card sms-card"><div class="card-h"><h3>SIM Setting</h3><span id="smsConnBadge"></span></div><div class="card-b">'
        + rowSwitch('smsEnabled', !!c.enabled, 'Enable SMS', 'Queue SMS messages whenever reports are ready or alerts fire — just like WhatsApp.')
        + '<div class="sms-field"><label>SIM / mobile number</label><input id="smsSimNumber" placeholder="0300-1234567" value="' + App.esc(c.simNumber || '') + '">'
        + '<div class="sms-hint">The number patients will see the SMS coming from — the SIM in your phone.</div></div>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn btn-ghost" id="smsTestSend">Send test SMS</button><span id="smsTestMsg" class="sms-hint"></span></div>'
        + '</div></div>'

        + gwCard

        + '<div class="card sms-card"><div class="card-h"><h3>Automatic SMS</h3></div><div class="card-b">'
        + rowSwitch('smsAutoPatient', !!c.autoPatient, 'Report ready \u2192 patient', 'Automatically SMS the patient when their full report is ready (same moment WhatsApp would send).')
        + rowSwitch('smsAutoDoctor', !!c.autoDoctor, 'Report ready \u2192 referring doctor', 'Automatically SMS the referring doctor when the report is ready.')
        + rowSwitch('smsAutoCritical', !!c.autoCritical, 'Critical result alerts', 'Immediately SMS the referring doctor and the lab number on critical values.')
        + '</div></div>'

        + '<div class="card sms-card"><div class="card-h"><h3>Message templates</h3></div><div class="card-b">'
        + '<div class="sms-hint" style="margin-bottom:2px">Plain text. Placeholders: {lab} {patient} {doctor} {invoice} {date} {tests} {total} {due}. Leave blank to use the default.</div>'
        + '<div class="sms-field"><label>Report ready — patient</label><textarea id="smsTplPatient" placeholder="' + App.esc(t.tplPatient) + '">' + App.esc(c.tplPatient || '') + '</textarea></div>'
        + '<div class="sms-field"><label>Report ready — doctor</label><textarea id="smsTplDoctor" placeholder="' + App.esc(t.tplDoctor) + '">' + App.esc(c.tplDoctor || '') + '</textarea></div>'
        + '<div class="sms-field"><label>Critical alert</label><textarea id="smsTplCritical" placeholder="' + App.esc(t.tplCritical) + '">' + App.esc(c.tplCritical || '') + '</textarea></div>'
        + '<div class="sms-field"><label>Balance pending — patient</label><textarea id="smsTplDue" placeholder="' + App.esc(t.tplDue) + '">' + App.esc(c.tplDue || '') + '</textarea></div>'
        + '</div></div>'

        + '<div class="card sms-card"><div class="card-h"><h3>SMS log</h3><button class="btn btn-sm btn-ghost" id="smsRetryAll">Retry all failed</button></div>'
        + '<div class="card-b" style="overflow-x:auto"><table class="sms-log-table"><thead><tr><th>When</th><th>To</th><th>Type</th><th>Invoice</th><th>Status</th></tr></thead>'
        + '<tbody id="smsLogBody"><tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Loading…</td></tr></tbody></table></div></div>'

        + '<div style="margin:4px 0 18px"><button class="btn btn-primary" id="smsSaveAll" style="padding:10px 26px;font-weight:700">Save SMS settings</button></div>'
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

      function setBadge(ok, txt) {
        var b = g('smsConnBadge'); if (!b) return;
        b.innerHTML = '<span class="badge ' + (ok ? 'b-ready' : 'b-pending') + '">' + App.esc(txt) + '</span>';
      }
      function refreshSmsStatus() {
        setBadge(false, 'CHECKING\u2026');
        DB.smsApi('GET', 'status', undefined).then(function (j) {
          if (j && j.ok) {
            var bits = [j.enabled ? 'ON' : 'OFF'];
            if (j.pending) bits.push(j.pending + ' QUEUED');
            if (j.failed) bits.push(j.failed + ' FAILED');
            if (j.lastPoll) { try { bits.push('PHONE SEEN ' + App.dt(j.lastPoll)); } catch (e) { /* keep going */ } }
            setBadge(!!j.enabled, bits.join(' \u00B7 '));
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
        DB.smsApi('POST', 'queue', { to: sc.simNumber, text: labName + ': test SMS from your lab. If you received this on your phone, SMS sending works.', kind: 'test' }).then(function (j) {
          b.disabled = false;
          if (msgEl) msgEl.textContent = j && j.ok ? 'Test SMS queued. Your phone will send it within a minute (gateway must be ON in the app).' : 'Could not queue the test SMS.';
          loadSmsLog(); refreshSmsStatus();
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
