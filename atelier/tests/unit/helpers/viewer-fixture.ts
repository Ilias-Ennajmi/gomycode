import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

export const A1 = "a1111111-1111-4111-8111-111111111111";
export const A2 = "a2222222-2222-4222-8222-222222222222";
export const A3 = "a3333333-3333-4333-8333-333333333333";
export const A4 = "a4444444-4444-4444-8444-444444444444";

export const NOTES_A = "SECRET NOTES FOR A";
export const NOTES_B = "SECRET NOTES FOR B";
export const STICKY_B_TEXT = "Only frame B knows this";
export const CREDIT_A = "Photo by Jane Doe";
export const SOURCE_A = "https://example.com/jane";

function paragraph(frag: Y.XmlFragment, runs: { text: string; attrs?: Record<string, unknown> }[]) {
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  p.insert(0, [t]);
  frag.insert(frag.length, [p]);
  let at = 0;
  for (const r of runs) {
    t.insert(at, r.text, r.attrs);
    at += r.text.length;
  }
}

export interface Fixture {
  state: Uint8Array;
  doc: BoardDoc;
  ids: { frameA: string; frameB: string; imgA: string; imgB: string; imgFree: string; stickyA: string; stickyB: string; textFree: string; arrowAB: string; arrowInA: string; arrowAtoImgB: string; linkA: string; embedBad: string; videoA: string };
}

/**
 * Two frames side by side, a picture in each, one free picture lying over frame A, stickies with rich text, arrows, a link card,
 * a tampered embed and a video. Frame A has notes, credits, a source link.
 */
export function makeFixture(): Fixture {
  const doc = new BoardDoc();
  doc.meta.title = "Owner title";
  const frame = (name: string, x: number, order: string, notes: string) =>
    doc.create({ ...defaultsFor("frame"), name, x, y: 0, w: 800, h: 600, order, notes, background: null } as NewObject);
  const frameA = frame("Direction A", 0, "a0", NOTES_A);
  const frameB = frame("Direction B", 1000, "a1", NOTES_B);
  const image = (assetId: string, x: number, parentId: string | null, extra: Record<string, unknown> = {}) =>
    doc.create({ ...defaultsFor("image"), assetId, x, y: 50, w: 300, h: 200, parentId, title: "pic", ...extra } as NewObject);
  const imgA = image(A1, 50, frameA, { provenance: { sourceUrl: SOURCE_A, credit: CREDIT_A, licence: "CC BY 4.0", capturedAt: null } });
  const imgB = image(A2, 1050, frameB);
  const imgFree = image(A3, 100, null); // lies over frame A, but belongs to nothing
  const stickyA = doc.create({ ...defaultsFor("sticky"), x: 400, y: 300, parentId: frameA } as NewObject);
  const stickyB = doc.create({ ...defaultsFor("sticky"), x: 1400, y: 300, parentId: frameB } as NewObject);
  const textFree = doc.create({ ...defaultsFor("text"), x: 150, y: 400, parentId: null } as NewObject);
  paragraph(doc.content(stickyA)!, [{ text: "Hello ", attrs: { bold: true } }, { text: "<img src=x onerror=alert(1)>", attrs: { bold: null } }, { text: " site", attrs: { bold: null, link: { href: "javascript:alert(1)" } } }]);
  paragraph(doc.content(stickyB)!, [{ text: STICKY_B_TEXT }]);
  paragraph(doc.content(textFree)!, [{ text: "free text" }]);
  const arrow = (start: string, end: string, parentId: string | null) =>
    doc.create({
      ...defaultsFor("arrow"),
      parentId,
      start: { kind: "bound", id: start, anchor: { x: 0.5, y: 0.5 } },
      end: { kind: "bound", id: end, anchor: { x: 0.5, y: 0.5 } },
    } as NewObject);
  const arrowAB = arrow(frameA, frameB, null);
  const arrowInA = arrow(imgA, stickyA, frameA);
  const arrowAtoImgB = arrow(imgA, imgB, frameA);
  const linkA = doc.create({ ...defaultsFor("link"), url: "https://example.com/page", title: "A page", x: 500, y: 100, parentId: frameA } as NewObject);
  const embedBad = doc.create({ ...defaultsFor("embed"), provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", x: 500, y: 300, parentId: frameA } as NewObject);
  const videoA = doc.create({ ...defaultsFor("video"), assetId: A4, x: 60, y: 300, parentId: frameA } as NewObject);
  // Tamper with the embed behind the model's back: an allow-listed player becomes an arbitrary page.
  (doc.ydoc.getMap("objects").get(embedBad) as Y.Map<unknown>).set("embedUrl", "https://evil.example/phish");
  const state = Y.encodeStateAsUpdate(doc.ydoc);
  return { state, doc, ids: { frameA, frameB, imgA, imgB, imgFree, stickyA, stickyB, textFree, arrowAB, arrowInA, arrowAtoImgB, linkA, embedBad, videoA } };
}

export const assetRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "image" as const, width: 1600, height: 1000, variants: { w256: true, w1024: true } as never, source_url: null as string | null, credit: null as string | null, licence: null as string | null, ...over,
});

/** Every string value and key in a JSON-able value. */
export function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allStrings(v, out);
    }
  }
  return out;
}
