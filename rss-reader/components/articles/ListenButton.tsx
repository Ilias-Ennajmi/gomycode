"use client";

import * as React from "react";
import { Headphones, Loader2, Pause, Play, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { chunks, guessLang, htmlToText, narrationParts, voiceFor } from "@/lib/speech";
import { usePref } from "@/lib/prefs";
import { useT, tr } from "@/lib/i18n";

// Read aloud with the browser's own speech engine: free, offline-capable, and
// available on phones. Long texts are spoken sentence by sentence because some
// engines (Chrome) stop an utterance after ~15 seconds.
//
// Or with a natural voice (Gemini, /api/narrate): a minute of text at a time, the next one
// fetched while the current one plays, each kept on the device (Cache API) so replaying
// costs nothing. Busy or out of quota, it carries on with the device's voice from there.

const NARRATION_CACHE = "narration";

function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** One passage in the natural voice, from the device's cache or the server. */
async function narration(text: string, lang: string): Promise<Blob> {
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

const RATES = [1, 1.25, 1.5, 0.85];

type Status = "idle" | "loading" | "playing" | "paused";

export function useSpeech(resetKey: string | undefined) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [rate, setRate] = React.useState(1);
  const queue = React.useRef<{ parts: string[]; index: number; lang: string }>({
    parts: [],
    index: 0,
    lang: "en-US",
  });
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voice, setVoice] = usePref<"device" | "natural">("listen-voice", "device");
  // The natural voice: its passages, where it is, and its own audio element.
  const natural = React.useRef<{
    parts: string[];
    index: number;
    lang: string;
    audio: HTMLAudioElement | null;
    url: string | null;
    next: Promise<Blob> | null;
  }>({ parts: [], index: 0, lang: "en-US", audio: null, url: null, next: null });
  const rateRef = React.useRef(rate);
  rateRef.current = rate;

  const stopNatural = React.useCallback(() => {
    const n = natural.current;
    n.parts = [];
    n.next = null;
    n.audio?.pause();
    if (n.url) URL.revokeObjectURL(n.url);
    n.url = null;
  }, []);

  const stop = React.useCallback(() => {
    stopNatural();
    if (supported) {
      queue.current.parts = [];
      window.speechSynthesis.cancel();
    }
    setStatus("idle");
  }, [supported, stopNatural]);

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
    const voice = voiceFor(lang);
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      // Cancelled queues are emptied, so this only continues real playback.
      if (queue.current.parts === parts) speakFrom(index + 1, speed);
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  // The device voice from the start of a passage the natural voice couldn't read.
  const fallBack = React.useCallback(
    (parts: string[], lang: string) => {
      stopNatural();
      toast(tr("The natural voice is busy: carrying on with this device's voice"));
      if (!supported) {
        setStatus("idle");
        return;
      }
      queue.current = { parts: chunks(parts.join(" ")), index: 0, lang };
      setStatus("playing");
      speakFrom(0, rateRef.current);
    },
    [supported, speakFrom, stopNatural]
  );

  const playPassage = React.useCallback(
    async (index: number) => {
      const n = natural.current;
      const parts = n.parts;
      if (index >= parts.length) {
        stop();
        return;
      }
      n.index = index;
      let blob: Blob;
      try {
        blob = await (n.next ?? narration(parts[index], n.lang));
      } catch {
        if (natural.current.parts === parts) fallBack(parts.slice(index), n.lang);
        return;
      }
      if (natural.current.parts !== parts) return; // stopped meanwhile
      // The next passage loads while this one plays.
      n.next = index + 1 < parts.length ? narration(parts[index + 1], n.lang) : null;
      n.next?.catch(() => undefined);
      const audio = n.audio ?? (n.audio = new Audio());
      if (n.url) URL.revokeObjectURL(n.url);
      n.url = URL.createObjectURL(blob);
      audio.src = n.url;
      audio.playbackRate = rateRef.current;
      audio.onended = () => {
        if (natural.current.parts === parts) void playPassage(index + 1);
      };
      await audio.play().catch(() => undefined);
      setStatus("playing");
    },
    [fallBack, stop]
  );

  const play = React.useCallback(
    (html: string, chosen: "device" | "natural" = voice) => {
      if (status === "paused" && chosen === voice) {
        if (natural.current.parts.length) void natural.current.audio?.play();
        else window.speechSynthesis.resume();
        setStatus("playing");
        return;
      }
      if (supported) window.speechSynthesis.cancel();
      stopNatural();
      const text = htmlToText(html);
      const lang = guessLang(text);
      if (chosen === "natural") {
        natural.current = {
          ...natural.current,
          parts: narrationParts(text),
          index: 0,
          lang,
          next: null,
        };
        setStatus("loading");
        void playPassage(0);
        return;
      }
      if (!supported) return;
      queue.current = { parts: chunks(text), index: 0, lang };
      setStatus("playing");
      speakFrom(0, rate);
    },
    [supported, status, rate, speakFrom, voice, playPassage, stopNatural]
  );

  const pause = React.useCallback(() => {
    if (natural.current.parts.length) natural.current.audio?.pause();
    else window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const cycleRate = React.useCallback(() => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (natural.current.parts.length) {
      if (natural.current.audio) natural.current.audio.playbackRate = next;
      return;
    }
    // Restart the current sentence at the new speed.
    if (status === "playing") {
      const { parts, index } = queue.current;
      window.speechSynthesis.cancel();
      queue.current = { ...queue.current, parts: [...parts] };
      speakFrom(index, next);
    }
  }, [rate, status, speakFrom]);

  return {
    // The natural voice works without the browser's speech engine.
    supported: supported || voice === "natural",
    status,
    rate,
    play,
    pause,
    stop,
    cycleRate,
    voice,
    setVoice,
  };
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
  const { t } = useT();
  if (!speech.supported) return null;
  const playing = speech.status === "playing";
  return (
    <button
      type="button"
      onClick={() => (playing ? speech.pause() : speech.play(html))}
      aria-label={playing ? t("Pause reading aloud") : t("Listen")}
      title={playing ? t("Pause") : t("Listen")}
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
  const { t } = useT();
  if (speech.status === "idle") return null;
  const playing = speech.status === "playing" || speech.status === "loading";
  return (
    <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border bg-popover/95 p-1 pl-3 shadow-lg backdrop-blur">
        <Headphones className="h-4 w-4 text-primary" />
        <span className="px-1.5 text-xs font-medium">
          {speech.status === "loading" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("Preparing the voice…")}
            </span>
          ) : playing ? (
            t("Listening")
          ) : (
            t("Paused")
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            // Switching voices starts the article over in the other one.
            const next = speech.voice === "natural" ? "device" : "natural";
            speech.setVoice(next);
            speech.stop();
            speech.play(html, next);
          }}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-accent",
            speech.voice === "natural" && "text-primary"
          )}
          aria-pressed={speech.voice === "natural"}
          aria-label={t("Natural voice")}
          title={t("Natural voice (AI)")}
        >
          <Sparkles className="h-3.5 w-3.5" /> AI
        </button>
        <button
          type="button"
          onClick={() => (playing ? speech.pause() : speech.play(html))}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label={playing ? t("Pause") : t("Resume")}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={speech.cycleRate}
          className="h-8 rounded-full px-2 text-xs font-semibold tabular-nums hover:bg-accent"
          aria-label={t("Change speed")}
        >
          {speech.rate}×
        </button>
        <button
          type="button"
          onClick={speech.stop}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          aria-label={t("Stop")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
