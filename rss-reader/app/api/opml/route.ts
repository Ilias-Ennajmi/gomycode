import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOpml, parseOpml } from "@/lib/opml";
import { fetchAndParseFeed, type ParsedFeed } from "@/lib/rss";
import { discoverFaviconUrl } from "@/lib/favicon";
import { feedTypeForUrl } from "@/lib/feed-source";
import { insertNewArticles, mapWithConcurrency } from "@/lib/ingest";

export const maxDuration = 60;

export async function GET() {
  try {
    const feeds = await prisma.feed.findMany({
      include: { category: { select: { name: true } } },
      orderBy: { title: "asc" },
    });

    const opml = generateOpml(
      feeds.map((feed) => ({
        title: feed.title,
        url: feed.url,
        siteUrl: feed.siteUrl,
        categoryName: feed.category?.name,
      }))
    );

    return new NextResponse(opml, {
      headers: {
        "Content-Type": "text/x-opml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="feeds.opml"',
      },
    });
  } catch (error) {
    console.error("GET /api/opml failed", error);
    return NextResponse.json({ error: "Failed to export feeds" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "OPML file is required" }, { status: 400 });
    }

    const xml = await file.text();
    const entries = await parseOpml(xml);

    if (entries.length === 0) {
      return NextResponse.json({ error: "No feeds found in OPML file" }, { status: 400 });
    }

    // Create categories up front, sequentially, so concurrent feed imports
    // below never race to create the same one.
    const categoryIds = new Map<string, string>();
    const categoryNames = Array.from(
      new Set(entries.map((e) => e.category).filter((c): c is string => Boolean(c)))
    );
    for (const name of categoryNames) {
      const category =
        (await prisma.category.findFirst({ where: { name } })) ??
        (await prisma.category.create({ data: { name } }));
      categoryIds.set(name, category.id);
    }

    const existingUrls = new Set(
      (await prisma.feed.findMany({ select: { url: true } })).map((f) => f.url)
    );
    const toImport = entries.filter((entry) => !existingUrls.has(entry.xmlUrl));
    const errors: string[] = [];

    const results = await mapWithConcurrency(toImport, 6, async (entry) => {
      try {
        let parsed: ParsedFeed | null = null;
        try {
          parsed = await fetchAndParseFeed(entry.xmlUrl);
        } catch {
          // Keep OPML-provided metadata if the feed can't be fetched right now.
        }

        const siteUrl = parsed?.meta.siteUrl || entry.htmlUrl;
        const faviconUrl = await discoverFaviconUrl(siteUrl || entry.xmlUrl).catch(
          () => undefined
        );

        const feed = await prisma.feed.create({
          data: {
            type: feedTypeForUrl(entry.xmlUrl),
            title: parsed?.meta.title || entry.title,
            url: entry.xmlUrl,
            siteUrl,
            description: parsed?.meta.description,
            coverUrl: parsed?.meta.coverUrl,
            faviconUrl,
            categoryId: entry.category ? categoryIds.get(entry.category) : undefined,
            lastFetched: parsed ? new Date() : null,
          },
        });
        if (parsed) await insertNewArticles(feed.id, parsed.articles);
        return true;
      } catch (error) {
        console.error(`Failed to import feed ${entry.xmlUrl}`, error);
        errors.push(entry.title);
        return false;
      }
    });

    return NextResponse.json({ imported: results.filter(Boolean).length, errors });
  } catch (error) {
    console.error("POST /api/opml failed", error);
    return NextResponse.json({ error: "Failed to import OPML file" }, { status: 500 });
  }
}
