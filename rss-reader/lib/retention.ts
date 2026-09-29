// How long articles are kept. About a thousand arrive each day, mostly from News outlets, and
// the free database has 500 MB, so news goes after two weeks and everything else after two
// months. Saved, archived, snoozed and highlighted articles are always kept (see
// cleanupArticles in lib/maintenance.ts).

export const DAY_MS = 24 * 60 * 60 * 1000;

export const NEWS_RETENTION_DAYS = 14;
export const RETENTION_DAYS = 60;

/** Each feed keeps at least this many of its newest articles, however old. */
export const KEEP_PER_FEED = 10;

export function retentionDays(newsDesk: string | null) {
  return newsDesk ? NEWS_RETENTION_DAYS : RETENTION_DAYS;
}
