import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { ExportDialog } from "@/components/export/ExportDialog";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { ExportCancelled } from "@/lib/engine/export/protocol";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const assets = new AssetResolverImpl({ publicHost: "img.example.com", meta: new AssetMetaStore({ persist: false }) });
const summary = { failedAssets: [] as string[], substitutedFonts: [] as string[], warnings: [] as string[] };

function board(w = 400, h = 300) {
  const doc = new BoardDoc();
  doc.meta.title = "Spring";
  doc.create({ ...defaultsFor("shape"), x: 0, y: 0, w, h, fill: "#ff0000" } as unknown as NewObject);
  return doc;
}

function fakeManager() {
  const calls: { kind: string; payload: { options?: { scale: number; format: string; transparent: boolean } } }[] = [];
  let finish!: (v: { blob: Blob; summary: typeof summary }) => void;
  let fail!: (e: Error) => void;
  let progress: (r: number, l: string) => void = () => {};
  const cancel = vi.fn(() => fail(new ExportCancelled()));
  return {
    calls,
    cancel,
    done: (s = summary) => finish({ blob: new Blob(["x"]), summary: s }),
    progress: (r: number, l: string) => progress(r, l),
    manager: {
      run(kind: string, payload: unknown, onProgress: (r: number, l: string) => void) {
        calls.push({ kind, payload: payload as never });
        progress = onProgress;
        const promise = new Promise<{ blob: Blob; summary: typeof summary }>((res, rej) => {
          finish = res;
          fail = rej;
        });
        return { promise, cancel };
      },
    },
  };
}

const toast = vi.fn();
const mount = (doc: BoardDoc, m: ReturnType<typeof fakeManager>, extra: Partial<Parameters<typeof ExportDialog>[0]> = {}) =>
  render(<ExportDialog doc={doc} selectionIds={new Set()} assets={assets} toast={toast} manager={m.manager} onClose={() => {}} {...extra} />);

beforeEach(() => {
  toast.mockClear();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("ExportDialog", () => {
  it("shows the output size and says when it is reduced", async () => {
    const m = fakeManager();
    mount(board(30000, 20000), m);
    fireEvent.click(screen.getByRole("radio", { name: "4×" }));
    const note = await screen.findByText(/Reduced to 16,384 px wide/);
    expect(note).toBeInTheDocument();
    expect(screen.getByText(/Output: 16,384 × /)).toBeInTheDocument();
  });

  it("disables a transparent background for JPG and re-enables it for PNG", () => {
    const m = fakeManager();
    mount(board(), m);
    fireEvent.click(screen.getByRole("radio", { name: "JPG" }));
    expect(screen.getByRole("checkbox", { name: /Transparent background/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "PNG" }));
    expect(screen.getByRole("checkbox", { name: /Transparent background/ })).toBeEnabled();
  });

  it("offers the selection only when something is selected, and frames by name", () => {
    const doc = board();
    doc.create({ ...defaultsFor("frame"), name: "Hero slide", x: 1000, y: 0 } as unknown as NewObject);
    const m = fakeManager();
    const { unmount } = mount(doc, m);
    expect(screen.getByRole("radio", { name: "Selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Frame" }));
    expect(within(screen.getByRole("combobox", { name: "Frame" })).getByRole("option", { name: "Hero slide" })).toBeInTheDocument();
    unmount();
    mount(doc, m, { selectionIds: new Set([doc.all()[0].id]) });
    expect(screen.getByRole("radio", { name: "Selection" })).toBeChecked();
  });

  it("runs the export, shows a labelled progress bar with Cancel, then downloads and summarises", async () => {
    const m = fakeManager();
    mount(board(), m);
    fireEvent.click(screen.getByRole("radio", { name: "2×" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].kind).toBe("raster");
    expect(m.calls[0].payload.options).toMatchObject({ scale: 2, format: "png" });
    act(() => m.progress(0.5, "Drawing 5 of 10"));
    const bar = await screen.findByRole("progressbar", { name: "Export progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Drawing 5 of 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel export" })).toBeInTheDocument();
    await act(async () => m.done({ failedAssets: ["a", "b"], substitutedFonts: ["Space Grotesk"], warnings: ["Careful"] }));
    const sum = await screen.findByText(/Saved Spring@2x\.png/);
    expect(sum).toBeInTheDocument();
    expect(screen.getByText(/2 images could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/Space Grotesk/)).toBeInTheDocument();
    expect(screen.getByText("Careful")).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Exported Spring@2x.png") }));
  });

  it("cancel stops the job, returns to the form and says so", async () => {
    const m = fakeManager();
    mount(board(), m);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel export" }));
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(m.cancel).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Export cancelled" }));
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("shows a failure as an alert and a toast", async () => {
    const m = fakeManager();
    m.manager.run = () => ({ promise: Promise.reject(new Error("Worker died")), cancel() {} }) as never;
    mount(board(), m);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Worker died");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Worker died" }));
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("is empty-aware: nothing to export disables the button", () => {
    const m = fakeManager();
    mount(new BoardDoc(), m);
    expect(screen.getByText(/nothing to export/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("is a labelled modal dialog", () => {
    const m = fakeManager();
    mount(board(), m);
    expect(screen.getByRole("dialog", { name: "Export" })).toBeInTheDocument();
  });
});
