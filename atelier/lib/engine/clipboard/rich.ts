import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";

/** Editor (ProseMirror/Tiptap) JSON, the format rich text travels in on the clipboard. */
export type RichJSON = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichJSON[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

const NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
]);
const MARK_TYPES = new Set(["bold", "italic", "underline", "strike", "code", "link", "textStyle", "highlight"]);
const MAX_DEPTH = 24;
const MAX_NODES = 50_000;
const SAFE_HREF = /^(https?:|mailto:)/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The rich content of a text/sticky/shape as editor JSON. Never throws; unreadable content gives an empty doc. */
export function richContentToJSON(frag: Y.XmlFragment): RichJSON {
  try {
    return yXmlFragmentToProsemirrorJSON(frag) as RichJSON;
  } catch {
    return { type: "doc", content: [] };
  }
}

function markAttributes(marks: RichJSON["marks"]): Record<string, unknown> | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: Record<string, unknown> = {};
  for (const m of marks) {
    if (!isRecord(m) || typeof m.type !== "string" || !MARK_TYPES.has(m.type)) continue;
    const attrs = isRecord(m.attrs) ? { ...m.attrs } : {};
    if (m.type === "link") {
      // Only http(s) and mailto links survive; anything else (javascript:, data:) loses the link, not the text.
      if (typeof attrs.href !== "string" || !SAFE_HREF.test(attrs.href.trim())) continue;
      attrs.href = attrs.href.trim();
    }
    out[m.type] = attrs;
  }
  return Object.keys(out).length ? out : undefined;
}

function build(nodes: unknown[], depth: number, budget: { n: number }): (Y.XmlElement | Y.XmlText)[] {
  const out: (Y.XmlElement | Y.XmlText)[] = [];
  let run: { insert: string; attributes?: Record<string, unknown> }[] = [];
  const flush = () => {
    if (!run.length) return;
    const t = new Y.XmlText();
    t.applyDelta(run);
    out.push(t);
    run = [];
  };
  for (const n of nodes) {
    if (!isRecord(n) || ++budget.n > MAX_NODES) continue;
    if (n.type === "text") {
      if (typeof n.text === "string" && n.text.length > 0) {
        const attributes = markAttributes(n.marks as RichJSON["marks"]);
        run.push(attributes ? { insert: n.text, attributes } : { insert: n.text });
      }
      continue;
    }
    flush();
    if (typeof n.type !== "string" || !NODE_TYPES.has(n.type) || depth >= MAX_DEPTH) continue;
    const el = new Y.XmlElement(n.type);
    if (isRecord(n.attrs)) {
      for (const [k, v] of Object.entries(n.attrs)) {
        if (v !== null && v !== undefined) el.setAttribute(k, v as string);
      }
    }
    if (Array.isArray(n.content)) {
      const kids = build(n.content, depth + 1, budget);
      if (kids.length) el.insert(0, kids);
    }
    out.push(el);
  }
  flush();
  return out;
}

/**
 * Replace the content of `frag` with editor JSON. Unknown node types are dropped, links are limited to
 * http(s)/mailto, and malformed input writes nothing instead of throwing. Call inside a BoardDoc transaction
 * so the content lands in the same undo step as the object.
 */
export function writeRichContent(frag: Y.XmlFragment, json: RichJSON): void {
  if (!isRecord(json) || json.type !== "doc" || !Array.isArray(json.content)) return;
  try {
    const kids = build(json.content, 0, { n: 0 });
    if (frag.length) frag.delete(0, frag.length);
    if (kids.length) frag.insert(0, kids);
  } catch (e) {
    console.warn("clipboard: could not write rich content", e);
  }
}

/** Plain-text blocks (one per text-bearing block node) of editor JSON, for the readable fallback. */
export function richBlocks(json: RichJSON | undefined): { tag: string; text: string }[] {
  const out: { tag: string; text: string }[] = [];
  const inline = (n: RichJSON): string =>
    n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : (n.content ?? []).map(inline).join("");
  const walk = (n: RichJSON, depth: number) => {
    if (depth > MAX_DEPTH) return;
    if (n.type === "paragraph" || n.type === "heading" || n.type === "codeBlock") {
      const level = Number(n.attrs?.level);
      const tag = n.type === "heading" && level >= 1 && level <= 6 ? `h${level}` : "p";
      out.push({ tag, text: inline(n) });
      return;
    }
    for (const c of n.content ?? []) walk(c, depth + 1);
  };
  if (json) walk(json, 0);
  return out;
}
