import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** PATCH { name?, description?, public? }: rename, describe, publish (a link) or unpublish. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: { name?: string; description?: string | null; slug?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.description === "string") {
    data.description = body.description.trim().slice(0, 400) || null;
  }
  if (typeof body.public === "boolean") {
    const current = await prisma.collection.findUnique({
      where: { id: params.id },
      select: { slug: true },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // A fresh token each time it's published, so an old link stops working once unpublished.
    data.slug = body.public ? (current.slug ?? randomBytes(9).toString("base64url")) : null;
  }
  const collection = await prisma.collection.update({ where: { id: params.id }, data });
  return NextResponse.json({ collection });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await prisma.collection.delete({ where: { id: params.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
