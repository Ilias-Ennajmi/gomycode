import * as Y from "yjs";

/**
 * Renders a Tiptap/ProseMirror document stored in a Y.XmlFragment as sanitised HTML for the canvas.
 *
 * Only what the editor can produce is rendered: paragraphs, headings 1-3, bullet and ordered lists, hard breaks, and
 * the marks bold, italic, underline, strike, link and a font-size text style. Everything else degrades to its text.
 * All text and attribute values are escaped; links are limited to http(s) and mailto.
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** http(s) and mailto only, checked on a copy with all whitespace and control characters removed. */
function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!/^(https?:|mailto:)/i.test(compact)) return null;
  return raw.trim().replace(/[\u0000-\u001f\u007f]+/g, "");
}

function fontSizePx(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 8 || n > 400) return null;
  return Math.round(n * 100) / 100;
}

type Attrs = Record<string, unknown>;

function markAttrs(v: unknown): Attrs {
  return typeof v === "object" && v !== null ? (v as Attrs) : {};
}

function renderRun(text: string, attrs: Attrs | undefined): string {
  let out = esc(text);
  if (!attrs) return out;
  const size = attrs.textStyle ? fontSizePx(markAttrs(attrs.textStyle).fontSize) : null;
  if (size !== null) out = `<span style="font-size:${size}px">${out}</span>`;
  if (attrs.strike) out = `<s>${out}</s>`;
  if (attrs.underline) out = `<u>${out}</u>`;
  if (attrs.italic) out = `<em>${out}</em>`;
  if (attrs.bold) out = `<strong>${out}</strong>`;
  if (attrs.link) {
    const href = safeHref(markAttrs(attrs.link).href);
    if (href) out = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${out}</a>`;
  }
  return out;
}

const ALIGNS = new Set(["left", "center", "right", "justify"]);

function alignStyle(el: Y.XmlElement): string {
  const a = el.getAttribute("textAlign");
  const lh = Number(el.getAttribute("lineHeight"));
  const parts: string[] = [];
  if (typeof a === "string" && ALIGNS.has(a)) parts.push(`text-align:${a}`);
  if (Number.isFinite(lh) && lh >= 0.8 && lh <= 3) parts.push(`line-height:${Math.round(lh * 100) / 100}`);
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

type Child = Y.XmlElement | Y.XmlText | Y.XmlHook;

function renderChildren(parent: Y.XmlFragment | Y.XmlElement): string {
  let out = "";
  for (const child of parent.toArray() as Child[]) out += renderNode(child);
  return out;
}

function renderNode(node: Child): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as Array<{ insert?: unknown; attributes?: Attrs }>)
      .map((op) => (typeof op.insert === "string" ? renderRun(op.insert, op.attributes) : ""))
      .join("");
  }
  if (!(node instanceof Y.XmlElement)) return "";
  switch (node.nodeName) {
    case "paragraph":
      return `<p${alignStyle(node)}>${renderChildren(node)}</p>`;
    case "heading": {
      const raw = Number(node.getAttribute("level"));
      const level = Number.isFinite(raw) ? Math.min(3, Math.max(1, Math.round(raw))) : 1;
      return `<h${level}${alignStyle(node)}>${renderChildren(node)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node)}</li>`;
    case "hardBreak":
      return "<br>";
    default:
      return renderChildren(node);
  }
}

export function richTextToHtml(frag: Y.XmlFragment): string {
  return renderChildren(frag);
}

function plainText(node: Child): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as Array<{ insert?: unknown }>)
      .map((op) => (typeof op.insert === "string" ? op.insert : ""))
      .join("");
  }
  if (!(node instanceof Y.XmlElement)) return "";
  if (node.nodeName === "hardBreak") return "\n";
  return (node.toArray() as Child[]).map(plainText).join("");
}

const BLOCKS = new Set(["paragraph", "heading"]);

/** One string per block (paragraph, heading, list item), without markup. Used for low-zoom placeholders. */
export function richTextToPlainLines(frag: Y.XmlFragment): string[] {
  const lines: string[] = [];
  const walk = (parent: Y.XmlFragment | Y.XmlElement) => {
    for (const child of parent.toArray() as Child[]) {
      if (child instanceof Y.XmlElement && BLOCKS.has(child.nodeName)) lines.push(plainText(child));
      else if (child instanceof Y.XmlElement) walk(child);
      else if (child instanceof Y.XmlText) lines.push(plainText(child));
    }
  };
  walk(frag);
  return lines;
}
