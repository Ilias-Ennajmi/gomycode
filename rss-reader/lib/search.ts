import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sqlName } from "@/lib/db";

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
