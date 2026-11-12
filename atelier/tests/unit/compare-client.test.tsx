import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CompareClient } from "@/components/rounds/CompareClient";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { RoundsRequestError, type HistoryVersion, type RoundsClient } from "@/lib/engine/rounds/client";

const noAssets = { url: () => null, available: () => null } as never;
const state = (...ids: string[]) => {
  const d = new BoardDoc();
  for (const id of ids) d.create({ ...defaultsFor("shape"), id } as unknown as NewObject);
  return Y.encodeStateAsUpdate(d.ydoc);
};
const version = (over: Partial<HistoryVersion>): HistoryVersion => ({ id: "s", kind: "round", label: null, roundNumber: null, createdAt: "2026-11-10T09:30:00Z", uptoSeq: 1, ...over });

function client(over: Partial<RoundsClient> = {}): RoundsClient {
  return {
    listRounds: async () => [],
    listHistory: async () => [version({ id: "snapA", label: "Direction A", roundNumber: 2 }), version({ id: "snapB", kind: "compaction", label: null })],
    fetchSnapshot: async (_b, sid) => (sid === "snapA" ? state("x", "y") : state("x")),
    createSnapshot: async () => "x",
    prepare: async () => ({ previewToken: "t", uploads: {} }),
    create: async () => { throw new Error("unused"); },
    ...over,
  };
}

beforeEach(() => {
  class RO {
    constructor(private cb: () => void) {}
    observe() {
      queueMicrotask(this.cb);
    }
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const props = { boardId: "b1", assets: noAssets, onClose: () => {} };

describe("CompareClient", () => {
  it("loads two snapshots, labels them from the history, and shows the comparison", async () => {
    render(<CompareClient {...props} a="snapA" b="snapB" client={client()} loadCurrent={async () => null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByRole("region", { name: /compare/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Round 2 · Direction A/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("compare-summary")).toHaveTextContent(/1 removed/); // y is in A only; B is "later"
  });

  it("b=current compares with this device's copy of the board", async () => {
    const loadCurrent = vi.fn(async () => state("x", "y", "z"));
    render(<CompareClient {...props} a="snapA" b="current" client={client()} loadCurrent={loadCurrent} />);
    await screen.findByTestId("compare-summary");
    expect(loadCurrent).toHaveBeenCalledWith("b1");
    expect(screen.getAllByText(/Current board/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("compare-summary")).toHaveTextContent(/1 added/);
  });

  it("has no copy of the board on this device: says so", async () => {
    render(<CompareClient {...props} a="snapA" b="current" client={client()} loadCurrent={async () => null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/this device has no copy/i);
  });

  it("two documents at most, both destroyed when the page closes", async () => {
    const created: BoardDoc[] = [];
    const origDestroy = BoardDoc.prototype.destroy;
    const destroyed: BoardDoc[] = [];
    vi.spyOn(BoardDoc.prototype, "destroy").mockImplementation(function (this: BoardDoc) {
      destroyed.push(this);
      return origDestroy.call(this);
    });
    const { unmount } = render(<CompareClient {...props} a="snapA" b="snapB" client={client()} loadCurrent={async () => null} onDocs={(docs) => created.push(...docs)} />);
    await screen.findByTestId("compare-summary");
    expect(created).toHaveLength(2);
    // the temporary docs used to read each state are gone already; the two on screen are still alive
    const liveBefore = created.filter((d) => !destroyed.includes(d));
    expect(liveBefore).toHaveLength(2);
    unmount();
    expect(created.every((d) => destroyed.includes(d))).toBe(true);
  });

  it("closing before the states arrive destroys nothing twice and shows nothing late", async () => {
    let release!: (v: Uint8Array) => void;
    const slow = new Promise<Uint8Array>((r) => (release = r));
    const created: BoardDoc[] = [];
    const { unmount } = render(<CompareClient {...props} a="snapA" b="snapB" client={client({ fetchSnapshot: () => slow })} loadCurrent={async () => null} onDocs={(d) => created.push(...d)} />);
    unmount();
    await act(async () => release(state("x")));
    expect(created).toEqual([]);
  });

  it.each([
    [new RoundsRequestError(503, "not-configured"), /needs the server/i],
    [new RoundsRequestError(503, "local-only"), /needs the server/i],
    [new RoundsRequestError(404, "not-found"), /could not be found/i],
    [new RoundsRequestError(401, "unauthorized"), /signed out|sign in/i],
    [new Error("boom"), /couldn.t load/i],
  ])("a failed load shows a plain message (%#)", async (error, message) => {
    render(<CompareClient {...props} a="snapA" b="snapB" client={client({ fetchSnapshot: async () => { throw error; } })} loadCurrent={async () => null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: /back to the board/i })).toBeInTheDocument();
  });

  it("refuses ids that are not snapshot ids without calling anything", async () => {
    const c = client({ fetchSnapshot: vi.fn(async () => state("x")) });
    render(<CompareClient {...props} a="../../etc/passwd" b="current" client={c} loadCurrent={async () => state("x")} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/can.t compare/i);
    expect(c.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("a state that is not a Yjs update is reported, not thrown", async () => {
    render(<CompareClient {...props} a="snapA" b="snapB" client={client({ fetchSnapshot: async () => new Uint8Array([255, 255, 255, 255]) })} loadCurrent={async () => null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t load|damaged/i);
  });

  it("Close calls onClose", async () => {
    const onClose = vi.fn();
    render(<CompareClient {...props} a="snapA" b="snapB" client={client()} loadCurrent={async () => null} onClose={onClose} />);
    await screen.findByTestId("compare-summary");
    fireEvent.click(screen.getByRole("button", { name: /close compare/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
