import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorServices } from "@/components/editor/ColorServices";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { getHighlightStore } from "@/lib/engine/color/highlight";
import type { PaletteObj } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

const A1 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4ea1";
const A2 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4ea2";
const meta = (id: string, palette: AssetMeta["palette"]): AssetMeta => ({ id, kind: "image", width: 100, height: 100, bytes: 1, variants: ["w1024"], palette, phash: null, title: "", provenance: null, analysisVersion: palette ? 1 : 0 });

afterEach(() => {
  vi.useRealTimers();
  getHighlightStore().set(null);
});

function mount() {
  const store = new AssetMetaStore({ persist: false });
  const t = makeEditor([obj("palette", "p", { live: true }), obj("image", "i1", { assetId: A1, w: 100, h: 100 }), obj("image", "i2", { assetId: A2, w: 100, h: 100 })]);
  const images = { setDimmed: vi.fn() };
  (t.handle as unknown as { images: typeof images }).images = images;
  const r = t.render(<ColorServices meta={store} resolver={{ url: () => null }} />);
  return { ...t, store, images, unmount: r.unmount };
}

describe("ColorServices", () => {
  it("keeps the live palette in step with the pictures' colours", () => {
    vi.useFakeTimers();
    const t = mount();
    t.store.put(meta(A1, [{ hex: "#dc1e28", weight: 1 }]));
    t.store.put(meta(A2, [{ hex: "#1e50dc", weight: 1 }]));
    act(() => void vi.advanceTimersByTime(500));
    expect((t.doc.get("p") as PaletteObj).swatches.map((s) => s.hex).sort()).toEqual(["#1e50dc", "#dc1e28"]);
  });

  it("dims the pictures without the highlighted colour, and restores on clear", () => {
    const t = mount();
    t.store.put(meta(A1, [{ hex: "#dc1e28", weight: 1 }]));
    t.store.put(meta(A2, [{ hex: "#1e50dc", weight: 1 }]));
    act(() => getHighlightStore().set("#dc1e28"));
    expect(t.images.setDimmed).toHaveBeenLastCalledWith(new Set(["i1"]));
    act(() => getHighlightStore().set(null));
    expect(t.images.setDimmed).toHaveBeenLastCalledWith(null);
  });

  it("clears the highlight when the board closes", () => {
    const t = mount();
    act(() => getHighlightStore().set("#dc1e28"));
    t.unmount();
    expect(getHighlightStore().hex).toBeNull();
  });
});
