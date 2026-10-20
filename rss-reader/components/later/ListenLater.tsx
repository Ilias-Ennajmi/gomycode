"use client";

import * as React from "react";
import { Headphones, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { chunks, guessLang, htmlToText, speechSupported, voiceFor } from "@/lib/speech";
import { toggleArticleRead } from "@/lib/hooks/useArticles";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import type { ArticleSummary } from "@/lib/types";

const RATES = [1, 1.25, 1.5, 0.85];

/**
 * Listen to Later: the reading queue as a playlist read aloud, one article after the
 * next, with the controls of a podcast player (and the phone's lock-screen buttons).
 * For walks and drives: each article is fetched in full, read, and marked read at its end.
 */
export function ListenLater({
  articles,
  startIndex = 0,
  onClose,
}: {
  articles: ArticleSummary[];
  startIndex?: number;
  onClose: () => void;
}) {
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const playable = React.useMemo(
    () => articles.filter((a) => !a.isVideo && !a.audioUrl),
    [articles]
  );
  const [index, setIndex] = React.useState(Math.min(startIndex, Math.max(0, playable.length - 1)));
  const [status, setStatus] = React.useState<"loading" | "playing" | "paused" | "idle">("idle");
  const [rate, setRate] = React.useState(1);
  const [sentence, setSentence] = React.useState({ at: 0, of: 0 });
  const current = playable[index];
  // The sentences of the article being read; replaced whole when the article changes, so
  // an utterance ending late can tell it belongs to an old article.
  const run = React.useRef<{ parts: string[]; at: number; lang: string; token: number }>({
    parts: [],
    at: 0,
    lang: "en-US",
    token: 0,
  });
  const rateRef = React.useRef(rate);
  rateRef.current = rate;

  const stopSpeaking = React.useCallback(() => {
    run.current.token += 1;
    run.current.parts = [];
    if (speechSupported()) window.speechSynthesis.cancel();
  }, []);

  const next = React.useCallback(() => {
    setIndex((i) => (i + 1 < playable.length ? i + 1 : i));
  }, [playable.length]);

  const speakFrom = React.useCallback(
    (at: number, token: number) => {
      const { parts, lang } = run.current;
      if (token !== run.current.token) return;
      if (at >= parts.length) {
        // Done with this one: mark it read and move on.
        const article = playable[index];
        if (article && !article.isRead) toggleArticleRead(article.id, true).catch(() => undefined);
        if (index + 1 < playable.length) next();
        else {
          setStatus("idle");
          toast("That's everything in Later", { description: "Nothing left to read aloud." });
        }
        return;
      }
      run.current.at = at;
      setSentence({ at: at + 1, of: parts.length });
      const utterance = new SpeechSynthesisUtterance(parts[at]);
      utterance.lang = lang;
      utterance.rate = rateRef.current;
      const voice = voiceFor(lang);
      if (voice) utterance.voice = voice;
      utterance.onend = () => speakFrom(at + 1, token);
      utterance.onerror = (event) => {
        if (event.error !== "interrupted" && event.error !== "canceled") speakFrom(at + 1, token);
      };
      window.speechSynthesis.speak(utterance);
    },
    [index, next, playable]
  );

  // A new article: fetch its text, then read.
  React.useEffect(() => {
    if (!current || !speechSupported()) return;
    let cancelled = false;
    stopSpeaking();
    const token = run.current.token;
    setStatus("loading");
    (async () => {
      let html = current.content || current.summary || "";
      try {
        const res = await fetch(`/api/articles/${current.id}/full`);
        const body = (await res.json()) as { status?: string; content?: string | null };
        if (body.status === "full" && body.content) html = body.content;
      } catch {
        // The feed's text will do.
      }
      if (cancelled || token !== run.current.token) return;
      const text = `${current.title}. ${htmlToText(html)}`;
      run.current = { parts: chunks(text), at: 0, lang: guessLang(text), token };
      setStatus("playing");
      speakFrom(0, token);
    })();
    return () => {
      cancelled = true;
    };
    // Only when the article changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  React.useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  // Lock screen and earbuds.
  React.useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: current.title,
      artist: current.feed.title,
      album: "Listen to Later",
      artwork: current.imageUrl ? [{ src: current.imageUrl, sizes: "512x512" }] : [],
    });
    const handlers: [MediaSessionAction, () => void][] = [
      ["play", () => resume()],
      ["pause", () => pause()],
      ["nexttrack", () => next()],
      ["previoustrack", () => setIndex((i) => Math.max(0, i - 1))],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not on this device.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function pause() {
    window.speechSynthesis.pause();
    setStatus("paused");
  }
  function resume() {
    if (status === "paused") {
      window.speechSynthesis.resume();
      setStatus("playing");
    }
  }
  function cycleRate() {
    const nextRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(nextRate);
    if (status === "playing") {
      const { at, token } = run.current;
      window.speechSynthesis.cancel();
      // Same token: continue the same article at the new speed.
      setTimeout(() => speakFrom(at, token), 50);
    }
  }

  if (!speechSupported()) {
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-muted-foreground">This browser can&rsquo;t read aloud.</p>
      </Shell>
    );
  }
  if (!current) {
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-muted-foreground">Nothing in Later to read aloud.</p>
      </Shell>
    );
  }
  const playing = status === "playing";
  return (
    <Shell onClose={onClose}>
      <button
        type="button"
        onClick={() => {
          setSelectedArticleId(current.id);
          setMobilePane("reader");
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
          {current.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Headphones className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">
            {current.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FeedFavicon
              title={current.feed.title}
              faviconUrl={current.feed.faviconUrl}
              size={12}
            />
            <span className="truncate">
              {index + 1} of {playable.length}
              {status === "loading"
                ? " · Fetching…"
                : sentence.of
                  ? ` · ${Math.round((sentence.at / sentence.of) * 100)}%`
                  : ""}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={cycleRate}
        className="h-9 rounded-full px-2 text-xs font-semibold tabular-nums hover:bg-accent"
        aria-label="Change speed"
      >
        {rate}×
      </button>
      <Control
        label="Previous article"
        onClick={() => setIndex((i) => Math.max(0, i - 1))}
        disabled={index === 0}
      >
        <SkipBack className="h-4 w-4" />
      </Control>
      <button
        type="button"
        onClick={() => (playing ? pause() : resume())}
        disabled={status === "loading"}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-50"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <Control label="Next article" onClick={next} disabled={index + 1 >= playable.length}>
        <SkipForward className="h-4 w-4" />
      </Control>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="region"
      aria-label="Listen to Later"
      className="relative shrink-0 border-t bg-background/95 pb-safe backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-1.5 px-3">
        {children}
        <Control label="Stop listening" onClick={onClose}>
          <X className="h-4 w-4" />
        </Control>
      </div>
    </div>
  );
}

function Control({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
      )}
    >
      {children}
    </button>
  );
}
