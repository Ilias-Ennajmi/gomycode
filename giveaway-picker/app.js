(() => {
  "use strict";

  // ---------- DOM ----------
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const setupScreen = document.getElementById("setup-screen");
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

  const STORAGE_KEY = "giveaway-picker-names";

  // ---------- Canvas / DPR setup ----------
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let W = window.innerWidth;
  let H = window.innerHeight;

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- State ----------
  const STATE = {
    IDLE: "idle",
    SPINNING: "spinning",
    REVEAL: "reveal",
    FINAL: "final",
  };

  let state = STATE.IDLE;
  let pool = [];
  let winners = [];
  let winnersWanted = 1;
  let allowDuplicates = false;

  let roundStartTime = 0;
  let currentWinnerName = null;
  let strip = [];
  let targetScroll = 0;
  let overshootPx = 46;
  const ROW_HEIGHT = 78;
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
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type, gain, when) {
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
  const savedNames = localStorage.getItem(STORAGE_KEY);
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

    localStorage.setItem(STORAGE_KEY, namesInput.value);

    winnersWanted = count;
    pool = shuffle(names);
    winners = [];

    // Best-effort: resume audio context on user gesture (autoplay policies).
    const ac = getAudioCtx();
    if (ac && ac.state === "suspended") ac.resume();

    setupScreen.style.display = "none";
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

    roundStartTime = performance.now();
    state = STATE.SPINNING;
    lastTickRow = -1;
  }

  let lastTickRow = -1;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
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
    const colors = ["#ff6ec7", "#7c6cff", "#ffd166", "#06d6a0", "#4cc9f0"];
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
    g.addColorStop(0, "#141034");
    g.addColorStop(1, "#0b0f2b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawHeader(text) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#c9c7ff";
    ctx.font = "600 18px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(text, W / 2, Math.max(48, H * 0.12));
    ctx.restore();
  }

  function drawReel(now) {
    const centerY = H / 2;
    const visibleRows = VISIBLE_ROWS;
    const reelHeight = ROW_HEIGHT * visibleRows;
    const reelWidth = Math.min(560, W - 48);
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
        ctx.font = "700 30px -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(truncate(name, 24), 0, 0);
        ctx.restore();
      }
    }

    // fade top/bottom
    const fadeTop = ctx.createLinearGradient(0, reelY, 0, reelY + reelHeight * 0.35);
    fadeTop.addColorStop(0, "rgba(11,15,43,0.95)");
    fadeTop.addColorStop(1, "rgba(11,15,43,0)");
    ctx.fillStyle = fadeTop;
    ctx.fillRect(reelX, reelY, reelWidth, reelHeight * 0.35);

    const fadeBottom = ctx.createLinearGradient(0, reelY + reelHeight * 0.65, 0, reelY + reelHeight);
    fadeBottom.addColorStop(0, "rgba(11,15,43,0)");
    fadeBottom.addColorStop(1, "rgba(11,15,43,0.95)");
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
    ctx.strokeStyle = "#ff6ec7";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#ff6ec7";
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
    ctx.shadowColor = "rgba(255,110,199,0.8)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fff";
    ctx.font = "800 52px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(truncate(currentWinnerName, 22), 0, -10);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#c9c7ff";
    ctx.font = "600 18px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(
      `Winner ${winners.length} of ${winnersWanted}`,
      W / 2,
      H / 2 + 60
    );
    ctx.restore();

    updateConfetti();
    drawConfetti();
  }

  function drawFinal(now) {
    const t = Math.min(1, (now - finalStartTime) / FINAL_INTRO_MS);
    const introScale = 0.9 + easeOutQuad(t) * 0.1;

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 34px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("🎉 Winners! 🎉", W / 2, Math.max(90, H * 0.16));
    ctx.restore();

    const medals = ["🥇", "🥈", "🥉"];
    const startY = Math.max(150, H * 0.28);
    const lineHeight = 56;

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
      roundRect(W / 2 - 260, y - lineHeight / 2 + 6, 520, lineHeight - 12, 14);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 24px -apple-system, Segoe UI, Roboto, sans-serif";
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

    if (state === STATE.SPINNING) {
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
    // Grab a clean snapshot for the "download final screen" image.
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
    resetToSetup();
  });

  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function resetToSetup() {
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
    setupScreen.style.display = "flex";
    ctx.clearRect(0, 0, W, H);
  }

  downloadVideoBtn.disabled = true;
  downloadImageBtn.disabled = true;
})();
