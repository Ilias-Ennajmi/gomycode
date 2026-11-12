import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorOverlays } from "@/components/editor/EditorOverlays";
import { useEditor } from "@/components/editor/EditorContext";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EditorProvider", () => {
  it("useEditor outside the provider throws a clear error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Probe = () => {
      useEditor();
      return null;
    };
    expect(() => render(<Probe />)).toThrow(/EditorProvider/);
    spy.mockRestore();
  });

  it("binds keyboard shortcuts on the page while mounted, and unbinds on unmount", () => {
    const t = makeEditor([obj("shape", "a"), obj("shape", "b")]);
    const { unmount } = t.render(<EditorOverlays />);
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    expect(t.selection.size).toBe(2);
    fireEvent.keyDown(document.body, { key: "h" });
    expect(t.setTool).toHaveBeenCalledWith("hand");
    unmount();
    t.setTool.mockClear();
    fireEvent.keyDown(document.body, { key: "h" });
    expect(t.setTool).not.toHaveBeenCalled();
  });

  it("Mod+K opens the palette and Mod+F opens Find and replace, both without animating", async () => {
    const t = makeEditor([obj("shape", "a")]);
    t.render(<EditorOverlays />);
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "f", ctrlKey: true });
    const panel = await screen.findByRole("complementary", { name: "Find and replace" });
    expect(panel.className).not.toMatch(/transition/);
  });

  it("Delete removes the selection and shows an Undo toast", () => {
    const t = makeEditor([obj("shape", "a")]);
    t.selection.set(["a"]);
    t.render(<EditorOverlays />);
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(t.doc.all()).toHaveLength(0);
    expect(t.toasts[0].message).toBe("Deleted 1 object");
  });

  it("exposes the command context with the same canvas, selection and a clipboard", () => {
    const t = makeEditor([obj("shape", "a")]);
    let seen: ReturnType<ReturnType<typeof useEditor>["commandCtx"]> | null = null;
    const Probe = () => {
      seen = useEditor().commandCtx();
      return null;
    };
    t.render(<Probe />);
    expect(seen!.canvas).toBe(t.handle);
    expect(seen!.selection).toBe(t.selection);
    expect(seen!.animate).toBe(false);
    act(() => void seen!.setTool("pen"));
    expect(t.setTool).toHaveBeenCalledWith("pen");
  });

  it("the image command (I) opens the file picker for images", () => {
    const t = makeEditor([]);
    t.render(<EditorOverlays />);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.keyDown(document.body, { key: "i" });
    expect(click).toHaveBeenCalledTimes(1);
    const input = click.mock.contexts[0] as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    expect(input.multiple).toBe(true);
    click.mockRestore();
  });
});
