"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import type { DiscoverResult } from "@/lib/discover/providers";
import type { Language } from "@/lib/discover/catalog";

export type { DiscoverResult };

export interface CatalogItem extends DiscoverResult {
  id: string;
  categoryId: string;
}

const LANGS_KEY = "discover-langs";
const ALL_LANGS: Language[] = ["en", "fr"];
const listeners = new Set<() => void>();

function readLangs(): Language[] {
  try {
    const stored = JSON.parse(localStorage.getItem(LANGS_KEY) ?? "null") as Language[] | null;
    const valid = stored?.filter((l) => ALL_LANGS.includes(l));
    return valid && valid.length > 0 ? valid : ALL_LANGS;
  } catch {
    return ALL_LANGS;
  }
}

let cachedLangs: Language[] | null = null;
function snapshot() {
  if (!cachedLangs) cachedLangs = readLangs();
  return cachedLangs;
}

/** The languages chosen in Discover, remembered on this device. */
export function useDiscoverLangs() {
  const langs = React.useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    snapshot,
    () => ALL_LANGS
  );

  const toggle = React.useCallback((lang: Language) => {
    const current = snapshot();
    const next = current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang];
    if (next.length === 0) return; // Keep at least one language.
    cachedLangs = ALL_LANGS.filter((l) => next.includes(l));
    try {
      localStorage.setItem(LANGS_KEY, JSON.stringify(cachedLangs));
    } catch {
      // Private mode: the choice lasts until reload.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { langs, toggle };
}

export function useCatalog(langs: Language[]) {
  const { data, isLoading, mutate } = useSWR<{
    categories: { id: string; name: string }[];
    entries: CatalogItem[];
  }>(`/api/discover/catalog?langs=${langs.join(",")}`, { revalidateOnFocus: false });
  return {
    categories: data?.categories ?? [],
    entries: data?.entries ?? [],
    isLoading,
    mutate,
  };
}

export function useDiscoverSearch(query: string, langs: Language[]) {
  const [debounced, setDebounced] = React.useState(query);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const key =
    debounced.length >= 2
      ? `/api/discover/search?q=${encodeURIComponent(debounced)}&langs=${langs.join(",")}`
      : null;
  const { data, isLoading, mutate } = useSWR<{ results: DiscoverResult[]; unavailable: string[] }>(
    key,
    { revalidateOnFocus: false, keepPreviousData: true }
  );
  return {
    results: key ? (data?.results ?? []) : [],
    unavailable: data?.unavailable ?? [],
    isLoading: Boolean(key) && isLoading,
    isPending: query.trim() !== debounced,
    mutate,
  };
}

/** "Because you follow X" (with a feed id) or "Suggested for you" (without). */
export function useSuggestions(
  feedId: string | null | undefined,
  langs: Language[],
  enabled = true
) {
  const params = new URLSearchParams({ langs: langs.join(",") });
  if (feedId) params.set("feedId", feedId);
  const { data, isLoading, mutate } = useSWR<{ results: DiscoverResult[] }>(
    enabled ? `/api/discover/suggest?${params}` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return { results: data?.results ?? [], isLoading, mutate };
}

export async function describeInterests(description: string, langs: Language[]) {
  const res = await fetch("/api/discover/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, langs: langs.join(",") }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not get suggestions right now");
  return body.results as DiscoverResult[];
}

export interface FollowResult {
  url: string;
  ok: boolean;
  feedId?: string;
  title?: string;
  existed?: boolean;
  error?: string;
}

/** Follows sources and refreshes everything that lists feeds or articles. */
export function useFollow() {
  const { mutate } = useSWRConfig();
  return React.useCallback(
    async (items: DiscoverResult[]): Promise<FollowResult[]> => {
      const res = await fetch("/api/discover/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            url: item.url,
            kind: item.kind,
            lang: item.lang,
            category: item.category,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not follow");
      await mutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith("/api/feeds") ||
            key.startsWith("/api/categories") ||
            key.startsWith("/api/articles") ||
            // Suggestions call the AI, so they aren't refetched on every follow.
            key.startsWith("/api/discover/catalog"))
      );
      return body.results as FollowResult[];
    },
    [mutate]
  );
}
