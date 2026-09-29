import type { Highlight, Prisma } from "@prisma/client";
import type { HighlightColor } from "@/lib/types";

export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink"];
const MAX_TEXT = 5000;
const MAX_NOTE = 5000;
const MAX_CONTEXT = 64;

export const HIGHLIGHT_ARTICLE_INCLUDE = {
  article: {
    select: {
      id: true,
      title: true,
      link: true,
      author: true,
      feed: { select: { id: true, title: true, faviconUrl: true } },
    },
  },
} satisfies Prisma.HighlightInclude;

export function parseColor(value: unknown): HighlightColor | undefined {
  return HIGHLIGHT_COLORS.includes(value as HighlightColor) ? (value as HighlightColor) : undefined;
}

/** Trims and bounds what the client sends; null when the text is empty. */
export function cleanHighlightInput(body: Record<string, unknown>) {
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!text) return null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";
  const context = (value: unknown, fromEnd: boolean) => {
    if (typeof value !== "string") return "";
    return fromEnd ? value.slice(-MAX_CONTEXT) : value.slice(0, MAX_CONTEXT);
  };
  return {
    text,
    note: note || null,
    color: parseColor(body.color) ?? "yellow",
    prefix: context(body.prefix, true),
    suffix: context(body.suffix, false),
  };
}

type WithArticle = Highlight & {
  article?: {
    id: string;
    title: string;
    link: string;
    author: string | null;
    feed: { id: string; title: string; faviconUrl: string | null };
  };
};

/** Highlights grouped by article, as Markdown (the Highlights export). */
export function highlightsToMarkdown(highlights: WithArticle[]) {
  const groups = new Map<string, WithArticle[]>();
  for (const h of highlights) groups.set(h.articleId, [...(groups.get(h.articleId) ?? []), h]);

  const date = new Date().toISOString().slice(0, 10);
  const parts = [`# Highlights\n\nExported from Reader on ${date}.`];
  for (const list of Array.from(groups.values())) {
    const article = list[0].article;
    if (!article) continue;
    const byline = [article.author, article.feed.title].filter(Boolean).join(" · ");
    parts.push(`## ${article.title}\n\n${byline ? `${byline} · ` : ""}<${article.link}>`);
    for (const h of list) {
      const quote = h.text
        .split(/\n+/)
        .map((line) => `> ${line}`)
        .join("\n");
      parts.push(h.note ? `${quote}\n\n**Note:** ${h.note}` : quote);
    }
  }
  return parts.join("\n\n") + "\n";
}
