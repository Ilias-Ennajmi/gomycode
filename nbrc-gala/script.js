(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Scroll reveal =====
  var revealEls = document.querySelectorAll('[data-reveal]');

  function revealAll() {
    Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('is-in'); });
  }

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

    requestAnimationFrame(function () {
      Array.prototype.forEach.call(revealEls, function (el) { io.observe(el); });
    });
  }

  // ===== Countdown =====
  // Sat 12 Dec 2026, 20:00 in Africa/Casablanca (UTC+1 in December) => 19:00 UTC.
  // Anchored to UTC so every visitor counts down to the same moment, wherever they are.
  var TARGET = Date.UTC(2026, 11, 12, 19, 0, 0);

  var daysEl = document.querySelector('[data-cd-days]');
  var hoursEl = document.querySelector('[data-cd-hours]');
  var minsEl = document.querySelector('[data-cd-mins]');
  var secsEl = document.querySelector('[data-cd-secs]');

  function pad(n) { return String(n).padStart(2, '0'); }

  function set(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function tick() {
    var diff = Math.max(0, TARGET - Date.now());
    set(daysEl, pad(Math.floor(diff / 86400000)));
    set(hoursEl, pad(Math.floor((diff % 86400000) / 3600000)));
    set(minsEl, pad(Math.floor((diff % 3600000) / 60000)));
    set(secsEl, pad(Math.floor((diff % 60000) / 1000)));
  }

  if (daysEl) {
    tick();
    setInterval(tick, 1000);
  }

  // ===== Logo fallback =====
  // The two logo PNGs are dropped into assets/ at launch. Until then (or if one
  // fails to load) fall back to a wordmark instead of a broken-image icon.
  function handleLogoError(img) {
    var text = img.getAttribute('data-logo-fallback');
    if (!text) {
      img.style.display = 'none';
      return;
    }
    var span = document.createElement('span');
    span.className = 'hero-logo-fallback';
    span.textContent = text;
    if (img.parentNode) img.parentNode.replaceChild(span, img);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-logo]'), function (img) {
    img.addEventListener('error', function () { handleLogoError(img); });
    // The image may already have failed before this script ran.
    if (img.complete && img.naturalWidth === 0) handleLogoError(img);
  });
})();
