"use client";

import { Headphones, Play } from "lucide-react";
import { cn, formatRelativeTime, getFaviconFallbackColor } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { durationLabel } from "@/lib/hooks/useVideo";
import type { ArticleSummary } from "@/lib/types";

/**
 * A shelf of square tiles: artwork (or the source's colour and initial), the title under
 * it, a badge for length, a dot for unread, a line for progress. Two across on phones,
 * three on wider screens. Made for podcasts and videos; works for anything.
 */
export function TileGrid({
  articles,
  selectedId,
  onSelect,
}: {
  articles: ArticleSummary[];
  selectedId: string | null;
  onSelect: (article: ArticleSummary) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
      {articles.map((article, index) => {
        const media = article.isVideo || Boolean(article.audioUrl);
        const progress = article.readProgress ?? 0;
        return (
          <li
            key={article.id}
            data-article-id={article.id}
            className={cn(index < 12 && "animate-rise-in motion-reduce:animate-none")}
            style={
              index < 12
                ? { animationDelay: `${index * 35}ms`, animationFillMode: "backwards" }
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => onSelect(article)}
              className={cn(
                "group block w-full text-left",
                article.id === selectedId &&
                  "[&>span:first-child]:ring-2 [&>span:first-child]:ring-primary"
              )}
            >
              <span
                className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-sm ring-offset-2 ring-offset-background"
                style={{ backgroundColor: getFaviconFallbackColor(article.feed.title) }}
              >
                {/* The source's initial sits underneath, so a missing or broken picture still looks made. */}
                <span className="absolute inset-0 flex items-center justify-center font-serif text-5xl font-semibold text-white/90">
                  {article.feed.title.trim().charAt(0).toUpperCase()}
                </span>
                {article.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                    className={cn(
                      "dim-dark absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105",
                      article.isRead && "opacity-60"
                    )}
                  />
                )}
                {media && (
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                      {article.isVideo ? (
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      ) : (
                        <Headphones className="h-5 w-5" />
                      )}
                    </span>
                  </span>
                )}
                {!article.isRead && (
                  <span
                    className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-black/30"
                    aria-label="Unread"
                  />
                )}
                {article.durationSeconds ? (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur">
                    {durationLabel(article.durationSeconds)}
                  </span>
                ) : null}
                {progress > 0 && progress < 100 && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
                    <span className="block h-full bg-primary" style={{ width: `${progress}%` }} />
                  </span>
                )}
              </span>
              <span className="mt-2 block">
                <span
                  className={cn(
                    "line-clamp-2 text-[13.5px] font-semibold leading-snug",
                    article.isRead && "font-medium text-muted-foreground"
                  )}
                >
                  {article.title}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <FeedFavicon
                    title={article.feed.title}
                    faviconUrl={article.feed.faviconUrl}
                    size={13}
                  />
                  <span className="truncate">{article.feed.title}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{formatRelativeTime(article.publishedAt)}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
