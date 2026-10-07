// Optix Medical Science — SaaS landing helpers (pricing, trial days, support contact).
// Vanilla JS. The page always renders with built-in numbers; live prices from the
// API replace them in place if/when they arrive (4 s timeout, failures are silent).
(function () {
  'use strict';

  var API = 'https://labpos-api.150.230.52.29.sslip.io/api/saas/plans';
  var TIMEOUT_MS = 4000;

  var FALLBACK = {
    plans: {
      starter:    { name: 'Starter',      monthly: 2500, yearly: 25000, users: 3,  invoicesPerMonth: 300,  desc: 'Small collection centre' },
      pro:        { name: 'Professional', monthly: 6000, yearly: 60000, users: 10, invoicesPerMonth: 3000, desc: 'Busy diagnostic lab' },
      enterprise: { name: 'Enterprise',   monthly: 0,     yearly: 0,     users: 0,  invoicesPerMonth: 0,    desc: 'Chains & hospitals' }
    },
    info: { trialDays: 14, supportPhone: '', supportEmail: '', supportWhatsapp: '' }
  };

  var state = { plans: clone(FALLBACK.plans), info: clone(FALLBACK.info), period: 'monthly' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function isNum(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
  function isStr(v) { return typeof v === 'string' && v.trim() !== ''; }
  function fmtNum(n) { return Number(n).toLocaleString('en-US'); }
  function rs(n) { return 'Rs ' + fmtNum(n); }

  /* ---------- fetch with timeout ---------- */
  function fetchPlans() {
    return new Promise(function (resolve) {
      if (typeof fetch !== 'function') { resolve(null); return; }
      var done = false;
      var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { if (ctl) ctl.abort(); } catch (e) {}
        resolve(null);
      }, TIMEOUT_MS);
      fetch(API, { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) { if (done) return; done = true; clearTimeout(timer); resolve(j); })
        .catch(function () { if (done) return; done = true; clearTimeout(timer); resolve(null); });
    });
  }

  /* ---------- merge validated API data over the fallback ---------- */
  function merge(data) {
    if (!data || typeof data !== 'object') return;
    var plans = data.plans || {};
    ['starter', 'pro', 'enterprise'].forEach(function (k) {
      var src = plans[k], dst = state.plans[k];
      if (!src || typeof src !== 'object') return;
      if (isStr(src.name)) dst.name = src.name.trim();
      if (isStr(src.desc)) dst.desc = src.desc.trim();
      if (k === 'enterprise') {
        ['monthly', 'yearly', 'users', 'invoicesPerMonth'].forEach(function (f) { if (isNum(src[f])) dst[f] = src[f]; });
      } else {
        if (isNum(src.monthly) && src.monthly > 0) dst.monthly = src.monthly;
        if (isNum(src.yearly) && src.yearly > 0) dst.yearly = src.yearly;
        else if (isNum(src.monthly) && src.monthly > 0) dst.yearly = src.monthly * 10;
        if (isNum(src.users)) dst.users = src.users;
        if (isNum(src.invoicesPerMonth)) dst.invoicesPerMonth = src.invoicesPerMonth;
      }
    });
    var info = data.info;
    if (info && typeof info === 'object') {
      if (isNum(info.trialDays) && info.trialDays > 0) state.info.trialDays = Math.round(info.trialDays);
      ['supportPhone', 'supportEmail', 'supportWhatsapp'].forEach(function (f) {
        if (isStr(info[f])) state.info[f] = info[f].trim();
      });
    }
  }

  /* ---------- helpers ---------- */
  function freeMonths(p) {
    if (!p || !(p.monthly > 0) || !(p.yearly > 0)) return 0;
    return Math.round((p.monthly * 12 - p.yearly) / p.monthly);
  }
  function monthsText(n) { return n + (n === 1 ? ' month free' : ' months free'); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function contactHref() {
    var i = state.info;
    var wa = digits(i.supportWhatsapp);
    if (wa.length >= 10) return { href: 'https://wa.me/' + wa, external: true };
    if (/^[^\s@]+@[^\s@]+$/.test(i.supportEmail || '')) {
      return { href: 'mailto:' + i.supportEmail + '?subject=' + encodeURIComponent('Optix Medical Science Enterprise plan'), external: false };
    }
    var ph = digits(i.supportPhone);
    if (ph.length >= 10) return { href: 'tel:' + ph, external: false };
    return { href: '#contact', external: false };
  }

  /* ---------- render ---------- */
  function setText(el, txt) {
    if (el && el.textContent !== txt) {
      el.textContent = txt;
      if (el.classList.contains('pr-amt')) {
        el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
      }
    }
  }

  function render() {
    var yearly = state.period === 'yearly';

    $all('[data-trial]').forEach(function (el) { setText(el, String(state.info.trialDays)); });

    $all('.pr-card').forEach(function (card) {
      var p = state.plans[card.getAttribute('data-plan')];
      if (!p) return;
      var q = function (s) { return card.querySelector(s); };
      setText(q('.pr-name'), p.name);
      setText(q('.pr-desc'), p.desc);
      setText(q('.pr-users'), p.users > 0 ? fmtNum(p.users) : 'Unlimited');
      setText(q('.pr-inv'), p.invoicesPerMonth > 0 ? fmtNum(p.invoicesPerMonth) : 'Unlimited');

      var custom = !(p.monthly > 0);
      if (custom) {
        setText(q('.pr-amt'), 'Custom');
        setText(q('.pr-per'), 'pricing');
        setText(q('.pr-save'), 'Tailored to your lab or chain');
        var cta = q('.pr-contact');
        if (cta) {
          var c = contactHref();
          cta.setAttribute('href', c.href);
          if (c.external) { cta.setAttribute('target', '_blank'); cta.setAttribute('rel', 'noopener'); }
          else { cta.removeAttribute('target'); cta.removeAttribute('rel'); }
        }
      } else {
        var y = p.yearly > 0 ? p.yearly : p.monthly * 10;
        var fm = freeMonths({ monthly: p.monthly, yearly: y });
        setText(q('.pr-amt'), rs(yearly ? y : p.monthly));
        setText(q('.pr-per'), yearly ? '/year' : '/month');
        if (yearly) {
          var saved = p.monthly * 12 - y;
          setText(q('.pr-save'), saved > 0 ? 'Save ' + rs(saved) + (fm >= 1 ? ' — ' + monthsText(fm) : '') : '');
        } else {
          setText(q('.pr-save'), 'Or ' + rs(y) + '/year' + (fm >= 1 ? ' — ' + monthsText(fm) : ''));
        }
      }
    });

    var badge = document.getElementById('prBadge');
    if (badge) {
      var ref = state.plans.pro.monthly > 0 ? state.plans.pro : state.plans.starter;
      var m = freeMonths({ monthly: ref.monthly, yearly: ref.yearly > 0 ? ref.yearly : ref.monthly * 10 });
      if (m >= 1) { badge.textContent = monthsText(m); badge.hidden = false; } else { badge.hidden = true; }
    }

    // Support e-mail on legal pages (placeholder text stays if the API has none).
    $all('[data-support-email]').forEach(function (el) {
      var mail = state.info.supportEmail;
      if (/^[^\s@]+@[^\s@]+$/.test(mail || '')) {
        el.textContent = '';
        var a = document.createElement('a');
        a.href = 'mailto:' + mail;
        a.textContent = mail;
        el.appendChild(a);
      }
    });
  }

  function wireToggle() {
    var btns = $all('.pr-switch button');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        state.period = b.getAttribute('data-period') === 'yearly' ? 'yearly' : 'monthly';
        btns.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        render();
      });
    });
  }

  function init() {
    try { wireToggle(); } catch (e) {}
    try { render(); } catch (e) {}
    // Do not block anything: fetch in the background, update in place on success.
    fetchPlans().then(function (data) {
      try { merge(data); render(); } catch (e) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
