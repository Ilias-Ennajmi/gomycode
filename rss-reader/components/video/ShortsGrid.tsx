"use client";

import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArticleSummary } from "@/lib/types";

/**
 * YouTube Shorts as tall cards, two across. Their thumbnails are wide pictures with the
 * vertical video in the middle, so the middle is what's shown.
 */
export function ShortsGrid({
  articles,
  selectedId,
  onSelect,
}: {
  articles: ArticleSummary[];
  selectedId: string | null;
  onSelect: (article: ArticleSummary) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 md:grid-cols-2">
      {articles.map((article) => (
        <li key={article.id}>
          <button
            type="button"
            onClick={() => onSelect(article)}
            className={cn(
              "group relative block aspect-[9/16] w-full overflow-hidden rounded-xl bg-muted text-left ring-offset-2 ring-offset-background",
              article.id === selectedId && "ring-2 ring-primary"
            )}
          >
            {article.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.imageUrl}
                alt=""
                loading="lazy"
                className={cn(
                  "absolute inset-0 h-full w-full scale-[1.02] object-cover transition-transform duration-300 group-hover:scale-105",
                  article.isRead && "opacity-60"
                )}
              />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
              <Smartphone className="h-3 w-3" /> Short
            </span>
            {!article.isRead && (
              <span
                className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-black/30"
                aria-label="Unread"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 p-2.5">
              <span className="line-clamp-3 text-[13px] font-semibold leading-snug text-white">
                {article.title}
              </span>
              <span className="mt-1 block truncate text-[11px] text-white/75">
                {article.feed.title}
              </span>
            </span>
            {(article.readProgress ?? 0) > 0 && (
              <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${Math.min(100, article.readProgress ?? 0)}%` }}
                />
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
