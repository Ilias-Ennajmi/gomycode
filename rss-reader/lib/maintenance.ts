import { prisma } from "@/lib/prisma";
import { sqlName } from "@/lib/db";
import { mapWithConcurrency } from "@/lib/ingest";
import { readSetting, writeSetting } from "@/lib/push";
import { DAY_MS, KEEP_PER_FEED, NEWS_RETENTION_DAYS, RETENTION_DAYS } from "@/lib/retention";

// Housekeeping that runs after each refresh: pictures for articles whose feed has none,
// once a day the retention cleanup, and removing articles stored twice.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Deletes articles past the retention window (see lib/retention.ts). Returns how many. */
export async function cleanupArticles() {
  const Article = sqlName("Article");
  const Feed = sqlName("Feed");
  const Highlight = sqlName("Highlight");
  return prisma.$executeRaw`
    DELETE FROM ${Article} a
    USING ${Feed} f
    WHERE a."feedId" = f.id
      AND f.type <> 'manual'
      AND a."isSaved" = false
      AND a."archivedAt" IS NULL
      AND a."snoozedUntil" IS NULL
      AND a."createdAt" < now() - interval '1 day'
      AND a."publishedAt" < now() - make_interval(days =>
            CASE WHEN f."newsDesk" IS NOT NULL THEN ${NEWS_RETENTION_DAYS}::int
                 ELSE ${RETENTION_DAYS}::int END)
      AND NOT EXISTS (SELECT 1 FROM ${Highlight} h WHERE h."articleId" = a.id)
      AND a.id NOT IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY "feedId" ORDER BY "publishedAt" DESC) AS n
          FROM ${Article}
        ) newest
        WHERE newest.n <= ${KEEP_PER_FEED}
      )`;
}

/**
 * Keeps one copy of an article stored by two feeds (same link). The copy you saved,
 * highlighted or read wins, then the oldest.
 */
export async function removeDuplicateArticles() {
  const Article = sqlName("Article");
  const Highlight = sqlName("Highlight");
  return prisma.$executeRaw`
    DELETE FROM ${Article} a
    USING (
      SELECT id, row_number() OVER (
        PARTITION BY link
        ORDER BY "isSaved" DESC,
                 EXISTS (SELECT 1 FROM ${Highlight} h WHERE h."articleId" = x.id) DESC,
                 "isRead" DESC, "createdAt" ASC, id ASC
      ) AS n
      FROM ${Article} x
      WHERE link IN (SELECT link FROM ${Article} GROUP BY link HAVING count(*) > 1)
    ) ranked
    WHERE a.id = ranked.id
      AND ranked.n > 1
      AND a."isSaved" = false
      AND NOT EXISTS (SELECT 1 FROM ${Highlight} h WHERE h."articleId" = a.id)`;
}

/** Articles dated in the future (a feed with a wrong time zone) move to when they arrived. */
export async function fixFutureDates() {
  return prisma.$executeRaw`
    UPDATE ${sqlName("Article")}
    SET "publishedAt" = LEAST("createdAt", now())
    WHERE "publishedAt" > now() + interval '5 minutes'`;
}

const IMAGE_META =
  /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi;

function contentOf(tag: string) {
  return tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? null;
}

/** The share picture (og:image / twitter:image) a page declares, if any. */
export async function pageImage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  const html = await res.text();
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html.slice(0, 200_000);
  for (const match of Array.from(head.matchAll(IMAGE_META))) {
    const value = contentOf(match[0])?.replace(/&amp;/g, "&");
    if (!value) continue;
    try {
      const absolute = new URL(value, res.url || url);
      if (absolute.protocol === "http:") absolute.protocol = "https:";
      if (absolute.protocol === "https:") return absolute.toString();
    } catch {
      // Not a URL: try the next tag.
    }
  }
  return null;
}

const IMAGE_BATCH = 36;
const IMAGE_CONCURRENCY = 8;

/**
 * Many news feeds send no pictures. Recent articles without one get their page's share
 * picture, News first. A picture the site uses for everything (its logo) is ignored.
 */
export async function fillMissingImages(deadline: number) {
  const candidates = await prisma.article.findMany({
    where: {
      imageUrl: null,
      imageCheckedAt: null,
      isVideo: false,
      createdAt: { gte: new Date(Date.now() - 3 * DAY_MS) },
      feed: { type: { in: ["rss", "newsletter"] } },
    },
    orderBy: [{ feed: { newsDesk: { sort: "asc", nulls: "last" } } }, { publishedAt: "desc" }],
    take: IMAGE_BATCH,
    select: { id: true, link: true, feedId: true },
  });
  if (candidates.length === 0) return 0;

  const found = await mapWithConcurrency(candidates, IMAGE_CONCURRENCY, async (article) => {
    if (Date.now() > deadline) return { article, image: null, tried: false };
    const image = await pageImage(article.link).catch(() => null);
    return { article, image, tried: true };
  });

  // The same picture on several articles of one feed is a logo, not a photo.
  const perFeed = new Map<string, number>();
  for (const { article, image } of found) {
    if (image)
      perFeed.set(
        `${article.feedId} ${image}`,
        (perFeed.get(`${article.feedId} ${image}`) ?? 0) + 1
      );
  }
  const withImage = found.filter((f) => f.image);
  const reused = withImage.length
    ? await prisma.article.groupBy({
        by: ["feedId", "imageUrl"],
        where: {
          OR: withImage.map(({ article, image }) => ({ feedId: article.feedId, imageUrl: image })),
        },
        _count: { _all: true },
      })
    : [];
  for (const row of reused) {
    const key = `${row.feedId} ${row.imageUrl}`;
    perFeed.set(key, (perFeed.get(key) ?? 0) + row._count._all);
  }

  let filled = 0;
  const now = new Date();
  for (const { article, image, tried } of found) {
    if (!tried) continue;
    const keep = image && (perFeed.get(`${article.feedId} ${image}`) ?? 0) < 2;
    await prisma.article.update({
      where: { id: article.id },
      data: { imageCheckedAt: now, ...(keep ? { imageUrl: image } : {}) },
    });
    if (keep) filled++;
  }
  return filled;
}

interface CleanupState {
  day: string;
}

/** Runs after a refresh. The cleanup itself runs at most once a day. */
export async function runMaintenance(deadline: number) {
  const result = { images: 0, deleted: 0, duplicates: 0, redated: 0 };
  try {
    result.redated = await fixFutureDates();
    result.duplicates = await removeDuplicateArticles();
    const today = new Date().toISOString().slice(0, 10);
    const state = await readSetting<CleanupState>("cleanup", { day: "" });
    if (state.day !== today) {
      result.deleted = await cleanupArticles();
      await writeSetting("cleanup", { day: today });
    }
    result.images = await fillMissingImages(deadline);
  } catch (error) {
    // Housekeeping must never fail a refresh.
    console.error("Maintenance failed", error);
  }
  return result;
}
