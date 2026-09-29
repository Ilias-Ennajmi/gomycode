import { parseStringPromise } from "xml2js";

export interface OpmlFeedEntry {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  category?: string;
}

export interface OpmlFeedInput {
  title: string;
  url: string;
  siteUrl?: string | null;
  categoryName?: string | null;
}

interface OpmlOutlineNode {
  $?: { xmlUrl?: string; htmlUrl?: string; title?: string; text?: string };
  outline?: OpmlOutlineNode[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateOpml(feeds: OpmlFeedInput[]): string {
  const grouped = new Map<string, OpmlFeedInput[]>();
  const uncategorized: OpmlFeedInput[] = [];

  for (const feed of feeds) {
    if (feed.categoryName) {
      grouped.set(feed.categoryName, [...(grouped.get(feed.categoryName) || []), feed]);
    } else {
      uncategorized.push(feed);
    }
  }

  const feedOutline = (feed: OpmlFeedInput) =>
    `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(
      feed.title
    )}" xmlUrl="${escapeXml(feed.url)}"${
      feed.siteUrl ? ` htmlUrl="${escapeXml(feed.siteUrl)}"` : ""
    } />`;

  const categoryBlocks = Array.from(grouped.entries()).map(
    ([category, categoryFeeds]) =>
      `    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n${categoryFeeds
        .map(feedOutline)
        .join("\n")}\n    </outline>`
  );

  const body = [...categoryBlocks, ...uncategorized.map(feedOutline)].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSS Reader Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>`;
}

export async function parseOpml(xml: string): Promise<OpmlFeedEntry[]> {
  const parsed = await parseStringPromise(xml, { explicitArray: true });
  const body = parsed?.opml?.body?.[0];
  if (!body) return [];

  const entries: OpmlFeedEntry[] = [];

  function walk(outlines: OpmlOutlineNode[], categoryName?: string) {
    for (const outline of outlines || []) {
      const attrs = outline.$ || {};
      if (attrs.xmlUrl) {
        entries.push({
          title: attrs.title || attrs.text || attrs.xmlUrl,
          xmlUrl: attrs.xmlUrl,
          htmlUrl: attrs.htmlUrl,
          category: categoryName,
        });
      } else if (outline.outline) {
        walk(outline.outline, attrs.title || attrs.text || categoryName);
      }
    }
  }

  walk(body.outline || []);
  return entries;
}
