"use client";

import * as React from "react";
import useSWR from "swr";
import { usePref } from "@/lib/prefs";
import type { SearchScope, SearchSince } from "@/lib/types";

// Saved searches: a search worth coming back to ("from:verge is:unread", "tag:ai"), pinned
// in the sidebar with its own unread count, like a smart folder. A shared preference.

export interface SavedSearch {
  id: string;
  label: string;
  query: string;
  scope: SearchScope;
  since: SearchSince;
}

const KEY = "saved-searches";
const EMPTY: SavedSearch[] = [];

export function useSavedSearches() {
  const [raw, setRaw] = usePref<SavedSearch[]>(KEY, EMPTY);
  const searches = Array.isArray(raw) ? raw : EMPTY;
  const save = React.useCallback(
    (search: Omit<SavedSearch, "id">) =>
      setRaw((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((s) => s.query === search.query && s.scope === search.scope)) return list;
        return [...list, { ...search, id: Math.random().toString(36).slice(2, 10) }];
      }),
    [setRaw]
  );
  const remove = React.useCallback(
    (id: string) => setRaw((prev) => (Array.isArray(prev) ? prev : []).filter((s) => s.id !== id)),
    [setRaw]
  );
  const isSaved = React.useCallback(
    (query: string, scope: SearchScope) =>
      searches.some((s) => s.query.trim() === query.trim() && s.scope === scope),
    [searches]
  );
  return { searches, save, remove, isSaved };
}

const SCOPE_QUERY: Record<SearchScope, string> = {
  all: "",
  news: "&news=all",
  rss: "&source=rss",
  youtube: "&source=youtube",
  newsletter: "&source=newsletter",
  podcast: "&source=podcast",
  later: "&saved=true",
  highlights: "&highlighted=true",
};

/** How many unread articles a saved search matches now. */
export function useSavedSearchCount(search: SavedSearch) {
  const since = search.since && search.since !== "any" ? `&since=${search.since}` : "";
  const { data } = useSWR<{ total: number }>(
    `/api/articles?search=${encodeURIComponent(search.query)}&unread=true&limit=1${SCOPE_QUERY[search.scope] ?? ""}${since}`,
    { refreshInterval: 10 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  return data?.total ?? 0;
}
