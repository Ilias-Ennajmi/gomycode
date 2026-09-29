import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARTICLE_FEED_INCLUDE, notSnoozed, serializeArticle } from "@/lib/articles";
import { isAiEnabled } from "@/lib/ai";
import { MAX_ATTEMPTS, runVideoAi, VIDEO_AI_CANDIDATE } from "@/lib/video-ai";

export const maxDuration = 300;

const UP_NEXT_WHERE: Prisma.ArticleWhereInput = {
  isVideo: true,
  isShort: false,
  isRead: false,
  liveStatus: null,
};

/**
 * A video's extras for the reader: chapters, key moments, transcript, whether Gemini is
 * still working on them, and what to watch next (the Later queue first, then the channel).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      feedId: true,
      isVideo: true,
      isShort: true,
      chapters: true,
      keyMoments: true,
      transcript: true,
      videoAiAttempts: true,
      liveStatus: true,
    },
  });
  if (!article?.isVideo) return NextResponse.json({ error: "Not a video" }, { status: 404 });

  const pendingAi =
    isAiEnabled() &&
    article.transcript === null &&
    !article.isShort &&
    !article.liveStatus &&
    article.videoAiAttempts < MAX_ATTEMPTS;

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

/** Opened a video that has no summary yet: ask Gemini now instead of waiting for the tick. */
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
