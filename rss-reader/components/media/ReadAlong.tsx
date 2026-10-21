"use client";

import * as React from "react";
import { ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { clock } from "@/lib/hooks/useVideo";
import { phraseAt, type Phrase } from "@/lib/phrases";
import type { TimeStore } from "@/components/video/VideoGuide";

// Read along like synced lyrics: short phrases, the one being said bright with its words
// lighting up as they're spoken, what's been said dimmed, what's coming faint. The list
// follows the voice, keeping the current phrase in view; scroll away and it waits, with
// "Back to now" to rejoin. Tap a phrase to jump there.

/** The index of the phrase being said, re-rendering only when it changes. */
function useActivePhrase(store: TimeStore, phrases: Phrase[]) {
  const get = React.useCallback(() => phraseAt(phrases, store.get()), [phrases, store]);
  return React.useSyncExternalStore(store.subscribe, get, () => -1);
}

const FOLLOW_PAUSE_MS = 4000;

export function PhraseScroller({
  phrases,
  store,
  onSeek,
  size,
  className,
}: {
  phrases: Phrase[];
  store: TimeStore;
  onSeek: (seconds: number) => void;
  size: "card" | "full";
  className?: string;
}) {
  const active = useActivePhrase(store, phrases);
  const box = React.useRef<HTMLDivElement>(null);
  const touchedAt = React.useRef(0);
  const programmatic = React.useRef(false);
  const [away, setAway] = React.useState(false);

  const follow = React.useCallback(
    (smooth: boolean) => {
      const container = box.current;
      const el = container?.querySelector<HTMLElement>(`[data-phrase="${Math.max(0, active)}"]`);
      if (!container || !el) return;
      programmatic.current = true;
      container.scrollTo({
        top: el.offsetTop - container.clientHeight * (size === "card" ? 0.3 : 0.35),
        behavior: smooth ? "smooth" : "auto",
      });
      window.setTimeout(() => (programmatic.current = false), 450);
    },
    [active, size]
  );

  React.useEffect(() => {
    if (away || Date.now() - touchedAt.current < FOLLOW_PAUSE_MS) return;
    follow(true);
  }, [active, away, follow]);
  // On first show, jump straight to where the voice is.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => follow(false), []);

  const big = size === "full";
  return (
    <div className={cn("relative", className)}>
      <div
        ref={box}
        className={cn(
          "relative h-full overflow-y-auto scrollbar-none",
          big && "overscroll-contain",
          "[mask-image:linear-gradient(to_bottom,transparent,black_14%,black_80%,transparent)]"
        )}
        onWheel={() => {
          touchedAt.current = Date.now();
          setAway(true);
        }}
        onTouchMove={() => {
          touchedAt.current = Date.now();
          setAway(true);
        }}
        onScroll={() => {
          if (programmatic.current) return;
          touchedAt.current = Date.now();
        }}
      >
        <ol className={cn(big ? "space-y-4 py-[30vh]" : "space-y-2.5 py-16")}>
          {phrases.map((phrase, i) => (
            <PhraseLine
              key={i}
              index={i}
              phrase={phrase}
              state={i === active ? "active" : i < active ? "past" : "future"}
              store={store}
              big={big}
              onSeek={(seconds) => {
                setAway(false);
                touchedAt.current = 0;
                onSeek(seconds);
              }}
            />
          ))}
        </ol>
      </div>
      {away && (
        <button
          type="button"
          onClick={() => {
            setAway(false);
            touchedAt.current = 0;
            follow(true);
          }}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary-foreground px-3 py-1.5 text-xs font-semibold text-primary shadow-lg"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" /> Back to now
        </button>
      )}
    </div>
  );
}

const PhraseLine = React.memo(function PhraseLine({
  index,
  phrase,
  state,
  store,
  big,
  onSeek,
}: {
  index: number;
  phrase: Phrase;
  state: "past" | "active" | "future";
  store: TimeStore;
  big: boolean;
  onSeek: (seconds: number) => void;
}) {
  return (
    <li data-phrase={index}>
      <button
        type="button"
        onClick={() => onSeek(phrase.t)}
        aria-label={`${clock(phrase.t)}: ${phrase.text}`}
        aria-current={state === "active" ? "true" : undefined}
        className={cn(
          "origin-left text-left font-bold leading-snug tracking-tight transition-[opacity,transform] duration-300",
          big ? "text-[26px]" : "text-[21px]",
          state === "active" ? "scale-[1.02]" : state === "past" ? "opacity-40" : "opacity-55"
        )}
      >
        {state === "active" ? <SpokenWords phrase={phrase} store={store} /> : phrase.text}
      </button>
    </li>
  );
});

/** The phrase being said, its words lit up to the voice's position. */
function SpokenWords({ phrase, store }: { phrase: Phrase; store: TimeStore }) {
  const words = React.useMemo(() => phrase.text.split(" "), [phrase.text]);
  // Weights by length, so long words take longer to say.
  const marks = React.useMemo(() => {
    const total = words.reduce((sum, w) => sum + w.length + 1, 0);
    let at = 0;
    return words.map((w) => {
      const start = at / total;
      at += w.length + 1;
      return start;
    });
  }, [words]);
  const progress = React.useSyncExternalStore(
    store.subscribe,
    () => {
      const span = phrase.end - phrase.t;
      return span > 0 ? Math.min(1, Math.max(0, (store.get() - phrase.t) / span)) : 1;
    },
    () => 0
  );
  return (
    <>
      {words.map((word, i) => (
        <span
          key={i}
          className={cn(
            "transition-opacity duration-200",
            marks[i] <= progress + 0.02 ? "opacity-100" : "opacity-50"
          )}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}
