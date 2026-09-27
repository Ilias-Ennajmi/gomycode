"use client";

import type { Briefing } from "@/lib/digest";
import useSWR from "swr";

export interface AiStatus {
  enabled: boolean;
  learnedFrom: number;
  analyzed: number;
  topics: number;
}

export type { Briefing, BriefStory, BriefPick } from "@/lib/digest";

export function useAiStatus() {
  const { data } = useSWR<AiStatus>("/api/ai", { refreshInterval: 10 * 60 * 1000 });
  return data;
}

export function useBriefing(enabled: boolean) {
  const { data, isLoading, mutate } = useSWR<{ enabled: boolean; briefing: Briefing | null }>(
    enabled ? "/api/digest" : null,
    { revalidateOnFocus: false }
  );
  return { briefing: data?.briefing ?? null, isLoading, mutate };
}

/** Cached server-side after the first request, so reopening an article is free. */
export function useArticleSummary(articleId: string | null, enabled: boolean) {
  const { data, error, isLoading } = useSWR<{ summary: string | null; reason?: string }>(
    articleId && enabled ? `/api/articles/${articleId}/summary` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return { summary: data?.summary ?? null, isLoading, failed: Boolean(error) };
}
