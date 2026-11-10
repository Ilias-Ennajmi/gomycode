import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";
import { RestoreError, restoreBackup } from "@/lib/restore";

export const maxDuration = 60;

export const dynamic = "force-dynamic";

// Keys in the Setting table that are the reader's own choices (not caches or counters).
const SETTING_KEYS = ["news-prefs", "video-prefs", "notify-prefs", "weather-city"];

/**
 * A backup of everything that's yours, as one JSON file: sources and categories, filter
 * rules, highlights with their notes and tags, saved articles, preferences. Feeds and
 * articles themselves come back from the web; this is what wouldn't.
 */
export async function GET() {
  const [categories, feeds, rules, highlights, saved, settings] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.feed.findMany({ where: { type: { not: "manual" } }, orderBy: { title: "asc" } }),
    prisma.filterRule.findMany(),
    prisma.highlight.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        article: { select: { title: true, link: true, feed: { select: { title: true } } } },
      },
    }),
    prisma.article.findMany({
      where: { OR: [{ isSaved: true }, { archivedAt: { not: null } }] },
      orderBy: { savedAt: "desc" },
      select: {
        title: true,
        link: true,
        savedAt: true,
        archivedAt: true,
        readProgress: true,
        feed: { select: { title: true } },
      },
    }),
    prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } }),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const feedUrl = new Map(feeds.map((f) => [f.id, f.url]));
  const backup = {
    app: "reader",
    version: 2,
    exportedAt: new Date().toISOString(),
    categories: categories.map((c) => ({ name: c.name, color: c.color, icon: c.icon })),
    sources: feeds.map((f) => ({
      title: f.title,
      url: f.url,
      siteUrl: f.siteUrl,
      sourceUrl: f.sourceUrl,
      type: f.type,
      category: f.categoryId ? (categoryName.get(f.categoryId) ?? null) : null,
      language: f.language,
      newsDesk: f.newsDesk,
      region: f.region,
      platform: f.platform,
      email: f.email,
      inForYou: f.inForYou,
      fullPage: f.fullPage,
      followedAt: f.createdAt,
    })),
    rules: rules.map((r) => ({
      action: r.action,
      match: r.match,
      value: r.value,
      // A rule about a source: its address, which survives where ids don't.
      feedUrl: r.match === "feed" ? (feedUrl.get(r.value) ?? null) : undefined,
    })),
    highlights: highlights.map((h) => ({
      text: h.text,
      note: h.note,
      color: h.color,
      tags: h.tags,
      // Where the passage sits in the article, and for snips, the moment of the episode.
      prefix: h.prefix,
      suffix: h.suffix,
      kind: h.kind,
      title: h.title,
      startSeconds: h.startSeconds,
      endSeconds: h.endSeconds,
      createdAt: h.createdAt,
      article: { title: h.article.title, link: h.article.link, source: h.article.feed.title },
    })),
    saved: saved.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.feed.title,
      savedAt: a.savedAt,
      archivedAt: a.archivedAt,
      readProgress: a.readProgress,
    })),
    settings: Object.fromEntries(
      settings.map((s) => {
        try {
          return [s.key, JSON.parse(s.value)];
        } catch {
          return [s.key, s.value];
        }
      })
    ),
  };
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="reader-backup-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Restores a backup file: adds what's missing, changes nothing that's there. */
export async function POST(request: Request) {
  try {
    const result = await restoreBackup(await readJson<unknown>(request));
    return NextResponse.json({ restored: result });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    if (error instanceof RestoreError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await reportProblem("POST /api/backup", error);
    return NextResponse.json({ error: "Couldn't restore that backup" }, { status: 500 });
  }
}
