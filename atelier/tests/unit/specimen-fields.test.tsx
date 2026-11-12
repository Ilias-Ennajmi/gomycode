import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "@/components/chrome/ContextBar";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import type { TypeSpecimenObj } from "@/lib/engine/model/types";
import { registry } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { resetFontLoader } from "@/lib/engine/fonts/font-loader";
import { makeEditor, obj } from "./helpers/editor";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
  resetFontLoader();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const spec = (t: ReturnType<typeof makeEditor>) => t.doc.get("sp") as TypeSpecimenObj;
function mount() {
  const t = makeEditor([obj("typeSpecimen", "sp", { family: "Lora", x: 100, y: 100 })]);
  t.selection.set(["sp"]);
  t.render(<InspectorPanel />);
  return t;
}
/** The panel re-reads the document once per animation frame. */
const frame = () => act(() => void vi.advanceTimersByTime(20));
const family = () => screen.getByRole("combobox", { name: "Font family" }) as HTMLInputElement;

describe("type specimen fields in the Inspector", () => {
  it("shows the specimen's fields", () => {
    mount();
    expect(family().value).toBe("Lora");
    expect(screen.getByRole("combobox", { name: "Weight" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Italic" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Sample text" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Size" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Licence note" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Source URL" })).toBeTruthy();
  });

  it("typing a family is debounced 500 ms and only a valid name is written", () => {
    const t = mount();
    fireEvent.change(family(), { target: { value: "Playfair Display" } });
    act(() => void vi.advanceTimersByTime(400));
    expect(spec(t).family).toBe("Lora");
    act(() => void vi.advanceTimersByTime(150));
    expect(spec(t).family).toBe("Playfair Display");

    fireEvent.change(family(), { target: { value: "Inter; } body{" } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(spec(t).family).toBe("Playfair Display");
    expect(screen.getByText(/letters, numbers, spaces and hyphens/i)).toBeTruthy();
    expect(family().getAttribute("aria-invalid")).toBe("true");
  });

  it("offers matches from the bundled list and picks one with the keyboard", () => {
    const t = mount();
    fireEvent.focus(family());
    fireEvent.change(family(), { target: { value: "playf" } });
    const list = screen.getByRole("listbox", { name: "Font suggestions" });
    expect(within(list).getAllByRole("option")[0].textContent).toBe("Playfair Display");
    fireEvent.keyDown(family(), { key: "ArrowDown" });
    fireEvent.keyDown(family(), { key: "Enter" });
    expect(spec(t).family).toBe("Playfair Display");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("changes weight, italic, size, sample, licence and source, each as an undoable edit", () => {
    const t = mount();
    fireEvent.change(screen.getByRole("combobox", { name: "Weight" }), { target: { value: "700" } });
    expect(spec(t).weight).toBe(700);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(spec(t).italic).toBe(true);
    frame();
    expect(screen.getByRole("button", { name: "Italic" }).getAttribute("aria-pressed")).toBe("true");

    const size = screen.getByRole("textbox", { name: "Size" });
    fireEvent.change(size, { target: { value: "64" } });
    fireEvent.keyDown(size, { key: "Enter" });
    expect(spec(t).size).toBe(64);

    const sample = screen.getByRole("textbox", { name: "Sample text" });
    fireEvent.change(sample, { target: { value: "Handgloves" } });
    act(() => void vi.advanceTimersByTime(600));
    expect(spec(t).sample).toBe("Handgloves");

    const lic = screen.getByRole("textbox", { name: "Licence note" });
    fireEvent.change(lic, { target: { value: "SIL OFL 1.1" } });
    fireEvent.blur(lic);
    expect(spec(t).licenceNote).toBe("SIL OFL 1.1");

    const src = screen.getByRole("textbox", { name: "Source URL" });
    fireEvent.change(src, { target: { value: "javascript:alert(1)" } });
    fireEvent.blur(src);
    expect(spec(t).sourceUrl).toBe("");
    expect(screen.getByText(/starting with http/i)).toBeTruthy();
    fireEvent.change(src, { target: { value: "https://fonts.google.com/specimen/Lora" } });
    fireEvent.blur(src);
    expect(spec(t).sourceUrl).toBe("https://fonts.google.com/specimen/Lora");

    t.doc.undo();
    expect(spec(t).sourceUrl).toBe("");
  });

  it("limits the sample to 500 characters", () => {
    mount();
    expect((screen.getByRole("textbox", { name: "Sample text" }) as HTMLTextAreaElement).maxLength).toBe(500);
  });
});

describe("type specimen in the selection bar and commands", () => {
  it("the bar has a Type button that opens the same fields", () => {
    const t = makeEditor([obj("typeSpecimen", "sp", { x: 100, y: 100 })]);
    t.selection.set(["sp"]);
    t.render(<ContextBar />);
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    fireEvent.click(within(bar).getByRole("button", { name: /Type: / }));
    expect(screen.getByRole("combobox", { name: "Font family" })).toBeTruthy();
  });

  it("insert.typeSpecimen puts a specimen in the middle of the view and selects it", () => {
    const t = makeEditor([]);
    expect(registry.has("insert.typeSpecimen")).toBe(true);
    expect(registry.get("insert.typeSpecimen").group).toBe("insert");
    const ctx = {
      doc: t.doc,
      selection: t.selection,
      canvas: t.handle,
      setTool: () => {},
      toast: () => {},
      clipboardStyle: { current: null },
    };
    expect(registry.run("insert.typeSpecimen", ctx)).toBe(true);
    const made = t.doc.all().filter((o) => o.type === "typeSpecimen");
    expect(made).toHaveLength(1);
    // viewport is 1000 x 800 at zoom 1, camera at the origin: the card is centred on (500, 400)
    expect(made[0].x + made[0].w / 2).toBeCloseTo(500);
    expect(made[0].y + made[0].h / 2).toBeCloseTo(400);
    expect([...t.selection.ids]).toEqual([made[0].id]);
    t.doc.undo();
    expect(t.doc.all().filter((o) => o.type === "typeSpecimen")).toHaveLength(0);
  });
});
