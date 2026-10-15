"use client";

import * as React from "react";
import { Headphones, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useAudio } from "@/components/audio/AudioProvider";
import { PlayPauseButton, SkipButton, usePlayerTime } from "@/components/audio/PlayerControls";
import { useVideoExtras } from "@/lib/hooks/useVideo";

/** A thin line across the top of the bar: how far into the episode. */
function BarProgress() {
  const { duration } = useAudio();
  const current = usePlayerTime();
  const percent = duration ? Math.min(100, (current / duration) * 100) : 0;
  return (
    <span className="absolute inset-x-0 top-0 h-0.5 bg-border" aria-hidden>
      <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
    </span>
  );
}

/** The chapter playing now, when the episode has chapters. */
function CurrentChapter({ episodeId, fallback }: { episodeId: string; fallback: string }) {
  const { extras } = useVideoExtras(episodeId);
  const current = usePlayerTime();
  let title: string | null = null;
  for (const chapter of extras?.chapters ?? []) {
    if (chapter.t <= current + 0.5) title = chapter.title;
  }
  return <>{title ?? fallback}</>;
}

/**
 * The episode playing (or paused), at the bottom of every screen: tap it to open the
 * episode, play and pause, jump ahead. Hidden while that episode is open in the reader,
 * which has the full player.
 */
export function NowPlayingBar() {
  const { episode, playing, close } = useAudio();
  const { selectedArticleId, setSelectedArticleId, mobilePane, setMobilePane } = useReaderState();
  if (!episode) return null;

  // The open episode has the full player: on phones when the reader covers the screen, on
  // wider screens whenever it's the one open.
  const openHere = selectedArticleId === episode.id;
  const hidden = openHere && mobilePane === "reader";

  return (
    <div
      className={cn(
        "relative shrink-0 border-t bg-background/95 pb-safe backdrop-blur",
        hidden && "hidden",
        openHere && "md:hidden"
      )}
      role="region"
      aria-label="Now playing"
    >
      <BarProgress />
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-3">
        <button
          type="button"
          onClick={() => {
            setSelectedArticleId(episode.id);
            setMobilePane("reader");
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Open ${episode.title}`}
        >
          {episode.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={episode.imageUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-sm"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Headphones className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">
              {episode.title}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {playing ? "Playing · " : "Paused · "}
              <CurrentChapter episodeId={episode.id} fallback={episode.feedTitle} />
            </span>
          </span>
        </button>
        <SkipButton seconds={-15} className="hidden sm:flex" />
        <PlayPauseButton size="sm" />
        <SkipButton seconds={30} />
        {!playing && (
          <button
            type="button"
            onClick={close}
            aria-label="Close the player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
