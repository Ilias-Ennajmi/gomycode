/* Highlights, the pure part: what a transcript line becomes, and the recall card made from one. */

export type Highlight = {
  id: string;
  saveId: string;
  text: string;
  start: number | null;
  end: number | null;
  cardId: string | null;
  source: "user" | "ai";
  createdAt: string;
};

export const HIGHLIGHT_MAX = 2000;

/** Tidied text, at most 2000 characters (the table's limit). Empty when there is nothing to keep. */
export function highlightText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, HIGHLIGHT_MAX);
}

/** Two highlights are the same line when they cover the same text of the same save. */
export function sameLine(h: Pick<Highlight, "text" | "start">, line: { text: string; start?: number | null }): boolean {
  if (h.start !== null && line.start !== null && line.start !== undefined) return Math.abs(h.start - line.start) < 0.05 && highlightText(line.text) === h.text;
  return highlightText(line.text) === h.text;
}

/**
 * A recall card from a highlight: the first part of the line is the prompt, the whole
 * line is the answer. Short lines ask for the line itself.
 */
export function cardFromHighlight(text: string, title?: string | null): { prompt: string; answer: string } {
  const answer = highlightText(text);
  const from = title?.trim() ? ` from “${title.trim().slice(0, 80)}”` : "";
  const words = answer.split(" ");
  if (words.length < 7) return { prompt: `What was the line you highlighted${from}?`, answer };
  const head = words.slice(0, Math.max(3, Math.min(8, Math.floor(words.length / 2)))).join(" ");
  return { prompt: `Finish the line you highlighted${from}: “${head} …”`, answer };
}

/** An article's text as paragraphs worth showing (and highlighting) one by one. */
export function paragraphs(fullText: string, max = 80): string[] {
  const blocks = fullText
    .split(/\n{2,}|\r\n\r\n/)
    .flatMap((b) => (b.length > 900 ? b.split(/(?<=[.!?])\s+(?=[A-Z“"])/).reduce<string[]>((acc, s) => {
      const last = acc[acc.length - 1];
      if (last !== undefined && last.length + s.length < 500) acc[acc.length - 1] = `${last} ${s}`;
      else acc.push(s);
      return acc;
    }, []) : [b]))
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);
  return blocks.slice(0, max);
}
