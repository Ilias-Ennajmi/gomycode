"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { readSeen, type StorySource } from "@/lib/stories";
import type { FeedSummary } from "@/lib/types";
import type { SourceTab } from "@/lib/hooks/useReaderState";

const StoriesPlayer = dynamic(
  () => import("@/components/stories/StoriesPlayer").then((m) => m.StoriesPlayer),
  { ssr: false }
);

const MAX_BUBBLES = 24;
const COLLAPSED_KEY = "stories-collapsed";

/** Which sources belong to a tab: the RSS tab leaves News outlets to the News tab. */
function inScope(feed: FeedSummary, scope?: SourceTab) {
  if (!scope) return !feed.newsDesk;
  if (scope === "rss") return feed.type === "rss" && !feed.newsDesk;
  if (scope === "youtube") return feed.type === "youtube";
  if (scope === "newsletters") return feed.type === "newsletter";
  return feed.type === "podcast";
}

/**
 * A row of sources with something new, each a circle with a lit ring, like the stories row
 * of a social app. Tap one to flip through its latest unread full screen; the first bubble
 * plays For You's picks.
 */
export function StoryBubbles({ scope, className }: { scope?: SourceTab; className?: string }) {
  const { feeds } = useFeeds();
  const { personal } = usePersonal();
  const [open, setOpen] = React.useState<number | null>(null);
  // Re-render when a story is seen, so rings dim as you go.
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("reader:stories-seen", bump);
    return () => window.removeEventListener("reader:stories-seen", bump);
  }, []);
  const seenCount = React.useRef(0);
  seenCount.current = readSeen().size;
  // Folded into one slim line when the reader prefers the list to start higher.
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Open.
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // This visit only.
      }
      return !c;
    });
  };

  const sources = React.useMemo<StorySource[]>(() => {
    const withNews = feeds
      .filter((f) => f.unreadCount > 0 && !f.muted && inScope(f, scope))
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
    return scope ? withNews : [forYou, ...withNews];
  }, [feeds, scope]);

  if (sources.length === 0 || !personal.stories) return null;

  if (collapsed) {
    const shown = sources.filter((s) => s.kind === "feed").slice(0, 4);
    return (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        aria-label="Show stories"
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-accent/60",
          className
        )}
      >
        <span className="flex -space-x-2">
          {shown.map((s) => (
            <FeedFavicon
              key={s.id}
              title={s.title}
              faviconUrl={s.faviconUrl}
              size={22}
              className="rounded-full ring-2 ring-background"
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-foreground">Stories</span> · {sources.length} source
          {sources.length === 1 ? "" : "s"} with something new
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={true}
          aria-label="Hide stories"
          className="absolute right-2 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <div
          role="list"
          aria-label="Stories"
          className={cn(
            "flex gap-3 overflow-x-auto px-4 pb-2 pt-3 scrollbar-none snap-x",
            className
          )}
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
      </div>
      {open !== null && (
        <StoriesPlayer sources={sources} start={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
