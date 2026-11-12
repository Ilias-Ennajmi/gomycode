import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextBar } from "@/components/chrome/ContextBar";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { boundsOf } from "@/lib/engine/geometry/rect";
import type { CanvasObject, NewObject } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

const img = (id: string, x: number, y: number, w = 100, h = 100) => obj("image", id, { assetId: "a", x, y, w, h }) as NewObject;
const four = () => [img("a", 0, 0), img("b", 300, 40), img("c", 20, 300), img("d", 400, 320)];

const bar = () => screen.getByRole("toolbar", { name: "Selection" });
const b = (t: { doc: { get(id: string): CanvasObject | undefined } }, id: string) => boundsOf(t.doc.get(id)!);

describe("Layout popover in the context bar", () => {
  it("is offered for two or more objects, not for one", () => {
    const t = makeEditor(four());
    t.selection.set(["a"]);
    t.render(<ContextBar />);
    expect(within(bar()).queryByRole("button", { name: "Layout" })).toBeNull();
    act(() => t.selection.set(["a", "b"]));
    expect(within(bar()).getByRole("button", { name: "Layout" })).toBeTruthy();
  });

  it("lists the seven layouts and runs Grid as one undo step with the board gutter", () => {
    const t = makeEditor(four());
    t.doc.meta.gutter = 30;
    t.selection.set(["a", "b", "c", "d"]);
    t.render(<ContextBar />);
    fireEvent.click(within(bar()).getByRole("button", { name: "Layout" }));
    for (const name of ["Grid", "Masonry", "Justified rows", "Tight pack", "Equal heights", "Equal widths", "Tidy"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    const depth = t.doc.undoManager.undoStack.length;
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(t.doc.undoManager.undoStack.length).toBe(depth + 1);
    expect(b(t, "b").x - (b(t, "a").x + b(t, "a").w)).toBeCloseTo(30);
    act(() => t.doc.undo());
    expect(b(t, "b").x).toBe(300);
  });

  it("the Columns field defaults to ceil(sqrt(n)) and is used by Grid", () => {
    const t = makeEditor([...four(), img("e", 700, 0), img("f", 700, 300)]);
    t.selection.set(["a", "b", "c", "d", "e", "f"]);
    t.render(<ContextBar />);
    fireEvent.click(within(bar()).getByRole("button", { name: "Layout" }));
    const cols = screen.getByRole("textbox", { name: "Columns" }) as HTMLInputElement;
    expect(cols.value).toBe("3");
    fireEvent.focus(cols);
    fireEvent.change(cols, { target: { value: "2" } });
    fireEvent.keyDown(cols, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    const xs = new Set(["a", "b", "c", "d", "e", "f"].map((id) => Math.round(b(t, id).x)));
    expect(xs.size).toBe(2);
  });

  it("edits the board gutter", () => {
    const t = makeEditor(four());
    t.selection.set(["a", "b"]);
    t.render(<ContextBar />);
    fireEvent.click(within(bar()).getByRole("button", { name: "Layout" }));
    const gutter = screen.getByRole("textbox", { name: "Gutter" }) as HTMLInputElement;
    expect(gutter.value).toBe("16");
    fireEvent.focus(gutter);
    fireEvent.change(gutter, { target: { value: "24" } });
    fireEvent.keyDown(gutter, { key: "Enter" });
    expect(t.doc.meta.gutter).toBe(24);
  });
});

describe("Inspector board section", () => {
  it("with nothing selected it keeps the hint and offers Gutter and Value check", () => {
    const t = makeEditor(four());
    const depth = t.doc.undoManager.undoStack.length;
    t.render(<InspectorPanel />);
    expect(screen.getByText("Select something to see its properties.")).toBeTruthy();
    const gutter = screen.getByRole("textbox", { name: "Gutter" }) as HTMLInputElement;
    fireEvent.focus(gutter);
    fireEvent.change(gutter, { target: { value: "8" } });
    fireEvent.keyDown(gutter, { key: "Enter" });
    expect(t.doc.meta.gutter).toBe(8);
    const vc = screen.getByRole("switch", { name: "Value check" });
    expect(vc.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(vc);
    expect(t.doc.meta.valueCheck).toBe(true);
    expect(screen.getByRole("switch", { name: "Value check" }).getAttribute("aria-checked")).toBe("true");
    expect(t.doc.undoManager.undoStack.length).toBe(depth);
  });
  it("shows Gutter for several selected objects but not for one", () => {
    const t = makeEditor(four());
    t.selection.set(["a"]);
    t.render(<InspectorPanel />);
    expect(screen.queryByRole("textbox", { name: "Gutter" })).toBeNull();
    act(() => t.selection.set(["a", "b"]));
    expect(screen.getByRole("textbox", { name: "Gutter" })).toBeTruthy();
  });
});
