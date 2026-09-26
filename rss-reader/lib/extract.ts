import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ExtractedPage {
  title: string;
  content: string | null;
  excerpt: string | null;
  author: string | null;
  siteName: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
}

function meta(document: Document, ...names: string[]) {
  for (const name of names) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ??
      document.querySelector(`meta[name="${name}"]`);
    const value = el?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return null;
}

/** The first real paragraph of extracted HTML, skipping bylines and captions. */
function firstParagraph(html: string | null | undefined) {
  for (const match of Array.from((html ?? "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))) {
    const text = match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 80) return text.slice(0, 240);
  }
  return null;
}

/**
 * Downloads a web page and pulls out the readable article, like Reader mode.
 * Pages that block bots or aren't articles still return a title from the URL.
 */
export async function extractPage(url: string): Promise<ExtractedPage> {
  const fallback: ExtractedPage = {
    title: new URL(url).hostname.replace(/^www\./, ""),
    content: null,
    excerpt: null,
    author: null,
    siteName: null,
    imageUrl: null,
    publishedAt: null,
  };

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return fallback;

  const html = await res.text();
  const { document } = parseHTML(html);
  const base = document.createElement("base");
  base.setAttribute("href", res.url || url);
  document.head?.prepend(base);

  const imageUrl = meta(document, "og:image", "twitter:image");
  const published = meta(document, "article:published_time", "og:published_time", "date");
  const publishedAt =
    published && !Number.isNaN(Date.parse(published)) ? new Date(published) : null;
  const metaTitle = meta(document, "og:title", "twitter:title") ?? document.title?.trim();

  const article = new Readability(document as unknown as Document).parse();
  const author = article?.byline?.trim() || meta(document, "author", "article:author");
  // Readability's excerpt is often just the byline; prefer the page's own blurb.
  const readabilityExcerpt = article?.excerpt?.trim();
  const excerpt =
    meta(document, "og:description", "description", "twitter:description") ??
    (readabilityExcerpt && !readabilityExcerpt.includes(author ?? "\u0000")
      ? readabilityExcerpt
      : null) ??
    firstParagraph(article?.content);
  return {
    title: article?.title?.trim() || metaTitle || fallback.title,
    content: article?.content ?? null,
    excerpt,
    author,
    siteName: article?.siteName?.trim() || meta(document, "og:site_name"),
    imageUrl: imageUrl ? new URL(imageUrl, res.url || url).toString() : null,
    publishedAt,
  };
}
