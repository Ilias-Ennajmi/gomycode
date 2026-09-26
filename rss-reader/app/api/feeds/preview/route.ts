import { NextRequest, NextResponse } from "next/server";
import { fetchAndParseFeed } from "@/lib/rss";
import { discoverFaviconUrl } from "@/lib/favicon";
import { resolveSource } from "@/lib/feed-source";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const source = await resolveSource(url);
    const parsed = await fetchAndParseFeed(source.feedUrl);
    const faviconUrl =
      source.faviconUrl ??
      (await discoverFaviconUrl(parsed.meta.siteUrl || source.feedUrl).catch(() => undefined));

    return NextResponse.json({
      feedUrl: source.feedUrl,
      type: source.type,
      title: parsed.meta.title,
      description: parsed.meta.description,
      siteUrl: parsed.meta.siteUrl,
      faviconUrl,
      articleCount: parsed.articles.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not find a feed or YouTube channel at this URL" },
      { status: 422 }
    );
  }
}
