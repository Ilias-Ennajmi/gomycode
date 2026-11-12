// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { EditingStore } from "@/lib/engine/input/editing-store";
import { OverlayStore, SelectionStore, type CanvasPointer, type ToolCtx } from "@/lib/engine/input/tool-machine";
import { createSelectTool } from "@/lib/engine/input/tools/select";
import { getPlaybackStore, resetPlaybackStore } from "@/lib/engine/media/playback-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { DEFAULT_NAV_SETTINGS } from "@/lib/settings";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

function setup(over: Record<string, unknown> = {}) {
  const doc = new BoardDoc();
  doc.create({ ...defaultsFor("video"), id: "v", assetId: AID, x: 0, y: 0, w: 320, h: 180, ...over } as NewObject);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const ctx: ToolCtx = {
    doc,
    index: new SpatialIndex(doc),
    camera: () => ({ x: 0, y: 0, z: 1 }),
    selection,
    settings: { ...DEFAULT_NAV_SETTINGS, snap: false },
    setTool: vi.fn(),
    overlays: new OverlayStore(),
    viewport: () => ({ w: 1000, h: 800 }),
    editing: new EditingStore(doc),
    finishTool: vi.fn(),
  };
  const P = (x: number, y: number): CanvasPointer => ({ point: { x, y }, screen: { x, y }, pointerId: 1, pointerType: "mouse", pressure: 0.5, button: 0, buttons: 1, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, timeStamp: 1 });
  return { doc, selection, ctx, tool: createSelectTool(), P };
}
const key = (k: string) => ({ key: k, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault() {} }) as never;

beforeEach(() => resetPlaybackStore());

describe("select tool and videos", () => {
  it("Enter on a selected video plays it, then pauses, then resumes", () => {
    const s = setup();
    s.selection.set(["v"]);
    expect(s.tool.onKey!(s.ctx, key("Enter"))).toBe(true);
    expect(getPlaybackStore().state("v")).toBe("playing");
    s.tool.onKey!(s.ctx, key("Enter"));
    expect(getPlaybackStore().state("v")).toBe("paused");
  });

  it("double-clicking a video plays it (selecting it first)", () => {
    const s = setup();
    s.tool.onDoubleClick!(s.ctx, s.P(50, 50));
    expect([...s.selection.ids]).toEqual(["v"]);
    expect(getPlaybackStore().state("v")).toBe("playing");
  });

  it("with reduce-motion on, the first Enter shows the clip paused: playing is a second, explicit step", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    const s = setup();
    s.selection.set(["v"]);
    s.tool.onKey!(s.ctx, key("Enter"));
    expect(getPlaybackStore().state("v")).toBe("paused");
    s.tool.onKey!(s.ctx, key("Enter"));
    expect(getPlaybackStore().state("v")).toBe("playing");
    vi.unstubAllGlobals();
  });

  it("a locked video can still be played", () => {
    const s = setup({ locked: true });
    s.selection.set(["v"]);
    s.tool.onKey!(s.ctx, key("Enter"));
    expect(getPlaybackStore().state("v")).toBe("playing");
  });
});
