import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HIGHLIGHT_ARTICLE_INCLUDE, highlightsToMarkdown } from "@/lib/highlights";

export const dynamic = "force-dynamic";

/** Every highlight and note (or one tag's, with ?tag=) as a Markdown file, grouped by article. */
export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag")?.trim().toLowerCase();
  const highlights = await prisma.highlight.findMany({
    where: tag ? { tags: { has: tag } } : undefined,
    // Articles in the order they were first highlighted.
    orderBy: { createdAt: "asc" },
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(highlightsToMarkdown(highlights), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="reader-highlights${tag ? `-${tag.replace(/[^a-z0-9-]+/g, "-")}` : ""}-${date}.md"`,
    },
  });
}
