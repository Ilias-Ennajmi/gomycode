"use client";

import * as React from "react";
import { useSWRConfig } from "swr";

// Instant open: the lists, counts and feeds the app showed last time are restored from
// localStorage right after the first paint (not during it, or the server-rendered page
// wouldn't match), then revalidated. Only the first page of a list and the small shared
// documents are kept, so the store stays well under a megabyte.

const KEY = "swr-cache";
const KEEP = [
  // A list's first page: the page itself, and the infinite-list entry that points at it.
  /^(\$inf\$)?\/api\/articles\?[^#]*page=1(&|$)/,
  /^\/api\/articles\/counts$/,
  /^\/api\/feeds$/,
  /^\/api\/categories$/,
  /^\/api\/digest$/,
  /^\/api\/home$/,
  /^\/api\/review$/,
  /^\/api\/ai$/,
];
const MAX_BYTES = 900_000;

function keep(key: unknown): key is string {
  return typeof key === "string" && KEEP.some((pattern) => pattern.test(key));
}

/** Mount once inside SWRConfig: restores last time's data, saves it when the page is hidden. */
export function SwrPersistence() {
  const { cache, mutate } = useSWRConfig();

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]") as [string, unknown][];
      for (const [key, data] of saved) {
        // Only where nothing has arrived yet; the network answer wins when it comes.
        if (keep(key) && cache.get(key)?.data === undefined) {
          void mutate(key, data, { revalidate: false, populateCache: true });
        }
      }
    } catch {
      // Nothing restored: the network fills it.
    }

    const save = () => {
      try {
        const entries: [string, unknown][] = [];
        let size = 0;
        for (const key of Array.from(cache.keys())) {
          if (!keep(key)) continue;
          const data = cache.get(key)?.data;
          if (data === undefined) continue;
          // An infinite list holds every page loaded; one is enough to open on.
          const entry: [string, unknown] = [
            key,
            key.startsWith("$inf$") && Array.isArray(data) ? data.slice(0, 1) : data,
          ];
          size += JSON.stringify(entry).length;
          if (size > MAX_BYTES) break;
          entries.push(entry);
        }
        localStorage.setItem(KEY, JSON.stringify(entries));
      } catch {
        // Quota or private mode: fine.
      }
    };
    const onVisibility = () => document.hidden && save();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    // Also every couple of minutes while the app is open, in case the tab is killed.
    const timer = window.setInterval(save, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      window.clearInterval(timer);
    };
  }, [cache, mutate]);

  return null;
}
