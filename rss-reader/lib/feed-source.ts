import type { FeedType } from "@prisma/client";
import { discoverFeedUrl } from "@/lib/rss";
import { isYouTubeFeedUrl, isYouTubeUrl, resolveYouTubeChannel } from "@/lib/youtube";

export interface ResolvedSource {
  feedUrl: string;
  type: FeedType;
  faviconUrl?: string;
}

/** Accepts "example.com/blog" as well as full URLs. */
export function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function feedTypeForUrl(feedUrl: string): FeedType {
  return isYouTubeFeedUrl(feedUrl) ? "youtube" : "rss";
}

/** Resolves a pasted URL (site, feed, or YouTube channel/video) to a feed. */
export async function resolveSource(input: string): Promise<ResolvedSource> {
  const url = normalizeInputUrl(input);

  if (isYouTubeUrl(url)) {
    const { feedUrl, avatarUrl } = await resolveYouTubeChannel(url);
    return { feedUrl, type: "youtube", faviconUrl: avatarUrl };
  }

  return { feedUrl: await discoverFeedUrl(url), type: "rss" };
}
