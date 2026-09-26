"use client";

import { Bookmark, Play } from "lucide-react";
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

export function ArticleCard({
  article,
  active,
  searchQuery,
  onClick,
  onToggleSave,
}: ArticleCardProps) {
  const summary = article.summary || stripHtml(article.content).slice(0, 200);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex w-full cursor-pointer gap-3 border-b border-border/70 p-3 text-left transition-colors",
        active ? "border-l-2 border-l-primary bg-accent/60" : "border-l-2 border-l-transparent hover:bg-accent/30",
        article.isRead ? "opacity-60" : "bg-background"
      )}
    >
      <div className={cn("min-w-0 flex-1 space-y-1", article.isVideo && "space-y-2")}>
        {article.isVideo && article.imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            </span>
          </div>
        )}
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
          <span>{article.isVideo ? "Video" : readingTime(article.content || article.summary)}</span>
        </div>
      </div>

      {article.imageUrl && !article.isVideo && (
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
    </div>
  );
}
