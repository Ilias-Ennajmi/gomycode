import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai";
import { buildReadingProfile } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/** What the AI layer is doing, for the settings screen and For You header. */
export async function GET() {
  const [profile, analyzed, topics] = await Promise.all([
    buildReadingProfile(),
    prisma.article.count({ where: { NOT: { embedding: { isEmpty: true } } } }),
    prisma.topic.count(),
  ]);
  return NextResponse.json({
    enabled: isAiEnabled(),
    learnedFrom: profile.learnedFrom,
    analyzed,
    topics,
  });
}
