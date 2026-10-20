import { NextRequest, NextResponse } from "next/server";
import { followSource } from "@/lib/follow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Item {
  url: string;
  categoryName?: string;
  language?: string;
}

/** POST { items: [{ url, categoryName?, language? }] }: follows them all (a starter pack). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { items?: unknown };
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((i): i is Item => Boolean(i && typeof (i as Item).url === "string"))
    .slice(0, 40);
  if (items.length === 0) return NextResponse.json({ error: "Nothing to follow" }, { status: 400 });

  const results = await Promise.allSettled(
    items.map((item) =>
      followSource(
        { url: item.url, categoryName: item.categoryName, language: item.language },
        { allowExisting: true }
      )
    )
  );
  const followed = results.filter((r) => r.status === "fulfilled").length;
  const failed = items.filter((_, i) => results[i].status === "rejected").map((item) => item.url);
  return NextResponse.json({ followed, failed });
}
