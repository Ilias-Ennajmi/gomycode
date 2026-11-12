import { z } from "zod";
import type { BoardDoc } from "../doc/board-doc";
import { boundsOf, unionRects } from "../geometry/rect";
import { defaultsFor } from "../model/defaults";
import { keyBetween } from "../model/index-order";
import type { CanvasObject, NewObject, Point, Terminal } from "../model/types";
import { validateObject } from "../model/validate";
import { newId } from "@/lib/ids";
import { writeRichContent, type RichJSON } from "./rich";
import { ATELIER_MARKER, decodeBase64Utf8, type AtelierPayload } from "./serialize";

export type PasteItem =
  | { kind: "atelier"; payload: AtelierPayload }
  | { kind: "image"; file: File }
  | { kind: "url"; url: string }
  | { kind: "text"; text: string; lines: number };

const MAX_PAYLOAD_OBJECTS = 5000;

const payloadSchema = z.object({
  v: z.literal(1),
  objects: z.array(z.looseObject({ id: z.string().min(1).max(128), type: z.string() })).max(MAX_PAYLOAD_OBJECTS),
  assets: z.array(z.object({ id: z.string(), url: z.string(), w: z.number(), h: z.number() })).default([]),
});

const MARKER_RE = new RegExp(`<!--\\s*${ATELIER_MARKER}\\s+([\\s\\S]*?)\\s*-->`);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif|tiff?)$/i;

function extractPayload(html: string): AtelierPayload | null {
  const m = MARKER_RE.exec(html);
  if (!m) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(decodeBase64Utf8(m[1])));
    return parsed.success ? (parsed.data as AtelierPayload) : null;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function isImageFile(f: File): boolean {
  return f.type ? f.type.startsWith("image/") : IMAGE_EXT.test(f.name);
}

function textItem(raw: string): PasteItem | null {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (!text.trim()) return null;
  const t = text.trim();
  if (!/\s/.test(t)) {
    try {
      const u = new URL(t);
      if (u.protocol === "http:" || u.protocol === "https:") return { kind: "url", url: t };
    } catch {
      /* not a URL */
    }
  }
  return { kind: "text", text, lines: text.split("\n").length };
}

/**
 * Turn what the browser put on the clipboard (or dropped) into paste items. Image files win over text; an Atelier
 * payload wins over plain text; a damaged payload falls back to text. Never throws.
 */
export function parseClipboard(input: { html?: string; text?: string; files?: File[] }): PasteItem[] {
  try {
    const images = (input.files ?? []).filter(isImageFile);
    if (images.length) return images.map((file) => ({ kind: "image" as const, file }));

    const payload = input.html ? extractPayload(input.html) : null;
    if (payload) return [{ kind: "atelier", payload }];

    let text = input.text ?? "";
    if (!text.trim() && input.html) text = htmlToText(input.html);
    const item = textItem(text);
    return item ? [item] : [];
  } catch {
    return [];
  }
}

// ---- insertion ---------------------------------------------------------------------------------------------

/** Remembers the last paste point so pasting in the same place again steps down and right. */
export type PasteState = { at: Point | null; count: number };
export function createPasteState(): PasteState {
  return { at: null, count: 0 };
}

export type PasteOptions = {
  /** Hands an image file to the uploader at a canvas point. A returned id is included in the result. */
  addImage?: (file: File, at: Point) => string | void | Promise<unknown>;
  onImageError?: (file: File, error: unknown) => void;
  state?: PasteState;
  /** Offset per repeated paste, default 16. */
  step?: number;
};

const IMAGE_CELL = 320;
const GUTTER = 16;
const IMAGES_PER_ROW = 6;

function pasteAtelier(doc: BoardDoc, payload: AtelierPayload, center: Point): string[] {
  type Entry = { obj: CanvasObject; content?: RichJSON; newId: string };
  const entries: Entry[] = [];
  const idMap = new Map<string, string>();
  for (const raw of payload.objects) {
    const obj = validateObject(raw);
    if (!obj || idMap.has(obj.id)) continue;
    const nid = newId();
    idMap.set(obj.id, nid);
    entries.push({ obj, content: raw.content as RichJSON | undefined, newId: nid });
  }
  if (entries.length === 0) return [];

  const u = unionRects(entries.map((e) => boundsOf(e.obj)))!;
  const dx = center.x - (u.x + u.w / 2);
  const dy = center.y - (u.y + u.h / 2);

  let lastOrder: string | null = null;
  for (const o of doc.all()) if (o.type === "frame" && (lastOrder === null || o.order > lastOrder)) lastOrder = o.order;

  const term = (t: Terminal, fallback: Point): Terminal => {
    if (t.kind === "point") return { kind: "point", x: t.x + dx, y: t.y + dy };
    const mapped = idMap.get(t.id);
    if (mapped) return { kind: "bound", id: mapped, anchor: t.anchor };
    return { kind: "point", x: fallback.x + dx, y: fallback.y + dy };
  };

  const specs: NewObject[] = entries.map(({ obj, newId: id }) => {
    const { index: _i, createdAt: _c, updatedAt: _u, ...rest } = obj;
    void _i;
    void _c;
    void _u;
    const spec = {
      ...rest,
      id,
      x: obj.x + dx,
      y: obj.y + dy,
      parentId: obj.parentId ? (idMap.get(obj.parentId) ?? null) : null,
    } as NewObject;
    if (obj.type === "arrow" && spec.type === "arrow") {
      spec.start = term(obj.start, { x: obj.x, y: obj.y });
      spec.end = term(obj.end, { x: obj.x + obj.w, y: obj.y + obj.h });
    }
    if (spec.type === "frame") {
      lastOrder = keyBetween(lastOrder, null);
      spec.order = lastOrder;
    }
    return spec;
  });

  doc.transact(() => {
    doc.createMany(specs);
    for (const e of entries) {
      const frag = e.content ? doc.content(e.newId) : undefined;
      if (frag && e.content) writeRichContent(frag, e.content);
    }
  });
  return entries.map((e) => e.newId);
}

function pasteText(doc: BoardDoc, text: string, link: string | null, center: Point): string[] {
  const d = defaultsFor("text");
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  const w = Math.min(480, Math.max(120, Math.round(longest * d.fontSize * 0.55)));
  const wrapped = lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * d.fontSize * 0.55) / w)), 0);
  const h = Math.max(d.h, Math.round(wrapped * d.fontSize * d.lineHeight));
  const json: RichJSON = {
    type: "doc",
    content: lines.map((l) => ({
      type: "paragraph",
      ...(l
        ? { content: [{ type: "text", text: l, ...(link ? { marks: [{ type: "link", attrs: { href: link } }] } : {}) }] }
        : {}),
    })),
  };
  let id = "";
  doc.transact(() => {
    id = doc.create({
      ...d,
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      autoWidth: lines.length === 1 && w < 480,
    });
    const frag = doc.content(id);
    if (frag) writeRichContent(frag, json);
  });
  return [id];
}

/**
 * Paste: insert items so their middle sits on `at`. Atelier payloads become new objects (arrows rebound to copied
 * targets, otherwise free); text and URLs become text objects (URLs with a link mark); images go to `opts.addImage`
 * in a grid. One undo step for everything that lands in the doc at once. Returns the ids created synchronously.
 */
export function insertPaste(doc: BoardDoc, items: PasteItem[], at: Point, opts: PasteOptions = {}): string[] {
  if (items.length === 0) return [];
  const step = opts.step ?? 16;
  let n = 0;
  if (opts.state) {
    const s = opts.state;
    s.count = s.at && Math.abs(s.at.x - at.x) < 1 && Math.abs(s.at.y - at.y) < 1 ? s.count + 1 : 0;
    s.at = { x: at.x, y: at.y };
    n = s.count;
  }
  const center = { x: at.x + n * step, y: at.y + n * step };

  const ids: string[] = [];
  const images: File[] = [];
  doc.transact(() => {
    for (const item of items) {
      if (item.kind === "atelier") ids.push(...pasteAtelier(doc, item.payload, center));
      else if (item.kind === "text") ids.push(...pasteText(doc, item.text, null, center));
      else if (item.kind === "url") ids.push(...pasteText(doc, item.url, item.url, center));
      else images.push(item.file);
    }
  });

  if (images.length && opts.addImage) {
    const cols = Math.min(IMAGES_PER_ROW, images.length);
    const rows = Math.ceil(images.length / IMAGES_PER_ROW);
    const pitch = IMAGE_CELL + GUTTER;
    const x0 = center.x - (cols * IMAGE_CELL + (cols - 1) * GUTTER) / 2;
    const y0 = center.y - (rows * IMAGE_CELL + (rows - 1) * GUTTER) / 2;
    images.forEach((file, i) => {
      const pos = {
        x: x0 + (i % IMAGES_PER_ROW) * pitch + IMAGE_CELL / 2,
        y: y0 + Math.floor(i / IMAGES_PER_ROW) * pitch + IMAGE_CELL / 2,
      };
      try {
        const r = opts.addImage!(file, pos);
        if (typeof r === "string") ids.push(r);
        else if (r && typeof (r as Promise<unknown>).then === "function") {
          (r as Promise<unknown>).then(
            (v) => void v,
            (err) => opts.onImageError?.(file, err),
          );
        }
      } catch (err) {
        opts.onImageError?.(file, err);
      }
    });
  }
  return ids;
}
