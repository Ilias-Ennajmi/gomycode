"use client";

import * as React from "react";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { SOURCE_TAB_FEED_TYPE, useReaderState, type SourceTab } from "@/lib/hooks/useReaderState";

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

/**
 * The category chips of a source tab: only categories that have that kind of source, with
 * the one selected (a category that lost its last source falls back to none).
 */
export function useCategoryOptions(tab: SourceTab | null) {
  const { categories } = useCategories();
  const { feeds } = useFeeds();
  const { tabCategory, setTabCategory } = useReaderState();
  const selected = tab ? tabCategory[tab] : null;
  const type = tab ? SOURCE_TAB_FEED_TYPE[tab] : null;

  const options = React.useMemo(() => {
    if (!tab) return [];
    // News sources show in the News tab, not RSS.
    const tabFeeds = feeds.filter(
      (feed) => feed.type === type && !(tab === "rss" && feed.newsDesk)
    );
    const found: CategoryOption[] = categories
      .filter((category) => tabFeeds.some((feed) => feed.categoryId === category.id))
      .map((category) => ({ id: category.id, name: category.name, color: category.color }));
    if (found.length > 0 && tabFeeds.some((feed) => !feed.categoryId)) {
      found.push({ id: "none", name: "Other", color: "" });
    }
    return found;
  }, [tab, type, feeds, categories]);

  const stale =
    Boolean(selected) && categories.length > 0 && !options.some((o) => o.id === selected);
  React.useEffect(() => {
    if (tab && stale) setTabCategory(tab, null);
  }, [stale, tab, setTabCategory]);

  return {
    options: options.length < 2 ? [] : options,
    selected: selected ?? null,
    /** Tap a chip to filter; tap it again to clear. */
    toggle: (id: string) => tab && setTabCategory(tab, selected === id ? null : id),
  };
}
