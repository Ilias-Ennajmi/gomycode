(() => {
  "use strict";

  // ---------- DOM ----------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const homeScreen = document.getElementById("home-screen");
  const homeStartBtn = document.getElementById("home-start-btn");
  const muteBtn = document.getElementById("mute-btn");
  const giveawayDateInput = document.getElementById("giveaway-date");
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
  const MUTE_STORAGE_KEY = "giveaway-picker-muted";

  // ---------- Brand palette (mirrors CSS custom properties in style.css) ----------
  const COLOR = {
    black: "#0a0a0a",
    white: "#ffffff",
    amber: "#f5a623",
    amberDark: "#d98e12",
    gray200: "#e4e2dc",
    gray500: "#8a8880",
  };

  const TITLE_FONT = "Bebas Neue, -apple-system, sans-serif";
  const BODY_FONT = "-apple-system, Segoe UI, Roboto, sans-serif";

  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 40px "Bebas Neue"').catch(() => {});
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
      ROW_HEIGHT = 52;
      REEL_FONT_PX = 20;
      REVEAL_FONT_PX = 32;
      HEADER_FONT_PX = 17;
      FINAL_TITLE_PX = 30;
      FINAL_ROW_PX = 19;
    } else if (W < 640) {
      ROW_HEIGHT = 62;
      REEL_FONT_PX = 24;
      REVEAL_FONT_PX = 40;
      HEADER_FONT_PX = 19;
      FINAL_TITLE_PX = 34;
      FINAL_ROW_PX = 21;
    } else {
      ROW_HEIGHT = 78;
      REEL_FONT_PX = 30;
      REVEAL_FONT_PX = 52;
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

  function updateMuteBtn() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  }
  updateMuteBtn();

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    updateMuteBtn();
  });

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

  // ---------- Home screen: giveaway date ----------
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

  const savedDate = localStorage.getItem(DATE_STORAGE_KEY);
  giveawayDateInput.value = savedDate || todayISO();
  giveawayDateInput.addEventListener("change", () => {
    localStorage.setItem(DATE_STORAGE_KEY, giveawayDateInput.value);
  });

  // ---------- Screen navigation ----------
  homeStartBtn.addEventListener("click", () => {
    if (giveawayDateInput.value) {
      localStorage.setItem(DATE_STORAGE_KEY, giveawayDateInput.value);
    }
    const ac = getAudioCtx();
    if (ac && ac.state === "suspended") ac.resume();
    homeScreen.hidden = true;
    setupScreen.hidden = false;
  });

  backToHomeBtn.addEventListener("click", () => {
    setupScreen.hidden = true;
    homeScreen.hidden = false;
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
    namesCountEl.textContent = `${n} unique name${n === 1 ? "" : "s"}`;
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
      showSetupError("Add at least 2 names to run a giveaway.");
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      showSetupError("Number of winners must be at least 1.");
      return;
    }
    if (!allowDuplicates && count > names.length) {
      showSetupError(
        `You only have ${names.length} names but asked for ${count} winners. Enable duplicates or add more names.`
      );
      return;
    }
    if (allowDuplicates && count > 50) {
      showSetupError("Please pick 50 winners or fewer per round.");
      return;
    }

    localStorage.setItem(NAMES_STORAGE_KEY, namesInput.value);

    winnersWanted = count;
    pool = shuffle(names);
    winners = [];

    // Best-effort: resume audio context on user gesture (autoplay policies).
    const ac = getAudioCtx();
    if (ac && ac.state === "suspended") ac.resume();

    setupScreen.hidden = true;
    controlsOverlay.hidden = true;
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
      recordingNote.textContent =
        "Video recording isn't supported in this browser — you can still download the final screen as an image.";
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const candidates = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      recordedMimeType =
        candidates.find((m) => window.MediaRecorder.isTypeSupported(m)) ||
        "video/webm";
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: recordedMimeType,
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
      recordingNote.textContent =
        "Video recording failed to start — you can still download the final screen as an image.";
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
  }

  let lastTickRow = -1;
  let lastCountdownStep = -1;

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
      const t = Math.min(1, elapsed / SPIN_MS);
      const eased = easeOutCubic(t);
      return eased * (targetScroll + overshootPx);
    }
    const settleT = Math.min(1, (elapsed - SPIN_MS) / SETTLE_MS);
    const eased = easeOutQuad(settleT);
    const from = targetScroll + overshootPx;
    return from + (targetScroll - from) * eased;
  }

  function spawnConfettiBurst(cx, cy, count) {
    const colors = [COLOR.amber, COLOR.white, "#ffd166", "#3a3936"];
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

  // ---------- Planet Sport logo mark (canvas) ----------
  function drawLogoMark(cx, cy, size, ringColor, planetColor, crescentColor) {
    const r = size * 0.32;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = size * 0.09;
    ctx.beginPath();
    ctx.save();
    ctx.rotate((-18 * Math.PI) / 180);
    ctx.scale(1, 0.32);
    ctx.arc(0, size * 0.06, size * 0.5, 0, Math.PI * 2);
    ctx.restore();
    ctx.stroke();

    ctx.translate(-size * 0.07, -size * 0.08);
    ctx.fillStyle = planetColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = crescentColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.fill();
    ctx.restore();
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141414");
    g.addColorStop(1, COLOR.black);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawHeader(text) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.gray200;
    ctx.font = `600 ${HEADER_FONT_PX}px ${BODY_FONT}`;
    ctx.fillText(text, W / 2, Math.max(44, H * 0.1));
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
      playCountdownBeep(step === COUNTDOWN_STEPS);
    }

    drawLogoMark(W / 2, H * 0.32, Math.min(90, W * 0.22), COLOR.amber, COLOR.white, COLOR.black);

    const label = COUNTDOWN_STEPS - step > 0 ? String(COUNTDOWN_STEPS - step) : "GO!";
    const stepElapsed = elapsed - step * COUNTDOWN_STEP_MS;
    const t = Math.min(1, stepElapsed / 220);
    const scale = 0.6 + easeOutBack(t) * 0.4;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(W / 2, H / 2 + 20);
    ctx.scale(scale, scale);
    ctx.fillStyle = COLOR.amber;
    ctx.font = `400 ${Math.min(160, W * 0.34)}px ${TITLE_FONT}`;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawReel(now) {
    const centerY = H / 2;
    const visibleRows = VISIBLE_ROWS;
    const reelHeight = ROW_HEIGHT * visibleRows;
    const reelWidth = Math.min(560, W - 32);
    const reelX = W / 2 - reelWidth / 2;
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
    roundRect(reelX, reelY, reelWidth, reelHeight, 20);
    ctx.clip();

    ctx.fillStyle = "rgba(255,255,255,0.05)";
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
      const scale = Math.max(0.72, 1 - distFromCenter / (reelHeight * 1.4));
      const alpha = Math.max(0.25, 1 - distFromCenter / (reelHeight * 0.9));

      for (let b = 0; b < blurCopies; b++) {
        const blurOffset = b === 0 ? 0 : (b - 1.5) * 6;
        ctx.save();
        ctx.globalAlpha = alpha * (blurCopies > 1 ? 0.35 : 1);
        ctx.translate(reelX + reelWidth / 2, y + blurOffset);
        ctx.scale(scale, scale);
        ctx.font = `700 ${REEL_FONT_PX}px ${BODY_FONT}`;
        ctx.fillStyle = COLOR.white;
        ctx.fillText(truncate(name, 24), 0, 0);
        ctx.restore();
      }
    }

    // fade top/bottom
    const fadeTop = ctx.createLinearGradient(0, reelY, 0, reelY + reelHeight * 0.35);
    fadeTop.addColorStop(0, "rgba(10,10,10,0.95)");
    fadeTop.addColorStop(1, "rgba(10,10,10,0)");
    ctx.fillStyle = fadeTop;
    ctx.fillRect(reelX, reelY, reelWidth, reelHeight * 0.35);

    const fadeBottom = ctx.createLinearGradient(0, reelY + reelHeight * 0.65, 0, reelY + reelHeight);
    fadeBottom.addColorStop(0, "rgba(10,10,10,0)");
    fadeBottom.addColorStop(1, "rgba(10,10,10,0.95)");
    ctx.fillStyle = fadeBottom;
    ctx.fillRect(reelX, reelY + reelHeight * 0.65, reelWidth, reelHeight * 0.35);

    ctx.restore();

    // border + center highlight band
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    roundRect(reelX, reelY, reelWidth, reelHeight, 20);
    ctx.stroke();

    const bandY = centerY - ROW_HEIGHT / 2;
    ctx.strokeStyle = COLOR.amber;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = COLOR.amber;
    ctx.shadowBlur = 14;
    ctx.strokeRect(reelX + 6, bandY, reelWidth - 12, ROW_HEIGHT);
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

  function drawReveal(now) {
    const t = Math.min(1, (now - revealStartTime) / REVEAL_MS);
    const pop = t < 0.25 ? easeOutQuad(t / 0.25) : 1;
    const scale = 0.85 + pop * 0.15;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(245,166,35,0.85)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = COLOR.white;
    ctx.font = `400 ${REVEAL_FONT_PX}px ${TITLE_FONT}`;
    ctx.fillText(truncate(currentWinnerName, 22), 0, -10);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.amber;
    ctx.font = `600 ${HEADER_FONT_PX}px ${BODY_FONT}`;
    ctx.fillText(
      `Winner ${winners.length} of ${winnersWanted}`,
      W / 2,
      H / 2 + REVEAL_FONT_PX * 0.9 + 16
    );
    ctx.restore();

    updateConfetti();
    drawConfetti();
  }

  function drawFinal(now) {
    const t = Math.min(1, (now - finalStartTime) / FINAL_INTRO_MS);
    const introScale = 0.9 + easeOutQuad(t) * 0.1;

    const topY = Math.max(70, H * 0.12);
    drawLogoMark(W / 2 - 90, topY, 34, COLOR.amber, COLOR.white, COLOR.black);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR.white;
    ctx.font = `400 ${FINAL_TITLE_PX}px ${TITLE_FONT}`;
    ctx.fillText("WINNERS", W / 2 + 20, topY);
    ctx.restore();

    const dateStr = formatDateNice(giveawayDateInput.value);
    if (dateStr) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = COLOR.amber;
      ctx.font = `600 ${Math.max(12, HEADER_FONT_PX - 4)}px ${BODY_FONT}`;
      ctx.fillText(`PLANET SPORT GIVEAWAY — ${dateStr}`, W / 2, topY + FINAL_TITLE_PX * 0.6 + 10);
      ctx.restore();
    }

    const medals = ["🥇", "🥈", "🥉"];
    const startY = topY + FINAL_TITLE_PX + 56;
    const lineHeight = FINAL_ROW_PX + 32;
    const cardWidth = Math.min(520, W - 40);

    ctx.save();
    ctx.translate(W / 2, 0);
    ctx.scale(introScale, introScale);
    ctx.translate(-W / 2, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    winners.forEach((name, i) => {
      const y = startY + i * lineHeight;
      const label = (medals[i] || `#${i + 1}`) + "  " + truncate(name, 30);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(W / 2 - cardWidth / 2, y - lineHeight / 2 + 6, cardWidth, lineHeight - 12, 14);
      ctx.fill();
      ctx.fillStyle = COLOR.white;
      ctx.font = `700 ${FINAL_ROW_PX}px ${BODY_FONT}`;
      ctx.fillText(label, W / 2, y);
    });
    ctx.restore();

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
      drawHeader(`Get ready — winner ${winners.length + 1} of ${winnersWanted}`);
      drawCountdown(now);
      if (now - countdownStartTime >= (COUNTDOWN_STEPS + 1) * COUNTDOWN_STEP_MS) {
        roundStartTime = now;
        state = STATE.SPINNING;
        lastTickRow = -1;
      }
    } else if (state === STATE.SPINNING) {
      drawHeader(`Picking winner ${winners.length + 1} of ${winnersWanted}…`);
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
      if (now - finalStartTime >= FINAL_INTRO_MS && controlsOverlay.hidden) {
        onReachedFinalScreen();
      }
    }

    requestAnimationFrame(loop);
  }

  function onReachedFinalScreen() {
    // Grab a snapshot (already includes the logo + date watermark drawn by
    // drawFinal) for the "download final screen" image.
    canvas.toBlob((blob) => {
      if (blob) {
        if (finalImageBlobUrl) URL.revokeObjectURL(finalImageBlobUrl);
        finalImageBlobUrl = URL.createObjectURL(blob);
        downloadImageBtn.disabled = false;
      }
    }, "image/png");

    stopRecording();
    controlsOverlay.hidden = false;
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
    controlsOverlay.hidden = true;
    setupScreen.hidden = true;
    homeScreen.hidden = false;
    ctx.clearRect(0, 0, W, H);
  }

  downloadVideoBtn.disabled = true;
  downloadImageBtn.disabled = true;
})();
