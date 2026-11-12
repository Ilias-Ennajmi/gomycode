import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { NewObject } from "@/lib/engine/model/types";
import { ObjectLayer, setObjectRenderProbe } from "@/components/canvas/ObjectLayer";
import { buildRenderTree } from "@/components/canvas/render-tree";

const VIEWPORT = { w: 1000, h: 800 };
const CAMERA = { x: 0, y: 0, z: 1 };
const noAssets: AssetResolver = { url: () => null, available: () => null };

function shape(id: string, x: number, y: number, extra: Partial<NewObject> = {}): NewObject {
  return { ...defaultsFor("shape"), id, x, y, w: 100, h: 80, ...extra } as NewObject;
}

function mountedIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-object-id]")].map((e) => e.getAttribute("data-object-id")!);
}

afterEach(() => setObjectRenderProbe(null));

describe("ObjectLayer", () => {
  it("renders only the ids returned by visible()", () => {
    const doc = new BoardDoc();
    doc.createMany([shape("a", 0, 0), shape("b", 200, 0), shape("c", 9000, 0)]);
    const visible = vi.fn(() => ["a", "b"]);
    const { container } = render(
      <ObjectLayer doc={doc} index={{ visible }} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />,
    );
    expect(mountedIds(container).sort()).toEqual(["a", "b"]);
    expect(visible).toHaveBeenCalledWith(CAMERA, VIEWPORT, expect.any(Number));
  });

  it("culls with a real spatial index and follows the camera view", () => {
    const doc = new BoardDoc();
    doc.createMany([shape("near", 0, 0), shape("far", 50_000, 0)]);
    const index = new SpatialIndex(doc);
    const { container, rerender } = render(
      <ObjectLayer doc={doc} index={index} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />,
    );
    expect(mountedIds(container)).toEqual(["near"]);
    rerender(
      <ObjectLayer doc={doc} index={index} assets={noAssets} view={{ camera: { x: 49_900, y: 0, z: 1 }, viewport: VIEWPORT }} />,
    );
    expect(mountedIds(container)).toEqual(["far"]);
    index.destroy();
  });

  it("re-renders only the object that changed", () => {
    const doc = new BoardDoc();
    doc.createMany([shape("a", 0, 0), shape("b", 200, 0), shape("c", 400, 0)]);
    const index = new SpatialIndex(doc);
    const counts = new Map<string, number>();
    setObjectRenderProbe((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    const { container } = render(
      <ObjectLayer doc={doc} index={index} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />,
    );
    expect([...counts.values()]).toEqual([1, 1, 1]);
    counts.clear();
    act(() => doc.update("b", { x: 250 }));
    expect([...counts.entries()]).toEqual([["b", 1]]);
    const b = container.querySelector('[data-object-id="b"]') as HTMLElement;
    expect(b.style.transform).toMatch(/^translate\(250px(, 0px)?\)/);
    index.destroy();
  });

  it("mounts an object created later and unmounts a removed one", () => {
    const doc = new BoardDoc();
    doc.create(shape("a", 0, 0));
    const index = new SpatialIndex(doc);
    const { container } = render(
      <ObjectLayer doc={doc} index={index} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />,
    );
    act(() => {
      doc.create(shape("late", 300, 100));
    });
    expect(mountedIds(container).sort()).toEqual(["a", "late"]);
    act(() => doc.remove(["a"]));
    expect(mountedIds(container)).toEqual(["late"]);
    index.destroy();
  });

  it("exposes the layer element through its ref", () => {
    const doc = new BoardDoc();
    const ref = createRef<HTMLDivElement>();
    render(<ObjectLayer ref={ref} doc={doc} index={{ visible: () => [] }} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current!.hasAttribute("data-canvas-layer")).toBe(true);
  });

  it("draws a frame's children inside the frame, in z-order, with the frame pulled in even if off screen", () => {
    const doc = new BoardDoc();
    const [frame] = doc.createMany([
      { ...defaultsFor("frame"), id: "f", x: -5000, y: 0, w: 6000, h: 400 } as NewObject,
    ]);
    doc.createMany([
      shape("k1", 100, 10, { parentId: frame }),
      shape("k2", 120, 10, { parentId: frame }),
      shape("loose", 0, 300),
    ]);
    const index = new SpatialIndex(doc);
    const { container } = render(
      <ObjectLayer doc={doc} index={index} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />,
    );
    const f = container.querySelector('[data-object-id="f"]')!;
    expect([...f.querySelectorAll("[data-object-id]")].map((e) => e.getAttribute("data-object-id"))).toEqual(["k1", "k2"]);
    expect(container.querySelector('[data-object-id="loose"]')!.closest('[data-object-id="f"]')).toBeNull();
    index.destroy();
  });

  it("picks the image variant by on-screen pixels and falls back when one is missing", () => {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("image"), id: "img", assetId: "as", x: 0, y: 0, w: 800, h: 600 } as NewObject);
    const calls: string[] = [];
    const assets: AssetResolver = { url: (id, v) => (calls.push(v), v === "w1024" ? "blob:w" : "blob:o"), available: () => null };
    const view = (z: number) => ({ camera: { x: 0, y: 0, z }, viewport: { w: 4000, h: 3000 } });
    const { container, rerender } = render(<ObjectLayer doc={doc} index={{ visible: () => ["img"] }} assets={assets} view={view(1)} dpr={1} />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:w"); // 800 px <= 1024
    expect(container.querySelector("img")!.getAttribute("decoding")).toBe("async");
    rerender(<ObjectLayer doc={doc} index={{ visible: () => ["img"] }} assets={assets} view={view(2)} dpr={1} />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:o"); // 1600 px
    rerender(<ObjectLayer doc={doc} index={{ visible: () => ["img"] }} assets={assets} view={view(1)} dpr={2} />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:o"); // 800 * 2 dpr
    const onlyOriginal: AssetResolver = { url: (_id, v) => (v === "original" ? "blob:o2" : null), available: () => null };
    rerender(<ObjectLayer doc={doc} index={{ visible: () => ["img"] }} assets={onlyOriginal} view={view(0.5)} dpr={1} />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:o2");
  });

  it("shows a placeholder, not a broken image, when the asset is not available", () => {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("image"), id: "img", assetId: "missing", w: 100, h: 100 } as NewObject);
    const { container } = render(<ObjectLayer doc={doc} index={{ visible: () => ["img"] }} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-object-id="img"]')).not.toBeNull();
  });

  it("renders text as grey bars below zoom 0.15 and as text above", () => {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("text"), id: "t", w: 300, h: 40 } as NewObject);
    const { container, rerender } = render(<ObjectLayer doc={doc} index={{ visible: () => ["t"] }} assets={noAssets} view={{ camera: { x: 0, y: 0, z: 1 }, viewport: VIEWPORT }} />);
    expect(container.querySelector(".atelier-rich")).not.toBeNull();
    rerender(<ObjectLayer doc={doc} index={{ visible: () => ["t"] }} assets={noAssets} view={{ camera: { x: 0, y: 0, z: 0.1 }, viewport: VIEWPORT }} />);
    expect(container.querySelector(".atelier-rich")).toBeNull();
    expect(container.querySelector('[data-object-id="t"] [aria-hidden="true"]')).not.toBeNull();
  });

  it("draws an arrow whose target was deleted without crashing", () => {
    const doc = new BoardDoc();
    doc.createMany([
      shape("t", 0, 0),
      {
        ...defaultsFor("arrow"),
        id: "ar",
        x: 0,
        y: 0,
        w: 200,
        h: 50,
        start: { kind: "bound", id: "t", anchor: { x: 0.5, y: 0.5 } },
        end: { kind: "point", x: 300, y: 100 },
      } as NewObject,
    ]);
    const { container } = render(<ObjectLayer doc={doc} index={{ visible: () => ["ar", "t"] }} assets={noAssets} view={{ camera: CAMERA, viewport: VIEWPORT }} />);
    expect(container.querySelector('[data-object-id="ar"] path')?.getAttribute("d")).toMatch(/^M /);
    // Remote delete of the target that bypasses BoardDoc.remove(): the arrow keeps a dangling bound terminal.
    act(() => {
      doc.ydoc.getMap("objects").delete("t");
    });
    expect(container.querySelector('[data-object-id="ar"] path')?.getAttribute("d")).not.toMatch(/NaN/);
  });
});

describe("buildRenderTree", () => {
  it("draws the children of a group where the group sits in the z-order", () => {
    const doc = new BoardDoc();
    doc.createMany([shape("below", 0, 0), { ...defaultsFor("group"), id: "g", x: 0, y: 0, w: 10, h: 10 } as NewObject]);
    doc.create(shape("inGroup", 0, 0, { parentId: "g" }));
    doc.create(shape("above", 0, 0));
    const tree = buildRenderTree(doc, doc.all().map((o) => o.id));
    expect(tree.roots).toEqual(["below", "inGroup", "above"]);
  });

  it("survives parent cycles and missing parents", () => {
    const doc = new BoardDoc();
    doc.createMany([shape("x", 0, 0, { parentId: "ghost" }), shape("loop1", 0, 0, { parentId: "loop2" }), shape("loop2", 0, 0, { parentId: "loop1" })]);
    const tree = buildRenderTree(doc, ["x", "loop1", "loop2"]);
    expect(tree.roots.sort()).toEqual(["loop1", "loop2", "x"]);
  });
});
