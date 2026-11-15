"use client";

import * as React from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiStatus, useArticleSummary } from "@/lib/hooks/useAi";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArticleSummary } from "@/lib/types";
import { useT } from "@/lib/i18n";

/** "Up next" at the end of an article, so reading flows without going back to the list. */
export function UpNext({
  previous,
  next,
  onGo,
}: {
  previous: ArticleSummary | null;
  next: ArticleSummary | null;
  onGo: (article: ArticleSummary) => void;
}) {
  const { t } = useT();
  return (
    <nav aria-label={t("More articles")} className="mt-12 border-t pt-6">
      {next && (
        <button
          type="button"
          onClick={() => onGo(next)}
          className="group flex w-full items-center gap-4 rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:bg-accent/60"
        >
          {next.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={next.imageUrl}
              alt=""
              loading="lazy"
              className="h-16 w-20 shrink-0 rounded-lg object-cover"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-primary">
              {t("Up next")}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[15px] font-semibold leading-snug">
              {next.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {next.feed.title}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
      {previous && (
        <button
          type="button"
          onClick={() => onGo(previous)}
          className="mt-3 flex w-full items-center gap-1.5 text-left text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {t("Previous:")} {previous.title}
          </span>
        </button>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground md:hidden">
        {t("Tip: swipe left or right to move between articles")}
      </p>
    </nav>
  );
}

export function AiSummary({
  articleId,
  cached,
  ready,
}: {
  articleId: string;
  cached?: string | null;
  /** False while the full article is still loading, so the summary uses the whole text. */
  ready: boolean;
}) {
  const { t } = useT();
  const status = useAiStatus();
  const { summary, isLoading } = useArticleSummary(
    articleId,
    Boolean(status?.enabled) && !cached && ready
  );
  const text = cached ?? summary;
  if (!text && !isLoading) return null;

  return (
    <section
      aria-label={t("AI summary")}
      className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> {t("Summary")}
      </p>
      {text ? (
        <p className="text-[15px] leading-relaxed text-foreground/90">{text}</p>
      ) : (
        <div className="space-y-2 py-1">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      )}
    </section>
  );
}

export function FullArticleBar({
  loading,
  status,
  showFeedVersion,
  onToggle,
  link,
}: {
  loading: boolean;
  status?: "full" | "limited" | "failed";
  showFeedVersion: boolean;
  onToggle: (feedVersion: boolean) => void;
  link: string;
}) {
  const { t } = useT();
  if (loading) {
    return (
      <div className="mt-6 space-y-2" role="status" aria-label={t("Loading the full article")}>
        <Skeleton className="h-8 w-56 rounded-lg" />
        <p className="text-xs text-muted-foreground">{t("Loading the full article…")}</p>
      </div>
    );
  }
  if (status === "full") {
    return (
      <div className="mt-6 inline-flex rounded-lg bg-muted p-1 text-sm">
        {[
          { feed: false, label: "Full article" },
          { feed: true, label: "Feed version" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onToggle(option.feed)}
            aria-pressed={showFeedVersion === option.feed}
            className={cn(
              "rounded-md px-3 py-1",
              showFeedVersion === option.feed
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    );
  }
  if (status === "limited" || status === "failed") {
    return (
      <div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {status === "limited"
          ? t("This site limits free reading, so only the excerpt is available here.")
          : t("The full article couldn’t be loaded, so this is the feed’s excerpt.")}{" "}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          {t("Open original")}
        </a>
      </div>
    );
  }
  return null;
}

/**
 * "Continue where you left off": an article opened again after reading part of it offers to
 * jump back to that point. Hidden once the reader scrolls on their own.
 */
export function ResumeReading({
  startProgress,
  progress,
  scrollRef,
}: {
  startProgress: number;
  progress: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useT();
  const [visible, setVisible] = React.useState(startProgress >= 10 && startProgress <= 90);
  React.useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(timeout);
  }, [visible]);
  React.useEffect(() => {
    if (progress > 5) setVisible(false);
  }, [progress]);
  if (!visible) return null;

  function resume() {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({
        top: ((el.scrollHeight - el.clientHeight) * startProgress) / 100,
        behavior: "smooth",
      });
    }
    setVisible(false);
  }

  return (
    <button
      type="button"
      onClick={resume}
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 z-20 flex -translate-x-1/2 whitespace-nowrap animate-fade-in items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl"
    >
      <ArrowDownToLine className="h-4 w-4" />
      {t("Continue where you left off ·")} {startProgress}%
    </button>
  );
}
