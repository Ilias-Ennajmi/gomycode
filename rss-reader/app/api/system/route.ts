import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/push";
import { readErrorLog } from "@/lib/errlog";
import { pushConfigured } from "@/lib/push";
import { isAiEnabled } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** What's under the hood: the build, the database, the last refresh, the error log. */
export async function GET() {
  const [articles, feeds, highlights, pushSubscriptions, size, lastTick, lastVideo, errors] =
    await Promise.all([
      prisma.article.count(),
      prisma.feed.count({ where: { type: { not: "manual" } } }),
      prisma.highlight.count(),
      prisma.pushSubscription.count(),
      prisma
        .$queryRaw<{ bytes: bigint }[]>(
          Prisma.sql`SELECT pg_database_size(current_database()) AS bytes`
        )
        .then((rows) => Number(rows[0]?.bytes ?? 0))
        .catch(() => null),
      readSetting<Record<string, unknown>>("last-tick", {}),
      readSetting<{ at?: number }>("video-tick", {}),
      readErrorLog(),
    ]);
  return NextResponse.json({
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      region: process.env.VERCEL_REGION ?? null,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      node: process.version,
    },
    database: { bytes: size, articles, feeds, highlights, pushSubscriptions },
    services: { ai: isAiEnabled(), push: pushConfigured() },
    lastTick,
    lastVideoTick: lastVideo,
    errors,
  });
}
