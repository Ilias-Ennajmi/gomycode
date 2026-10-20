import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  count: number;
  /** The newest items' pictures, for a cover. */
  covers: string[];
  /** With ?articleId=: whether that article is in it. */
  has?: boolean;
  updatedAt: string;
}

/** Every collection, newest first; ?articleId= also says which ones hold that article. */
export async function GET(request: NextRequest) {
  const articleId = request.nextUrl.searchParams.get("articleId");
  const collections = await prisma.collection.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { items: true } },
      items: {
        orderBy: { addedAt: "desc" },
        take: 4,
        select: { article: { select: { imageUrl: true } } },
      },
    },
  });
  const inside = articleId
    ? new Set(
        (
          await prisma.collectionItem.findMany({
            where: { articleId },
            select: { collectionId: true },
          })
        ).map((i) => i.collectionId)
      )
    : null;
  const list: CollectionSummary[] = collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    slug: c.slug,
    count: c._count.items,
    covers: c.items.map((i) => i.article.imageUrl).filter((u): u is string => Boolean(u)),
    ...(inside && { has: inside.has(c.id) }),
    updatedAt: c.updatedAt.toISOString(),
  }));
  return NextResponse.json({ collections: list });
}

/** POST { name, description?, articleId? }: a new collection, holding that article if given. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Give the collection a name" }, { status: 400 });
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 400) || null : null;
  const articleId = typeof body.articleId === "string" ? body.articleId : null;
  const collection = await prisma.collection.create({
    data: {
      name,
      description,
      ...(articleId && { items: { create: { articleId } } }),
    },
  });
  // A collected article is a kept one.
  if (articleId) {
    await prisma.article
      .update({
        where: { id: articleId, isSaved: false },
        data: { isSaved: true, savedAt: new Date(), archivedAt: null },
      })
      .catch(() => undefined);
  }
  return NextResponse.json({ collection }, { status: 201 });
}
