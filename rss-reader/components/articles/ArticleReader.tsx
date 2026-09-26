"use client";

import * as React from "react";
import {
  Loader2,
  Archive,
  ArchiveRestore,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ExternalLink,
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
import { ReaderSettings } from "@/components/articles/ReaderSettings";

export function ArticleReader() {
  const { view, selectedArticleId, setMobilePane, listParams, sort } = useReaderState();
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

  // Excerpt-only feeds: fetch the full page (cached server-side) and show it
  // by default, with a toggle back to the feed's own text.
  const wantsFull = article ? needsFullArticle(article) : false;
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
          <ReaderSettings />
        </div>
      </div>

      <ReaderSettings className="absolute right-4 top-3 z-10 hidden md:inline-flex" />
      <MinutesLeft words={wordCount(bodyHtml || article.summary)} progress={progress} />

      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin">
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
            />
          </div>
        </div>
      </div>
    </div>
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
      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the full article…
      </p>
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
