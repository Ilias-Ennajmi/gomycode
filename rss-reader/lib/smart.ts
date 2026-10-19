import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AiError, cosine, embedTexts, generateText, isAiEnabled } from "@/lib/ai";
import { ARTICLE_FEED_INCLUDE, notSnoozed, serializeArticle } from "@/lib/articles";
import { getFilterRules, hiddenArticleClauses } from "@/lib/filters";
import { headlineNames } from "@/lib/enrich";
import { searchArticleIds } from "@/lib/search";
import { stripHtml } from "@/lib/utils";

// Gemini answering about what you read: questions over your own feeds, a catch-up of a
// pile of unread, a hand with a selection, translations, tag ideas. Every call is at
// "user" priority (you're waiting), within the daily budget (lib/ai-budget.ts).

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic",
  es: "Spanish",
  de: "German",
};

function excerpt(
  article: { summary: string | null; content: string | null; fullContent?: string | null },
  max = 700
) {
  return stripHtml(article.fullContent || article.content || article.summary).slice(0, max);
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return JSON.parse(raw.slice(start, end + 1)) as T;
  }
}

// ---------------------------------------------------------------- Ask your reader

export interface AskSource {
  n: number;
  id: string;
  title: string;
  feed: string;
  publishedAt: string;
}

export interface AskTurn {
  question: string;
  answer: string;
}

const ASK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const ASK_CANDIDATES = 1500;
const ASK_CONTEXT = 12;

/**
 * Answers a question from your own articles: the closest by meaning (embeddings), plus
 * full-text matches, go to Gemini with the question. The answer cites them by number.
 */
export async function askReader(question: string, history: AskTurn[] = []) {
  if (!isAiEnabled()) throw new AiError("AI is off", 503);
  const rules = await getFilterRules();
  const where: Prisma.ArticleWhereInput = {
    NOT: { embedding: { isEmpty: true } },
    OR: [{ publishedAt: { gte: new Date(Date.now() - ASK_WINDOW_MS) } }, { isSaved: true }],
    AND: [...hiddenArticleClauses(rules), notSnoozed()],
  };
  const [[vector], candidates, keywordIds] = await Promise.all([
    embedTexts([question], "user"),
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: ASK_CANDIDATES,
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        fullContent: true,
        embedding: true,
        publishedAt: true,
        feed: { select: { title: true } },
      },
    }),
    searchArticleIds(question).then((ids) => ids.slice(0, 6)),
  ]);
  const byMeaning = candidates
    .map((article) => ({ article, score: cosine(vector, article.embedding) }))
    .sort((a, b) => b.score - a.score);
  const picked = new Map<string, (typeof candidates)[number]>();
  for (const id of keywordIds) {
    const hit = candidates.find((c) => c.id === id);
    if (hit) picked.set(id, hit);
  }
  for (const { article, score } of byMeaning) {
    if (picked.size >= ASK_CONTEXT) break;
    if (score >= 0.5) picked.set(article.id, article);
  }
  const sources: AskSource[] = Array.from(picked.values()).map((article, i) => ({
    n: i + 1,
    id: article.id,
    title: article.title,
    feed: article.feed.title,
    publishedAt: article.publishedAt.toISOString(),
  }));
  if (sources.length === 0) {
    return { answer: "I couldn't find anything in your feeds about that.", sources };
  }
  const context = Array.from(picked.values())
    .map(
      (article, i) =>
        `[${i + 1}] ${article.title} — ${article.feed.title}, ${article.publishedAt.toISOString().slice(0, 10)}\n${excerpt(article)}`
    )
    .join("\n\n");
  const previous = history
    .slice(-3)
    .map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`)
    .join("\n\n");
  const raw = await generateText(
    `${previous ? `Earlier in this conversation:\n${previous}\n\n` : ""}Articles from the reader's own feeds:\n\n${context}\n\nQuestion: ${question}`,
    {
      system:
        "You answer questions for one reader using only the articles given, which come from the feeds they follow. " +
        "Answer in the question's language, plainly, in 2-6 sentences or a short list; say what the articles say and " +
        "cite them inline with their numbers in square brackets, like [2]. If they don't cover the question, say so " +
        'briefly instead of guessing. Reply with JSON: {"answer": "...", "used": [numbers of the articles you cited]}.',
      json: true,
      maxTokens: 900,
    }
  );
  const data = parseJson<{ answer?: string; used?: number[] }>(raw);
  const used = new Set((data.used ?? []).map(Number));
  return {
    answer: (data.answer ?? "").trim() || "I couldn't put an answer together.",
    sources: sources.filter((s) => used.size === 0 || used.has(s.n)),
  };
}

/** A few questions worth asking right now, from the stories several sources cover. */
export async function suggestedQuestions() {
  const topics = await prisma.topic.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { title: true },
  });
  return topics.map((t) => `What's the story with ${t.title.replace(/[.?!]+$/, "")}?`).slice(0, 4);
}

// ---------------------------------------------------------------- Catch me up

const CATCHUP_MAX = 40;

/** Five bullets over a pile of unread articles, each pointing at the articles behind it. */
export async function catchUp(where: Prisma.ArticleWhereInput, label: string) {
  if (!isAiEnabled()) throw new AiError("AI is off", 503);
  const rules = await getFilterRules();
  const articles = await prisma.article.findMany({
    where: { ...where, isRead: false, AND: [...hiddenArticleClauses(rules), notSnoozed()] },
    orderBy: { publishedAt: "desc" },
    take: CATCHUP_MAX,
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      publishedAt: true,
      feed: { select: { title: true } },
    },
  });
  if (articles.length === 0) return { bullets: [], articleIds: [] };
  const list = articles
    .map((a, i) => `${i + 1}. ${a.title} (${a.feed.title}) — ${excerpt(a, 220)}`)
    .join("\n");
  const raw = await generateText(`Unread in ${label}:\n${list}`, {
    system:
      "You catch a reader up on articles they haven't read. Write 4-6 bullets covering the most important " +
      "things, grouping related items; each bullet names what happened in one or two plain sentences and " +
      "lists the numbers of the articles it draws on. Write in the articles' main language. " +
      'Reply with JSON: {"bullets": [{"text": "...", "articles": [numbers]}]}',
    json: true,
    maxTokens: 900,
  });
  const data = parseJson<{ bullets?: { text?: string; articles?: number[] }[] }>(raw);
  const bullets = (data.bullets ?? [])
    .filter((b) => typeof b.text === "string" && b.text.trim())
    .map((b) => ({
      text: b.text!.trim(),
      articles: (b.articles ?? [])
        .map((n) => articles[Number(n) - 1])
        .filter(Boolean)
        .map((a) => ({ id: a.id, title: a.title, feed: a.feed.title })),
    }));
  return { bullets, articleIds: articles.map((a) => a.id) };
}

// ---------------------------------------------------------------- A hand with a selection

export type SelectionAction = "explain" | "define" | "translate";

export async function helpWithSelection(
  text: string,
  action: SelectionAction,
  options: { title?: string; to?: string }
) {
  if (!isAiEnabled()) throw new AiError("AI is off", 503);
  const passage = text.trim().slice(0, 2000);
  const language = LANGUAGE_NAMES[options.to ?? "en"] ?? "English";
  const prompts: Record<SelectionAction, string> = {
    explain:
      "Explain the passage plainly, as to a smart friend, in 2-4 sentences, in the passage's own language. " +
      "Give the context a reader might be missing (who, what, why it matters). No preamble.",
    define:
      "Define the term or expression (the whole passage, or its key term) in 1-3 sentences, in the passage's " +
      "own language, with one short example of how it's used if that helps. No preamble.",
    translate: `Translate the passage into ${language}, faithfully and naturally. Reply with the translation only.`,
  };
  return generateText(
    `${options.title ? `From the article "${options.title}".\n\n` : ""}Passage:\n${passage}`,
    { system: prompts[action], maxTokens: 500 }
  );
}

// ---------------------------------------------------------------- Translate an article

const TRANSLATE_MAX_CHARS = 14_000;

/** The article's body in another language, kept with the article once made. */
export async function translateArticle(articleId: string, to: string) {
  if (!isAiEnabled()) throw new AiError("AI is off", 503);
  const language = LANGUAGE_NAMES[to];
  if (!language) throw new AiError("Unknown language");
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      content: true,
      fullContent: true,
      summary: true,
      translations: true,
    },
  });
  if (!article) throw new AiError("Article not found", 404);
  const existing = (article.translations as Record<string, string> | null) ?? {};
  if (existing[to]) return { html: existing[to], cached: true };

  // Paragraphs of plain text in, paragraphs of plain text out: markup stays out of the way.
  const source = article.fullContent || article.content || article.summary || "";
  const paragraphs = source
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 1);
  let text = "";
  for (const p of paragraphs) {
    if (text.length + p.length > TRANSLATE_MAX_CHARS) break;
    text += `${p}\n\n`;
  }
  if (!text.trim()) throw new AiError("Nothing to translate");
  const raw = await generateText(`Title: ${article.title}\n\n${text}`, {
    system:
      `Translate the article into ${language}, faithfully and naturally, keeping paragraph breaks. ` +
      'Reply with JSON: {"title": "translated title", "paragraphs": ["one paragraph", "..."]}',
    json: true,
    maxTokens: 8000,
  });
  const data = parseJson<{ title?: string; paragraphs?: string[] }>(raw);
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = (data.paragraphs ?? [])
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => `<p>${escape(p.trim())}</p>`)
    .join("");
  if (!html) throw new AiError("Gemini returned no translation");
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
  const stored = title ? `<h2>${escape(title)}</h2>${html}` : html;
  await prisma.article.update({
    where: { id: article.id },
    data: { translations: { ...existing, [to]: stored } },
  });
  return { html: stored, cached: false };
}

// ---------------------------------------------------------------- Tags for a highlight

export async function suggestTags(highlightId: string) {
  if (!isAiEnabled()) throw new AiError("AI is off", 503);
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: { text: true, note: true, article: { select: { title: true } } },
  });
  if (!highlight) throw new AiError("Highlight not found", 404);
  const existing = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT tag FROM (SELECT DISTINCT unnest(tags) AS tag FROM "Highlight") t ORDER BY tag LIMIT 60`;
  const raw = await generateText(
    `Article: ${highlight.article.title}\nHighlight: ${highlight.text.slice(0, 1000)}${highlight.note ? `\nNote: ${highlight.note}` : ""}\n` +
      `Tags already in use: ${existing.map((e) => e.tag).join(", ") || "none"}`,
    {
      system:
        "Suggest 2 or 3 short tags (one or two words, lowercase, no #) for filing this highlight: the subject " +
        'and the kind of idea. Reuse tags already in use when they fit. Reply with JSON: {"tags": ["..."]}',
      json: true,
      maxTokens: 80,
    }
  );
  const data = parseJson<{ tags?: string[] }>(raw);
  return (data.tags ?? [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase().replace(/^#/, "").slice(0, 40))
    .filter(Boolean)
    .slice(0, 3);
}

// ---------------------------------------------------------------- Story timeline

const TIMELINE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;
const TIMELINE_SIMILARITY = 0.8;

/**
 * The story behind an article, day by day: the articles in its topic, and older ones close
 * enough by meaning that share a name in the headline.
 */
export async function storyTimeline(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, embedding: true, topicId: true, publishedAt: true },
  });
  if (!article) return [];
  const names = headlineNames(article.title);
  const rules = await getFilterRules();
  const candidates = await prisma.article.findMany({
    where: {
      id: { not: article.id },
      publishedAt: { gte: new Date(article.publishedAt.getTime() - TIMELINE_WINDOW_MS) },
      OR: [
        ...(article.topicId ? [{ topicId: article.topicId }] : []),
        { NOT: { embedding: { isEmpty: true } } },
      ],
      feed: { type: { not: "manual" } },
      AND: [...hiddenArticleClauses(rules)],
    },
    orderBy: { publishedAt: "desc" },
    take: 800,
    include: ARTICLE_FEED_INCLUDE,
  });
  const related = candidates.filter((candidate) => {
    if (article.topicId && candidate.topicId === article.topicId) return true;
    if (article.embedding.length === 0 || candidate.embedding.length === 0) return false;
    const shared = Array.from(headlineNames(candidate.title)).some((n) => names.has(n));
    return shared && cosine(article.embedding, candidate.embedding) >= TIMELINE_SIMILARITY;
  });
  const days = new Map<string, ReturnType<typeof serializeArticle>[]>();
  for (const item of related.slice(0, 24)) {
    const day = item.publishedAt.toISOString().slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), serializeArticle(item)]);
  }
  return Array.from(days.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, articles]) => ({ day, articles }));
}
