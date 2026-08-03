import { PrismaClient } from "@prisma/client";
import { fetchAndParseFeed } from "../lib/rss";
import { discoverFaviconUrl } from "../lib/favicon";

const prisma = new PrismaClient();

const SEED_FEEDS: Array<{ url: string; categoryName: string }> = [
  { url: "https://feeds.bbci.co.uk/news/rss.xml", categoryName: "News" },
  { url: "https://hnrss.org/frontpage", categoryName: "Tech" },
  { url: "https://css-tricks.com/feed/", categoryName: "Tech" },
  { url: "https://www.theverge.com/rss/index.xml", categoryName: "Tech" },
];

async function main() {
  const categoryCache = new Map<string, string>();

  for (const { url, categoryName } of SEED_FEEDS) {
    const existing = await prisma.feed.findUnique({ where: { url } });
    if (existing) {
      console.log(`Skipping ${url} — already seeded`);
      continue;
    }

    let categoryId = categoryCache.get(categoryName);
    if (!categoryId) {
      const category =
        (await prisma.category.findFirst({ where: { name: categoryName } })) ??
        (await prisma.category.create({
          data: {
            name: categoryName,
            color: categoryName === "Tech" ? "#6366f1" : "#ef4444",
          },
        }));
      categoryId = category.id;
      categoryCache.set(categoryName, categoryId);
    }

    console.log(`Fetching ${url}…`);
    try {
      const parsed = await fetchAndParseFeed(url);
      const faviconUrl = await discoverFaviconUrl(parsed.meta.siteUrl || url).catch(
        () => undefined
      );

      const feed = await prisma.feed.create({
        data: {
          title: parsed.meta.title,
          url,
          siteUrl: parsed.meta.siteUrl,
          description: parsed.meta.description,
          faviconUrl,
          coverUrl: parsed.meta.coverUrl,
          categoryId,
          lastFetched: new Date(),
        },
      });

      const uniqueArticles = Array.from(
        new Map(parsed.articles.map((article) => [article.link, article])).values()
      );

      if (uniqueArticles.length > 0) {
        await prisma.article.createMany({
          data: uniqueArticles.map((article) => ({
            feedId: feed.id,
            title: article.title,
            link: article.link,
            summary: article.summary,
            content: article.content,
            imageUrl: article.imageUrl,
            author: article.author,
            publishedAt: article.publishedAt,
          })),
        });
      }

      console.log(`Added ${feed.title} (${parsed.articles.length} articles)`);
    } catch (error) {
      console.error(`Failed to seed ${url}`, error);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
