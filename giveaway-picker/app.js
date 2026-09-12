(() => {
  "use strict";

  // ---------- DOM ----------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const homeScreen = document.getElementById("home-screen");
  const homeStartBtn = document.getElementById("home-start-btn");
  const muteBtn = document.getElementById("mute-btn");
  const giveawayNameInput = document.getElementById("giveaway-name");
  const giveawayDateInput = document.getElementById("giveaway-date");
  const swatchRow = document.getElementById("swatch-row");
  const setupScreen = document.getElementById("setup-screen");
  const backToHomeBtn = document.getElementById("back-to-home-btn");
  const namesInput = document.getElementById("names-input");
  const namesCountEl = document.getElementById("names-count");
  const winnersCountInput = document.getElementById("winners-count");
  const allowDuplicatesInput = document.getElementById("allow-duplicates");
  const setupError = document.getElementById("setup-error");
  const startBtn = document.getElementById("start-btn");
  const controlsOverlay = document.getElementById("controls-overlay");
  const downloadVideoBtn = document.getElementById("download-video-btn");
  const downloadImageBtn = document.getElementById("download-image-btn");
  const restartBtn = document.getElementById("restart-btn");
  const recordingNote = document.getElementById("recording-note");

  const NAMES_STORAGE_KEY = "giveaway-picker-names";
  const DATE_STORAGE_KEY = "giveaway-picker-date";
  const NAME_STORAGE_KEY = "giveaway-picker-giveaway-name";
  const COLOR_STORAGE_KEY = "giveaway-picker-accent";
  const MUTE_STORAGE_KEY = "giveaway-picker-muted";
  const LANG_STORAGE_KEY = "giveaway-picker-lang";
  const DEFAULT_GIVEAWAY_NAME = "Planet Sport Giveaway";
  const HEADER_CLEARANCE = 58;

  // ---------- i18n ----------
  const STRINGS = {
    en: {
      "meta.title": "Planet Sport Giveaway",
      "home.title": "GIVEAWAY ROULETTE",
      "home.tagline": "Pick your winners live, on camera, in seconds.",
      "home.nameLabel": "Giveaway name",
      "home.dateLabel": "Giveaway date",
      "home.colorLabel": "Giveaway color",
      "home.startBtn": "Start New Giveaway",
      "mute.mute": "Mute",
      "mute.unmute": "Unmute",
      "setup.title": "Giveaway participants",
      "setup.subtitle": "Paste your entrants, pick how many winners, and go.",
      "setup.namesLabel": "Account names",
      "setup.namesHint": "(one per line, or comma-separated)",
      "setup.winnersLabel": "Number of winners",
      "setup.duplicatesLabel": "Allow the same name to win more than once",
      "setup.startBtn": "Start Giveaway",
      "setup.backBtn": "Back",
      "setup.errNeedTwo": "Add at least 2 names to run a giveaway.",
      "setup.errWinnersMin": "Number of winners must be at least 1.",
      "setup.errNotEnough":
        "You only have {n} names but asked for {c} winners. Enable duplicates or add more names.",
      "setup.errTooManyDup": "Please pick 50 winners or fewer per round.",
      "controls.downloadVideo": "Download Video",
      "controls.downloadImage": "Download Final Screen",
      "controls.newGiveaway": "New Giveaway",
      "controls.recordingUnsupported":
        "Video recording isn't supported in this browser — you can still download the final screen as an image.",
      "controls.recordingFailed":
        "Video recording failed to start — you can still download the final screen as an image.",
      "canvas.getReady": "Get ready — winner {i} of {n}",
      "canvas.picking": "Picking winner {i} of {n}…",
      "canvas.go": "GO!",
      "canvas.winnerOf": "Winner {i} of {n}",
      "canvas.winnersTitle": "WINNERS",
    },
    fr: {
      "meta.title": "Tombola Planet Sport",
      "home.title": "ROULETTE DE CADEAUX",
      "home.tagline": "Choisissez vos gagnants en direct, devant la caméra, en quelques secondes.",
      "home.nameLabel": "Nom du tirage",
      "home.dateLabel": "Date du tirage",
      "home.colorLabel": "Couleur du tirage",
      "home.startBtn": "Démarrer un nouveau tirage",
      "mute.mute": "Muet",
      "mute.unmute": "Activer le son",
      "setup.title": "Participants au tirage",
      "setup.subtitle": "Collez vos participants, choisissez le nombre de gagnants, et lancez.",
      "setup.namesLabel": "Noms des comptes",
      "setup.namesHint": "(un par ligne, ou séparés par des virgules)",
      "setup.winnersLabel": "Nombre de gagnants",
      "setup.duplicatesLabel": "Autoriser un même nom à gagner plusieurs fois",
      "setup.startBtn": "Lancer le tirage",
      "setup.backBtn": "Retour",
      "setup.errNeedTwo": "Ajoutez au moins 2 noms pour lancer un tirage.",
      "setup.errWinnersMin": "Le nombre de gagnants doit être d'au moins 1.",
      "setup.errNotEnough":
        "Vous n'avez que {n} noms mais avez demandé {c} gagnants. Activez les doublons ou ajoutez plus de noms.",
      "setup.errTooManyDup": "Choisissez 50 gagnants ou moins par tirage.",
      "controls.downloadVideo": "Télécharger la vidéo",
      "controls.downloadImage": "Télécharger l'écran final",
      "controls.newGiveaway": "Nouveau tirage",
      "controls.recordingUnsupported":
        "L'enregistrement vidéo n'est pas pris en charge par ce navigateur — vous pouvez toujours télécharger l'écran final en image.",
      "controls.recordingFailed":
        "L'enregistrement vidéo n'a pas pu démarrer — vous pouvez toujours télécharger l'écran final en image.",
      "canvas.getReady": "Préparez-vous — gagnant {i} sur {n}",
      "canvas.picking": "Sélection du gagnant {i} sur {n}…",
      "canvas.go": "GO !",
      "canvas.winnerOf": "Gagnant {i} sur {n}",
      "canvas.winnersTitle": "GAGNANTS",
    },
  };

  let currentLang = "en";

  function t(key, vars) {
    const dict = STRINGS[currentLang] || STRINGS.en;
    let str = dict[key] !== undefined ? dict[key] : STRINGS.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
      });
    }
    return str;
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });
    document.title = t("meta.title");
    updateNamesCount();
    updateMuteBtn();
  }

  // ---------- Brand palette (mirrors CSS custom properties in style.css) ----------
  const COLOR = {
    ink: "#17140f",
    black: "#0a0a0a",
    white: "#ffffff",
    accent: "#f5a623",
    accentDark: "#d98e12",
    gray50: "#f6f6f4",
    gray200: "#e4e2dc",
    gray500: "#8a8880",
    gray700: "#57544c",
  };

  function shadeHex(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function applyAccentColor(hex) {
    COLOR.accent = hex;
    COLOR.accentDark = shadeHex(hex, 0.78);
    document.documentElement.style.setProperty("--ps-accent", hex);
    document.documentElement.style.setProperty("--ps-accent-dark", COLOR.accentDark);
    if (swatchRow) {
      swatchRow.querySelectorAll(".swatch").forEach((btn) => {
        btn.setAttribute(
          "aria-pressed",
          btn.dataset.color.toLowerCase() === hex.toLowerCase() ? "true" : "false"
        );
      });
    }
  }

  const savedColor = localStorage.getItem(COLOR_STORAGE_KEY);
  applyAccentColor(savedColor || COLOR.accent);

  if (swatchRow) {
    swatchRow.addEventListener("click", (e) => {
      const btn = e.target.closest(".swatch");
      if (!btn) return;
      const hex = btn.dataset.color;
      applyAccentColor(hex);
      localStorage.setItem(COLOR_STORAGE_KEY, hex);
    });
  }

  const TITLE_FONT = "Bebas Neue, -apple-system, sans-serif";
  const BODY_FONT = "Inter, -apple-system, Segoe UI, Roboto, sans-serif";

  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 40px "Bebas Neue"').catch(() => {});
    document.fonts.load('600 16px "Inter"').catch(() => {});
  }

  // ---------- Canvas / DPR + responsive sizing ----------
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let W = window.innerWidth;
  let H = window.innerHeight;

  let ROW_HEIGHT = 78;
  let REEL_FONT_PX = 30;
  let REVEAL_FONT_PX = 52;
  let HEADER_FONT_PX = 22;
  let FINAL_TITLE_PX = 40;
  let FINAL_ROW_PX = 24;

  function computeResponsiveSizes() {
    if (W < 420) {
      ROW_HEIGHT = 58;
      REEL_FONT_PX = 22;
      REVEAL_FONT_PX = 34;
      HEADER_FONT_PX = 17;
      FINAL_TITLE_PX = 30;
      FINAL_ROW_PX = 19;
    } else if (W < 640) {
      ROW_HEIGHT = 70;
      REEL_FONT_PX = 27;
      REVEAL_FONT_PX = 42;
      HEADER_FONT_PX = 19;
      FINAL_TITLE_PX = 34;
      FINAL_ROW_PX = 21;
    } else {
      ROW_HEIGHT = 84;
      REEL_FONT_PX = 32;
      REVEAL_FONT_PX = 54;
      HEADER_FONT_PX = 22;
      FINAL_TITLE_PX = 40;
      FINAL_ROW_PX = 24;
    }
  }

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeResponsiveSizes();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- State ----------
  const STATE = {
    IDLE: "idle",
    COUNTDOWN: "countdown",
    SPINNING: "spinning",
    REVEAL: "reveal",
    FINAL: "final",
  };

  let state = STATE.IDLE;
  let pool = [];
  let winners = [];
  let winnersWanted = 1;
  let allowDuplicates = false;

  let countdownStartTime = 0;
  const COUNTDOWN_STEP_MS = 700;
  const COUNTDOWN_STEPS = 3; // 3, 2, 1

  let roundStartTime = 0;
  let currentWinnerName = null;
  let strip = [];
  let targetScroll = 0;
  let overshootPx = 46;
  const VISIBLE_ROWS = 7;
  const CENTER_ROW = Math.floor(VISIBLE_ROWS / 2);
  const SPIN_MS = 3600;
  const SETTLE_MS = 420;
  const REVEAL_MS = 1700;
  const FINAL_INTRO_MS = 900;
  const ROW_STAGGER_MS = 120;

  let revealStartTime = 0;
  let finalStartTime = 0;

  let confetti = [];
  let lastFinaleBurst = 0;

  // ---------- Recording ----------
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedMimeType = "video/webm";
  let videoBlobUrl = null;
  let finalImageBlobUrl = null;
  let recordingSupported =
    typeof canvas.captureStream === "function" &&
    typeof window.MediaRecorder !== "undefined";

  // ---------- Audio ----------
  let audioCtx = null;
  let muted = localStorage.getItem(MUTE_STORAGE_KEY) === "1";

  const ICON_SPEAKER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a8 8 0 0 1 0 11"/></svg>';
  const ICON_SPEAKER_MUTED =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z"/><path d="m16 9.5 4.5 5M20.5 9.5 16 14.5"/></svg>';
  const muteIcon = document.getElementById("mute-icon");

  function updateMuteBtn() {
    if (muteIcon) muteIcon.innerHTML = muted ? ICON_SPEAKER_MUTED : ICON_SPEAKER;
    muteBtn.setAttribute("aria-label", muted ? t("mute.unmute") : t("mute.mute"));
  }
  updateMuteBtn();

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    updateMuteBtn();
  });

  // ---------- Language toggle ----------
  const langButtons = document.querySelectorAll(".lang-btn");

  function setLanguage(lang) {
    currentLang = lang === "fr" ? "fr" : "en";
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    langButtons.forEach((b) => b.classList.toggle("active", b.dataset.lang === currentLang));
    applyTranslations();
  }

  langButtons.forEach((b) => {
    b.addEventListener("click", () => setLanguage(b.dataset.lang));
  });

  const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
  const browserLang = (navigator.language || "en").slice(0, 2) === "fr" ? "fr" : "en";
  setLanguage(savedLang || browserLang);

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type, gain, when) {
    if (muted) return;
    const ac = getAudioCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    const t0 = ac.currentTime + (when || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playTick() {
    playTone(520 + Math.random() * 80, 0.045, "square", 0.05, 0);
  }

  function playWinChime() {
    playTone(659.25, 0.18, "triangle", 0.18, 0);
    playTone(783.99, 0.18, "triangle", 0.16, 0.12);
    playTone(1046.5, 0.32, "triangle", 0.18, 0.24);
  }

  function playCountdownBeep(isFinal) {
    playTone(isFinal ? 880 : 523.25, 0.14, "square", 0.14, 0);
  }

  // ---------- Home screen: giveaway name / date ----------
  function todayISO() {
    const d = new Date();
    const tzOffsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  }

  function formatDateNice(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const savedName = localStorage.getItem(NAME_STORAGE_KEY);
  giveawayNameInput.value = savedName || DEFAULT_GIVEAWAY_NAME;
  giveawayNameInput.addEventListener("change", () => {
    const val = giveawayNameInput.value.trim() || DEFAULT_GIVEAWAY_NAME;
    giveawayNameInput.value = val;
    localStorage.setItem(NAME_STORAGE_KEY, val);
  });

  const savedDate = localStorage.getItem(DATE_STORAGE_KEY);
  giveawayDateInput.value = savedDate || todayISO();
  giveawayDateInput.addEventListener("change", () => {
    localStorage.setItem(DATE_STORAGE_KEY, giveawayDateInput.value);
  });

  // ---------- Screen navigation ----------
  function showScreen(el) {
    el.classList.remove("screen-hidden");
  }
  function hideScreen(el) {
    el.classList.add("screen-hidden");
  }

  homeStartBtn.addEventListener("click", () => {
    const nameVal = giveawayNameInput.value.trim() || DEFAULT_GIVEAWAY_NAME;
    giveawayNameInput.value = nameVal;
    localStorage.setItem(NAME_STORAGE_KEY, nameVal);
    if (giveawayDateInput.value) {
      localStorage.setItem(DATE_STORAGE_KEY, giveawayDateInput.value);
    }
    const ac = getAudioCtx();
    if (ac && ac.state === "suspended") ac.resume();
    hideScreen(homeScreen);
    showScreen(setupScreen);
  });

  backToHomeBtn.addEventListener("click", () => {
    hideScreen(setupScreen);
    showScreen(homeScreen);
  });

  // ---------- Name parsing ----------
  function parseNames(raw) {
    const parts = raw
      .split(/[\n,]/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const seen = new Set();
    const unique = [];
    for (const p of parts) {
      const key = p.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    }
    return unique;
  }

  function updateNamesCount() {
    const n = parseNames(namesInput.value).length;
    namesCountEl.textContent =
      currentLang === "fr"
        ? `${n} nom${n === 1 ? "" : "s"} unique${n === 1 ? "" : "s"}`
        : `${n} unique name${n === 1 ? "" : "s"}`;
  }
  namesInput.addEventListener("input", updateNamesCount);

  // Restore last-used names
  const savedNames = localStorage.getItem(NAMES_STORAGE_KEY);
  if (savedNames) {
    namesInput.value = savedNames;
    updateNamesCount();
  }

  // ---------- Randomness ----------
  function secureRandomIndex(max) {
    if (max <= 0) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0xffffffff / max) * max;
      let x;
      do {
        window.crypto.getRandomValues(buf);
        x = buf[0];
      } while (x >= limit);
      return x % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = secureRandomIndex(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- Setup / start ----------
  function showSetupError(msg) {
    setupError.textContent = msg;
    setupError.hidden = false;
  }
  function clearSetupError() {
    setupError.hidden = true;
    setupError.textContent = "";
  }

  startBtn.addEventListener("click", () => {
    clearSetupError();
    const names = parseNames(namesInput.value);
    const count = parseInt(winnersCountInput.value, 10);
    allowDuplicates = allowDuplicatesInput.checked;

    if (names.length < 2) {
      showSetupError(t("setup.errNeedTwo"));
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      showSetupError(t("setup.errWinnersMin"));
      return;
    }
    if (!allowDuplicates && count > names.length) {
      showSetupError(t("setup.errNotEnough", { n: names.length, c: count }));
      return;
    }
    if (allowDuplicates && count > 50) {
      showSetupError(t("setup.errTooManyDup"));
      return;
    }

    localStorage.setItem(NAMES_STORAGE_KEY, namesInput.value);

    winnersWanted = count;
    pool = shuffle(names);
    winners = [];

    // Best-effort: resume audio context on user gesture (autoplay policies).
    const ac = getAudioCtx();
    if (ac && ac.state === "suspended") ac.resume();

    hideScreen(setupScreen);
    hideScreen(controlsOverlay);
    videoBlobUrl = null;
    finalImageBlobUrl = null;

    startRecording();
    beginRound();
    if (!rafRunning) requestAnimationFrame(loop);
  });

  // ---------- Recording control ----------
  function startRecording() {
    recordedChunks = [];
    if (!recordingSupported) {
      recordingNote.hidden = false;
      recordingNote.textContent = t("controls.recordingUnsupported");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const candidates = [
        "video/mp4;codecs=avc1.640028",
        "video/mp4;codecs=h264",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      recordedMimeType =
        candidates.find((m) => window.MediaRecorder.isTypeSupported(m)) ||
        "video/webm";
      // Push the bitrate well above the browser's conservative default for a
      // visibly sharper export; scale up a bit further on high-DPI canvases.
      const pixelScale = Math.min(2, dpr);
      const videoBitsPerSecond = Math.round(6_000_000 + pixelScale * 3_000_000);
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: recordedMimeType,
        videoBitsPerSecond,
      });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: recordedMimeType });
        videoBlobUrl = URL.createObjectURL(blob);
        downloadVideoBtn.disabled = false;
      };
      mediaRecorder.start(250);
      downloadVideoBtn.disabled = true;
    } catch (err) {
      recordingSupported = false;
      recordingNote.hidden = false;
      recordingNote.textContent = t("controls.recordingFailed");
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }

  // ---------- Round lifecycle ----------
  function beginRound() {
    const winnerIdx = secureRandomIndex(pool.length);
    currentWinnerName = pool[winnerIdx];

    // Build a long shuffled strip ending on the winner so the reel has
    // plenty of names to scroll through before landing exactly on target.
    const loops = 9;
    strip = [];
    for (let i = 0; i < loops; i++) {
      strip = strip.concat(shuffle(pool));
    }
    strip.push(currentWinnerName);
    const targetIndex = strip.length - 1;
    // Pad past the winner so the overshoot bounce never scrolls into blank rows.
    strip = strip.concat(shuffle(pool).slice(0, VISIBLE_ROWS));
    // targetScroll is chosen so the winner lands exactly in the centered
    // highlight row (index CENTER_ROW) once partial scroll reaches 0.
    targetScroll = (targetIndex - CENTER_ROW) * ROW_HEIGHT;

    countdownStartTime = performance.now();
    state = STATE.COUNTDOWN;
    lastCountdownStep = -1;
    lastTickRow = -1;
    pulseStartTime = -Infinity;
  }

  let lastTickRow = -1;
  let lastCountdownStep = -1;
  let pulseStartTime = -Infinity;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }
  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function currentScrollOffset(now) {
    const elapsed = now - roundStartTime;
    if (elapsed <= SPIN_MS) {
      const spinT = Math.min(1, elapsed / SPIN_MS);
      const eased = easeOutCubic(spinT);
      return eased * (targetScroll + overshootPx);
    }
    const settleT = Math.min(1, (elapsed - SPIN_MS) / SETTLE_MS);
    const eased = easeOutQuad(settleT);
    const from = targetScroll + overshootPx;
    return from + (targetScroll - from) * eased;
  }

  function spawnConfettiBurst(cx, cy, count) {
    const colors = [COLOR.accent, COLOR.ink, "#ffd166", "#4cc9f0", COLOR.accentDark];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.5;
      confetti.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 5 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 90 + Math.random() * 50,
      });
    }
    if (confetti.length > 500) confetti.splice(0, confetti.length - 500);
  }

  function updateConfetti() {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      if (p.life > p.maxLife) confetti.splice(i, 1);
    }
  }

  function drawConfetti() {
    for (const p of confetti) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#fbfaf8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawHeader(text) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.gray700;
    ctx.font = `600 ${HEADER_FONT_PX}px ${BODY_FONT}`;
    ctx.fillText(text, W / 2, Math.max(HEADER_CLEARANCE + 24, H * 0.14));
    ctx.restore();
  }

  function drawCountdown(now) {
    const elapsed = now - countdownStartTime;
    const step = Math.min(
      COUNTDOWN_STEPS,
      Math.floor(elapsed / COUNTDOWN_STEP_MS)
    );
    if (step !== lastCountdownStep) {
      lastCountdownStep = step;
      pulseStartTime = now;
      playCountdownBeep(step === COUNTDOWN_STEPS);
      spawnConfettiBurst(W / 2, H / 2 - Math.min(140, W * 0.3), 16);
    }

    const cx = W / 2;
    const cy = H / 2 - Math.min(24, H * 0.03);
    const ringR = Math.min(132, W * 0.3);
    const stepElapsed = elapsed - step * COUNTDOWN_STEP_MS;
    const stepT = Math.min(1, stepElapsed / COUNTDOWN_STEP_MS);
    const overallT = Math.min(1, (step + stepT) / COUNTDOWN_STEPS);

    // radial glow pulse fired on each beat
    const pulseT = Math.min(1, (now - pulseStartTime) / 480);
    if (pulseT < 1) {
      ctx.save();
      const pulseR = ringR * (1 + pulseT * 0.7);
      const pulseAlpha = (1 - pulseT) * 0.3;
      const glow = ctx.createRadialGradient(cx, cy, ringR * 0.5, cx, cy, pulseR);
      glow.addColorStop(0, hexToRgba(COLOR.accent, 0));
      glow.addColorStop(0.75, hexToRgba(COLOR.accent, pulseAlpha));
      glow.addColorStop(1, hexToRgba(COLOR.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // dial tick marks around the ring — highlight sweeps with overall progress
    const tickCount = 24;
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
      const passed = i / tickCount <= overallT;
      const inner = ringR + 12;
      const outer = ringR + (i % 6 === 0 ? 21 : 17);
      ctx.save();
      ctx.lineWidth = i % 6 === 0 ? 2.5 : 1.5;
      ctx.strokeStyle = passed ? COLOR.accent : COLOR.gray200;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.stroke();
      ctx.restore();
    }

    // background track
    ctx.save();
    ctx.lineWidth = 10;
    ctx.strokeStyle = COLOR.gray200;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // per-tick progress sweep, gradient stroke
    ctx.save();
    const ringGrad = ctx.createLinearGradient(cx - ringR, cy - ringR, cx + ringR, cy + ringR);
    ringGrad.addColorStop(0, COLOR.accent);
    ringGrad.addColorStop(1, COLOR.accentDark);
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.strokeStyle = ringGrad;
    ctx.shadowColor = COLOR.accent;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + stepT * Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // number / GO with bounce-in scale + subtle extrusion depth
    const label = COUNTDOWN_STEPS - step > 0 ? String(COUNTDOWN_STEPS - step) : t("canvas.go");
    const popT = Math.min(1, stepElapsed / 220);
    const scale = 0.6 + easeOutBack(popT) * 0.4;
    const fontPx = Math.min(150, W * 0.32);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.font = `400 ${fontPx}px ${TITLE_FONT}`;
    ctx.fillStyle = COLOR.accentDark;
    ctx.globalAlpha = 0.55;
    ctx.fillText(label, 3, 9);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLOR.ink;
    ctx.fillText(label, 0, 4);
    ctx.restore();

    // step dots — glowing capsules
    const dotW = 30;
    const dotGap = 14;
    const totalW = COUNTDOWN_STEPS * dotW + (COUNTDOWN_STEPS - 1) * dotGap;
    const dotY = cy + ringR + 44;
    for (let i = 0; i < COUNTDOWN_STEPS; i++) {
      const filled = i < step || step === COUNTDOWN_STEPS;
      const dotX = cx - totalW / 2 + i * (dotW + dotGap);
      ctx.save();
      if (filled) {
        ctx.shadowColor = COLOR.accent;
        ctx.shadowBlur = 8;
        ctx.fillStyle = COLOR.accent;
      } else {
        ctx.fillStyle = COLOR.gray200;
      }
      roundRect(dotX, dotY - 4, dotW, 8, 4);
      ctx.fill();
      ctx.restore();
    }

    updateConfetti();
    drawConfetti();
  }

  function drawReel(now) {
    const visibleRows = VISIBLE_ROWS;
    const reelHeight = ROW_HEIGHT * visibleRows;
    const reelWidth = Math.min(640, W - 24);
    const reelX = W / 2 - reelWidth / 2;

    // Center the reel within the space below the fixed header + caption,
    // instead of the raw viewport center, so a tall reel never gets
    // painted over the "Picking winner…" caption above it.
    const headerY = Math.max(HEADER_CLEARANCE + 24, H * 0.14);
    const topClear = headerY + 40;
    const bottomClear = 24;
    const availH = Math.max(200, H - topClear - bottomClear);
    const centerY =
      reelHeight <= availH ? topClear + availH / 2 : topClear + reelHeight / 2;
    const reelY = centerY - reelHeight / 2;

    const offset = currentScrollOffset(now);
    const elapsed = now - roundStartTime;
    const isFast =
      elapsed < SPIN_MS * 0.75 && elapsed > SPIN_MS * 0.05;

    // sound tick per row crossed
    const rowIndex = Math.floor(offset / ROW_HEIGHT);
    if (rowIndex !== lastTickRow) {
      lastTickRow = rowIndex;
      playTick();
    }

    ctx.save();
    ctx.beginPath();
    roundRect(reelX, reelY, reelWidth, reelHeight, 24);
    ctx.clip();

    const bgGrad = ctx.createLinearGradient(0, reelY, 0, reelY + reelHeight);
    bgGrad.addColorStop(0, "#fbfaf8");
    bgGrad.addColorStop(0.5, COLOR.gray50);
    bgGrad.addColorStop(1, "#fbfaf8");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(reelX, reelY, reelWidth, reelHeight);

    const baseIndex = Math.floor(offset / ROW_HEIGHT);
    const partial = offset % ROW_HEIGHT;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const blurCopies = isFast ? 3 : 1;

    for (let row = -1; row <= visibleRows; row++) {
      const stripIndex = baseIndex + row;
      if (stripIndex < 0 || stripIndex >= strip.length) continue;
      const name = strip[stripIndex];
      // Vertical center of this row's text: row slots are laid out from
      // reelY downward, then scrolled upward by `partial` pixels.
      const y = reelY + (row + 0.5) * ROW_HEIGHT - partial;
      const distFromCenter = Math.abs(y - centerY);
      const distNorm = Math.min(1, distFromCenter / (reelHeight * 0.62));
      const scale = Math.max(0.66, 1 - distNorm * 0.4);
      const curvatureX = Math.max(0.78, 1 - distNorm * 0.24);
      const alpha = Math.max(0.28, 1 - distFromCenter / (reelHeight * 0.9));

      for (let b = 0; b < blurCopies; b++) {
        const blurOffset = b === 0 ? 0 : (b - 1.5) * 6;
        ctx.save();
        ctx.globalAlpha = alpha * (blurCopies > 1 ? 0.35 : 1);
        ctx.translate(reelX + reelWidth / 2, y + blurOffset);
        ctx.scale(scale * curvatureX, scale);
        ctx.font = `700 ${REEL_FONT_PX}px ${BODY_FONT}`;
        ctx.fillStyle = COLOR.ink;
        ctx.fillText(truncate(name, 24), 0, 0);
        ctx.restore();
      }
    }

    // fade top/bottom
    const fadeTop = ctx.createLinearGradient(0, reelY, 0, reelY + reelHeight * 0.38);
    fadeTop.addColorStop(0, "rgba(251,250,248,0.98)");
    fadeTop.addColorStop(1, "rgba(251,250,248,0)");
    ctx.fillStyle = fadeTop;
    ctx.fillRect(reelX, reelY, reelWidth, reelHeight * 0.38);

    const fadeBottom = ctx.createLinearGradient(0, reelY + reelHeight * 0.62, 0, reelY + reelHeight);
    fadeBottom.addColorStop(0, "rgba(251,250,248,0)");
    fadeBottom.addColorStop(1, "rgba(251,250,248,0.98)");
    ctx.fillStyle = fadeBottom;
    ctx.fillRect(reelX, reelY + reelHeight * 0.62, reelWidth, reelHeight * 0.38);

    // glowing filled center band (the "selected" chip)
    const bandY = centerY - ROW_HEIGHT / 2;
    ctx.save();
    const bandGrad = ctx.createLinearGradient(reelX, 0, reelX + reelWidth, 0);
    bandGrad.addColorStop(0, hexToRgba(COLOR.accent, 0.16));
    bandGrad.addColorStop(0.5, hexToRgba(COLOR.accent, 0.26));
    bandGrad.addColorStop(1, hexToRgba(COLOR.accent, 0.16));
    ctx.fillStyle = bandGrad;
    roundRect(reelX + 6, bandY, reelWidth - 12, ROW_HEIGHT, 12);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // border + intensifying glow while spinning fast
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLOR.gray200;
    roundRect(reelX, reelY, reelWidth, reelHeight, 24);
    ctx.stroke();

    ctx.strokeStyle = COLOR.accent;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = COLOR.accent;
    ctx.shadowBlur = isFast ? 16 : 10;
    roundRect(reelX + 6, bandY, reelWidth - 12, ROW_HEIGHT, 12);
    ctx.stroke();
    ctx.restore();

    // slot-machine pointer triangles marking the winning row
    ctx.save();
    ctx.fillStyle = COLOR.accent;
    const triY = centerY;
    const triSize = 9;
    ctx.beginPath();
    ctx.moveTo(reelX - 4, triY - triSize);
    ctx.lineTo(reelX - 4 + triSize + 4, triY);
    ctx.lineTo(reelX - 4, triY + triSize);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(reelX + reelWidth + 4, triY - triSize);
    ctx.lineTo(reelX + reelWidth + 4 - triSize - 4, triY);
    ctx.lineTo(reelX + reelWidth + 4, triY + triSize);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    return { reelX, reelWidth, centerY };
  }

  function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Five-point star, used for the reveal/final badges instead of emoji.
  function drawStar(cx, cy, outerR, innerR, fillStyle) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawReveal(now) {
    const revealT = Math.min(1, (now - revealStartTime) / REVEAL_MS);
    const pop = revealT < 0.25 ? easeOutQuad(revealT / 0.25) : 1;
    const scale = 0.85 + pop * 0.15;
    const cx = W / 2;
    const cy = H / 2;

    // Soft colored spotlight behind the winner name (replaces the
    // shadowBlur glow, which only reads well on a dark background).
    ctx.save();
    const spotR = Math.max(180, REVEAL_FONT_PX * 4.2);
    const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, spotR);
    spot.addColorStop(0, hexToRgba(COLOR.accent, 0.22));
    spot.addColorStop(1, hexToRgba(COLOR.accent, 0));
    ctx.fillStyle = spot;
    ctx.fillRect(cx - spotR, cy - spotR, spotR * 2, spotR * 2);
    ctx.restore();

    // Badge star above the name, popping in slightly ahead of the text.
    const badgeT = Math.max(0, Math.min(1, (revealT - 0.05) / 0.3));
    if (badgeT > 0) {
      const badgeScale = easeOutBack(badgeT);
      const badgeY = cy - REVEAL_FONT_PX * 0.95 - 30;
      ctx.save();
      ctx.translate(cx, badgeY);
      ctx.scale(badgeScale, badgeScale);
      const starGrad = ctx.createLinearGradient(-18, -18, 18, 18);
      starGrad.addColorStop(0, COLOR.accent);
      starGrad.addColorStop(1, COLOR.accentDark);
      ctx.shadowColor = COLOR.accent;
      ctx.shadowBlur = 12;
      drawStar(0, 0, 18, 8, starGrad);
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = COLOR.ink;
    ctx.font = `400 ${REVEAL_FONT_PX}px ${TITLE_FONT}`;
    ctx.fillText(truncate(currentWinnerName, 22), 0, -10);
    ctx.restore();

    // Thin gradient divider between the name and the "Winner X of N" caption.
    const dividerY = cy + REVEAL_FONT_PX * 0.55;
    const dividerW = Math.min(120, REVEAL_FONT_PX * 2.6);
    ctx.save();
    const divGrad = ctx.createLinearGradient(cx - dividerW / 2, 0, cx + dividerW / 2, 0);
    divGrad.addColorStop(0, hexToRgba(COLOR.accent, 0));
    divGrad.addColorStop(0.5, COLOR.accent);
    divGrad.addColorStop(1, hexToRgba(COLOR.accent, 0));
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - dividerW / 2, dividerY);
    ctx.lineTo(cx + dividerW / 2, dividerY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.accentDark;
    ctx.font = `600 ${HEADER_FONT_PX}px ${BODY_FONT}`;
    ctx.fillText(
      t("canvas.winnerOf", { i: winners.length, n: winnersWanted }),
      cx,
      dividerY + 24
    );
    ctx.restore();

    updateConfetti();
    drawConfetti();
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawFinal(now) {
    const availTop = HEADER_CLEARANCE + 20;
    const bottomReserve = Math.max(170, H * 0.25);
    const availBottom = Math.max(availTop + 200, H - bottomReserve);
    const availHeight = availBottom - availTop;

    const n = Math.max(1, winners.length);
    const titleBlockH = FINAL_TITLE_PX + 50;
    const rowGap = 10;
    const maxRowH = FINAL_ROW_PX + 30;
    const minRowH = FINAL_ROW_PX + 14;
    const rowsAvail = availHeight - titleBlockH - 28;
    const lineHeight = Math.max(minRowH, Math.min(maxRowH, rowsAvail / n - rowGap));
    const rowsBlockH = n * lineHeight + (n - 1) * rowGap;
    const contentH = titleBlockH + 28 + rowsBlockH;

    const cardWidth = Math.min(560, W - 32);
    const cardPad = 24;
    const cardHeight = Math.min(availHeight, contentH + cardPad * 2);
    const cardTop = availTop + Math.max(0, (availHeight - cardHeight) / 2);
    const cardX = W / 2 - cardWidth / 2;

    // Card container
    ctx.save();
    ctx.shadowColor = "rgba(23,20,15,0.14)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = COLOR.white;
    roundRect(cardX, cardTop, cardWidth, cardHeight, 24);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = COLOR.gray200;
    ctx.lineWidth = 1;
    roundRect(cardX, cardTop, cardWidth, cardHeight, 24);
    ctx.stroke();
    ctx.restore();

    // Top accent bar, matching the DOM panel treatment
    ctx.save();
    ctx.beginPath();
    roundRect(cardX, cardTop, cardWidth, cardHeight, 24);
    ctx.clip();
    const barGrad = ctx.createLinearGradient(cardX, 0, cardX + cardWidth, 0);
    barGrad.addColorStop(0, COLOR.accent);
    barGrad.addColorStop(1, COLOR.accentDark);
    ctx.fillStyle = barGrad;
    ctx.fillRect(cardX, cardTop, cardWidth, 5);
    ctx.restore();

    const contentTop = cardTop + cardPad;
    const titleY = contentTop + FINAL_TITLE_PX * 0.7;

    // Trophy-style star badge above the title
    ctx.save();
    const badgeGrad = ctx.createLinearGradient(-16, -16, 16, 16);
    badgeGrad.addColorStop(0, COLOR.accent);
    badgeGrad.addColorStop(1, COLOR.accentDark);
    ctx.translate(W / 2, titleY - FINAL_TITLE_PX * 0.85);
    drawStar(0, 0, 15, 6.5, badgeGrad);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR.ink;
    ctx.font = `400 ${FINAL_TITLE_PX}px ${TITLE_FONT}`;
    ctx.fillText(t("canvas.winnersTitle"), W / 2, titleY);
    ctx.restore();

    const dateStr = formatDateNice(giveawayDateInput.value);
    const nameStr = giveawayNameInput.value.trim() || DEFAULT_GIVEAWAY_NAME;
    const subtitle = dateStr ? `${nameStr.toUpperCase()} — ${dateStr}` : nameStr.toUpperCase();
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.accentDark;
    ctx.font = `600 ${Math.max(12, HEADER_FONT_PX - 4)}px ${BODY_FONT}`;
    ctx.fillText(truncate(subtitle, 60), W / 2, titleY + FINAL_TITLE_PX * 0.6 + 8);
    ctx.restore();

    const rowsStartY = contentTop + titleBlockH + 20;
    const rowWidth = cardWidth - cardPad * 2;
    const badgeR = Math.min(18, lineHeight * 0.32);

    ctx.textBaseline = "middle";
    winners.forEach((name, i) => {
      const rowElapsed = now - finalStartTime - i * ROW_STAGGER_MS;
      const rt = Math.max(0, Math.min(1, rowElapsed / FINAL_INTRO_MS));
      if (rt <= 0) return;
      const rowScale = 0.9 + easeOutQuad(rt) * 0.1;
      const rowAlpha = rt;
      const rowOffsetY = (1 - easeOutQuad(rt)) * 14;

      const rowCy = rowsStartY + i * (lineHeight + rowGap) + lineHeight / 2;

      ctx.save();
      ctx.globalAlpha = rowAlpha;
      ctx.translate(W / 2, rowCy + rowOffsetY);
      ctx.scale(rowScale, rowScale);

      ctx.fillStyle = COLOR.gray50;
      roundRect(-rowWidth / 2, -lineHeight / 2, rowWidth, lineHeight, 14);
      ctx.fill();
      ctx.strokeStyle = COLOR.gray200;
      ctx.lineWidth = 1;
      ctx.stroke();

      // rank badge (vector circle, no emoji)
      const badgeCx = -rowWidth / 2 + 16 + badgeR;
      const rankGrad = ctx.createLinearGradient(
        badgeCx - badgeR,
        -badgeR,
        badgeCx + badgeR,
        badgeR
      );
      if (i === 0) {
        rankGrad.addColorStop(0, COLOR.accent);
        rankGrad.addColorStop(1, COLOR.accentDark);
      } else {
        rankGrad.addColorStop(0, COLOR.gray200);
        rankGrad.addColorStop(1, COLOR.gray500);
      }
      ctx.beginPath();
      ctx.arc(badgeCx, 0, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = rankGrad;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = i === 0 ? COLOR.black : COLOR.white;
      ctx.font = `400 ${Math.max(12, badgeR * 1.05)}px ${TITLE_FONT}`;
      ctx.fillText(String(i + 1), badgeCx, badgeR * 0.08);

      ctx.textAlign = "left";
      ctx.fillStyle = COLOR.ink;
      ctx.font = `700 ${FINAL_ROW_PX}px ${BODY_FONT}`;
      ctx.fillText(truncate(name, 28), badgeCx + badgeR + 14, badgeR * 0.08);
      ctx.restore();
    });

    if (now - lastFinaleBurst > 700) {
      lastFinaleBurst = now;
      spawnConfettiBurst(Math.random() * W, -10, 40);
    }
    updateConfetti();
    drawConfetti();
  }

  // ---------- Main loop ----------
  let rafRunning = false;

  function loop(now) {
    rafRunning = true;
    drawBackground();

    if (state === STATE.COUNTDOWN) {
      drawHeader(t("canvas.getReady", { i: winners.length + 1, n: winnersWanted }));
      drawCountdown(now);
      if (now - countdownStartTime >= (COUNTDOWN_STEPS + 1) * COUNTDOWN_STEP_MS) {
        roundStartTime = now;
        state = STATE.SPINNING;
        lastTickRow = -1;
      }
    } else if (state === STATE.SPINNING) {
      drawHeader(t("canvas.picking", { i: winners.length + 1, n: winnersWanted }));
      drawReel(now);
      const elapsed = now - roundStartTime;
      if (elapsed >= SPIN_MS + SETTLE_MS) {
        winners.push(currentWinnerName);
        if (!allowDuplicates) {
          const idx = pool.indexOf(currentWinnerName);
          if (idx !== -1) pool.splice(idx, 1);
        }
        spawnConfettiBurst(W / 2, H / 2, 160);
        playWinChime();
        revealStartTime = now;
        state = STATE.REVEAL;
      }
    } else if (state === STATE.REVEAL) {
      drawReveal(now);
      if (now - revealStartTime >= REVEAL_MS) {
        if (winners.length < winnersWanted && pool.length > 0) {
          beginRound();
        } else {
          finalStartTime = now;
          lastFinaleBurst = 0;
          state = STATE.FINAL;
        }
      }
    } else if (state === STATE.FINAL) {
      drawFinal(now);
      const lastRowDone =
        now - finalStartTime - (winners.length - 1) * ROW_STAGGER_MS >= FINAL_INTRO_MS;
      if (lastRowDone && controlsOverlay.classList.contains("screen-hidden")) {
        onReachedFinalScreen();
      }
    }

    requestAnimationFrame(loop);
  }

  function onReachedFinalScreen() {
    // Grab a snapshot (already includes the logo + name/date watermark
    // drawn by drawFinal) for the "download final screen" image.
    canvas.toBlob((blob) => {
      if (blob) {
        if (finalImageBlobUrl) URL.revokeObjectURL(finalImageBlobUrl);
        finalImageBlobUrl = URL.createObjectURL(blob);
        downloadImageBtn.disabled = false;
      }
    }, "image/png");

    stopRecording();
    showScreen(controlsOverlay);
  }

  // ---------- Controls ----------
  downloadVideoBtn.addEventListener("click", () => {
    if (!videoBlobUrl) return;
    const ext = recordedMimeType.includes("webm") ? "webm" : "mp4";
    triggerDownload(videoBlobUrl, `giveaway-${Date.now()}.${ext}`);
  });

  downloadImageBtn.addEventListener("click", () => {
    if (!finalImageBlobUrl) return;
    triggerDownload(finalImageBlobUrl, `giveaway-winners-${Date.now()}.png`);
  });

  restartBtn.addEventListener("click", () => {
    resetToHome();
  });

  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function resetToHome() {
    state = STATE.IDLE;
    confetti = [];
    winners = [];
    pool = [];
    if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    if (finalImageBlobUrl) URL.revokeObjectURL(finalImageBlobUrl);
    videoBlobUrl = null;
    finalImageBlobUrl = null;
    downloadVideoBtn.disabled = true;
    downloadImageBtn.disabled = true;
    recordingNote.hidden = true;
    hideScreen(controlsOverlay);
    hideScreen(setupScreen);
    showScreen(homeScreen);
    ctx.clearRect(0, 0, W, H);
  }

  downloadVideoBtn.disabled = true;
  downloadImageBtn.disabled = true;
})();
