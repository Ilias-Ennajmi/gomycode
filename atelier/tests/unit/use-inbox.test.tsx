import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { InboxClient, InboxApiError, type InboxApi } from "@/lib/inbox/inbox-client";
import { useInbox } from "@/components/editor/useInbox";
import type { InboxItem } from "@/lib/inbox/types";

const row = (over: Partial<InboxItem>): InboxItem => ({ id: "srv-1", kind: "text", assetId: null, url: null, text: "a note", title: null, sourceUrl: null, credit: null, createdAt: "2026-11-12T09:00:00.000Z", placedAt: null, ...over });

function setup(rows: InboxItem[]) {
  const api: InboxApi = {
    create: vi.fn(async () => ({ id: "x" })),
    list: vi.fn(async () => ({ items: rows.filter((r) => !r.placedAt), unplaced: rows.filter((r) => !r.placedAt).length })),
    setPlaced: vi.fn(async (id, placed) => {
      const r = rows.find((x) => x.id === id);
      if (!r) throw new InboxApiError(404, "nf", "nf");
      r.placedAt = placed ? "2026-11-12T10:00:00.000Z" : null;
    }),
    remove: vi.fn(async () => {}),
  };
  const client = new InboxClient({ api, idb: new IDBFactory(), delay: () => new Promise(() => {}) });
  const doc = new BoardDoc();
  const selection = new SelectionStore();
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON() {} });
  const handle = { doc, selection, container: () => container, getCamera: () => ({ x: 0, y: 0, z: 1 }), viewport: () => ({ w: 1000, h: 600 }) } as never;
  const toast = vi.fn();
  const openPanel = vi.fn();
  return { client, doc, selection, container, handle, toast, openPanel, rows };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/b/board-1");
});

describe("useInbox (the editor's side of the Inbox)", () => {
  it("is null without a client", () => {
    const s = setup([]);
    const { result } = renderHook(() => useInbox({ handle: s.handle, client: undefined, linkDeps: null, toast: s.toast, openPanel: s.openPanel }));
    expect(result.current.state).toBeNull();
  });

  it("places an item at the middle of the view, selects it, marks it placed, and offers Undo", async () => {
    const s = setup([row({})]);
    const { result } = renderHook(() => useInbox({ handle: s.handle, client: s.client, linkDeps: null, toast: s.toast, openPanel: s.openPanel }));
    const [item] = await s.client.list();
    let ids: string[] = [];
    act(() => {
      ids = result.current.state!.place(item);
    });
    expect(ids).toHaveLength(1);
    expect(s.doc.get(ids[0])).toMatchObject({ type: "text", x: expect.any(Number) });
    expect([...s.selection.ids]).toEqual(ids);
    await vi.waitFor(() => expect(s.rows[0].placedAt).not.toBeNull());
    const call = s.toast.mock.calls.at(-1)![0];
    expect(call.message).toBe("Placed on the board.");
    act(() => call.action.run());
    expect(s.doc.all()).toHaveLength(0);
    await vi.waitFor(() => expect(s.rows[0].placedAt).toBeNull());
  });

  it("places the item at the drop point when an inbox item is dropped on the canvas", async () => {
    const s = setup([row({})]);
    const { result } = renderHook(() => useInbox({ handle: s.handle, client: s.client, linkDeps: null, toast: s.toast, openPanel: s.openPanel }));
    await s.client.list();
    void result;
    const dt = { types: ["application/x-atelier-inbox"], getData: (t: string) => (t === "application/x-atelier-inbox" ? "srv-1" : ""), dropEffect: "" };
    const over = new Event("dragover", { cancelable: true, bubbles: true }) as Event & { dataTransfer?: unknown };
    over.dataTransfer = dt;
    s.container.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true); // the canvas accepts the drop
    const drop = new Event("drop", { cancelable: true, bubbles: true }) as Event & { dataTransfer?: unknown; clientX?: number; clientY?: number };
    Object.assign(drop, { dataTransfer: dt, clientX: 400, clientY: 300 });
    act(() => void s.container.dispatchEvent(drop));
    expect(s.doc.all()).toHaveLength(1);
    const o = s.doc.all()[0];
    expect(o.x + o.w / 2).toBeCloseTo(400, 0);
    expect(o.y + o.h / 2).toBeCloseTo(300, 0);
  });

  it("ignores a drag that does not carry an inbox item, and a drop of an item it does not know", async () => {
    const s = setup([row({})]);
    renderHook(() => useInbox({ handle: s.handle, client: s.client, linkDeps: null, toast: s.toast, openPanel: s.openPanel }));
    const over = new Event("dragover", { cancelable: true, bubbles: true }) as Event & { dataTransfer?: unknown };
    over.dataTransfer = { types: ["Files"], getData: () => "" };
    s.container.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    const drop = new Event("drop", { cancelable: true, bubbles: true }) as Event & { dataTransfer?: unknown };
    drop.dataTransfer = { types: ["application/x-atelier-inbox"], getData: () => "nope" };
    s.container.dispatchEvent(drop);
    expect(s.doc.all()).toHaveLength(0);
  });

  it("opens the Inbox panel when the board address says ?inbox=1, once, and clears it", () => {
    window.history.replaceState(null, "", "/b/board-1?inbox=1");
    const s = setup([]);
    const { rerender } = renderHook(() => useInbox({ handle: s.handle, client: s.client, linkDeps: null, toast: s.toast, openPanel: s.openPanel }));
    rerender();
    expect(s.openPanel).toHaveBeenCalledTimes(1);
    expect(s.openPanel).toHaveBeenCalledWith("inbox");
    expect(window.location.search).toBe("");
  });

  it("tracks the Quick capture dialog", () => {
    const s = setup([]);
    const { result } = renderHook(() => useInbox({ handle: s.handle, client: s.client, linkDeps: null, toast: s.toast, openPanel: s.openPanel }));
    expect(result.current.captureOpen).toBe(false);
    act(() => result.current.openCapture());
    expect(result.current.captureOpen).toBe(true);
    act(() => result.current.closeCapture());
    expect(result.current.captureOpen).toBe(false);
  });
});
