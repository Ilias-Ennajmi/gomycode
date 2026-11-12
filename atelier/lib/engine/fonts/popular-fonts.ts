import fonts from "./popular-fonts.json";

/**
 * About 160 popular Google Fonts families (all published under the SIL Open Font License or Apache 2.0). Names only:
 * the list is a convenience for autocomplete, any other family can still be typed (the CSS endpoint decides whether it
 * exists). Plain data in popular-fonts.json.
 */
export const POPULAR_FONTS: readonly string[] = fonts;

/**
 * Families matching `query`, case-insensitively: names that start with it first, then names that contain it, each group
 * in list order. An empty query returns the first `limit` families.
 */
export function searchFonts(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  const max = Math.max(0, Math.floor(limit));
  if (!q) return POPULAR_FONTS.slice(0, max);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of POPULAR_FONTS) {
    const n = name.toLowerCase();
    if (n.startsWith(q)) starts.push(name);
    else if (n.includes(q)) contains.push(name);
  }
  return [...starts, ...contains].slice(0, max);
}
