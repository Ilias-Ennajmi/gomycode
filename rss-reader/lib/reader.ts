import { stripHtml } from "@/lib/utils";
import type { ArticleSummary } from "@/lib/types";

/** Below this much text, a feed item is almost certainly an excerpt. */
const SHORT_TEXT = 1200;
const CUT_OFF =
  /(…|\.\.\.|\[…\]|\[\.\.\.\]|read more|continue reading|lire la suite|la suite)\s*\W*$/i;

/** Whether the feed only sent an excerpt, so the reader should fetch the full page. */
export function needsFullArticle(
  article: Pick<ArticleSummary, "isVideo" | "content" | "summary" | "feed">
) {
  // Videos and podcast episodes come with their notes; their page isn't the content.
  if (article.isVideo || article.feed.type === "manual" || article.feed.type === "podcast") {
    return false;
  }
  // The source's own setting wins over the guess.
  if (article.feed.fullPage) return true;
  const text = stripHtml(article.content || article.summary);
  return text.length < SHORT_TEXT || CUT_OFF.test(text);
}

export function wordCount(html: string | null | undefined) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}
