import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { FRAME_NOTES_MAX } from "@/components/panels/FrameFields";
import type { FrameObj } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

const notes = () => screen.getByRole("textbox", { name: "Presenter notes" }) as HTMLTextAreaElement;
const frameOf = (t: ReturnType<typeof makeEditor>, id = "f") => t.doc.get(id) as FrameObj;

function setup(objs = [obj("frame", "f", { name: "Cover", notes: "Hello" }), obj("shape", "s")], select = ["f"]) {
  const t = makeEditor(objs);
  t.selection.set(select);
  t.render(<InspectorPanel />);
  return t;
}

describe("Inspector: slide fields of a frame", () => {
  it("shows the slide name and the presenter notes for one selected frame", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Slide name" })).toHaveValue("Cover");
    expect(notes()).toHaveValue("Hello");
  });

  it("does not show them for other objects or for several frames", () => {
    setup(undefined, ["s"]);
    expect(screen.queryByRole("textbox", { name: "Presenter notes" })).toBeNull();
    document.body.innerHTML = "";
    setup([obj("frame", "f"), obj("frame", "g")], ["f", "g"]);
    expect(screen.queryByRole("textbox", { name: "Presenter notes" })).toBeNull();
  });

  it("saves the notes when the field loses focus, as one undo step", () => {
    const t = setup();
    fireEvent.focus(notes());
    fireEvent.change(notes(), { target: { value: "Hello there\nSecond line" } });
    expect(frameOf(t).notes).toBe("Hello"); // not while typing
    fireEvent.blur(notes());
    expect(frameOf(t).notes).toBe("Hello there\nSecond line");
    act(() => t.doc.undo());
    expect(frameOf(t).notes).toBe("Hello");
  });

  it("caps the notes at 2,000 characters and shows the count", () => {
    expect(FRAME_NOTES_MAX).toBe(2000);
    const t = setup();
    expect(notes()).toHaveAttribute("maxlength", "2000");
    fireEvent.change(notes(), { target: { value: "x".repeat(2500) } });
    expect(notes().value).toHaveLength(2000);
    expect(screen.getByText("2000 / 2000")).toBeInTheDocument();
    fireEvent.blur(notes());
    expect(frameOf(t).notes).toHaveLength(2000);
  });

  it("keeps markup in the notes as inert text", () => {
    const t = setup();
    fireEvent.change(notes(), { target: { value: "<script>alert(1)</script>" } });
    fireEvent.blur(notes());
    expect(frameOf(t).notes).toBe("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
  });

  it("renames the slide on Enter, keeps the old name when emptied", () => {
    const t = setup();
    const name = screen.getByRole("textbox", { name: "Slide name" });
    fireEvent.change(name, { target: { value: "Opening" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(frameOf(t).name).toBe("Opening");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.blur(name);
    expect(frameOf(t).name).toBe("Opening");
  });

  it("is read-only on a locked frame", () => {
    const t = makeEditor([obj("frame", "f", { locked: true, notes: "x" })]);
    t.selection.set(["f"]);
    t.render(<InspectorPanel />);
    expect(notes()).toBeDisabled();
  });

  it("follows a change made elsewhere (another device) while it is not being edited", async () => {
    const t = setup();
    act(() => t.doc.update("f", { notes: "From my phone" }));
    await waitFor(() => expect(notes()).toHaveValue("From my phone"));
  });
});
