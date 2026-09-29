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

// Newsletter platforms that publish every issue as RSS.
const NEWSLETTER_HOSTS =
  /(^|\.)(substack\.com|beehiiv\.com|buttondown\.(email|com)|ghost\.io|kit\.com|convertkit\.com|mailchimp\.com|revue\.co)$/i;

export function isNewsletterUrl(url: string): boolean {
  try {
    return NEWSLETTER_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function feedTypeForUrl(feedUrl: string): FeedType {
  if (isYouTubeFeedUrl(feedUrl)) return "youtube";
  return isNewsletterUrl(feedUrl) ? "newsletter" : "rss";
}

/** Resolves a pasted URL (site, feed, or YouTube channel/video) to a feed. */
export async function resolveSource(input: string): Promise<ResolvedSource> {
  const url = normalizeInputUrl(input);

  if (isYouTubeUrl(url)) {
    const { feedUrl, avatarUrl } = await resolveYouTubeChannel(url);
    return { feedUrl, type: "youtube", faviconUrl: avatarUrl };
  }

  const feedUrl = await discoverFeedUrl(url);
  return { feedUrl, type: feedTypeForUrl(feedUrl) };
}
