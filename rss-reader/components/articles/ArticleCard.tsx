"use client";

import { Bookmark, Play, TrendingUp } from "lucide-react";
import { cn, formatRelativeTime, readingTime, stripHtml } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { Highlight } from "@/components/shared/Highlight";
import type { ArticleSummary } from "@/lib/types";

interface ArticleCardProps {
  article: ArticleSummary;
  active: boolean;
  variant?: "default" | "hero";
  searchQuery?: string;
  onClick: () => void;
  onToggleSave: () => void;
}

export function ArticleCard({
  article,
  active,
  variant = "default",
  searchQuery,
  onClick,
  onToggleSave,
}: ArticleCardProps) {
  const summary = article.summary || stripHtml(article.content).slice(0, 200);
  const largeMedia = article.imageUrl && (article.isVideo || variant === "hero");

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
        "group relative flex w-full cursor-pointer gap-3 border-b border-border/70 px-4 py-3.5 text-left",
        active
          ? "bg-accent/70 shadow-[inset_3px_0_0_hsl(var(--primary))]"
          : "hover:bg-accent/40"
      )}
    >
      <div className={cn("min-w-0 flex-1 space-y-1.5", largeMedia && "space-y-2.5")}>
        {largeMedia && (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl!}
              alt=""
              loading={variant === "hero" ? "eager" : "lazy"}
              className={cn("h-full w-full object-cover", article.isRead && "opacity-70")}
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = "none";
              }}
            />
            {article.isVideo && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
              </span>
            )}
          </div>
        )}

        <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", !largeMedia && "pr-7")}>
          {!article.isRead && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
          )}
          <FeedFavicon title={article.feed.title} faviconUrl={article.feed.faviconUrl} size={14} />
          <span className="truncate font-medium">{article.feed.title}</span>
          {article.boosted && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              <TrendingUp className="h-3 w-3" /> Boosted
            </span>
          )}
        </div>

        <h3
          className={cn(
            "font-serif leading-snug",
            variant === "hero" ? "line-clamp-3 text-xl" : "line-clamp-2 text-[15px]",
            article.isRead ? "font-normal text-muted-foreground" : "font-semibold text-foreground"
          )}
        >
          <Highlight text={article.title} query={searchQuery} />
        </h3>

        {summary && (
          <p
            className={cn(
              "text-[13px] leading-relaxed text-muted-foreground",
              variant === "hero" ? "line-clamp-3" : "line-clamp-2",
              article.isRead && "opacity-80"
            )}
          >
            <Highlight text={summary} query={searchQuery} />
          </p>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{formatRelativeTime(article.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span>{article.isVideo ? "Video" : readingTime(article.content || article.summary)}</span>
        </div>
      </div>

      {article.imageUrl && !largeMedia && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          className={cn(
            "mt-5 h-[68px] w-[88px] shrink-0 rounded-lg object-cover",
            article.isRead && "opacity-70"
          )}
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
          "absolute right-2 top-2 rounded-full p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          largeMedia && "right-6 top-5 bg-background/85 shadow-sm backdrop-blur",
          article.isSaved && "text-primary opacity-100"
        )}
        aria-label={article.isSaved ? "Remove from saved" : "Save article"}
      >
        <Bookmark className={cn("h-4 w-4", article.isSaved && "fill-current")} />
      </button>
    </div>
  );
}
