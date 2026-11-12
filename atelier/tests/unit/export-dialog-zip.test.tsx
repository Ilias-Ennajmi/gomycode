import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAssetMetaStore } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { ExportDialog } from "@/components/export/ExportDialog";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const meta = getAssetMetaStore();
const assets = new AssetResolverImpl({ publicHost: "img.example.com", meta });
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const putMeta = (id: string, bytes: number, title = "") =>
  meta.put({ id, kind: "image", width: 100, height: 100, bytes, variants: ["w1024"], palette: null, phash: null, title, provenance: { sourceUrl: null, credit: "Jane", licence: "CC BY", capturedAt: null }, analysisVersion: 1 });

function board(withFrame = false) {
  const doc = new BoardDoc();
  doc.meta.title = "Spring";
  doc.create({ ...defaultsFor("image"), assetId: A, title: "Sunset", x: 0, y: 0, w: 100, h: 100 } as unknown as NewObject);
  doc.create({ ...defaultsFor("image"), assetId: B, title: "Harbour", x: 200, y: 0, w: 100, h: 100 } as unknown as NewObject);
  if (withFrame) doc.create({ ...defaultsFor("frame"), name: "Intro", order: "a0", x: 0, y: 500 } as unknown as NewObject);
  return doc;
}

// jsdom's Blob has no arrayBuffer(); the fake answers with Node's, which the ZIP code can read.
const okFetch = (async (url: string) => {
  const missing = String(url).includes(B);
  return { ok: !missing, status: missing ? 404 : 200, headers: new Headers(), blob: async () => new NodeBlob([png], { type: "image/png" }) } as unknown as Response;
}) as unknown as typeof fetch;
const toast = vi.fn();
const noManager = { run: () => { throw new Error("no worker in this test"); } };
const mount = (doc: BoardDoc, zip: Parameters<typeof ExportDialog>[0]["zip"] = { fetchFn: okFetch }, extra: Partial<Parameters<typeof ExportDialog>[0]> = {}) =>
  render(<ExportDialog doc={doc} selectionIds={new Set()} assets={assets} toast={toast} manager={noManager} zip={zip} preset={{ format: "zip" }} onClose={() => {}} {...extra} />);

beforeEach(() => {
  toast.mockClear();
  putMeta(A, 1000, "Sunset");
  putMeta(B, 2000, "Harbour");
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("ExportDialog: ZIP", () => {
  it("offers ZIP, describes what it holds, and has no scope or size options", () => {
    mount(board(true));
    expect(screen.getByRole("radio", { name: "ZIP" })).toBeChecked();
    expect(screen.getByText("ZIP (originals + credits + palettes)")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Credits sheet/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Palette files/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Frame images/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Frame" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "2×" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Transparent/ })).toBeNull();
    expect(screen.getByText(/2 pictures and videos/)).toBeInTheDocument();
    expect(screen.getByText(/1 frame/)).toBeInTheDocument();
  });

  it("does not offer frame images on a board without frames", () => {
    mount(board(false));
    expect(screen.queryByRole("checkbox", { name: /Frame images/ })).toBeNull();
  });

  it("is chosen from the format row too", () => {
    mount(board(), undefined, { preset: undefined });
    fireEvent.click(screen.getByRole("radio", { name: "ZIP" }));
    expect(screen.getByText("ZIP (originals + credits + palettes)")).toBeInTheDocument();
  });

  it("downloads the ZIP and says what was left out", async () => {
    mount(board());
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText(/Saved Spring\.zip/)).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(screen.getByText(/1 file could not be downloaded and was left out/)).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Exported Spring.zip") }));
  });

  it("a custom file name is used", async () => {
    mount(board());
    fireEvent.change(screen.getByLabelText("File name"), { target: { value: "Client pack" } });
    expect(screen.getByText(".zip")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText(/Saved Client pack\.zip/)).toBeInTheDocument();
  });

  it("asks before building a very large ZIP in memory, and starts nothing until told to", async () => {
    putMeta(A, 600 * 1024 * 1024);
    const fetchFn = vi.fn(okFetch);
    mount(board(), { fetchFn: fetchFn as never });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText(/built in memory first/)).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Saved Spring\.zip/)).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalled();
  });

  it("changing an option withdraws the question", async () => {
    putMeta(A, 600 * 1024 * 1024);
    mount(board());
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await screen.findByText(/built in memory first/);
    fireEvent.click(screen.getByRole("checkbox", { name: /Credits sheet/ }));
    expect(screen.queryByText(/built in memory first/)).toBeNull();
  });

  it("refuses what a browser cannot hold, in words, and disables Export", () => {
    putMeta(A, 3 * 1024 * 1024 * 1024);
    mount(board());
    expect(screen.getByRole("alert")).toHaveTextContent(/too large for one ZIP|more than this browser can build/);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("with a file picker, a big ZIP is streamed to the chosen file: no Blob, no download", async () => {
    putMeta(A, 200 * 1024 * 1024);
    const chunks: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
    const pick = vi.fn(async () => sink);
    mount(board(), { fetchFn: okFetch, pickSaveFile: pick });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText(/Saved Spring\.zip/)).toBeInTheDocument();
    expect(pick).toHaveBeenCalledWith("Spring.zip");
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
    expect(screen.getByText(/to the file you chose/)).toBeInTheDocument();
  });

  it("with a file picker a big ZIP over the memory limit is allowed (it never sits in memory)", () => {
    putMeta(A, 2 * 1024 * 1024 * 1024);
    mount(board(), { fetchFn: okFetch, pickSaveFile: async () => null });
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("closing the file picker without choosing goes back quietly", async () => {
    putMeta(A, 200 * 1024 * 1024);
    mount(board(), { fetchFn: okFetch, pickSaveFile: async () => { throw new DOMException("closed", "AbortError"); } });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Export" })).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("Cancel stops it, says so and leaves nothing: no download", async () => {
    mount(board(), { fetchFn: (() => new Promise(() => {})) as never });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel export" }));
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Export cancelled" }));
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("the progress bar shows while it runs", async () => {
    mount(board(), { fetchFn: (() => new Promise(() => {})) as never });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("progressbar", { name: "Export progress" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
  });
});
