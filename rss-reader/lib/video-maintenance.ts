import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { channelIdFromFeedUrl, youTubeVideoId } from "@/lib/youtube";
import { descriptionHtml, fetchVideoPage, scanChannel } from "@/lib/youtube-video";

// Keeps videos' lengths, Shorts flags, live status, descriptions and chapters up to date
// (lib/youtube-video.ts reads them from YouTube's pages). Runs after the hourly refresh.

const SCAN_EVERY_MS = 2 * 60 * 60 * 1000;
const CHANNELS_PER_RUN = 8;
const PAGES_PER_RUN = 8;

/** Channels not scanned for a while (or with new videos since): lengths, Shorts, live. */
export async function scanVideoChannels(deadline: number) {
  const feeds = await prisma.feed.findMany({
    where: {
      type: "youtube",
      OR: [
        { videosScannedAt: null },
        { videosScannedAt: { lt: new Date(Date.now() - SCAN_EVERY_MS) } },
      ],
    },
    orderBy: { videosScannedAt: { sort: "asc", nulls: "first" } },
    take: CHANNELS_PER_RUN,
    select: { id: true, url: true },
  });
  let updated = 0;
  for (const feed of feeds) {
    if (Date.now() > deadline) break;
    const channelId = channelIdFromFeedUrl(feed.url);
    if (!channelId) continue;
    const info = await scanChannel(channelId).catch((error) => {
      console.error(`Channel scan failed for ${feed.url}`, error);
      return null;
    });
    await prisma.feed.update({ where: { id: feed.id }, data: { videosScannedAt: new Date() } });
    if (!info) continue;

    const articles = await prisma.article.findMany({
      where: { feedId: feed.id, isVideo: true },
      select: { id: true, link: true, durationSeconds: true, isShort: true, liveStatus: true },
    });
    for (const article of articles) {
      const found = info.get(youTubeVideoId(article.link) ?? "");
      if (!found) {
        // No longer listed as live or upcoming: it happened (or was cancelled).
        if (article.liveStatus === "live" || article.liveStatus === "upcoming") {
          await prisma.article.update({ where: { id: article.id }, data: { liveStatus: null } });
        }
        continue;
      }
      const data = {
        durationSeconds: found.durationSeconds ?? article.durationSeconds,
        isShort: found.isShort || article.isShort,
        liveStatus: found.liveStatus,
      };
      if (
        data.durationSeconds !== article.durationSeconds ||
        data.isShort !== article.isShort ||
        data.liveStatus !== article.liveStatus
      ) {
        await prisma.article.update({ where: { id: article.id }, data });
        updated++;
      }
    }
  }
  return updated;
}

/** New videos: the full description (feeds cut it short) and the creator's chapters. */
export async function fillVideoPages(deadline: number) {
  const videos = await prisma.article.findMany({
    where: { isVideo: true, videoCheckedAt: null },
    orderBy: { publishedAt: "desc" },
    take: PAGES_PER_RUN,
    select: { id: true, link: true, isShort: true },
  });
  let filled = 0;
  for (const video of videos) {
    if (Date.now() > deadline) break;
    const videoId = youTubeVideoId(video.link);
    const page = videoId ? await fetchVideoPage(videoId).catch(() => null) : null;
    const description = page?.description?.trim();
    await prisma.article.update({
      where: { id: video.id },
      data: {
        videoCheckedAt: new Date(),
        ...(page && videoId && description
          ? {
              content: descriptionHtml(videoId, description),
              summary: description.slice(0, 500),
            }
          : {}),
        ...(page && page.chapters.length
          ? { chapters: page.chapters as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (page) filled++;
  }
  return filled;
}
