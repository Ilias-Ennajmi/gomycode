"use client";

import useSWR, { mutate as globalMutate } from "swr";
import useSWRInfinite from "swr/infinite";
import { useMemo } from "react";
import type { HighlightColor, HighlightSummary } from "@/lib/types";

/** One article's highlights, for the reader. */
export function useArticleHighlights(articleId: string | null | undefined) {
  const { data, mutate } = useSWR<{ highlights: HighlightSummary[] }>(
    articleId ? `/api/highlights?articleId=${encodeURIComponent(articleId)}` : null
  );
  return { highlights: data?.highlights ?? [], mutate };
}

interface HighlightPage {
  highlights: HighlightSummary[];
  total: number;
  hasMore: boolean;
}

/** Every highlight, newest first, for the Highlights tab. */
export function useHighlightList(search: string, color: HighlightColor | null) {
  const { data, isLoading, size, setSize, mutate } = useSWRInfinite<HighlightPage>(
    (index, previous) => {
      if (previous && !previous.hasMore) return null;
      const params = new URLSearchParams({ page: String(index + 1) });
      if (search.trim()) params.set("search", search.trim());
      if (color) params.set("color", color);
      return `/api/highlights?${params}`;
    }
  );
  const highlights = useMemo(() => data?.flatMap((page) => page.highlights) ?? [], [data]);
  return {
    highlights,
    total: data?.[0]?.total ?? 0,
    hasMore: Boolean(data?.[data.length - 1]?.hasMore),
    isLoading,
    loadMore: () => setSize(size + 1),
    mutate,
  };
}

/** Highlights show up in the reader, the Highlights tab and highlight counts in lists. */
function refreshEverywhere() {
  return globalMutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith("/api/highlights") || key.startsWith("/api/articles"))
  );
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json as T;
}

export async function createHighlight(input: {
  articleId: string;
  text: string;
  prefix: string;
  suffix: string;
  color: HighlightColor;
  note?: string;
}) {
  const { highlight } = await send<{ highlight: HighlightSummary }>(
    "/api/highlights",
    "POST",
    input
  );
  refreshEverywhere();
  return highlight;
}

export async function updateHighlight(
  id: string,
  changes: { note?: string | null; color?: HighlightColor }
) {
  const { highlight } = await send<{ highlight: HighlightSummary }>(
    `/api/highlights/${id}`,
    "PATCH",
    changes
  );
  refreshEverywhere();
  return highlight;
}

export async function deleteHighlight(id: string) {
  await send(`/api/highlights/${id}`, "DELETE");
  refreshEverywhere();
}
