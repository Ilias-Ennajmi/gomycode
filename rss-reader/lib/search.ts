import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sqlName } from "@/lib/db";
import { cosine, embedTexts } from "@/lib/ai";

// Full-text search over articles (the "search" column kept by a trigger, see the v2_library
// migration) plus the reader's own highlights and notes.

const MAX_RESULTS = 300;

/** Same folding as reader_fold() in the database: lowercase, no accents. */
export function foldText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o")
    .replace(/ł/g, "l")
    .replace(/ı/g, "i");
}

/** "Maroc écon" → "maroc:* & econ:*": every word, each as a prefix. Null when nothing's left. */
export function toPrefixQuery(search: string) {
  const words = foldText(search)
    // Letters (Latin and Arabic) and digits only: nothing that means something in tsquery.
    .split(/[^0-9a-z\u00c0-\u024f\u0600-\u06ff]+/)
    .filter(Boolean)
    .slice(0, 8);
  return words.length > 0 ? words.map((word) => `${word}:*`).join(" & ") : null;
}

/**
 * Article ids matching the search, best first: titles outrank summaries, which outrank the
 * body, and newer articles break ties. Articles whose highlights or notes match come first.
 */
export async function searchArticleIds(search: string): Promise<string[]> {
  const query = toPrefixQuery(search);
  if (!query) return [];
  const pattern = `%${search.trim()}%`;

  const [fromHighlights, fromArticles] = await Promise.all([
    prisma.highlight.findMany({
      where: {
        OR: [
          { text: { contains: search.trim(), mode: "insensitive" } },
          { note: { contains: search.trim(), mode: "insensitive" } },
        ],
      },
      select: { articleId: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM ${sqlName("Article")}
      WHERE "search" @@ to_tsquery('simple', ${query})
         OR "title" ILIKE ${pattern}
      ORDER BY ts_rank("search", to_tsquery('simple', ${query}), 1) DESC, "publishedAt" DESC
      LIMIT ${MAX_RESULTS}
    `),
  ]);

  return Array.from(
    new Set([...fromHighlights.map((h) => h.articleId), ...fromArticles.map((a) => a.id)])
  );
}

const MEANING_CANDIDATES = 1500;
const MEANING_RESULTS = 60;
// gemini-embedding scores: the same subject in other words lands around 0.6 and up.
const MEANING_MIN = 0.55;
const meaningCache = new Map<string, { at: number; ids: string[] }>();

/**
 * Search by meaning: the query is embedded (one Gemini call, cached ten minutes so the next
 * pages don't ask again) and compared with the stored article embeddings, newest 1,500;
 * the best matches come first, then the word matches that aren't among them.
 */
export async function searchByMeaning(search: string): Promise<string[]> {
  const key = search.trim().toLowerCase();
  const hit = meaningCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.ids;
  const [[vector], candidates, words] = await Promise.all([
    embedTexts([search], "user"),
    prisma.article.findMany({
      where: { NOT: { embedding: { isEmpty: true } } },
      orderBy: { publishedAt: "desc" },
      take: MEANING_CANDIDATES,
      select: { id: true, embedding: true },
    }),
    searchArticleIds(search),
  ]);
  const ids = rankByMeaning(vector, candidates);
  const seen = new Set(ids);
  const merged = [...ids, ...words.filter((id) => !seen.has(id))];
  meaningCache.set(key, { at: Date.now(), ids: merged });
  if (meaningCache.size > 50) meaningCache.delete(meaningCache.keys().next().value!);
  return merged;
}

/** The candidates closest to the query vector, best first. Exported for tests. */
export function rankByMeaning(vector: number[], candidates: { id: string; embedding: number[] }[]) {
  return candidates
    .map((c) => ({ id: c.id, score: cosine(vector, c.embedding) }))
    .filter((c) => c.score >= MEANING_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, MEANING_RESULTS)
    .map((c) => c.id);
}
