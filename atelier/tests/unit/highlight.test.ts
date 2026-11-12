// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HighlightStore, bindHighlight, dimmedImageIds, litImageIds } from "@/lib/engine/color/highlight";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { SelectionStore } from "@/lib/engine/input/selection-store";

const A_RED = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e51";
const A_BLUE = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e52";
const A_NONE = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e53";
const A_EMPTY = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e54";
const meta = (id: string, palette: AssetMeta["palette"]): AssetMeta => ({
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

function setup() {
  const doc = new BoardDoc();
  const store = new AssetMetaStore({ persist: false });
  store.put(meta(A_RED, [{ hex: "#dc1e28", weight: 1 }]));
  store.put(meta(A_BLUE, [{ hex: "#1e50dc", weight: 1 }]));
  store.put(meta(A_EMPTY, []));
  const ids = {
    red: doc.create({ ...defaultsFor("image"), assetId: A_RED, w: 10, h: 10 }),
    blue: doc.create({ ...defaultsFor("image"), assetId: A_BLUE, w: 10, h: 10 }),
    none: doc.create({ ...defaultsFor("image"), assetId: A_NONE, w: 10, h: 10 }),
    empty: doc.create({ ...defaultsFor("image"), assetId: A_EMPTY, w: 10, h: 10 }),
  };
  return { doc, store, ids };
}

describe("HighlightStore", () => {
  it("sets, toggles, clears and notifies only on change", () => {
    const s = new HighlightStore();
    const cb = vi.fn();
    const off = s.subscribe(cb);
    expect(s.hex).toBeNull();
    s.set("#DC1E28");
    expect(s.hex).toBe("#dc1e28");
    s.set("#dc1e28");
    expect(cb).toHaveBeenCalledTimes(1);
    s.toggle("#dc1e28");
    expect(s.hex).toBeNull();
    s.toggle("#1e50dc");
    s.toggle("#dc1e28");
    expect(s.hex).toBe("#dc1e28");
    s.set("garbage");
    expect(s.hex).toBeNull();
    off();
    s.set("#1e50dc");
    expect(cb).toHaveBeenCalledTimes(5);
  });
});

describe("dimmedImageIds / litImageIds", () => {
  it("dims images whose palette lacks the colour; images with no palette yet are not dimmed", () => {
    const { doc, store, ids } = setup();
    expect(dimmedImageIds(doc, store, "#dc1e28")).toEqual(new Set([ids.blue, ids.empty]));
    expect(litImageIds(doc, store, "#dc1e28")).toEqual(new Set([ids.red, ids.none]));
  });
  it("ignores non-image objects", () => {
    const { doc, store } = setup();
    doc.create({ ...defaultsFor("sticky") });
    expect(dimmedImageIds(doc, store, "#dc1e28").size).toBe(2);
  });
});

describe("bindHighlight", () => {
  afterEach(() => vi.useRealTimers());

  it("lights the matching images through ImageLayer.setDimmed and restores on clear", () => {
    vi.useFakeTimers();
    const { doc, store, ids } = setup();
    const store2 = new HighlightStore();
    const images = { setDimmed: vi.fn() };
    const off = bindHighlight({ doc, meta: store, images, store: store2, selection: new SelectionStore() });
    expect(images.setDimmed).not.toHaveBeenCalledWith(expect.any(Set));
    store2.set("#dc1e28");
    expect(images.setDimmed).toHaveBeenLastCalledWith(new Set([ids.red, ids.none]));
    store2.set(null);
    expect(images.setDimmed).toHaveBeenLastCalledWith(null);
    off();
  });

  it("follows palette arrivals and new images while a colour is highlighted", () => {
    vi.useFakeTimers();
    const { doc, store, ids } = setup();
    const h = new HighlightStore();
    const images = { setDimmed: vi.fn() };
    const off = bindHighlight({ doc, meta: store, images, store: h, selection: new SelectionStore(), debounceMs: 50 });
    h.set("#dc1e28");
    store.put(meta(A_NONE, [{ hex: "#1e50dc", weight: 1 }])); // the colours of the pending image arrive
    vi.advanceTimersByTime(60);
    expect(images.setDimmed).toHaveBeenLastCalledWith(new Set([ids.red]));
    const extra = doc.create({ ...defaultsFor("image"), assetId: A_RED, w: 10, h: 10 });
    vi.advanceTimersByTime(60);
    expect(images.setDimmed).toHaveBeenLastCalledWith(new Set([ids.red, extra]));
    off();
  });

  it("Escape clears the highlight; so does a press on empty canvas, but not one on a chip", () => {
    vi.useFakeTimers();
    const { doc, store } = setup();
    const h = new HighlightStore();
    const container = document.createElement("div");
    const chip = document.createElement("button");
    chip.setAttribute("data-highlight-chip", "");
    container.append(chip);
    document.body.append(container);
    const selection = new SelectionStore();
    const off = bindHighlight({ doc, meta: store, images: { setDimmed: vi.fn() }, store: h, selection, container });

    h.set("#dc1e28");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(h.hex).toBeNull();

    h.set("#dc1e28");
    chip.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.runAllTimers();
    expect(h.hex).toBe("#dc1e28");

    container.dispatchEvent(new Event("pointerdown", { bubbles: true })); // empty canvas: nothing becomes selected
    vi.runAllTimers();
    expect(h.hex).toBeNull();

    h.set("#dc1e28");
    container.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    selection.set(["x"]); // the press landed on an object
    vi.runAllTimers();
    expect(h.hex).toBe("#dc1e28");
    off();
    container.remove();
  });

  it("unbinding restores the layer", () => {
    const { doc, store } = setup();
    const h = new HighlightStore();
    const images = { setDimmed: vi.fn() };
    const off = bindHighlight({ doc, meta: store, images, store: h, selection: new SelectionStore() });
    h.set("#dc1e28");
    off();
    expect(images.setDimmed).toHaveBeenLastCalledWith(null);
    h.set("#1e50dc");
    expect(images.setDimmed).toHaveBeenCalledTimes(2);
  });
});
