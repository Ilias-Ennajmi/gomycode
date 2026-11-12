import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { canvasToScreen } from "@/lib/engine/geometry/camera";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { FrameObj, NewObject } from "@/lib/engine/model/types";
import { clamp, nextIndex, orderedSlides, slideAnnouncement, slideCamera, slidesOf, cameraForSlide, slideIndexOf } from "@/lib/engine/present/slides";
import { moveSlide, reorderSlides, setSlideOrder, slidesOfDoc } from "@/lib/engine/present/doc-slides";

let n = 0;
const frame = (extra: Partial<FrameObj> = {}): FrameObj =>
  ({ ...defaultsFor("frame"), id: `f${++n}`, index: `a${n}`, createdAt: 0, updatedAt: 0, ...extra }) as FrameObj;
const spec = (id: string, extra: Record<string, unknown> = {}): NewObject => ({ ...defaultsFor("frame"), id, ...extra }) as NewObject;

describe("slidesOf", () => {
  it("sorts top-level frames by order, then by z-index, then by id", () => {
    const a = frame({ id: "a", order: "a2", index: "a1" });
    const b = frame({ id: "b", order: "a0", index: "a2" });
    const c = frame({ id: "c", order: "a1", index: "a3" });
    expect(slidesOf([a, b, c]).map((s) => s.id)).toEqual(["b", "c", "a"]);
    const tieA = frame({ id: "x", order: "a0", index: "a9" });
    const tieB = frame({ id: "y", order: "a0", index: "a5" });
    const tieC = frame({ id: "w", order: "a0", index: "a5" });
    expect(slidesOf([tieA, tieB, tieC]).map((s) => s.id)).toEqual(["w", "y", "x"]);
  });

  it("appends frames without an order, deterministically and after the ordered ones", () => {
    const ordered = frame({ id: "o", order: "a5", index: "a9" });
    const u1 = frame({ id: "u1", order: "", index: "a2" });
    const u2 = frame({ id: "u2", order: "  ", index: "a1" });
    expect(slidesOf([u1, ordered, u2]).map((s) => s.id)).toEqual(["o", "u2", "u1"]);
    expect(slidesOf([u2, u1, ordered]).map((s) => s.id)).toEqual(["o", "u2", "u1"]);
  });

  it("ignores frames nested in other objects and anything that is not a frame", () => {
    const top = frame({ id: "top" });
    const nested = frame({ id: "nested", parentId: "top" });
    expect(slidesOf([top, nested]).map((s) => s.id)).toEqual(["top"]);
    expect(slidesOf([{ ...top, type: "group" } as unknown as FrameObj])).toEqual([]);
  });

  it("names unnamed frames 'Slide n' by position and carries index, rect and notes", () => {
    const s = slidesOf([frame({ id: "a", order: "a0", name: "Cover", notes: "Hello" }), frame({ id: "b", order: "a1", name: "   " })]);
    expect(s.map((x) => x.name)).toEqual(["Cover", "Slide 2"]);
    expect(s.map((x) => x.index)).toEqual([0, 1]);
    expect(s[0].notes).toBe("Hello");
    expect(s[0].rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it("uses the bounding box of a rotated frame", () => {
    const [s] = slidesOf([frame({ x: 0, y: 0, w: 200, h: 100, rotation: Math.PI / 2 })]);
    expect(s.rect.w).toBeCloseTo(100, 6);
    expect(s.rect.h).toBeCloseTo(200, 6);
    expect(s.rect.x).toBeCloseTo(50, 6);
    expect(s.rect.y).toBeCloseTo(-50, 6);
  });

  it("orderedSlides is the same function under the name the viewer uses", () => {
    expect(orderedSlides).toBe(slidesOf);
  });
});

describe("slideCamera", () => {
  const vp = { w: 1440, h: 900 };
  const centreOnScreen = (cam: ReturnType<typeof slideCamera>, r: { x: number; y: number; w: number; h: number }) =>
    canvasToScreen(cam, { x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it("centres the slide and fits it with 3 % padding of the short side", () => {
    const rect = { x: 100, y: -50, w: 1920, h: 1080 };
    const cam = slideCamera(rect, vp);
    const c = centreOnScreen(cam, rect);
    expect(c.x).toBeCloseTo(720, 6);
    expect(c.y).toBeCloseTo(450, 6);
    const pad = 0.03 * 900;
    expect(cam.z).toBeCloseTo(Math.min((1440 - 2 * pad) / 1920, (900 - 2 * pad) / 1080), 9);
    const tl = canvasToScreen(cam, { x: rect.x, y: rect.y });
    const br = canvasToScreen(cam, { x: rect.x + rect.w, y: rect.y + rect.h });
    expect(tl.x).toBeGreaterThanOrEqual(pad - 1e-6);
    expect(tl.y).toBeGreaterThanOrEqual(pad - 1e-6);
    expect(br.x).toBeLessThanOrEqual(1440 - pad + 1e-6);
    expect(br.y).toBeLessThanOrEqual(900 - pad + 1e-6);
  });

  it("fits tall and wide frames inside the viewport (letterbox on the other axis)", () => {
    for (const rect of [{ x: 0, y: 0, w: 1080, h: 1920 }, { x: 0, y: 0, w: 4000, h: 300 }, { x: 0, y: 0, w: 500, h: 500 }]) {
      const cam = slideCamera(rect, vp);
      const br = canvasToScreen(cam, { x: rect.w, y: rect.h });
      const tl = canvasToScreen(cam, { x: 0, y: 0 });
      expect(br.x - tl.x).toBeLessThanOrEqual(1440 + 1e-6);
      expect(br.y - tl.y).toBeLessThanOrEqual(900 + 1e-6);
    }
  });

  it("takes an explicit padding in screen px", () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(slideCamera(rect, { w: 500, h: 500 }, 50).z).toBeCloseTo(4, 9);
  });

  it("keeps the frame centred on very large coordinates", () => {
    for (const k of [1e6, 1e9, 1e12, -1e12]) {
      const rect = { x: k, y: -k, w: 1920, h: 1080 };
      const cam = slideCamera(rect, vp);
      const c = centreOnScreen(cam, rect);
      expect(Math.abs(c.x - 720)).toBeLessThan(1e-2);
      expect(Math.abs(c.y - 450)).toBeLessThan(1e-2);
      expect(Number.isFinite(cam.x + cam.y + cam.z)).toBe(true);
    }
  });

  it("survives a zero-size viewport and a degenerate rect", () => {
    for (const v of [{ w: 0, h: 0 }, { w: NaN, h: 10 }]) {
      const cam = slideCamera({ x: 0, y: 0, w: 100, h: 100 }, v);
      expect(Number.isFinite(cam.x + cam.y + cam.z)).toBe(true);
    }
    const cam = slideCamera({ x: 5, y: 5, w: 0, h: 0 }, vp);
    expect(Number.isFinite(cam.x + cam.y + cam.z)).toBe(true);
  });

  it("cameraForSlide frames a Slide", () => {
    const [s] = slidesOf([frame({ x: 10, y: 20, w: 300, h: 200 })]);
    expect(cameraForSlide(s, vp)).toEqual(slideCamera(s.rect, vp));
  });
});

describe("clamp, nextIndex and slideIndexOf", () => {
  it("clamp keeps an index inside 0..count-1", () => {
    expect(clamp(-3, 5)).toBe(0);
    expect(clamp(9, 5)).toBe(4);
    expect(clamp(2, 5)).toBe(2);
    expect(clamp(2.7, 5)).toBe(2);
    expect(clamp(NaN, 5)).toBe(0);
    expect(clamp(3, 0)).toBe(0);
  });

  it("nextIndex does not wrap", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(2);
    expect(nextIndex(0, 3, -1)).toBe(0);
    expect(nextIndex(2, 3, -1)).toBe(1);
    expect(nextIndex(0, 0, 1)).toBe(0);
  });

  it("slideIndexOf finds a slide by id, or -1", () => {
    const s = slidesOf([frame({ id: "a", order: "a0" }), frame({ id: "b", order: "a1" })]);
    expect(slideIndexOf(s, "b")).toBe(1);
    expect(slideIndexOf(s, "zz")).toBe(-1);
  });

  it("slideAnnouncement reads 'Slide 2 of 5: name'", () => {
    expect(slideAnnouncement(1, 5, "Direction A")).toBe("Slide 2 of 5: Direction A");
    expect(slideAnnouncement(0, 0, "")).toBe("No slides");
  });
});

describe("slides of a document", () => {
  const make = () => {
    const doc = new BoardDoc();
    doc.createMany([
      spec("a", { name: "A", order: "a0" }),
      spec("b", { name: "B", order: "a1" }),
      spec("c", { name: "C", order: "a2" }),
      spec("n", { name: "Inner", parentId: "a" }),
    ]);
    doc.stopCapturing();
    return doc;
  };

  it("slidesOfDoc reads the frames from the doc", () => {
    expect(slidesOfDoc(make()).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("setSlideOrder rewrites the order and is one undo step", () => {
    const doc = make();
    setSlideOrder(doc, ["c", "a", "b"]);
    expect(slidesOfDoc(doc).map((s) => s.id)).toEqual(["c", "a", "b"]);
    doc.undo();
    expect(slidesOfDoc(doc).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(reorderSlides).toBe(setSlideOrder);
  });

  it("setSlideOrder appends frames it was not told about and ignores unknown or nested ids", () => {
    const doc = make();
    setSlideOrder(doc, ["c", "zzz", "n", "c"]);
    expect(slidesOfDoc(doc).map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("setSlideOrder leaves the z-order of the frames alone", () => {
    const doc = make();
    const before = doc.all().map((o) => [o.id, o.index]);
    setSlideOrder(doc, ["b", "c", "a"]);
    expect(doc.all().map((o) => [o.id, o.index])).toEqual(before);
  });

  it("moveSlide moves one slide earlier or later and stops at the ends", () => {
    const doc = make();
    expect(moveSlide(doc, "b", -1)).toBe(true);
    expect(slidesOfDoc(doc).map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveSlide(doc, "b", -1)).toBe(false);
    expect(moveSlide(doc, "c", 1)).toBe(false);
    expect(moveSlide(doc, "a", 1)).toBe(true);
    expect(slidesOfDoc(doc).map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(moveSlide(doc, "nope", 1)).toBe(false);
  });

  it("repairs duplicate or empty orders when it reorders", () => {
    const doc = new BoardDoc();
    doc.createMany([spec("a", { order: "a0" }), spec("b", { order: "a0" }), spec("c", { order: "" })]);
    setSlideOrder(doc, ["c", "b", "a"]);
    expect(slidesOfDoc(doc).map((s) => s.id)).toEqual(["c", "b", "a"]);
    const orders = ["a", "b", "c"].map((id) => (doc.get(id) as FrameObj).order);
    expect(new Set(orders).size).toBe(3);
  });
});
