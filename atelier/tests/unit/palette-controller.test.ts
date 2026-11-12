import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { PaletteController } from "@/lib/engine/color/palette-controller";
import { DERIVED_ORIGIN, BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { PaletteColor, PaletteObj } from "@/lib/engine/model/types";

const A1 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e61";
const A2 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e62";
const RED: PaletteColor[] = [{ hex: "#dc1e28", weight: 1 }];
const BLUE: PaletteColor[] = [{ hex: "#1e50dc", weight: 1 }];

const meta = (id: string, palette: PaletteColor[] | null): AssetMeta => ({
  id,
  kind: "image",
  width: 100,
  height: 100,
  bytes: 1,
  variants: ["w1024"],
  palette,
  phash: null,
  title: "",
  provenance: null,
  analysisVersion: palette ? 1 : 0,
});

function setup(over: Record<string, unknown> = {}) {
  const doc = new BoardDoc();
  const store = new AssetMetaStore({ persist: false });
  const palette = doc.create({ ...defaultsFor("palette"), live: true, ...over } as never);
  doc.stopCapturing();
  const updates: unknown[] = [];
  doc.ydoc.on("update", (_u: Uint8Array, origin: unknown) => updates.push(origin));
  const controller = new PaletteController({ doc, meta: store, debounceMs: 20 });
  const image = (assetId: string, extra: Record<string, unknown> = {}) => {
    const id = doc.create({ ...defaultsFor("image"), assetId, w: 100, h: 100, ...extra } as never);
    doc.stopCapturing();
    return id;
  };
  const swatches = () => (doc.get(palette) as PaletteObj).swatches;
  return { doc, store, palette, controller, updates, image, swatches };
}

afterEach(() => vi.useRealTimers());

describe("PaletteController", () => {
  it("derives the swatches from the images' palettes", () => {
    const t = setup();
    t.store.put(meta(A1, RED));
    t.store.put(meta(A2, BLUE));
    t.image(A1);
    t.image(A2);
    t.controller.recompute();
    expect(t.swatches().map((s) => s.hex).sort()).toEqual(["#1e50dc", "#dc1e28"]);
    expect(t.swatches().every((s) => Math.abs(s.weight - 0.5) < 1e-6)).toBe(true);
  });

  it("a second recompute with unchanged inputs writes nothing", () => {
    const t = setup();
    t.store.put(meta(A1, RED));
    t.image(A1);
    t.controller.recompute();
    t.updates.length = 0;
    t.controller.recompute();
    t.controller.recompute();
    expect(t.updates).toHaveLength(0);
  });

  it("a change writes exactly one update, tagged DERIVED_ORIGIN, and undo does not revert it", () => {
    const t = setup();
    t.store.put(meta(A1, RED));
    const imageId = t.image(A1);
    t.updates.length = 0;
    const undoDepth = t.doc.undoManager.undoStack.length;
    t.controller.recompute();
    expect(t.updates).toEqual([DERIVED_ORIGIN]);
    expect(t.doc.undoManager.undoStack).toHaveLength(undoDepth); // no undo step added
    expect(t.swatches()).toHaveLength(1);
    t.doc.undo(); // undoes the image, the last real edit
    expect(t.doc.get(imageId)).toBeUndefined();
    expect(t.swatches()).toHaveLength(1); // the derived write is not part of any undo step
  });

  it("writes every live palette in one transaction", () => {
    const t = setup();
    const second = t.doc.create({ ...defaultsFor("palette"), live: true } as never);
    t.store.put(meta(A1, RED));
    t.image(A1);
    t.updates.length = 0;
    t.controller.recompute();
    expect(t.updates).toHaveLength(1);
    expect((t.doc.get(second) as PaletteObj).swatches).toHaveLength(1);
  });

  it("a board with no images keeps an empty palette and writes nothing", () => {
    const t = setup();
    t.updates.length = 0;
    t.controller.recompute();
    expect(t.swatches()).toEqual([]);
    expect(t.updates).toHaveLength(0);
  });

  it("images whose colours are not known yet are skipped, then picked up when they arrive", () => {
    const t = setup();
    t.image(A1);
    t.controller.recompute();
    expect(t.swatches()).toEqual([]);
    t.store.put(meta(A1, RED));
    t.controller.recompute();
    expect(t.swatches()).toHaveLength(1);
  });

  it("a live:false palette is never touched", () => {
    const t = setup({ live: false, swatches: [{ hex: "#123456", weight: 1, name: "Mine", locked: false }] });
    t.store.put(meta(A1, RED));
    t.image(A1);
    t.updates.length = 0;
    t.controller.recompute();
    expect(t.updates).toHaveLength(0);
    expect(t.swatches()).toEqual([{ hex: "#123456", weight: 1, name: "Mine", locked: false }]);
  });

  it("locked and renamed swatches survive re-derivation", () => {
    const t = setup({
      swatches: [
        { hex: "#ff0000", weight: 0, name: "Signal", locked: true },
        { hex: "#00aa00", weight: 0, name: "Moss", locked: false },
      ],
    });
    t.store.put(meta(A1, BLUE));
    t.image(A1);
    t.controller.recompute();
    const s = t.swatches();
    expect(s.find((x) => x.name === "Signal")).toMatchObject({ hex: "#ff0000", locked: true, weight: 0 });
    expect(s.find((x) => x.name === "Moss")).toMatchObject({ hex: "#00aa00", weight: 0 });
    expect(s.find((x) => x.hex === "#1e50dc")).toBeTruthy();
  });

  it("respects maxColors", () => {
    const t = setup({ maxColors: 3 });
    const hexes = ["#dc1e28", "#1e50dc", "#1edc50", "#dcc81e", "#dc1ec8", "#1edcd2"];
    hexes.forEach((hex, i) => {
      const id = `6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4f${String(i).padStart(2, "0")}`;
      t.store.put(meta(id, [{ hex, weight: 1 }]));
      t.image(id);
    });
    t.controller.recompute();
    expect(t.swatches()).toHaveLength(3);
  });

  it("a palette inside a frame summarises only that frame's images", () => {
    const t = setup();
    const frame = t.doc.create({ ...defaultsFor("frame") } as never);
    const inside = t.doc.create({ ...defaultsFor("palette"), live: true, parentId: frame } as never);
    t.store.put(meta(A1, RED));
    t.store.put(meta(A2, BLUE));
    t.image(A1, { parentId: frame });
    t.image(A2);
    t.controller.recompute();
    expect((t.doc.get(inside) as PaletteObj).swatches.map((s) => s.hex)).toEqual(["#dc1e28"]);
    expect(t.swatches()).toHaveLength(2);
  });

  describe("scheduling", () => {
    it("recomputes once after a burst of changes (debounced) and picks up metadata arrivals", () => {
      vi.useFakeTimers();
      const t = setup();
      t.controller.start();
      vi.advanceTimersByTime(100);
      const base = t.controller.recomputes;
      t.store.put(meta(A1, RED));
      t.image(A1);
      t.image(A1);
      t.image(A1);
      expect(t.controller.recomputes).toBe(base);
      vi.advanceTimersByTime(100);
      expect(t.controller.recomputes).toBe(base + 1);
      expect(t.swatches()).toHaveLength(1);
      t.controller.stop();
    });

    it("never loops on its own write", () => {
      vi.useFakeTimers();
      const t = setup();
      t.store.put(meta(A1, RED));
      t.image(A1);
      t.controller.start();
      vi.advanceTimersByTime(1000);
      const after = t.controller.recomputes;
      const writes = t.updates.length;
      vi.advanceTimersByTime(10_000);
      expect(t.controller.recomputes).toBe(after);
      expect(t.updates).toHaveLength(writes);
      t.controller.stop();
    });

    it("two assets alternating their palettes 20 times cause at most 20 recomputes and a quiet end", () => {
      vi.useFakeTimers();
      const t = setup();
      t.image(A1);
      t.image(A2);
      t.controller.start();
      vi.advanceTimersByTime(100);
      const base = t.controller.recomputes;
      for (let i = 0; i < 20; i++) {
        t.store.put(meta(i % 2 ? A1 : A2, i % 2 ? RED : BLUE));
        t.store.put(meta(i % 2 ? A2 : A1, i % 2 ? BLUE : RED));
        vi.advanceTimersByTime(7);
      }
      vi.advanceTimersByTime(10_000);
      expect(t.controller.recomputes - base).toBeLessThanOrEqual(20);
      const settled = t.controller.recomputes;
      const writes = t.updates.length;
      vi.advanceTimersByTime(10_000);
      expect(t.controller.recomputes).toBe(settled);
      expect(t.updates).toHaveLength(writes);
      t.controller.stop();
    });

    it("an undo of a user edit to the palette is re-derived, once", () => {
      vi.useFakeTimers();
      const t = setup();
      t.store.put(meta(A1, RED));
      t.image(A1);
      t.controller.start();
      vi.advanceTimersByTime(100);
      t.doc.update(t.palette, { swatches: [{ hex: "#dc1e28", weight: 1, name: "Brick", locked: true }] });
      vi.advanceTimersByTime(100);
      expect(t.swatches()[0].name).toBe("Brick");
      t.doc.undo();
      vi.advanceTimersByTime(100);
      expect(t.swatches().map((s) => s.name)).toEqual([""]);
      t.controller.stop();
    });

    it("stop() ends listening", () => {
      vi.useFakeTimers();
      const t = setup();
      t.controller.start();
      vi.advanceTimersByTime(100);
      t.controller.stop();
      const n = t.controller.recomputes;
      t.store.put(meta(A1, RED));
      t.image(A1);
      vi.advanceTimersByTime(1000);
      expect(t.controller.recomputes).toBe(n);
    });
  });
});
