import { prisma } from "@/lib/prisma";
import { cosine, embedTexts, findPromotions, isAiEnabled } from "@/lib/ai";
import { stripHtml } from "@/lib/utils";

const BATCH_SIZE = 50; // Keeps each refresh well inside Gemini's free-tier rate limits.
const ENRICH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLUSTER_WINDOW_MS = 48 * 60 * 60 * 1000;
export const SAME_STORY_SIMILARITY = 0.82;

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
export function groupSimilar<T extends { feedId: string; embedding: number[] }>(
  articles: T[],
  threshold = SAME_STORY_SIMILARITY
) {
  const clusters: { members: T[]; centroid: number[] }[] = [];
  for (const article of articles) {
    let best: (typeof clusters)[number] | null = null;
    let bestScore = threshold;
    for (const cluster of clusters) {
      const score = cosine(article.embedding, cluster.centroid);
      if (score >= bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best) {
      best.members.push(article);
      const n = best.members.length;
      const sum = best.centroid.map((v, i) => v * (n - 1) + article.embedding[i]);
      const norm = Math.sqrt(sum.reduce((s, v) => s + v * v, 0)) || 1;
      best.centroid = sum.map((v) => v / norm);
    } else {
      clusters.push({ members: [article], centroid: article.embedding });
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
