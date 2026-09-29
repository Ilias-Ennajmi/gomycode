import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractPage } from "@/lib/extract";
import { stripHtml } from "@/lib/utils";

export const maxDuration = 30;

// The page must add real text over the feed excerpt to be worth showing.
const MIN_FULL_TEXT = 600;
const MIN_GAIN = 1.2;

/**
 * Fetches and caches the full article for feeds that only send excerpts.
 * "limited" means the page itself is a teaser (paywall, sign-in wall).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      link: true,
      content: true,
      summary: true,
      fullContent: true,
      fullContentStatus: true,
    },
  });
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  if (article.fullContentStatus) {
    return NextResponse.json({ status: article.fullContentStatus, content: article.fullContent });
  }

  let status: "full" | "limited" | "failed" = "failed";
  let content: string | null = null;
  try {
    const page = await extractPage(article.link);
    const pageText = stripHtml(page.content).length;
    const feedText = stripHtml(article.content || article.summary).length;
    if (page.content && pageText >= MIN_FULL_TEXT && pageText >= feedText * MIN_GAIN) {
      status = "full";
      content = page.content;
    } else {
      status = "limited";
    }
  } catch (error) {
    console.error("Full article fetch failed", article.link, error);
  }

  await prisma.article.update({
    where: { id: article.id },
    data: { fullContent: content, fullContentStatus: status },
  });
  return NextResponse.json({ status, content });
}
