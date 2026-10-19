"use client";

import useSWR from "swr";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import type { ArticleSummary } from "@/lib/types";

interface Day {
  day: string;
  articles: ArticleSummary[];
}

function dayLabel(day: string) {
  const date = new Date(`${day}T12:00:00`);
  const today = new Date();
  const diff = Math.round((today.setHours(12, 0, 0, 0) - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * How a story unfolded: earlier and later coverage of the same story from your feeds, day
 * by day. Shown only when there's a real thread (three or more pieces across several days).
 */
export function StoryTimeline({
  articleId,
  onOpen,
}: {
  articleId: string;
  onOpen: (article: ArticleSummary) => void;
}) {
  const { data } = useSWR<{ days: Day[] }>(`/api/articles/${articleId}/timeline`, {
    revalidateOnFocus: false,
  });
  const days = data?.days ?? [];
  const count = days.reduce((n, d) => n + d.articles.length, 0);
  if (days.length < 2 || count < 3) return null;
  return (
    <section aria-label="Story timeline" className="mt-10">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5 text-primary" /> How this story unfolded
      </h2>
      <ol className="relative ml-2 border-l pl-5">
        {days.map((day) => (
          <li key={day.day} className="relative pb-5 last:pb-0">
            <span
              aria-hidden
              className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
            />
            <p className="text-xs font-semibold text-muted-foreground">{dayLabel(day.day)}</p>
            <ul className="mt-1.5 space-y-1.5">
              {day.articles.map((article) => (
                <li key={article.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(article)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
                      article.isRead && "text-muted-foreground"
                    )}
                  >
                    <FeedFavicon
                      title={article.feed.title}
                      faviconUrl={article.feed.faviconUrl}
                      size={16}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium leading-snug">
                        {article.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{article.feed.title}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
