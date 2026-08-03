import { NextRequest, NextResponse } from "next/server";
import { discoverFeedUrl, fetchAndParseFeed } from "@/lib/rss";
import { discoverFaviconUrl } from "@/lib/favicon";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const feedUrl = await discoverFeedUrl(url);
    const parsed = await fetchAndParseFeed(feedUrl);
    const faviconUrl = await discoverFaviconUrl(parsed.meta.siteUrl || feedUrl).catch(
      () => undefined
    );

    return NextResponse.json({
      feedUrl,
      title: parsed.meta.title,
      description: parsed.meta.description,
      siteUrl: parsed.meta.siteUrl,
      faviconUrl,
      articleCount: parsed.articles.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch feed — check URL" },
      { status: 422 }
    );
  }
}
