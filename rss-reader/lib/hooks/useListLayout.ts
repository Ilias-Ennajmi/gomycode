"use client";

import * as React from "react";

export type ListLayout = "list" | "cards";

const DEFAULTS: Record<string, ListLayout> = { youtube: "cards" };

function storageKey(listKey: string) {
  return `reader-layout:${listKey}`;
}

/** List or big-picture cards, remembered per tab on this device. YouTube starts as cards. */
export function useListLayout(listKey: string) {
  const [layout, setLayoutState] = React.useState<ListLayout>(DEFAULTS[listKey] ?? "list");

  React.useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey(listKey));
    } catch {
      // Storage unavailable: keep the default.
    }
    setLayoutState(saved === "cards" || saved === "list" ? saved : (DEFAULTS[listKey] ?? "list"));
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
