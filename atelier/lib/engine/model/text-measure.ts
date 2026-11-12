/**
 * Measures rich text (the sanitised HTML of `richTextToHtml`) so stickies and text boxes can grow to fit what is typed.
 *
 * In a browser the text is laid out for real in a hidden element that has the canvas text styling, so the result is
 * exactly what the object will occupy. Where there is no layout (server, tests) a deterministic estimate is used: the
 * text is wrapped greedily with an average glyph width. Both paths return whole lines of `fontSize * lineHeight`.
 */

export type MeasureOptions = {
  fontSize: number;
  lineHeight: number;
  /** Content width in px. Without it the text does not wrap and the box is as wide as its longest line. */
  width?: number;
};

export type TextBox = { w: number; h: number };

/** Average glyph width as a share of the font size (Inter, mixed text). */
const AVG_GLYPH_EM = 0.55;
/** List items are indented by this many ems. */
const LIST_INDENT_EM = 1.5;
const HEADING_SCALE: Record<string, number> = { h1: 2, h2: 1.5, h3: 1.25 };
const MAX_CHARS = 100_000;
const MAX_HEIGHT = 1_000_000;

const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi;

type Block = { scale: number; indent: number; lines: string[] };

/** Split the editor's HTML into blocks of hard lines (paragraph, heading, list item; `<br>` breaks a line). */
function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  let listDepth = 0;
  const re = /<(\/?)(p|h[1-3]|li|ul|ol|br)\b[^>]*>|<[^>]*>|([^<]+)/gi;
  let current: Block | null = null;
  let chars = 0;
  const open = (scale: number) => {
    current = { scale, indent: listDepth * LIST_INDENT_EM, lines: [""] };
  };
  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[2] === undefined && m[3] === undefined) continue; // inline markup (strong, em, a, span...)
    if (m[3] !== undefined) {
      if (chars > MAX_CHARS) continue;
      const text = m[3].replace(ENTITY, "x");
      chars += text.length;
      if (!current) open(1);
      current!.lines[current!.lines.length - 1] += text;
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "ul" || tag === "ol") {
      close();
      listDepth = Math.max(0, listDepth + (closing ? -1 : 1));
    } else if (tag === "br") {
      if (!current) open(1);
      current!.lines.push("");
    } else if (closing) {
      close();
    } else if (tag === "li") {
      // A list item's text sits in a paragraph of its own: the item is the block, the paragraph continues it.
      close();
      open(1);
    } else if (!current || tag.startsWith("h")) {
      close();
      open(HEADING_SCALE[tag] ?? 1);
    }
  }
  close();
  return blocks;
}

function wrappedLines(text: string, avail: number, glyph: number): number {
  if (text.length === 0) return 1;
  const perLine = Math.max(1, Math.floor(avail / glyph));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/(?<=\s)/)) {
    const len = word.length;
    const trimmed = word.trimEnd().length;
    if (used > 0 && used + trimmed > perLine) {
      lines++;
      used = 0;
    }
    if (trimmed > perLine) {
      // a word longer than the line breaks anywhere
      let rest = len;
      while (rest > perLine - used) {
        rest -= perLine - used;
        used = 0;
        lines++;
      }
      used += rest;
    } else {
      used += len;
    }
  }
  return lines;
}

function estimate(html: string, o: Required<Pick<MeasureOptions, "fontSize" | "lineHeight">> & { width: number | null }): TextBox {
  const blocks = parseBlocks(html);
  if (blocks.length === 0) blocks.push({ scale: 1, indent: 0, lines: [""] });
  let h = 0;
  let widest = 0;
  for (const b of blocks) {
    const size = o.fontSize * b.scale;
    const glyph = size * AVG_GLYPH_EM;
    const indent = b.indent * o.fontSize;
    for (const line of b.lines) {
      const natural = line.length * glyph + indent;
      widest = Math.max(widest, natural);
      const n = o.width === null ? 1 : wrappedLines(line, Math.max(o.width - indent, glyph), glyph);
      h += n * size * o.lineHeight;
    }
  }
  return { w: o.width ?? widest, h: Math.min(h, MAX_HEIGHT) };
}

let probe: HTMLElement | null = null;

/** Real layout in a hidden element, or null when there is no layout engine (no document, or it reports zero sizes). */
function layout(html: string, o: MeasureOptions): TextBox | null {
  if (typeof document === "undefined" || !document.body) return null;
  if (!probe || !probe.isConnected) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.className = "atelier-rich";
    probe.style.cssText =
      "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:content-box;overflow-wrap:anywhere;";
    document.body.appendChild(probe);
  }
  const el = probe;
  el.style.fontSize = `${o.fontSize}px`;
  el.style.lineHeight = String(o.lineHeight);
  el.style.width = o.width === undefined ? "max-content" : `${o.width}px`;
  el.style.whiteSpace = o.width === undefined ? "pre" : "pre-wrap";
  el.innerHTML = html || "<p></p>";
  const h = el.offsetHeight;
  const w = el.offsetWidth;
  el.innerHTML = "";
  if (!(h > 0)) return null;
  return { w: o.width ?? w, h };
}

/** The box (content only, no padding) that `html` occupies at the given type settings. */
export function measureTextBox(html: string, o: MeasureOptions): TextBox {
  const fontSize = Number.isFinite(o.fontSize) && o.fontSize > 0 ? o.fontSize : 16;
  const lineHeight = Number.isFinite(o.lineHeight) && o.lineHeight > 0 ? o.lineHeight : 1.3;
  const width = o.width === undefined ? undefined : Number.isFinite(o.width) ? Math.max(0, o.width) : 1e6;
  const safe = { fontSize, lineHeight, width };
  const real = layout(html, safe);
  const box = real ?? estimate(html, { fontSize, lineHeight, width: width ?? null });
  return { w: box.w, h: Math.max(box.h, fontSize * lineHeight) };
}

/** Height of `html` laid out `widthPx` wide: what a sticky or text box needs to show all of it. */
export function measureTextHeight(html: string, widthPx: number, fontSizePx: number, lineHeight: number): number {
  return measureTextBox(html, { fontSize: fontSizePx, lineHeight, width: widthPx }).h;
}
