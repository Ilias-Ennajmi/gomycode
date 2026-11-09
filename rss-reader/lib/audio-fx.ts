"use client";

// Voice boost and silence trimming for podcast episodes, with the Web Audio API.
//
// Routing an <audio> element through Web Audio is one-way: from then on everything it
// plays goes through the graph, and a file from a server that doesn't allow it (no CORS)
// comes out silent. So effects only ever attach while a *downloaded* episode plays (served
// from this origin by the service worker), and the player swaps in a fresh <audio> element
// before streaming anything else (components/audio/AudioProvider.tsx). They also attach
// only from a tap: an AudioContext made without one starts suspended, which would mute it.

export interface AudioFx {
  setBoost: (on: boolean) => void;
  setTrim: (on: boolean) => void;
  /** Seconds of silence skipped so far. */
  saved: () => number;
  /** Call when the base speed changes, so trimming speeds up from the right place. */
  setBaseRate: (rate: number) => void;
}

const SILENCE_RMS = 0.012;
const SILENCE_AFTER = 0.25; // seconds of quiet before speeding through it
const SILENCE_RATE = 3; // times the base speed

/** Is this rms quiet enough to count as silence? Exported for tests. */
export function isSilent(samples: Float32Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length) < SILENCE_RMS;
}

export function attachFx(audio: HTMLAudioElement, baseRate: number): AudioFx | null {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  void ctx.resume();
  const source = ctx.createMediaElementSource(audio);

  // Voice: cut rumble, lift presence, even out loud and quiet voices, then make up the level.
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 90;
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2500;
  presence.Q.value = 1;
  presence.gain.value = 5;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -28;
  compressor.knee.value = 10;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.6;
  highpass.connect(presence).connect(compressor).connect(makeup).connect(ctx.destination);

  let boost = false;
  const route = () => {
    source.disconnect();
    source.connect(boost ? highpass : ctx.destination);
    source.connect(meter);
  };

  // Silence: a processor node as an audio-clock meter (it keeps ticking with the screen off,
  // where timers slow to a crawl). Its own output is silent.
  const meter = ctx.createScriptProcessor(2048, 1, 1);
  meter.connect(ctx.destination);
  let trim = false;
  let base = baseRate;
  let quietFor = 0;
  let speeding = false;
  let saved = 0;
  meter.onaudioprocess = (event) => {
    if (!trim || audio.paused) return;
    const chunk = event.inputBuffer.duration;
    if (isSilent(event.inputBuffer.getChannelData(0))) {
      quietFor += chunk;
      if (!speeding && quietFor >= SILENCE_AFTER) {
        speeding = true;
        audio.playbackRate = base * SILENCE_RATE;
      }
      // Content time covered while sped up, minus the wall time it took.
      if (speeding) saved += chunk * (SILENCE_RATE - 1);
    } else {
      quietFor = 0;
      if (speeding) {
        speeding = false;
        audio.playbackRate = base;
      }
    }
  };
  route();

  return {
    setBoost(on) {
      boost = on;
      route();
    },
    setTrim(on) {
      trim = on;
      if (!on && speeding) {
        speeding = false;
        audio.playbackRate = base;
      }
    },
    saved: () => saved,
    setBaseRate(rate) {
      base = rate;
      if (!speeding) return;
      audio.playbackRate = base * SILENCE_RATE;
    },
  };
}
