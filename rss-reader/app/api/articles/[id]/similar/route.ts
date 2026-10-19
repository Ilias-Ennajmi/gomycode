import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cosine } from "@/lib/ai";
import { ARTICLE_FEED_INCLUDE, notSnoozed, serializeArticle } from "@/lib/articles";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";

export const dynamic = "force-dynamic";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SIMILARITY = 0.6;
const COUNT = 3;

/** "More like this": the closest recent articles from your own feeds, by embedding. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: { id: true, embedding: true, topicId: true },
  });
  if (!article || article.embedding.length === 0) return NextResponse.json({ articles: [] });

  const rules = await getFilterRules();
  const candidates = await prisma.article.findMany({
    where: {
      id: { not: article.id },
      publishedAt: { gte: new Date(Date.now() - WINDOW_MS) },
      NOT: { embedding: { isEmpty: true } },
      isPromo: false,
      feed: { type: { not: "manual" } },
      // The same story from another outlet is "also covered by", not "more like this".
      ...(article.topicId
        ? { OR: [{ topicId: null }, { topicId: { not: article.topicId } }] }
        : {}),
      AND: [...hiddenArticleClauses(rules), notSnoozed()],
    },
    orderBy: { publishedAt: "desc" },
    take: 600,
    include: ARTICLE_FEED_INCLUDE,
  });
  const scored = candidates
    .map((candidate) => ({ candidate, score: cosine(article.embedding, candidate.embedding) }))
    .filter(({ score }) => score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, COUNT);
  return NextResponse.json({
    articles: scored.map(({ candidate }) => serializeArticle(candidate)),
  });
}
