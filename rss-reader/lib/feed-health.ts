import type { FeedSummary } from "@/lib/types";

// A source needs attention when it keeps failing to load, or when it hasn't posted for a
// month (dead blogs, abandoned channels).

export const QUIET_DAYS = 30;
export const FAILING_ERRORS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FeedHealth = "failing" | "quiet" | "ok";

export function healthOf(
  feed: Pick<FeedSummary, "errorCount" | "lastPublished" | "createdAt">
): FeedHealth {
  if (feed.errorCount >= FAILING_ERRORS) return "failing";
  // A feed followed recently hasn't had time to go quiet.
  const since = feed.lastPublished ?? feed.createdAt;
  if (Date.now() - new Date(since).getTime() > QUIET_DAYS * DAY_MS) return "quiet";
  return "ok";
}

export function needingAttention(feeds: FeedSummary[]) {
  return feeds.filter((feed) => healthOf(feed) !== "ok");
}
