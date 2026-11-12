import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { validateObject } from "@/lib/engine/model/validate";
import { TEMPLATE_IDS, TEMPLATES, firstFrameName, getTemplate } from "@/lib/engine/model/templates";
import type { ArrowObj, CanvasObject, FrameObj, ShapeObj, StickyObj, TextObj } from "@/lib/engine/model/types";

function built(id: string) {
  const doc = new BoardDoc();
  getTemplate(id)!.build(doc);
  return doc;
}

const ofType = <T extends CanvasObject>(doc: BoardDoc, type: T["type"]) =>
  doc.all().filter((o): o is T => o.type === type);

function plain(doc: BoardDoc, id: string): string {
  return (doc.content(id)?.toString() ?? "").replace(/<[^>]+>/g, "");
}

describe("TEMPLATES", () => {
  it("lists the six templates in order", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["blank", "moodboard", "deck", "brainstorm", "flowchart", "kanban"]);
    expect([...TEMPLATE_IDS]).toEqual(TEMPLATES.map((t) => t.id));
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("getTemplate finds by id and rejects unknown ids", () => {
    expect(getTemplate("deck")?.name).toBe("Presentation deck");
    expect(getTemplate("nope")).toBeUndefined();
  });

  describe.each(TEMPLATES.map((t) => t.id))("%s", (id) => {
    it("builds only valid objects (nothing is skipped on read)", () => {
      const doc = built(id);
      const raw = doc.ydoc.getMap("objects").size;
      const all = doc.all();
      expect(all.length).toBe(raw);
      for (const o of all) {
        expect(validateObject(o), `${o.type} ${o.id}`).not.toBeNull();
        for (const n of [o.x, o.y, o.w, o.h]) expect(Number.isFinite(n)).toBe(true);
      }
    });

    it("parents only point at frames that exist and contain the child", () => {
      const doc = built(id);
      for (const o of doc.all()) {
        if (!o.parentId) continue;
        const p = doc.get(o.parentId);
        expect(p?.type).toBe("frame");
        expect(o.x).toBeGreaterThanOrEqual(p!.x);
        expect(o.y).toBeGreaterThanOrEqual(p!.y);
        expect(o.x + o.w).toBeLessThanOrEqual(p!.x + p!.w);
        expect(o.y + o.h).toBeLessThanOrEqual(p!.y + p!.h);
      }
    });

    it("binds every bound arrow terminal to an existing non-arrow object", () => {
      const doc = built(id);
      for (const a of ofType<ArrowObj>(doc, "arrow")) {
        for (const t of [a.start, a.end]) {
          if (t.kind !== "bound") continue;
          const target = doc.get(t.id);
          expect(target, `arrow ${a.id} -> ${t.id}`).toBeDefined();
          expect(target!.type).not.toBe("arrow");
        }
      }
    });

    it("can be built into a document that already has content, and is one undo step", () => {
      const doc = new BoardDoc();
      doc.create({ type: "text", x: 0, y: 0, w: 100, h: 30, rotation: 0, parentId: null, locked: false, opacity: 1, fontSize: 24, align: "left", lineHeight: 1.3, color: "var(--color-ink)", autoWidth: true });
      const before = doc.all().length;
      doc.stopCapturing();
      getTemplate(id)!.build(doc);
      const after = doc.all().length;
      if (id === "blank") expect(after).toBe(before);
      else {
        expect(after).toBeGreaterThan(before);
        doc.undo();
        expect(doc.all().length).toBe(before);
      }
    });
  });

  it("blank adds nothing", () => {
    expect(built("blank").all()).toEqual([]);
  });

  it("moodboard: two 1920x1080 frames with a title and six dashed image placeholders each", () => {
    const doc = built("moodboard");
    const frames = ofType<FrameObj>(doc, "frame");
    expect(frames.map((f) => f.name)).toEqual(["Direction A", "Direction B"]);
    for (const f of frames) {
      expect([f.w, f.h]).toEqual([1920, 1080]);
      expect(f.preset).toBe("slide-16-9");
      const kids = doc.childrenOf(f.id);
      const placeholders = kids.filter((k): k is ShapeObj => k.type === "shape");
      expect(placeholders).toHaveLength(6);
      for (const p of placeholders) {
        expect(p.strokeStyle).toBe("dashed");
        expect(p.fill).toBeNull();
      }
      const titles = kids.filter((k): k is TextObj => k.type === "text");
      expect(titles).toHaveLength(1);
      expect(plain(doc, titles[0].id)).toContain(f.name);
    }
    expect(frames[0].x + frames[0].w).toBeLessThan(frames[1].x); // side by side, not overlapping
  });

  it("deck: five ordered 16:9 frames", () => {
    const doc = built("deck");
    const frames = ofType<FrameObj>(doc, "frame");
    expect(frames).toHaveLength(5);
    for (const f of frames) expect([f.w, f.h, f.preset]).toEqual([1920, 1080, "slide-16-9"]);
    const byOrder = [...frames].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    expect(byOrder.map((f) => f.name)).toEqual(["Slide 1", "Slide 2", "Slide 3", "Slide 4", "Slide 5"]);
    expect(new Set(frames.map((f) => f.order)).size).toBe(5);
  });

  it("brainstorm: a central text and eight stickies around it", () => {
    const doc = built("brainstorm");
    const texts = ofType<TextObj>(doc, "text");
    const stickies = ofType<StickyObj>(doc, "sticky");
    expect(texts).toHaveLength(1);
    expect(stickies).toHaveLength(8);
    const c = { x: texts[0].x + texts[0].w / 2, y: texts[0].y + texts[0].h / 2 };
    for (const s of stickies) {
      const d = Math.hypot(s.x + s.w / 2 - c.x, s.y + s.h / 2 - c.y);
      expect(d).toBeGreaterThan(250);
    }
    expect(new Set(stickies.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`)).size).toBe(8);
  });

  it("flowchart: start, process, decision and end shapes joined by bound arrows", () => {
    const doc = built("flowchart");
    const shapes = ofType<ShapeObj>(doc, "shape");
    const kinds = shapes.map((s) => s.kind);
    expect(kinds).toContain("diamond");
    expect(kinds).toContain("rect");
    expect(shapes.length).toBeGreaterThanOrEqual(4);
    const labels = shapes.map((s) => plain(doc, s.id));
    expect(labels).toEqual(expect.arrayContaining(["Start", "End"]));
    const arrows = ofType<ArrowObj>(doc, "arrow");
    expect(arrows.length).toBeGreaterThanOrEqual(3);
    for (const a of arrows) {
      expect(a.start.kind).toBe("bound");
      expect(a.end.kind).toBe("bound");
      expect(a.endHead).toBe("arrow");
    }
  });

  it("kanban: three frames named To do / Doing / Done holding stickies", () => {
    const doc = built("kanban");
    const frames = ofType<FrameObj>(doc, "frame");
    expect(frames.map((f) => f.name)).toEqual(["To do", "Doing", "Done"]);
    for (const f of frames) expect(doc.childrenOf(f.id).length).toBeGreaterThan(0);
    expect(ofType<StickyObj>(doc, "sticky").length).toBeGreaterThanOrEqual(5);
  });

  it("the written text round-trips through a Yjs update (what sync will push)", () => {
    const doc = built("brainstorm");
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc.ydoc));
    const again = new BoardDoc(copy);
    expect(again.all()).toHaveLength(doc.all().length);
    const t = again.all().find((o) => o.type === "text")!;
    expect(plain(again, t.id).length).toBeGreaterThan(0);
  });

  it("firstFrameName is the frame first in presentation order, else null", () => {
    expect(firstFrameName(built("deck"))).toBe("Slide 1");
    expect(firstFrameName(built("kanban"))).toBe("To do");
    expect(firstFrameName(built("blank"))).toBeNull();
    expect(firstFrameName(built("brainstorm"))).toBeNull();
  });
});
