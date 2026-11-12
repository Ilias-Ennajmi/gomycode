// PDF deck writer. Draws a PdfPlan directly with jsPDF from the renderer-agnostic Scene (no svg2pdf.js: it needs a DOM and a
// worker has none): rectangles, ellipses and paths as vector shapes, text as real text in an embedded font, pictures as
// JPEG (PNG when they have transparency) downsampled to the page's dpi. Runs in the export worker; jsPDF is imported
// when the first PDF is written, so no other export loads it.
import type { GState as GStateType, jsPDF as JsPdf } from "jspdf";
import { boundsOf } from "@/lib/engine/geometry/rect";
import type { Rect } from "@/lib/engine/model/types";
import type { CreditsRow } from "@/lib/engine/provenance/credits";
import { LIGHT_TOKENS } from "./colors";
import { bundledFont, ttfCoverage } from "./fonts";
import { abortError, emptySummary, type ExportSummary } from "./protocol";
import {
  apply,
  ellipseCmds,
  multiply,
  parsePathD,
  rotateAbout,
  roundRectCmds,
  scaling,
  translation,
  transformCmds,
  type Cmd,
  type Matrix,
} from "./path-cmds";
import { DPI, imageTargetPx, planPdf, type PdfExtras, type PdfOptions, type PdfPage, type PdfPlan, type PdfSwatch } from "./pdf-plan";
import { drawImageNode, type JobDeps } from "./raster";
import type { ClipRect, FontRef, SceneNode, SceneSource } from "./scene";
import type { TextMeasurer } from "./text-layout";

export { framePageSize, imageTargetPx, planPdf, type PdfOptions } from "./pdf-plan";

export interface PdfFontSource {
  /** TrueType bytes for a font (the bundled Inter and Playfair Display), or null for a family that is not bundled. */
  ttf(font: FontRef): Promise<ArrayBuffer | null>;
}

type ImageNode = Extract<SceneNode, { kind: "image" }>;
type TextNode = Extract<SceneNode, { kind: "text" }>;

const PREFETCH = 4;
const MAX_BAKE_SIDE = 8192;
const MAX_BAKE_PIXELS = 48_000_000;
const JPEG_QUALITY = 0.85;
const TRUNCATE = 120;

const hex = LIGHT_TOKENS;
const PAPER = hex["--color-bg"];
const INK = hex["--color-ink"];
const MUTED = hex["--color-muted"];
const BORDER = hex["--color-border"];

// ---- fonts ------------------------------------------------------------------------------------------------------------

type Registered = { id: string; covers(cp: number): boolean; builtin: boolean };

const binaryString = (b: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};

class PdfFonts {
  private readonly cache = new Map<string, Registered>();
  private readonly byId = new Map<string, Registered>();
  readonly substituted = new Set<string>();
  readonly warnings = new Set<string>();

  constructor(
    private readonly doc: JsPdf,
    private readonly source: PdfFontSource,
  ) {}

  async get(font: FontRef): Promise<Registered> {
    const key = `${font.family}|${font.weight}|${font.italic}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    let use = font;
    let ttf = await this.source.ttf(font);
    if (!ttf) {
      this.substituted.add(font.family);
      use = { family: "Inter", weight: font.weight, italic: font.italic };
      ttf = await this.source.ttf(use);
    }
    let reg: Registered;
    if (ttf) {
      const file = bundledFont(use)?.file ?? `${use.family}-${use.weight}-${use.italic ? "i" : "n"}`;
      const id = `${use.family.replace(/\s+/g, "")}-${file.replace(/[^a-z0-9]/gi, "")}`;
      const have = this.byId.get(id);
      if (have) reg = have;
      else {
        const bytes = new Uint8Array(ttf);
        this.doc.addFileToVFS(`${id}.ttf`, binaryString(bytes));
        this.doc.addFont(`${id}.ttf`, id, "normal", 400, "Identity-H");
        reg = { id, covers: ttfCoverage(bytes), builtin: false };
        this.byId.set(id, reg);
      }
    } else {
      this.warnings.add("A font could not be embedded; text uses the standard PDF font instead.");
      reg = { id: "helvetica", covers: (cp) => cp <= 0xff, builtin: true };
    }
    this.cache.set(key, reg);
    return reg;
  }

  /** `text` with every character the font cannot draw replaced by a placeholder (and one warning). */
  clean(reg: Registered, text: string): string {
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x20 || cp === 0x7f || reg.covers(cp)) out += cp < 0x20 ? "" : ch;
      else {
        this.warnings.add("Some characters are outside the bundled fonts and were replaced by a placeholder (the PDF fonts cover Latin text).");
        out += reg.covers(0x25a1) ? "□" : reg.covers(0xfffd) ? "�" : "?";
      }
    }
    return out;
  }
}

// ---- pictures: loaded a few ahead, baked to the page's resolution ------------------------------------------------------

type ImageJob = { node: ImageNode; need: number };

class ImageFeed {
  private readonly pending = new Map<number, Promise<ImageBitmap | null>>();
  private started = 0;
  private taken = 0;
  constructor(
    private readonly jobs: ImageJob[],
    private readonly d: JobDeps,
  ) {
    this.topUp();
  }
  private topUp(): void {
    while (this.started < this.jobs.length && this.pending.size < PREFETCH) {
      const k = this.started++;
      const { node, need } = this.jobs[k];
      this.pending.set(k, this.d.images.load(node.assetId, need, { noOriginal: node.noOriginal }).catch(() => null));
    }
  }
  async next(): Promise<ImageBitmap | null> {
    const k = this.taken++;
    const bmp = await this.pending.get(k)!;
    this.pending.delete(k);
    this.topUp();
    return bmp;
  }
}

function cropFraction(n: ImageNode): number {
  return n.crop ? Math.max(n.crop.w, n.crop.h, 0.01) : 1;
}

// ---- the writer -------------------------------------------------------------------------------------------------------

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export interface PdfDeps extends JobDeps {
  fonts: PdfFontSource;
}

/** Write a planned deck. Resolves with the PDF, a summary of what could not be done exactly, and the page count. */
export async function renderPdf(plan: PdfPlan, d: PdfDeps): Promise<{ blob: Blob; summary: ExportSummary; pageCount: number }> {
  const check = () => {
    if (d.signal.aborted) throw abortError();
  };
  check();
  const { jsPDF, GState } = await import("jspdf");
  const first = plan.pages[0] ?? { wPt: 1440, hPt: 810 };
  const orient = (p: { wPt: number; hPt: number }) => (p.wPt >= p.hPt ? "l" : "p");
  const doc = new jsPDF({ unit: "pt", format: [first.wPt, first.hPt], orientation: orient(first), compress: plan.compress, putOnlyUsedFonts: true });
  doc.setProperties({ title: plan.title, creator: "Atelier" });
  const fonts = new PdfFonts(doc, d.fonts);
  const failed = new Set<string>();
  const summary = emptySummary();
  summary.warnings.push(...plan.warnings);
  const dpi = DPI[plan.quality];
  const gstate = (opacity: number): GStateType => new GState({ opacity, "stroke-opacity": opacity });

  // pictures in drawing order, with the resolution each needs
  const jobs: ImageJob[] = [];
  for (const page of plan.pages) {
    if (page.kind !== "frame") continue;
    const s = page.wPt / Math.max(page.scene.width, 1e-6);
    for (const n of page.scene.nodes) {
      if (n.kind !== "image") continue;
      const px = imageTargetPx(n.w * s, dpi, Number.MAX_SAFE_INTEGER);
      jobs.push({ node: n, need: (px * Math.max(n.w, n.h)) / Math.max(n.w, 1e-6) / cropFraction(n) });
    }
  }
  const feed = new ImageFeed(jobs, d);

  // ---- drawing primitives (all coordinates in points, y down) ----
  const pathOut = (cmds: Cmd[]): void => {
    for (const c of cmds) {
      if (c[0] === "M") doc.moveTo(c[1], c[2]);
      else if (c[0] === "L") doc.lineTo(c[1], c[2]);
      else if (c[0] === "C") doc.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
      else doc.close();
    }
  };
  const clipTo = (clip: ClipRect | null, s: number): void => {
    const chain: ClipRect[] = [];
    for (let c = clip; c; c = c.outer ?? null) chain.unshift(c);
    for (const c of chain) {
      let cmds = roundRectCmds(c.x, c.y, c.w, c.h, 0);
      if (c.rotation) cmds = transformCmds(cmds, rotateAbout(c.rotation, c.x + c.w / 2, c.y + c.h / 2));
      pathOut(transformCmds(cmds, scaling(s)));
      doc.clip();
      doc.discardPath();
    }
  };
  const paintPath = (cmds: Cmd[], p: { fill: string | null; stroke: string | null; strokeWidth: number; dash: number[] | null; cap?: "round" }, s: number): void => {
    const stroke = !!p.stroke && p.strokeWidth > 0;
    if (!p.fill && !stroke) return;
    if (p.fill) doc.setFillColor(...rgb(p.fill));
    if (stroke) {
      doc.setDrawColor(...rgb(p.stroke!));
      doc.setLineWidth(p.strokeWidth * s);
      doc.setLineJoin("round");
      doc.setLineCap(p.cap === "round" ? "round" : "butt");
      doc.setLineDashPattern(p.dash ? p.dash.map((v) => v * s) : [], 0);
    }
    pathOut(cmds);
    if (p.fill && stroke) doc.fillStroke();
    else if (p.fill) doc.fill();
    else doc.stroke();
  };

  const drawText = async (n: TextNode, s: number): Promise<void> => {
    const pivot = { x: n.cx, y: n.cy };
    const rot = n.rotation ? rotateAbout(n.rotation, pivot.x, pivot.y) : null;
    for (const line of n.lines) {
      for (const run of line.runs) {
        if (run.text === "") continue;
        const reg = await fonts.get(run.font);
        const text = fonts.clean(reg, run.text);
        if (text === "") continue;
        const o = { x: n.x + run.x, y: n.y + line.y };
        const at = rot ? apply(rot, o.x, o.y) : o;
        const size = run.font.size * s;
        doc.setFont(reg.id, "normal");
        doc.setFontSize(size);
        doc.setTextColor(...rgb(run.color ?? n.color));
        doc.text(text, at.x * s, at.y * s, { baseline: "alphabetic", ...(n.rotation ? { angle: (-n.rotation * 180) / Math.PI } : {}) });
        const deco = [run.marks.includes("underline") ? 0.12 : null, run.marks.includes("strike") ? -0.3 : null].filter((v): v is number => v !== null);
        if (deco.length) {
          doc.setDrawColor(...rgb(run.color ?? n.color));
          doc.setLineWidth(Math.max(0.4, size / 14));
          for (const dy of deco) {
            const a = { x: o.x, y: o.y + run.font.size * dy };
            const b = { x: o.x + run.width, y: a.y };
            const pa = rot ? apply(rot, a.x, a.y) : a;
            const pb = rot ? apply(rot, b.x, b.y) : b;
            doc.line(pa.x * s, pa.y * s, pb.x * s, pb.y * s);
          }
        }
      }
    }
  };

  const bake = async (n: ImageNode, bmp: ImageBitmap, s: number): Promise<{ bytes: Uint8Array; png: boolean; bounds: Rect } | null> => {
    const bounds = boundsOf(n);
    const coverPx = bmp.width * (n.crop ? n.crop.w : 1);
    const wPx = imageTargetPx(n.w * s, dpi, Math.max(1, coverPx));
    let ps = wPx / Math.max(n.w, 1e-6);
    let cw = Math.max(1, Math.ceil(bounds.w * ps));
    let ch = Math.max(1, Math.ceil(bounds.h * ps));
    const over = Math.max(cw / MAX_BAKE_SIDE, ch / MAX_BAKE_SIDE, Math.sqrt((cw * ch) / MAX_BAKE_PIXELS));
    if (over > 1) {
      ps /= over;
      cw = Math.max(1, Math.ceil(bounds.w * ps));
      ch = Math.max(1, Math.ceil(bounds.h * ps));
    }
    const factory = d.canvasFactory ?? ((w: number, h: number) => new OffscreenCanvas(w, h));
    const canvas = factory(cw, ch);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.setTransform(ps, 0, 0, ps, -bounds.x * ps, -bounds.y * ps);
    drawImageNode(ctx, n, bmp, ps, factory);
    const px = ctx.getImageData(0, 0, cw, ch).data;
    let png = false;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < 255) {
        png = true;
        break;
      }
    }
    const blob = await canvas.convertToBlob({ type: png ? "image/png" : "image/jpeg", quality: JPEG_QUALITY });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), png, bounds };
  };

  let imageCounter = 0;
  const drawNode = async (n: SceneNode, s: number): Promise<void> => {
    const opacity = n.kind === "text" || n.kind === "image" ? n.opacity : n.opacity;
    if (!(opacity > 0) && n.kind !== "image") return;
    doc.saveGraphicsState();
    try {
      clipTo(n.clip, s);
      if (n.kind !== "image" && opacity < 1) doc.setGState(gstate(opacity));
      switch (n.kind) {
        case "rect": {
          let cmds = roundRectCmds(n.x, n.y, n.w, n.h, n.radius);
          if (n.rotation) cmds = transformCmds(cmds, rotateAbout(n.rotation, n.x + n.w / 2, n.y + n.h / 2));
          paintPath(transformCmds(cmds, scaling(s)), n, s);
          break;
        }
        case "ellipse": {
          let cmds = ellipseCmds(n.x, n.y, n.w, n.h);
          if (n.rotation) cmds = transformCmds(cmds, rotateAbout(n.rotation, n.x + n.w / 2, n.y + n.h / 2));
          paintPath(transformCmds(cmds, scaling(s)), n, s);
          break;
        }
        case "path": {
          const m: Matrix = multiply(scaling(s), translation(n.dx, n.dy));
          paintPath(transformCmds(parsePathD(n.d), m), n, s);
          break;
        }
        case "text":
          await drawText(n, s);
          break;
        case "image": {
          const bmp = await feed.next();
          check();
          const baked = bmp ? await bake(n, bmp, s) : null;
          if (!baked) {
            failed.add(n.assetId);
            let cmds = roundRectCmds(n.x, n.y, n.w, n.h, 0);
            if (n.rotation) cmds = transformCmds(cmds, rotateAbout(n.rotation, n.x + n.w / 2, n.y + n.h / 2));
            paintPath(transformCmds(cmds, scaling(s)), { fill: BORDER, stroke: MUTED, strokeWidth: 0.5 / s, dash: null }, s);
          } else {
            doc.addImage(baked.bytes, baked.png ? "PNG" : "JPEG", baked.bounds.x * s, baked.bounds.y * s, baked.bounds.w * s, baked.bounds.h * s, `img${++imageCounter}`, "FAST");
          }
          break;
        }
      }
    } finally {
      doc.restoreGraphicsState();
    }
  };

  // ---- utility pages ----
  const font = async (family: "Inter" | "Playfair Display", weight: number, italic = false) => fonts.get({ family, weight, italic });
  const setText = async (family: "Inter" | "Playfair Display", weight: number, size: number, color: string): Promise<void> => {
    const f = await font(family, weight);
    doc.setFont(f.id, "normal");
    doc.setFontSize(size);
    doc.setTextColor(...rgb(color));
  };
  const textAt = async (text: string, x: number, y: number, family: "Inter" | "Playfair Display", weight: number, size: number, color: string): Promise<void> => {
    const f = await font(family, weight);
    await setText(family, weight, size, color);
    const t = fonts.clean(f, text);
    if (t) doc.text(t, x, y, { baseline: "alphabetic" });
  };
  const fit = (text: string, maxW: number): string => {
    let t = text.length > TRUNCATE ? `${text.slice(0, TRUNCATE - 1)}…` : text;
    if (doc.getTextWidth(t) <= maxW) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };
  const fillRect = (x: number, y: number, w: number, h: number, color: string, radius = 0): void => {
    doc.setFillColor(...rgb(color));
    pathOut(roundRectCmds(x, y, w, h, radius));
    doc.fill();
  };

  const drawCover = async (p: Extract<PdfPage, { kind: "cover" }>): Promise<void> => {
    fillRect(0, 0, p.wPt, p.hPt, PAPER);
    const m = p.wPt * 0.08;
    const size = Math.min(p.wPt * 0.06, p.hPt * 0.13);
    await setText("Playfair Display", 700, size, INK);
    const lines: string[] = (doc.splitTextToSize(fonts.clean(await font("Playfair Display", 700), p.title || "Untitled"), p.wPt - 2 * m) as string[]).slice(0, 3);
    let y = p.hPt * 0.36;
    for (const l of lines) {
      doc.text(l, m, y, { baseline: "alphabetic" });
      y += size * 1.15;
    }
    y += size * 0.3;
    if (p.client) {
      await textAt(p.client, m, y, "Inter", 500, size * 0.34, INK);
      y += size * 0.5;
    }
    if (p.date) await textAt(p.date, m, y, "Inter", 400, size * 0.28, MUTED);
    if (p.swatches.length) {
      const h = p.hPt * 0.07;
      let x = 0;
      const total = p.swatches.reduce((sum, s) => sum + Math.max(s.weight, 0.02), 0);
      for (const s of p.swatches) {
        const w = (Math.max(s.weight, 0.02) / total) * p.wPt;
        fillRect(x, p.hPt - h, w, h, s.hex);
        x += w;
      }
    }
  };

  const drawPalette = async (p: Extract<PdfPage, { kind: "palette" }>): Promise<void> => {
    fillRect(0, 0, p.wPt, p.hPt, PAPER);
    const m = p.wPt * 0.07;
    await textAt("Palette", m, p.hPt * 0.14, "Playfair Display", 700, Math.min(p.wPt * 0.04, p.hPt * 0.09), INK);
    const n = p.swatches.length;
    const cols = Math.min(n, n > 8 ? 6 : 4);
    const rows = Math.ceil(n / cols);
    const gap = p.wPt * 0.02;
    const top = p.hPt * 0.22;
    const cellW = (p.wPt - 2 * m - (cols - 1) * gap) / cols;
    const cellH = (p.hPt - top - m) / rows;
    const label = Math.max(7, Math.min(cellW * 0.12, cellH * 0.09));
    for (let i = 0; i < n; i++) {
      const s: PdfSwatch = p.swatches[i];
      const x = m + (i % cols) * (cellW + gap);
      const y = top + Math.floor(i / cols) * cellH;
      const chip = cellH * 0.62;
      fillRect(x, y, cellW, chip, s.hex, 6);
      let ty = y + chip + label * 1.5;
      if (s.name) {
        await textAt(s.name, x, ty, "Inter", 500, label, INK);
        ty += label * 1.3;
      }
      await textAt(s.hex.toUpperCase(), x, ty, "Inter", 400, label * 0.9, MUTED);
      ty += label * 1.2;
      if (s.weight > 0) await textAt(`${Math.round(s.weight * 100)}%`, x, ty, "Inter", 400, label * 0.9, MUTED);
    }
  };

  const drawCredits = async (p: Extract<PdfPage, { kind: "credits" }>): Promise<void> => {
    fillRect(0, 0, p.wPt, p.hPt, PAPER);
    const m = Math.min(p.wPt * 0.06, p.hPt * 0.07);
    const title = p.count > 1 ? `Credits (${p.index + 1} of ${p.count})` : "Credits";
    await textAt(title, m, m + 4, "Playfair Display", 700, Math.min(p.wPt * 0.03, p.hPt * 0.055), INK);
    const top = m + Math.min(p.wPt * 0.03, p.hPt * 0.055) + 14;
    const rowH = (p.hPt - top - m * 0.7) / 41;
    const size = Math.max(5, rowH * 0.5);
    const cols = [
      { label: "File", w: 0.22, get: (r: CreditsRow) => r.file },
      { label: "Credit", w: 0.28, get: (r: CreditsRow) => r.credit },
      { label: "Licence", w: 0.2, get: (r: CreditsRow) => r.licence },
      { label: "Source", w: 0.3, get: (r: CreditsRow) => r.source },
    ];
    const width = p.wPt - 2 * m;
    let y = top;
    const headFont = await font("Inter", 700);
    await setText("Inter", 700, size, INK);
    let x = m;
    for (const c of cols) {
      doc.text(fonts.clean(headFont, c.label), x, y + rowH * 0.7, { baseline: "alphabetic" });
      x += c.w * width;
    }
    y += rowH;
    doc.setDrawColor(...rgb(BORDER));
    doc.setLineWidth(0.5);
    doc.line(m, y, m + width, y);
    const body = await font("Inter", 400);
    await setText("Inter", 400, size, INK);
    for (const row of p.rows) {
      x = m;
      for (const c of cols) {
        const raw = fonts.clean(body, c.get(row));
        doc.text(fit(raw, c.w * width - size), x, y + rowH * 0.7, { baseline: "alphabetic" });
        x += c.w * width;
      }
      y += rowH;
      doc.setDrawColor(...rgb(BORDER));
      doc.line(m, y, m + width, y);
    }
  };

  // ---- pages ----
  const total = Math.max(plan.pages.length, 1);
  for (let pi = 0; pi < plan.pages.length; pi++) {
    check();
    const page = plan.pages[pi];
    if (pi > 0) doc.addPage([page.wPt, page.hPt], orient(page));
    d.onProgress(pi / total, `Page ${pi + 1} of ${plan.pages.length}`);
    if (page.kind === "frame") {
      const s = page.wPt / Math.max(page.scene.width, 1e-6);
      if (page.scene.background) fillRect(0, 0, page.wPt, page.hPt, page.scene.background);
      for (let i = 0; i < page.scene.nodes.length; i++) {
        check();
        await drawNode(page.scene.nodes[i], s);
        if ((i + 1) % 20 === 0) d.onProgress((pi + (i + 1) / page.scene.nodes.length) / total, `Page ${pi + 1} of ${plan.pages.length}`);
      }
    } else if (page.kind === "cover") await drawCover(page);
    else if (page.kind === "palette") await drawPalette(page);
    else await drawCredits(page);
  }
  check();
  const bytes = doc.output("arraybuffer");
  check();
  d.onProgress(1, "Done");
  summary.failedAssets = [...failed];
  summary.substitutedFonts = [...fonts.substituted].sort();
  summary.warnings.push(...fonts.warnings);
  summary.width = Math.round(first.wPt);
  summary.height = Math.round(first.hPt);
  return { blob: new Blob([bytes], { type: "application/pdf" }), summary, pageCount: Math.max(plan.pages.length, 1) };
}

/** Plan and write a deck from a board in one go (tests, and anything that does not need the worker split). */
export async function buildPdf(
  src: SceneSource,
  o: PdfOptions,
  d: PdfDeps & { measure: TextMeasurer; extras?: PdfExtras },
): Promise<{ blob: Blob; summary: ExportSummary; pageCount: number }> {
  return renderPdf(planPdf(src, o, d.measure, d.extras), d);
}

