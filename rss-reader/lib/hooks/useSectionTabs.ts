"use client";

import * as React from "react";
import { requestAppEvent } from "@/lib/app-events";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { useCounts } from "@/lib/hooks/useArticles";
import { useReaderState, type ViewState, type ViewType } from "@/lib/hooks/useReaderState";

// The sections of the app (For You, News, RSS…) as tabs: the order and the hidden ones from
// Settings → Personalise, pinned categories after them, which one is active, and which have
// something new. Shared by the top bar (desktop) and the bottom bar (phones).

export const SECTION_TABS: ViewState[] = [
  { type: "foryou", label: "For You" },
  { type: "news", label: "News" },
  { type: "rss", label: "RSS" },
  { type: "youtube", label: "YouTube" },
  { type: "newsletters", label: "Newsletters" },
  { type: "podcasts", label: "Podcasts" },
  { type: "later", label: "Later" },
];

const SEEN_KEY = "reader-tab-seen";

/** For each tab: is there more unread than when it was last open? Remembered on this device. */
function useNewSinceLastLook(unread: Partial<Record<ViewType, number>>, active: ViewType | null) {
  const [seen, setSeen] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}"));
    } catch {
      // Not remembered: no dots until this visit has looked at each tab.
    }
  }, []);

  // The key of the unread counts, so effects run when they change, not on every render.
  const signature = Object.entries(unread)
    .map(([tab, count]) => `${tab}:${count ?? 0}`)
    .join(",");
  React.useEffect(() => {
    setSeen((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const [tab, count] of Object.entries(unread)) {
        const current = count ?? 0;
        // Open now, or first time seen, or fewer than before (read some): that's the new baseline.
        if (tab === active || next[tab] === undefined || current < next[tab]) {
          if (next[tab] !== current) {
            next[tab] = current;
            changed = true;
          }
        }
      }
      if (!changed) return previous;
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // Fine: dots just reset next time.
      }
      return next;
    });
    // `signature` stands for `unread`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, active]);

  return React.useCallback(
    (tab: ViewType) => (unread[tab] ?? 0) > (seen[tab] ?? Number.POSITIVE_INFINITY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, seen]
  );
}

export function tabKey(tab: { type: ViewType; id?: string }) {
  return `${tab.type}:${tab.id ?? ""}`;
}

export function shortCount(n: number) {
  return n > 99 ? "99+" : String(n);
}

export function useSectionTabs() {
  const { view, setView, mobilePane, setMobilePane } = useReaderState();
  const { feeds } = useFeeds();
  const { categories } = useCategories();
  const { personal } = usePersonal();
  const counts = useCounts();
  const laterCount = counts.later;

  // The bar as personalised: built-in tabs in the chosen order minus the hidden ones, then
  // any categories pinned as tabs.
  const tabs = React.useMemo<ViewState[]>(
    () => [
      ...personal.tabs
        .filter((type) => !personal.hiddenTabs.includes(type))
        .map((type) => SECTION_TABS.find((tab) => tab.type === type)!)
        .filter(Boolean),
      ...personal.pinnedCategories
        .map((id) => categories.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ type: "category" as const, id: c.id, label: c.name })),
    ],
    [personal.tabs, personal.hiddenTabs, personal.pinnedCategories, categories]
  );

  // Unread per tab, so it's clear where something new is waiting.
  const unread: Partial<Record<ViewType, number>> = {
    news: counts.news,
    rss: counts.rss,
    youtube: counts.youtube,
    newsletters: counts.newsletters,
    podcasts: counts.podcasts,
  };

  // A single feed belongs to the tab for its kind of source.
  function activeType(): ViewType | null {
    if (mobilePane === "settings") return null;
    // The briefing and the recap are reached from For You.
    if (view.type === "briefing" || view.type === "recap") return "foryou";
    if (view.type === "category") return "category";
    if (view.type !== "feed") return tabs.some((t) => t.type === view.type) ? view.type : null;
    const feed = feeds.find((f) => f.id === view.id);
    if (feed?.newsDesk) return "news";
    return feed?.type === "youtube"
      ? "youtube"
      : feed?.type === "newsletter"
        ? "newsletters"
        : feed?.type === "podcast"
          ? "podcasts"
          : "rss";
  }
  const activeTypeValue = activeType();
  // A pinned category lights its own tab; another category lights nothing.
  const active =
    activeTypeValue === "category"
      ? tabs.some((t) => t.type === "category" && t.id === view.id)
        ? tabKey({ type: "category", id: view.id })
        : null
      : activeTypeValue
        ? tabKey({ type: activeTypeValue })
        : null;
  // A dot on a tab says "something new since you last looked", not a count that never goes
  // away: each tab remembers how many unread it had when it was last open.
  const hasNew = useNewSinceLastLook(
    unread,
    activeTypeValue === "category" ? null : activeTypeValue
  );

  const select = React.useCallback(
    (tab: ViewState) => {
      // From a section list inside News, the tab goes back to the front page.
      if (
        mobilePane !== "settings" &&
        mobilePane !== "sidebar" &&
        view.type === tab.type &&
        view.id === tab.id &&
        !(tab.type === "news" && view.id)
      ) {
        // Tapping the tab you're on goes back to the top, like a native app.
        setMobilePane("list");
        requestAppEvent("scroll-top");
      } else setView(tab);
    },
    [mobilePane, setMobilePane, setView, view.id, view.type]
  );

  return { tabs, active, select, hasNew, laterCount, unread, view };
}
