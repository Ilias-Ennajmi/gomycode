import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { boardDocSource, buildScene, type Scene, type SceneNode, type SceneSource } from "@/lib/engine/export/scene";
import type { TextMeasurer } from "@/lib/engine/export/text-layout";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { CanvasObject, NewObject } from "@/lib/engine/model/types";

const measure: TextMeasurer = (text, font) => text.length * font.size * 0.5;
const O = { background: "board" as const, padding: 0, measure, frameChrome: false, credits: false };
const ASSET = "11111111-1111-4111-8111-111111111111";
const ASSET2 = "22222222-2222-4222-8222-222222222222";

function add<T extends CanvasObject["type"]>(doc: BoardDoc, type: T, patch: Partial<Extract<CanvasObject, { type: T }>> = {}): string {
  return doc.create({ ...defaultsFor(type), ...patch } as unknown as NewObject);
}
function text(doc: BoardDoc, id: string, s: string): void {
  doc.transact(() => writeRichContent(doc.content(id)!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] }));
}
const kinds = (s: Scene) => s.nodes.map((n) => n.kind);
const ofKind = <K extends SceneNode["kind"]>(s: Scene, k: K) => s.nodes.filter((n): n is Extract<SceneNode, { kind: K }> => n.kind === k);
const allText = (s: Scene) => ofKind(s, "text").flatMap((n) => n.lines.flatMap((l) => l.runs.map((r) => r.text))).join("|");

describe("buildScene: targets", () => {
  it("a frame target is exactly the frame rect with its own background; children outside it are left out", () => {
    const doc = new BoardDoc();
    const f = add(doc, "frame", { x: 100, y: 200, w: 400, h: 300, background: "var(--sticky-mint)", name: "Slide" });
    add(doc, "shape", { x: 150, y: 250, w: 50, h: 40, fill: "var(--sticky-pink)", parentId: f });
    add(doc, "shape", { x: 5000, y: 5000, w: 50, h: 40, fill: "#ff0000", parentId: f });
    add(doc, "shape", { x: 150, y: 250, w: 20, h: 20, fill: "#00ff00" }); // not a child: not part of the frame's slide
    const s = buildScene(boardDocSource(doc), { kind: "frame", id: f }, { ...O, padding: 40 });
    expect(s.width).toBe(400);
    expect(s.height).toBe(300);
    expect(s.origin).toEqual({ x: 100, y: 200 });
    expect(s.background).toBe("#bfe6cf");
    const rects = ofKind(s, "rect");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 50, y: 50, w: 50, h: 40, fill: "#f4b8c5" });
  });

  it("a frame with clip puts the frame rect on its descendants' nodes", () => {
    const doc = new BoardDoc();
    const f = add(doc, "frame", { x: 100, y: 100, w: 400, h: 300, clip: true });
    add(doc, "shape", { x: 450, y: 150, w: 200, h: 100, fill: "#ff0000", parentId: f });
    const free = add(doc, "frame", { x: 1000, y: 100, w: 400, h: 300, clip: false });
    add(doc, "shape", { x: 1300, y: 150, w: 200, h: 100, fill: "#ff0000", parentId: free });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const inClip = s.nodes.find((n) => n.kind === "rect" && n.fill === "#ff0000" && n.x < 500)!;
    expect(inClip.clip).toMatchObject({ x: 0, y: 0, w: 400, h: 300 });
    const unclipped = s.nodes.find((n) => n.kind === "rect" && n.fill === "#ff0000" && n.x > 500)!;
    expect(unclipped.clip).toBeNull();
  });

  it("a board target adds padding and keeps a rotated image's rotation", () => {
    const doc = new BoardDoc();
    add(doc, "image", { assetId: ASSET, x: 100, y: 100, w: 200, h: 100, rotation: Math.PI / 2 });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, { ...O, padding: 24 });
    const img = ofKind(s, "image")[0];
    expect(img.rotation).toBeCloseTo(Math.PI / 2, 9);
    // rotated 90 degrees: the bounds are 100 wide and 200 tall
    expect(s.width).toBeCloseTo(100 + 48, 6);
    expect(s.height).toBeCloseTo(200 + 48, 6);
    expect(s.origin.x).toBeCloseTo(150 - 24, 6);
    expect(s.assetIds).toEqual([ASSET]);
  });

  it("a selection includes the children of a selected group and nothing else", () => {
    const doc = new BoardDoc();
    const g = add(doc, "group");
    const a = add(doc, "shape", { x: 0, y: 0, w: 10, h: 10, fill: "#ff0000", stroke: null, parentId: g });
    const b = add(doc, "shape", { x: 20, y: 0, w: 10, h: 10, fill: "#00ff00", stroke: null, parentId: g });
    add(doc, "shape", { x: 100, y: 0, w: 10, h: 10, fill: "#0000ff", stroke: null });
    void a;
    void b;
    const s = buildScene(boardDocSource(doc), { kind: "selection", ids: [g] }, O);
    expect(ofKind(s, "rect").map((r) => r.fill).sort()).toEqual(["#00ff00", "#ff0000"]);
    expect(s.width).toBe(30);
  });

  it("an empty board gives a finite 1 x 1 scene plus padding", () => {
    const s = buildScene(boardDocSource(new BoardDoc()), { kind: "board" }, { ...O, padding: 10 });
    expect(s.nodes).toEqual([]);
    expect(s.width).toBe(21);
    expect(s.height).toBe(21);
    expect(Number.isFinite(s.origin.x) && Number.isFinite(s.origin.y)).toBe(true);
    const bare = buildScene(boardDocSource(new BoardDoc()), { kind: "board" }, O);
    expect([bare.width, bare.height]).toEqual([1, 1]);
  });

  it("transparent gives no background; board uses the paper colour; a string is resolved", () => {
    const doc = new BoardDoc();
    add(doc, "shape");
    const t = (background: "transparent" | "board" | string) => buildScene(boardDocSource(doc), { kind: "board" }, { ...O, background }).background;
    expect(t("transparent")).toBeNull();
    expect(t("board")).toBe("#f5f2ec");
    expect(t("#ABCDEF")).toBe("#abcdef");
  });
});

describe("buildScene: object types", () => {
  it("draws shapes by kind with resolved colours and dashes", () => {
    const doc = new BoardDoc();
    add(doc, "shape", { kind: "roundRect", x: 0, y: 0, w: 100, h: 50, fill: "var(--sticky-yellow)", stroke: "var(--color-ink)", strokeWidth: 3, strokeStyle: "dashed", cornerRadius: 10 });
    add(doc, "shape", { kind: "ellipse", x: 200, y: 0, w: 80, h: 40, fill: null, stroke: "#112233" });
    add(doc, "shape", { kind: "triangle", x: 300, y: 0, w: 60, h: 60, fill: "#ff0000", stroke: null, strokeWidth: 0 });
    add(doc, "shape", { kind: "star", x: 400, y: 0, w: 60, h: 60, fill: "#ff0000" });
    add(doc, "shape", { kind: "diamond", x: 500, y: 0, w: 60, h: 60, fill: "#ff0000" });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(kinds(s)).toEqual(["rect", "ellipse", "path", "path", "path"]);
    const rect = ofKind(s, "rect")[0];
    expect(rect).toMatchObject({ fill: "#f6e58d", stroke: "#141414", strokeWidth: 3, radius: 10 });
    expect(rect.dash).toEqual([9, 6]);
    expect(ofKind(s, "path")[0].closed).toBe(true);
    expect(JSON.stringify(s)).not.toContain("var(");
  });

  it("lays a sticky's text on a coloured note and keeps rotation about the note's centre", () => {
    const doc = new BoardDoc();
    const id = add(doc, "sticky", { x: 100, y: 100, w: 200, h: 200, fill: "mint", size: "M", rotation: 0.5 });
    text(doc, id, "Hello sticky");
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const rect = ofKind(s, "rect")[0];
    expect(rect.fill).toBe("#bfe6cf");
    expect(rect.rotation).toBeCloseTo(0.5, 9);
    const t = ofKind(s, "text")[0];
    expect(allText(s)).toContain("Hello");
    expect(t.rotation).toBeCloseTo(0.5, 9);
    // pivot is the note's centre
    expect(t.cx).toBeCloseTo(rect.x + rect.w / 2, 6);
    expect(t.cy).toBeCloseTo(rect.y + rect.h / 2, 6);
  });

  it("grows a sticky that holds more text than its box", () => {
    const doc = new BoardDoc();
    const id = add(doc, "sticky", { x: 0, y: 0, w: 100, h: 60, size: "XL" });
    text(doc, id, "word ".repeat(30));
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(ofKind(s, "rect")[0].h).toBeGreaterThan(60);
  });

  it("draws text objects wrapped at their width, or unwrapped when auto-width", () => {
    const doc = new BoardDoc();
    const a = add(doc, "text", { x: 0, y: 0, w: 100, h: 32, fontSize: 20, autoWidth: false, color: "var(--color-muted)" });
    text(doc, a, "alpha beta gamma delta epsilon");
    const b = add(doc, "text", { x: 0, y: 300, w: 100, h: 32, fontSize: 20, autoWidth: true });
    text(doc, b, "alpha beta gamma delta epsilon");
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const [wrapped, free] = ofKind(s, "text");
    expect(wrapped.lines.length).toBeGreaterThan(2);
    expect(free.lines).toHaveLength(1);
    expect(wrapped.color).toBe("#5e5b55");
  });

  it("gives a masked, cropped, flipped and grey image its look", () => {
    const doc = new BoardDoc();
    add(doc, "image", { assetId: ASSET, x: 0, y: 0, w: 200, h: 100, mask: { kind: "circle", radius: 0 }, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, flipX: true, grayscale: true, opacity: 0.5 });
    add(doc, "image", { assetId: ASSET2, x: 300, y: 0, w: 100, h: 100, mask: { kind: "rounded", radius: 500 } });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const [a, b] = ofKind(s, "image");
    expect(a).toMatchObject({ rx: 100, ry: 50, flipX: true, flipY: false, grayscale: true, opacity: 0.5 });
    expect(a.crop).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(b.rx).toBe(50); // rounded radius is clamped to half the short side
    expect(s.assetIds.sort()).toEqual([ASSET, ASSET2]);
  });

  it("draws a video as its poster, never loading the video file", () => {
    const doc = new BoardDoc();
    add(doc, "video", { assetId: ASSET, x: 0, y: 0, w: 320, h: 180 });
    add(doc, "video", { assetId: ASSET, posterAssetId: ASSET2, x: 400, y: 0, w: 320, h: 180 });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const [own, chosen] = ofKind(s, "image");
    expect(own.assetId).toBe(ASSET);
    expect(own.noOriginal).toBe(true);
    expect(chosen.assetId).toBe(ASSET2);
    expect(chosen.noOriginal).toBeFalsy();
  });

  it("draws link and embed objects as cards with text and the domain", () => {
    const doc = new BoardDoc();
    add(doc, "link", { x: 0, y: 0, w: 320, h: 120, url: "https://www.example.com/a/b", title: "A great page", description: "About it", siteName: "", status: "ready" });
    add(doc, "embed", { x: 400, y: 0, w: 480, h: 270, provider: "youtube", url: "https://youtu.be/abc", embedUrl: "https://www.youtube-nocookie.com/embed/abc", title: "Film" });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(ofKind(s, "rect")).toHaveLength(2);
    const txt = allText(s);
    expect(txt).toContain("A");
    expect(txt.replace(/\|/g, "")).toContain("www.example.com");
    expect(txt.replace(/\|/g, "")).toContain("Film");
    expect(txt.replace(/\|/g, "")).toContain("YouTube");
  });

  it("draws swatch, palette and type specimen", () => {
    const doc = new BoardDoc();
    add(doc, "swatch", { x: 0, y: 0, w: 120, h: 120, hex: "#2f4a6d", name: "Ink blue" });
    add(doc, "palette", {
      x: 200, y: 0, w: 480, h: 96, showWeights: true,
      swatches: [
        { hex: "#112233", weight: 0.6, name: "a", locked: false },
        { hex: "#aabbcc", weight: 0.4, name: "b", locked: false },
      ],
    });
    add(doc, "typeSpecimen", { x: 0, y: 300, w: 360, h: 200, family: "Playfair Display", weight: 700, italic: false, sample: "Aa" });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const rects = ofKind(s, "rect");
    expect(rects.find((r) => r.fill === "#2f4a6d")).toBeTruthy();
    expect(rects.find((r) => r.fill === "#112233")).toBeTruthy();
    expect(rects.find((r) => r.fill === "#aabbcc")).toBeTruthy();
    const txt = allText(s).replace(/\|/g, "");
    expect(txt).toContain("Ink blue");
    expect(txt).toContain("#2f4a6d");
    expect(txt).toContain("60%");
    expect(txt).toContain("40%");
    expect(s.fonts).toContainEqual({ family: "Playfair Display", weight: 700, italic: false });
  });

  it("lists each font once", () => {
    const doc = new BoardDoc();
    for (let i = 0; i < 3; i++) {
      const id = add(doc, "text", { x: i * 300, y: 0, w: 280, h: 32 });
      text(doc, id, "same font");
    }
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const regular = s.fonts.filter((f) => f.family === "Inter" && f.weight === 400 && !f.italic);
    expect(regular).toHaveLength(1);
  });

  it("draws strokes as filled outlines, highlighters see-through", () => {
    const doc = new BoardDoc();
    const pts: number[] = [];
    for (let i = 0; i < 20; i++) pts.push(i * 5, Math.sin(i / 3) * 10 + 20, 0.5);
    add(doc, "stroke", { x: 10, y: 10, w: 100, h: 40, points: pts, color: "#ff0000", size: 6 });
    add(doc, "stroke", { x: 10, y: 100, w: 100, h: 40, points: pts, color: "#ffff00", size: 20, tool: "highlighter" });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const [pen, hi] = ofKind(s, "path");
    expect(pen.fill).toBe("#ff0000");
    expect(pen.d.startsWith("M")).toBe(true);
    expect(pen.stroke).toBeNull();
    expect(hi.opacity).toBeCloseTo(0.4, 6);
  });

  it("routes a bound arrow between its shapes, with a head and a label", () => {
    const doc = new BoardDoc();
    const a = add(doc, "shape", { x: 0, y: 0, w: 100, h: 100 });
    const b = add(doc, "shape", { x: 300, y: 0, w: 100, h: 100 });
    add(doc, "arrow", {
      start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } },
      end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } },
      route: "straight", endHead: "triangle", label: "next", x: 100, y: 50, w: 200, h: 1,
    });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const paths = ofKind(s, "path");
    const line = paths[0];
    expect(line.d).toMatch(/^M 100 50 L 300 50$/);
    expect(line.fill).toBeNull();
    expect(paths[1].fill).not.toBeNull(); // the filled head
    expect(allText(s)).toContain("next");
    // unbound arrow
    const doc2 = new BoardDoc();
    add(doc2, "arrow", { start: { kind: "point", x: 10, y: 10 }, end: { kind: "point", x: 110, y: 60 }, x: 10, y: 10, w: 100, h: 50 });
    const s2 = buildScene(boardDocSource(doc2), { kind: "board" }, O);
    const p2 = ofKind(s2, "path")[0];
    expect(p2.d).toBe("M 10 10 L 110 60");
    expect([p2.dx, p2.dy]).toEqual([-s2.origin.x, -s2.origin.y]); // the scene shift moves the canvas path into scene space
    expect(s2.origin.x).toBeLessThan(10);
  });

  it("adds credit captions only under images that have provenance, when asked", () => {
    const doc = new BoardDoc();
    add(doc, "image", { assetId: ASSET, x: 0, y: 0, w: 200, h: 100, provenance: { sourceUrl: null, credit: "Jane Doe", licence: "CC BY 4.0", capturedAt: null } });
    add(doc, "image", { assetId: ASSET2, x: 300, y: 0, w: 200, h: 100 });
    const off = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(allText(off)).toBe("");
    const on = buildScene(boardDocSource(doc), { kind: "board" }, { ...O, credits: true });
    expect(allText(on)).toContain("Jane Doe");
    expect(ofKind(on, "text")).toHaveLength(1);
  });

  it("draws frame names above frames only with frameChrome", () => {
    const doc = new BoardDoc();
    add(doc, "frame", { x: 0, y: 100, w: 400, h: 300, name: "Hero" });
    const plain = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(allText(plain)).toBe("");
    const chrome = buildScene(boardDocSource(doc), { kind: "board" }, { ...O, frameChrome: true });
    expect(allText(chrome)).toContain("Hero");
    // the label sits above the frame and counts towards the bounds
    expect(chrome.height).toBeGreaterThan(300);
  });
});

describe("buildScene: order, determinism, limits", () => {
  it("paints in z-order: siblings by index, a frame's children right after the frame", () => {
    const doc = new BoardDoc();
    const first = add(doc, "shape", { x: 0, y: 0, w: 10, h: 10, fill: "#010101" });
    const f = add(doc, "frame", { x: 50, y: 0, w: 200, h: 200 });
    add(doc, "shape", { x: 60, y: 10, w: 10, h: 10, fill: "#020202", parentId: f });
    add(doc, "shape", { x: 60, y: 30, w: 10, h: 10, fill: "#030303", parentId: f });
    const last = add(doc, "shape", { x: 300, y: 0, w: 10, h: 10, fill: "#040404" });
    void first;
    void last;
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(ofKind(s, "rect").map((r) => r.fill)).toEqual(["#010101", "#ffffff", "#020202", "#030303", "#040404"]);
    // a group's children take the group's place among its siblings
    const doc2 = new BoardDoc();
    add(doc2, "shape", { x: 0, y: 0, w: 10, h: 10, fill: "#010101" });
    const g = add(doc2, "group");
    add(doc2, "shape", { x: 20, y: 0, w: 10, h: 10, fill: "#020202", parentId: g });
    add(doc2, "shape", { x: 40, y: 0, w: 10, h: 10, fill: "#030303" });
    const s2 = buildScene(boardDocSource(doc2), { kind: "board" }, O);
    expect(ofKind(s2, "rect").map((r) => r.fill)).toEqual(["#010101", "#020202", "#030303"]);
  });

  it("is deterministic", () => {
    const doc = new BoardDoc();
    const id = add(doc, "sticky", { x: 10, y: 10 });
    text(doc, id, "stable");
    add(doc, "image", { assetId: ASSET, x: 300, y: 10 });
    const a = buildScene(boardDocSource(doc), { kind: "board" }, O);
    const b = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("builds a 2,000-object board in well under 400 ms", () => {
    const doc = new BoardDoc();
    doc.transact(() => {
      for (let i = 0; i < 2000; i++) {
        const t = i % 3;
        doc.create(
          (t === 0
            ? { ...defaultsFor("shape"), x: (i % 50) * 120, y: Math.floor(i / 50) * 120, w: 100, h: 100, fill: "#ff0000" }
            : t === 1
              ? { ...defaultsFor("image"), assetId: ASSET, x: (i % 50) * 120, y: Math.floor(i / 50) * 120, w: 100, h: 100 }
              : { ...defaultsFor("swatch"), x: (i % 50) * 120, y: Math.floor(i / 50) * 120, w: 100, h: 100, hex: "#123456", name: "n" }) as NewObject,
        );
      }
    });
    const src = boardDocSource(doc);
    const t0 = performance.now();
    const s = buildScene(src, { kind: "board" }, O);
    expect(performance.now() - t0).toBeLessThan(400);
    expect(s.nodes.length).toBeGreaterThanOrEqual(2000);
    expect(s.assetIds).toEqual([ASSET]);
  });

  it("warns about an object type it does not know instead of throwing", () => {
    const base = boardDocSource(new BoardDoc());
    const weird = { id: "x", type: "hologram", x: 0, y: 0, w: 10, h: 10, rotation: 0, parentId: null, index: "a0", locked: false, opacity: 1, createdAt: 0, updatedAt: 0 } as unknown as CanvasObject;
    const src: SceneSource = { ...base, all: () => [weird], get: (id) => (id === "x" ? weird : undefined), childrenOf: () => [weird] };
    const s = buildScene(src, { kind: "board" }, O);
    expect(s.nodes).toEqual([]);
    expect(s.warnings.join(" ")).toMatch(/hologram/);
  });

  it("leaves hidden-by-size objects out", () => {
    const doc = new BoardDoc();
    add(doc, "shape", { x: 0, y: 0, w: 100, h: 100 });
    const zero = add(doc, "shape", { x: 200, y: 0, w: 100, h: 100 });
    doc.update(zero, { opacity: 0 });
    const s = buildScene(boardDocSource(doc), { kind: "board" }, O);
    expect(ofKind(s, "rect")).toHaveLength(1);
  });
});
