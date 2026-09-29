"use client";

import * as React from "react";
import { Headphones, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Read aloud with the browser's own speech engine: free, offline-capable, and
// available on phones. Long texts are spoken sentence by sentence because some
// engines (Chrome) stop an utterance after ~15 seconds.

const RATES = [1, 1.25, 1.5, 0.85];
const FRENCH = /\b(le|la|les|des|une|est|dans|pour|avec|qui|sur|pas|du|au)\b/gi;
const ENGLISH = /\b(the|and|is|in|for|with|that|on|not|of|to|was)\b/gi;

function guessLang(text: string) {
  const sample = text.slice(0, 2000);
  const fr = sample.match(FRENCH)?.length ?? 0;
  const en = sample.match(ENGLISH)?.length ?? 0;
  return fr > en ? "fr-FR" : "en-US";
}

function chunks(text: string) {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 220 && current) {
      out.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, style, figure, figcaption, pre, code, table")
    .forEach((n) => n.remove());
  return doc.body.textContent ?? "";
}

type Status = "idle" | "playing" | "paused";

export function useSpeech(resetKey: string | undefined) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [rate, setRate] = React.useState(1);
  const queue = React.useRef<{ parts: string[]; index: number; lang: string }>({
    parts: [],
    index: 0,
    lang: "en-US",
  });
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = React.useCallback(() => {
    if (!supported) return;
    queue.current.parts = [];
    window.speechSynthesis.cancel();
    setStatus("idle");
  }, [supported]);

  // A new article (or leaving the reader) stops the voice.
  React.useEffect(() => stop, [resetKey, stop]);

  const speakFrom = React.useCallback((index: number, speed: number) => {
    const { parts, lang } = queue.current;
    if (index >= parts.length) {
      setStatus("idle");
      return;
    }
    queue.current.index = index;
    const utterance = new SpeechSynthesisUtterance(parts[index]);
    utterance.lang = lang;
    utterance.rate = speed;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      // Cancelled queues are emptied, so this only continues real playback.
      if (queue.current.parts === parts) speakFrom(index + 1, speed);
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const play = React.useCallback(
    (html: string) => {
      if (!supported) return;
      if (status === "paused") {
        window.speechSynthesis.resume();
        setStatus("playing");
        return;
      }
      window.speechSynthesis.cancel();
      const text = htmlToText(html);
      queue.current = { parts: chunks(text), index: 0, lang: guessLang(text) };
      setStatus("playing");
      speakFrom(0, rate);
    },
    [supported, status, rate, speakFrom]
  );

  const pause = React.useCallback(() => {
    window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const cycleRate = React.useCallback(() => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    // Restart the current sentence at the new speed.
    if (status === "playing") {
      const { parts, index } = queue.current;
      window.speechSynthesis.cancel();
      queue.current = { ...queue.current, parts: [...parts] };
      speakFrom(index, next);
    }
  }, [rate, status, speakFrom]);

  return { supported, status, rate, play, pause, stop, cycleRate };
}

/** "Listen" in the reader toolbar. */
export function ListenButton({
  speech,
  html,
  className,
}: {
  speech: ReturnType<typeof useSpeech>;
  html: string;
  className?: string;
}) {
  if (!speech.supported) return null;
  const playing = speech.status === "playing";
  return (
    <button
      type="button"
      onClick={() => (playing ? speech.pause() : speech.play(html))}
      aria-label={playing ? "Pause reading aloud" : "Listen"}
      title={playing ? "Pause" : "Listen"}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        speech.status !== "idle" && "text-primary",
        className
      )}
    >
      {playing ? <Pause className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
    </button>
  );
}

/** A small player at the bottom of the reader while listening. */
export function ListenBar({
  speech,
  html,
}: {
  speech: ReturnType<typeof useSpeech>;
  html: string;
}) {
  if (speech.status === "idle") return null;
  const playing = speech.status === "playing";
  return (
    <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border bg-popover/95 p-1 pl-3 shadow-lg backdrop-blur">
        <Headphones className="h-4 w-4 text-primary" />
        <span className="px-1.5 text-xs font-medium">{playing ? "Listening" : "Paused"}</span>
        <button
          type="button"
          onClick={() => (playing ? speech.pause() : speech.play(html))}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label={playing ? "Pause" : "Resume"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={speech.cycleRate}
          className="h-8 rounded-full px-2 text-xs font-semibold tabular-nums hover:bg-accent"
          aria-label="Change speed"
        >
          {speech.rate}×
        </button>
        <button
          type="button"
          onClick={speech.stop}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label="Stop"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
