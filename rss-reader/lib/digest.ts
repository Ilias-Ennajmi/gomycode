import type { FilterRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AiError, generateText, isAiEnabled } from "@/lib/ai";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { buildReadingProfile, scoreArticle, type ReadingProfile } from "@/lib/ranking";
import { deskName } from "@/lib/news/desks";
import { stripHtml } from "@/lib/utils";

// The Today briefing, in the spirit of Axios' "Smart Brevity" and Apple News
// Today: the big picture, a handful of top stories with bullets and why they
// matter, the day's numbers, picks per interest, what to watch and read, and
// more stories on demand. Written once a day, refreshable every 3 hours.

const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REFRESH_AFTER_MS = 3 * HOUR_MS;
const VERSION = 2;
const POOL_SIZE = 40;
const PROMPT_STORIES = 16;
const MORE_BATCH = 5;
const LONG_READ_CHARS = 9000;

export interface BriefSource {
  title: string;
  faviconUrl: string | null;
}

export interface BriefStory {
  articleId: string;
  headline: string;
  bullets: string[];
  why: string;
  imageUrl: string | null;
  section: string | null;
  sources: BriefSource[];
}

export interface BriefPick {
  articleId: string;
  title: string;
  note: string | null;
  source: BriefSource;
  imageUrl: string | null;
}

export interface Briefing {
  version: number;
  date: string;
  generatedAt: string;
  bigPicture: string;
  top: BriefStory[];
  numbers: { value: string; label: string; articleId: string }[];
  interests: { name: string; picks: BriefPick[] }[];
  watch: BriefPick[];
  newsletters: BriefPick[];
  longRead: (BriefPick & { minutes: number }) | null;
  /** Story keys still available for "More stories" / "Shuffle". */
  pool: string[];
  /** How many stories there were to choose from. */
  scanned: number;
}

function todayKey() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

type Row = Awaited<ReturnType<typeof loadRecent>>[number];

function loadRecent(rules: FilterRule[], sinceMs: number) {
  return prisma.article.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - sinceMs) },
      isPromo: false,
      feed: { type: { not: "manual" } },
      AND: hiddenArticleClauses(rules),
    },
    orderBy: { publishedAt: "desc" },
    take: 500,
    select: {
      id: true,
      title: true,
      summary: true,
      aiSummary: true,
      content: true,
      imageUrl: true,
      isVideo: true,
      isRead: true,
      feedId: true,
      topicId: true,
      publishedAt: true,
      embedding: true,
      feed: {
        select: {
          title: true,
          faviconUrl: true,
          type: true,
          newsDesk: true,
          category: { select: { name: true } },
        },
      },
    },
  });
}

interface Story {
  key: string;
  lead: Row;
  members: Row[];
  score: number;
}

const source = (row: Row): BriefSource => ({
  title: row.feed.title,
  faviconUrl: row.feed.faviconUrl,
});

function snippet(row: Row, length = 280) {
  return (row.aiSummary || stripHtml(row.summary || row.content || "")).slice(0, length).trim();
}

function sectionOf(row: Row) {
  if (row.feed.newsDesk) return deskName(row.feed.newsDesk);
  return row.feed.category?.name ?? null;
}

function rankStories(rows: Row[], rules: FilterRule[], profile: ReadingProfile): Story[] {
  const now = Date.now();
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.topicId ?? row.id;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return Array.from(byKey, ([key, members]) => {
    const outlets = new Set(members.map((m) => m.feedId)).size;
    const scored = members.map((m) => ({
      m,
      s: scoreArticle(m, rules, now, profile, outlets).score,
    }));
    scored.sort(
      (a, b) => Number(Boolean(b.m.imageUrl)) - Number(Boolean(a.m.imageUrl)) || b.s - a.s
    );
    return { key, lead: scored[0].m, members, score: Math.max(...scored.map((x) => x.s)) };
  }).sort((a, b) => b.score - a.score);
}

function describe(stories: Story[]) {
  return stories
    .map((s, i) => {
      const outlets = Array.from(new Set(s.members.map((m) => m.feed.title)));
      const section = sectionOf(s.lead);
      return (
        `${i + 1}. ${section ? `[${section}] ` : ""}${s.lead.title} — ${snippet(s.lead)} ` +
        `(sources: ${outlets.slice(0, 6).join(", ")})`
      );
    })
    .join("\n");
}

type Written = { story?: number; headline?: string; bullets?: unknown; why?: string };

function toBriefStory(story: Story, written?: Written): BriefStory {
  const bullets = Array.isArray(written?.bullets)
    ? written!.bullets.filter((b): b is string => typeof b === "string" && b.trim() !== "")
    : [];
  const seen = new Set<string>();
  const sources = story.members.flatMap((m) => {
    if (seen.has(m.feedId)) return [];
    seen.add(m.feedId);
    return [source(m)];
  });
  return {
    articleId: story.lead.id,
    headline: written?.headline?.trim() || story.lead.title,
    bullets: bullets.length > 0 ? bullets.slice(0, 3) : [snippet(story.lead, 220)].filter(Boolean),
    why: written?.why?.trim() ?? "",
    imageUrl: story.lead.imageUrl,
    section: sectionOf(story.lead),
    sources,
  };
}

const WRITER_RULES =
  "Use only facts in the provided text; never invent. Headlines: max 10 words, plain and specific. " +
  "Bullets: 2-3 short facts (max 22 words each). 'why': one sentence on why it matters to a curious " +
  "reader in Morocco who follows the world, Europe, tech and business. Write in English even when the " +
  "source is French.";

async function writeTop(stories: Story[]) {
  const text = await generateText(describe(stories), {
    system:
      "You are the editor of a personal daily briefing in the style of Axios Smart Brevity, built from " +
      "the reader's own feeds (ranked by what they read). Pick the 5-7 most important stories, favouring " +
      "ones several outlets cover and the reader's interests, and mix subjects. " +
      WRITER_RULES +
      ' Reply with JSON: {"bigPicture": "two sentences connecting the day\'s main threads", ' +
      '"top": [{"story": <number>, "headline": "...", "bullets": ["..."], "why": "..."}], ' +
      '"numbers": [{"value": "a figure exactly as written in the text, e.g. 4.2%", "label": ' +
      '"what it measures, max 8 words", "story": <number>}]}. Give 0-3 numbers, only real figures.',
    json: true,
    maxTokens: 2000,
  });
  return JSON.parse(text) as {
    bigPicture?: string;
    top?: Written[];
    numbers?: { value?: string; label?: string; story?: number }[];
  };
}

/** Headlines, bullets and "why it matters" for extra stories (More / Shuffle). */
async function writeStories(stories: Story[]): Promise<BriefStory[]> {
  if (!isAiEnabled()) return stories.map((s) => toBriefStory(s));
  try {
    const text = await generateText(describe(stories), {
      system:
        "You write entries for a personal daily briefing in the style of Axios Smart Brevity. Write one " +
        "entry for every story listed, in the same order. " +
        WRITER_RULES +
        ' Reply with JSON: {"stories": [{"story": <number>, "headline": "...", "bullets": ["..."], "why": "..."}]}',
      json: true,
      maxTokens: 1500,
    });
    const parsed = JSON.parse(text) as { stories?: Written[] };
    const byNumber = new Map((parsed.stories ?? []).map((w) => [Number(w.story), w]));
    return stories.map((s, i) => toBriefStory(s, byNumber.get(i + 1)));
  } catch (error) {
    if (!(error instanceof AiError && error.status === 429))
      console.error("Briefing entries failed", error);
    return stories.map((s) => toBriefStory(s));
  }
}

function pick(row: Row, note: string | null = null): BriefPick {
  return { articleId: row.id, title: row.title, note, source: source(row), imageUrl: row.imageUrl };
}

async function buildBriefing(date: string): Promise<Briefing | null> {
  const [rules, profile] = await Promise.all([getFilterRules(), buildReadingProfile()]);
  const recent = await loadRecent(rules, 2 * DAY_MS);
  const lastDay = recent.filter((r) => Date.now() - r.publishedAt.getTime() < DAY_MS);

  // Top stories come from articles, not videos or newsletters.
  const stories = rankStories(
    lastDay.filter((r) => !r.isVideo && r.feed.type !== "newsletter"),
    rules,
    profile
  ).slice(0, POOL_SIZE);
  if (stories.length < 3) return null;

  const candidates = stories.slice(0, PROMPT_STORIES);
  let bigPicture = "";
  let top: BriefStory[] = [];
  let numbers: Briefing["numbers"] = [];
  if (isAiEnabled()) {
    try {
      const written = await writeTop(candidates);
      bigPicture = written.bigPicture?.trim() ?? "";
      const used = new Set<number>();
      top = (written.top ?? []).flatMap((w) => {
        const n = Number(w.story);
        const story = candidates[n - 1];
        if (!story || used.has(n)) return [];
        used.add(n);
        return [toBriefStory(story, w)];
      });
      numbers = (written.numbers ?? []).flatMap((num) => {
        const story = candidates[Number(num.story) - 1];
        if (!story || !num.value || !num.label) return [];
        return [
          {
            value: num.value.slice(0, 16),
            label: num.label.slice(0, 80),
            articleId: story.lead.id,
          },
        ];
      });
    } catch (error) {
      if (!(error instanceof AiError && error.status === 429))
        console.error("Briefing failed", error);
    }
  }
  // Without the AI (or if it fails), the briefing still lists the top stories.
  if (top.length === 0) top = candidates.slice(0, 6).map((s) => toBriefStory(s));

  const inTop = new Set(top.map((t) => t.articleId));
  const topKeys = new Set(stories.filter((s) => inTop.has(s.lead.id)).map((s) => s.key));

  // Two or three picks per interest (the reader's own categories and News sections).
  const interestMap = new Map<string, BriefPick[]>();
  for (const story of stories) {
    if (topKeys.has(story.key)) continue;
    const name = sectionOf(story.lead);
    if (!name) continue;
    const picks = interestMap.get(name) ?? [];
    if (picks.length >= 3) continue;
    picks.push(pick(story.lead, story.lead.aiSummary ?? null));
    interestMap.set(name, picks);
  }
  const interests = Array.from(interestMap, ([name, picks]) => ({ name, picks }))
    .filter((i) => i.picks.length > 0)
    .slice(0, 6);
  const shownInInterests = new Set(interests.flatMap((i) => i.picks.map((p) => p.articleId)));

  const now = Date.now();
  const rankUnread = (rows: Row[]) =>
    rows
      .filter((r) => !r.isRead)
      .map((r) => ({ r, s: scoreArticle(r, rules, now, profile).score }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.r);

  const watch = rankUnread(recent.filter((r) => r.isVideo))
    .slice(0, 4)
    .map((r) => pick(r));
  const newsletters = rankUnread(recent.filter((r) => r.feed.type === "newsletter"))
    .slice(0, 3)
    .map((r) => pick(r, snippet(r, 160) || null));

  const long = rankUnread(
    recent.filter(
      (r) =>
        !r.isVideo &&
        !inTop.has(r.id) &&
        !shownInInterests.has(r.id) &&
        stripHtml(r.content || "").length >= LONG_READ_CHARS
    )
  )[0];
  const longRead = long
    ? {
        ...pick(long, snippet(long, 200) || null),
        minutes: Math.max(5, Math.round(stripHtml(long.content || "").split(/\s+/).length / 230)),
      }
    : null;

  return {
    version: VERSION,
    date,
    generatedAt: new Date().toISOString(),
    bigPicture,
    top,
    numbers,
    interests,
    watch,
    newsletters,
    longRead,
    pool: stories.filter((s) => !topKeys.has(s.key)).map((s) => s.key),
    scanned: lastDay.length,
  };
}

async function readStored(date: string): Promise<Briefing | null> {
  const row = await prisma.dailyDigest.findUnique({ where: { date } });
  if (!row) return null;
  try {
    const value = JSON.parse(row.content) as Briefing;
    return value.version === VERSION ? value : null;
  } catch {
    return null;
  }
}

async function store(briefing: Briefing) {
  const content = JSON.stringify(briefing);
  await prisma.dailyDigest.upsert({
    where: { date: briefing.date },
    create: { date: briefing.date, content },
    update: { content },
  });
}

/** Today's briefing, written on the first request of the day and then cached. */
export async function getOrCreateBriefing(): Promise<Briefing | null> {
  const date = todayKey();
  const stored = await readStored(date);
  if (stored) return stored;
  const briefing = await buildBriefing(date);
  if (briefing) await store(briefing);
  return briefing;
}

/** Rewrites today's briefing, at most once every three hours to spare the free AI quota. */
export async function refreshBriefing(): Promise<{ briefing: Briefing | null; nextAt?: string }> {
  const date = todayKey();
  const stored = await readStored(date);
  if (stored) {
    const age = Date.now() - new Date(stored.generatedAt).getTime();
    if (age < REFRESH_AFTER_MS) {
      return {
        briefing: stored,
        nextAt: new Date(new Date(stored.generatedAt).getTime() + REFRESH_AFTER_MS).toISOString(),
      };
    }
  }
  const briefing = await buildBriefing(date);
  if (briefing) await store(briefing);
  return { briefing: briefing ?? stored };
}

/** "More stories" (the next ones by rank) or "Shuffle" (a random handful), written on demand. */
export async function moreStories(exclude: string[], mode: "next" | "shuffle") {
  const briefing = await getOrCreateBriefing();
  if (!briefing) return [];
  const skip = new Set(exclude);
  const [rules, profile] = await Promise.all([getFilterRules(), buildReadingProfile()]);
  const recent = await loadRecent(rules, DAY_MS);
  const stories = rankStories(
    recent.filter((r) => !r.isVideo && r.feed.type !== "newsletter"),
    rules,
    profile
  ).filter((s) => briefing.pool.includes(s.key) && !s.members.some((m) => skip.has(m.id)));

  let chosen: Story[];
  if (mode === "shuffle") {
    const shuffled = [...stories];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    chosen = shuffled.slice(0, MORE_BATCH);
  } else {
    chosen = stories.slice(0, MORE_BATCH);
  }
  if (chosen.length === 0) return [];
  return writeStories(chosen);
}
