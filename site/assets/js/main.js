// LabPOS site interactions — vanilla JS, no frameworks.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // 7. Phone rule helper: strip non-digits; valid if 10–13 digits.
  function phoneOk(v) {
    return /^\d{10,13}$/.test(String(v || '').replace(/\D/g, ''));
  }
  function setErr(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function clearErr(el) {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  }

  try {
    // 1. Sticky nav shadow.
    var nav = $('nav');
    if (nav) {
      var onScroll = function () {
        nav.classList.toggle('scrolled', window.scrollY > 10);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  } catch (e) {}

  try {
    // 2. Mobile menu.
    var burger = $('burger'), links = $('navLinks');
    if (burger && links) {
      burger.addEventListener('click', function () {
        links.classList.toggle('open');
        burger.classList.toggle('active');
      });
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          links.classList.remove('open');
          burger.classList.remove('active');
        });
      });
    }
  } catch (e) {}

  try {
    // 3. Reveal on scroll: IntersectionObserver primary, rect-check fallback.
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    function revealEl(el) { el.classList.add('in'); }
    function inView(el) {
      var r = el.getBoundingClientRect();
      var h = window.innerHeight || document.documentElement.clientHeight;
      return r.top < h * 0.9 && r.bottom > h * 0.05;
    }
    var fallbackTimer = null;
    function checkReveals() {
      for (var i = els.length - 1; i >= 0; i--) {
        if (inView(els[i])) { revealEl(els[i]); els.splice(i, 1); }
      }
      if (!els.length && fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    }
    if (els.length) {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              revealEl(en.target);
              io.unobserve(en.target);
              var ix = els.indexOf(en.target);
              if (ix > -1) els.splice(ix, 1);
            }
          });
        }, { threshold: 0.12 });
        els.forEach(function (en2) { io.observe(en2); });
      }
      var ticking = false;
      function onScrollR() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; checkReveals(); });
      }
      window.addEventListener('scroll', onScrollR, { passive: true });
      window.addEventListener('resize', onScrollR);
      checkReveals();
      fallbackTimer = setTimeout(checkReveals, 2500);
    }
  } catch (e) {}

  try {
    // 4. Photo strip marquee + drag.
    var strip = $('strip'), track = $('stripTrack');
    if (strip && track && track.children.length) {
      track.innerHTML += track.innerHTML; // duplicate once for seamless loop
      var half = track.scrollWidth / 2;
      var paused = false, dragging = false, dragged = false;
      var startX = 0, startLeft = 0;

      track.addEventListener('pointerenter', function () { paused = true; });
      track.addEventListener('pointerleave', function () { paused = false; });

      strip.addEventListener('pointerdown', function (e) {
        dragging = true; dragged = false;
        startX = e.clientX; startLeft = track.scrollLeft;
        track.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      strip.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 4) dragged = true;
        track.scrollLeft = startLeft - dx;
      });
      var endDrag = function () { dragging = false; };
      strip.addEventListener('pointerup', endDrag);
      strip.addEventListener('pointercancel', endDrag);
      // Prevent click-after-drag (e.g. links inside the strip).
      strip.addEventListener('click', function (e) {
        if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
      }, true);

      var step = function () {
        if (!paused && !dragging) {
          track.scrollLeft += 0.6;
          if (track.scrollLeft >= half) track.scrollLeft -= half;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  } catch (e) {}

  try {
    // 5. Booking modal.
    var modal = $('bookModal');
    var openModal = function () {
      if (!modal) return;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      var nm = $('bkName');
      if (nm) nm.focus();
    };
    var closeModal = function () {
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };
    document.querySelectorAll('[data-book]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    });
    var bkClose = $('bkClose');
    if (bkClose) bkClose.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeModal();
    });

    var bkForm = $('bkForm'), bkErr = $('bkErr');
    if (bkForm) {
      bkForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearErr(bkErr);
        var name = ($('bkName') && $('bkName').value || '').trim();
        var phone = ($('bkPhone') && $('bkPhone').value || '').trim();
        var service = ($('bkService') && $('bkService').value || '').trim();
        var date = ($('bkDate') && $('bkDate').value || '').trim() || 'Flexible';
        var address = ($('bkAddress') && $('bkAddress').value || '').trim();
        if (name.length < 3) return setErr(bkErr, 'Please enter your full name (min 3 characters).');
        if (!phoneOk(phone)) return setErr(bkErr, 'Please enter a valid phone number (10–13 digits).');
        if (address.length < 8) return setErr(bkErr, 'Please enter your full address (min 8 characters).');
        var lines = [
          'Hello Optix LAB MedSync! I want to book:',
          'Name: ' + name,
          'Phone: ' + phone,
          'Service: ' + (service || '—'),
          'Date: ' + date,
          'Address: ' + address
        ];
        window.open('https://wa.me/923001234567?text=' + encodeURIComponent(lines.join('\n')), '_blank');
        closeModal();
      });
    }
  } catch (e) {}

  try {
    // 6. Contact form.
    var ctForm = $('ctForm'), ctErr = $('ctErr');
    if (ctForm) {
      ctForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearErr(ctErr);
        var name = ($('ctName') && $('ctName').value || '').trim();
        var phone = ($('ctPhone') && $('ctPhone').value || '').trim();
        var msg = ($('ctMsg') && $('ctMsg').value || '').trim();
        if (name.length < 3) return setErr(ctErr, 'Please enter your name (min 3 characters).');
        if (!phoneOk(phone)) return setErr(ctErr, 'Please enter a valid phone number (10–13 digits).');
        if (msg.length < 5) return setErr(ctErr, 'Please enter your message (min 5 characters).');
        var lines = [
          'Hello Optix LAB MedSync!',
          'Name: ' + name,
          'Phone: ' + phone,
          'Message: ' + msg
        ];
        window.open('https://wa.me/923001234567?text=' + encodeURIComponent(lines.join('\n')), '_blank');
      });
    }
  } catch (e) {}
});

// 8. Services carousel prev/next buttons (self-contained; runs independent of section 1–7 above).
(function () {
  'use strict';

  function cardStep(track) {
    var card = track.querySelector('.svc-photo');
    var w = (card && card.offsetWidth) ? card.offsetWidth : 340;
    return w + 22; // card width + 22px gap
  }

  function wire() {
    try {
      var prev = document.getElementById('svcPrev');
      var next = document.getElementById('svcNext');
      var track = document.getElementById('svcTrack');
      if (!prev || !next || !track) return; // nothing to wire; do nothing

      prev.addEventListener('click', function () {
        track.scrollBy({ left: -cardStep(track), behavior: 'smooth' });
      });
      next.addEventListener('click', function () {
        track.scrollBy({ left: cardStep(track), behavior: 'smooth' });
      });
    } catch (e) { /* never throw */ }
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
    } else {
      wire();
    }
  } catch (e) { /* never throw */ }
})();
