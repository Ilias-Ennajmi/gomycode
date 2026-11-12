import * as Y from "yjs";
import type { BoardDoc } from "../doc/board-doc";
import { oneStepOn } from "./one-step";
import type { CanvasObject } from "./types";

export type SearchOptions = { caseSensitive: boolean; wholeWord: boolean };
export type SearchField = "text" | "frameName" | "label";
export type SearchHit = { id: string; field: SearchField; matches: number };

const WORD_CHAR = "[\\p{L}\\p{N}_]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches the query literally, never as a pattern. Null for an empty query. */
function matcher(query: string, opts: SearchOptions): RegExp | null {
  if (query.trim() === "") return null;
  const body = escapeRegExp(query);
  const src = opts.wholeWord ? `(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})` : body;
  return new RegExp(src, opts.caseSensitive ? "gu" : "giu");
}

/** Every Y.XmlText run (one per paragraph or list item) inside a content fragment, in reading order. */
function textRuns(node: Y.XmlFragment | Y.XmlElement | Y.XmlText, out: Y.XmlText[] = []): Y.XmlText[] {
  if (node instanceof Y.XmlText) {
    out.push(node);
    return out;
  }
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText || child instanceof Y.XmlElement) textRuns(child, out);
  }
  return out;
}

type DeltaOp = { insert?: unknown; attributes?: Record<string, unknown> };

/** Plain string of a run and, for every character, the formatting it carries. Embeds count as one object character. */
function readRun(run: Y.XmlText): { text: string; attrsAt: (i: number) => Record<string, unknown> | undefined } {
  const delta = run.toDelta() as DeltaOp[];
  let text = "";
  const spans: { from: number; to: number; attrs?: Record<string, unknown> }[] = [];
  for (const op of delta) {
    const s = typeof op.insert === "string" ? op.insert : "￼";
    spans.push({ from: text.length, to: text.length + s.length, attrs: op.attributes });
    text += s;
  }
  return { text, attrsAt: (i) => spans.find((s) => i >= s.from && i < s.to)?.attrs };
}

/** What the user sees as the object's text: rich content paragraphs joined by newlines, a frame's name, an arrow's label. */
export function objectText(doc: BoardDoc, id: string): string {
  const o = doc.get(id);
  if (!o) return "";
  if (o.type === "frame") return o.name;
  if (o.type === "arrow") return o.label;
  const frag = doc.content(id);
  if (!frag) return "";
  return textRuns(frag)
    .map((r) => readRun(r).text)
    .join("\n");
}

function fieldOf(o: CanvasObject): SearchField | null {
  switch (o.type) {
    case "text":
    case "sticky":
      return "text";
    case "shape":
    case "arrow":
      return "label";
    case "frame":
      return "frameName";
    default:
      return null;
  }
}

function countIn(text: string, re: RegExp): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) {
    n++;
    if (re.lastIndex === 0) break; // cannot happen for a non-empty literal, but never loop forever
  }
  return n;
}

/**
 * Find a literal string across stickies, text objects, shape labels, arrow labels and frame names. One hit per
 * object that matches, in z-order, with the number of matches inside it. Matches never span paragraphs.
 */
export function searchBoard(doc: BoardDoc, query: string, opts: SearchOptions): SearchHit[] {
  const re = matcher(query, opts);
  if (!re) return [];
  const hits: SearchHit[] = [];
  for (const o of doc.all()) {
    const field = fieldOf(o);
    if (!field) continue;
    let matches = 0;
    if (o.type === "frame") matches = countIn(o.name, re);
    else if (o.type === "arrow") matches = countIn(o.label, re);
    else {
      const frag = doc.content(o.id);
      if (frag) for (const run of textRuns(frag)) matches += countIn(readRun(run).text, re);
    }
    if (matches > 0) hits.push({ id: o.id, field, matches });
  }
  return hits;
}

function replaceLiteral(text: string, re: RegExp, replacement: string): { text: string; n: number } {
  let n = 0;
  re.lastIndex = 0;
  const out = text.replace(re, () => {
    n++;
    return replacement;
  });
  return { text: out, n };
}

/**
 * Replace every match with `replacement` (used literally: no `$&` patterns). Formatting of the replaced text is kept.
 * Locked objects are left alone. Everything is one undo step. Returns how many replacements were made.
 */
export function replaceAll(doc: BoardDoc, query: string, replacement: string, opts: SearchOptions): number {
  const re = matcher(query, opts);
  if (!re) return 0;
  const targets = searchBoard(doc, query, opts).filter((h) => !doc.get(h.id)?.locked);
  if (targets.length === 0) return 0;
  let total = 0;
  oneStepOn(doc, () => {
    for (const hit of targets) {
      const o = doc.get(hit.id)!;
      if (o.type === "frame") {
        const r = replaceLiteral(o.name, re, replacement);
        if (r.n) doc.update(o.id, { name: r.text });
        total += r.n;
      } else if (o.type === "arrow") {
        const r = replaceLiteral(o.label, re, replacement);
        if (r.n) doc.update(o.id, { label: r.text });
        total += r.n;
      } else {
        const frag = doc.content(o.id);
        if (!frag) continue;
        for (const run of textRuns(frag)) {
          const { text, attrsAt } = readRun(run);
          const spans: { at: number; len: number }[] = [];
          re.lastIndex = 0;
          for (let m = re.exec(text); m; m = re.exec(text)) spans.push({ at: m.index, len: m[0].length });
          // Back to front, so earlier offsets stay valid.
          for (const { at, len } of spans.reverse()) {
            const attrs = attrsAt(at);
            run.delete(at, len);
            if (replacement) run.insert(at, replacement, attrs ? { ...attrs } : undefined);
            total++;
          }
        }
      }
    }
  });
  return total;
}
