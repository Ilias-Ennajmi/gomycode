import { prisma } from "@/lib/prisma";
import { cosine, embedTexts, findPromotions, isAiEnabled } from "@/lib/ai";
import { stripHtml } from "@/lib/utils";

const BATCH_SIZE = 50; // Keeps each refresh well inside Gemini's free-tier rate limits.
const ENRICH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLUSTER_WINDOW_MS = 48 * 60 * 60 * 1000;
// Real gemini-embedding-2 scores: same story from two outlets >= 0.86, different
// stories on one subject <= 0.82. The shared-name check below covers the overlap.
export const SAME_STORY_SIMILARITY = 0.84;

const GENERIC_WORDS = new Set(
  (
    "the a an and or of for to in on at by with from new how why what when who this that these " +
    "here is are its it's watch review hands-on exclusive update updates breaking live video today " +
    "week report reports first after le la les un une des du de et en pour sur avec"
  ).split(" ")
);

// Unicode-aware so accented and non-Latin headlines work too.
const WORD_SEPARATOR = new RegExp("[^\\p{L}\\p{N}-]+", "u");
const UPPERCASE = new RegExp("\\p{Lu}", "u");

/** Distinctive names in a headline: capitalised words and anything with a digit (M6, GPT-5). */
export function headlineNames(title: string) {
  const names = new Set<string>();
  for (const word of title.split(WORD_SEPARATOR)) {
    const lower = word.toLowerCase();
    if (word.length < 2 || GENERIC_WORDS.has(lower)) continue;
    if (UPPERCASE.test(word[0]) || /\d/.test(word)) names.add(lower);
  }
  return names;
}

function articleText(article: { title: string; summary: string | null; content: string | null }) {
  return `${article.title}. ${stripHtml(article.summary || article.content).slice(0, 600)}`;
}

/**
 * Embeds and screens the newest un-enriched articles, then regroups the last
 * 48 hours into topics. Safe to call on every refresh; a no-op without a key.
 */
export async function runAiPipeline() {
  if (!isAiEnabled()) return { enriched: 0, topics: 0 };
  let enriched = 0;
  try {
    enriched = await enrichArticles();
  } catch (error) {
    console.error("AI enrichment skipped", error);
  }
  const topics = await clusterRecentArticles().catch((error) => {
    console.error("Story clustering skipped", error);
    return 0;
  });
  return { enriched, topics };
}

async function enrichArticles() {
  const pending = await prisma.article.findMany({
    where: {
      embedding: { isEmpty: true },
      publishedAt: { gte: new Date(Date.now() - ENRICH_WINDOW_MS) },
    },
    orderBy: { publishedAt: "desc" },
    take: BATCH_SIZE,
    select: { id: true, title: true, summary: true, content: true, isVideo: true },
  });
  if (pending.length === 0) return 0;

  const embeddings = await embedTexts(pending.map(articleText));
  // Promotion screening is a nice-to-have; embeddings are still saved if it fails.
  const promos = await findPromotions(
    pending
      .filter((a) => !a.isVideo)
      .map((a) => ({ id: a.id, title: a.title, summary: stripHtml(a.summary || a.content) }))
  ).catch((error) => {
    console.error("Promotion screening skipped", error);
    return new Set<string>();
  });

  await prisma.$transaction(
    pending.map((article, i) =>
      prisma.article.update({
        where: { id: article.id },
        data: { embedding: embeddings[i], isPromo: promos.has(article.id) },
      })
    )
  );
  return pending.length;
}

/** Greedy single-pass clustering: good enough for a few hundred articles. */
export function groupSimilar<T extends { feedId: string; title: string; embedding: number[] }>(
  articles: T[],
  threshold = SAME_STORY_SIMILARITY
) {
  const clusters: { members: T[]; centroid: number[]; names: Set<string> }[] = [];
  for (const article of articles) {
    const names = headlineNames(article.title);
    let best: (typeof clusters)[number] | null = null;
    let bestScore = threshold;
    for (const cluster of clusters) {
      // Similar subject isn't enough: the headlines must name the same thing.
      if (!Array.from(names).some((name) => cluster.names.has(name))) continue;
      const score = cosine(article.embedding, cluster.centroid);
      if (score >= bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best) {
      best.members.push(article);
      names.forEach((name) => best!.names.add(name));
      const n = best.members.length;
      const sum = best.centroid.map((v, i) => v * (n - 1) + article.embedding[i]);
      const norm = Math.sqrt(sum.reduce((s, v) => s + v * v, 0)) || 1;
      best.centroid = sum.map((v) => v / norm);
    } else {
      clusters.push({ members: [article], centroid: article.embedding, names });
    }
  }
  // A topic is the same story from at least two different sources.
  return clusters
    .map((c) => c.members)
    .filter((members) => new Set(members.map((m) => m.feedId)).size >= 2);
}

async function clusterRecentArticles() {
  const recent = await prisma.article.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - CLUSTER_WINDOW_MS) },
      isPromo: false,
      NOT: { embedding: { isEmpty: true } },
    },
    orderBy: { publishedAt: "asc" },
    select: { id: true, feedId: true, title: true, embedding: true, publishedAt: true },
  });
  const groups = groupSimilar(recent);

  await prisma.$transaction(async (tx) => {
    // Topics only cover the rolling window, so rebuilding them is cheap and
    // avoids stale groupings; deleting a topic unlinks its articles.
    await tx.topic.deleteMany({});
    for (const members of groups) {
      const newest = members[members.length - 1];
      await tx.topic.create({
        data: {
          title: newest.title,
          articles: { connect: members.map((m) => ({ id: m.id })) },
        },
      });
    }
  });
  return groups.length;
}
