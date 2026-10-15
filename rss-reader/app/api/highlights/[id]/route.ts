import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseColor } from "@/lib/highlights";

/** "SEO, Quotes " → ["seo", "quotes"]: short, lowercase, no repeats. */
function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase().replace(/^#/, "").slice(0, 40))
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 20);
}

/** Changes a highlight's note, colour or tags. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const data: { note?: string | null; color?: string; tags?: string[] } = {};
  const tags = cleanTags(body.tags);
  if (tags) data.tags = tags;
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
