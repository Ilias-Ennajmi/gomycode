import type { FeedType, FilterAction, FilterMatch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { savedLinksFeed } from "@/lib/saved-links";

// Puts a backup (GET /api/backup) back. It only adds: what's already there stays as it is,
// nothing is deleted, so restoring twice, or onto a reader in use, is harmless. Sources come
// back followed and fill up at the next refresh; a highlight or saved article whose article
// isn't here any more gets it back as a saved link.

const FEED_TYPES = ["rss", "youtube", "newsletter", "podcast"];
const ACTIONS = ["hide", "boost", "alert", "save"];
const SETTING_KEYS = ["news-prefs", "video-prefs", "notify-prefs", "weather-city"];

export class RestoreError extends Error {}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((v): v is Row => Boolean(v) && typeof v === "object") : [];
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const date = (value: unknown) => {
  const d = typeof value === "string" ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export interface RestoreResult {
  categories: number;
  sources: number;
  rules: number;
  highlights: number;
  saved: number;
  settings: number;
}

export async function restoreBackup(backup: unknown): Promise<RestoreResult> {
  const data = backup as Row;
  if (!data || typeof data !== "object" || data.app !== "reader") {
    throw new RestoreError("This isn't a Reader backup file.");
  }
  const result: RestoreResult = {
    categories: 0,
    sources: 0,
    rules: 0,
    highlights: 0,
    saved: 0,
    settings: 0,
  };

  // Categories, by name.
  const categories = new Map(
    (await prisma.category.findMany()).map((c) => [c.name.toLowerCase(), c.id])
  );
  for (const c of rows(data.categories)) {
    const name = text(c.name);
    if (!name || categories.has(name.toLowerCase())) continue;
    const created = await prisma.category.create({
      data: { name, color: text(c.color) ?? undefined, icon: text(c.icon), order: categories.size },
    });
    categories.set(name.toLowerCase(), created.id);
    result.categories++;
  }

  // Sources, by feed address.
  const feeds = new Map(
    (await prisma.feed.findMany({ select: { id: true, url: true } })).map((f) => [f.url, f.id])
  );
  for (const f of rows(data.sources)) {
    const url = text(f.url);
    const type = text(f.type);
    if (!url || !/^https?:\/\//.test(url) || feeds.has(url)) continue;
    const created = await prisma.feed.create({
      data: {
        url,
        title: text(f.title) ?? url,
        type: (type && FEED_TYPES.includes(type) ? type : "rss") as FeedType,
        siteUrl: text(f.siteUrl),
        sourceUrl: text(f.sourceUrl),
        language: text(f.language),
        newsDesk: text(f.newsDesk),
        region: text(f.region),
        platform: text(f.platform),
        email: text(f.email),
        inForYou: f.inForYou !== false,
        fullPage: f.fullPage === true,
        categoryId: categories.get(text(f.category)?.toLowerCase() ?? "") ?? null,
      },
    });
    feeds.set(url, created.id);
    result.sources++;
  }

  // Rules. A rule about a source names it by its address (newer backups) or its id.
  const feedIds = new Set(feeds.values());
  for (const r of rows(data.rules)) {
    const action = text(r.action);
    const match = text(r.match);
    let value = text(r.value);
    if (!action || !ACTIONS.includes(action) || (match !== "keyword" && match !== "feed")) continue;
    if (match === "feed") {
      value = feeds.get(text(r.feedUrl) ?? "") ?? (value && feedIds.has(value) ? value : null);
    }
    if (!value) continue;
    const where = {
      action: action as FilterAction,
      match: match as FilterMatch,
      value,
    };
    if (await prisma.filterRule.findFirst({ where })) continue;
    await prisma.filterRule.create({ data: where });
    result.rules++;
  }

  // The article a highlight or a saved entry is about: the one here, or a saved link.
  let savedFeedId: string | null = null;
  async function articleFor(link: string, title: string | null, source: string | null) {
    const existing = await prisma.article.findFirst({ where: { link }, select: { id: true } });
    if (existing) return existing.id;
    savedFeedId ??= (await savedLinksFeed()).id;
    const created = await prisma.article.create({
      data: {
        feedId: savedFeedId,
        link,
        title: title ?? link,
        author: source,
        publishedAt: new Date(),
        isRead: true,
      },
      select: { id: true },
    });
    return created.id;
  }

  for (const a of rows(data.saved)) {
    const link = text(a.link);
    if (!link || !/^https?:\/\//.test(link)) continue;
    const id = await articleFor(link, text(a.title), text(a.source));
    const current = await prisma.article.findUnique({
      where: { id },
      select: { isSaved: true, archivedAt: true },
    });
    const archivedAt = date(a.archivedAt);
    if (current?.isSaved || (archivedAt && current?.archivedAt)) continue;
    await prisma.article.update({
      where: { id },
      data: archivedAt
        ? { archivedAt, savedAt: date(a.savedAt) }
        : { isSaved: true, savedAt: date(a.savedAt) ?? new Date() },
    });
    result.saved++;
  }

  for (const h of rows(data.highlights)) {
    const quote = text(h.text);
    const article = h.article as Row | undefined;
    const link = text(article?.link);
    if (!quote || !link || !/^https?:\/\//.test(link)) continue;
    const articleId = await articleFor(link, text(article?.title), text(article?.source));
    if (await prisma.highlight.findFirst({ where: { articleId, text: quote } })) continue;
    await prisma.highlight.create({
      data: {
        articleId,
        text: quote,
        note: text(h.note),
        color: text(h.color) ?? undefined,
        tags: Array.isArray(h.tags) ? h.tags.filter((t): t is string => typeof t === "string") : [],
        prefix: text(h.prefix) ?? "",
        suffix: text(h.suffix) ?? "",
        kind: text(h.kind) ?? undefined,
        title: text(h.title),
        startSeconds: typeof h.startSeconds === "number" ? h.startSeconds : null,
        endSeconds: typeof h.endSeconds === "number" ? h.endSeconds : null,
        createdAt: date(h.createdAt) ?? undefined,
      },
    });
    result.highlights++;
  }

  // Settings: only where nothing is set yet.
  const settings = (data.settings ?? {}) as Row;
  for (const key of SETTING_KEYS) {
    if (settings[key] === undefined || settings[key] === null) continue;
    if (await prisma.setting.findUnique({ where: { key } })) continue;
    const value = typeof settings[key] === "string" ? settings[key] : JSON.stringify(settings[key]);
    await prisma.setting.create({ data: { key, value: value as string } });
    result.settings++;
  }
  return result;
}
