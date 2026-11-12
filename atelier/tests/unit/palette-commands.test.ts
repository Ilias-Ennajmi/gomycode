// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastStore } from "@/components/chrome/Toast";
import { getAssetMetaStore } from "@/lib/assets/meta-store";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { registry, type CommandCtx } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { getHighlightStore } from "@/lib/engine/color/highlight";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, PaletteObj, SwatchObj } from "@/lib/engine/model/types";

const A1 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e71";

function setup(objs: NewObject[] = [], ui: Partial<NonNullable<CommandCtx["ui"]>> = {}) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const toasts: string[] = [];
  const ctx: CommandCtx = {
    doc,
    selection,
    canvas: { getCamera: () => ({ x: 0, y: 0, z: 1 }), viewport: () => ({ w: 1000, h: 800 }) } as never,
    setTool: () => {},
    toast: (o) => void toasts.push(o.message),
    clipboardStyle: { current: null },
    ui,
  };
  return { doc, selection, ctx, toasts };
}
const only = <T,>(doc: BoardDoc, type: string) => doc.all().filter((o) => o.type === type) as unknown as T[];

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  delete (window as unknown as { EyeDropper?: unknown }).EyeDropper;
  getHighlightStore().set(null);
  for (const t of [...toastStore.items]) toastStore.dismiss(t.id);
});

describe("insert.palette", () => {
  it("is an insert command that adds a live palette at the middle of the view, selected, as one undo step", () => {
    const { doc, selection, ctx } = setup();
    expect(registry.get("insert.palette").group).toBe("insert");
    expect(registry.run("insert.palette", ctx)).toBe(true);
    const [p] = only<PaletteObj>(doc, "palette");
    expect(p.live).toBe(true);
    expect(p.x + p.w / 2).toBeCloseTo(500);
    expect(p.y + p.h / 2).toBeCloseTo(400);
    expect([...selection.ids]).toEqual([p.id]);
    doc.undo();
    expect(only(doc, "palette")).toHaveLength(0);
  });
});

describe("insert.swatch", () => {
  it("adds a colour card; it takes the highlighted colour when there is one", () => {
    const { doc, ctx } = setup();
    registry.run("insert.swatch", ctx);
    expect(only<SwatchObj>(doc, "swatch")[0].hex).toBe("#808080");
    getHighlightStore().set("#dc1e28");
    registry.run("insert.swatch", ctx);
    expect(only<SwatchObj>(doc, "swatch")[1].hex).toBe("#dc1e28");
  });
});

describe("swatch.pick", () => {
  it("is unavailable without the EyeDropper API and adds a swatch with the picked colour when present", async () => {
    const t = setup();
    expect(registry.available("swatch.pick", t.ctx)).toBe(false);
    (window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#12AB34" });
      }
    };
    expect(registry.available("swatch.pick", t.ctx)).toBe(true);
    registry.run("swatch.pick", t.ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect(only<SwatchObj>(t.doc, "swatch")[0].hex).toBe("#12ab34");
  });

  it("a cancelled pick adds nothing", async () => {
    (window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        return Promise.reject(new DOMException("cancelled", "AbortError"));
      }
    };
    const t = setup();
    registry.run("swatch.pick", t.ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect(only(t.doc, "swatch")).toHaveLength(0);
  });
});

describe("palette.toggleLive", () => {
  it("flips live on the selected palettes (one undo step) and is unavailable otherwise", () => {
    const t = setup([{ ...defaultsFor("palette"), id: "p", live: true } as NewObject]);
    expect(registry.available("palette.toggleLive", t.ctx)).toBe(false);
    t.selection.set(["p"]);
    expect(registry.run("palette.toggleLive", t.ctx)).toBe(true);
    expect((t.doc.get("p") as PaletteObj).live).toBe(false);
    t.doc.undo();
    expect((t.doc.get("p") as PaletteObj).live).toBe(true);
  });
});

describe("palette.clearHighlight", () => {
  it("is available only while a colour is highlighted", () => {
    const t = setup();
    expect(registry.available("palette.clearHighlight", t.ctx)).toBe(false);
    getHighlightStore().set("#dc1e28");
    expect(registry.run("palette.clearHighlight", t.ctx)).toBe(true);
    expect(getHighlightStore().hex).toBeNull();
  });
});

describe("swatch.copy and swatch.cycleFormat", () => {
  it("copies the selected swatch in its format", async () => {
    const t = setup([{ ...defaultsFor("swatch"), id: "s", hex: "#2f4a6d", format: "rgb" } as NewObject]);
    expect(registry.available("swatch.copy", t.ctx)).toBe(false);
    t.selection.set(["s"]);
    registry.run("swatch.copy", t.ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith("rgb(47 74 109)");
  });

  it("cycles hex -> rgb -> hsl -> oklch -> hex as undo steps", () => {
    const t = setup([{ ...defaultsFor("swatch"), id: "s", hex: "#2f4a6d" } as NewObject]);
    t.selection.set(["s"]);
    const fmt = () => (t.doc.get("s") as SwatchObj).format;
    const seen = [fmt()];
    for (let i = 0; i < 4; i++) {
      registry.run("swatch.cycleFormat", t.ctx);
      seen.push(fmt());
    }
    expect(seen).toEqual(["hex", "rgb", "hsl", "oklch", "hex"]);
    t.doc.undo();
    expect(fmt()).toBe("oklch");
  });
});

describe("palette.fromSelection", () => {
  it("makes a static palette from the colours of the selected images", () => {
    const meta = getAssetMetaStore();
    meta.put({ id: A1, kind: "image", width: 10, height: 10, bytes: 1, variants: ["w1024"], palette: [{ hex: "#dc1e28", weight: 0.6 }, { hex: "#1e50dc", weight: 0.4 }], phash: null, title: "", provenance: null, analysisVersion: 1 });
    const t = setup([{ ...defaultsFor("image"), id: "i", assetId: A1, w: 100, h: 100 } as NewObject]);
    expect(registry.available("palette.fromSelection", t.ctx)).toBe(false);
    t.selection.set(["i"]);
    expect(registry.run("palette.fromSelection", t.ctx)).toBe(true);
    const [p] = only<PaletteObj>(t.doc, "palette");
    expect(p.live).toBe(false);
    expect(p.swatches.map((s) => s.hex)).toEqual(["#dc1e28", "#1e50dc"]);
    expect([...t.selection.ids]).toEqual([p.id]);
  });
});

describe("view.palettePanel", () => {
  it("toggles the Palette panel through the UI hook", () => {
    const togglePanel = vi.fn();
    const t = setup([], { togglePanel });
    registry.run("view.palettePanel", t.ctx);
    expect(togglePanel).toHaveBeenCalledWith("palette");
  });
});
