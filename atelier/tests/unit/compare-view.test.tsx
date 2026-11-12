import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CompareView } from "@/components/canvas/CompareView";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const noAssets = { url: () => null, available: () => null } as never;
const mk = (type: "shape" | "frame" | "sticky", id: string, over: Record<string, unknown> = {}) => ({ ...defaultsFor(type), id, ...over }) as unknown as NewObject;

/** Round 2: two frames with a shape each. */
function earlier(): BoardDoc {
  const d = new BoardDoc();
  d.create(mk("frame", "f1", { name: "Hero", x: 0, y: 0, w: 800, h: 600, order: "a0" }));
  d.create(mk("frame", "f2", { name: "Pricing", x: 1200, y: 0, w: 800, h: 600, order: "b0" }));
  d.create(mk("shape", "a", { parentId: "f1", x: 100, y: 100 }));
  d.create(mk("shape", "b", { parentId: "f2", x: 1300, y: 100 }));
  return d;
}
const copyOf = (d: BoardDoc) => docFromState(Y.encodeStateAsUpdate(d.ydoc));

beforeEach(() => {
  class RO {
    constructor(private cb: () => void) {}
    observe() {
      queueMicrotask(this.cb);
    }
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("min-width"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(a: BoardDoc, b: BoardDoc, extra: Partial<Parameters<typeof CompareView>[0]> = {}) {
  const utils = render(<CompareView a={{ doc: a, label: "Round 2" }} b={{ doc: b, label: "Current board" }} assets={noAssets} {...extra} />);
  await act(async () => {});
  return utils;
}
const pane = (side: "a" | "b") => document.querySelector(`[data-compare-side="${side}"]`) as HTMLElement;
const layerOf = (side: "a" | "b") => pane(side).querySelector("[data-canvas-root] > div") as HTMLElement;

describe("CompareView", () => {
  it("draws the objects of both boards, also under React strict mode (development double-runs effects)", async () => {
    const a = earlier();
    const b = copyOf(a);
    render(
      <StrictMode>
        <CompareView a={{ doc: a, label: "Round 2" }} b={{ doc: b, label: "Current board" }} assets={noAssets} />
      </StrictMode>,
    );
    await act(async () => {});
    for (const side of ["a", "b"] as const) {
      expect(pane(side).querySelector('[data-object-id="f1"]')).not.toBeNull();
      expect(pane(side).querySelector('[data-object-id="a"]')).not.toBeNull();
    }
  });

  it("two identical states say there are no differences", async () => {
    const a = earlier();
    await mount(a, copyOf(a));
    expect(screen.getByText(/no differences/i)).toBeInTheDocument();
  });

  it("summarises added, changed and removed, and lists what was removed as text", async () => {
    const a = earlier();
    const b = copyOf(a);
    b.update("a", { x: 999 });
    b.create(mk("shape", "new1", { parentId: "f1" }));
    b.remove(["b"]);
    await mount(a, b);
    const summary = screen.getByTestId("compare-summary");
    expect(summary).toHaveTextContent(/1 added/);
    expect(summary).toHaveTextContent(/1 changed/);
    expect(summary).toHaveTextContent(/1 removed/);
    expect(summary).toHaveTextContent(/shape/i); // the removed object, named in text
    expect(screen.queryByText(/no differences/i)).not.toBeInTheDocument();
  });

  it("two canvases, both read-only", async () => {
    const a = earlier();
    await mount(a, copyOf(a));
    expect(pane("a").querySelector("[data-canvas-root]")).toHaveAttribute("data-read-only", "true");
    expect(pane("b").querySelector("[data-canvas-root]")).toHaveAttribute("data-read-only", "true");
    expect(pane("a")).toHaveAccessibleName(/Round 2/);
    expect(pane("b")).toHaveAccessibleName(/Current board/);
  });

  it("highlights added and changed objects in B and removed ones in A, only while Highlight changes is on", async () => {
    const a = earlier();
    const b = copyOf(a);
    b.update("a", { x: 999 });
    b.create(mk("shape", "new1", { parentId: "f1" }));
    b.remove(["b"]);
    await mount(a, b);
    const toggle = screen.getByRole("checkbox", { name: /highlight changes/i });
    expect(toggle).not.toBeChecked();
    expect(document.querySelector("[data-compare-diff]")).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() => expect(pane("b").querySelector('[data-object-id="a"]')).toHaveAttribute("data-compare-diff", "changed"));
    expect(pane("b").querySelector('[data-object-id="new1"]')).toHaveAttribute("data-compare-diff", "added");
    expect(pane("a").querySelector('[data-object-id="b"]')).toHaveAttribute("data-compare-diff", "removed");
    expect(pane("b").querySelector('[data-object-id="f1"]')).not.toHaveAttribute("data-compare-diff");
    fireEvent.click(toggle);
    await waitFor(() => expect(document.querySelector("[data-compare-diff]")).toBeNull());
  });

  it("panning or zooming A moves B to the same place", async () => {
    const a = earlier();
    await mount(a, copyOf(a));
    const rootA = pane("a").querySelector("[data-canvas-root]") as HTMLElement;
    act(() => {
      fireEvent.wheel(rootA, { deltaY: -4, ctrlKey: true, clientX: 500, clientY: 400 });
    });
    expect(layerOf("a").style.transform).not.toBe("");
    expect(layerOf("b").style.transform).toBe(layerOf("a").style.transform);
    const rootB = pane("b").querySelector("[data-canvas-root]") as HTMLElement;
    fireEvent.pointerDown(rootB, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(rootB, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 250, clientY: 260 });
    fireEvent.pointerUp(rootB, { pointerId: 1, pointerType: "mouse", clientX: 250, clientY: 260 });
    expect(layerOf("a").style.transform).toBe(layerOf("b").style.transform);
  });

  it("the frame picker jumps both sides to the same frame", async () => {
    const a = earlier();
    await mount(a, copyOf(a));
    const before = layerOf("a").style.transform;
    const picker = screen.getByRole("combobox", { name: /frame/i });
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["Whole board", "Hero", "Pricing"]);
    fireEvent.change(picker, { target: { value: "f2" } });
    expect(layerOf("a").style.transform).not.toBe(before);
    expect(layerOf("b").style.transform).toBe(layerOf("a").style.transform);
    // the next-frame button steps on, and stops at the last frame
    fireEvent.change(picker, { target: { value: "f1" } });
    const f1 = layerOf("a").style.transform;
    fireEvent.click(screen.getByRole("button", { name: /next frame/i }));
    expect((picker as HTMLSelectElement).value).toBe("f2");
    expect(layerOf("a").style.transform).not.toBe(f1);
    expect(screen.getByRole("button", { name: /next frame/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /previous frame/i }));
    expect((picker as HTMLSelectElement).value).toBe("f1");
  });

  describe("Swipe", () => {
    it("overlays B on A behind a keyboard-operable slider that clips B", async () => {
      const a = earlier();
      await mount(a, copyOf(a));
      fireEvent.click(screen.getByRole("button", { name: /swipe/i }));
      const slider = screen.getByRole("slider", { name: "Compare position" }) as HTMLInputElement;
      expect(slider).toHaveAttribute("aria-valuenow", "50");
      expect(pane("b").style.clipPath).toMatch(/^inset\(0(px)? 50% 0(px)? 0(px)?\)$/);
      fireEvent.change(slider, { target: { value: "80" } });
      expect(slider).toHaveAttribute("aria-valuenow", "80");
      expect(pane("b").style.clipPath).toMatch(/^inset\(0(px)? 20% 0(px)? 0(px)?\)$/);
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      // a native range moves itself on arrow keys; here we only check the control is a focusable, labelled input
      slider.focus();
      expect(slider).toHaveFocus();
      expect(slider.type).toBe("range");
    });

    it("keeps the camera and the frame when switching modes, and no slider shows side by side", async () => {
      const a = earlier();
      await mount(a, copyOf(a));
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole("combobox", { name: /frame/i }), { target: { value: "f2" } });
      fireEvent.click(screen.getByRole("button", { name: /swipe/i }));
      expect((screen.getByRole("combobox", { name: /frame/i }) as HTMLSelectElement).value).toBe("f2");
      fireEvent.click(screen.getByRole("button", { name: /side by side/i }));
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    });

    it("starts in swipe mode on a narrow screen", async () => {
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
      const a = earlier();
      await mount(a, copyOf(a));
      expect(screen.getByRole("slider", { name: "Compare position" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /swipe/i })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("does not create, copy or destroy the documents it is given (the loader owns them)", async () => {
    const a = earlier();
    const b = copyOf(a);
    const destroyA = vi.spyOn(a, "destroy");
    const destroyB = vi.spyOn(b, "destroy");
    const { unmount } = await mount(a, b);
    unmount();
    expect(destroyA).not.toHaveBeenCalled();
    expect(destroyB).not.toHaveBeenCalled();
  });

  it("has a close button when asked to", async () => {
    const a = earlier();
    const onClose = vi.fn();
    await mount(a, copyOf(a), { onClose });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
