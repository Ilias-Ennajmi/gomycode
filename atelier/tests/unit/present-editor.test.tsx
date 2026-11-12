import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TopBar } from "@/components/chrome/TopBar";
import { EditorOverlays } from "@/components/editor/EditorOverlays";
import { useEditor } from "@/components/editor/EditorContext";
import { registry } from "@/lib/engine/commands/registry";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

const deck = () => makeEditor([obj("frame", "a", { name: "Cover", order: "a0" }), obj("frame", "b", { name: "Two", order: "a1", x: 2000 })]);
const bar = () => <TopBar boardId="b" title="Board" onTitleChange={() => {}} status="saved" />;

describe("Present in the editor", () => {
  it("the Present button is enabled and starts the presentation at the first slide", () => {
    const t = deck();
    t.render(bar());
    const b = screen.getByRole("button", { name: "Present" });
    expect(b).toBeEnabled();
    fireEvent.click(b);
    expect(screen.getByRole("region", { name: "Presentation" })).toHaveAttribute("data-slide-index", "0");
  });

  it("with no frames it says 'Add frames to present.' and does not start", () => {
    const t = makeEditor([obj("shape", "s")]);
    t.render(bar());
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(screen.queryByRole("region", { name: "Presentation" })).toBeNull();
    expect(t.toasts.map((x) => x.message)).toEqual(["Add frames to present."]);
  });

  it("Mod+Alt+P starts it from the keyboard", () => {
    const t = deck();
    t.render(<EditorOverlays />);
    fireEvent.keyDown(document.body, { key: "π", code: "KeyP", ctrlKey: true, altKey: true });
    expect(screen.getByRole("region", { name: "Presentation" })).toBeInTheDocument();
    expect(t.setCamera).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ animate: false }));
  });

  it("hides all editor chrome while presenting and brings it back on exit", () => {
    const t = deck();
    t.render(
      <>
        {bar()}
        <EditorOverlays />
      </>,
    );
    const ui = document.querySelector("[data-editor-ui]") as HTMLElement;
    expect(ui.style.display).toBe("contents");
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(ui.style.display).toBe("none");
    expect(screen.queryByRole("button", { name: "Board title" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Presentation" })).toBeNull();
    expect(ui.style.display).toBe("contents");
    expect(screen.getByRole("button", { name: "Present" })).toBeEnabled();
  });

  it("restores the selection and the camera on exit", () => {
    const t = deck();
    t.selection.set(["b"]);
    t.render(bar());
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(t.selection.size).toBe(0);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect([...t.selection.ids]).toEqual(["b"]);
    expect(t.handle.getCamera()).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("shows layers hidden in the editor while presenting (like an export), and hides them again after", () => {
    const t = deck();
    let editor!: ReturnType<typeof useEditor>;
    const Probe = () => {
      editor = useEditor();
      return null;
    };
    t.render(
      <>
        <Probe />
        {bar()}
      </>,
    );
    act(() => editor.hidden.set(["a"], true));
    expect(document.querySelector("style[data-hidden-layers]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(document.querySelector("style[data-hidden-layers]")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector("style[data-hidden-layers]")).not.toBeNull();
  });

  it("present.exit is available only while presenting", () => {
    const t = deck();
    let editor!: ReturnType<typeof useEditor>;
    const Probe = () => {
      editor = useEditor();
      return null;
    };
    t.render(
      <>
        <Probe />
        {bar()}
      </>,
    );
    expect(registry.available("present.exit", editor.commandCtx())).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(registry.available("present.exit", editor.commandCtx())).toBe(true);
    act(() => {
      editor.run("present.exit");
    });
    expect(screen.queryByRole("region", { name: "Presentation" })).toBeNull();
  });
});
