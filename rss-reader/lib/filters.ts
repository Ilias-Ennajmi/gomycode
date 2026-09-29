import type { FilterRule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function getFilterRules() {
  return prisma.filterRule.findMany({ orderBy: { createdAt: "asc" } });
}

export function mutedFeedIds(rules: FilterRule[]): Set<string> {
  return new Set(
    rules.filter((r) => r.action === "hide" && r.match === "feed").map((r) => r.value)
  );
}

/** Excludes articles whose title or summary contains a hidden keyword. */
export function hiddenKeywordClauses(rules: FilterRule[]): Prisma.ArticleWhereInput[] {
  return rules
    .filter((r) => r.action === "hide" && r.match === "keyword")
    .map((r) => ({
      NOT: {
        OR: [
          { title: { contains: r.value, mode: "insensitive" } },
          // "summary IS NOT NULL" first: SQL's NOT over a NULL comparison is NULL, which
          // would hide every article without a summary (saved links, some videos).
          {
            AND: [
              { summary: { not: null } },
              { summary: { contains: r.value, mode: "insensitive" } },
            ],
          },
        ],
      },
    }));
}

/**
 * Everything hidden by the user's rules. A muted feed stays visible when the
 * user explicitly opens that feed.
 */
export function hiddenArticleClauses(
  rules: FilterRule[],
  viewingFeedId?: string
): Prisma.ArticleWhereInput[] {
  const clauses = hiddenKeywordClauses(rules);
  const muted = Array.from(mutedFeedIds(rules)).filter((id) => id !== viewingFeedId);
  if (muted.length > 0) clauses.push({ feedId: { notIn: muted } });
  return clauses;
}

export function isBoosted(
  rules: FilterRule[],
  article: { feedId: string; title: string; summary: string | null }
): boolean {
  const text = `${article.title} ${article.summary ?? ""}`.toLowerCase();
  return rules.some(
    (r) =>
      r.action === "boost" &&
      (r.match === "feed" ? r.value === article.feedId : text.includes(r.value.toLowerCase()))
  );
}
