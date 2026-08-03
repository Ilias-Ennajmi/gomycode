"use client";

import * as React from "react";
import { Bookmark } from "lucide-react";
import { cn, formatRelativeTime, readingTime, stripHtml } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { Highlight } from "@/components/shared/Highlight";
import type { ArticleSummary } from "@/lib/types";

interface ArticleCardProps {
  article: ArticleSummary;
  active: boolean;
  searchQuery?: string;
  onClick: () => void;
  onToggleSave: () => void;
}

export const ArticleCard = React.forwardRef<HTMLButtonElement, ArticleCardProps>(
  function ArticleCard({ article, active, searchQuery, onClick, onToggleSave }, ref) {
    const summary = article.summary || stripHtml(article.content).slice(0, 200);

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "group relative flex w-full gap-3 border-b border-border/70 p-3 text-left transition-colors",
          active ? "border-l-2 border-l-primary bg-accent/60" : "border-l-2 border-l-transparent hover:bg-accent/30",
          article.isRead ? "opacity-60" : "bg-background"
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FeedFavicon title={article.feed.title} faviconUrl={article.feed.faviconUrl} size={14} />
            <span className="truncate">{article.feed.title}</span>
          </div>
          <h3
            className={cn(
              "line-clamp-2 text-sm leading-snug",
              article.isRead ? "font-normal text-foreground/70" : "font-semibold text-foreground"
            )}
          >
            <Highlight text={article.title} query={searchQuery} />
          </h3>
          {summary && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              <Highlight text={summary} query={searchQuery} />
            </p>
          )}
          <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
            <span>{formatRelativeTime(article.publishedAt)}</span>
            <span>·</span>
            <span>{readingTime(article.content || article.summary)}</span>
          </div>
        </div>

        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            className="h-[60px] w-[80px] shrink-0 rounded-lg object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          className={cn(
            "absolute right-2 top-2 rounded-full bg-background/90 p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-accent",
            article.isSaved && "opacity-100 text-primary"
          )}
          aria-label={article.isSaved ? "Remove from saved" : "Save article"}
        >
          <Bookmark className={cn("h-3.5 w-3.5", article.isSaved && "fill-current")} />
        </button>
      </button>
    );
  }
);
