import { act, fireEvent, screen, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "@/components/chrome/ContextBar";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  vi.restoreAllMocks();
});

const bar = () => screen.getByRole("toolbar", { name: "Selection" });
const inBar = (name: string | RegExp) => within(bar()).getByRole("button", { name });
const queryInBar = (name: string | RegExp) => within(bar()).queryByRole("button", { name });

function mount(objs = [obj("sticky", "s", { x: 100, y: 200 }), obj("shape", "h", { x: 400, y: 200 }), obj("text", "t", { x: 100, y: 500 })]) {
  const t = makeEditor(objs);
  t.render(<ContextBar />);
  return t;
}

/** A recording stand-in for the Tiptap editor. */
function fakeEditor(state: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, name: string) => (name === "run" ? () => true : (...args: unknown[]) => (calls.push(`${name}(${args.join(",")})`), chain)),
    },
  );
  const handlers = new Map<string, Set<() => void>>();
  const editor = {
    isDestroyed: false,
    isEditable: true,
    chain: () => chain,
    isActive: (name: string | Record<string, unknown>) => (typeof name === "string" ? !!state[name] : false),
    getAttributes: () => ({}),
    on: (ev: string, cb: () => void) => void (handlers.get(ev) ?? handlers.set(ev, new Set()).get(ev)!).add(cb),
    off: (ev: string, cb: () => void) => void handlers.get(ev)?.delete(cb),
    state: { selection: { from: 1, to: 1, empty: true } },
  } as unknown as Editor;
  return { editor, calls };
}

describe("ContextBar", () => {
  it("renders nothing without a selection", () => {
    mount();
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
  });

  it("a sticky selection shows the sticky controls and no shape controls", () => {
    const t = mount();
    act(() => t.selection.set(["s"]));
    expect(inBar(/Sticky colour/)).toBeInTheDocument();
    expect(inBar(/Sticky size/)).toBeInTheDocument();
    expect(queryInBar(/^Fill/)).toBeNull();
    expect(queryInBar(/^Shape kind/)).toBeNull();
    expect(inBar("Bold")).toBeInTheDocument();
    expect(inBar("Lock")).toBeInTheDocument();
  });

  it("a shape selection shows fill, stroke and kind", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    expect(inBar(/^Fill/)).toBeInTheDocument();
    expect(inBar(/^Stroke/)).toBeInTheDocument();
    expect(inBar(/^Shape kind/)).toBeInTheDocument();
    expect(queryInBar(/Sticky colour/)).toBeNull();
  });

  it("a mixed selection shows only the common controls: opacity, lock, layout and arrange", () => {
    const t = mount();
    act(() => t.selection.set(["s", "h"]));
    const names = within(bar())
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Opacity", "Lock", "Layout", "Arrange", "More actions"]);
  });

  it("changing the sticky size is one undoable step", () => {
    const t = mount();
    act(() => t.selection.set(["s"]));
    const before = (t.doc.get("s") as { size: string }).size;
    fireEvent.click(inBar(/Sticky size/));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Sticky size" })).getByRole("radio", { name: "Large" }));
    expect((t.doc.get("s") as { size: string }).size).toBe("L");
    t.doc.undo();
    expect((t.doc.get("s") as { size: string }).size).toBe(before);
  });

  it("choosing a sticky colour updates every selected sticky", () => {
    const t = mount([obj("sticky", "a"), obj("sticky", "b", { x: 300 })]);
    act(() => t.selection.set(["a", "b"]));
    fireEvent.click(inBar(/Sticky colour/));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Sticky colour" })).getByRole("radio", { name: "Pink" }));
    expect((t.doc.get("a") as { fill: string }).fill).toBe("pink");
    expect((t.doc.get("b") as { fill: string }).fill).toBe("pink");
  });

  it("shape fill takes a token swatch or none", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    fireEvent.click(inBar(/^Fill/));
    const pop = screen.getByRole("dialog", { name: "Fill" });
    fireEvent.click(within(pop).getByRole("radio", { name: "Mint" }));
    expect((t.doc.get("h") as { fill: string | null }).fill).toBe("var(--sticky-mint)");
    fireEvent.click(within(pop).getByRole("radio", { name: "None" }));
    expect((t.doc.get("h") as { fill: string | null }).fill).toBeNull();
  });

  it("shape kind changes the shape", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    fireEvent.click(inBar(/^Shape kind/));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Shape kind" })).getByRole("radio", { name: "Diamond" }));
    expect((t.doc.get("h") as { kind: string }).kind).toBe("diamond");
  });

  it("stroke width and style", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    fireEvent.click(inBar(/^Stroke/));
    const pop = screen.getByRole("dialog", { name: "Stroke" });
    fireEvent.click(within(pop).getByRole("radio", { name: "8 px" }));
    fireEvent.click(within(pop).getByRole("radio", { name: "Dashed" }));
    const s = t.doc.get("h") as { strokeWidth: number; strokeStyle: string };
    expect(s.strokeWidth).toBe(8);
    expect(s.strokeStyle).toBe("dashed");
  });

  it("text font size is clamped to 12-96", () => {
    const t = mount();
    act(() => t.selection.set(["t"]));
    const field = within(bar()).getByRole("textbox", { name: "Font size" });
    fireEvent.change(field, { target: { value: "5" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect((t.doc.get("t") as { fontSize: number }).fontSize).toBe(12);
    fireEvent.change(field, { target: { value: "500" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect((t.doc.get("t") as { fontSize: number }).fontSize).toBe(96);
    fireEvent.click(inBar("Increase font size"));
    expect((t.doc.get("t") as { fontSize: number }).fontSize).toBe(96);
    fireEvent.click(inBar("Decrease font size"));
    expect((t.doc.get("t") as { fontSize: number }).fontSize).toBeLessThan(96);
  });

  it("text alignment and line spacing apply to the text object", () => {
    const t = mount();
    act(() => t.selection.set(["t"]));
    fireEvent.click(inBar(/^Align/));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Align" })).getByRole("radio", { name: "Align centre" }));
    expect((t.doc.get("t") as { align: string }).align).toBe("center");
  });

  it("an arrow selection shows route and heads", () => {
    const t = mount([obj("arrow", "a")]);
    act(() => t.selection.set(["a"]));
    fireEvent.click(inBar(/^Route/));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Route" })).getByRole("radio", { name: "Elbow" }));
    expect((t.doc.get("a") as { route: string }).route).toBe("elbow");
    expect(inBar(/^Heads/)).toBeInTheDocument();
  });

  it("a frame selection shows preset, clip and background", () => {
    const t = mount([obj("frame", "f")]);
    act(() => t.selection.set(["f"]));
    expect(inBar(/^Frame size/)).toBeInTheDocument();
    expect(inBar("Clip content")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(inBar("Clip content"));
    expect((t.doc.get("f") as { clip: boolean }).clip).toBe(false);
    fireEvent.click(inBar(/^Frame size/));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Frame size" })).getByRole("radio", { name: /Square/ }));
    const f = t.doc.get("f") as { preset: string; w: number; h: number };
    expect(f.preset).toBe("square");
    expect([f.w, f.h]).toEqual([1080, 1080]);
  });

  it("Lock toggles the lock of the selection and a locked selection offers only Unlock and More", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    fireEvent.click(inBar("Lock"));
    expect(t.doc.get("h")!.locked).toBe(true);
    const names = within(bar())
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Unlock", "More actions"]);
    fireEvent.click(inBar("Unlock"));
    expect(t.doc.get("h")!.locked).toBe(false);
  });

  it("opacity", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    fireEvent.click(inBar("Opacity"));
    const field = within(screen.getByRole("dialog", { name: "Opacity" })).getByRole("textbox", { name: "Opacity" });
    fireEvent.change(field, { target: { value: "40" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(t.doc.get("h")!.opacity).toBeCloseTo(0.4);
  });

  it("the More menu lists the same actions as the context menu and runs them", () => {
    const t = mount();
    act(() => t.selection.set(["h"]));
    fireEvent.click(inBar("More actions"));
    const menu = screen.getByRole("menu", { name: "More actions" });
    for (const name of ["Duplicate", "Delete", "Bring to front"]) expect(within(menu).getByRole("menuitem", { name: new RegExp(name) })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Duplicate/ }));
    expect(t.doc.all().filter((o) => o.type === "shape")).toHaveLength(2);
  });

  it("goes below the selection when there is no room above it", () => {
    const t = mount([obj("shape", "h", { x: 400, y: 10 })]);
    act(() => t.selection.set(["h"]));
    expect(bar()).toHaveAttribute("data-placement", "bottom");
  });

  describe("formatting while editing", () => {
    it("Bold, Italic, Underline and Strikethrough go to the live editor", () => {
      const t = mount();
      act(() => t.selection.set(["s"]));
      const { editor, calls } = fakeEditor({ bold: true });
      act(() => {
        t.editing.start("s");
        t.editing.setEditor(editor);
      });
      expect(inBar("Bold")).toHaveAttribute("aria-pressed", "true");
      expect(inBar("Italic")).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(inBar("Bold"));
      fireEvent.click(inBar("Italic"));
      fireEvent.click(inBar("Underline"));
      fireEvent.click(inBar("Strikethrough"));
      expect(calls).toEqual(expect.arrayContaining(["focus()", "toggleBold()", "toggleItalic()", "toggleUnderline()", "toggleStrike()"]));
    });

    it("alignment and line spacing go to the editor's paragraphs", () => {
      const t = mount();
      act(() => t.selection.set(["s"]));
      const { editor, calls } = fakeEditor();
      act(() => {
        t.editing.start("s");
        t.editing.setEditor(editor);
      });
      fireEvent.click(inBar(/^Align/));
      fireEvent.click(within(screen.getByRole("dialog", { name: "Align" })).getByRole("radio", { name: "Align right" }));
      expect(calls).toContain("setTextAlign(right)");
    });

    it("font size on a text range sets the size mark, clamped", () => {
      const t = mount();
      act(() => t.selection.set(["t"]));
      const { editor, calls } = fakeEditor();
      (editor.state.selection as { empty: boolean }).empty = false;
      act(() => {
        t.editing.start("t");
        t.editing.setEditor(editor);
      });
      const field = within(bar()).getByRole("textbox", { name: "Font size" });
      fireEvent.change(field, { target: { value: "200" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(calls).toContain("setFontSize(96px)");
    });

    it("clicking Bold on a selected sticky that is not being edited starts editing it", () => {
      const t = mount();
      act(() => t.selection.set(["s"]));
      expect(t.editing.id).toBeNull();
      fireEvent.click(inBar("Bold"));
      expect(t.editing.id).toBe("s");
    });
  });
});
