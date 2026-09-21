"use client";

import * as React from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArticleHeader } from "@/components/articles/ArticleHeader";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useArticles, toggleArticleRead, toggleArticleSaved } from "@/lib/hooks/useArticles";
import { useReadingProgress } from "@/lib/hooks/useReadingProgress";

export function ArticleReader() {
  const { selectedArticleId, setMobilePane, listParams, sort } = useReaderState();
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

      <div className="flex items-center border-b p-2 md:hidden">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setMobilePane("list")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[680px] px-6 py-8">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
