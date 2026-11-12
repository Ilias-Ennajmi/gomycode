// Rich text for export: the editor's Yjs fragment as plain blocks and runs, and a deterministic line layout of those
// blocks that every export writer (raster, SVG, PDF, JSON Canvas) shares. Pure: no DOM; the caller supplies the text
// measurer (a canvas in the browser, a fake in tests), so the same blocks always lay out the same way.
import * as Y from "yjs";

export type RichMark = "bold" | "italic" | "underline" | "strike";
export type RichRun = {
  text: string;
  marks: RichMark[];
  /** http(s) or mailto only. */
  href?: string;
  /** Explicit font size in px (the editor's size mark). */
  size?: number;
};
export type RichBlock = {
  kind: "p" | "h1" | "h2" | "h3" | "li";
  listType?: "bullet" | "ordered";
  /** 1-based number of an ordered list item. */
  index?: number;
  align?: "left" | "center" | "right";
  /** Unitless line-height multiplier set on this block, when the editor wrote one. */
  lineHeight?: number;
  runs: RichRun[];
};

export type FontSpec = { family: string; weight: number; italic: boolean; size: number };
export type TextMeasurer = (text: string, font: FontSpec) => number;
export type PositionedRun = RichRun & {
  x: number;
  width: number;
  font: FontSpec;
  /** Colour of this run when it differs from the text node's (links). */
  color?: string;
};
export type PositionedLine = {
  /** Left edge of the line's content, relative to the text box. */
  x: number;
  /** Baseline, relative to the top of the text box. */
  y: number;
  width: number;
  runs: PositionedRun[];
};

// ---- Yjs fragment -> blocks ---------------------------------------------------------------------------------------

const MAX_BLOCKS = 20_000;
const MAX_DEPTH = 24;

/** http(s) and mailto only, checked on a copy with whitespace and control characters removed. */
function safeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const compact = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!/^(https?:|mailto:)/i.test(compact)) return undefined;
  return raw.trim().replace(/[\u0000-\u001f\u007f]+/g, "");
}

function sizeOf(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 8 && n <= 400 ? Math.round(n * 100) / 100 : undefined;
}

type Attrs = Record<string, unknown>;
const rec = (v: unknown): Attrs => (typeof v === "object" && v !== null ? (v as Attrs) : {});

function runOf(text: string, attrs: Attrs | undefined): RichRun {
  const marks: RichMark[] = [];
  const run: RichRun = { text, marks };
  if (!attrs) return run;
  if (attrs.bold) marks.push("bold");
  if (attrs.italic) marks.push("italic");
  if (attrs.underline) marks.push("underline");
  if (attrs.strike) marks.push("strike");
  if (attrs.link) {
    const href = safeHref(rec(attrs.link).href);
    if (href) run.href = href;
  }
  if (attrs.textStyle) {
    const size = sizeOf(rec(attrs.textStyle).fontSize);
    if (size !== undefined) run.size = size;
  }
  return run;
}

type Child = Y.XmlElement | Y.XmlText | Y.XmlHook;

function inlineRuns(parent: Y.XmlElement | Y.XmlFragment): RichRun[] {
  const runs: RichRun[] = [];
  for (const child of parent.toArray() as Child[]) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as Array<{ insert?: unknown; attributes?: Attrs }>) {
        if (typeof op.insert === "string" && op.insert !== "") runs.push(runOf(op.insert, op.attributes));
      }
    } else if (child instanceof Y.XmlElement) {
      if (child.nodeName === "hardBreak") runs.push({ text: "\n", marks: [] });
      else runs.push(...inlineRuns(child));
    }
  }
  return runs;
}

const ALIGNS = new Set(["left", "center", "right"]);

function blockAttrs(el: Y.XmlElement): Pick<RichBlock, "align" | "lineHeight"> {
  const out: Pick<RichBlock, "align" | "lineHeight"> = {};
  const a = el.getAttribute("textAlign");
  if (typeof a === "string" && ALIGNS.has(a)) out.align = a as RichBlock["align"];
  const lh = Number(el.getAttribute("lineHeight"));
  if (Number.isFinite(lh) && lh >= 0.8 && lh <= 3) out.lineHeight = lh;
  return out;
}

/** The editor's content as flat blocks. Everything it cannot draw degrades to its text; never throws on odd input. */
export function fragmentToBlocks(frag: Y.XmlFragment): RichBlock[] {
  const out: RichBlock[] = [];
  const walk = (parent: Y.XmlElement | Y.XmlFragment, list: { type: "bullet" | "ordered"; n: number } | null, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const child of parent.toArray() as Child[]) {
      if (out.length >= MAX_BLOCKS) return;
      if (child instanceof Y.XmlText) {
        const runs = inlineRuns({ toArray: () => [child] } as unknown as Y.XmlFragment);
        if (runs.length) out.push({ kind: "p", runs });
        continue;
      }
      if (!(child instanceof Y.XmlElement)) continue;
      switch (child.nodeName) {
        case "paragraph":
        case "heading": {
          const level = Math.min(3, Math.max(1, Math.round(Number(child.getAttribute("level")) || 1)));
          const attrs = blockAttrs(child);
          const runs = inlineRuns(child);
          if (list) {
            out.push({ kind: "li", listType: list.type, ...(list.type === "ordered" ? { index: list.n++ } : {}), ...attrs, runs });
          } else {
            out.push({ kind: child.nodeName === "heading" ? (`h${level}` as RichBlock["kind"]) : "p", ...attrs, runs });
          }
          break;
        }
        case "bulletList":
          walk(child, { type: "bullet", n: 1 }, depth + 1);
          break;
        case "orderedList": {
          const start = Number(child.getAttribute("start"));
          walk(child, { type: "ordered", n: Number.isFinite(start) && start >= 1 ? Math.floor(start) : 1 }, depth + 1);
          break;
        }
        case "listItem":
          // A list item holds paragraphs (and nested lists); each paragraph becomes an item of the enclosing list.
          walk(child, list ?? { type: "bullet", n: 1 }, depth + 1);
          break;
        case "hardBreak":
          break;
        default:
          walk(child, list, depth + 1);
      }
    }
  };
  try {
    walk(frag, null, 0);
  } catch {
    /* unreadable content: what was read so far is returned */
  }
  return out;
}

export function blocksToPlainText(blocks: RichBlock[]): string {
  return blocks.map((b) => b.runs.map((r) => r.text).join("")).join("\n");
}

const MD_SPECIAL = /([\\`*_[\]~])/g;

function markdownRun(r: RichRun): string {
  if (r.text === "" || r.text === "\n") return r.text === "\n" ? "  \n" : "";
  const lead = /^\s*/.exec(r.text)![0];
  const trail = /\s*$/.exec(r.text)![0];
  const core = r.text.slice(lead.length, r.text.length - trail.length);
  if (core === "") return r.text;
  let s = core.replace(MD_SPECIAL, "\\$1");
  if (r.marks.includes("strike")) s = `~~${s}~~`;
  if (r.marks.includes("italic")) s = `*${s}*`;
  if (r.marks.includes("bold")) s = `**${s}**`;
  if (r.href) s = `[${s}](${r.href.replace(/[()\s]/g, (c) => encodeURIComponent(c))})`;
  return lead + s + trail;
}

/** Markdown of the blocks (JSON Canvas text nodes are markdown). Underline has no markdown form and is dropped. */
export function blocksToMarkdown(blocks: RichBlock[]): string {
  const parts: string[] = [];
  let prevList = false;
  for (const b of blocks) {
    const text = b.runs.map(markdownRun).join("");
    let line: string;
    switch (b.kind) {
      case "h1":
        line = `# ${text}`;
        break;
      case "h2":
        line = `## ${text}`;
        break;
      case "h3":
        line = `### ${text}`;
        break;
      case "li":
        line = b.listType === "ordered" ? `${b.index ?? 1}. ${text}` : `- ${text}`;
        break;
      default:
        line = text;
    }
    const isList = b.kind === "li";
    if (parts.length) parts.push(isList && prevList ? "\n" : "\n\n");
    parts.push(line);
    prevList = isList;
  }
  return parts.join("");
}

// ---- layout -------------------------------------------------------------------------------------------------------

/** Inter's vertical metrics as a share of the font size (hhea ascender / descender). */
export const INTER_METRICS = { ascent: 0.96875, descent: 0.2412 } as const;
/** Heading sizes and weight as the canvas CSS sets them (`.atelier-rich h1..h3`). */
const HEADING_SCALE = { h1: 2, h2: 1.5, h3: 1.25 } as const;
const HEADING_WEIGHT = 600;
const LIST_INDENT_EM = 1.5;
const MAX_LINES = 50_000;

export type LayoutOptions = {
  /** Wrap width in px; null = never wrap (an auto-width text box). */
  width: number | null;
  fontSize: number;
  /** Unitless line-height multiplier. */
  lineHeight: number;
  align: "left" | "center" | "right";
  family: string;
  measure: TextMeasurer;
  metrics?: { ascent: number; descent: number };
  /** Weight of ordinary text (default 400); a bold mark is 700 and headings 600 whatever this is. */
  weight?: number;
};

type Atom = { text: string; kind: "word" | "space" | "break"; run: number; font: FontSpec; width: number };

function fontFor(block: RichBlock, run: RichRun, o: LayoutOptions): FontSpec {
  const heading = block.kind === "h1" || block.kind === "h2" || block.kind === "h3";
  const blockSize = heading ? o.fontSize * HEADING_SCALE[block.kind as "h1" | "h2" | "h3"] : o.fontSize;
  const bold = run.marks.includes("bold");
  return {
    family: o.family,
    weight: bold ? 700 : heading ? HEADING_WEIGHT : (o.weight ?? 400),
    italic: run.marks.includes("italic"),
    size: run.size ?? blockSize,
  };
}

/** Greedy word wrap of rich blocks. Baselines and widths are in the text box's own coordinates (origin top-left). */
export function layoutBlocks(blocks: RichBlock[], o: LayoutOptions): { lines: PositionedLine[]; height: number } {
  const metrics = o.metrics ?? INTER_METRICS;
  const fontSize = Number.isFinite(o.fontSize) && o.fontSize > 0 ? o.fontSize : 16;
  const lhDefault = Number.isFinite(o.lineHeight) && o.lineHeight > 0 ? o.lineHeight : 1.3;
  const wrapWidth = o.width === null || !Number.isFinite(o.width) ? null : Math.max(0, o.width);
  const lines: PositionedLine[] = [];
  type Pending = { runs: PositionedRun[]; width: number; indent: number; align: "left" | "center" | "right"; top: number; lh: number; size: number; avail: number | null };
  const pending: Pending[] = [];
  let y = 0;

  for (const block of blocks) {
    if (lines.length + pending.length > MAX_LINES) break;
    const indent = block.kind === "li" ? LIST_INDENT_EM * fontSize : 0;
    const avail = wrapWidth === null ? null : Math.max(wrapWidth - indent, 1);
    const align = block.align ?? o.align;
    const lhMul = block.lineHeight ?? lhDefault;

    // atoms: words, spaces and forced breaks, each with its own font
    const atoms: Atom[] = [];
    block.runs.forEach((run, ri) => {
      const font = fontFor(block, run, o);
      for (const part of run.text.split(/(\n|[^\S\n]+)/)) {
        if (part === "") continue;
        const kind: Atom["kind"] = part === "\n" ? "break" : /^\s+$/.test(part) ? "space" : "word";
        atoms.push({ text: part, kind, run: ri, font, width: kind === "break" ? 0 : o.measure(part, font) });
      }
    });

    const blockLines: { atoms: Atom[]; width: number }[] = [];
    let cur: { atoms: Atom[]; width: number } = { atoms: [], width: 0 };
    const flush = () => {
      while (cur.atoms.length && cur.atoms[cur.atoms.length - 1].kind === "space") cur.width -= cur.atoms.pop()!.width;
      blockLines.push(cur);
      cur = { atoms: [], width: 0 };
    };
    for (const a of atoms) {
      if (a.kind === "break") {
        flush();
        continue;
      }
      if (a.kind === "space") {
        if (cur.atoms.length) {
          cur.atoms.push(a);
          cur.width += a.width;
        }
        continue;
      }
      if (avail === null || cur.width + a.width <= avail + 1e-6) {
        cur.atoms.push(a);
        cur.width += a.width;
        continue;
      }
      if (cur.atoms.length) flush();
      if (a.width <= avail + 1e-6) {
        cur.atoms.push(a);
        cur.width += a.width;
        continue;
      }
      // a single word wider than the box: break it by character
      let piece = "";
      for (const ch of Array.from(a.text)) {
        const next = piece + ch;
        if (piece !== "" && o.measure(next, a.font) > avail + 1e-6) {
          cur.atoms.push({ ...a, text: piece, width: o.measure(piece, a.font) });
          cur.width = cur.atoms[0].width;
          flush();
          piece = ch;
        } else piece = next;
      }
      if (piece) {
        cur.atoms.push({ ...a, text: piece, width: o.measure(piece, a.font) });
        cur.width += cur.atoms[cur.atoms.length - 1].width;
      }
    }
    flush();

    blockLines.forEach((bl, li) => {
      // merge adjacent atoms of the same run into one positioned run
      const runs: PositionedRun[] = [];
      const source: number[] = [];
      let x = 0;
      for (const a of bl.atoms) {
        const last = runs[runs.length - 1];
        if (last && last.font === a.font && source[source.length - 1] === a.run) {
          last.text += a.text;
          last.width += a.width;
        } else {
          runs.push({ ...block.runs[a.run], text: a.text, x, width: a.width, font: a.font });
          source.push(a.run);
        }
        x += a.width;
      }
      let width = bl.width;
      if (li === 0 && block.kind === "li") {
        const first = runs[0]?.font ?? { family: o.family, weight: 400, italic: false, size: fontSize };
        const marker = block.listType === "ordered" ? `${block.index ?? 1}.` : "•";
        const mFont = { ...first, weight: 400, italic: false };
        const mWidth = o.measure(marker, mFont);
        runs.unshift({ text: marker, marks: [], x: -(mWidth + 0.3 * mFont.size), width: mWidth, font: mFont });
      }
      let size = block.kind === "li" || block.kind === "p" ? fontSize : fontSize * HEADING_SCALE[block.kind as "h1" | "h2" | "h3"];
      for (const r of runs) size = Math.max(size, r.font.size);
      if (runs.length === 0 && block.kind !== "p" && block.kind !== "li") size = fontSize * HEADING_SCALE[block.kind as "h1" | "h2" | "h3"];
      if (!Number.isFinite(width)) width = 0;
      pending.push({ runs, width, indent, align, top: 0, lh: lhMul, size, avail });
    });
  }

  // vertical positions, then alignment (a box without a width aligns within its widest line)
  const widest = pending.reduce((m, p) => Math.max(m, p.indent + p.width), 0);
  for (const p of pending) {
    const lineH = p.size * p.lh;
    p.top = y;
    y += lineH;
    const baseline = p.top + (lineH - (metrics.ascent + metrics.descent) * p.size) / 2 + metrics.ascent * p.size;
    const room = (p.avail === null ? widest - p.indent : p.avail) - p.width;
    const offset = p.align === "center" ? room / 2 : p.align === "right" ? room : 0;
    const x = p.indent + Math.max(0, Number.isFinite(offset) ? offset : 0);
    const runs = p.runs.map((r) => ({ ...r, x: r.x < 0 ? r.x + x : x + r.x }));
    lines.push({ x, y: baseline, width: p.width, runs });
  }
  return { lines, height: y };
}
