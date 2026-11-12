import { act, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LayersPanel } from "@/components/panels/LayersPanel";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { layerName, layerRows } from "@/components/panels/layers-model";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

const frameWithKids = () =>
  makeEditor([
    obj("frame", "f", { name: "Hero", w: 800, h: 600 }),
    obj("shape", "s1", { parentId: "f", x: 10, y: 10 }),
    obj("sticky", "st", { parentId: "f", x: 300, y: 10 }),
    obj("image", "im", { x: 2000 }),
  ]);

const items = () => screen.getAllByRole("treeitem");
const names = () => items().map((i) => i.getAttribute("aria-label"));

describe("layer model", () => {
  it("lists layers top-first with a frame's children right after it, skipping collapsed ones", () => {
    const t = frameWithKids();
    const rows = layerRows(t.doc, new Set());
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["im", 0],
      ["f", 0],
      ["st", 1],
      ["s1", 1],
    ]);
    expect(layerRows(t.doc, new Set(["f"])).map((r) => r.id)).toEqual(["im", "f"]);
    expect(rows[1]).toMatchObject({ expandable: true, expanded: true, pos: 2, setSize: 2 });
  });

  it("names layers from their text, frame name or type", () => {
    const t = makeEditor([obj("sticky", "a"), obj("shape", "b", { kind: "ellipse" }), obj("frame", "c", { name: "  " }), obj("arrow", "d", { startHead: "none", endHead: "none" })]);
    t.doc.transact(() => writeRichContent(t.doc.content("a")!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Launch plan" }] }] }));
    expect(layerName(t.doc, t.doc.get("a")!)).toBe("Launch plan");
    expect(layerName(t.doc, t.doc.get("b")!)).toBe("Ellipse");
    expect(layerName(t.doc, t.doc.get("c")!)).toBe("Frame");
    expect(layerName(t.doc, t.doc.get("d")!)).toBe("Line");
  });
});

describe("LayersPanel", () => {
  it("renders the layer tree with nested frame children as a labelled tree", () => {
    const t = frameWithKids();
    t.render(<LayersPanel />);
    expect(screen.getByRole("tree", { name: "Layers" })).toBeInTheDocument();
    expect(names()).toEqual(["Image", "Hero", "Sticky note", "Rectangle"]);
    const levels = items().map((i) => i.getAttribute("aria-level"));
    expect(levels).toEqual(["1", "1", "2", "2"]);
    expect(items()[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking selects (also a locked layer); ctrl-click toggles; shift-click selects a range", () => {
    const t = frameWithKids();
    t.doc.update("s1", { locked: true });
    t.render(<LayersPanel />);
    fireEvent.click(items()[3]);
    expect([...t.selection.ids]).toEqual(["s1"]);
    fireEvent.click(items()[0], { ctrlKey: true });
    expect([...t.selection.ids].sort()).toEqual(["im", "s1"]);
    fireEvent.click(items()[0]);
    fireEvent.click(items()[2], { shiftKey: true });
    expect([...t.selection.ids].sort()).toEqual(["f", "im", "st"]);
  });

  it("mirrors the canvas selection", () => {
    const t = frameWithKids();
    t.render(<LayersPanel />);
    act(() => t.selection.set(["st"]));
    expect(items()[2]).toHaveAttribute("aria-selected", "true");
    expect(items()[0]).toHaveAttribute("aria-selected", "false");
  });

  it("Alt+ArrowUp moves the selected layer up (towards the front); Alt+ArrowDown moves it down", async () => {
    const t = makeEditor([obj("shape", "a"), obj("shape", "b"), obj("shape", "c")]);
    t.render(<LayersPanel />);
    expect(names().length).toBe(3);
    fireEvent.click(items()[2]); // "a", at the bottom
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowUp", altKey: true });
    expect(t.doc.all().map((o) => o.id)).toEqual(["b", "a", "c"]);
    await waitFor(() => expect(items().map((i) => i.id)).toEqual(["layer-c", "layer-a", "layer-b"]));
    fireEvent.keyDown(tree, { key: "ArrowDown", altKey: true });
    expect(t.doc.all().map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("has Move up / Move down buttons as the non-drag alternative", async () => {
    const t = makeEditor([obj("shape", "a"), obj("shape", "b")]);
    t.render(<LayersPanel />);
    const up = screen.getByRole("button", { name: "Move up" });
    expect(up).toBeDisabled(); // nothing selected
    fireEvent.click(items()[1]); // "a"
    expect(up).toBeEnabled();
    fireEvent.click(up);
    expect(t.doc.all().map((o) => o.id)).toEqual(["b", "a"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Move up" })).toBeDisabled()); // already on top
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(t.doc.all().map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("moves locked layers too", () => {
    const t = makeEditor([obj("shape", "a", { locked: true }), obj("shape", "b")]);
    t.render(<LayersPanel />);
    fireEvent.click(items()[1]);
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(t.doc.all().map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("arrow keys move the active layer and Enter selects it; Left and Right collapse and expand", () => {
    const t = frameWithKids();
    t.render(<LayersPanel />);
    const tree = screen.getByRole("tree");
    tree.focus();
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(tree.getAttribute("aria-activedescendant")).toBe("layer-f");
    fireEvent.keyDown(tree, { key: "Enter" });
    expect([...t.selection.ids]).toEqual(["f"]);
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(names()).toEqual(["Image", "Hero"]);
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(names()).toHaveLength(4);
    fireEvent.keyDown(tree, { key: "End" });
    expect(tree.getAttribute("aria-activedescendant")).toBe("layer-s1");
    fireEvent.keyDown(tree, { key: "Home" });
    expect(tree.getAttribute("aria-activedescendant")).toBe("layer-im");
  });

  it("the lock and hide toggles work per layer; hidden layers are tracked by the editor", async () => {
    const t = frameWithKids();
    t.render(<LayersPanel />);
    const row = items()[3];
    fireEvent.click(within(row).getByRole("button", { name: "Lock Rectangle" }));
    expect(t.doc.get("s1")!.locked).toBe(true);
    await waitFor(() => expect(within(items()[3]).getByRole("button", { name: "Unlock Rectangle" })).toBeInTheDocument());
    fireEvent.click(within(items()[3]).getByRole("button", { name: "Hide Rectangle" }));
    expect(document.querySelector("style[data-hidden-layers]")?.textContent).toContain('data-object-id="s1"');
    expect(within(items()[3]).getByRole("button", { name: "Show Rectangle" })).toBeInTheDocument();
    fireEvent.click(within(items()[3]).getByRole("button", { name: "Show Rectangle" }));
    expect(document.querySelector("style[data-hidden-layers]")?.textContent ?? "").not.toContain("s1");
    expect(t.doc.get("s1")!.locked).toBe(true);
  });

  it("renames a frame: double-click, type, Enter; Escape cancels", async () => {
    const t = frameWithKids();
    t.render(<LayersPanel />);
    fireEvent.doubleClick(screen.getByText("Hero"));
    const input = screen.getByRole("textbox", { name: "Frame name" });
    fireEvent.change(input, { target: { value: "Cover" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((t.doc.get("f") as { name: string }).name).toBe("Cover");
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() => screen.getByText("Cover"));
    fireEvent.doubleClick(screen.getByText("Cover"));
    const again = screen.getByRole("textbox", { name: "Frame name" });
    fireEvent.change(again, { target: { value: "Nope" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect((t.doc.get("f") as { name: string }).name).toBe("Cover");
  });

  it("drag and drop reorders layers and drops into a frame", async () => {
    const t = makeEditor([obj("frame", "f", { w: 500, h: 500 }), obj("shape", "a"), obj("shape", "b")]);
    t.render(<LayersPanel />);
    // rows top-first: b, a, f
    const data: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k], effectAllowed: "", dropEffect: "" };
    const rect = { top: 0, height: 32, bottom: 32, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    const target = items()[2]; // f
    target.getBoundingClientRect = () => rect;
    fireEvent.dragStart(items()[0], { dataTransfer }); // b
    const at = (type: "dragOver" | "drop", clientY: number) => {
      const ev = createEvent[type](target, { dataTransfer });
      Object.defineProperty(ev, "clientY", { value: clientY }); // jsdom has no DragEvent coordinates
      fireEvent(target, ev);
    };
    at("dragOver", 16); // middle of a frame row: into
    at("drop", 16);
    expect(t.doc.get("b")!.parentId).toBe("f");
    // dropping on the lower edge of a row puts the layer below it
    await waitFor(() => expect(items().map((i) => i.id)).toEqual(["layer-a", "layer-f", "layer-b"]));
    const f = items()[1];
    f.getBoundingClientRect = () => rect;
    fireEvent.dragStart(items()[0], { dataTransfer });
    const lower = (type: "dragOver" | "drop") => {
      const ev = createEvent[type](f, { dataTransfer });
      Object.defineProperty(ev, "clientY", { value: 30 });
      fireEvent(f, ev);
    };
    lower("dragOver");
    lower("drop");
    expect(t.doc.childrenOf(null).map((o) => o.id)).toEqual(["a", "f"]);
  });

  it("virtualises long boards: only a window of rows is in the DOM", () => {
    const many = Array.from({ length: 300 }, (_, i) => obj("shape", `s${i}`, { x: i * 10 }));
    const t = makeEditor(many);
    t.render(<LayersPanel />);
    const rendered = items();
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(80);
    expect(rendered[0]).toHaveAttribute("aria-setsize", "300");
    expect(rendered[0]).toHaveAttribute("aria-posinset", "1");
    // the newest object is the top row
    expect(rendered[0].id).toBe("layer-s299");
    const scroller = screen.getByTestId("layers-scroll");
    fireEvent.scroll(scroller, { target: { scrollTop: 32 * 150 } });
    return waitFor(() => expect(items().some((i) => i.id === "layer-s150")).toBe(true));
  });

  it("small boards render every row", () => {
    const t = makeEditor(Array.from({ length: 100 }, (_, i) => obj("shape", `s${i}`)));
    t.render(<LayersPanel />);
    expect(items()).toHaveLength(100);
  });

  it("follows document changes (new layers appear) but ignores plain moves", async () => {
    const t = makeEditor([obj("shape", "a")]);
    t.render(<LayersPanel />);
    act(() => void t.doc.create(obj("sticky", "b")));
    await waitFor(() => expect(names()).toEqual(["Sticky note", "Rectangle"]));
    act(() => t.doc.remove(["a"]));
    await waitFor(() => expect(names()).toEqual(["Sticky note"]));
  });

  it("says when the board is empty", () => {
    const t = makeEditor([]);
    t.render(<LayersPanel />);
    expect(screen.getByText(/Nothing on this board yet/)).toBeInTheDocument();
  });
});
