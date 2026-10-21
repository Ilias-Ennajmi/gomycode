"use client";

import * as React from "react";
import useSWR from "swr";
import { ChevronRight, Play } from "lucide-react";
import { durationLabel } from "@/lib/hooks/useVideo";
import { episodeOf, useAudio } from "@/components/audio/AudioProvider";
import { Art } from "@/components/media/MediaCards";
import type { ArticleSummary } from "@/lib/types";

/**
 * The top of the Podcasts tab: episodes started and not finished, one tap from picking up
 * where they stopped, like the "Continue" shelf of a podcast app.
 */
export function ContinueListening({ onSeeAll }: { onSeeAll: () => void }) {
  const { episode: playing, openPlayer } = useAudio();
  const { data } = useSWR<{ articles: ArticleSummary[] }>(
    "/api/articles?source=podcast&progress=1&page=1&limit=10",
    { revalidateOnFocus: false }
  );
  const episodes = (data?.articles ?? []).filter((a) => a.audioUrl && a.id !== playing?.id);
  if (episodes.length === 0) return null;

  return (
    <section aria-labelledby="continue-listening" className="px-4 pb-2 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="continue-listening" className="text-[15px] font-semibold">
          Continue listening
        </h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          See all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
        {episodes.map((article) => {
          const duration = article.durationSeconds ?? 0;
          const watched = article.watchedSeconds ?? 0;
          const pct = duration ? Math.min(100, (watched / duration) * 100) : 0;
          return (
            <button
              key={article.id}
              type="button"
              onClick={() => {
                const episode = episodeOf(article);
                if (episode) openPlayer(episode);
              }}
              className="group w-36 shrink-0 snap-start text-left"
            >
              <div className="relative">
                <Art
                  src={article.imageUrl ?? article.feed.faviconUrl}
                  name={article.feed.title}
                  className="aspect-square w-full rounded-xl text-2xl"
                />
                <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-transform group-active:scale-90">
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </span>
                <span className="absolute inset-x-2 bottom-0.5 h-1 overflow-hidden rounded-full bg-black/30">
                  <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug">
                {article.title}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {duration
                  ? `${durationLabel(Math.max(0, duration - watched))} left`
                  : article.feed.title}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
