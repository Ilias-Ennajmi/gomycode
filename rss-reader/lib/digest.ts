import { prisma } from "@/lib/prisma";
import { generateText, isAiEnabled } from "@/lib/ai";
import { getFilterRules, hiddenArticleClauses, isBoosted } from "@/lib/filters";
import { stripHtml } from "@/lib/utils";

const TIMEZONE = process.env.APP_TIMEZONE || "Europe/Paris";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_STORIES = 3;
const MAX_STORIES = 12;

export interface DigestItem {
  articleId: string;
  headline: string;
  blurb: string;
  sources: string[];
}

export interface Digest {
  date: string;
  intro: string;
  items: DigestItem[];
}

function todayKey() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

/** Today's briefing, written on the first request of the day and then cached. */
export async function getOrCreateDigest(): Promise<Digest | null> {
  const date = todayKey();
  const existing = await prisma.dailyDigest.findUnique({ where: { date } });
  if (existing) return { date, ...JSON.parse(existing.content) };
  if (!isAiEnabled()) return null;

  const rules = await getFilterRules();
  const articles = await prisma.article.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - DAY_MS) },
      isPromo: false,
      AND: hiddenArticleClauses(rules),
    },
    orderBy: { publishedAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      feedId: true,
      topicId: true,
      publishedAt: true,
      feed: { select: { title: true } },
    },
  });

  // One entry per story; stories covered by more sources rank first.
  const stories = new Map<string, { lead: (typeof articles)[number]; sources: Set<string> }>();
  for (const article of articles) {
    const key = article.topicId ?? article.id;
    const story = stories.get(key);
    if (story) story.sources.add(article.feed.title);
    else stories.set(key, { lead: article, sources: new Set([article.feed.title]) });
  }
  const weight = (s: { lead: (typeof articles)[number]; sources: Set<string> }) =>
    s.sources.size + (isBoosted(rules, s.lead) ? 2 : 0);
  const ranked = Array.from(stories.values())
    .sort(
      (a, b) => weight(b) - weight(a) || b.lead.publishedAt.getTime() - a.lead.publishedAt.getTime()
    )
    .slice(0, MAX_STORIES);
  if (ranked.length < MIN_STORIES) return null;

  const list = ranked
    .map(
      (s, i) =>
        `${i + 1}. ${s.lead.title} — ${stripHtml(s.lead.summary || s.lead.content).slice(0, 300)} ` +
        `(sources: ${Array.from(s.sources).join(", ")})`
    )
    .join("\n");
  const raw = await generateText(list, {
    system:
      "You write a short morning briefing from a reader's own news feed. Pick the 3-5 most important " +
      "stories, favouring ones covered by several sources. Be factual and neutral. Reply with JSON: " +
      '{"intro": "one or two sentences on the day\'s main themes", "items": [{"story": <number>, ' +
      '"headline": "short headline", "blurb": "one sentence on why it matters"}]}.',
    json: true,
    maxTokens: 700,
  });
  const parsed = JSON.parse(raw) as {
    intro?: string;
    items?: { story?: number; headline?: string; blurb?: string }[];
  };
  const items: DigestItem[] = (parsed.items ?? []).flatMap((item) => {
    const story = ranked[Number(item.story) - 1];
    if (!story || !item.headline) return [];
    return [
      {
        articleId: story.lead.id,
        headline: item.headline,
        blurb: item.blurb ?? "",
        sources: Array.from(story.sources),
      },
    ];
  });
  if (items.length === 0) return null;

  const content = JSON.stringify({ intro: parsed.intro ?? "", items });
  await prisma.dailyDigest.upsert({ where: { date }, create: { date, content }, update: {} });
  return { date, intro: parsed.intro ?? "", items };
}
