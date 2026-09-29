import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AiError, isAiEnabled, summarizeArticle } from "@/lib/ai";
import { stripHtml } from "@/lib/utils";

export const maxDuration = 30;

// Shorter texts are already their own summary.
const MIN_LENGTH = 400;

/** Returns the cached AI summary, generating it the first time an article is opened. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      fullContent: true,
      aiSummary: true,
    },
  });
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  if (article.aiSummary) return NextResponse.json({ summary: article.aiSummary });
  if (!isAiEnabled()) return NextResponse.json({ summary: null, reason: "disabled" });

  const text = stripHtml(article.fullContent || article.content || article.summary);
  if (text.length < MIN_LENGTH) return NextResponse.json({ summary: null, reason: "too-short" });

  try {
    const summary = await summarizeArticle(article.title, text);
    await prisma.article.update({ where: { id: article.id }, data: { aiSummary: summary } });
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summary failed", error);
    const limited = error instanceof AiError && error.status === 429;
    return NextResponse.json(
      { summary: null, reason: limited ? "rate-limited" : "failed" },
      { status: limited ? 429 : 502 }
    );
  }
}
