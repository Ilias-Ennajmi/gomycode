import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARTICLE_FEED_INCLUDE, notSnoozed, serializeArticle } from "@/lib/articles";
import { isAiEnabled } from "@/lib/ai";
import { runVideoAi, VIDEO_AI_CANDIDATE } from "@/lib/video-ai";

export const maxDuration = 300;

const UP_NEXT_VIDEO: Prisma.ArticleWhereInput = {
  isVideo: true,
  isShort: false,
  isRead: false,
  liveStatus: null,
};
const UP_NEXT_EPISODE: Prisma.ArticleWhereInput = {
  isVideo: false,
  audioUrl: { not: null },
  isRead: false,
};

/**
 * A video's or podcast episode's extras for the reader: chapters, key moments, transcript,
 * whether Gemini is still working on them, and what's next (the Later queue first, then the
 * same channel or show).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      feedId: true,
      isVideo: true,
      audioUrl: true,
      chapters: true,
      keyMoments: true,
      transcript: true,
    },
  });
  if (!article || (!article.isVideo && !article.audioUrl)) {
    return NextResponse.json({ error: "Not a video or episode" }, { status: 404 });
  }
  const UP_NEXT_WHERE = article.isVideo ? UP_NEXT_VIDEO : UP_NEXT_EPISODE;

  // Still to come when Gemini will (still) try it: the same rule the runs use.
  const pendingAi =
    isAiEnabled() &&
    article.transcript === null &&
    (await prisma.article.count({ where: { id: article.id, ...VIDEO_AI_CANDIDATE } })) > 0;

  const notThis = { id: { not: article.id } };
  const upNext =
    (await prisma.article.findFirst({
      where: {
        ...UP_NEXT_WHERE,
        ...notThis,
        isSaved: true,
        archivedAt: null,
        AND: [notSnoozed()],
      },
      orderBy: { savedAt: "desc" },
      include: ARTICLE_FEED_INCLUDE,
    })) ??
    (await prisma.article.findFirst({
      where: { ...UP_NEXT_WHERE, ...notThis, feedId: article.feedId },
      orderBy: { publishedAt: "desc" },
      include: ARTICLE_FEED_INCLUDE,
    }));

  return NextResponse.json({
    chapters: article.chapters ?? [],
    keyMoments: article.keyMoments ?? [],
    transcript: article.transcript ?? [],
    ai: article.transcript !== null ? "done" : pendingAi ? "pending" : "unavailable",
    upNext: upNext ? serializeArticle(upNext) : null,
  });
}

/** Opened a video or episode without a summary yet: ask Gemini now, not at the next tick. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const candidate = await prisma.article.findFirst({
    where: { id: params.id, ...VIDEO_AI_CANDIDATE },
    select: { videoAiAt: true },
  });
  if (!candidate) return NextResponse.json({ result: "skipped" });
  // Another run (the tick, or another tab) may be at it right now.
  if (candidate.videoAiAt && Date.now() - candidate.videoAiAt.getTime() < 90_000) {
    return NextResponse.json({ result: "running" });
  }
  const result = await runVideoAi(params.id, 280_000);
  return NextResponse.json({ result });
}
