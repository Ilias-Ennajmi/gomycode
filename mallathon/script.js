(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Scroll reveal =====
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (reduceMotion) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (entry.isIntersecting) {
          setTimeout(function () { entry.target.classList.add('in'); }, i * 90);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    requestAnimationFrame(function () {
      revealEls.forEach(function (el) { io.observe(el); });
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // ===== Countdown =====
  var TARGET = Date.UTC(2026, 8, 20, 6, 30, 0); // 2026-09-20 07:30 Africa/Casablanca (UTC+1)

  var daysEl = document.querySelector('[data-cd-days]');
  var hoursEl = document.querySelector('[data-cd-hours]');
  var minsEl = document.querySelector('[data-cd-mins]');
  var secsEl = document.querySelector('[data-cd-secs]');

  function pad(n) { return String(n).padStart(2, '0'); }

  var prev = { days: null, hours: null, mins: null, secs: null };

  function flip(el) {
    if (reduceMotion || !el || !el.animate) return;
    el.animate(
      [
        { transform: 'translateY(0) rotateX(0deg)', opacity: 1 },
        { transform: 'translateY(-46%) rotateX(-72deg)', opacity: 0 },
        { transform: 'translateY(46%) rotateX(64deg)', opacity: 0, offset: 0.52 },
        { transform: 'translateY(0) rotateX(0deg)', opacity: 1 }
      ],
      { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' }
    );
  }

  function tick() {
    var d = Math.max(0, TARGET - Date.now());
    var days = String(Math.floor(d / 864e5));
    var hours = pad(Math.floor(d / 36e5) % 24);
    var mins = pad(Math.floor(d / 6e4) % 60);
    var secs = pad(Math.floor(d / 1e3) % 60);

    if (prev.days !== null) {
      if (prev.secs !== secs) flip(secsEl);
      if (prev.mins !== mins) flip(minsEl);
      if (prev.hours !== hours) flip(hoursEl);
      if (prev.days !== days) flip(daysEl);
    }

    daysEl.textContent = days;
    hoursEl.textContent = hours;
    minsEl.textContent = mins;
    secsEl.textContent = secs;

    prev = { days: days, hours: hours, mins: mins, secs: secs };
  }

  tick();
  var timer = setInterval(tick, 1000);

  window.addEventListener('beforeunload', function () {
    clearInterval(timer);
  });
})();
