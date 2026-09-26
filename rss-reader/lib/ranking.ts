import type { FilterRule } from "@prisma/client";
import { isBoosted } from "@/lib/filters";

const HALF_LIFE_HOURS = 12;
const BOOST_BONUS = 0.6;
const UNREAD_BONUS = 0.1;

export interface RankableArticle {
  feedId: string;
  title: string;
  summary: string | null;
  publishedAt: Date;
  isRead: boolean;
}

/**
 * Transparent score: freshness decays by half every 12 hours, boosted
 * articles get a fixed lift, unread ones a small nudge. Personal affinity
 * is added on top once the AI layer learns from reading history.
 */
export function scoreArticle(
  article: RankableArticle,
  rules: FilterRule[],
  now = Date.now()
): { score: number; boosted: boolean } {
  const ageHours = Math.max(0, (now - article.publishedAt.getTime()) / 3_600_000);
  const freshness = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
  const boosted = isBoosted(rules, article);
  const score = freshness + (boosted ? BOOST_BONUS : 0) + (article.isRead ? 0 : UNREAD_BONUS);
  return { score, boosted };
}
