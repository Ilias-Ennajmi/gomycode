"use client";

import * as React from "react";
import { Headphones, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { clock, durationLabel } from "@/lib/hooks/useVideo";
import type { ArticleSummary } from "@/lib/types";
import { episodeOf, resumePoint, useAudio } from "@/components/audio/AudioProvider";
import {
  PlayPauseButton,
  Scrubber,
  SkipButton,
  SleepButton,
  SpeedButton,
} from "@/components/audio/PlayerControls";

/**
 * The full player on an episode's page. Until it's played, a single Play button (or
 * "Resume at 12:30"); once it's the episode playing, the scrubber and every control.
 */
export function EpisodePlayer({ article }: { article: ArticleSummary }) {
  const audio = useAudio();
  const episode = episodeOf(article);
  if (!episode) return null;
  const current = audio.episode?.id === article.id;
  const resumeAt = resumePoint(article);

  return (
    <div className="mb-6 rounded-2xl border bg-card/60 p-4 shadow-sm">
      <div className="flex items-center gap-4">
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-sm sm:h-24 sm:w-24"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
          />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headphones className="h-8 w-8" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted-foreground">{article.feed.title}</p>
          <p className="text-xs text-muted-foreground">
            {article.durationSeconds ? durationLabel(article.durationSeconds) : "Episode"}
            {!current && resumeAt > 0 && ` · ${clock(resumeAt)} listened`}
          </p>
        </div>
        {!current && (
          <button
            type="button"
            onClick={() => audio.play(episode, resumeAt)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-transform active:scale-95"
          >
            <Play className="h-4 w-4 fill-current" />
            {resumeAt > 0 ? `Resume at ${clock(resumeAt)}` : "Play"}
          </button>
        )}
      </div>
      {current && (
        <div className="mt-4">
          <Scrubber />
          <div className="mt-2 flex items-center justify-between gap-2">
            <SpeedButton />
            <div className="flex items-center gap-2">
              <SkipButton seconds={-15} />
              <PlayPauseButton />
              <SkipButton seconds={30} />
            </div>
            <SleepButton />
          </div>
        </div>
      )}
    </div>
  );
}

/** A round play button for lists: plays (or pauses) an episode without opening it. */
export function PlayEpisodeButton({
  article,
  className,
}: {
  article: ArticleSummary;
  className?: string;
}) {
  const audio = useAudio();
  const episode = episodeOf(article);
  if (!episode) return null;
  const current = audio.episode?.id === article.id;
  const playingThis = current && audio.playing;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (current) audio.toggle();
        else audio.play(episode, resumePoint(article));
      }}
      aria-label={playingThis ? `Pause ${article.title}` : `Play ${article.title}`}
      className={cn(
        "flex h-8 w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20",
        className
      )}
    >
      {playingThis ? (
        <>
          <span className="flex h-3 items-end gap-[2px]" aria-hidden>
            <span className="w-[3px] animate-pulse rounded-sm bg-current [height:60%]" />
            <span className="w-[3px] animate-pulse rounded-sm bg-current [animation-delay:150ms] [height:100%]" />
            <span className="w-[3px] animate-pulse rounded-sm bg-current [animation-delay:300ms] [height:40%]" />
          </span>
          Playing
        </>
      ) : (
        <>
          <Play className="h-3 w-3 fill-current" />
          {article.watchedSeconds && article.durationSeconds && resumePoint(article) > 0
            ? `${durationLabel(Math.max(60, article.durationSeconds - article.watchedSeconds))} left`
            : article.durationSeconds
              ? durationLabel(article.durationSeconds)
              : "Play"}
        </>
      )}
    </button>
  );
}
