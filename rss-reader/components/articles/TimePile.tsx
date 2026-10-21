"use client";

import * as React from "react";
import useSWR from "swr";
import { Headphones, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { articleSource } from "@/components/articles/ArticleCard";
import { episodeOf, useAudio } from "@/components/audio/AudioProvider";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { ArticleSummary } from "@/lib/types";

// "I have 5 minutes": a pile that fits the time you have, from what you saved for Later
// first (you already chose it), then the top of For You. Each piece counts what's left of
// it: the rest of an episode, the unread part of an article.

export const BUDGETS = [5, 10, 20, 30] as const;

type ArticlesPage = { articles: ArticleSummary[] };

/** Minutes left in a piece. */
export function minutesLeft(article: ArticleSummary) {
  if (article.isVideo || article.audioUrl) {
    if (!article.durationSeconds) return null;
    return Math.max(1, (article.durationSeconds - (article.watchedSeconds ?? 0)) / 60);
  }
  const minutes = article.readingMinutes ?? 3;
  return Math.max(1, minutes * (1 - (article.readProgress ?? 0) / 100));
}

/** The pieces that fit the budget, greedily in the order given. */
export function fillBudget(candidates: ArticleSummary[], budget: number) {
  const picks: { article: ArticleSummary; minutes: number }[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const article of candidates) {
    if (seen.has(article.id) || article.isShort) continue;
    seen.add(article.id);
    const minutes = minutesLeft(article);
    if (minutes === null || total + minutes > budget + 0.5) continue;
    picks.push({ article, minutes });
    total += minutes;
    if (budget - total < 1) break;
  }
  return { picks, total };
}

export function TimePile({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [budget, setBudget] = React.useState<number>(5);
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const { openPlayer } = useAudio();
  const later = useSWR<ArticlesPage>(open ? "/api/articles?later=queue&page=1&limit=40" : null);
  const forYou = useSWR<ArticlesPage>(
    open ? "/api/articles?view=foryou&unread=true&page=1&limit=60" : null
  );
  const loading = !later.data && !forYou.data;
  const { picks, total } = React.useMemo(
    () => fillBudget([...(later.data?.articles ?? []), ...(forYou.data?.articles ?? [])], budget),
    [later.data, forYou.data, budget]
  );

  function openPick(article: ArticleSummary) {
    onOpenChange(false);
    const episode = !article.isVideo ? episodeOf(article) : null;
    if (episode) {
      openPlayer(episode);
      return;
    }
    setSelectedArticleId(article.id);
    setMobilePane("reader");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="How much time do you have?">
      <div className="flex gap-2 px-3 pb-3 pt-1" role="radiogroup" aria-label="Time">
        {BUDGETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            role="radio"
            aria-checked={budget === minutes}
            onClick={() => setBudget(minutes)}
            className={cn(
              "h-10 flex-1 rounded-full text-sm font-semibold ring-1 ring-border transition-colors",
              budget === minutes
                ? "bg-primary text-primary-foreground ring-primary"
                : "hover:bg-accent"
            )}
          >
            {minutes} min
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : picks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing short enough right now. Try more time.
        </p>
      ) : (
        <>
          <p className="px-4 pb-1 text-xs text-muted-foreground">
            {picks.length} {picks.length === 1 ? "piece" : "pieces"}, about {Math.round(total)} min
          </p>
          <ul>
            {picks.map(({ article, minutes }) => {
              const source = articleSource(article);
              const media = article.isVideo || article.audioUrl;
              return (
                <li key={article.id}>
                  <button
                    type="button"
                    onClick={() => openPick(article)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent"
                  >
                    <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] font-medium leading-snug">
                        {article.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {source.name}
                        {article.isSaved && " · Later"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      {media ? (
                        article.audioUrl && !article.isVideo ? (
                          <Headphones className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )
                      ) : null}
                      {Math.round(minutes)} min
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
