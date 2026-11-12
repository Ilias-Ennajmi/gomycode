import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "@/components/chrome/Toolbar";
import type { ArrowTool, FrameTool, PenTool, ShapeTool, StickyTool } from "@/lib/engine/input/tools";
import { makeEditor } from "./helpers/editor";

afterEach(() => {
  vi.restoreAllMocks();
});

const TOOL_NAMES = ["Select", "Hand", "Sticky note", "Text", "Shapes", "Arrow or line", "Pen", "Frame", "Image", "More objects"];

function mount() {
  const t = makeEditor();
  t.render(<Toolbar />);
  return t;
}
const toolbar = () => screen.getByRole("toolbar", { name: "Tools" });
const button = (name: string) => within(toolbar()).getByRole("button", { name });

describe("Toolbar", () => {
  it("is a labelled toolbar with every tool and the More button last", () => {
    mount();
    const names = within(toolbar())
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(TOOL_NAMES);
  });

  it("gives every tool its shortcut", () => {
    mount();
    expect(button("Select")).toHaveAttribute("aria-keyshortcuts", "V");
    expect(button("Sticky note")).toHaveAttribute("aria-keyshortcuts", "N");
    expect(button("Pen")).toHaveAttribute("aria-keyshortcuts", "P");
  });

  it("marks the active tool with aria-pressed and follows tool changes made elsewhere", () => {
    const t = mount();
    expect(button("Select")).toHaveAttribute("aria-pressed", "true");
    expect(button("Hand")).toHaveAttribute("aria-pressed", "false");
    act(() => t.tools.setTool("sticky"));
    expect(button("Sticky note")).toHaveAttribute("aria-pressed", "true");
    expect(button("Select")).toHaveAttribute("aria-pressed", "false");
    // pen, highlighter and eraser share the Pen button
    act(() => t.tools.setTool("eraser"));
    expect(button("Pen")).toHaveAttribute("aria-pressed", "true");
  });

  it("has one tab stop and moves focus with the arrow keys, Home and End", () => {
    mount();
    const tabbable = within(toolbar())
      .getAllByRole("button")
      .filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    button("Select").focus();
    fireEvent.keyDown(button("Select"), { key: "ArrowRight" });
    expect(button("Hand")).toHaveFocus();
    fireEvent.keyDown(button("Hand"), { key: "End" });
    expect(button("More objects")).toHaveFocus();
    fireEvent.keyDown(button("More objects"), { key: "ArrowLeft" });
    expect(button("Image")).toHaveFocus();
    fireEvent.keyDown(button("Image"), { key: "ArrowRight" });
    expect(button("More objects")).toHaveFocus();
    fireEvent.keyDown(button("More objects"), { key: "ArrowRight" });
    expect(button("Select")).toHaveFocus();
    fireEvent.keyDown(button("Select"), { key: "ArrowLeft" });
    expect(button("More objects")).toHaveFocus();
  });

  it("Enter activates the focused tool", () => {
    const t = mount();
    button("Select").focus();
    fireEvent.keyDown(button("Select"), { key: "ArrowRight" });
    fireEvent.click(button("Hand"), { detail: 0 }); // what Enter and Space do
    expect(t.setTool).toHaveBeenCalledWith("hand");
    expect(button("Hand")).toHaveAttribute("aria-pressed", "true");
  });

  it("a double click locks the tool", () => {
    const t = mount();
    fireEvent.click(button("Sticky note"), { detail: 1 });
    fireEvent.click(button("Sticky note"), { detail: 2 });
    fireEvent.doubleClick(button("Sticky note"));
    expect(t.tools.id).toBe("sticky");
    expect(t.tools.locked).toBe(true);
    expect(button("Sticky note").getAttribute("aria-label")).toBe("Sticky note");
    expect(button("Sticky note")).toHaveAttribute("data-locked", "true");
  });

  it("Image runs the add-image command", () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    mount();
    fireEvent.click(button("Image"), { detail: 1 });
    expect(click).toHaveBeenCalled();
  });

  describe("popovers", () => {
    it("the shapes button opens the shape kinds and picking one sets the next shape", () => {
      const t = mount();
      fireEvent.click(button("Shapes"), { detail: 1 });
      expect(t.tools.id).toBe("shape");
      const pop = screen.getByRole("dialog", { name: "Shape options" });
      for (const kind of ["Rectangle", "Rounded rectangle", "Ellipse", "Triangle", "Diamond", "Star"]) {
        expect(within(pop).getByRole("radio", { name: kind })).toBeInTheDocument();
      }
      fireEvent.click(within(pop).getByRole("radio", { name: "Ellipse" }));
      expect(t.tools.get<ShapeTool>("shape")!.kind).toBe("ellipse");
      expect(within(pop).getByRole("radio", { name: "Ellipse" })).toHaveAttribute("aria-checked", "true");
    });

    it("keyboard activation does not open the popover; ArrowUp does; Escape closes it and returns focus", () => {
      mount();
      button("Shapes").focus();
      fireEvent.click(button("Shapes"), { detail: 0 });
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.keyDown(button("Shapes"), { key: "ArrowUp" });
      const pop = screen.getByRole("dialog", { name: "Shape options" });
      expect(pop.contains(document.activeElement)).toBe(true);
      expect(button("Shapes")).toHaveAttribute("aria-expanded", "true");
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(button("Shapes")).toHaveFocus();
    });

    it("pen: pen, highlighter and eraser, then colour and size", () => {
      const t = mount();
      fireEvent.click(button("Pen"), { detail: 1 });
      const pop = screen.getByRole("dialog", { name: "Pen options" });
      fireEvent.click(within(pop).getByRole("radio", { name: "Highlighter" }));
      expect(t.tools.id).toBe("highlighter");
      fireEvent.click(within(pop).getByRole("radio", { name: "Pen" }));
      expect(t.tools.id).toBe("pen");
      fireEvent.click(within(pop).getByRole("radio", { name: "Ink blue" }));
      expect(t.tools.get<PenTool>("pen")!.color).toBe("var(--color-accent)");
      fireEvent.click(within(pop).getByRole("radio", { name: "Thick" }));
      expect(t.tools.get<PenTool>("pen")!.size).toBeGreaterThan(4);
      fireEvent.click(within(pop).getByRole("radio", { name: "Eraser" }));
      expect(t.tools.id).toBe("eraser");
      expect(within(pop).queryByRole("radiogroup", { name: "Colour" })).toBeNull();
    });

    it("frames list their real sizes and picking one sets the next frame", () => {
      const t = mount();
      fireEvent.click(button("Frame"), { detail: 1 });
      const pop = screen.getByRole("dialog", { name: "Frame options" });
      expect(within(pop).getByRole("radio", { name: /Slide 16:9/ })).toHaveTextContent("1920 × 1080 px");
      expect(within(pop).getByRole("radio", { name: /A4/ })).toHaveTextContent("210 × 297 mm");
      expect(within(pop).getByRole("radio", { name: /Letter/ })).toHaveTextContent("8.5 × 11 in");
      fireEvent.click(within(pop).getByRole("radio", { name: /Instagram post/ }));
      expect(t.tools.get<FrameTool>("frame")!.preset).toBe("ig-post-4-5");
    });

    it("stickies: colour and size", () => {
      const t = mount();
      fireEvent.click(button("Sticky note"), { detail: 1 });
      const pop = screen.getByRole("dialog", { name: "Sticky options" });
      fireEvent.click(within(pop).getByRole("radio", { name: "Mint" }));
      fireEvent.click(within(pop).getByRole("radio", { name: "Large" }));
      const s = t.tools.get<StickyTool>("sticky")!;
      expect(s.fill).toBe("mint");
      expect(s.size).toBe("L");
    });

    it("arrows: line or arrow, route and heads", () => {
      const t = mount();
      fireEvent.click(button("Arrow or line"), { detail: 1 });
      const pop = screen.getByRole("dialog", { name: "Arrow options" });
      const a = t.tools.get<ArrowTool>("arrow")!;
      const type = within(pop).getByRole("radiogroup", { name: "Type" });
      fireEvent.click(within(type).getByRole("radio", { name: "Line" }));
      expect(a.variant).toBe("line");
      fireEvent.click(within(type).getByRole("radio", { name: "Arrow" }));
      expect(a.variant).toBe("arrow");
      fireEvent.click(within(pop).getByRole("radio", { name: "Elbow" }));
      expect(a.route).toBe("elbow");
      fireEvent.click(within(within(pop).getByRole("radiogroup", { name: "Start" })).getByRole("radio", { name: "Dot" }));
      expect(a.startHead).toBe("dot");
    });

    it("clicking the active tool again closes its popover", () => {
      mount();
      fireEvent.click(button("Shapes"), { detail: 1 });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.click(button("Shapes"), { detail: 1 });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
