"use client";

import * as React from "react";
import { Bookmark, BookOpen, Check, ChevronLeft, ExternalLink, Share } from "lucide-react";
import { shareLink } from "@/lib/share";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArticleHeader } from "@/components/articles/ArticleHeader";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useArticles, toggleArticleRead, toggleArticleSaved } from "@/lib/hooks/useArticles";
import { useReadingProgress } from "@/lib/hooks/useReadingProgress";

export function ArticleReader() {
  const { view, selectedArticleId, setMobilePane, listParams, sort } = useReaderState();
  const { articles, mutate } = useArticles(listParams, sort);

  const article = articles.find((a) => a.id === selectedArticleId) ?? null;

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

  async function handleToggleSave() {
    if (!article) return;
    try {
      await toggleArticleSaved(article.id, !article.isSaved);
      mutate();
      toast.success(article.isSaved ? "Removed from saved" : "Saved to bookmarks");
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
            aria-label={article.isSaved ? "Remove from saved" : "Save article"}
          >
            <Bookmark className={cn("h-5 w-5", article.isSaved && "fill-current")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" asChild>
            <a href={article.link} target="_blank" rel="noopener noreferrer" aria-label="Open original">
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
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[680px] px-5 py-6 md:px-8 md:py-10">
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
          />
          <div className="mt-6">
            <ArticleContent
              content={article.content}
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
