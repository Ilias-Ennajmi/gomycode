import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST { articleId }: puts the article in the collection (and saves it to Later). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => ({}))) as { articleId?: unknown };
  const articleId = typeof body.articleId === "string" ? body.articleId : "";
  if (!articleId) return NextResponse.json({ error: "Which article?" }, { status: 400 });
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, isSaved: true },
  });
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  await prisma.$transaction([
    prisma.collectionItem.upsert({
      where: { collectionId_articleId: { collectionId: params.id, articleId } },
      update: {},
      create: { collectionId: params.id, articleId },
    }),
    prisma.collection.update({ where: { id: params.id }, data: { updatedAt: new Date() } }),
    // A collected article is a kept one.
    ...(article.isSaved
      ? []
      : [
          prisma.article.update({
            where: { id: articleId },
            data: { isSaved: true, savedAt: new Date(), archivedAt: null },
          }),
        ]),
  ]);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE ?articleId=: takes the article out of the collection. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const articleId = request.nextUrl.searchParams.get("articleId") ?? "";
  if (!articleId) return NextResponse.json({ error: "Which article?" }, { status: 400 });
  await prisma.collectionItem
    .delete({ where: { collectionId_articleId: { collectionId: params.id, articleId } } })
    .catch(() => undefined);
  return NextResponse.json({ ok: true });
}
