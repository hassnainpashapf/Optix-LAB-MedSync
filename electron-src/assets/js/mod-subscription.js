/* Optix Medical Sync — Subscription module (#/subscription)
   Current plan + trial/renewal countdown, usage vs plan limits, plan cards (monthly / yearly),
   manual payment submission (JazzCash / Easypaisa / bank transfer — approved by the operator) and payment history. */
(function () {
  'use strict';
  var esc = App.esc;
  var data = null, period = 'monthly', loading = false, err = '';

  var CSS = '' +
    '.sb-hero{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;margin-bottom:18px}' +
    '.sb-plan{padding:22px;position:relative;overflow:hidden}' +
    '.sb-plan::after{content:"";position:absolute;right:-60px;top:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(closest-side,rgba(83,146,186,.25),transparent)}' +
    '.sb-k{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}' +
    '.sb-pn{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--brand);margin:4px 0 8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
    '.sb-st{font-size:12px;font-weight:800;padding:4px 11px;border-radius:999px;letter-spacing:.02em}' +
    '.sb-st.trial{background:#e8f0fe;color:#1d4ed8}.sb-st.active{background:#e6f7f0;color:#047857}.sb-st.expired{background:#fdecec;color:#b91c1c}.sb-st.suspended{background:#f1f5f9;color:#475569}' +
    '.sb-bar{height:9px;border-radius:99px;background:#e8eef4;overflow:hidden;margin:12px 0 6px}' +
    '.sb-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#5392ba,#131845);transition:width .9s cubic-bezier(.22,.8,.3,1)}' +
    '.sb-bar.warn i{background:linear-gradient(90deg,#f59e0b,#d97706)}.sb-bar.bad i{background:linear-gradient(90deg,#f87171,#dc2626)}' +
    '.sb-meta{font-size:13px;color:var(--ink2)}' +
    '.sb-id{padding:22px;display:flex;flex-direction:column;justify-content:center;gap:8px}' +
    '.sb-code{display:flex;align-items:center;gap:10px;background:#eef3fb;border:1px solid #cdd9f0;border-radius:12px;padding:10px 14px;font-size:20px;font-weight:800;color:#131845;letter-spacing:.02em}' +
    '.sb-code button{margin-left:auto}' +
    '.sb-use{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}' +
    '.sb-u{padding:16px 18px}' +
    '.sb-u b{display:block;font-size:22px;font-weight:800;color:var(--ink);margin:4px 0 2px}' +
    '.sb-u b small{font-size:13px;font-weight:600;color:var(--muted)}' +
    '.sb-tog{display:inline-flex;background:#eef3f8;border-radius:999px;padding:4px;gap:2px;margin-left:auto}' +
    '.sb-tog button{border:0;background:transparent;padding:7px 16px;border-radius:999px;font-weight:700;font-size:13px;color:var(--muted);cursor:pointer;font-family:inherit}' +
    '.sb-tog button.on{background:#fff;color:var(--brand);box-shadow:0 1px 6px rgba(19,24,69,.15)}' +
    '.sb-tog em{font-style:normal;font-size:11px;color:#059669;margin-left:4px}' +
    '.sb-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}' +
    '.sb-pc{border:2px solid var(--bd);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:10px;position:relative;background:#fff;transition:transform .18s,box-shadow .18s}' +
    '.sb-pc:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(19,24,69,.12)}' +
    '.sb-pc.pop{border-color:#131845;box-shadow:0 10px 28px rgba(19,24,69,.14)}' +
    '.sb-pc.cur{border-color:#059669}' +
    '.sb-ribbon{position:absolute;top:-11px;left:18px;background:#131845;color:#fff;font-size:11px;font-weight:800;padding:3px 11px;border-radius:99px;letter-spacing:.04em}' +
    '.sb-ribbon.g{background:#059669}' +
    '.sb-pc h4{font-size:17px;font-weight:800;color:var(--brand)}' +
    '.sb-pc .d{font-size:13px;color:var(--muted);min-height:34px}' +
    '.sb-price{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}' +
    '.sb-price small{font-size:13px;font-weight:600;color:var(--muted)}' +
    '.sb-pc ul{list-style:none;margin:2px 0 6px;padding:0;display:flex;flex-direction:column;gap:7px;font-size:13.5px;color:var(--ink2)}' +
    '.sb-pc li::before{content:"✓";color:#059669;font-weight:800;margin-right:8px}' +
    '.sb-pc .btn{margin-top:auto}' +
    '.sb-pm{display:grid;gap:10px;margin:10px 0 14px}' +
    '.sb-pmi{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:#f8fafc}' +
    '.sb-pmi b{display:block;font-size:14px}.sb-pmi span{font-size:13px;color:var(--muted)}.sb-pmi .num{font-size:16px;font-weight:800;color:#131845;margin-left:auto;letter-spacing:.02em}' +
    '.sb-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px}' +
    '.sb-chip.pending,.sb-chip.awaiting{background:#fef4e2;color:#b45309}.sb-chip.approved{background:#e6f7f0;color:#047857}.sb-chip.rejected,.sb-chip.failed{background:#fdecec;color:#b91c1c}.sb-on{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 4px}.sb-on .btn{flex:1;min-width:150px}.sb-or{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12.5px;margin:14px 0 4px}.sb-or::before,.sb-or::after{content:"";flex:1;height:1px;background:var(--line)}' +
    '.sb-sup{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
    '@media(max-width:900px){.sb-hero{grid-template-columns:1fr}.sb-plans{grid-template-columns:1fr}.sb-use{grid-template-columns:1fr}.sb-pn{font-size:25px}}';
  function css() {
    if (document.getElementById('sbCss')) return;
    var s = document.createElement('style'); s.id = 'sbCss'; s.textContent = CSS; document.head.appendChild(s);
  }

  function fmtD(iso) { return iso ? App.d(iso) : '—'; }
  function rs(n) { return 'Rs ' + Math.round(+n || 0).toLocaleString('en-US'); }
  function lim(n) { return n ? String(n) : 'Unlimited'; }

  function planFeatures(k, p) {
    var f = [lim(p.users) + (p.users ? ' staff users' : ' staff users'), lim(p.invoicesPerMonth) + (p.invoicesPerMonth ? ' invoices / month' : ' invoices'),
      'Unlimited patients & reports', 'WhatsApp reports + critical alerts', 'Offline desktop app + Android + Web'];
    if (k === 'enterprise') f.push('Priority support & onboarding');
    return f;
  }

  function usageCard(label, used, limit, extra) {
    var pct = limit ? Math.min(100, Math.round(used / limit * 100)) : 0, cls = pct >= 100 ? 'bad' : (pct >= 80 ? 'warn' : '');
    return '<div class="card sb-u"><div class="sb-k">' + label + '</div><b>' + used + ' <small>/ ' + lim(limit) + '</small></b>' +
      (limit ? '<div class="sb-bar ' + cls + '"><i style="width:' + pct + '%"></i></div>' : '<div class="sb-meta">' + (extra || 'No limit on your plan') + '</div>') + '</div>';
  }

  function render() {
    css();
    var s = App.session();
    if (!App.saasOn || !App.saasOn()) {
      return '<div class="card"><div class="card-b">' + App.empty('Subscriptions are managed in the web app. Open the web app (optix-lab-medsync.pages.dev/app) to view or change your plan.') + '</div></div>';
    }
    if (!data) {
      if (!err && !loading) load();
      setTimeout(function () { var r = document.getElementById('sbRetry'); if (r) r.addEventListener('click', function () { err = ''; load(); paint(); }); }, 0);
      return '<div class="card"><div class="card-b">' + App.empty(err || 'Loading…') + (err ? '<div style="text-align:center;margin-top:8px"><button class="btn btn-primary" id="sbRetry">Retry</button></div>' : '') + '</div></div>';
    }
    var L = data.lab, plans = data.plans, info = data.info || {};
    var pend = (data.payments || []).filter(function (p) { return p.status === 'pending' || p.status === 'awaiting'; }).length;
    var endLabel = L.plan === 'trial' ? 'Trial ends' : 'Valid until', end = L.plan === 'trial' ? L.trialEndsAt : L.paidUntil;
    var total = L.plan === 'trial' ? 14 : 30, dl = L.daysLeft == null ? null : L.daysLeft;
    var pct = dl == null ? 100 : Math.max(0, Math.min(100, Math.round(dl / total * 100)));
    var bcls = L.status === 'expired' ? 'bad' : (dl != null && dl <= 5 ? 'warn' : '');
    var stTxt = { trial: 'Free trial', active: 'Active', expired: 'Expired', suspended: 'Suspended' }[L.status] || L.status;
    var h = '<div class="sb-hero">' +
      '<div class="card sb-plan"><div class="sb-k">Current plan</div>' +
        '<div class="sb-pn">' + esc(L.planName) + '<span class="sb-st ' + L.status + '">' + stTxt + '</span></div>' +
        (end ? '<div class="sb-meta">' + endLabel + ' <b>' + fmtD(end) + '</b>' + (dl != null ? ' &middot; ' + (dl >= 0 ? dl + ' day' + (dl === 1 ? '' : 's') + ' left' : 'ended ' + (-dl) + ' day' + (dl === -1 ? '' : 's') + ' ago') : '') + '</div>' +
          '<div class="sb-bar ' + bcls + '"><i style="width:' + pct + '%"></i></div>'
          : '<div class="sb-meta">No expiry &mdash; this lab is on a managed plan.</div>') +
        (L.status === 'expired' ? '<div class="sb-meta" style="color:#b91c1c;margin-top:6px">The app is read-only until a plan is activated. Your data is safe.</div>' : '') +
        (pend ? '<div class="sb-meta" style="margin-top:8px"><span class="sb-chip pending">' + pend + ' payment waiting for approval</span></div>' : '') +
      '</div>' +
      '<div class="card sb-id"><div class="sb-k">Your Lab ID</div><div class="sb-code"><span id="sbSlug">' + esc(L.slug) + '</span><button class="btn btn-ghost btn-sm" id="sbCopy">Copy</button></div>' +
        '<div class="sb-meta">Staff enter this Lab ID with their username and password on the sign-in page (desktop app, web and Android).</div></div>' +
      '</div>';

    h += '<div class="sb-use">' +
      usageCard('Staff users', L.usage.users, L.limits.users) +
      usageCard('Invoices this month', L.usage.invoicesThisMonth, L.limits.invoicesPerMonth) +
      '<div class="card sb-u"><div class="sb-k">Patients</div><b>' + L.usage.patients + '</b><div class="sb-meta">' + L.usage.invoicesTotal + ' invoices in total</div></div></div>';

    var ks = ['starter', 'pro', 'enterprise'];
    h += '<div class="card"><div class="card-h"><h3>Plans</h3><div class="sb-tog" id="sbTog">' +
      '<button data-p="monthly" class="' + (period === 'monthly' ? 'on' : '') + '">Monthly</button>' +
      '<button data-p="yearly" class="' + (period === 'yearly' ? 'on' : '') + '">Yearly<em>2 months free</em></button></div></div>' +
      '<div class="sb-plans">' + ks.map(function (k) {
        var p = plans[k]; if (!p) return '';
        var cur = L.plan === k, price = period === 'yearly' ? p.yearly : p.monthly, custom = k === 'enterprise';
        var cta = custom
          ? ((info.supportWhatsapp || info.supportEmail)
              ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + (info.supportWhatsapp ? 'https://wa.me/' + esc(App.normWa(info.supportWhatsapp)) : 'mailto:' + esc(info.supportEmail)) + '">Contact us</a>'
              : '<button class="btn btn-ghost" data-nocontact="1">Contact us</button>')
          : '<button class="btn btn-primary" data-pick="' + k + '">' + (cur && L.status !== 'expired' ? 'Renew / extend' : 'Choose ' + esc(p.name)) + '</button>';
        return '<div class="sb-pc' + (k === 'pro' ? ' pop' : '') + (cur ? ' cur' : '') + '">' +
          (cur ? '<span class="sb-ribbon g">CURRENT PLAN</span>' : (k === 'pro' ? '<span class="sb-ribbon">MOST POPULAR</span>' : '')) +
          '<h4>' + esc(p.name) + '</h4><div class="d">' + esc(p.desc || '') + '</div>' +
          '<div class="sb-price">' + (custom ? 'Custom' : rs(price) + '<small> / ' + (period === 'yearly' ? 'year' : 'month') + '</small>') + '</div>' +
          '<ul>' + planFeatures(k, p).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + cta + '</div>';
      }).join('') + '</div></div>';

    var pays = data.payments || [];
    h += '<div class="card"><div class="card-h"><h3>Payment history</h3></div><div class="card-b flush">' + (pays.length
      ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead><tbody>' +
        pays.map(function (p) {
          return '<tr><td>' + App.d(p.createdAt) + '</td><td>' + esc((plans[p.plan] || {}).name || p.plan) + ' &middot; ' + (p.period === 'yearly' ? 'Yearly' : 'Monthly') + '</td><td class="num">' + rs(p.amount) + '</td><td>' + esc(p.reference) +
            (p.method ? ' <span class="muted">(' + esc(p.method) + ')</span>' : '') + '</td><td><span class="sb-chip ' + p.status + '">' + p.status.charAt(0).toUpperCase() + p.status.slice(1) + '</span>' + (p.decisionNote ? ' <span class="muted" style="font-size:12px">' + esc(p.decisionNote) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="card-b">' + App.empty('No payments yet') + '</div>') + '</div></div>';

    var sup = [];
    if (info.supportWhatsapp) sup.push('<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(App.normWa(info.supportWhatsapp)) + '">WhatsApp support</a>');
    if (info.supportPhone) sup.push('<a class="btn btn-ghost btn-sm" href="tel:' + esc(info.supportPhone) + '">' + esc(info.supportPhone) + '</a>');
    if (info.supportEmail) sup.push('<a class="btn btn-ghost btn-sm" href="mailto:' + esc(info.supportEmail) + '">' + esc(info.supportEmail) + '</a>');
    if (sup.length) h += '<div class="card"><div class="card-b sb-sup"><b>Need help with billing?</b>' + sup.join('') + '</div></div>';

    setTimeout(wire, 0);
    return h;
  }

  function load() {
    if (loading) return;
    loading = true; err = '';
    DB.saas('GET', 'me').then(function (j) { data = j; loading = false; paint(); }, function (e) { loading = false; err = (e && e.message) || 'Could not load'; paint(); });
  }
  function paint() { var v = document.getElementById('view'); if (v && /subscription/.test(location.hash)) v.innerHTML = render(); }

  function wire() {
    var v = document.getElementById('view'); if (!v) return;
    var c = document.getElementById('sbCopy');
    if (c) c.addEventListener('click', function () {
      var t = (document.getElementById('sbSlug') || {}).textContent || '';
      try { navigator.clipboard.writeText(t).then(function () { App.toast('Lab ID copied'); }); } catch (e) { App.toast(t); }
    });
    var tg = document.getElementById('sbTog');
    if (tg) tg.addEventListener('click', function (e) { var b = e.target.closest('button[data-p]'); if (b) { period = b.getAttribute('data-p'); paint(); } });
    Array.prototype.forEach.call(v.querySelectorAll('[data-nocontact]'), function (b) { b.addEventListener('click', function () { App.toast('Please contact the Optix team for Enterprise pricing'); }); });
    Array.prototype.forEach.call(v.querySelectorAll('[data-pick]'), function (b) { b.addEventListener('click', function () { pay(b.getAttribute('data-pick')); }); });
  }

  /* pay online with JazzCash / Easypaisa: the plan is activated by itself as soon as the payment goes through */
  function onlineHtml() {
    var o = (data && data.online) || {}, b = [];
    if (o.jazzcash) b.push('<button type="button" class="btn btn-primary" data-online="jazzcash">Pay with JazzCash</button>');
    if (o.easypaisa) b.push('<button type="button" class="btn btn-primary" data-online="easypaisa">Pay with Easypaisa</button>');
    if (o.simulator) b.push('<button type="button" class="btn btn-ghost" data-online="simulator">Test payment (no real money)</button>');
    if (!b.length) return '';
    return '<div class="sb-on">' + b.join('') + '</div><div class="muted" style="font-size:12.5px">Your plan is activated automatically once the payment succeeds.</div><div class="sb-or">or pay manually</div>';
  }
  function startOnline(k, gateway, btn) {
    btn.disabled = true; var t = btn.textContent; btn.textContent = 'Opening…';
    DB.saas('POST', 'pay-online', { plan: k, period: period, gateway: gateway }).then(function (j) {
      var c = j.checkout || {};
      if (c.method === 'POST' && c.fields) {
        var f = document.createElement('form'); f.method = 'POST'; f.action = c.url;
        Object.keys(c.fields).forEach(function (n) { var i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = c.fields[n]; f.appendChild(i); });
        document.body.appendChild(f); f.submit();
      } else if (c.url) location.href = c.url;
      else throw new Error('Could not open the payment page');
    }).catch(function (e) { btn.disabled = false; btn.textContent = t; App.toast((e && e.message) || 'Could not start the payment', 'err'); });
  }
  function copyBtn(t) { return '<button class="btn btn-ghost btn-sm" data-copy="' + esc(t) + '">Copy</button>'; }
  function pay(k) {
    var p = data.plans[k], info = data.info || {}, amount = period === 'yearly' ? p.yearly : p.monthly;
    var methods = (info.payMethods || []).filter(function (m) { return m && (m.name || m.account); });
    var mHtml = methods.length ? '<div class="sb-pm">' + methods.map(function (m) {
      return '<div class="sb-pmi"><div><b>' + esc(m.name || '') + '</b><span>' + esc(m.title || '') + '</span></div><span class="num">' + esc(m.account || '') + '</span>' + copyBtn(m.account || '') + '</div>';
    }).join('') + '</div>' : '<p class="muted" style="margin:6px 0 12px">Payment details will be shared by support &mdash; contact us to pay.</p>';
    App.modal('Pay for ' + esc(p.name) + ' · ' + (period === 'yearly' ? 'Yearly' : 'Monthly'),
      '<div style="background:#eef3fb;border:1px solid #cdd9f0;border-radius:12px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between"><span class="muted">Amount to pay</span><b style="font-size:22px;color:#131845">' + rs(amount) + '</b></div>' +
      onlineHtml() +
      '<p style="margin:12px 0 4px;font-size:13.5px"><b>Step 1.</b> ' + esc(info.payInstructions || 'Send the amount by JazzCash / Easypaisa / bank transfer.') + '</p>' + mHtml +
      '<p style="margin:0 0 6px;font-size:13.5px"><b>Step 2.</b> Enter the transaction ID so we can verify it.</p>' +
      '<form id="payForm"><label class="label">Paid via<select class="select" id="pyM">' + methods.map(function (m) { return '<option>' + esc(m.name || '') + '</option>'; }).join('') + '<option>Other</option></select></label>' +
      '<label class="label">Transaction ID / reference *<input class="input" id="pyR" placeholder="e.g. 1234567890" maxlength="80"></label>' +
      '<label class="label">Note <span class="muted">(optional)</span><input class="input" id="pyN" maxlength="200" placeholder="Sender name / number"></label>' +
      '<div class="login-err" id="pyE" hidden></div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="pyC">Cancel</button><button class="btn btn-primary" type="submit" id="pyS">Submit payment</button></div></form>',
      { onOpen: function (ov, close) {
        Array.prototype.forEach.call(ov.querySelectorAll('[data-copy]'), function (b) { b.addEventListener('click', function () {
          var t = b.getAttribute('data-copy'); try { navigator.clipboard.writeText(t).then(function () { App.toast('Copied'); }); } catch (e) { App.toast(t); } }); });
        Array.prototype.forEach.call(ov.querySelectorAll('[data-online]'), function (b) { b.addEventListener('click', function () { startOnline(k, b.getAttribute('data-online'), b); }); });
        ov.querySelector('#pyC').addEventListener('click', close);
        ov.querySelector('#payForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var ref = ov.querySelector('#pyR').value.trim(), er = ov.querySelector('#pyE'), btn = ov.querySelector('#pyS');
          if (ref.length < 3) { er.hidden = false; er.textContent = 'Enter the transaction ID'; return; }
          btn.disabled = true; btn.textContent = 'Submitting…';
          DB.saas('POST', 'pay-request', { plan: k, period: period, amount: amount, method: ov.querySelector('#pyM').value, reference: ref, note: ov.querySelector('#pyN').value.trim() })
            .then(function () { close(); App.toast('Payment submitted — we will activate your plan shortly'); data = null; load(); })
            .catch(function (ex) { btn.disabled = false; btn.textContent = 'Submit payment'; er.hidden = false; er.textContent = ex.message; });
        });
      } });
  }

  /* back from the payment page: #/subscription?pay=ok|failed|wait|invalid */
  function afterPay() {
    var m = /[?&]pay=([a-z]+)/.exec(location.hash || ''); if (!m) return;
    var msg = { ok: ['Payment received. Your plan is active.', ''], failed: ['The payment was not completed. You can try again or pay manually.', 'err'], wait: ['Payment received by the gateway. It will be activated as soon as it is confirmed (usually within minutes).', ''], invalid: ['We could not verify that payment. If money was deducted, contact support.', 'err'] }[m[1]];
    try { history.replaceState(null, '', '#/subscription'); } catch (e) { location.hash = '#/subscription'; }
    data = null; if (msg) setTimeout(function () { App.toast(msg[0], msg[1] || undefined); }, 300);
  }
  App.route('/subscription', function () { afterPay(); err = ''; load(); return render(); }); /* cached view first, refreshed in the background */
})();
