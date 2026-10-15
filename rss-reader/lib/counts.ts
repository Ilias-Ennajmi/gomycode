import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { getVideoPrefs } from "@/lib/video-prefs";
import { newsFilter, notSnoozed, sourceFilter } from "@/lib/articles";

/**
 * Every number the app shows on tabs and in the sidebar, in one go. They used to be a request
 * each (ten on opening); the filters (hidden words, muted sources, snoozed) are read once and
 * shared by all the counts.
 */
export async function allCounts() {
  const [rules, prefs] = await Promise.all([getFilterRules(), getVideoPrefs()]);
  const now = new Date();
  const visible: Prisma.ArticleWhereInput[] = [
    ...hiddenArticleClauses(rules),
    ...(prefs.hideShorts ? [{ isShort: false }] : []),
  ];
  // `where.AND` holds a tab's own filter; the shared ones are added to it, not over it.
  const count = (where: Prisma.ArticleWhereInput, { snoozed = false } = {}) => {
    const own = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    return prisma.article.count({
      where: { ...where, AND: [...own, ...visible, ...(snoozed ? [] : [notSnoozed(now)])] },
    });
  };

  const [
    news,
    rss,
    youtube,
    newsletters,
    podcasts,
    later,
    snoozed,
    today,
    alerts,
    unread,
    listening,
  ] = await Promise.all([
    count({ isRead: false, AND: [newsFilter("all")] }),
    count({ isRead: false, AND: [sourceFilter("rss")] }),
    count({ isRead: false, AND: [sourceFilter("youtube")] }),
    count({ isRead: false, AND: [sourceFilter("newsletter")] }),
    count({ isRead: false, AND: [sourceFilter("podcast")] }),
    count({ isSaved: true, archivedAt: null }),
    count({ snoozedUntil: { gt: now } }, { snoozed: true }),
    count({ publishedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }),
    count({ alertedAt: { not: null }, isRead: false }),
    count({ isRead: false }),
    count({ AND: [sourceFilter("podcast")], watchedSeconds: { gt: 0 }, isRead: false }),
  ]);
  return {
    news,
    rss,
    youtube,
    newsletters,
    podcasts,
    later,
    snoozed,
    today,
    alerts,
    unread,
    listening,
  };
}

export type Counts = Awaited<ReturnType<typeof allCounts>>;
