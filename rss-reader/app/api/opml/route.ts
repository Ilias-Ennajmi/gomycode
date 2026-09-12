import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOpml, parseOpml } from "@/lib/opml";
import { fetchAndParseFeed } from "@/lib/rss";
import { discoverFaviconUrl } from "@/lib/favicon";

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

    const categoryCache = new Map<string, string>();
    let imported = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        const existing = await prisma.feed.findUnique({ where: { url: entry.xmlUrl } });
        if (existing) continue;

        let categoryId: string | undefined;
        if (entry.category) {
          if (categoryCache.has(entry.category)) {
            categoryId = categoryCache.get(entry.category);
          } else {
            const category =
              (await prisma.category.findFirst({ where: { name: entry.category } })) ??
              (await prisma.category.create({ data: { name: entry.category } }));
            categoryId = category.id;
            categoryCache.set(entry.category, category.id);
          }
        }

        let title = entry.title;
        let siteUrl = entry.htmlUrl;
        let description: string | undefined;
        let coverUrl: string | undefined;

        try {
          const parsed = await fetchAndParseFeed(entry.xmlUrl);
          title = parsed.meta.title || title;
          siteUrl = parsed.meta.siteUrl || siteUrl;
          description = parsed.meta.description;
          coverUrl = parsed.meta.coverUrl;
        } catch {
          // Keep OPML-provided metadata if the feed can't be fetched right now.
        }

        const faviconUrl = await discoverFaviconUrl(siteUrl || entry.xmlUrl).catch(
          () => undefined
        );

        await prisma.feed.create({
          data: {
            title,
            url: entry.xmlUrl,
            siteUrl,
            description,
            coverUrl,
            faviconUrl,
            categoryId,
            lastFetched: new Date(),
          },
        });
        imported += 1;
      } catch (error) {
        console.error(`Failed to import feed ${entry.xmlUrl}`, error);
        errors.push(entry.title);
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (error) {
    console.error("POST /api/opml failed", error);
    return NextResponse.json({ error: "Failed to import OPML file" }, { status: 500 });
  }
}
