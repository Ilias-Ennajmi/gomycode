import type { FilterRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFilterRules, mutedFeedIds } from "@/lib/filters";
import { sendToAll, type PushMessage } from "@/lib/push";

// Rules that act on new articles as they arrive (after each refresh):
// - alert: a notification when an article mentions a word, or for everything from a source,
//   and the article is listed in Alerts;
// - save: an article that mentions a word (or comes from a source) goes straight to Later.
// Hidden articles (hide rules, muted sources) never trigger anything.

/** At most this many notifications per refresh; the rest are in Alerts. */
const MAX_NOTIFICATIONS = 4;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole words, any case and accents as typed: "AI" doesn't match "said". */
export function keywordPattern(keyword: string) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(keyword.trim())}($|[^\\p{L}\\p{N}])`, "iu");
}

interface NewArticle {
  id: string;
  title: string;
  summary: string | null;
  feedId: string;
  imageUrl: string | null;
  isSaved: boolean;
  feed: { title: string };
}

function matches(rule: FilterRule, article: NewArticle) {
  if (rule.match === "feed") return rule.value === article.feedId;
  return keywordPattern(rule.value).test(`${article.title} ${article.summary ?? ""}`);
}

function hidden(rules: FilterRule[], muted: Set<string>, article: NewArticle) {
  if (muted.has(article.feedId)) return true;
  return rules.some((r) => r.action === "hide" && r.match === "keyword" && matches(r, article));
}

function alertMessage(rule: FilterRule, found: NewArticle[]): PushMessage {
  const [first] = found;
  const label = rule.match === "feed" ? `New from ${first.feed.title}` : `Alert: ${rule.value}`;
  if (found.length === 1) {
    return {
      title: label,
      body: first.title,
      url: `/reader?article=${first.id}`,
      tag: `alert-${rule.id}`,
      image: first.imageUrl,
    };
  }
  return {
    title: `${label} · ${found.length} new`,
    body: found
      .slice(0, 3)
      .map((a) => a.title)
      .join(" · "),
    url: "/reader?view=alerts",
    tag: `alert-${rule.id}`,
    image: first.imageUrl,
  };
}

/** Applies alert and save rules to articles that just arrived. */
export async function applyArrivalRules(articleIds: string[]) {
  const result = { alerted: 0, saved: 0, notified: 0 };
  if (articleIds.length === 0) return result;
  const rules = await getFilterRules();
  const active = rules.filter((r) => r.action === "alert" || r.action === "save");
  if (active.length === 0) return result;

  const muted = mutedFeedIds(rules);
  const articles = (
    await prisma.article.findMany({
      where: { id: { in: articleIds } },
      select: {
        id: true,
        title: true,
        summary: true,
        feedId: true,
        imageUrl: true,
        isSaved: true,
        feed: { select: { title: true } },
      },
      orderBy: { publishedAt: "desc" },
    })
  ).filter((article) => !hidden(rules, muted, article));

  const toSave = new Set<string>();
  const alertedIds = new Set<string>();
  const byRule: { rule: FilterRule; found: NewArticle[] }[] = [];
  for (const rule of active) {
    const found = articles.filter((article) => matches(rule, article));
    if (found.length === 0) continue;
    if (rule.action === "save") {
      found.filter((a) => !a.isSaved).forEach((a) => toSave.add(a.id));
    } else {
      found.forEach((a) => alertedIds.add(a.id));
      byRule.push({ rule, found });
    }
  }

  const now = new Date();
  if (toSave.size > 0) {
    result.saved = (
      await prisma.article.updateMany({
        where: { id: { in: Array.from(toSave) }, isSaved: false },
        data: { isSaved: true, savedAt: now },
      })
    ).count;
  }
  if (alertedIds.size > 0) {
    result.alerted = (
      await prisma.article.updateMany({
        where: { id: { in: Array.from(alertedIds) } },
        data: { alertedAt: now },
      })
    ).count;
  }

  // One notification per rule, most matches first, a few at most per refresh.
  byRule.sort((a, b) => b.found.length - a.found.length);
  for (const { rule, found } of byRule.slice(0, MAX_NOTIFICATIONS)) {
    try {
      if ((await sendToAll(alertMessage(rule, found))) > 0) result.notified++;
    } catch (error) {
      console.error("Alert notification failed", error);
    }
  }
  return result;
}
