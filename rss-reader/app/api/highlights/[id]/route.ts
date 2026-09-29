import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseColor } from "@/lib/highlights";

/** Changes a highlight's note or colour. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const data: { note?: string | null; color?: string } = {};
  if (typeof body.note === "string" || body.note === null) {
    data.note = typeof body.note === "string" ? body.note.trim().slice(0, 5000) || null : null;
  }
  const color = parseColor(body.color);
  if (color) data.color = color;

  try {
    const highlight = await prisma.highlight.update({ where: { id: params.id }, data });
    return NextResponse.json({ highlight });
  } catch {
    return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await prisma.highlight.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
