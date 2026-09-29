"use client";

import * as React from "react";
import {
  AlarmClock,
  ArrowDownToLine,
  Archive,
  ArchiveRestore,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  Share,
  Sparkles,
} from "lucide-react";
import { shareLink } from "@/lib/share";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArticleHeader } from "@/components/articles/ArticleHeader";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { useReaderState } from "@/lib/hooks/useReaderState";
import {
  useArticle,
  useArticles,
  saveReadingProgress,
  useFullArticle,
  toggleArticleArchived,
  toggleArticleRead,
  toggleArticleSaved,
} from "@/lib/hooks/useArticles";
import { useSWRConfig } from "swr";
import { useAiStatus, useArticleSummary } from "@/lib/hooks/useAi";
import { Skeleton } from "@/components/ui/skeleton";
import { useReadingProgress } from "@/lib/hooks/useReadingProgress";
import { READER_WIDTHS, useReaderPrefs } from "@/lib/hooks/useReaderPrefs";
import { needsFullArticle, wordCount } from "@/lib/reader";
import { isPaidPreview } from "@/lib/newsletters";
import { ReaderSettings } from "@/components/articles/ReaderSettings";
import { ListenBar, ListenButton, useSpeech } from "@/components/articles/ListenButton";
import { useArticleHighlights } from "@/lib/hooks/useHighlights";
import { ReaderHighlights } from "@/components/highlights/ReaderHighlights";
import { ArticleHighlights } from "@/components/highlights/ArticleHighlights";
import { SnoozeMenu, isSnoozed } from "@/components/articles/SnoozeMenu";
import type { ArticleSummary } from "@/lib/types";

export function ArticleReader() {
  const { view, selectedArticleId, setSelectedArticleId, setMobilePane, listParams, sort } =
    useReaderState();
  const { articles, mutate: mutateList } = useArticles(listParams, sort);

  // Grouped stories and briefing links can point outside the loaded list.
  const listed =
    articles.find((a) => a.id === selectedArticleId) ??
    articles.flatMap((a) => a.topic?.related ?? []).find((a) => a.id === selectedArticleId) ??
    null;
  const { article: fetched, mutate: mutateSingle } = useArticle(listed ? null : selectedArticleId);
  const article = listed ?? fetched;
  const { mutate: globalMutate } = useSWRConfig();
  const mutate = () => {
    mutateList();
    mutateSingle();
  };
  // Saving or archiving changes which lists (and tab counts) an item belongs in.
  const refreshAllLists = () =>
    globalMutate((key) => typeof key === "string" && key.startsWith("/api/articles"));

  const { prefs } = useReaderPrefs();

  // Previous / next in the list the article was opened from (not on the News
  // front page or the briefing, whose order isn't a list).
  const inList =
    view.type !== "briefing" && view.type !== "recap" && !(view.type === "news" && !view.id);
  const index = inList && article ? articles.findIndex((a) => a.id === article.id) : -1;
  const previous = index > 0 ? articles[index - 1] : null;
  const next = index >= 0 ? (articles[index + 1] ?? null) : null;
  const goTo = React.useCallback(
    (target: ArticleSummary | null) => {
      if (target) setSelectedArticleId(target.id);
    },
    [setSelectedArticleId]
  );

  const speech = useSpeech(article?.id);

  const { highlights } = useArticleHighlights(article?.id);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [missingHighlights, setMissingHighlights] = React.useState<string[]>([]);
  React.useEffect(() => setMissingHighlights([]), [article?.id]);

  // Phones: swipe left for the next article, right for the previous one.
  const touch = React.useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(event: React.TouchEvent) {
    const t = event.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(event: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 90 || Math.abs(dy) > 50) return;
    // Not when the swipe scrolled something sideways (a table or code block).
    if ((event.target as HTMLElement).closest("pre, table, [data-scroll-x]")) return;
    goTo(dx < 0 ? next : previous);
  }

  // Excerpt-only feeds: fetch the full page (cached server-side) and show it
  // by default, with a toggle back to the feed's own text.
  // The free preview of a paid newsletter post: the full page is paywalled too, so say so
  // instead of fetching it.
  const paidPreview = Boolean(
    article && article.feed.type === "newsletter" && isPaidPreview(article.content)
  );
  const wantsFull = article && !paidPreview ? needsFullArticle(article) : false;
  const { full, isLoading: fullLoading } = useFullArticle(wantsFull ? (article?.id ?? null) : null);
  const [showFeedVersion, setShowFeedVersion] = React.useState(false);
  React.useEffect(() => setShowFeedVersion(false), [article?.id]);
  const hasFull = full?.status === "full" && Boolean(full.content);
  const bodyHtml = hasFull && !showFeedVersion ? full!.content : (article?.content ?? null);

  const { containerRef, progress } = useReadingProgress<HTMLDivElement>({
    resetKey: article?.id,
    onThresholdReached: () => {
      if (article && !article.isRead) {
        toggleArticleRead(article.id, true)
          .then(() => mutate())
          .catch(() => undefined);
      }
    },
  });

  // Persist how far the reader got, in 10% steps, so lists can show progress bars.
  const savedProgress = React.useRef({ id: "", value: 0 });
  React.useEffect(() => {
    if (!article) return;
    if (savedProgress.current.id !== article.id) {
      savedProgress.current = { id: article.id, value: article.readProgress ?? 0 };
    }
    const step = Math.floor(progress / 10) * 10;
    if (step <= savedProgress.current.value) return;
    savedProgress.current.value = step;
    saveReadingProgress(article.id, step).catch(() => undefined);
  }, [article, progress]);

  // Show the new progress in the list once the reader moves on.
  const articleId = article?.id;
  React.useEffect(() => {
    return () => {
      if (articleId) mutateList();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  async function handleToggleArchive() {
    if (!article) return;
    const archived = !article.archivedAt;
    try {
      await toggleArticleArchived(article.id, archived);
      refreshAllLists();
      mutateSingle();
      toast.success(archived ? "Archived" : "Moved back to Later");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update article");
    }
  }

  async function handleToggleSave() {
    if (!article) return;
    try {
      await toggleArticleSaved(article.id, !article.isSaved);
      refreshAllLists();
      mutateSingle();
      toast.success(article.isSaved ? "Removed from Later" : "Added to Later");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update article");
    }
  }

  async function handleToggleRead() {
    if (!article) return;
    try {
      await toggleArticleRead(article.id, !article.isRead);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update article");
    }
  }

  // Skip the hero when the body already opens with the same picture.
  const showHero = Boolean(
    article?.imageUrl && !article.isVideo && !article.content?.includes(article.imageUrl)
  );

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <BookOpen className="h-10 w-10" />
        <p className="text-sm">Select an article to start reading</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="h-0.5 w-full shrink-0 bg-border">
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between border-b px-1 py-1 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 min-w-0 gap-0.5 pl-1.5 text-primary"
          onClick={() => setMobilePane("list")}
        >
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <span className="max-w-[40vw] truncate">{view.label}</span>
        </Button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10", article.isRead && "text-primary")}
            onClick={handleToggleRead}
            aria-label={article.isRead ? "Mark unread" : "Mark read"}
          >
            <Check className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10", article.isSaved && "text-primary")}
            onClick={handleToggleSave}
            aria-label={article.isSaved ? "Remove from Later" : "Read later"}
          >
            <Bookmark className={cn("h-5 w-5", article.isSaved && "fill-current")} />
          </Button>
          <SnoozeMenu article={article}>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-10 w-10", isSnoozed(article) && "text-amber-500")}
              aria-label="Snooze"
            >
              <AlarmClock className="h-5 w-5" />
            </Button>
          </SnoozeMenu>
          {article.isSaved && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={handleToggleArchive}
              aria-label={article.archivedAt ? "Move back to Later" : "Archive"}
            >
              {article.archivedAt ? (
                <ArchiveRestore className="h-5 w-5" />
              ) : (
                <Archive className="h-5 w-5" />
              )}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-10 w-10" asChild>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => shareLink(article.title, article.link)}
            aria-label="Share"
          >
            <Share className="h-5 w-5" />
          </Button>
          <ListenButton
            speech={speech}
            html={bodyHtml || article.summary || ""}
            className="h-10 w-10"
          />
          <ReaderSettings />
        </div>
      </div>

      <ReaderSettings className="absolute right-4 top-3 z-10 hidden md:inline-flex" />
      <ListenButton
        speech={speech}
        html={bodyHtml || article.summary || ""}
        className="absolute right-14 top-3 z-10 hidden h-9 w-9 md:inline-flex"
      />
      <ListenBar speech={speech} html={bodyHtml || article.summary || ""} />
      <MinutesLeft words={wordCount(bodyHtml || article.summary)} progress={progress} />
      <ResumeReading
        key={article.id}
        startProgress={article.readProgress ?? 0}
        progress={progress}
        scrollRef={containerRef}
      />
      <ReaderHighlights
        article={article}
        bodyRef={bodyRef}
        scrollRef={containerRef}
        highlights={highlights}
      />

      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div
          className="mx-auto px-5 py-6 md:px-8 md:py-10"
          style={{ maxWidth: READER_WIDTHS[prefs.width] + 64 }}
        >
          {showHero && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.imageUrl!}
              alt=""
              className="mb-6 aspect-[16/9] w-full rounded-2xl object-cover shadow-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <ArticleHeader
            article={article}
            onToggleSave={handleToggleSave}
            onToggleRead={handleToggleRead}
            onToggleArchive={handleToggleArchive}
          />
          <AiSummary
            articleId={article.id}
            cached={article.aiSummary}
            ready={!wantsFull || !fullLoading}
          />
          {paidPreview && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1">
                A paid post: this is the free preview. Read it all where you&rsquo;re subscribed.
              </span>
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open the post
                </a>
              </Button>
            </div>
          )}
          {wantsFull && (
            <FullArticleBar
              loading={fullLoading}
              status={full?.status}
              showFeedVersion={showFeedVersion}
              onToggle={setShowFeedVersion}
              link={article.link}
            />
          )}
          <div className="mt-6">
            <ArticleContent
              content={bodyHtml}
              summary={article.summary}
              link={article.link}
              isVideo={article.isVideo}
              highlights={highlights}
              onMissingHighlights={setMissingHighlights}
              bodyRef={bodyRef}
            />
          </div>
          <ArticleHighlights
            highlights={highlights}
            missing={missingHighlights}
            bodyRef={bodyRef}
          />
          {(previous || next) && <UpNext previous={previous} next={next} onGo={goTo} />}
        </div>
      </div>
    </div>
  );
}

/** "Up next" at the end of an article, so reading flows without going back to the list. */
function UpNext({
  previous,
  next,
  onGo,
}: {
  previous: ArticleSummary | null;
  next: ArticleSummary | null;
  onGo: (article: ArticleSummary) => void;
}) {
  return (
    <nav aria-label="More articles" className="mt-12 border-t pt-6">
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
              Up next
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
          <span className="truncate">Previous: {previous.title}</span>
        </button>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground md:hidden">
        Tip: swipe left or right to move between articles
      </p>
    </nav>
  );
}

function AiSummary({
  articleId,
  cached,
  ready,
}: {
  articleId: string;
  cached?: string | null;
  /** False while the full article is still loading, so the summary uses the whole text. */
  ready: boolean;
}) {
  const status = useAiStatus();
  const { summary, isLoading } = useArticleSummary(
    articleId,
    Boolean(status?.enabled) && !cached && ready
  );
  const text = cached ?? summary;
  if (!text && !isLoading) return null;

  return (
    <section
      aria-label="AI summary"
      className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Summary
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

function FullArticleBar({
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
  if (loading) {
    return (
      <div className="mt-6 space-y-2" role="status" aria-label="Loading the full article">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <p className="text-xs text-muted-foreground">Loading the full article…</p>
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
            {option.label}
          </button>
        ))}
      </div>
    );
  }
  if (status === "limited" || status === "failed") {
    return (
      <div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {status === "limited"
          ? "This site limits free reading, so only the excerpt is available here."
          : "The full article couldn’t be loaded, so this is the feed’s excerpt."}{" "}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Open original
        </a>
      </div>
    );
  }
  return null;
}

/** "4 min left" while reading, from the words still below the fold. */
function MinutesLeft({ words, progress }: { words: number; progress: number }) {
  const minutes = Math.ceil((words * (1 - progress / 100)) / 230);
  if (words < 300 || progress < 3 || progress > 97 || minutes < 1) return null;
  return (
    <span className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-full border bg-popover/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
      {minutes} min left
    </span>
  );
}

/**
 * "Continue where you left off": an article opened again after reading part of it offers to
 * jump back to that point. Hidden once the reader scrolls on their own.
 */
function ResumeReading({
  startProgress,
  progress,
  scrollRef,
}: {
  startProgress: number;
  progress: number;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
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
      Continue where you left off · {startProgress}%
    </button>
  );
}
