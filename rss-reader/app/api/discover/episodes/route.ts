import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchAppleEpisodes } from "@/lib/podcast";

export const dynamic = "force-dynamic";

/**
 * ?q=: episodes about something, from the shows followed here (title and notes) and from
 * Apple's catalogue (any show), so "interviews about sleep" finds episodes, not shows.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const lang = request.nextUrl.searchParams.get("lang") ?? undefined;
  if (q.length < 2) return NextResponse.json({ mine: [], apple: [] });

  const [mine, apple] = await Promise.all([
    prisma.article.findMany({
      where: {
        audioUrl: { not: null },
        archivedAt: null,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { publishedAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        imageUrl: true,
        publishedAt: true,
        durationSeconds: true,
        audioUrl: true,
        watchedSeconds: true,
        isRead: true,
        feed: { select: { id: true, title: true, faviconUrl: true } },
      },
    }),
    searchAppleEpisodes(q, lang).catch(() => []),
  ]);
  return NextResponse.json({ mine, apple });
}
