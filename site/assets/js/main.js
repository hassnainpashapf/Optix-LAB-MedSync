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

      strip.addEventListener('pointerenter', function () { paused = true; });
      strip.addEventListener('pointerleave', function () { paused = false; });

      strip.addEventListener('pointerdown', function (e) {
        dragging = true; dragged = false;
        startX = e.clientX; startLeft = strip.scrollLeft;
        try { strip.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      strip.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 4) dragged = true;
        strip.scrollLeft = startLeft - dx;
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
          strip.scrollLeft += 0.6;
          if (strip.scrollLeft >= half) strip.scrollLeft -= half;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
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

// 12. Extra scroll-reveal targets (self-contained).
// Runs immediately at script eval (end of body, DOM parsed) — BEFORE the
// DOMContentLoaded reveal system in section 3 collects `.reveal` elements,
// so these are picked up automatically (IO + 2.5s safety fallback included).
(function () {
  'use strict';
  try {
    var groups = [
      '.why-list li',
      '.c-row',
      '.svc-head > *',
      '.loc-sub'
    ];
    groups.forEach(function (sel) {
      var nodes = document.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.classList.contains('reveal')) continue;
        el.classList.add('reveal');
        el.style.setProperty('--d', (0.05 + i * 0.07).toFixed(2) + 's');
      }
    });
  } catch (e) { /* never throw */ }
})();

// 13. Count-up for the specialty "98% On-Time Rate" stat (self-contained).
// 9. Hero entrance choreography + stats count-up + serve arrows (self-contained).
(function () {
  'use strict';
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  onReady(function () {
    try {
      var el = document.querySelector('.spec-photo.tall h3.big');
      if (!el || el.dataset.done) return;
      var t = (el.textContent || '').replace(/\s+/g, '');
      var m = t.match(/^([\d.]+)(.*)$/);
      if (!m) return;
      var target = parseFloat(m[1]), dec = m[1].indexOf('.') > -1 ? 1 : 0, suffix = m[2] || '';
      function countUp() {
        if (el.dataset.done) return;
        el.dataset.done = '1';
        var dur = 1400, t0 = null;
        function frame(ts) {
          if (!t0) t0 = ts;
          var k = Math.min(1, (ts - t0) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          el.innerHTML = (target * e).toFixed(dec) + suffix;
          if (k < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }
      if ('IntersectionObserver' in window) {
        var so = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (en.isIntersecting) { countUp(); so.disconnect(); }
          });
        }, { threshold: 0.4 });
        so.observe(el);
        setTimeout(countUp, 6000); // safety: never stuck at 0
      } else { countUp(); }
    } catch (e) { /* never throw */ }
  });
})();
(function () {
  'use strict';
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  onReady(function () {
    try {
      // 9a. Split hero H1 into word spans for staggered rise.
      var h1 = document.querySelector('.hero h1');
      if (h1 && !h1.querySelector('.w')) {
        var parts = [];
        h1.childNodes.forEach(function (n) {
          if (n.nodeType === 3) {
            n.textContent.split(/(\s+)/).forEach(function (tok) {
              if (!tok) return;
              if (/^\s+$/.test(tok)) { parts.push(document.createTextNode(' ')); return; }
              var sp = document.createElement('span');
              sp.className = 'w';
              sp.textContent = tok;
              parts.push(sp);
            });
          } else if (n.nodeName === 'BR') {
            parts.push(document.createElement('br'));
          } else { parts.push(n); }
        });
        h1.innerHTML = '';
        var wi = 0;
        parts.forEach(function (p) {
          if (p.className === 'w') { p.style.animationDelay = (0.15 + wi * 0.09) + 's'; wi++; }
          h1.appendChild(p);
        });
      }
    } catch (e) {}

    try {
      // 9b. Stats count-up on first view.
      var stats = document.querySelectorAll('.stat b');
      function parseStat(el) {
        var t = (el.textContent || '').trim();
        var m = t.match(/^([\d.]+)(.*)$/);
        if (!m) return null;
        return { target: parseFloat(m[1]), dec: (m[1].indexOf('.') > -1 ? 1 : 0), suffix: m[2] || '' };
      }
      function countUp(el) {
        var p = parseStat(el);
        if (!p || el.dataset.done) return;
        el.dataset.done = '1';
        var dur = 1400, t0 = null;
        function frame(ts) {
          if (!t0) t0 = ts;
          var k = Math.min(1, (ts - t0) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          el.textContent = (p.target * e).toFixed(p.dec) + p.suffix;
          if (k < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }
      if ('IntersectionObserver' in window && stats.length) {
        var so = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (en.isIntersecting) { countUp(en.target); so.unobserve(en.target); }
          });
        }, { threshold: 0.4 });
        stats.forEach(function (s) { so.observe(s); });
      }
    } catch (e) {}

    try {
      // 9c. Serve-stage arrow draw-in trigger.
      var stage = document.getElementById('serveStage');
      if (stage && 'IntersectionObserver' in window) {
        var ao = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (en.isIntersecting) { stage.classList.add('in'); ao.disconnect(); }
          });
        }, { threshold: 0.25 });
        ao.observe(stage);
      } else if (stage) { stage.classList.add('in'); }
    } catch (e) {}
  });
})();
