import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ImageObj } from "@/lib/engine/model/types";
import { useAddRequest } from "@/components/board/useAddRequest";
import { SelectionStore } from "@/lib/engine/input/selection-store";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";

function fakeCanvas(doc: BoardDoc) {
  const selection = new SelectionStore();
  return {
    doc,
    selection,
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    viewport: () => ({ w: 1000, h: 600 }),
  } as never;
}

beforeEach(() => {
  window.history.replaceState(null, "", `/b/board-1?add=${A}&ak=image&aw=4000&ah=3000`);
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("useAddRequest (Add to board from the library)", () => {
  it("places the asset at the middle of the view, selects it, and clears the address", () => {
    const doc = new BoardDoc();
    const canvas = fakeCanvas(doc);
    const notify = vi.fn();
    renderHook(() => useAddRequest(doc, canvas, notify));
    const [o] = doc.all() as ImageObj[];
    expect(o).toMatchObject({ type: "image", assetId: A, w: 320, h: 240 });
    expect(o.x + o.w / 2).toBe(500);
    expect(o.y + o.h / 2).toBe(300);
    expect([...(canvas as unknown as { selection: SelectionStore }).selection.ids]).toEqual([o.id]);
    expect(window.location.search).toBe("");
    expect(notify).toHaveBeenCalledWith("Added to this board.");
  });

  it("is one undo step", () => {
    const doc = new BoardDoc();
    doc.stopCapturing();
    renderHook(() => useAddRequest(doc, fakeCanvas(doc), vi.fn()));
    expect(doc.all()).toHaveLength(1);
    doc.undo();
    expect(doc.all()).toHaveLength(0);
  });

  it("adds only once even when the hook runs again", () => {
    const doc = new BoardDoc();
    const canvas = fakeCanvas(doc);
    const { rerender } = renderHook(() => useAddRequest(doc, canvas, vi.fn()));
    rerender();
    expect(doc.all()).toHaveLength(1);
  });

  it("still adds a picture the board already has, and says so without blocking", () => {
    const doc = new BoardDoc();
    const canvas = fakeCanvas(doc);
    const notify = vi.fn();
    renderHook(() => useAddRequest(doc, canvas, notify));
    window.history.replaceState(null, "", `/b/board-1?add=${A}&ak=image&aw=4000&ah=3000`);
    renderHook(() => useAddRequest(doc, canvas, notify));
    expect(doc.all()).toHaveLength(2);
    expect(notify).toHaveBeenLastCalledWith("Already on this board. Added another copy.");
  });

  it("does nothing without a request, or before the board is ready", () => {
    const doc = new BoardDoc();
    window.history.replaceState(null, "", "/b/board-1");
    renderHook(() => useAddRequest(doc, fakeCanvas(doc), vi.fn()));
    expect(doc.all()).toHaveLength(0);
    window.history.replaceState(null, "", `/b/board-1?add=${A}&ak=image&aw=10&ah=10`);
    renderHook(() => useAddRequest(null, null, vi.fn()));
    expect(doc.all()).toHaveLength(0);
  });
});
