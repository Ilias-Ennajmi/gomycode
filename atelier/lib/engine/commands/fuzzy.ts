/**
 * Small fuzzy matcher for the command palette. Every word of the query must appear, in order, as a subsequence of
 * the text (case-insensitive). Higher score = better: matches at the start of the text or of a word, and runs of
 * consecutive characters, count most; short texts beat long ones. Returns null when it does not match.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const hay = text.toLowerCase();
  let total = 0;
  for (const term of terms) {
    const s = scoreTerm(term, hay);
    if (s === null) return null;
    total += s;
  }
  return total - hay.length * 0.05;
}

function isWordStart(hay: string, i: number): boolean {
  return i === 0 || !/[a-z0-9]/.test(hay[i - 1]);
}

function scoreTerm(term: string, hay: string): number | null {
  // Greedy left-to-right match that prefers word starts: good enough for short labels, and predictable.
  let score = 0;
  let pos = 0;
  let prev = -2;
  for (const ch of term) {
    let at = -1;
    // first try a word start at or after pos, then any occurrence
    for (let i = pos; i < hay.length; i++) {
      if (hay[i] === ch && (isWordStart(hay, i) || i === prev + 1)) {
        at = i;
        break;
      }
    }
    if (at < 0) at = hay.indexOf(ch, pos);
    if (at < 0) return null;
    score += 10;
    if (isWordStart(hay, at)) score += 12;
    if (at === prev + 1) score += 8;
    if (at === 0) score += 6;
    score -= Math.min(at - pos, 8) * 0.5;
    prev = at;
    pos = at + 1;
  }
  if (hay.startsWith(term)) score += 20;
  return score;
}

/** Items that match, best first (stable for equal scores). */
export function fuzzyFilter<T>(query: string, items: readonly T[], text: (item: T) => string): T[] {
  const scored: { item: T; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const score = fuzzyScore(query, text(item));
    if (score !== null) scored.push({ item, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.item);
}
