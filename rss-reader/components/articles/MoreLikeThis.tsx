"use client";

import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { formatRelativeTime } from "@/lib/utils";
import type { ArticleSummary } from "@/lib/types";

/** At the end of an article: three close ones from your own feeds (by meaning, not words). */
export function MoreLikeThis({
  articleId,
  onOpen,
}: {
  articleId: string;
  onOpen: (article: ArticleSummary) => void;
}) {
  const { data } = useSWR<{ articles: ArticleSummary[] }>(`/api/articles/${articleId}/similar`, {
    revalidateOnFocus: false,
  });
  const articles = data?.articles ?? [];
  if (articles.length === 0) return null;
  return (
    <section aria-label="More like this" className="mt-10">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> More like this
      </h2>
      <ul className="divide-y rounded-2xl border bg-card/60">
        {articles.map((article) => (
          <li key={article.id}>
            <button
              type="button"
              onClick={() => onOpen(article)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/60"
            >
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-14 w-16 shrink-0 rounded-lg object-cover"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold leading-snug">
                  {article.title}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FeedFavicon
                    title={article.feed.title}
                    faviconUrl={article.feed.faviconUrl}
                    size={14}
                  />
                  <span className="truncate">{article.feed.title}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{formatRelativeTime(article.publishedAt)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
