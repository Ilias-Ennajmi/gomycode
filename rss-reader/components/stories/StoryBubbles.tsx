"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { readSeen, type StorySource } from "@/lib/stories";
import type { FeedType } from "@/lib/types";

const StoriesPlayer = dynamic(
  () => import("@/components/stories/StoriesPlayer").then((m) => m.StoriesPlayer),
  { ssr: false }
);

const MAX_BUBBLES = 24;

/**
 * A row of sources with something new, each a circle with a lit ring, like the stories row
 * of a social app. Tap one to flip through its latest unread full screen; the first bubble
 * plays For You's picks.
 */
export function StoryBubbles({ type, className }: { type?: FeedType; className?: string }) {
  const { feeds } = useFeeds();
  const [open, setOpen] = React.useState<number | null>(null);
  // Re-render when a story is seen, so rings dim as you go.
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("reader:stories-seen", bump);
    return () => window.removeEventListener("reader:stories-seen", bump);
  }, []);
  const seenCount = React.useRef(0);
  seenCount.current = readSeen().size;

  const sources = React.useMemo<StorySource[]>(() => {
    const withNews = feeds
      .filter((f) => f.unreadCount > 0 && !f.muted && (!type || f.type === type))
      .sort((a, b) => (b.lastPublished ?? "").localeCompare(a.lastPublished ?? ""))
      .slice(0, MAX_BUBBLES)
      .map((f) => ({
        id: f.id,
        title: f.title,
        faviconUrl: f.faviconUrl,
        kind: "feed" as const,
        unread: f.unreadCount,
      }));
    if (withNews.length === 0) return [];
    const forYou: StorySource = {
      id: "foryou",
      title: "For you",
      faviconUrl: null,
      kind: "foryou",
      unread: withNews.reduce((n, s) => n + s.unread, 0),
    };
    return type ? withNews : [forYou, ...withNews];
  }, [feeds, type]);

  if (sources.length === 0) return null;

  return (
    <>
      <div
        role="list"
        aria-label="Stories"
        className={cn("flex gap-3 overflow-x-auto px-4 pb-2 pt-3 scrollbar-none snap-x", className)}
      >
        {sources.map((source, i) => (
          <button
            key={source.id}
            type="button"
            role="listitem"
            onClick={() => setOpen(i)}
            className="flex w-[66px] shrink-0 snap-start flex-col items-center gap-1.5"
            aria-label={`${source.title}: ${source.unread} new`}
          >
            <span
              className={cn(
                "relative flex h-[62px] w-[62px] items-center justify-center rounded-full p-[3px]",
                source.kind === "foryou"
                  ? "bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400"
                  : "bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400"
              )}
            >
              <span className="flex h-full w-full items-center justify-center rounded-full bg-background p-[2px]">
                {source.kind === "foryou" ? (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </span>
                ) : (
                  <FeedFavicon
                    title={source.title}
                    faviconUrl={source.faviconUrl}
                    size={52}
                    className="rounded-full"
                  />
                )}
              </span>
              {source.kind === "feed" && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                  {source.unread > 99 ? "99+" : source.unread}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
              {source.title}
            </span>
          </button>
        ))}
      </div>
      {open !== null && (
        <StoriesPlayer sources={sources} start={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
