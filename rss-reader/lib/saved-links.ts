import { prisma } from "@/lib/prisma";

export const SAVED_LINKS_URL = "manual://saved-links";

/** The hidden feed that holds links saved by hand, and saved articles of unfollowed sources. */
export async function savedLinksFeed() {
  return prisma.feed.upsert({
    where: { url: SAVED_LINKS_URL },
    update: {},
    create: { url: SAVED_LINKS_URL, title: "Saved links", type: "manual" },
  });
}

/**
 * Before a source is unfollowed (which deletes its articles), moves the ones worth keeping,
 * saved to Later or highlighted, to Saved links. The source's name stays on them as author.
 */
export async function keepSavedArticles(feedId: string) {
  const [feed, keep] = await Promise.all([
    prisma.feed.findUnique({ where: { id: feedId }, select: { title: true } }),
    prisma.article.findMany({
      where: { feedId, OR: [{ isSaved: true }, { highlights: { some: {} } }] },
      select: { id: true, author: true },
    }),
  ]);
  if (!feed || keep.length === 0) return 0;
  const target = await savedLinksFeed();
  let moved = 0;
  for (const article of keep) {
    try {
      await prisma.article.update({
        where: { id: article.id },
        data: { feedId: target.id, author: article.author ?? feed.title },
      });
      moved++;
    } catch {
      // The same link is already in Saved links: that copy stays, this one goes.
    }
  }
  return moved;
}
