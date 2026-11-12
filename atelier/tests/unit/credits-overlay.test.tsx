import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";
import { BoardFields } from "@/components/panels/BoardFields";
import { VideoView } from "@/components/canvas/objects/VideoView";
import { registry, type CommandCtx } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { Provenance, VideoObj } from "@/lib/engine/model/types";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { makeEditor } from "./helpers/editor";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4ec1";
const AID2 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4ec2";
const prov = (o: Partial<Provenance> = {}): Provenance => ({ sourceUrl: null, credit: "", licence: "", capturedAt: null, ...o });
const noAssets = { url: () => null, available: () => null };
let resizeCallbacks: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  resizeCallbacks = [];
  class RO {
    constructor(cb: () => void) {
      resizeCallbacks.push(cb);
    }
    observe() {
      queueMicrotask(() => resizeCallbacks.forEach((c) => c()));
    }
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ctxFor = (doc: BoardDoc): CommandCtx => ({
  doc,
  selection: new SelectionStore(),
  canvas: { getCamera: () => ({ x: 0, y: 0, z: 1 }), viewport: () => ({ w: 1000, h: 800 }) } as never,
  setTool: () => {},
  toast: () => {},
  clipboardStyle: { current: null },
});

async function mountBoard(doc: BoardDoc) {
  const ref = createRef<CanvasHandle>();
  const view = render(<CanvasView ref={ref} doc={doc} assets={noAssets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return { ...view, ref };
}
const captions = (c: HTMLElement) => [...c.querySelectorAll("[data-image-layer] [data-object-id] span")].map((s) => s.textContent);

describe("view.credits", () => {
  it("flips meta.showCredits only: no object changes, no undo step", () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("image"), assetId: AID, w: 100, h: 100, provenance: prov({ credit: "Jane" }) } as never);
    doc.undoManager.clear();
    const before = doc.get(id)!.updatedAt;
    const ctx = ctxFor(doc);
    expect(registry.get("view.credits").group).toBe("view");
    expect(doc.meta.showCredits).toBe(false);
    expect(registry.run("view.credits", ctx)).toBe(true);
    expect(doc.meta.showCredits).toBe(true);
    expect(doc.get(id)!.updatedAt).toBe(before);
    expect(doc.canUndo()).toBe(false);
    registry.run("view.credits", ctx);
    expect(doc.meta.showCredits).toBe(false);
  });
});

describe("credits on the canvas", () => {
  function board() {
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("image"), id: "a", assetId: AID, x: 0, y: 0, w: 300, h: 200, provenance: prov({ credit: "Jane Doe", licence: "CC BY 4.0" }) } as never);
    doc.create({ ...defaultsFor("image"), id: "b", assetId: AID2, x: 400, y: 0, w: 300, h: 200, provenance: prov({ sourceUrl: "https://www.example.com/page" }) } as never);
    doc.create({ ...defaultsFor("image"), id: "c", assetId: AID, x: 800, y: 0, w: 300, h: 200 } as never);
    return doc;
  }

  it("shows no captions while credits are off, and the credit line (else the source host) under pictures when on", async () => {
    const doc = board();
    const { container } = await mountBoard(doc);
    expect(captions(container)).toEqual([]);
    act(() => void (doc.meta.showCredits = true));
    expect(captions(container)).toEqual(["Jane Doe · CC BY 4.0", "example.com"]);
    act(() => void (doc.meta.showCredits = false));
    expect(captions(container)).toEqual([]);
  });

  it("follows edits to a credit while on", async () => {
    const doc = board();
    doc.meta.showCredits = true;
    const { container } = await mountBoard(doc);
    act(() => doc.update("c", { provenance: prov({ credit: "New credit" }) }));
    expect(captions(container)).toContain("New credit");
  });

  it("renders a credit as plain text, never as markup", async () => {
    const doc = board();
    doc.update("a", { provenance: prov({ credit: "<b>bold</b><img src=x onerror=alert(1)>" }) });
    doc.meta.showCredits = true;
    const { container } = await mountBoard(doc);
    expect(captions(container)[0]).toBe("<b>bold</b><img src=x onerror=alert(1)>");
    expect(container.querySelector("[data-image-layer] b")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
  });

  it("a second device sees the toggle (meta syncs)", async () => {
    const a = board();
    const b = new BoardDoc();
    const { applyUpdate, encodeStateAsUpdate } = await import("yjs");
    applyUpdate(b.ydoc, encodeStateAsUpdate(a.ydoc));
    const { container } = await mountBoard(b);
    expect(captions(container)).toEqual([]);
    act(() => {
      a.meta.showCredits = true;
      applyUpdate(b.ydoc, encodeStateAsUpdate(a.ydoc));
    });
    expect(captions(container)).toEqual(["Jane Doe · CC BY 4.0", "example.com"]);
  });
});

describe("VideoView credit line", () => {
  const video = (p: Provenance | null): VideoObj => ({ ...defaultsFor("video"), id: "v", index: "a0", createdAt: 1, updatedAt: 1, assetId: AID, w: 320, h: 180, provenance: p }) as VideoObj;

  it("shows the same line when credits are on, as text, and not when off", () => {
    const doc = new BoardDoc();
    const { rerender, container } = render(<VideoView obj={video(prov({ credit: "<i>Film Co</i>", licence: "CC0" }))} assets={noAssets} doc={doc} />);
    expect(container.querySelector("[data-credit]")).toBeNull();
    act(() => void (doc.meta.showCredits = true));
    rerender(<VideoView obj={video(prov({ credit: "<i>Film Co</i>", licence: "CC0" }))} assets={noAssets} doc={doc} />);
    expect(container.querySelector("[data-credit]")?.textContent).toBe("<i>Film Co</i> · CC0");
    expect(container.querySelector("[data-credit] i")).toBeNull();
    rerender(<VideoView obj={video(null)} assets={noAssets} doc={doc} />);
    expect(container.querySelector("[data-credit]")).toBeNull();
  });
});

describe("Inspector Board section", () => {
  it("has a Show credits switch for the board", () => {
    const t = makeEditor();
    t.render(<BoardFields />);
    const sw = screen.getByRole("switch", { name: /show credits/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(t.doc.meta.showCredits).toBe(true);
    expect(t.doc.canUndo()).toBe(false);
  });
});
