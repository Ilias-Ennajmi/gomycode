"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { SOURCE_TAB_FEED_TYPE, useReaderState, type SourceTab } from "@/lib/hooks/useReaderState";

/** "All · Tech · Marketing · …" for a source tab: only categories with that kind of source. */
export function CategoryChips({ tab }: { tab: SourceTab }) {
  const { categories } = useCategories();
  const { feeds } = useFeeds();
  const { tabCategory, setTabCategory } = useReaderState();
  const selected = tabCategory[tab];
  const type = SOURCE_TAB_FEED_TYPE[tab];

  // News sources show in the News tab, not RSS.
  const tabFeeds = feeds.filter((feed) => feed.type === type && !(tab === "rss" && feed.newsDesk));
  const options = categories
    .filter((category) => tabFeeds.some((feed) => feed.categoryId === category.id))
    .map((category) => ({ id: category.id, name: category.name, color: category.color }));
  if (options.length > 0 && tabFeeds.some((feed) => !feed.categoryId)) {
    options.push({ id: "none", name: "Other", color: "" });
  }

  // A category that lost its last source of this kind falls back to All.
  const stale =
    Boolean(selected) && categories.length > 0 && !options.some((o) => o.id === selected);
  React.useEffect(() => {
    if (stale) setTabCategory(tab, null);
  }, [stale, tab, setTabCategory]);

  if (options.length < 2) return null;

  const chips = [{ id: null, name: "All", color: "" }, ...options];
  return (
    <div
      role="toolbar"
      aria-label="Filter by category"
      className="flex gap-1.5 overflow-x-auto border-b px-3 py-2 scrollbar-none"
    >
      {chips.map((chip) => {
        const active = (selected ?? null) === chip.id;
        return (
          <button
            key={chip.id ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={(event) => {
              event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
              setTabCategory(tab, chip.id);
            }}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {chip.color && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: chip.color }}
                aria-hidden
              />
            )}
            {chip.name}
          </button>
        );
      })}
    </div>
  );
}
