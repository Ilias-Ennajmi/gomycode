import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/panels/CommandPalette";
import { useEditor } from "@/components/editor/EditorContext";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { putBoard } from "@/lib/sync/board-list-cache";
import { makeEditor, obj } from "./helpers/editor";

// jsdom has no <dialog> modal support
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function Opener() {
  const { palette } = useEditor();
  return <button onClick={() => palette.setOpen(true)}>open palette</button>;
}

const sleep = (ms = 5) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function open(t: ReturnType<typeof makeEditor>) {
  t.render(
    <>
      <Opener />
      <CommandPalette />
    </>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByText("open palette"));
  return screen.findByRole("combobox", { name: "Search commands, boards and objects" });
}

const options = () => screen.queryAllByRole("option").map((o) => o.textContent ?? "");

describe("CommandPalette", () => {
  it("opens as a labelled dialog with a combobox and no animation", async () => {
    const t = makeEditor([obj("shape", "a")]);
    const input = await open(t);
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(dialog.className).not.toMatch(/transition|animate|starting:/);
    expect(document.activeElement).toBe(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filters commands fuzzily: 'dup' finds Duplicate first", async () => {
    const t = makeEditor([obj("shape", "a")]);
    t.selection.set(["a"]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "dup" } });
    expect(options()[0]).toMatch(/^Duplicate/);
    expect(options().some((o) => /^Align left/.test(o))).toBe(false);
  });

  it("only offers commands that are available now", async () => {
    const t = makeEditor([obj("shape", "a")]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "duplicate" } });
    expect(options().some((o) => /^Duplicate/.test(o))).toBe(false); // nothing selected
    t.selection.set(["a"]);
    fireEvent.change(input, { target: { value: "duplicat" } });
    expect(options().some((o) => /^Duplicate/.test(o))).toBe(true);
  });

  it("shows keyboard shortcuts next to commands", async () => {
    const t = makeEditor([obj("shape", "a")]);
    t.selection.set(["a"]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "duplicate" } });
    expect(within(screen.getAllByRole("option")[0]).getByText(/Ctrl\+D|⌘D/)).toBeInTheDocument();
  });

  it("arrow keys move the highlight (with wrap) and Enter runs the command after closing", async () => {
    const t = makeEditor([obj("shape", "a"), obj("shape", "b")]);
    t.selection.set(["a"]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "dup" } });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
    fireEvent.keyDown(input, { key: "ArrowUp" }); // wraps to the last
    const all = screen.getAllByRole("option");
    expect(all[all.length - 1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(all[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await sleep();
    expect(t.doc.all()).toHaveLength(3); // duplicated
  });

  it("clicking an option runs it", async () => {
    const t = makeEditor([obj("shape", "a")]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "select all" } });
    fireEvent.click(screen.getAllByRole("option")[0]);
    await sleep();
    expect([...t.selection.ids]).toEqual(["a"]);
  });

  it("Escape closes without running anything, and Mod+K toggles it closed", async () => {
    const t = makeEditor([obj("shape", "a")]);
    const input = await open(t);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("open palette"));
    const again = await screen.findByRole("combobox");
    fireEvent.keyDown(again, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(t.doc.all()).toHaveLength(1);
  });

  it("gives focus back to what had it before", async () => {
    const t = makeEditor([obj("shape", "a")]);
    t.render(
      <>
        <Opener />
        <CommandPalette />
      </>,
    );
    const opener = screen.getByText("open palette");
    opener.focus();
    fireEvent.click(opener);
    const input = await screen.findByRole("combobox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });

  it("finds boards from the home cache and opens them", async () => {
    await putBoard({ id: "b1", title: "Spring campaign", folderId: null, starred: false, updatedAt: "2026-01-01T00:00:00Z", lastOpenedAt: null, deletedAt: null, preview: [] });
    await putBoard({ id: "b2", title: "Old trash", folderId: null, starred: false, updatedAt: "2026-01-01T00:00:00Z", lastOpenedAt: null, deletedAt: new Date().toISOString(), preview: [] });
    const t = makeEditor([]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "spring" } });
    await waitFor(() => expect(options().some((o) => /Spring campaign/.test(o))).toBe(true));
    expect(options().some((o) => /Old trash/.test(o))).toBe(false);
    fireEvent.keyDown(input, { key: "Enter" });
    await sleep();
    expect(t.navigate).toHaveBeenCalledWith("/b/b1");
  });

  it("finds objects by their text or frame name, selects and reveals the pick", async () => {
    const t = makeEditor([
      obj("sticky", "s", { x: 5000, y: 5000 }),
      obj("frame", "f", { name: "Hero section", x: 0, y: 0, w: 400, h: 300 }),
    ]);
    t.doc.transact(() => writeRichContent(t.doc.content("s")!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Remember the budget" }] }] }));
    const input = await open(t);
    fireEvent.change(input, { target: { value: "budget" } });
    const opt = screen.getAllByRole("option").find((o) => /Remember the budget/.test(o.textContent ?? ""))!;
    expect(opt).toBeTruthy();
    fireEvent.click(opt);
    await sleep();
    expect([...t.selection.ids]).toEqual(["s"]);
    expect(t.setCamera).toHaveBeenCalled();
    expect(t.setCamera.mock.calls.at(-1)![1]).toEqual({ animate: false });
  });

  it("says when nothing matches", async () => {
    const t = makeEditor([]);
    const input = await open(t);
    fireEvent.change(input, { target: { value: "qqqqzzzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });
});
