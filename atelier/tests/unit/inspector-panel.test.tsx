import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { NumberField } from "@/components/panels/NumberField";
import { render } from "@testing-library/react";
import { useState } from "react";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

const field = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;

function setup(objs = [obj("shape", "a", { x: 100, y: 50, w: 200, h: 100 }), obj("shape", "b", { x: 400, y: 300, w: 60, h: 40 })], select = ["a"]) {
  const t = makeEditor(objs);
  t.selection.set(select);
  t.render(<InspectorPanel />);
  return t;
}

describe("NumberField", () => {
  function Harness({ onCommit }: { onCommit: (v: number, merge: boolean) => void }) {
    const [v, setV] = useState<number | null>(10);
    return <NumberField id="n" label="N" value={v} min={0} max={500} onCommit={(n, m) => { setV(n); onCommit(n, m); }} />;
  }

  it("commits on Enter and on blur, not while typing", () => {
    const calls: number[] = [];
    render(<Harness onCommit={(v) => calls.push(v)} />);
    const input = screen.getByRole("textbox", { name: "N" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "42" } });
    expect(calls).toEqual([]);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(calls).toEqual([42]);
    fireEvent.change(input, { target: { value: "7.5" } });
    fireEvent.blur(input);
    expect(calls).toEqual([42, 7.5]);
  });

  it("arrow keys step by 1, Shift by 10, and clamp", () => {
    const calls: [number, boolean][] = [];
    render(<Harness onCommit={(v, m) => calls.push([v, m])} />);
    const input = screen.getByRole("textbox", { name: "N" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(calls.map((c) => c[0])).toEqual([11, 21, 20]);
    expect(calls.every((c) => c[1])).toBe(true); // repeated steps merge into one undo step
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(calls[calls.length - 1][0]).toBe(0); // min
  });

  it("reverts on Escape and on text that is not a number, and says nothing then", () => {
    const calls: number[] = [];
    render(<Harness onCommit={(v) => calls.push(v)} />);
    const input = screen.getByRole("textbox", { name: "N" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("10");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("10");
    expect(calls).toEqual([]);
  });

  it("accepts a decimal comma and shows no trailing zeros; mixed values show a placeholder", () => {
    const calls: number[] = [];
    const { rerender } = render(<NumberField id="n" label="N" value={12.5} onCommit={(v) => calls.push(v)} />);
    const input = screen.getByRole("textbox", { name: "N" }) as HTMLInputElement;
    expect(input.value).toBe("12.5");
    fireEvent.change(input, { target: { value: "3,25" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(calls).toEqual([3.25]);
    rerender(<NumberField id="n" label="N" value={null} onCommit={() => {}} />);
    expect((screen.getByRole("textbox", { name: "N" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("textbox", { name: "N" })).toHaveAttribute("placeholder", "Mixed");
  });
});

describe("InspectorPanel", () => {
  it("shows the position, size, rotation and opacity of the selection", () => {
    setup();
    expect(field("X").value).toBe("100");
    expect(field("Y").value).toBe("50");
    expect(field("W").value).toBe("200");
    expect(field("H").value).toBe("100");
    expect(field("Rotation").value).toBe("0");
    expect(field("Opacity").value).toBe("100");
  });

  it("moves the object when X or Y is committed", () => {
    const t = setup();
    fireEvent.change(field("X"), { target: { value: "250" } });
    fireEvent.keyDown(field("X"), { key: "Enter" });
    expect(t.doc.get("a")!.x).toBe(250);
    fireEvent.change(field("Y"), { target: { value: "-20" } });
    fireEvent.blur(field("Y"));
    expect(t.doc.get("a")!.y).toBe(-20);
  });

  it("resizes from the top-left corner; arrows nudge by 1 and Shift by 10", async () => {
    const t = setup();
    fireEvent.keyDown(field("W"), { key: "ArrowUp" });
    expect(t.doc.get("a")!.w).toBe(201);
    await waitFor(() => expect(field("W").value).toBe("201"));
    fireEvent.keyDown(field("W"), { key: "ArrowUp", shiftKey: true });
    expect(t.doc.get("a")).toMatchObject({ w: 211, x: 100, y: 50, h: 100 });
    fireEvent.change(field("H"), { target: { value: "0" } });
    fireEvent.keyDown(field("H"), { key: "Enter" });
    expect(t.doc.get("a")!.h).toBe(1); // never collapses
  });

  it("rotation is in degrees", () => {
    const t = setup();
    fireEvent.change(field("Rotation"), { target: { value: "90" } });
    fireEvent.keyDown(field("Rotation"), { key: "Enter" });
    expect(t.doc.get("a")!.rotation).toBeCloseTo(Math.PI / 2);
    act(() => t.doc.update("a", { rotation: Math.PI / 4 }));
    return waitFor(() => expect(field("Rotation").value).toBe("45"));
  });

  it("opacity is a percentage", () => {
    const t = setup();
    fireEvent.change(field("Opacity"), { target: { value: "40" } });
    fireEvent.keyDown(field("Opacity"), { key: "Enter" });
    expect(t.doc.get("a")!.opacity).toBeCloseTo(0.4);
    fireEvent.change(field("Opacity"), { target: { value: "250" } });
    fireEvent.keyDown(field("Opacity"), { key: "Enter" });
    expect(t.doc.get("a")!.opacity).toBe(1);
  });

  it("aspect lock keeps the ratio: on by default for images, toggleable", async () => {
    const t = setup([obj("image", "i", { x: 0, y: 0, w: 200, h: 100, assetId: "x" }), obj("shape", "s", { w: 200, h: 100 })], ["i"]);
    const lock = screen.getByRole("button", { name: "Lock aspect ratio" });
    expect(lock).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(field("W"), { target: { value: "400" } });
    fireEvent.keyDown(field("W"), { key: "Enter" });
    expect(t.doc.get("i")).toMatchObject({ w: 400, h: 200 });
    fireEvent.click(lock);
    expect(screen.getByRole("button", { name: "Lock aspect ratio" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(field("H").value).toBe("200"));
    fireEvent.change(field("H"), { target: { value: "50" } });
    fireEvent.keyDown(field("H"), { key: "Enter" });
    expect(t.doc.get("i")).toMatchObject({ w: 400, h: 50 });
  });

  it("aspect lock is off by default for shapes and on when toggled", () => {
    const t = setup();
    const lock = screen.getByRole("button", { name: "Lock aspect ratio" });
    expect(lock).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lock);
    fireEvent.change(field("H"), { target: { value: "200" } });
    fireEvent.keyDown(field("H"), { key: "Enter" });
    expect(t.doc.get("a")).toMatchObject({ w: 400, h: 200 });
  });

  it("each edit is one undo step", () => {
    const t = setup();
    const steps = t.doc.undoManager.undoStack.length;
    fireEvent.change(field("X"), { target: { value: "1" } });
    fireEvent.keyDown(field("X"), { key: "Enter" });
    fireEvent.change(field("Y"), { target: { value: "2" } });
    fireEvent.keyDown(field("Y"), { key: "Enter" });
    expect(t.doc.undoManager.undoStack.length).toBe(steps + 2);
    t.doc.undo();
    expect(t.doc.get("a")).toMatchObject({ x: 1, y: 50 });
  });

  it("for several objects shows the combined box and moves them together", () => {
    const t = setup(undefined, ["a", "b"]);
    expect(field("X").value).toBe("100");
    expect(field("W").value).toBe("360");
    expect(field("H").value).toBe("290");
    expect(screen.getByText("2 objects")).toBeInTheDocument();
    fireEvent.change(field("X"), { target: { value: "110" } });
    fireEvent.keyDown(field("X"), { key: "Enter" });
    expect(t.doc.get("a")!.x).toBe(110);
    expect(t.doc.get("b")!.x).toBe(410);
  });

  it("shows a mixed rotation and opacity as empty", () => {
    const t = makeEditor([obj("shape", "a", { rotation: 0.5 }), obj("shape", "b", { opacity: 0.5 })]);
    t.selection.set(["a", "b"]);
    t.render(<InspectorPanel />);
    expect(field("Rotation")).toHaveAttribute("placeholder", "Mixed");
    expect(field("Opacity")).toHaveAttribute("placeholder", "Mixed");
  });

  it("disables the fields for locked objects and for nothing selected", () => {
    const t = setup([obj("shape", "a", { locked: true })], ["a"]);
    expect(field("X")).toBeDisabled();
    expect(t.doc.get("a")!.locked).toBe(true);
    document.body.innerHTML = "";
    const u = makeEditor([obj("shape", "a")]);
    u.render(<InspectorPanel />);
    expect(screen.getByText("Select something to see its properties.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "X" })).toBeNull();
  });

  it("follows the selection and live changes (a drag on the canvas)", async () => {
    const t = setup();
    act(() => t.selection.set(["b"]));
    expect(field("X").value).toBe("400");
    act(() => t.doc.update("b", { x: 777 }));
    await waitFor(() => expect(field("X").value).toBe("777"));
  });

  it("changing the width of several objects scales them together about the top-left corner of the selection", () => {
    const t = makeEditor([obj("shape", "a", { x: 0, y: 0, w: 100, h: 100 }), obj("shape", "b", { x: 200, y: 0, w: 100, h: 100 })]);
    t.selection.set(["a", "b"]);
    t.render(<InspectorPanel />);
    fireEvent.change(field("W"), { target: { value: "600" } });
    fireEvent.keyDown(field("W"), { key: "Enter" });
    expect(t.doc.get("b")).toMatchObject({ x: 400, w: 200 });
    expect(t.doc.get("a")).toMatchObject({ x: 0, w: 200 });
  });
});
