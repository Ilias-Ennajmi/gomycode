"use client";

import * as React from "react";
import { ListVideo, Loader2, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { clock, durationLabel, requestVideoAi, type VideoAiResult } from "@/lib/hooks/useVideo";
import type { ArticleSummary, Chapter, TimedText } from "@/lib/types";

/**
 * While Gemini hasn't summarized the video yet: asks for it once when the video is opened,
 * and says what's happening. Gemini's free tier is often busy; the hourly run retries.
 */
export function VideoAiPending({ articleId, onDone }: { articleId: string; onDone: () => void }) {
  const [state, setState] = React.useState<VideoAiResult | "working">("working");
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  const run = React.useCallback(() => {
    setState("working");
    requestVideoAi(articleId)
      .then((result) => {
        setState(result);
        if (result === "done") onDoneRef.current();
      })
      .catch(() => setState("busy"));
  }, [articleId]);

  React.useEffect(() => {
    run();
  }, [run]);

  if (state === "failed" || state === "skipped" || state === "done") return null;
  return (
    <section
      aria-label="AI summary"
      className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Summary
      </p>
      {state === "working" || state === "running" ? (
        <>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Watching the video for a summary, key moments and a transcript… (up to a minute)
          </p>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="min-w-0 flex-1">
            Gemini is busy right now. The summary and transcript will be ready later on their own.
          </span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={run}>
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </Button>
        </div>
      )}
    </section>
  );
}

function TimeList({
  items,
  current,
  onSeek,
  collapsedCount = 6,
}: {
  items: { t: number; label: string }[];
  current: number;
  onSeek: (seconds: number) => void;
  collapsedCount?: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
  // The part playing now: the last one that has started.
  let active = -1;
  items.forEach((item, i) => {
    if (item.t <= current + 0.5) active = i;
  });
  const shown = expanded ? items : items.slice(0, collapsedCount);
  return (
    <>
      <ol className="space-y-0.5">
        {shown.map((item, i) => (
          <li key={`${item.t}-${i}`}>
            <button
              type="button"
              onClick={() => onSeek(item.t)}
              className={cn(
                "flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                i === active && current > 0 && "bg-primary/10 text-foreground"
              )}
            >
              <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-primary">
                {clock(item.t)}
              </span>
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          </li>
        ))}
      </ol>
      {items.length > collapsedCount && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

/** Key moments (from Gemini) and chapters (from the creator), each a jump into the video. */
export function VideoGuide({
  keyMoments,
  chapters,
  current,
  onSeek,
}: {
  keyMoments: TimedText[];
  chapters: Chapter[];
  current: number;
  onSeek: (seconds: number) => void;
}) {
  if (keyMoments.length === 0 && chapters.length === 0) return null;
  return (
    <div className="mt-6 grid grid-cols-1 gap-4">
      {keyMoments.length > 0 && (
        <section aria-label="Key moments" className="rounded-xl border bg-card/60 p-3">
          <h2 className="mb-1.5 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Key moments
          </h2>
          <TimeList
            items={keyMoments.map((m) => ({ t: m.t, label: m.text }))}
            current={current}
            onSeek={onSeek}
          />
        </section>
      )}
      {chapters.length > 0 && (
        <section aria-label="Chapters" className="rounded-xl border bg-card/60 p-3">
          <h2 className="mb-1.5 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ListVideo className="h-3.5 w-3.5" /> Chapters
          </h2>
          <TimeList
            items={chapters.map((c) => ({ t: c.t, label: c.title }))}
            current={current}
            onSeek={onSeek}
          />
        </section>
      )}
    </div>
  );
}

/** "Resumed at 4:12 · Start over", under the player. */
export function ResumedNote({ seconds, onRestart }: { seconds: number; onRestart: () => void }) {
  const [visible, setVisible] = React.useState(true);
  if (!visible) return null;
  return (
    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      Resumed at {clock(seconds)}
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={() => {
          onRestart();
          setVisible(false);
        }}
        className="font-medium text-foreground underline-offset-2 hover:underline"
      >
        Start over
      </button>
    </p>
  );
}

/** Over the player when a video ends: the next one to watch. */
export function UpNextCard({
  next,
  onPlay,
  onDismiss,
}: {
  next: ArticleSummary;
  onPlay: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-background/95 p-3 text-foreground shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {next.isSaved ? "Next in Later" : `More from ${next.feed.title}`}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1 text-muted-foreground hover:bg-accent"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <button type="button" onClick={onPlay} className="flex w-full gap-3 text-left">
        {next.imageUrl && (
          <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={next.imageUrl} alt="" className="h-full w-full object-cover" />
            {next.durationSeconds ? (
              <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">
                {clock(next.durationSeconds)}
              </span>
            ) : null}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{next.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {next.feed.title}
            {next.durationSeconds ? ` · ${durationLabel(next.durationSeconds)}` : ""}
          </span>
        </span>
      </button>
      <Button size="sm" className="mt-3 w-full gap-1.5" onClick={onPlay}>
        <Play className="h-3.5 w-3.5 fill-current" /> Play next
      </Button>
    </div>
  );
}

export interface TimeStore {
  get: () => number;
  set: (seconds: number) => void;
  subscribe: (listener: () => void) => () => void;
}

/** The playing position, shared without re-rendering the whole reader every second. */
export function createTimeStore(): TimeStore {
  let time = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set: (seconds) => {
      if (Math.floor(seconds) === Math.floor(time)) return;
      time = seconds;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** VideoGuide that follows the player: the current chapter lights up. */
export function LiveVideoGuide({
  store,
  ...props
}: Omit<React.ComponentProps<typeof VideoGuide>, "current"> & { store: TimeStore }) {
  const current = React.useSyncExternalStore(store.subscribe, store.get, () => 0);
  return <VideoGuide current={current} {...props} />;
}
