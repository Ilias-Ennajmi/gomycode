import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { CameraStore } from "@/lib/engine/input/camera-store";
import { OverlayStore, SelectionStore } from "@/lib/engine/input/tool-machine";
import type { NewObject } from "@/lib/engine/model/types";
import { GuidesOverlay } from "@/components/canvas/GuidesOverlay";
import { SelectionOverlay } from "@/components/canvas/SelectionOverlay";

afterEach(() => vi.unstubAllGlobals());

const shape = (id: string, x: number, y: number, w = 100, h = 80, extra: Partial<NewObject> = {}): NewObject =>
  ({ ...defaultsFor("shape"), id, x, y, w, h, ...extra }) as NewObject;

function stubCoarse(coarse: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("pointer: coarse") ? coarse : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("GuidesOverlay", () => {
  it("draws alignment lines and distance markers with their value, in token colours, following the camera", () => {
    const overlays = new OverlayStore();
    const camera = new CameraStore({ x: 0, y: 0, z: 2 });
    const { container } = render(<GuidesOverlay overlays={overlays} camera={camera} />);
    expect(container.querySelector("svg")).toBeNull(); // nothing to draw
    act(() =>
      overlays.set({
        guides: [
          { axis: "x", pos: 100, from: 0, to: 50 },
          { axis: "y", pos: 20, from: 100, to: 175, gap: 74.6 },
        ],
      }),
    );
    const lines = [...container.querySelectorAll("line")];
    const vertical = lines.find((l) => l.getAttribute("x1") === "200" && l.getAttribute("x2") === "200")!;
    expect(vertical.getAttribute("y2")).toBe("100"); // canvas 100 -> screen 200 at 2x; 50 -> 100
    expect(container.querySelector("g")!.getAttribute("stroke")).toBe("var(--color-selection)");
    expect(container.textContent).toContain("75");
    act(() => camera.set({ x: 0, y: 0, z: 1 }));
    const moved = [...container.querySelectorAll("line")].find((l) => l.getAttribute("x1") === "100" && l.getAttribute("x2") === "100");
    expect(moved).toBeDefined();
    act(() => overlays.reset());
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("SelectionOverlay", () => {
  function setup(objs: NewObject[]) {
    const doc = new BoardDoc();
    doc.createMany(objs);
    const selection = new SelectionStore();
    const overlays = new OverlayStore();
    const camera = new CameraStore({ x: 0, y: 0, z: 1 });
    const utils = render(<SelectionOverlay doc={doc} selection={selection} overlays={overlays} camera={camera} />);
    return { doc, selection, overlays, camera, ...utils };
  }

  it("draws nothing without a selection, and a box with 8 handles plus the rotate dot for one object", () => {
    const s = setup([shape("a", 100, 100, 200, 100)]);
    expect(s.container.querySelectorAll("[data-handle]")).toHaveLength(0);
    act(() => s.selection.set(["a"]));
    expect([...s.container.querySelectorAll("[data-handle]")].map((h) => h.getAttribute("data-handle")).sort()).toEqual([
      "e", "n", "ne", "nw", "rotate", "s", "se", "sw", "w",
    ]);
    const box = s.container.querySelector("[data-selection-box]")!;
    expect(box.getAttribute("width")).toBe("200");
    expect(box.getAttribute("stroke")).toBe("var(--color-selection)");
    expect(box.getAttribute("stroke-width")).toBe("1");
  });

  it("handles are 8 px squares with a 16 px hit area, 44 px on coarse pointers; handle size is constant across zoom", () => {
    stubCoarse(false);
    const fine = setup([shape("a", 0, 0, 200, 100)]);
    act(() => fine.selection.set(["a"]));
    const se = fine.container.querySelector('[data-handle="se"]')!;
    const [hitFine, visible] = [...se.querySelectorAll("rect")];
    expect(hitFine.getAttribute("width")).toBe("16");
    expect(visible.getAttribute("width")).toBe("8");
    act(() => fine.camera.set({ x: 0, y: 0, z: 4 }));
    expect(fine.container.querySelector('[data-handle="se"] rect:nth-of-type(2)')!.getAttribute("width")).toBe("8");
    fine.unmount();

    stubCoarse(true);
    const coarse = setup([shape("a", 0, 0, 200, 100)]);
    act(() => coarse.selection.set(["a"]));
    expect(coarse.container.querySelector('[data-handle="se"] rect')!.getAttribute("width")).toBe("44");
  });

  it("a tiny object gets corner handles only; a lone arrow and a locked object get an outline but no handles", () => {
    stubCoarse(false);
    const s = setup([
      shape("tiny", 0, 0, 10, 10),
      { ...defaultsFor("arrow"), id: "ar", x: 300, y: 300, w: 100, h: 1 } as NewObject,
      shape("lk", 500, 0, 100, 100, { locked: true }),
    ]);
    act(() => s.selection.set(["tiny"]));
    expect(s.container.querySelectorAll("[data-handle]:not([data-handle='rotate'])")).toHaveLength(4);
    act(() => s.selection.set(["ar"]));
    expect(s.container.querySelector("[data-selection-box]")).not.toBeNull();
    expect(s.container.querySelectorAll("[data-handle]")).toHaveLength(0);
    act(() => s.selection.set(["lk"]));
    expect(s.container.querySelector("[data-selection-box]")!.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(s.container.querySelectorAll("[data-handle]")).toHaveLength(0);
  });

  it("follows the object while it moves, and a multi-selection also outlines each object", () => {
    const s = setup([shape("a", 0, 0), shape("b", 300, 300)]);
    act(() => s.selection.set(["a"]));
    const x = () => s.container.querySelector("[data-selection-box]")!.parentElement!.getAttribute("transform");
    expect(x()).toContain("translate(50 40)");
    act(() => s.doc.update("a", { x: 200 }));
    expect(x()).toContain("translate(250 40)");
    act(() => s.selection.set(["a", "b"]));
    expect(s.container.querySelectorAll("svg > g > rect")).toHaveLength(3); // two object outlines + the union box
  });

  it("draws the marquee and the drop-target highlight from the overlay store", () => {
    const s = setup([shape("f", 0, 0, 300, 300)]);
    act(() => s.overlays.set({ marquee: { x: 10, y: 20, w: 100, h: 50 }, highlight: "f" }));
    const m = s.container.querySelector("[data-marquee]")!;
    expect(m.getAttribute("x")).toBe("10");
    expect(m.getAttribute("fill")).toBe("var(--color-selection-fill)");
    expect(s.container.querySelectorAll("rect").length).toBe(2);
  });
});
