import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findUnsubscribeLink } from "@/lib/newsletters";

export const dynamic = "force-dynamic";

/** The unsubscribe link from a newsletter's latest emails, if they have one. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const articles = await prisma.article.findMany({
    where: { feedId: params.id },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { content: true },
  });
  for (const article of articles) {
    const url = findUnsubscribeLink(article.content);
    if (url) return NextResponse.json({ url });
  }
  return NextResponse.json({ url: null });
}
