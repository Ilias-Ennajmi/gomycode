"use client";

import { chapterAt } from "@/components/audio/player/Shared";
import * as React from "react";
import { Headphones, ListEnd, ListStart, Play } from "lucide-react";
import { clock, durationLabel } from "@/lib/hooks/useVideo";
import { episodeOf, useAudio, type Episode } from "@/components/audio/AudioProvider";
import type { ArticleSummary } from "@/lib/types";
import { usePlayerTime } from "@/components/audio/PlayerControls";
import { useT } from "@/lib/i18n";

/** Before it plays: where it stopped as a line, and one big button to start. */
export function IdleControls({ episode, savedAt }: { episode: Episode; savedAt: number }) {
  const { t } = useT();
  const audio = useAudio();
  const length = episode.durationSeconds ?? 0;
  const percent = length ? Math.min(100, (savedAt / length) * 100) : 0;
  return (
    <div className="mt-4 w-full">
      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/15">
        <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{clock(savedAt)}</span>
        <span>{length ? `-${clock(Math.max(0, length - savedAt))}` : "--:--"}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => audio.enqueue(episode, "last")}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground ring-1 ring-border hover:bg-accent"
        >
          <ListEnd className="h-4 w-4" /> {t("Queue")}
        </button>
        <button
          type="button"
          onClick={() => audio.play(episode, savedAt)}
          className="flex h-14 items-center gap-2 rounded-full bg-foreground px-7 text-base font-semibold text-background transition-transform active:scale-95"
        >
          <Play className="h-5 w-5 fill-current" />
          {savedAt > 0 ? `Resume at ${clock(savedAt)}` : t("Play")}
        </button>
      </div>
    </div>
  );
}

/** Nothing queued: the next one from the show (or your Later), one tap away. */
export function SuggestedNext({
  article,
  onOpen,
}: {
  article: ArticleSummary;
  onOpen: (article: ArticleSummary) => void;
}) {
  const audio = useAudio();
  const next = episodeOf(article);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onOpen(article)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Headphones className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{article.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {article.feed.title}
            {article.durationSeconds ? ` · ${durationLabel(article.durationSeconds)}` : ""}
          </span>
        </span>
      </button>
      {next && (
        <button
          type="button"
          onClick={() => audio.enqueue(next, "next")}
          aria-label={`Play ${article.title} next`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border hover:bg-accent"
        >
          <ListStart className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** The scrubber with chapter marks along it and the loaded stretch shown lighter. */
export function ChapterScrubber({ chapters }: { chapters: { t: number; title: string }[] }) {
  const { t } = useT();
  const { duration, buffered, seek, sponsors } = useAudio();
  const current = usePlayerTime();
  const [dragging, setDragging] = React.useState<number | null>(null);
  const shown = dragging ?? current;
  const pct = (s: number) => (duration ? Math.min(100, (s / duration) * 100) : 0);
  return (
    <div>
      <div className="relative">
        {/* Loaded so far, under the track. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-[0.3rem] -translate-y-1/2 rounded-full bg-foreground/15"
          style={{ width: `${pct(buffered)}%` }}
        />
        {/* Sponsor reads, which the player jumps over. */}
        {sponsors.map((segment) => (
          <span
            key={segment.start}
            aria-hidden
            className="pointer-events-none absolute top-1/2 z-[1] h-[0.3rem] -translate-y-1/2 rounded-full bg-amber-400/80"
            style={{
              left: `${pct(segment.start)}%`,
              width: `${Math.max(0.6, pct(segment.end) - pct(segment.start))}%`,
            }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(shown)}
          onChange={(event) => setDragging(Number(event.target.value))}
          onPointerUp={() => {
            if (dragging !== null) seek(dragging);
            setDragging(null);
          }}
          onKeyUp={() => {
            if (dragging !== null) seek(dragging);
            setDragging(null);
          }}
          aria-label={t("Position")}
          aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
          className="audio-scrubber relative w-full"
          style={{ "--progress": `${pct(shown)}%` } as React.CSSProperties}
        />
        {chapters.slice(1).map((chapter) => (
          <span
            key={chapter.t}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-[0.3rem] w-[2px] -translate-y-1/2 bg-background/80"
            style={{ left: `calc(${pct(chapter.t)}% - 1px)` }}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] tabular-nums text-muted-foreground">
        <span className="shrink-0">{clock(shown)}</span>
        <span className="min-w-0 truncate text-center font-medium text-foreground/80">
          {chapterAt(chapters, shown)}
        </span>
        <span className="shrink-0">
          {duration ? `-${clock(Math.max(0, duration - shown))}` : "--:--"}
        </span>
      </div>
    </div>
  );
}
