import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BoardDoc, DERIVED_ORIGIN, LOCAL_ORIGIN } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { validateObject } from "@/lib/engine/model/validate";
import { OBJECT_TYPES, type CanvasObject, type ImageObj, type NewObject, type ObjectType } from "@/lib/engine/model/types";
import { OBJECT_VIEWS } from "@/components/canvas/ObjectLayer";

const NEW_TYPES = ["video", "link", "embed", "swatch", "palette", "typeSpecimen"] as const;

function full(type: ObjectType, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...defaultsFor(type), id: "obj1", index: "a0", createdAt: 1, updatedAt: 2, ...over };
}

describe("model v2: new object types", () => {
  it.each(NEW_TYPES)("defaults for %s validate to a typed object", (type) => {
    const o = validateObject(full(type));
    expect(o).not.toBeNull();
    expect(o!.type).toBe(type);
  });

  it("OBJECT_TYPES lists every type exactly once", () => {
    expect(new Set(OBJECT_TYPES).size).toBe(OBJECT_TYPES.length);
    for (const t of NEW_TYPES) expect(OBJECT_TYPES).toContain(t);
  });

  it("a Phase 1 image (no mask, grayscale, title, provenance) gains the v2 defaults", () => {
    const v1 = {
      id: "i",
      type: "image",
      x: 0,
      y: 0,
      w: 100,
      h: 80,
      rotation: 0,
      parentId: null,
      index: "a0",
      locked: false,
      opacity: 1,
      createdAt: 1,
      updatedAt: 1,
      assetId: "abc",
      crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      flipX: false,
      flipY: true,
    };
    const o = validateObject(v1) as ImageObj;
    expect(o.mask).toEqual({ kind: "rect", radius: 0 });
    expect(o.grayscale).toBe(false);
    expect(o.title).toBe("");
    expect(o.provenance).toBeNull();
    expect(o.crop).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
    expect(o.flipY).toBe(true);
  });

  it("a pixel-valued image crop (any value > 1) reads as null", () => {
    const o = validateObject(full("image", { crop: { x: 10, y: 20, w: 300, h: 200 } })) as ImageObj;
    expect(o.crop).toBeNull();
    const out = validateObject(full("image", { crop: { x: 0.5, y: 0, w: 0.9, h: 1 } })) as ImageObj;
    expect(out.crop).toBeNull(); // x + w > 1
  });

  it("image extras are sanitised", () => {
    const o = validateObject(
      full("image", {
        mask: { kind: "hexagon", radius: -5 },
        grayscale: "yes",
        title: 5,
        provenance: { sourceUrl: "javascript:alert(1)", credit: "Jo", licence: "CC-BY", capturedAt: "2026-01-02" },
      }),
    ) as ImageObj;
    expect(o.mask).toEqual({ kind: "rect", radius: 0 });
    expect(o.grayscale).toBe(false);
    expect(o.title).toBe("");
    expect(o.provenance).toEqual({ sourceUrl: null, credit: "Jo", licence: "CC-BY", capturedAt: "2026-01-02" });
    const ok = validateObject(
      full("image", { provenance: { sourceUrl: "https://example.com/a.jpg", credit: "", licence: "", capturedAt: null } }),
    ) as ImageObj;
    expect(ok.provenance?.sourceUrl).toBe("https://example.com/a.jpg");
    expect((validateObject(full("image", { provenance: "x" })) as ImageObj).provenance).toBeNull();
    // A link with a username or password, or an oversized one, is not kept.
    for (const bad of ["https://user:pw@example.com/a.jpg", "https://user@example.com/a.jpg", `https://example.com/${"a".repeat(2100)}`]) {
      const o = validateObject(full("image", { provenance: { sourceUrl: bad, credit: "Jo", licence: "", capturedAt: null } })) as ImageObj;
      expect(o.provenance?.sourceUrl, bad.slice(0, 40)).toBeNull();
      expect(o.provenance?.credit).toBe("Jo");
    }
  });

  it("palette: maxColors is clamped to 3..12 instead of rejecting", () => {
    expect((validateObject(full("palette", { maxColors: 50 })) as CanvasObject & { maxColors: number }).maxColors).toBe(12);
    expect((validateObject(full("palette", { maxColors: 1 })) as CanvasObject & { maxColors: number }).maxColors).toBe(3);
    expect((validateObject(full("palette", { maxColors: "x" })) as CanvasObject & { maxColors: number }).maxColors).toBe(8);
  });

  it("palette: invalid swatches are dropped, hex normalised, weights clamped", () => {
    const o = validateObject(
      full("palette", {
        swatches: [
          { hex: "#ABC", weight: 2, name: "Sand", locked: true },
          { hex: "red", weight: 0.5, name: "bad", locked: false },
          { hex: "#112233", weight: -1, name: 3, locked: "no" },
          "junk",
        ],
      }),
    ) as CanvasObject & { swatches: unknown[] };
    expect(o.swatches).toEqual([
      { hex: "#aabbcc", weight: 1, name: "Sand", locked: true },
      { hex: "#112233", weight: 0, name: "", locked: false },
    ]);
  });

  it("swatch: hex must be a colour (and is normalised)", () => {
    expect(validateObject(full("swatch", { hex: "red" }))).toBeNull();
    expect(validateObject(full("swatch", { hex: "#12345" }))).toBeNull();
    expect((validateObject(full("swatch", { hex: "#2F4A6D" })) as CanvasObject & { hex: string }).hex).toBe("#2f4a6d");
    expect((validateObject(full("swatch", { format: "cmyk" })) as CanvasObject & { format: string }).format).toBe("hex");
  });

  it("embed: embedUrl must be https; provider must be known", () => {
    const base = { provider: "youtube", url: "https://youtu.be/abc", embedUrl: "https://www.youtube-nocookie.com/embed/abc" };
    expect(validateObject(full("embed", base))).not.toBeNull();
    expect(validateObject(full("embed", { ...base, embedUrl: "http://www.youtube-nocookie.com/embed/abc" }))).toBeNull();
    expect(validateObject(full("embed", { ...base, embedUrl: "javascript:alert(1)" }))).toBeNull();
    expect(validateObject(full("embed", { ...base, embedUrl: "data:text/html,<script>1</script>" }))).toBeNull();
    expect(validateObject(full("embed", { ...base, provider: "evil" }))).toBeNull();
    expect(validateObject(full("embed", { ...base, url: "javascript:alert(1)" }))).toBeNull();
  });

  it("link: only http(s) urls", () => {
    expect(validateObject(full("link", { url: "javascript:alert(1)" }))).toBeNull();
    expect(validateObject(full("link", { url: "data:text/html,x" }))).toBeNull();
    expect(validateObject(full("link", { url: "file:///etc/passwd" }))).toBeNull();
    expect(validateObject(full("link", { url: "not a url" }))).toBeNull();
    expect(validateObject(full("link", { url: "" }))).toBeNull();
    expect(validateObject(full("link", { url: "https://example.com/a?b=1" }))).not.toBeNull();
    expect(validateObject(full("link", { url: "http://example.com" }))).not.toBeNull();
    const o = validateObject(full("link", { url: "https://example.com", status: "weird", imageAssetId: 5 })) as CanvasObject & {
      status: string;
      imageAssetId: string | null;
    };
    expect(o.status).toBe("loading");
    expect(o.imageAssetId).toBeNull();
  });

  it("link: hostile text stays text (stored verbatim, capped)", () => {
    const o = validateObject(
      full("link", { url: "https://example.com", title: "<script>alert(1)</script>", description: "x".repeat(1_000_000) }),
    ) as CanvasObject & { title: string; description: string };
    expect(o.title).toBe("<script>alert(1)</script>");
    expect(o.description.length).toBeLessThanOrEqual(2000);
  });

  it("video: non-boolean flags are defaulted, not rejected", () => {
    const o = validateObject(full("video", { loop: "yes", muted: 1, kind: "mkv", posterTime: -3, posterAssetId: 9 })) as CanvasObject & {
      loop: boolean;
      muted: boolean;
      kind: string;
      posterTime: number;
      posterAssetId: string | null;
    };
    expect(o.loop).toBe(true);
    expect(o.muted).toBe(true);
    expect(o.kind).toBe("video");
    expect(o.posterTime).toBe(0);
    expect(o.posterAssetId).toBeNull();
  });

  it("typeSpecimen: weight and size are clamped, strings capped, sourceUrl only http(s) or empty", () => {
    const o = validateObject(
      full("typeSpecimen", { weight: 5000, size: -4, sample: "s".repeat(900), sourceUrl: "javascript:alert(1)" }),
    ) as CanvasObject & { weight: number; size: number; sample: string; sourceUrl: string };
    expect(o.weight).toBe(900);
    expect(o.size).toBeGreaterThan(0);
    expect(o.sample.length).toBeLessThanOrEqual(500);
    expect(o.sourceUrl).toBe("");
  });

  it("new objects survive create / update through BoardDoc", () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("swatch"), hex: "#336699", name: "Ink" } as NewObject);
    expect(doc.get(id)).toMatchObject({ type: "swatch", hex: "#336699", name: "Ink" });
    doc.update(id, { hex: "nonsense" } as Partial<CanvasObject>); // invalid -> ignored
    expect((doc.get(id) as CanvasObject & { hex: string }).hex).toBe("#336699");
    doc.update(id, { hex: "#ABCDEF" } as Partial<CanvasObject>);
    expect((doc.get(id) as CanvasObject & { hex: string }).hex).toBe("#abcdef");
  });
});

describe("BoardDoc meta accessors and transactAs", () => {
  it("showCredits, valueCheck and gutter have defaults and sync between replicas", () => {
    const d = new BoardDoc();
    expect(d.meta.showCredits).toBe(false);
    expect(d.meta.valueCheck).toBe(false);
    expect(d.meta.gutter).toBe(16);
    d.meta.showCredits = true;
    d.meta.valueCheck = true;
    d.meta.gutter = 24;
    const d2 = new BoardDoc();
    Y.applyUpdate(d2.ydoc, Y.encodeStateAsUpdate(d.ydoc));
    expect(d2.meta.showCredits).toBe(true);
    expect(d2.meta.valueCheck).toBe(true);
    expect(d2.meta.gutter).toBe(24);
  });

  it("gutter is clamped to 0..200, and garbage reads as the default", () => {
    const d = new BoardDoc();
    d.meta.gutter = 9999;
    expect(d.meta.gutter).toBe(200);
    d.meta.gutter = -5;
    expect(d.meta.gutter).toBe(0);
    d.meta.gutter = Number.NaN;
    expect(d.meta.gutter).toBe(16);
    d.ydoc.getMap("meta").set("gutter", "wide");
    expect(d.meta.gutter).toBe(16);
    d.ydoc.getMap("meta").set("gutter", 5000);
    expect(d.meta.gutter).toBe(200);
  });

  it("onMetaChange reports the changed keys", () => {
    const d = new BoardDoc();
    const seen: string[][] = [];
    const off = d.onMetaChange((keys) => seen.push([...keys]));
    d.meta.valueCheck = true;
    d.meta.gutter = 20;
    off();
    d.meta.gutter = 30;
    expect(seen).toEqual([["valueCheck"], ["gutter"]]);
  });

  it("transactAs(DERIVED_ORIGIN) writes are not undone by undo()", () => {
    const d = new BoardDoc();
    const a = d.create({ ...defaultsFor("sticky"), x: 0 } as NewObject);
    d.stopCapturing();
    d.transactAs(DERIVED_ORIGIN, () => d.update(a, { x: 500 }));
    expect(d.get(a)!.x).toBe(500);
    expect(d.canUndo()).toBe(true); // the create is still there
    d.undo(); // undoes the create, not the derived write
    expect(d.get(a)).toBeUndefined();
    d.redo();
    expect(d.get(a)!.x).toBe(500);
  });

  it("a DERIVED_ORIGIN write alone leaves nothing to undo", () => {
    const d = new BoardDoc();
    const a = d.create({ ...defaultsFor("sticky") } as NewObject);
    d.undoManager.clear();
    d.transactAs(DERIVED_ORIGIN, () => d.update(a, { x: 77 }));
    expect(d.canUndo()).toBe(false);
  });

  it("transactAs(LOCAL_ORIGIN) is undoable like transact", () => {
    const d = new BoardDoc();
    const a = d.create({ ...defaultsFor("sticky") } as NewObject);
    d.undoManager.clear();
    d.transactAs(LOCAL_ORIGIN, () => d.update(a, { x: 9 }));
    expect(d.canUndo()).toBe(true);
    d.undo();
    expect(d.get(a)!.x).toBe(0);
  });

  it("change listeners still hear derived writes, with their origin", () => {
    const d = new BoardDoc();
    const a = d.create({ ...defaultsFor("sticky") } as NewObject);
    const origins: unknown[] = [];
    d.onChange((_ids, origin) => origins.push(origin));
    d.transactAs(DERIVED_ORIGIN, () => d.update(a, { x: 5 }));
    expect(origins).toEqual([DERIVED_ORIGIN]);
    expect(d.get(a)!.x).toBe(5);
  });
});

describe("OBJECT_VIEWS", () => {
  it("has a view for every object type", () => {
    for (const t of OBJECT_TYPES) expect(OBJECT_VIEWS[t], t).toBeTypeOf("function");
    expect(Object.keys(OBJECT_VIEWS).sort()).toEqual([...OBJECT_TYPES].sort());
  });
});
