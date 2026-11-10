import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sqlName } from "@/lib/db";
import { readSetting, writeSetting } from "@/lib/push";
import { youTubeVideoId } from "@/lib/youtube";

// DeArrow (dearrow.ajay.app): titles rewritten by the community to say what a video is,
// without the bait. Free, no key, from the SponsorBlock servers. Titles get submitted after
// a video is out, so each video is asked about every 6 hours over its first 3 days, then
// every 2 days up to 14 days old (brandingDue). The creator's title is
// kept, and the switch in Settings → Personalise puts it back everywhere at once.

interface Branding {
  titles?: { title?: unknown; original?: unknown; votes?: unknown; locked?: unknown }[];
}

const KEY = "dearrow";

/** The title DeArrow would show: the best one, if it isn't the original and isn't downvoted. */
export function pickTitle(branding: Branding | null, current: string): string | null {
  const best = branding?.titles?.[0];
  if (!best || typeof best.title !== "string" || best.original === true) return null;
  const trusted = best.locked === true || (typeof best.votes === "number" && best.votes >= 0);
  if (!trusted) return null;
  // ">" marks a word DeArrow's formatter must leave alone; it isn't part of the title.
  const title = best.title.replace(/(^|\s)>(?=\S)/g, "$1").trim();
  return title && title !== current.trim() ? title : null;
}

export async function fetchBranding(videoId: string): Promise<Branding | null> {
  const res = await fetch(
    `https://sponsor.ajay.app/api/branding?videoID=${encodeURIComponent(videoId)}`,
    {
      headers: { "User-Agent": "Reader/1.0 (personal reader)" },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`DeArrow ${res.status}`);
  return (await res.json()) as Branding;
}

export async function deArrowOn() {
  return (await readSetting<{ on: boolean }>(KEY, { on: true })).on;
}

/** Turns plain titles on or off: every video that has one switches at once. */
export async function setDeArrow(on: boolean) {
  await writeSetting(KEY, { on });
  // Raw SQL names the table with its schema: Supabase's pooler doesn't keep the search path.
  const from = on ? Prisma.raw('"altTitle"') : Prisma.raw('"originalTitle"');
  await prisma.$executeRaw(
    Prisma.sql`UPDATE ${sqlName("Article")} SET "title" = ${from} WHERE ${from} IS NOT NULL`
  );
}

const HOUR = 60 * 60 * 1000;
const PER_RUN = 20;
const WINDOW_HOURS = 14 * 24;

/** Whether a video is due another ask: how old it is decides how often. Exported for tests. */
export function brandingDue(createdAt: Date, brandingAt: Date | null, now = Date.now()) {
  const age = (now - createdAt.getTime()) / HOUR;
  if (age > WINDOW_HOURS) return false;
  if (!brandingAt) return true;
  return (now - brandingAt.getTime()) / HOUR >= (age <= 72 ? 6 : 48);
}

/**
 * Asks DeArrow about recent videos that have no plain title yet (see brandingDue). Stops
 * past the deadline.
 */
export async function applyDeArrow(deadline: number) {
  if (!(await deArrowOn())) return 0;
  const now = Date.now();
  const candidates = await prisma.article.findMany({
    where: {
      isVideo: true,
      altTitle: null,
      createdAt: { gte: new Date(now - WINDOW_HOURS * HOUR) },
    },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: { id: true, link: true, title: true, createdAt: true, brandingAt: true },
  });
  const videos = candidates
    .filter((v) => brandingDue(v.createdAt, v.brandingAt, now))
    .slice(0, PER_RUN);
  let changed = 0;
  for (const video of videos) {
    if (Date.now() > deadline) break;
    const videoId = youTubeVideoId(video.link);
    const branding = videoId ? await fetchBranding(videoId).catch(() => undefined) : null;
    // Unreachable: try again next run, without waiting.
    if (branding === undefined) break;
    const title = pickTitle(branding, video.title);
    await prisma.article.update({
      where: { id: video.id },
      data: title
        ? { brandingAt: new Date(), altTitle: title, originalTitle: video.title, title }
        : { brandingAt: new Date() },
    });
    if (title) changed++;
  }
  return changed;
}
