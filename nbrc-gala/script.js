(function () {
  'use strict';

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = motionQuery.matches;

  var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  var nav = document.querySelector('[data-nav]');
  var progress = document.querySelector('[data-progress]');
  var heroInner = document.querySelector('[data-parallax]');
  var hero = heroInner ? heroInner.parentNode : null;

  // ===== Scroll reveal =====
  // Driven from the shared scroll handler rather than IntersectionObserver:
  // with only a handful of targets it costs nothing, and it cannot miss an
  // element the way an observer can when the page jumps (anchor link, restored
  // scroll position, or a fast programmatic scroll).
  function reveal(el) {
    if (el.classList.contains('is-in')) return;
    if (el.hasAttribute('data-stagger')) {
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) {
        kids[i].style.setProperty('--d', (i * 0.09) + 's');
      }
    }
    el.classList.add('is-in');
  }

  function revealAll() {
    revealEls.forEach(reveal);
    revealEls.length = 0;
  }

  function sweepReveals() {
    if (!revealEls.length) return;
    var trigger = window.innerHeight * 0.88;
    for (var i = revealEls.length - 1; i >= 0; i--) {
      var el = revealEls[i];
      if (el.getBoundingClientRect().top < trigger) {
        reveal(el);
        revealEls.splice(i, 1);
      }
    }
  }

  // ===== Scroll-driven chrome =====
  function updateChrome() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;

    if (nav) nav.classList.toggle('is-scrolled', y > 12);

    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.setProperty('--p', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
    }

    if (heroInner && hero && !reduceMotion) {
      var h = hero.offsetHeight || 1;
      if (y < h) {
        // Hold full opacity for the first quarter, then ease out. A linear fade
        // from y=0 washes the headline out while it is still square on screen.
        var t = Math.min(1, Math.max(0, (y / h - 0.25) / 0.6));
        heroInner.style.setProperty('--py', (y * 0.16).toFixed(1) + 'px');
        heroInner.style.setProperty('--po', (1 - t).toFixed(3));
      } else {
        heroInner.style.setProperty('--po', '0');
      }
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      updateChrome();
      sweepReveals();
      ticking = false;
    });
  }

  if (reduceMotion) {
    revealAll();
  } else {
    sweepReveals();
  }
  updateChrome();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', onScroll);

  // Honour a mid-session change to the reduced-motion preference.
  var onMotionChange = function (e) {
    reduceMotion = e.matches;
    if (reduceMotion) {
      revealAll();
      if (heroInner) {
        heroInner.style.removeProperty('--py');
        heroInner.style.removeProperty('--po');
      }
    }
  };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);

  // ===== Countdown =====
  // Sat 12 Dec 2026, 19:00 in Africa/Casablanca (UTC+1 in December) => 18:00 UTC.
  // Anchored to UTC so every visitor counts down to the same moment, wherever they are.
  var TARGET = Date.UTC(2026, 11, 12, 18, 0, 0);

  var units = [
    { el: document.querySelector('[data-cd-days]'), div: 86400000, mod: 0 },
    { el: document.querySelector('[data-cd-hours]'), div: 3600000, mod: 86400000 },
    { el: document.querySelector('[data-cd-mins]'), div: 60000, mod: 3600000 },
    { el: document.querySelector('[data-cd-secs]'), div: 1000, mod: 60000 }
  ];

  function pad(n) { return String(n).padStart(2, '0'); }

  function set(unit, value) {
    var el = unit.el;
    if (!el || el.textContent === value) return;
    el.textContent = value;
    if (reduceMotion) return;
    el.classList.remove('is-ticking');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-ticking');
  }

  function tick() {
    var diff = Math.max(0, TARGET - Date.now());
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var raw = u.mod ? (diff % u.mod) : diff;
      set(u, pad(Math.floor(raw / u.div)));
    }
  }

  if (units[0].el) {
    tick();
    setInterval(tick, 1000);
  }

  // ===== Click-to-play video =====
  // The file is self-hosted and only requested on click, so the page costs
  // nothing extra to load and no third party is involved at all.
  var playBtn = document.querySelector('[data-video-src]');
  if (playBtn) {
    playBtn.addEventListener('click', function () {
      var src = playBtn.getAttribute('data-video-src');
      if (!src) return;

      var frame = document.createElement('div');
      frame.className = 'media-frame';

      var video = document.createElement('video');
      video.src = src;
      // Same still the facade showed, so there is no gray flash while the
      // first frame decodes after the swap.
      var poster = playBtn.getAttribute('data-video-poster');
      if (poster) video.poster = poster;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('preload', 'auto');

      frame.appendChild(video);
      if (playBtn.parentNode) playBtn.parentNode.replaceChild(frame, playBtn);
      // Autoplay with sound is blocked by default; fall back to muted so the
      // click always results in playback, and leave the controls to unmute.
      var attempt = video.play();
      if (attempt && attempt.catch) {
        attempt.catch(function () { video.muted = true; video.play().catch(function () {}); });
      }
    });
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
    // The hero fallback is set in large serif type, which now also suits
    // the organizer credit — it is a standalone section, sized to match.
    span.className = img.classList.contains('organizer-logo')
      ? 'organizer-fallback'
      : 'hero-logo-fallback';
    span.textContent = text;
    if (img.parentNode) img.parentNode.replaceChild(span, img);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-logo]'), function (img) {
    img.addEventListener('error', function () { handleLogoError(img); });
    // The image may already have failed before this script ran.
    if (img.complete && img.naturalWidth === 0) handleLogoError(img);
  });
})();
