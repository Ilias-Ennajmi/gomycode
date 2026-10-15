"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BookOpenCheck,
  Check,
  EyeOff,
  Flame,
  Highlighter,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { HIGHLIGHT_SWATCH } from "@/components/highlights/ReaderHighlights";
import { TagEditor } from "@/components/highlights/TagEditor";
import { requestHighlightJump } from "@/lib/highlight-dom";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { HighlightSummary } from "@/lib/types";

type Grade = "again" | "good" | "easy" | "never";
type ReviewItem = HighlightSummary & { next: { again: number; good: number; easy: number } };

interface ReviewData {
  highlights: ReviewItem[];
  reviewedToday: number;
  dailyCount: number;
  moreDue: number;
  total: number;
  streak: number;
}

export function useReviewStatus() {
  return useSWR<ReviewData>("/api/review", { revalidateOnFocus: false });
}

function inDays(days: number) {
  if (days <= 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/**
 * The daily review: today's few highlights one at a time. Each answer sets when it comes
 * back; a streak counts the days in a row with a review.
 */
export function ReviewView() {
  const { data, isLoading, mutate } = useReviewStatus();
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  // The queue for this sitting: today's set, then "review more" batches.
  const [queue, setQueue] = React.useState<ReviewItem[] | null>(null);
  const [done, setDone] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  React.useEffect(() => {
    if (data && queue === null) setQueue(data.highlights);
  }, [data, queue]);

  const current = queue?.[0] ?? null;
  const sessionSize = done + (queue?.length ?? 0);

  async function grade(value: Grade) {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/review/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: value }),
      });
      if (!res.ok) throw new Error("Could not save your answer");
      setQueue((q) => (q ? q.slice(1) : q));
      setDone((n) => n + 1);
      if (value === "never") toast("It won't come back in reviews");
      if ((queue?.length ?? 0) <= 1) mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your answer");
    } finally {
      setBusy(false);
    }
  }

  async function reviewMore() {
    setLoadingMore(true);
    try {
      const res = await fetch("/api/review?more=1");
      const body = (await res.json()) as { highlights: ReviewItem[] };
      setQueue(body.highlights);
    } catch {
      toast.error("Could not load more highlights");
    } finally {
      setLoadingMore(false);
    }
  }

  function open(item: ReviewItem) {
    requestHighlightJump(item.id);
    setSelectedArticleId(item.articleId);
    setMobilePane("reader");
  }

  // Keyboard: 1 again, 2 good, 3 easy.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      const map: Record<string, Grade> = { "1": "again", "2": "good", "3": "easy" };
      const value = map[event.key];
      if (value) {
        event.preventDefault();
        void grade(value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex min-h-full max-w-xl flex-col px-5 py-6 md:py-10">
        <header className="flex items-center gap-3">
          <BookOpenCheck className="h-6 w-6 text-primary" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Daily review</h1>
            <p className="text-sm text-muted-foreground">
              A few highlights a day, so what you kept stays with you.
            </p>
          </div>
          {data && data.streak > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400"
              title="Days in a row with a review"
            >
              <Flame className="h-3.5 w-3.5" /> {data.streak} day{data.streak === 1 ? "" : "s"}
            </span>
          )}
        </header>

        {sessionSize > 0 && current && (
          <div
            className="mt-6 flex items-center gap-1.5"
            aria-label={`${done + 1} of ${sessionSize}`}
          >
            {Array.from({ length: sessionSize }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i < done ? "bg-primary" : i === done ? "bg-primary/50" : "bg-muted"
                )}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex-1">
          {isLoading || queue === null ? (
            <div className="space-y-3 rounded-2xl border p-6">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : current ? (
            <ReviewCard key={current.id} item={current} onOpen={() => open(current)} />
          ) : (
            <Finished
              total={data?.total ?? 0}
              reviewed={data?.reviewedToday ?? done}
              streak={data?.streak ?? 0}
              moreDue={data?.moreDue ?? 0}
              loadingMore={loadingMore}
              onMore={reviewMore}
            />
          )}
        </div>

        {current && (
          <div className="sticky bottom-0 -mx-5 mt-6 border-t bg-background/95 px-5 pb-safe pt-3 backdrop-blur">
            <p className="mb-2 text-center text-xs text-muted-foreground">
              Did it stick? It comes back…
            </p>
            <div className="grid grid-cols-3 gap-2">
              <GradeButton
                label="Again"
                hint={inDays(current.next.again)}
                disabled={busy}
                onClick={() => void grade("again")}
                icon={<RotateCcw className="h-4 w-4" />}
              />
              <GradeButton
                label="Good"
                hint={inDays(current.next.good)}
                disabled={busy}
                onClick={() => void grade("good")}
                primary
              />
              <GradeButton
                label="Easy"
                hint={inDays(current.next.easy)}
                disabled={busy}
                onClick={() => void grade("easy")}
              />
            </div>
            <button
              type="button"
              onClick={() => void grade("never")}
              disabled={busy}
              className="mx-auto mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <EyeOff className="h-3.5 w-3.5" /> Don&apos;t show this again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GradeButton({
  label,
  hint,
  onClick,
  disabled,
  primary,
  icon,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors disabled:opacity-60",
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "hover:bg-accent"
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-[11px]",
          primary ? "text-primary-foreground/80" : "text-muted-foreground"
        )}
      >
        {hint}
      </span>
    </button>
  );
}

function ReviewCard({ item, onOpen }: { item: ReviewItem; onOpen: () => void }) {
  const article = item.article;
  return (
    <article className="animate-fade-in rounded-2xl border bg-card/60 p-5 shadow-sm md:p-7">
      <div className="flex gap-4">
        <span
          className={cn("w-1 shrink-0 rounded-full", HIGHLIGHT_SWATCH[item.color])}
          aria-hidden
        />
        <blockquote className="min-w-0 whitespace-pre-line font-serif text-[19px] leading-relaxed md:text-[21px]">
          {item.text}
        </blockquote>
      </div>
      {item.note && (
        <p className="mt-4 whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-sm">
          {item.note}
        </p>
      )}
      {article && (
        <button
          type="button"
          onClick={onOpen}
          className="group mt-5 flex w-full min-w-0 items-center gap-2 text-left text-sm text-muted-foreground"
        >
          <FeedFavicon title={article.feed.title} faviconUrl={article.feed.faviconUrl} size={16} />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground/85 group-hover:underline">
              {article.title}
            </span>
            {" · "}
            {article.feed.title}
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0" />
        </button>
      )}
      <div className="mt-4">
        <TagEditor highlight={item} />
      </div>
    </article>
  );
}

function Finished({
  total,
  reviewed,
  streak,
  moreDue,
  loadingMore,
  onMore,
}: {
  total: number;
  reviewed: number;
  streak: number;
  moreDue: number;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { setView, setLaterTab } = useReaderState();
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
        <Highlighter className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-xs text-sm text-muted-foreground">
          Nothing to review yet. Highlight passages while you read, and they come back here a day
          later.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card/60 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="h-7 w-7" />
      </span>
      <h2 className="text-lg font-semibold">Done for today</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        {reviewed > 0
          ? `${reviewed} highlight${reviewed === 1 ? "" : "s"} reviewed today.`
          : "Nothing was due today."}
        {streak > 1 ? ` That's ${streak} days in a row.` : ""} New ones come back tomorrow.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {moreDue > 0 && (
          <Button onClick={onMore} disabled={loadingMore} className="gap-1.5">
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Review {Math.min(5, moreDue)} more
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setView({ type: "later", label: "Later" });
            setLaterTab("highlights");
          }}
        >
          All highlights
        </Button>
      </div>
    </div>
  );
}

/** On Today: today's review waiting, one tap away. Nothing when it's done or empty. */
export function ReviewPrompt() {
  const { data } = useReviewStatus();
  const { setView } = useReaderState();
  const count = data?.highlights.length ?? 0;
  if (!data || count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => setView({ type: "review", label: "Daily review" })}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:bg-accent/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <BookOpenCheck className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Daily review</span>
        <span className="block text-xs text-muted-foreground">
          {count} highlight{count === 1 ? "" : "s"} to look back on
          {data.streak > 0 ? ` · ${data.streak}-day streak` : ""}
        </span>
      </span>
      <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
        Start
      </span>
    </button>
  );
}
