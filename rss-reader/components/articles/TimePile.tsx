"use client";

import * as React from "react";
import useSWR from "swr";
import { Headphones, Loader2, Play, RefreshCw, Shuffle, Timer } from "lucide-react";
import { cn, getFaviconFallbackColor } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { articleSource } from "@/components/articles/ArticleCard";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { haptic } from "@/lib/native";
import { fillBudget, startSession } from "@/lib/session";
import type { ArticleSummary } from "@/lib/types";

// "Got 5 minutes?": pick the time, see the pile as cards (from what you saved for Later
// first, then the best of For You), swap any card or shuffle the lot, then Start. The pile
// becomes a reading session: read, swipe to the next, leave and come back to where you
// were (lib/session.ts).

export const BUDGETS = [5, 10, 20, 30] as const;

type ArticlesPage = { articles: ArticleSummary[] };

function shuffled<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function TimePile({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [budget, setBudget] = React.useState<number>(5);
  const [order, setOrder] = React.useState<ArticleSummary[] | null>(null);
  const [skipped, setSkipped] = React.useState<Set<string>>(new Set());
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const later = useSWR<ArticlesPage>(open ? "/api/articles?later=queue&page=1&limit=40" : null, {
    revalidateOnFocus: false,
  });
  const forYou = useSWR<ArticlesPage>(
    open ? "/api/articles?view=foryou&unread=true&page=1&limit=60" : null,
    { revalidateOnFocus: false }
  );
  const loading = !later.data && !forYou.data;
  const candidates = React.useMemo(
    () => [...(later.data?.articles ?? []), ...(forYou.data?.articles ?? [])],
    [later.data, forYou.data]
  );
  const { picks, total } = React.useMemo(
    () =>
      fillBudget(
        (order ?? candidates).filter((a) => !skipped.has(a.id)),
        budget
      ),
    [order, candidates, skipped, budget]
  );

  function start(at: number) {
    if (picks.length === 0) return;
    haptic("success");
    startSession({
      title: `Your ${budget} minutes`,
      minutes: budget,
      items: picks.map((p) => p.article),
      index: at,
    });
    onOpenChange(false);
    setSelectedArticleId(picks[at].article.id);
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
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : picks.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          Nothing short enough right now. Try more time.
        </p>
      ) : (
        <>
          <div
            data-no-tab-swipe
            className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 scrollbar-none"
          >
            {picks.map(({ article, minutes }, i) => (
              <PileCard
                key={article.id}
                article={article}
                minutes={minutes}
                position={i + 1}
                onOpen={() => start(i)}
                onSwap={() => {
                  haptic();
                  setSkipped((prev) => new Set(prev).add(article.id));
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 pb-2 pt-1">
            <button
              type="button"
              onClick={() => {
                haptic();
                setSkipped(new Set());
                setOrder(shuffled(candidates));
              }}
              aria-label="Shuffle"
              title="Shuffle"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-border hover:bg-accent"
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => start(0)}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              <Play className="h-4 w-4 fill-current" />
              Start · {picks.length} {picks.length === 1 ? "piece" : "pieces"}, {Math.round(total)}{" "}
              min
            </button>
          </div>
          <p className="px-4 pb-1 text-center text-[11px] text-muted-foreground">
            Read, then swipe to the next. Leave any time: a pill brings you back.
          </p>
        </>
      )}
    </Sheet>
  );
}

function PileCard({
  article,
  minutes,
  position,
  onOpen,
  onSwap,
}: {
  article: ArticleSummary;
  minutes: number;
  position: number;
  onOpen: () => void;
  onSwap: () => void;
}) {
  const source = articleSource(article);
  const [broken, setBroken] = React.useState(false);
  const episode = article.audioUrl && !article.isVideo;
  return (
    <div className="relative w-[68%] max-w-[15rem] shrink-0 snap-center">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-transform active:scale-[0.98]"
      >
        <span
          className="relative block aspect-[16/10] w-full bg-muted"
          style={{ backgroundColor: getFaviconFallbackColor(source.name) }}
        >
          {article.imageUrl && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
              className="dim-dark h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <FeedFavicon title={source.name} faviconUrl={source.faviconUrl} size={36} />
            </span>
          )}
          <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 text-[11px] font-bold text-white">
            {position}
          </span>
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            {episode ? (
              <Headphones className="h-3 w-3" />
            ) : article.isVideo ? (
              <Play className="h-3 w-3 fill-current" />
            ) : (
              <Timer className="h-3 w-3" />
            )}
            {Math.round(minutes)} min
          </span>
        </span>
        <span className="flex flex-1 flex-col p-3">
          <span className="line-clamp-3 text-[14px] font-semibold leading-snug">
            {article.title}
          </span>
          <span className="mt-auto truncate pt-1.5 text-[11.5px] text-muted-foreground">
            {source.name}
            {article.isSaved && " · Later"}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onSwap}
        aria-label={`Swap out ${article.title}`}
        title="Swap for another"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/75"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
