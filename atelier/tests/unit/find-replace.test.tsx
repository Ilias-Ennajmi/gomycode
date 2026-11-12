import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FindReplace } from "@/components/panels/FindReplace";
import { writeRichContent } from "@/lib/engine/clipboard/rich";
import { objectText } from "@/lib/engine/model/search";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

function board() {
  const t = makeEditor([
    obj("sticky", "s1"),
    obj("sticky", "s2", { x: 3000 }),
    obj("frame", "f", { name: "Cat frame", x: 0, y: 3000, w: 400, h: 300 }),
  ]);
  const set = (id: string, text: string) =>
    t.doc.transact(() => writeRichContent(t.doc.content(id)!, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }));
  set("s1", "the cat sat");
  set("s2", "cat and Cat");
  t.doc.stopCapturing();
  return t;
}

const results = () => within(screen.getByRole("list")).getAllByRole("button");
const find = () => screen.getByRole("searchbox", { name: "Find" });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("FindReplace", () => {
  it("focuses the find field and lists matches with a polite summary", async () => {
    const t = board();
    t.render(<FindReplace />);
    expect(document.activeElement).toBe(find());
    expect(screen.getByRole("status")).toHaveTextContent("");
    type(find(), "cat");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("4 matches in 3 objects"));
    expect(results()).toHaveLength(3);
    type(find(), "zebra");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"));
  });

  it("match case and whole word narrow the results", async () => {
    const t = board();
    t.render(<FindReplace />);
    type(find(), "cat");
    fireEvent.click(screen.getByRole("checkbox", { name: "Match case" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 matches in 2 objects"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match case" }));
    type(find(), "ca");
    fireEvent.click(screen.getByRole("checkbox", { name: "Whole word" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"));
    expect(t.doc.all()).toHaveLength(3);
  });

  it("Enter and Shift+Enter step through the matches, selecting each and bringing it into view without animating", async () => {
    const t = board();
    t.render(<FindReplace />);
    type(find(), "cat");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("4 matches"));
    fireEvent.keyDown(find(), { key: "Enter" });
    expect([...t.selection.ids]).toEqual(["s1"]);
    fireEvent.keyDown(find(), { key: "Enter" });
    expect([...t.selection.ids]).toEqual(["s2"]);
    expect(t.setCamera).toHaveBeenCalled();
    expect(t.setCamera.mock.calls.at(-1)![1]).toEqual({ animate: false });
    fireEvent.keyDown(find(), { key: "Enter", shiftKey: true });
    expect([...t.selection.ids]).toEqual(["s1"]);
    fireEvent.keyDown(find(), { key: "Enter", shiftKey: true });
    expect([...t.selection.ids]).toEqual(["f"]); // wraps around
  });

  it("the Next and Previous buttons do the same", async () => {
    const t = board();
    t.render(<FindReplace />);
    type(find(), "cat");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("4 matches"));
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect([...t.selection.ids]).toEqual(["s2"]);
    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect([...t.selection.ids]).toEqual(["s1"]);
  });

  it("clicking a result selects it", async () => {
    const t = board();
    t.render(<FindReplace />);
    type(find(), "cat");
    await waitFor(() => expect(results()).toHaveLength(3));
    fireEvent.click(results()[2]);
    expect([...t.selection.ids]).toEqual(["f"]);
  });

  it("Replace all replaces everywhere in one undo step and offers Undo", async () => {
    const t = board();
    t.render(<FindReplace />);
    type(find(), "cat");
    type(screen.getByRole("textbox", { name: "Replace with" }), "owl");
    await waitFor(() => expect(screen.getByRole("button", { name: "Replace all" })).toBeEnabled());
    const steps = t.doc.undoManager.undoStack.length;
    fireEvent.click(screen.getByRole("button", { name: "Replace all" }));
    expect(objectText(t.doc, "s1")).toBe("the owl sat");
    expect(objectText(t.doc, "s2")).toBe("owl and owl");
    expect(objectText(t.doc, "f")).toBe("owl frame");
    expect(t.doc.undoManager.undoStack.length).toBe(steps + 1);
    expect(t.toasts.at(-1)).toMatchObject({ message: "Replaced 4 matches", action: { label: "Undo" } });
    t.toasts.at(-1)!.action!.run();
    expect(objectText(t.doc, "s1")).toBe("the cat sat");
    expect(objectText(t.doc, "f")).toBe("Cat frame");
  });

  it("Replace all is disabled without a query or matches", async () => {
    const t = board();
    t.render(<FindReplace />);
    expect(screen.getByRole("button", { name: "Replace all" })).toBeDisabled();
    type(find(), "zzz");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"));
    expect(screen.getByRole("button", { name: "Replace all" })).toBeDisabled();
    expect(t.toasts).toHaveLength(0);
  });

  it("updates when the board changes", async () => {
    const t = board();
    t.render(<FindReplace />);
    type(find(), "cat");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 objects"));
    act(() => t.doc.remove(["s2"]));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 objects"));
  });
});
