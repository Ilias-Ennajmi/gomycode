"use client";

import useSWR from "swr";

export interface AiStatus {
  enabled: boolean;
  learnedFrom: number;
  analyzed: number;
  topics: number;
}

export interface DigestItem {
  articleId: string;
  headline: string;
  blurb: string;
  sources: string[];
}

export interface Digest {
  date: string;
  intro: string;
  items: DigestItem[];
}

export function useAiStatus() {
  const { data } = useSWR<AiStatus>("/api/ai", { refreshInterval: 10 * 60 * 1000 });
  return data;
}

export function useDigest(enabled: boolean) {
  const { data, isLoading } = useSWR<{ enabled: boolean; digest: Digest | null }>(
    enabled ? "/api/digest" : null,
    { revalidateOnFocus: false }
  );
  return { digest: data?.digest ?? null, isLoading };
}

/** Cached server-side after the first request, so reopening an article is free. */
export function useArticleSummary(articleId: string | null, enabled: boolean) {
  const { data, error, isLoading } = useSWR<{ summary: string | null; reason?: string }>(
    articleId && enabled ? `/api/articles/${articleId}/summary` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return { summary: data?.summary ?? null, isLoading, failed: Boolean(error) };
}
