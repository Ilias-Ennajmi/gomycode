"use client";

import * as React from "react";
import { readPref, usePref, writePref } from "@/lib/prefs";

export type ListLayout = "list" | "cards" | "magazine" | "grid";
const LAYOUTS: ListLayout[] = ["list", "cards", "magazine", "grid"];

// Articles open as rows with the picture on the left; YouTube as a wall of thumbnails;
// Podcasts as tiles. Magazine stays one tap away in the chip row.
const DEFAULTS: Record<string, ListLayout> = {
  youtube: "cards",
  podcasts: "grid",
};

const KEY = "layouts";
const EMPTY: Record<string, string> = {};
let migrated = false;

/** Layouts chosen before they were one shared pref sat under reader-layout:<tab>. */
function migrate() {
  if (migrated) return;
  migrated = true;
  try {
    const found: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("reader-layout:")) {
        found[key.slice("reader-layout:".length)] = localStorage.getItem(key) ?? "";
      }
    }
    if (Object.keys(found).length > 0) {
      writePref(KEY, { ...found, ...readPref(KEY, EMPTY) });
      for (const tab of Object.keys(found)) localStorage.removeItem(`reader-layout:${tab}`);
    }
  } catch {
    // Nothing to carry over.
  }
}

function pick(saved: Record<string, string>, listKey: string): ListLayout {
  const value = saved?.[listKey];
  return LAYOUTS.includes(value as ListLayout)
    ? (value as ListLayout)
    : (DEFAULTS[listKey] ?? "list");
}

/** List, big-picture cards, magazine or grid, remembered per tab and shared between devices. */
export function useListLayout(listKey: string) {
  React.useEffect(migrate, []);
  const [saved, setSaved] = usePref<Record<string, string>>(KEY, EMPTY);
  const layout = pick(saved, listKey);
  const setLayout = React.useCallback(
    (next: ListLayout) => setSaved((prev) => ({ ...(prev ?? {}), [listKey]: next })),
    [listKey, setSaved]
  );
  return { layout, setLayout };
}
