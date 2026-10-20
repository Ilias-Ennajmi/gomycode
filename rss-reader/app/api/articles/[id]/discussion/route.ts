import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// The threads about an article: Hacker News (Algolia's public search) and Reddit (its
// JSON search). Both free, no keys; each fails on its own without failing the other.

export interface DiscussionThread {
  id: string;
  site: "hn" | "reddit";
  title: string;
  url: string;
  points: number;
  comments: number;
  /** Reddit: the subreddit. */
  where?: string;
  at: string | null;
}

const TIMEOUT_MS = 6000;
const TRACKING = /^(utm_|fbclid|gclid|ref$|ref_|mc_|s$|si$)/i;

/** The link without tracking noise, so threads about the same page match. */
function canonical(link: string) {
  try {
    const url = new URL(link);
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return link;
  }
}

async function hackerNews(link: string, title: string): Promise<DiscussionThread[]> {
  const byUrl = new URLSearchParams({
    query: link.replace(/^https?:\/\/(www\.)?/, ""),
    restrictSearchableAttributes: "url",
    tags: "story",
    hitsPerPage: "5",
  });
  const res = await fetch(`https://hn.algolia.com/api/v1/search?${byUrl}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HN ${res.status}`);
  let hits = ((await res.json()) as { hits?: HnHit[] }).hits ?? [];
  // Nothing by URL: the same headline, posted with another link (a mirror, a tweet).
  if (hits.length === 0 && title.length > 12) {
    const byTitle = new URLSearchParams({
      query: title,
      restrictSearchableAttributes: "title",
      tags: "story",
      hitsPerPage: "3",
    });
    const alt = await fetch(`https://hn.algolia.com/api/v1/search?${byTitle}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (alt.ok) {
      const lower = title.toLowerCase();
      hits = (((await alt.json()) as { hits?: HnHit[] }).hits ?? []).filter(
        (h) => h.title && lower.includes(h.title.toLowerCase().slice(0, 30))
      );
    }
  }
  return hits
    .filter((h) => (h.num_comments ?? 0) > 0 || (h.points ?? 0) > 2)
    .map((h) => ({
      id: `hn:${h.objectID}`,
      site: "hn" as const,
      title: h.title ?? "Hacker News thread",
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points ?? 0,
      comments: h.num_comments ?? 0,
      at: h.created_at ?? null,
    }));
}

interface HnHit {
  objectID: string;
  title?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

interface RedditChild {
  data: {
    id: string;
    title: string;
    subreddit: string;
    score: number;
    num_comments: number;
    permalink: string;
    created_utc: number;
  };
}

async function reddit(link: string): Promise<DiscussionThread[]> {
  const params = new URLSearchParams({
    q: `url:${link.replace(/^https?:\/\/(www\.)?/, "")}`,
    sort: "top",
    limit: "8",
    type: "link",
  });
  const res = await fetch(`https://www.reddit.com/search.json?${params}`, {
    headers: { "User-Agent": "Reader/1.0 (personal RSS reader; discussion lookup)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  const data = (await res.json()) as { data?: { children?: RedditChild[] } };
  return (data.data?.children ?? [])
    .map((c) => c.data)
    .filter((d) => d.num_comments > 0)
    .map((d) => ({
      id: `reddit:${d.id}`,
      site: "reddit" as const,
      title: d.title,
      url: `https://www.reddit.com${d.permalink}`,
      points: d.score,
      comments: d.num_comments,
      where: `r/${d.subreddit}`,
      at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    }));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: { link: true, title: true },
  });
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const link = canonical(article.link);
  const [hn, rd] = await Promise.all([
    hackerNews(link, article.title).catch(() => [] as DiscussionThread[]),
    reddit(link).catch(() => [] as DiscussionThread[]),
  ]);
  const threads = [...hn, ...rd].sort((a, b) => b.comments - a.comments);
  return NextResponse.json({ threads }, { headers: { "Cache-Control": "private, max-age=600" } });
}
