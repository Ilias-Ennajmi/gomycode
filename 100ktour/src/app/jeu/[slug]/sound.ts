// Sons de la machine, fabriqués à la volée : aucun fichier à télécharger.
// Le navigateur n'autorise le son qu'après un geste du joueur ; `unlock` est
// donc appelé au moment où il lance la machine.

let ctx: AudioContext | null = null;
let muted = false;
let ticker: ReturnType<typeof setInterval> | null = null;

export function setMuted(v: boolean) {
  muted = v;
  if (v) stopTicks();
}

export function unlock() {
  if (muted) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function vibrate(pattern: number | number[]) {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non pris en charge (iPhone) */
  }
}

export function lever() {
  tone(140, 0, 0.12, 'square', 0.12);
  tone(90, 0.1, 0.16, 'square', 0.1);
  vibrate(30);
}

export function startTicks() {
  stopTicks();
  ticker = setInterval(() => tone(900 + Math.random() * 500, 0, 0.03, 'square', 0.035), 70);
}

export function stopTicks() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

export function reelStop() {
  tone(220, 0, 0.09, 'triangle', 0.22);
  tone(110, 0.02, 0.12, 'sine', 0.2);
  vibrate(25);
}

export function win() {
  [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.2));
  vibrate([120, 60, 120, 60, 300]);
}

export function lose() {
  tone(330, 0, 0.22, 'sine', 0.16);
  tone(247, 0.2, 0.34, 'sine', 0.16);
  vibrate(80);
}
