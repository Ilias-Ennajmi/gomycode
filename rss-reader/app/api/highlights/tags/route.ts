import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sqlName } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Every tag used on highlights, most used first, for the filter chips. */
export async function GET() {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT tag, count(*) AS count
    FROM ${sqlName("Highlight")}, unnest(tags) AS tag
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT 50`;
  return NextResponse.json({ tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })) });
}
