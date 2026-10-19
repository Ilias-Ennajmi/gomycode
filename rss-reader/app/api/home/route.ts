import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ARTICLE_FEED_INCLUDE, notSnoozed, serializeArticle } from "@/lib/articles";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";

export const dynamic = "force-dynamic";

/**
 * The home page's own blocks: what was started and not finished (articles part-read,
 * videos and episodes part-played), newest first.
 */
export async function GET() {
  try {
    const rules = await getFilterRules();
    const started = await prisma.article.findMany({
      where: {
        isRead: false,
        OR: [
          { readProgress: { gte: 10, lte: 90 }, isVideo: false, audioUrl: null },
          { watchedSeconds: { gt: 30 } },
        ],
        AND: [...hiddenArticleClauses(rules), notSnoozed()],
      },
      orderBy: { publishedAt: "desc" },
      take: 6,
      include: ARTICLE_FEED_INCLUDE,
    });
    return NextResponse.json({ continue: started.map(serializeArticle) });
  } catch (error) {
    console.error("GET /api/home failed", error);
    return NextResponse.json({ continue: [] });
  }
}
