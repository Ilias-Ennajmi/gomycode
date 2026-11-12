import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { RestoreDialog } from "@/components/rounds/RestoreDialog";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import type { RoundsClient } from "@/lib/engine/rounds/client";

const shape = (id: string, over: Record<string, unknown> = {}) => ({ ...defaultsFor("shape"), id, ...over }) as unknown as NewObject;

function published(): BoardDoc {
  const d = new BoardDoc();
  d.create(shape("a", { x: 10 }));
  d.create(shape("b", { x: 20 }));
  d.meta.title = "Brand";
  return d;
}
const snapshot = Y.encodeStateAsUpdate(published().ydoc);

/** The board as it is now: a moved, b gone, c new. */
function current(): BoardDoc {
  const d = docFromState(snapshot);
  d.update("a", { x: 500 });
  d.remove(["b"]);
  d.create(shape("c"));
  d.stopCapturing();
  return d;
}

const calls: string[] = [];
function client(over: Partial<RoundsClient> = {}): RoundsClient {
  return {
    listRounds: async () => [],
    listHistory: async () => [],
    fetchSnapshot: async () => (calls.push("fetch"), snapshot),
    createSnapshot: async () => (calls.push("safety"), "snap"),
    prepare: async () => ({ previewToken: "t", uploads: {} }),
    create: async () => { throw new Error("unused"); },
    ...over,
  };
}
const toast = vi.fn();
const navigate = vi.fn();
const version = { snapshotId: "s2", label: "Round 2" };

function mount(doc: BoardDoc, c: RoundsClient, extra: Partial<Parameters<typeof RestoreDialog>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <RestoreDialog boardId="b1" doc={doc} version={version} client={c} sync={{ flush: async () => void calls.push("flush") }} toast={toast} navigate={navigate} onClose={onClose} {...extra} />,
  );
  return { onClose, ...utils };
}

beforeEach(() => {
  calls.length = 0;
  toast.mockClear();
  navigate.mockClear();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("RestoreDialog", () => {
  it("asks plainly, naming the version and promising a safety copy and undo", () => {
    mount(current(), client());
    const dialog = screen.getByRole("dialog", { name: /restore round 2/i });
    expect(dialog).toHaveTextContent("Restore Round 2 into this board? We save the current state first and you can undo.");
    expect(screen.getByRole("button", { name: /restore into this board/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open as copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("saves the current state first (sync, then a server snapshot), then restores as one undoable step", async () => {
    const doc = current();
    const { onClose } = mount(doc, client());
    fireEvent.click(screen.getByRole("button", { name: /restore into this board/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(["fetch", "flush", "safety"]);
    expect(doc.get("a")!.x).toBe(10);
    expect(doc.get("b")).toBeDefined();
    expect(doc.get("c")).toBeUndefined();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Restored Round 2"), action: expect.objectContaining({ label: "Undo" }) }));
    // Undo is one step back to the state before restoring
    toast.mock.calls[0][0].action.run();
    expect(doc.get("a")!.x).toBe(500);
    expect(doc.get("c")).toBeDefined();
    expect(doc.get("b")).toBeUndefined();
  });

  it("offline: restores without the server safety copy, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const doc = current();
    const { onClose } = mount(doc, client({ fetchSnapshot: async () => snapshot }));
    fireEvent.click(screen.getByRole("button", { name: /restore into this board/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).not.toContain("safety");
    expect(doc.get("a")!.x).toBe(10);
    expect(toast.mock.calls[0][0].message).toMatch(/offline/i);
    expect(toast.mock.calls[0][0].message).toMatch(/undo/i);
  });

  it("when the server safety copy fails, stops and offers Restore anyway (undo still works on this device)", async () => {
    const doc = current();
    const { onClose } = mount(doc, client({ createSnapshot: async () => { throw new Error("500"); } }));
    fireEvent.click(screen.getByRole("button", { name: /restore into this board/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/safety copy/i);
    expect(doc.get("a")!.x).toBe(500); // nothing changed yet
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /restore anyway/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(doc.get("a")!.x).toBe(10);
  });

  it("when the version cannot be loaded, changes nothing and says so", async () => {
    const doc = current();
    const { onClose } = mount(doc, client({ fetchSnapshot: async () => { throw new Error("404"); } }));
    fireEvent.click(screen.getByRole("button", { name: /restore into this board/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t load/i);
    expect(doc.get("a")!.x).toBe(500);
    expect(calls).not.toContain("safety");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a damaged version is reported and changes nothing", async () => {
    const doc = current();
    mount(doc, client({ fetchSnapshot: async () => new Uint8Array([255, 255, 255, 255, 255]) }));
    fireEvent.click(screen.getByRole("button", { name: /restore into this board/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t|damaged/i);
    expect(doc.get("a")!.x).toBe(500);
  });

  it("Cancel closes without touching anything", () => {
    const doc = current();
    const { onClose } = mount(doc, client());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(doc.get("a")!.x).toBe(500);
  });

  it("Open as copy makes a NEW board from the version and offers to open it; this board is untouched", async () => {
    const doc = current();
    const target = new BoardDoc();
    const copyDeps = {
      createBoard: vi.fn(async () => "new-board"),
      openDoc: vi.fn(async () => target),
    };
    const { onClose } = mount(doc, client(), { copyDeps });
    fireEvent.click(screen.getByRole("button", { name: /open as copy/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(copyDeps.createBoard).toHaveBeenCalledWith("Brand · Round 2");
    expect(target.get("a")!.x).toBe(10);
    expect(target.meta.title).toBe("Brand · Round 2");
    expect(doc.get("a")!.x).toBe(500);
    expect(calls).not.toContain("safety"); // nothing of this board is replaced, so no safety copy
    toast.mock.calls[0][0].action.run();
    expect(navigate).toHaveBeenCalledWith("/b/new-board");
  });

  it("Open as copy failing shows the reason and keeps the dialog", async () => {
    const copyDeps = { createBoard: async () => { throw new Error("you may be offline"); }, openDoc: async () => new BoardDoc() };
    const { onClose } = mount(current(), client(), { copyDeps });
    fireEvent.click(screen.getByRole("button", { name: /open as copy/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/copy/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the buttons while working", async () => {
    let release!: (b: Uint8Array) => void;
    const slow = new Promise<Uint8Array>((r) => (release = r));
    mount(current(), client({ fetchSnapshot: () => slow }));
    fireEvent.click(screen.getByRole("button", { name: /restore into this board/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /restoring/i })).toBeDisabled());
    expect(screen.getByRole("button", { name: /open as copy/i })).toBeDisabled();
    await act(async () => release(snapshot));
  });
});
