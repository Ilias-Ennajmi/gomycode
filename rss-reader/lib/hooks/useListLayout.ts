"use client";

import * as React from "react";

export type ListLayout = "list" | "cards" | "magazine";

// For You and News open as a magazine; YouTube as a wall of thumbnails.
const DEFAULTS: Record<string, ListLayout> = {
  youtube: "cards",
  foryou: "magazine",
  news: "magazine",
};

function storageKey(listKey: string) {
  return `reader-layout:${listKey}`;
}

/** List, big-picture cards or magazine, remembered per tab on this device. */
export function useListLayout(listKey: string) {
  const [layout, setLayoutState] = React.useState<ListLayout>(DEFAULTS[listKey] ?? "list");

  React.useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey(listKey));
    } catch {
      // Storage unavailable: keep the default.
    }
    setLayoutState(
      saved === "cards" || saved === "list" || saved === "magazine"
        ? saved
        : (DEFAULTS[listKey] ?? "list")
    );
  }, [listKey]);

  const setLayout = React.useCallback(
    (next: ListLayout) => {
      setLayoutState(next);
      try {
        localStorage.setItem(storageKey(listKey), next);
      } catch {
        // Not remembered, still applied.
      }
    },
    [listKey]
  );

  return { layout, setLayout };
}
