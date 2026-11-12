import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { useClipboard } from "@/components/canvas/useClipboard";
import { useDropFiles } from "@/components/canvas/useDropFiles";
import { ImageError } from "@/lib/assets/pipeline-core";
import { registry, type CommandCtx, type ToastOptions } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { serializeSelection } from "@/lib/engine/clipboard/serialize";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, Point } from "@/lib/engine/model/types";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { previewSettled, type LinkCardDeps } from "@/lib/engine/links/link-cards";
import { richContentToJSON } from "@/lib/engine/clipboard/rich";

const shape = (id: string, x: number, y: number, w = 100, h = 80) => ({ ...defaultsFor("shape"), id, x, y, w, h }) as NewObject;

function setup(objs: NewObject[] = [], addImage?: (f: File, at: Point, provenance?: unknown) => Promise<unknown>, links?: LinkCardDeps) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const container = document.createElement("div");
  document.body.append(container);
  const toasts: ToastOptions[] = [];
  const handle = {
    doc,
    selection,
    index: new SpatialIndex(doc),
    container: () => container,
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    viewport: () => ({ w: 1000, h: 800 }),
  } as unknown as CanvasHandle;
  const ctx: CommandCtx = {
    doc,
    selection,
    canvas: handle,
    setTool: vi.fn(),
    toast: (o) => {
      toasts.push(o);
    },
    clipboardStyle: { current: null },
  };
  const add = vi.fn(addImage ?? (async () => "img"));
  const hook = renderHook(() => useClipboard({ handle, ctx: () => ctx, addImage: add, links }));
  const move = (x: number, y: number) => container.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
  return { doc, selection, container, toasts, handle, ctx, add, hook, move, objects: () => doc.all() };
}

function clip(type: "copy" | "cut" | "paste", data: Record<string, string> = {}, files: File[] = [], target?: EventTarget) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const store: Record<string, string> = { ...data };
  Object.defineProperty(e, "clipboardData", {
    value: {
      getData: (t: string) => store[t] ?? "",
      setData: (t: string, v: string) => {
        store[t] = v;
      },
      files,
      items: files.map((f) => ({ kind: "file", getAsFile: () => f })),
      types: Object.keys(store),
    },
  });
  (target ?? document.body).dispatchEvent(e);
  return { e, store };
}

const file = (name: string, type: string, size = 10) => {
  const f = new File([new Uint8Array(Math.min(size, 10))], name, { type });
  if (size > 10) Object.defineProperty(f, "size", { value: size });
  return f;
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
beforeEach(() => {
  // registry must hold the clipboard commands
  void registry;
});

describe("copy and cut", () => {
  it("copy puts Atelier HTML and a plain-text fallback on the clipboard and says so", () => {
    const t = setup([shape("a", 0, 0), shape("b", 300, 0)]);
    t.selection.set(["a", "b"]);
    const { e, store } = clip("copy");
    expect(e.defaultPrevented).toBe(true);
    expect(store["text/html"]).toContain("atelier:v1");
    expect(typeof store["text/plain"]).toBe("string");
    expect(t.toasts[0].message).toBe("Copied 2 objects");
    expect(t.objects()).toHaveLength(2);
  });

  it("copy with nothing selected leaves the browser alone", () => {
    const t = setup([shape("a", 0, 0)]);
    const { e } = clip("copy");
    expect(e.defaultPrevented).toBe(false);
    expect(t.toasts).toHaveLength(0);
  });

  it("cut = copy + delete in one undo step, with an Undo toast", () => {
    const t = setup([shape("a", 0, 0), shape("b", 300, 0), shape("c", 600, 0)]);
    t.selection.set(["a", "b"]);
    const { e, store } = clip("cut");
    expect(e.defaultPrevented).toBe(true);
    expect(store["text/html"]).toContain("atelier:v1");
    expect(t.objects().map((o) => o.id)).toEqual(["c"]);
    expect(t.toasts[0]).toMatchObject({ message: "Cut 2 objects", action: { label: "Undo" } });
    const steps = t.doc.undoManager.undoStack.length;
    t.doc.undo();
    expect(t.objects()).toHaveLength(3);
    expect(t.doc.undoManager.undoStack.length).toBe(steps - 1); // the whole cut was a single step
  });

  it("ignores events from inputs and contenteditable", () => {
    const t = setup([shape("a", 0, 0)]);
    t.selection.set(["a"]);
    const input = document.createElement("input");
    document.body.append(input);
    const { e } = clip("copy", {}, [], input);
    expect(e.defaultPrevented).toBe(false);
    const p = clip("paste", { "text/plain": "hello" }, [], input);
    expect(p.e.defaultPrevented).toBe(false);
    expect(t.objects()).toHaveLength(1);
  });
});

describe("paste", () => {
  it("pastes Atelier objects at the pointer and selects them; repeated pastes step by 16", () => {
    const src = new BoardDoc();
    src.createMany([shape("a", 0, 0, 100, 100)]);
    const { html, text } = serializeSelection(src, ["a"]);
    const t = setup();
    t.move(500, 400);
    clip("paste", { "text/html": html, "text/plain": text });
    const first = t.objects()[0];
    expect(first.x + first.w / 2).toBeCloseTo(500);
    expect(first.y + first.h / 2).toBeCloseTo(400);
    expect([...t.selection.ids]).toEqual([first.id]);
    clip("paste", { "text/html": html, "text/plain": text });
    const second = t.objects()[1];
    expect(second.x - first.x).toBeCloseTo(16);
    expect(second.y - first.y).toBeCloseTo(16);
  });

  it("pastes plain text as a text object and a lone URL as a link card", () => {
    const t = setup();
    clip("paste", { "text/plain": "hello world" });
    clip("paste", { "text/plain": "https://example.com/a" });
    const [a, b] = t.objects();
    expect(a.type).toBe("text");
    expect(b.type).toBe("link");
    expect(t.toasts).toHaveLength(0);
  });

  it("a lone YouTube URL becomes an embed and is selected", () => {
    const t = setup();
    clip("paste", { "text/plain": "https://youtu.be/dQw4w9WgXcQ?t=5" });
    const [o] = t.objects();
    expect(o).toMatchObject({ type: "embed", provider: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5" });
    expect([...t.selection.ids]).toEqual([o.id]);
  });

  it("a lone URL becomes a link card that fetches its preview through the given deps", async () => {
    const deps: LinkCardDeps = {
      fetchPreview: vi.fn(async () => ({ title: "T", description: "D", siteName: "S", imageUrl: null, faviconUrl: null, finalUrl: "https://example.com/a" })),
      fetchImage: vi.fn(),
      uploader: { addAssetOnly: vi.fn() },
      online: () => true,
    };
    const t = setup([], undefined, deps);
    clip("paste", { "text/plain": "https://example.com/a" });
    const [o] = t.objects();
    expect(o.type).toBe("link");
    await previewSettled(t.doc, o.id);
    expect(t.doc.get(o.id)).toMatchObject({ title: "T", status: "ready" });
    expect(deps.fetchPreview).toHaveBeenCalledWith("https://example.com/a");
  });

  it("a URL inside prose stays text", () => {
    const t = setup();
    clip("paste", { "text/plain": "see https://example.com/a for more" });
    expect(t.objects().map((o) => o.type)).toEqual(["text"]);
  });

  it("Mod+Shift+V pastes the URL as text with a link mark (even for an embeddable URL)", () => {
    const t = setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true }));
    clip("paste", { "text/plain": "https://youtu.be/dQw4w9WgXcQ" });
    const [o] = t.objects();
    expect(o.type).toBe("text");
    expect(richContentToJSON(t.doc.content(o.id)!).content![0].content![0].marks).toEqual([{ type: "link", attrs: { href: "https://youtu.be/dQw4w9WgXcQ" } }]);
    // the next plain paste is routed normally again
    clip("paste", { "text/plain": "https://youtu.be/dQw4w9WgXcQ" });
    expect(t.objects()[1].type).toBe("embed");
  });

  it("pasteAsText() reads the clipboard text and pastes it as text", async () => {
    const t = setup();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { readText: async () => "https://example.com/a" } });
    await act(async () => {
      await t.hook.result.current.pasteAsText();
    });
    expect(t.objects().map((o) => o.type)).toEqual(["text"]);
    vi.unstubAllGlobals();
  });

  it("an empty clipboard is a no-op", () => {
    const t = setup();
    const { e } = clip("paste");
    expect(t.objects()).toHaveLength(0);
    expect(t.toasts).toHaveLength(0);
    expect(() => e).not.toThrow();
  });

  it("a malformed Atelier payload becomes text and never throws", () => {
    const t = setup();
    clip("paste", { "text/html": "<!-- atelier:v1 @@@not-base64@@@ --><p>fallback words</p>" });
    expect(t.objects()).toHaveLength(1);
    expect(t.objects()[0].type).toBe("text");
  });

  it("hands images to the uploader in a grid, in order, around the paste point", () => {
    const t = setup();
    t.move(800, 600);
    const files = [file("1.png", "image/png"), file("2.png", "image/png"), file("3.png", "image/png")];
    clip("paste", {}, files);
    expect(t.add.mock.calls.map((c) => (c[0] as File).name)).toEqual(["1.png", "2.png", "3.png"]);
    const xs = t.add.mock.calls.map((c) => c[1].x);
    expect(xs[1] - xs[0]).toBe(336);
    expect((xs[0] + xs[2]) / 2).toBeCloseTo(800);
  });

  it("a 60 MB image shows a toast naming the file and inserts nothing", () => {
    const t = setup();
    clip("paste", {}, [file("huge-photo.jpg", "image/jpeg", 60 * 1024 * 1024)]);
    expect(t.add).not.toHaveBeenCalled();
    expect(t.objects()).toHaveLength(0);
    expect(t.toasts).toHaveLength(1);
    expect(t.toasts[0].message).toMatch(/^Couldn't add huge-photo\.jpg: too large/);
  });

  it("an undecodable image (HEIC) shows a toast naming the file", async () => {
    const t = setup([], async () => {
      throw new ImageError("unsupported", "unsupported format (image/heic); this browser can't read it");
    });
    clip("paste", {}, [file("IMG_0001.HEIC", "image/heic")]);
    await vi.waitFor(() => expect(t.toasts).toHaveLength(1));
    expect(t.toasts[0].message).toBe("Couldn't add IMG_0001.HEIC: unsupported format (image/heic); this browser can't read it");
    expect(t.objects()).toHaveLength(0);
  });

  it("a non-image file shows a toast and the good ones still go in", async () => {
    const t = setup();
    clip("paste", {}, [file("notes.pdf", "application/pdf"), file("ok.png", "image/png")]);
    expect(t.toasts[0].message).toBe("Couldn't add notes.pdf: only images can be added");
    expect(t.add).toHaveBeenCalledTimes(1);
  });

  it("500 lines paste as one text object and offer to split into stickies", () => {
    const t = setup();
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    clip("paste", { "text/plain": lines.join("\n") });
    expect(t.objects()).toHaveLength(1);
    expect(t.objects()[0].type).toBe("text");
    expect(t.toasts).toHaveLength(1);
    expect(t.toasts[0].action?.label).toBe("Split into 500 stickies?");
  });

  it("the split action creates 500 stickies in a grid (one undo step back to the text)", () => {
    const t = setup();
    t.move(1000, 1000);
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    clip("paste", { "text/plain": lines.join("\n") });
    t.toasts[0].action!.run();
    const all = t.objects();
    expect(all).toHaveLength(500);
    expect(all.every((o) => o.type === "sticky")).toBe(true);
    const xs = new Set(all.map((o) => Math.round(o.x)));
    const ys = new Set(all.map((o) => Math.round(o.y)));
    expect(xs.size * ys.size).toBeGreaterThanOrEqual(500);
    expect(xs.size).toBeGreaterThan(5);
    expect(t.selection.size).toBe(500);
    const text = t.doc.content(all[0].id)?.toString() ?? "";
    expect(text).toContain("line 1");
    t.doc.undo();
    expect(t.objects()).toHaveLength(1);
    expect(t.objects()[0].type).toBe("text");
  });

  it("a short list offers the split too; a two-line paragraph does not", () => {
    const t = setup();
    clip("paste", { "text/plain": "alpha\nbeta\ngamma\ndelta" });
    expect(t.toasts[0]?.action?.label).toBe("Split into 4 stickies?");
    const u = setup();
    clip("paste", { "text/plain": `${"word ".repeat(60)}\nsecond line` });
    expect(u.toasts).toHaveLength(0);
  });

  it("the command-palette / context-menu Paste reads the async clipboard", async () => {
    const t = setup();
    const read = vi.fn(async () => [
      {
        types: ["text/plain"],
        getType: async () => new Blob(["from the menu"], { type: "text/plain" }),
      },
    ]);
    Object.defineProperty(navigator, "clipboard", { value: { read }, configurable: true });
    await act(async () => {
      await t.hook.result.current.paste();
    });
    expect(read).toHaveBeenCalled();
    expect(t.objects()).toHaveLength(1);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  it("the menu Paste explains itself when the clipboard cannot be read", async () => {
    const t = setup();
    Object.defineProperty(navigator, "clipboard", { value: { read: vi.fn(async () => Promise.reject(new Error("denied"))) }, configurable: true });
    await act(async () => {
      await t.hook.result.current.paste();
    });
    expect(t.toasts[0].message).toMatch(/Ctrl\+V|⌘V/);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  it("registers copy/cut/paste commands that work through ctx.clipboard", () => {
    for (const id of ["edit.copy", "edit.cut", "edit.paste"]) expect(registry.get(id).native).toBe(true);
  });

  it("removes its listeners on unmount", () => {
    const t = setup([shape("a", 0, 0)]);
    t.selection.set(["a"]);
    t.hook.unmount();
    const { e } = clip("copy");
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("drop", () => {
  function drop(container: HTMLElement, init: { x: number; y: number; files?: File[]; data?: Record<string, string> }) {
    const e = new MouseEvent("drop", { clientX: init.x, clientY: init.y, bubbles: true, cancelable: true });
    Object.defineProperty(e, "dataTransfer", {
      value: {
        files: init.files ?? [],
        types: [...(init.files?.length ? ["Files"] : []), ...Object.keys(init.data ?? {})],
        getData: (t: string) => init.data?.[t] ?? "",
        dropEffect: "none",
      },
    });
    container.dispatchEvent(e);
    return e;
  }

  it("drops files, URLs and text at the drop point", () => {
    const t = setup();
    const pasteInput = vi.fn();
    renderHook(() => useDropFiles(t.handle, pasteInput));
    const e = drop(t.container, { x: 120, y: 340, files: [file("a.png", "image/png")] });
    expect(e.defaultPrevented).toBe(true);
    expect(pasteInput).toHaveBeenCalledTimes(1);
    expect(pasteInput.mock.calls[0][1]).toEqual({ x: 120, y: 340 });
    expect(pasteInput.mock.calls[0][0].files).toHaveLength(1);

    drop(t.container, { x: 10, y: 20, data: { "text/uri-list": "https://example.com", "text/plain": "https://example.com" } });
    expect(pasteInput.mock.calls[1][0]).toMatchObject({ text: "https://example.com" });
  });

  it("only accepts drags that carry something usable, and marks the canvas while dragging", () => {
    const t = setup();
    renderHook(() => useDropFiles(t.handle, vi.fn()));
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: { types: ["Files"], dropEffect: "none" } });
    t.container.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(t.container.dataset.dropActive).toBe("true");
    const nope = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(nope, "dataTransfer", { value: { types: ["application/x-nothing"], dropEffect: "none" } });
    t.container.dispatchEvent(nope);
    expect(nope.defaultPrevented).toBe(false);
    t.container.dispatchEvent(new Event("dragleave", { bubbles: true }));
    expect(t.container.dataset.dropActive).toBeUndefined();
  });
});

describe("pasting a picture copied from a web page", () => {
  it("hands its source link to the uploader", () => {
    const t = setup();
    const file = new File([new Uint8Array(8)], "a.png", { type: "image/png" });
    clip("paste", { "text/html": '<img src="https://images.example.com/a.jpg">' }, [file]);
    expect(t.add).toHaveBeenCalledTimes(1);
    expect(t.add.mock.calls[0][2]).toMatchObject({ sourceUrl: "https://images.example.com/a.jpg", credit: "", licence: "" });
  });

  it("a plain file paste calls the uploader with just the file and the point", () => {
    const t = setup();
    clip("paste", {}, [new File([new Uint8Array(8)], "a.png", { type: "image/png" })]);
    expect(t.add.mock.calls[0]).toHaveLength(2);
  });
});
