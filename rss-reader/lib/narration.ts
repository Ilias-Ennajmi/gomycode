"use client";

// The natural voice (Gemini, /api/narrate) on the device: a passage of about a minute at a
// time, each kept in the Cache API so replaying costs nothing. Used by Listen in the reader
// and Today (components/articles/ListenButton.tsx) and by Listen to Later.

const NARRATION_CACHE = "narration";

function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** One passage in the natural voice, from the device's cache or the server. */
export async function narration(text: string, lang: string): Promise<Blob> {
  const key = `/narration/${lang}/${hash(text)}`;
  const cache = "caches" in window ? await caches.open(NARRATION_CACHE).catch(() => null) : null;
  const hit = await cache?.match(key);
  if (hit) return hit.blob();
  const res = await fetch("/api/narrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang: lang.slice(0, 2) }),
  });
  if (!res.ok) throw new Error(`narrate ${res.status}`);
  const blob = await res.blob();
  await cache?.put(key, new Response(blob, { headers: { "Content-Type": "audio/wav" } }));
  return blob;
}

export interface NaturalCallbacks {
  /** A passage starts (0-based), of this many. */
  onPassage?: (index: number, of: number) => void;
  /** Every passage was read. */
  onDone: () => void;
  /** The voice couldn't be had (busy, out of quota): the passages not yet read. */
  onFail: (rest: string[]) => void;
}

/** Reads a list of passages in the natural voice, fetching the next while one plays. */
export class NaturalPlayer {
  private audio = new Audio();
  private token = 0;
  private url: string | null = null;
  private upcoming: Promise<Blob> | null = null;
  private rate = 1;

  constructor(private callbacks: NaturalCallbacks) {}

  start(parts: string[], lang: string, rate: number) {
    this.stop();
    this.rate = rate;
    const token = ++this.token;
    void this.play(parts, lang, 0, token);
  }

  private async play(parts: string[], lang: string, index: number, token: number) {
    if (token !== this.token) return;
    if (index >= parts.length) {
      this.callbacks.onDone();
      return;
    }
    let blob: Blob;
    try {
      blob = await (this.upcoming ?? narration(parts[index], lang));
    } catch {
      if (token === this.token) this.callbacks.onFail(parts.slice(index));
      return;
    }
    if (token !== this.token) return;
    this.upcoming = index + 1 < parts.length ? narration(parts[index + 1], lang) : null;
    this.upcoming?.catch(() => undefined);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    this.audio.src = this.url;
    this.audio.playbackRate = this.rate;
    this.audio.onended = () => void this.play(parts, lang, index + 1, token);
    this.callbacks.onPassage?.(index, parts.length);
    await this.audio.play().catch(() => undefined);
  }

  pause() {
    this.audio.pause();
  }
  resume() {
    void this.audio.play().catch(() => undefined);
  }
  setRate(rate: number) {
    this.rate = rate;
    this.audio.playbackRate = rate;
  }
  stop() {
    this.token++;
    this.upcoming = null;
    this.audio.onended = null;
    this.audio.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
