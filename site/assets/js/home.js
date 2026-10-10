// Optix Medical Sync home page: hero parallax, scroll-highlight statement, bento cards, step switcher, tabs, FAQ, connection ring.
// Adapted from the Optix MedSync (Pharmacy) landing. Plain JS, no libraries.
(function () {
  'use strict';
  var reduce = false, fine = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; fine = window.matchMedia('(pointer:fine)').matches; } catch (e) {}
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ===== hero: subtle photo parallax ===== */
  (function () {
    var root = $('.hx-hero'); if (!root || !fine || reduce) return;
    var wrap = $('.hx-photo-wrap', root), tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    function loop() { cx += (tx - cx) * .06; cy += (ty - cy) * .06; wrap.style.transform = 'translate(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px)'; if (Math.abs(tx - cx) > .05 || Math.abs(ty - cy) > .05) raf = requestAnimationFrame(loop); else raf = null; }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    root.addEventListener('mousemove', function (e) { var r = root.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - .5) * 16; ty = ((e.clientY - r.top) / r.height - .5) * 12; kick(); });
    root.addEventListener('mouseleave', function () { tx = 0; ty = 0; kick(); });
  })();

  /* ===== statement: words light up as you scroll ===== */
  (function () {
    var sec = $('.st-section'); if (!sec) return;
    var toks = $$('.st-tok', sec), n = toks.length, ticking = false;
    function paint(p) { for (var i = 0; i < n; i++) { var on = reduce ? true : (p * n >= i + 0.55); if (toks[i].classList.contains('on') !== on) toks[i].classList.toggle('on', on); } }
    function update() { ticking = false; var r = sec.getBoundingClientRect(), vh = window.innerHeight || 800, s = vh * 0.88, e = vh * 0.30, p = (s - r.top) / (s - e); paint(p < 0 ? 0 : (p > 1 ? 1 : p)); }
    function request() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', request, { passive: true }); window.addEventListener('resize', request); update();
  })();

  /* ===== benefits: rise-in + 3D tilt ===== */
  (function () {
    var sec = $('.bn-section'); if (!sec) return;
    var rises = $$('.bn-rise', sec);
    if (reduce || !('IntersectionObserver' in window)) rises.forEach(function (el) { el.classList.add('bn-in'); });
    else {
      rises.forEach(function (el, i) { el.style.transitionDelay = (i * 0.1) + 's'; });
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('bn-in'); io.unobserve(e.target); } }); }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      rises.forEach(function (el) { io.observe(el); });
    }
    if (fine && !reduce) $$('[data-tilt]', sec).forEach(function (card) {
      card.addEventListener('mousemove', function (ev) {
        if (!card.classList.contains('bn-in')) return;
        var r = card.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
        card.style.transition = 'transform .12s ease-out';
        card.style.transform = 'perspective(900px) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 7).toFixed(2) + 'deg)';
      });
      card.addEventListener('mouseleave', function () { card.style.transition = 'transform .55s cubic-bezier(.2,.7,.3,1)'; card.style.transform = ''; });
    });
  })();

  var root = $('.rx-root'); if (!root) return;
  var tio = window.OptixReveal;

  /* ===== headings: words rise ===== */
  function splitWords(el) {
    var frag = document.createDocumentFragment(), wi = 0;
    function wrap(node) { var w = document.createElement('span'); w.className = 'rx-w'; var i = document.createElement('span'); i.className = 'rx-wi'; i.style.setProperty('--rx-wi', wi++); i.appendChild(node); w.appendChild(i); frag.appendChild(w); frag.appendChild(document.createTextNode(' ')); }
    Array.prototype.forEach.call(el.childNodes, function (n) {
      if (n.nodeType === 3) n.textContent.split(/\s+/).filter(Boolean).forEach(function (t) { wrap(document.createTextNode(t)); });
      else if (n.nodeType === 1 && n.tagName === 'BR') frag.appendChild(n.cloneNode(true));
      else if (n.nodeType === 1) wrap(n.cloneNode(true));
    });
    el.innerHTML = ''; el.appendChild(frag); el.classList.add('rx-split');
    if (tio) tio.observe(el); else el.classList.add('rx-in');
  }
  $$('h2[data-rx-words]', root).forEach(splitWords);

  /* ===== why choose: step switcher ===== */
  (function () {
    var btns = $$('[data-rx-stepbtn]'), phs = $$('[data-rx-ph]'), fls = $$('[data-rx-fl]'), panels = $$('[data-rx-panel]'), card = $('#rxPhotoCard'), grid = $('#rxWhyGrid'), cur = 1, timer = null;
    if (!card || !grid) return;
    function show(n) {
      cur = n;
      btns.forEach(function (b) { var on = +b.dataset.rxStepbtn === n; b.classList.toggle('rx-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      phs.forEach(function (p) { p.classList.toggle('rx-on', +p.dataset.rxPh === n); });
      fls.forEach(function (f) { f.classList.toggle('rx-on', +f.dataset.rxFl === n); });
      panels.forEach(function (p) { p.classList.toggle('rx-on', +p.dataset.rxPanel === n); });
      card.classList.remove('rx-s1', 'rx-s2', 'rx-s3'); card.classList.add('rx-s' + n);
    }
    function auto() { clearInterval(timer); if (!reduce) timer = setInterval(function () { show(cur % 3 + 1); }, 6000); }
    btns.forEach(function (b) { b.addEventListener('click', function () { show(+b.dataset.rxStepbtn); auto(); }); });
    grid.addEventListener('mouseenter', function () { clearInterval(timer); }); grid.addEventListener('mouseleave', auto);
    show(1); auto();
  })();

  /* ===== solutions tabs + app screenshot tabs ===== */
  function tabs(btnAttr, panelAttr) {
    var bs = $$('[' + btnAttr + ']'), ps = $$('[' + panelAttr + ']'); if (!bs.length) return;
    var kb = btnAttr.replace(/^data-/, '').replace(/-(\w)/g, function (m, c) { return c.toUpperCase(); });
    var kp = panelAttr.replace(/^data-/, '').replace(/-(\w)/g, function (m, c) { return c.toUpperCase(); });
    bs.forEach(function (b) { b.addEventListener('click', function () {
      var i = +b.dataset[kb];
      bs.forEach(function (x) { var on = +x.dataset[kb] === i; x.classList.toggle('rx-on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
      ps.forEach(function (p) { p.classList.toggle('rx-on', +p.dataset[kp] === i); });
    }); });
  }
  tabs('data-rx-tabbtn', 'data-rx-tabpanel');
  tabs('data-shot-tab', 'data-shot-panel');

  /* ===== FAQ accordion ===== */
  $$('.rx-faq-item', root).forEach(function (f) {
    var btn = $('.rx-faq-q', f), ans = $('.rx-faq-a', f);
    if (f.classList.contains('rx-open')) ans.style.maxHeight = ans.scrollHeight + 'px';
    btn.addEventListener('click', function () {
      var open = f.classList.contains('rx-open');
      $$('.rx-faq-item.rx-open', root).forEach(function (o) { o.classList.remove('rx-open'); $('.rx-faq-a', o).style.maxHeight = null; $('.rx-faq-q', o).setAttribute('aria-expanded', 'false'); });
      if (!open) { f.classList.add('rx-open'); ans.style.maxHeight = ans.scrollHeight + 'px'; btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ===== connection ring ===== */
  (function () {
    var layer = $('#rxChipLayer'), svg = $('#rxNetSvg'); if (!layer || !svg) return;
    var ns = 'http://www.w3.org/2000/svg';
    /* each chip is a real thing in the product: tests, invoices, PDF, QR, WhatsApp, SMS, email, devices, cash, trends, roles, audit, sync */
    var chips = [
      { x: 5, y: 15, g: '🧪', t: 'Lab tests' }, { x: 15, y: 15, g: '🧾', t: 'Invoices' }, { x: 25, y: 15, g: '📄', t: 'PDF reports' }, { x: 35, y: 15, g: '🔳', t: 'QR verification' },
      { x: 65, y: 15, g: '📈', t: 'Result trends' }, { x: 75, y: 15, g: '🚨', t: 'Critical alerts' }, { x: 85, y: 15, g: '👥', t: 'Staff roles' }, { x: 95, y: 15, g: '🛡️', t: 'Audit log' },
      { x: 5, y: 50, g: '💬', t: 'WhatsApp' }, { x: 15, y: 50, g: '✉️', t: 'Email' }, { x: 25, y: 50, g: '📱', t: 'SMS' }, { x: 35, y: 50, g: '🏷️', t: 'Barcode labels' },
      { x: 65, y: 50, g: '🖥️', t: 'Windows' }, { x: 75, y: 50, g: '🍎', t: 'Mac' }, { x: 85, y: 50, g: '🤖', t: 'Android' }, { x: 95, y: 50, g: '🌐', t: 'Web' },
      { x: 15, y: 85, g: '💰', t: 'Cash closing' }, { x: 25, y: 85, g: '📊', t: 'Profit & loss' }, { x: 35, y: 85, g: '🩸', t: 'Samples' },
      { x: 65, y: 85, g: '☁️', t: 'Cloud sync' }, { x: 75, y: 85, g: '📴', t: 'Works offline' }, { x: 85, y: 85, g: '🖨️', t: 'Printing' }, { x: 95, y: 85, g: '💾', t: 'Backup export' }
    ];
    chips.forEach(function (c, i) {
      var line = document.createElementNS(ns, 'line'); line.setAttribute('x1', 50); line.setAttribute('y1', 50); line.setAttribute('x2', c.x); line.setAttribute('y2', c.y); svg.appendChild(line);
      var d = document.createElement('div'); d.className = 'rx-chip rx-pop'; d.textContent = c.g; d.title = c.t; d.setAttribute('role', 'img'); d.setAttribute('aria-label', c.t);
      d.style.left = c.x + '%'; d.style.top = c.y + '%'; d.style.setProperty('--rx-d', (0.15 + i * 0.045) + 's'); layer.appendChild(d);
    });
  })();
})();
