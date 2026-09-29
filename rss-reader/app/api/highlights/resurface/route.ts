import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HIGHLIGHT_ARTICLE_INCLUDE } from "@/lib/highlights";

export const dynamic = "force-dynamic";

const COUNT = 3;
const MIN_AGE_MS = 2 * 24 * 3600 * 1000;
const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";

/** A small deterministic generator, so the same three come back all day. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Three older highlights to read again, a different three each day. */
export async function GET() {
  const candidates = await prisma.highlight.findMany({
    where: { createdAt: { lt: new Date(Date.now() - MIN_AGE_MS) } },
    select: { id: true },
  });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
  const random = seeded(day);
  const ids = candidates.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const chosen = ids.slice(0, COUNT);
  const highlights = await prisma.highlight.findMany({
    where: { id: { in: chosen } },
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
  highlights.sort((a, b) => chosen.indexOf(a.id) - chosen.indexOf(b.id));
  return NextResponse.json({ highlights });
}
