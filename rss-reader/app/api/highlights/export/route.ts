import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HIGHLIGHT_ARTICLE_INCLUDE, highlightsToMarkdown } from "@/lib/highlights";

export const dynamic = "force-dynamic";

/** Every highlight and note as a Markdown file, grouped by article. */
export async function GET() {
  const highlights = await prisma.highlight.findMany({
    // Articles in the order they were first highlighted.
    orderBy: { createdAt: "asc" },
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(highlightsToMarkdown(highlights), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="reader-highlights-${date}.md"`,
    },
  });
}
