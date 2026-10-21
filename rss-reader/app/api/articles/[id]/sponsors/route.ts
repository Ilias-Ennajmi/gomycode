import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { episodeSponsors, videoSponsors, type SponsorSegment } from "@/lib/sponsors";
import { youTubeVideoId } from "@/lib/youtube";
import type { Chapter, TimedText } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; segments: SponsorSegment[] }>();

/** The sponsor segments of a video or episode, so the player can skip them. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const hit = cache.get(params.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ segments: hit.segments });

  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: {
      link: true,
      isVideo: true,
      audioUrl: true,
      chapters: true,
      transcript: true,
      durationSeconds: true,
    },
  });
  if (!article) return NextResponse.json({ segments: [] }, { status: 404 });

  let segments: SponsorSegment[] = [];
  try {
    const videoId = article.isVideo ? youTubeVideoId(article.link) : null;
    if (videoId) segments = await videoSponsors(videoId);
    else if (article.audioUrl) {
      segments = episodeSponsors(
        Array.isArray(article.chapters) ? (article.chapters as unknown as Chapter[]) : [],
        Array.isArray(article.transcript) ? (article.transcript as unknown as TimedText[]) : [],
        article.durationSeconds
      );
    }
  } catch {
    // No segments known: nothing skipped.
  }
  cache.set(params.id, { at: Date.now(), segments });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return NextResponse.json({ segments });
}
