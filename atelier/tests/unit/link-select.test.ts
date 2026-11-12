// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { EditingStore } from "@/lib/engine/input/editing-store";
import { OverlayStore, SelectionStore, type CanvasPointer, type ToolCtx } from "@/lib/engine/input/tool-machine";
import { createSelectTool } from "@/lib/engine/input/tools/select";
import { liveEmbeds } from "@/lib/engine/links/live-embed";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { DEFAULT_NAV_SETTINGS } from "@/lib/settings";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { registry, type CommandCtx } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";

const card = { ...defaultsFor("link"), id: "l1", x: 0, y: 0, w: 320, h: 240, url: "https://example.com/page", status: "ready" } as NewObject;
const embed = {
  ...defaultsFor("embed"),
  id: "e1",
  x: 400,
  y: 0,
  w: 480,
  h: 270,
  url: "https://youtu.be/dQw4w9WgXcQ",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
} as NewObject;

function setup() {
  const doc = new BoardDoc();
  doc.createMany([card, embed]);
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
  const P = (x: number, y: number): CanvasPointer => ({
    point: { x, y },
    screen: { x, y },
    pointerId: 1,
    pointerType: "mouse",
    pressure: 0.5,
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    timeStamp: 1,
  });
  return { doc, selection, ctx, tool: createSelectTool(), P };
}

afterEach(() => {
  vi.restoreAllMocks();
  liveEmbeds.deactivate();
});

describe("opening link cards and playing embeds from the canvas", () => {
  it("double-clicking a link card opens its page in a new tab with no opener", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const s = setup();
    s.tool.onDoubleClick!(s.ctx, s.P(50, 50));
    expect(open).toHaveBeenCalledWith("https://example.com/page", "_blank", "noopener,noreferrer");
    expect([...s.selection.ids]).toEqual(["l1"]);
  });

  it("Enter on a selected link card opens it; Enter on a selected embed plays it", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const s = setup();
    s.selection.set(["l1"]);
    expect(s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    s.selection.set(["e1"]);
    expect(s.tool.onKey!(s.ctx, new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
    expect(liveEmbeds.active).toBe("e1");
  });

  it("double-clicking an embed plays it (and never opens a tab)", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const s = setup();
    s.tool.onDoubleClick!(s.ctx, s.P(500, 100));
    expect(liveEmbeds.active).toBe("e1");
    expect(open).not.toHaveBeenCalled();
  });

  it("never opens an address that is not http(s), even if one got into the document", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const s = setup();
    // Bypass validation the way a tampered document would.
    (s.doc.get("l1") as { url: string }).url = "javascript:alert(1)";
    s.tool.onDoubleClick!(s.ctx, s.P(50, 50));
    expect(open).not.toHaveBeenCalled();
  });
});

describe("link commands", () => {
  const ctxFor = (s: ReturnType<typeof setup>, over: Partial<CommandCtx> = {}): CommandCtx =>
    ({ doc: s.doc, selection: s.selection, canvas: {} as never, setTool: vi.fn(), toast: vi.fn(), clipboardStyle: { current: null }, ...over }) as CommandCtx;

  it("link.open is available only for one selected link or embed, and opens its original URL", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const s = setup();
    expect(registry.available("link.open", ctxFor(s))).toBe(false);
    s.selection.set(["e1"]);
    expect(registry.run("link.open", ctxFor(s))).toBe(true);
    expect(open).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ", "_blank", "noopener,noreferrer");
  });

  it("link.retryPreview is offered for a card that is not ready and has preview deps", async () => {
    const s = setup();
    s.doc.update("l1", { status: "failed" });
    s.selection.set(["l1"]);
    const fetchPreview = vi.fn(async () => ({ title: "T", description: "", siteName: "S", imageUrl: null, faviconUrl: null, finalUrl: "https://example.com/page" }));
    const deps = { fetchPreview, fetchImage: vi.fn(), uploader: { addAssetOnly: vi.fn() }, online: () => true };
    expect(registry.available("link.retryPreview", ctxFor(s))).toBe(false); // no deps: nothing could fetch
    const ctx = ctxFor(s, { ui: { linkDeps: () => deps } });
    expect(registry.run("link.retryPreview", ctx)).toBe(true);
    const { previewSettled } = await import("@/lib/engine/links/link-cards");
    await previewSettled(s.doc, "l1");
    expect(fetchPreview).toHaveBeenCalledTimes(1);
    expect(s.doc.get("l1")).toMatchObject({ status: "ready", title: "T" });
    expect(registry.available("link.retryPreview", ctx)).toBe(false);
  });

  it("registers insert.link and insert.embed in the insert group, and Paste as text on Mod+Shift+V", () => {
    expect(registry.get("insert.link").group).toBe("insert");
    expect(registry.get("insert.embed").group).toBe("insert");
    expect(registry.get("edit.pasteAsText")).toMatchObject({ shortcut: "Mod+Shift+V", native: true });
  });

  it("insert.link asks the UI for a link prompt", () => {
    const s = setup();
    const promptUrl = vi.fn();
    expect(registry.run("insert.link", ctxFor(s, { ui: { promptUrl } }))).toBe(true);
    expect(promptUrl).toHaveBeenCalledWith("link");
    expect(registry.run("insert.embed", ctxFor(s, { ui: { promptUrl } }))).toBe(true);
    expect(promptUrl).toHaveBeenLastCalledWith("embed");
    expect(registry.available("insert.link", ctxFor(s))).toBe(false);
  });
});
