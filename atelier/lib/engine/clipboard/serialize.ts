import type { BoardDoc } from "../doc/board-doc";
import { rotateAround } from "../geometry/transform";
import type { ArrowObj, CanvasObject, Point, Terminal } from "../model/types";
import { richBlocks, richContentToJSON, type RichJSON } from "./rich";

/** Marker inside the clipboard HTML comment: `<!-- atelier:v1 BASE64 -->`. */
export const ATELIER_MARKER = "atelier:v1";

/** An object as it travels on the clipboard: plain props plus rich content as editor JSON. */
export type SerializedObject = Record<string, unknown> & { id: string; type: string; content?: RichJSON };

export type AtelierPayload = {
  v: 1;
  objects: SerializedObject[];
  assets: { id: string; url: string; w: number; h: number }[];
};

export type SerializeOptions = {
  /** Public URL of an asset, used only for the readable fallback and the asset list. */
  assetUrl?: (assetId: string) => string | null;
};

export function encodeBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Canvas position of a normalised anchor on a (possibly rotated) target. */
export function anchorPoint(t: CanvasObject, anchor: Point): Point {
  const center = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  return rotateAround({ x: t.x + anchor.x * t.w, y: t.y + anchor.y * t.h }, center, t.rotation);
}

function selectionClosure(doc: BoardDoc, ids: string[]): Set<string> {
  const set = new Set<string>();
  const stack = ids.filter((id) => doc.get(id));
  while (stack.length) {
    const id = stack.pop()!;
    if (set.has(id)) continue;
    set.add(id);
    for (const c of doc.childrenOf(id)) stack.push(c.id);
  }
  return set;
}

/**
 * Copy: the selection (and the children of copied frames and groups) as a clipboard payload. Arrows keep their
 * binding only to targets that are copied too; other ends become free points where the target currently is.
 */
export function serializeSelection(
  doc: BoardDoc,
  ids: string[],
  opts: SerializeOptions = {},
): { html: string; text: string } {
  const set = selectionClosure(doc, ids);
  if (set.size === 0) return { html: "", text: "" };
  const chosen = doc.all().filter((o) => set.has(o.id)); // z-order

  const unbind = (arrow: ArrowObj, t: Terminal, fallback: Point): Terminal => {
    if (t.kind !== "bound" || set.has(t.id)) return t;
    const target = doc.get(t.id);
    const p = target ? anchorPoint(target, t.anchor) : fallback;
    return { kind: "point", x: p.x, y: p.y };
  };

  const objects: SerializedObject[] = [];
  const assets: AtelierPayload["assets"] = [];
  const seenAssets = new Set<string>();
  const blocks: { tag: string; text: string }[] = [];
  const images: string[] = [];
  const plain: string[] = [];

  for (const o of chosen) {
    const ser: SerializedObject = { ...(o as unknown as Record<string, unknown>), id: o.id, type: o.type };
    if (o.type === "arrow") {
      ser.start = unbind(o, o.start, { x: o.x, y: o.y });
      ser.end = unbind(o, o.end, { x: o.x + o.w, y: o.y + o.h });
      if (o.label) {
        blocks.push({ tag: "p", text: o.label });
        plain.push(o.label);
      }
    }
    const frag = doc.content(o.id);
    if (frag) {
      ser.content = richContentToJSON(frag);
      for (const b of richBlocks(ser.content)) {
        blocks.push(b);
        plain.push(b.text);
      }
    }
    if (o.type === "frame" && o.name) {
      blocks.push({ tag: "h2", text: o.name });
      plain.push(o.name);
    }
    if (o.type === "image" && o.assetId) {
      const url = opts.assetUrl?.(o.assetId) ?? "";
      if (!seenAssets.has(o.assetId)) {
        seenAssets.add(o.assetId);
        assets.push({ id: o.assetId, url, w: o.w, h: o.h });
      }
      if (url) {
        images.push(`<img src="${escapeHtml(url)}" alt="" width="${Math.round(o.w)}" height="${Math.round(o.h)}">`);
        plain.push(url);
      }
    }
    objects.push(ser);
  }

  const payload: AtelierPayload = { v: 1, objects, assets };
  const comment = `<!-- ${ATELIER_MARKER} ${encodeBase64Utf8(JSON.stringify(payload))} -->`;
  const body = [...blocks.map((b) => `<${b.tag}>${escapeHtml(b.text)}</${b.tag}>`), ...images].join("");
  return { html: `<meta charset="utf-8">${comment}<div>${body}</div>`, text: plain.join("\n") };
}
