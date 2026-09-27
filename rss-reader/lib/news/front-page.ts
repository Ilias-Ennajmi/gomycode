import { prisma } from "@/lib/prisma";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { DESKS, MOROCCO_PATTERN, type DeskId } from "@/lib/news/desks";

// Builds the News tab from the last day and a half of news-source articles:
// a hero slider of the biggest stories, one block per section, stories that
// are developing right now, and Morocco as seen by the foreign press.

const WINDOW_MS = 36 * 60 * 60 * 1000;
const DEVELOPING_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_ARTICLES = 700;
const HERO_COUNT = 6;
const SECTION_SIZE = 7;

export interface StorySource {
  id: string;
  title: string;
  faviconUrl: string | null;
}

export interface NewsStory {
  /** The lead article's id: what opens in the reader. */
  id: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string;
  isRead: boolean;
  desk: string;
  source: StorySource;
  /** Every outlet covering the story, lead first. */
  sources: StorySource[];
  /** Other articles on the same story. */
  related: { id: string; title: string; source: StorySource }[];
}

export interface NewsSection {
  id: DeskId;
  name: string;
  stories: NewsStory[];
}

export interface FrontPage {
  hasSources: boolean;
  hero: NewsStory[];
  developing: NewsStory[];
  moroccoAbroad: NewsStory[];
  sections: NewsSection[];
  /** Headlines for the AI insights, most important first. */
  headlines: string[];
  updatedAt: string;
}

type Row = Awaited<ReturnType<typeof loadArticles>>[number];

function loadArticles(where: object) {
  return prisma.article.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: MAX_ARTICLES,
    select: {
      id: true,
      title: true,
      summary: true,
      aiSummary: true,
      imageUrl: true,
      publishedAt: true,
      isRead: true,
      topicId: true,
      feed: { select: { id: true, title: true, faviconUrl: true, newsDesk: true, region: true } },
    },
  });
}

function plain(text: string | null) {
  if (!text) return null;
  const stripped = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.slice(0, 280) : null;
}

const source = (row: Row): StorySource => ({
  id: row.feed.id,
  title: row.feed.title,
  faviconUrl: row.feed.faviconUrl,
});

const isMoroccan = (row: Row) => row.feed.region === "ma" || row.feed.newsDesk === "morocco";

const mentionsMorocco = (row: Row) => MOROCCO_PATTERN.test(`${row.title} ${row.summary ?? ""}`);

interface Group {
  members: Row[];
  lead: Row;
  feeds: Set<string>;
  latest: number;
}

function toStory(group: Group): NewsStory {
  const { lead } = group;
  const seen = new Set<string>([lead.feed.id]);
  const others = group.members.filter((m) => m.id !== lead.id);
  const sources = [source(lead)];
  for (const m of others) {
    if (seen.has(m.feed.id)) continue;
    seen.add(m.feed.id);
    sources.push(source(m));
  }
  return {
    id: lead.id,
    title: lead.title,
    summary: lead.aiSummary || plain(lead.summary),
    imageUrl: lead.imageUrl,
    publishedAt: lead.publishedAt.toISOString(),
    isRead: lead.isRead,
    desk: lead.feed.newsDesk ?? "world",
    source: source(lead),
    sources,
    related: others.slice(0, 6).map((m) => ({ id: m.id, title: m.title, source: source(m) })),
  };
}

/** Bigger (more outlets), fresher stories with a picture rank higher. */
function score(group: Group, now: number) {
  const hours = (now - group.latest) / HOUR_MS;
  return group.feeds.size * 10 + Math.max(0, 24 - hours) + (group.lead.imageUrl ? 4 : 0);
}

function group(rows: Row[]): Group[] {
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.topicId ?? row.id;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return Array.from(byKey.values()).map((members) => {
    // Lead with the newest article that has a picture.
    const sorted = [...members].sort(
      (a, b) =>
        Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) ||
        b.publishedAt.getTime() - a.publishedAt.getTime()
    );
    return {
      members,
      lead: sorted[0],
      feeds: new Set(members.map((m) => m.feed.id)),
      latest: Math.max(...members.map((m) => m.publishedAt.getTime())),
    };
  });
}

/** Picks stories in order, at most `perFeed` from one outlet. */
function pickVaried(groups: Group[], count: number, perFeed: number, skip: Set<string>) {
  const perSource = new Map<string, number>();
  const picked: Group[] = [];
  for (const g of groups) {
    if (picked.length >= count) break;
    if (skip.has(g.lead.id)) continue;
    const used = perSource.get(g.lead.feed.id) ?? 0;
    if (used >= perFeed) continue;
    perSource.set(g.lead.feed.id, used + 1);
    picked.push(g);
  }
  return picked;
}

export async function buildFrontPage(hiddenDesks: string[] = []): Promise<FrontPage> {
  const now = Date.now();
  const rules = await getFilterRules();
  const newsFeeds = await prisma.feed.count({ where: { newsDesk: { not: null } } });
  const empty: FrontPage = {
    hasSources: newsFeeds > 0,
    hero: [],
    developing: [],
    moroccoAbroad: [],
    sections: [],
    headlines: [],
    updatedAt: new Date(now).toISOString(),
  };
  if (newsFeeds === 0) return empty;

  const rows = await loadArticles({
    publishedAt: { gte: new Date(now - WINDOW_MS) },
    isPromo: false,
    feed: { newsDesk: { not: null } },
    AND: hiddenArticleClauses(rules),
  });
  if (rows.length === 0) return empty;

  const groups = group(rows).sort((a, b) => score(b, now) - score(a, now));

  const hero = pickVaried(
    groups.filter((g) => g.lead.imageUrl),
    HERO_COUNT,
    2,
    new Set()
  );
  const shown = new Set(hero.map((g) => g.lead.id));

  const sections: NewsSection[] = DESKS.filter((d) => !hiddenDesks.includes(d.id)).flatMap(
    (desk) => {
      const inDesk = groups.filter((g) =>
        desk.id === "morocco"
          ? g.members.some((m) => m.feed.newsDesk === "morocco" || mentionsMorocco(m))
          : g.members.some((m) => m.feed.newsDesk === desk.id)
      );
      const picked = pickVaried(inDesk, SECTION_SIZE, 3, shown);
      if (picked.length === 0) return [];
      // A section leads with a picture when it can.
      const withImage = picked.findIndex((g) => g.lead.imageUrl);
      if (withImage > 0) picked.unshift(...picked.splice(withImage, 1));
      return [{ id: desk.id, name: desk.name, stories: picked.map(toStory) }];
    }
  );

  // Stories gaining outlets in the last few hours (needs AI story grouping).
  const developing = groups
    .filter((g) => g.feeds.size >= 3 && now - g.latest < DEVELOPING_MS)
    .map((g) => ({
      g,
      fresh: g.members.filter((m) => now - m.publishedAt.getTime() < DEVELOPING_MS).length,
    }))
    .filter(({ fresh }) => fresh >= 2)
    .sort((a, b) => b.fresh - a.fresh)
    .slice(0, 5)
    .map(({ g }) => toStory(g));

  // Morocco as covered by outlets outside Morocco.
  const moroccoAbroad = rows
    .filter((r) => !isMoroccan(r) && mentionsMorocco(r))
    .slice(0, 8)
    .map((r) => toStory({ members: [r], lead: r, feeds: new Set([r.feed.id]), latest: 0 }));

  return {
    hasSources: true,
    hero: hero.map(toStory),
    developing,
    moroccoAbroad,
    sections,
    headlines: groups
      .slice(0, 30)
      .map(
        (g) =>
          `${g.lead.title} (${g.lead.feed.title}${g.feeds.size > 1 ? `, +${g.feeds.size - 1} outlets` : ""})`
      ),
    updatedAt: new Date(now).toISOString(),
  };
}
