// Optix Medical Sync website: small shared behaviour. The HTML is complete without this file (light theme only).
// - scroll reveals (rx-tilt), in-frame mobile menu, back-to-top, smooth in-page anchors
// - contact form (opens WhatsApp with the message)
// - Google AdSense: only if ads-config.js has a publisher id; loads only after the visitor chooses (consent.js)
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  document.documentElement.classList.add('js');

  /* reveal on scroll (the home script reuses this observer for split headings) */
  var tio = null;
  function revealAll() { [].forEach.call(document.querySelectorAll('.rx-tilt,.rx-split,.bn-rise'), function (e) { e.classList.add('rx-in'); if (e.classList.contains('bn-rise')) e.classList.add('bn-in'); }); }
  if (!('IntersectionObserver' in window) || reduce) { revealAll(); }
  else {
    tio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rx-in'); tio.unobserve(e.target); } }); }, { threshold: 0.12 });
    [].forEach.call(document.querySelectorAll('.rx-tilt'), function (el) { tio.observe(el); });
    setTimeout(revealAll, 6000); /* never leave anything hidden */
  }
  window.OptixReveal = tio;

  /* in-frame mobile menu */
  var burger = document.querySelector('.hx-burger'), nav = document.querySelector('.hx-nav');
  function closeMenu() { if (nav) nav.classList.remove('hx-open'); if (burger) { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Open menu'); } }
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var o = nav.classList.toggle('hx-open');
      burger.setAttribute('aria-expanded', String(o)); burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu');
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('.hx-links a')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* smooth in-page anchors */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href'); if (id.length < 2) return;
    var t = null; try { t = document.querySelector(id); } catch (x) {}
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
  });

  /* back to top */
  var up = $('totop');
  if (up) {
    var on = function () { up.classList.toggle('show', (window.scrollY || document.documentElement.scrollTop || 0) > 900); };
    window.addEventListener('scroll', on, { passive: true }); on();
    up.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  }

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
