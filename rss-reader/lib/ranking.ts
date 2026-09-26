import type { FilterRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cosine } from "@/lib/ai";
import { isBoosted } from "@/lib/filters";

const HALF_LIFE_HOURS = 12;
const BOOST_BONUS = 0.6;
const UNREAD_BONUS = 0.1;
const SOURCE_AFFINITY_WEIGHT = 0.3;
const TOPIC_AFFINITY_WEIGHT = 0.4;
const BIG_STORY_WEIGHT = 0.12;
const PROFILE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SIGNALS = 5; // Below this, personalisation would just be noise.

export interface RankableArticle {
  feedId: string;
  title: string;
  summary: string | null;
  publishedAt: Date;
  isRead: boolean;
  embedding: number[];
}

export interface ReadingProfile {
  /** How many read or saved articles the profile learned from. */
  learnedFrom: number;
  /** 0..1 per feed, relative to the feed read most. */
  sourceAffinity: Map<string, number>;
  /** Mean embedding of what was read and saved; empty without AI. */
  interest: number[];
}

/**
 * Learns from the last 30 days of reading: which sources get opened, and
 * (with AI embeddings) which subjects. Saves count double.
 */
export async function buildReadingProfile(): Promise<ReadingProfile> {
  const since = new Date(Date.now() - PROFILE_WINDOW_MS);
  const engaged = await prisma.article.findMany({
    where: { OR: [{ readAt: { gte: since } }, { savedAt: { gte: since } }] },
    orderBy: { readAt: "desc" },
    take: 300,
    select: { feedId: true, isSaved: true, embedding: true },
  });

  const perFeed = new Map<string, number>();
  let interest: number[] = [];
  for (const article of engaged) {
    const weight = article.isSaved ? 2 : 1;
    perFeed.set(article.feedId, (perFeed.get(article.feedId) ?? 0) + weight);
    if (article.embedding.length > 0) {
      if (interest.length === 0) interest = new Array(article.embedding.length).fill(0);
      article.embedding.forEach((v, i) => (interest[i] += v * weight));
    }
  }
  const top = Math.max(1, ...Array.from(perFeed.values()));
  const sourceAffinity = new Map(Array.from(perFeed, ([id, n]) => [id, n / top]));
  const norm = Math.sqrt(interest.reduce((s, v) => s + v * v, 0));
  if (norm > 0) interest = interest.map((v) => v / norm);

  return { learnedFrom: engaged.length, sourceAffinity, interest };
}

/**
 * Transparent score: freshness halves every 12 hours; boosts, unread state,
 * stories many sources cover, and learned source/subject affinity add on top.
 */
export function scoreArticle(
  article: RankableArticle,
  rules: FilterRule[],
  now = Date.now(),
  profile?: ReadingProfile,
  topicSize = 1
): { score: number; boosted: boolean } {
  const ageHours = Math.max(0, (now - article.publishedAt.getTime()) / 3_600_000);
  const freshness = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
  const boosted = isBoosted(rules, article);
  let score = freshness + (boosted ? BOOST_BONUS : 0) + (article.isRead ? 0 : UNREAD_BONUS);

  if (topicSize > 1) score += BIG_STORY_WEIGHT * Math.log2(topicSize);

  if (profile && profile.learnedFrom >= MIN_SIGNALS) {
    score += SOURCE_AFFINITY_WEIGHT * (profile.sourceAffinity.get(article.feedId) ?? 0);
    if (profile.interest.length > 0 && article.embedding.length === profile.interest.length) {
      const similarity = cosine(article.embedding, profile.interest);
      score += TOPIC_AFFINITY_WEIGHT * Math.min(1, Math.max(0, (similarity - 0.45) / 0.4));
    }
  }
  return { score, boosted };
}
