import { prisma } from "@/lib/prisma";

// Sources followed for two months without a single article read, saved or highlighted in
// that time: candidates to unfollow, so the lists stay about what's actually read.

export const UNUSED_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function unusedSourceIds() {
  const since = new Date(Date.now() - UNUSED_DAYS * DAY_MS);
  const [feeds, engaged, highlighted] = await Promise.all([
    prisma.feed.findMany({
      where: { type: { not: "manual" }, createdAt: { lt: since } },
      select: { id: true },
    }),
    prisma.article.groupBy({
      by: ["feedId"],
      where: { OR: [{ readAt: { gte: since } }, { savedAt: { gte: since } }] },
    }),
    prisma.highlight.findMany({
      where: { createdAt: { gte: since } },
      select: { article: { select: { feedId: true } } },
      distinct: ["articleId"],
    }),
  ]);
  const used = new Set([
    ...engaged.map((row) => row.feedId),
    ...highlighted.map((row) => row.article.feedId),
  ]);
  return feeds.map((feed) => feed.id).filter((id) => !used.has(id));
}
