// Optix Medical Sync website: small effects only. The HTML is complete without this file (light theme only).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  document.documentElement.classList.add('js');

  /* sticky nav shadow, progress bar, back to top */
  function onScroll() {
    var h = document.documentElement, max = h.scrollHeight - h.clientHeight, top = h.scrollTop || window.scrollY || 0;
    if ($('progress')) $('progress').style.width = (max > 0 ? Math.min(100, (top / max) * 100) : 0) + '%';
    if ($('nav')) $('nav').classList.toggle('stuck', top > 8);
    if ($('totop')) $('totop').classList.toggle('show', top > 700);
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if ($('totop')) $('totop').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  /* mobile menu */
  var burger = $('burger'), links = $('links');
  function closeMenu() { if (links) links.classList.remove('open'); if (burger) burger.setAttribute('aria-expanded', 'false'); }
  if (burger && links) {
    burger.addEventListener('click', function () { var o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* reveal on scroll */
  var els = [].slice.call(document.querySelectorAll('.rv'));
  if (!('IntersectionObserver' in window) || reduce) els.forEach(function (e) { e.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
    setTimeout(function () { els.forEach(function (e) { e.classList.add('in'); }); }, 3500); /* never leave anything hidden */
  }

  /* count-up numbers: <b data-count="5000" data-suffix="+"> */
  var nums = [].slice.call(document.querySelectorAll('[data-count]'));
  if (nums.length && 'IntersectionObserver' in window && !reduce) {
    var co = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; co.unobserve(e.target);
        var el = e.target, to = +el.getAttribute('data-count') || 0, suf = el.getAttribute('data-suffix') || '', t0 = performance.now();
        (function tick(t) { var k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US') + suf; if (k < 1) requestAnimationFrame(tick); })(t0);
      });
    }, { threshold: 0.6 });
    nums.forEach(function (n) { co.observe(n); });
  }

  /* soft light that follows the pointer on cards */
  document.addEventListener('pointermove', function (e) {
    var c = e.target.closest && e.target.closest('.pcard, .tool, .dev, .step, .serve'); if (!c) return;
    var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* product showcase tabs */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('[data-tab]'); if (!tab) return;
    var id = tab.getAttribute('data-tab');
    [].forEach.call(document.querySelectorAll('.stab'), function (b) { b.classList.toggle('on', b === tab); b.setAttribute('aria-selected', b === tab ? 'true' : 'false'); });
    [].forEach.call(document.querySelectorAll('.spanel'), function (p) { p.classList.toggle('on', p.getAttribute('data-panel') === id); });
  });

  /* contact form: opens WhatsApp with the message */
  var form = $('ctForm'), err = $('ctErr');
  if (form) {
    var say = function (m) { err.textContent = m; err.hidden = !m; };
    form.addEventListener('submit', function (e) {
      e.preventDefault(); say('');
      var name = ($('ctName').value || '').trim(), phone = ($('ctPhone').value || '').trim(), msg = ($('ctMsg').value || '').trim();
      if (name.length < 3) return say('Please enter your name (min 3 characters).');
      if (!/^\d{10,13}$/.test(phone.replace(/\D/g, ''))) return say('Please enter a valid phone number (10–13 digits).');
      if (msg.length < 5) return say('Please enter your message (min 5 characters).');
      window.open('https://wa.me/923001234567?text=' + encodeURIComponent(['Hello Optix Medical Sync!', 'Name: ' + name, 'Phone: ' + phone, 'Message: ' + msg].join('\n')), '_blank');
    });
  }

  /* ---- Google AdSense: only if ads-config.js has a publisher id; loads only after the visitor chooses ---- */
  var ads = window.OPTIX_ADS;
  if (ads && /^ca-pub-\d{6,20}$/.test(ads.client || '')) {
    [].forEach.call(document.querySelectorAll('[data-adslot]'), function (box) {
      var slot = ads.slots && ads.slots[box.getAttribute('data-adslot')];
      if (!/^\d{6,20}$/.test(slot || '')) return;
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle'; ins.style.display = 'block';
      ins.setAttribute('data-ad-client', ads.client); ins.setAttribute('data-ad-slot', slot);
      ins.setAttribute('data-ad-format', 'auto'); ins.setAttribute('data-full-width-responsive', 'true');
      var label = document.createElement('small'); label.textContent = 'Advertisement';
      box.appendChild(label); box.appendChild(ins);
      /* show the box only once Google's script is really running (i.e. after consent) */
      var tries = 0, t = setInterval(function () { tries++; if (window.adsbygoogle && window.adsbygoogle.loaded) { box.hidden = false; clearInterval(t); } else if (tries > 60) clearInterval(t); }, 500);
    });
    import('./consent.js').then(function (m) { m.start(ads); }).catch(function () { /* ads are optional */ });
  }
})();
