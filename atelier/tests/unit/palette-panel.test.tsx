import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PalettePanel } from "@/components/panels/PalettePanel";
import { DEFAULT_PANELS } from "@/components/panels/PanelHost";
import { AssetMetaStore, type AssetMeta } from "@/lib/assets/meta-store";
import { getHighlightStore } from "@/lib/engine/color/highlight";
import type { PaletteObj, SwatchObj } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

const download = vi.fn();
vi.mock("@/lib/download", async (orig) => ({ ...(await orig<typeof import("@/lib/download")>()), downloadBlob: (...a: unknown[]) => download(...a) }));

const A1 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e81";
const SWATCHES = [
  { hex: "#dc1e28", weight: 0.62, name: "", locked: false },
  { hex: "#1e50dc", weight: 0.3, name: "Harbour", locked: true },
  { hex: "#f5f2ec", weight: 0.08, name: "", locked: false },
];
const palette = (extra: Record<string, unknown> = {}) => obj("palette", "p1", { swatches: SWATCHES, live: true, ...extra });
const meta = (id: string, palette: AssetMeta["palette"]): AssetMeta => ({ id, kind: "image", width: 100, height: 100, bytes: 1, variants: ["w1024"], palette, phash: null, title: "", provenance: null, analysisVersion: 1 });

function mount(objs = [palette()], select = true, store = new AssetMetaStore({ persist: false })) {
  const t = makeEditor(objs);
  if (select && objs.some((o) => o.id === "p1")) t.selection.set(["p1"]);
  const r = t.render(<PalettePanel meta={store} />);
  return { ...t, store, unmount: r.unmount };
}
const p = (t: { doc: ReturnType<typeof makeEditor>["doc"] }) => t.doc.get("p1") as PaletteObj;

beforeEach(() => download.mockReset());
afterEach(() => {
  getHighlightStore().set(null);
  delete (window as unknown as { EyeDropper?: unknown }).EyeDropper;
});

describe("PalettePanel is registered", () => {
  it("as the 'palette' panel", () => {
    expect(DEFAULT_PANELS.map((d) => d.id)).toContain("palette");
  });
});

describe("PalettePanel list", () => {
  it("lists each colour with its hex, share and a weight bar", () => {
    mount();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("#dc1e28")).toBeInTheDocument();
    expect(within(rows[0]).getByText("62%")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("weight-bar")).toHaveStyle({ width: "62%" });
    expect((within(rows[1]).getByRole("textbox", { name: /name of #1e50dc/i }) as HTMLInputElement).value).toBe("Harbour");
  });

  it("clicking a colour toggles the board highlight; closing the panel clears it", () => {
    const { unmount } = mount();
    const chip = screen.getByRole("button", { name: /highlight #dc1e28/i });
    fireEvent.click(chip);
    expect(getHighlightStore().hex).toBe("#dc1e28");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    unmount();
    expect(getHighlightStore().hex).toBeNull();
  });

  it("renaming a colour keeps it (locks it) as one undo step", () => {
    const t = mount();
    const input = screen.getByRole("textbox", { name: /name of #dc1e28/i });
    fireEvent.change(input, { target: { value: "Brick" } });
    fireEvent.blur(input);
    expect(p(t).swatches[0]).toMatchObject({ hex: "#dc1e28", name: "Brick", locked: true });
    t.doc.undo();
    expect(p(t).swatches[0]).toMatchObject({ name: "", locked: false });
  });

  it("the lock button toggles a swatch", () => {
    const t = mount();
    fireEvent.click(screen.getByRole("button", { name: /lock #f5f2ec/i }));
    expect(p(t).swatches[2].locked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /lock #f5f2ec/i }));
    expect(p(t).swatches[2].locked).toBe(false);
  });

  it("copies a hex and pulls a colour out as a swatch card", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const t = mount();
    fireEvent.click(screen.getByRole("button", { name: /copy #dc1e28/i }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("#dc1e28");
    fireEvent.click(screen.getByRole("button", { name: /pull out #1e50dc as a swatch card/i }));
    const card = t.doc.all().find((o) => o.type === "swatch") as SwatchObj;
    expect(card).toMatchObject({ hex: "#1e50dc", name: "Harbour" });
    t.doc.undo();
    expect(t.doc.all().some((o) => o.type === "swatch")).toBe(false);
  });

  it("a swatch that is kept can be removed", () => {
    const t = mount();
    expect(screen.queryByRole("button", { name: /remove #dc1e28/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /remove #1e50dc/i }));
    expect(p(t).swatches.map((s) => s.hex)).toEqual(["#dc1e28", "#f5f2ec"]);
  });
});

describe("Add a colour", () => {
  it("adds a typed hex as a locked swatch; refuses text that is not a colour", () => {
    const t = mount();
    const input = screen.getByRole("textbox", { name: /hex colour/i });
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /^add colour$/i }));
    expect(screen.getByText(/not a colour/i)).toBeInTheDocument();
    expect(p(t).swatches).toHaveLength(3);
    fireEvent.change(input, { target: { value: "#2F4A6D" } });
    fireEvent.click(screen.getByRole("button", { name: /^add colour$/i }));
    expect(p(t).swatches[3]).toMatchObject({ hex: "#2f4a6d", locked: true, weight: 0 });
  });

  it("offers the screen picker only where the browser has an EyeDropper, and uses it", async () => {
    mount();
    expect(screen.queryByRole("button", { name: /pick from screen/i })).toBeNull();
    document.body.innerHTML = "";
    (window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#12AB34" });
      }
    };
    const t = mount();
    fireEvent.click(screen.getByRole("button", { name: /pick from screen/i }));
    await act(async () => {});
    expect(p(t).swatches.map((s) => s.hex)).toContain("#12ab34");
  });
});

describe("palette settings", () => {
  it("toggles live and sets the maximum number of colours", () => {
    const t = mount();
    fireEvent.click(screen.getByRole("switch", { name: /live/i }));
    expect(p(t).live).toBe(false);
    const max = screen.getByRole("textbox", { name: /max colours/i });
    fireEvent.change(max, { target: { value: "5" } });
    fireEvent.blur(max);
    expect(p(t).maxColors).toBe(5);
  });
  it("switches the layout and the percentages", () => {
    const t = mount();
    fireEvent.click(screen.getByRole("button", { name: /grid layout/i }));
    expect(p(t).layout).toBe("grid");
    fireEvent.click(screen.getByRole("switch", { name: /show percentages/i }));
    expect(p(t).showWeights).toBe(false);
  });
});

describe("without a palette on the board", () => {
  it("shows the board's colours from the images and can add a palette", () => {
    const store = new AssetMetaStore({ persist: false });
    store.put(meta(A1, [{ hex: "#dc1e28", weight: 0.7 }, { hex: "#1e50dc", weight: 0.3 }]));
    const t = mount([obj("image", "i1", { assetId: A1, w: 100, h: 100 })], false, store);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /name of #dc1e28/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /add palette to board/i }));
    const created = t.doc.all().find((o) => o.type === "palette") as PaletteObj;
    expect(created.live).toBe(true);
    expect([...t.selection.ids]).toEqual([created.id]);
  });

  it("says so when the board has no colours", () => {
    mount([], false);
    expect(screen.getByText(/no colours yet/i)).toBeInTheDocument();
  });

  it("adding a typed colour creates a palette first", () => {
    const t = mount([], false);
    fireEvent.change(screen.getByRole("textbox", { name: /hex colour/i }), { target: { value: "#2f4a6d" } });
    fireEvent.click(screen.getByRole("button", { name: /^add colour$/i }));
    const created = t.doc.all().find((o) => o.type === "palette") as PaletteObj;
    expect(created.swatches.map((s) => s.hex)).toEqual(["#2f4a6d"]);
  });
});

describe("Export", () => {
  it("lists every format, with the verify hint, and downloads the chosen one", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));
    expect(screen.getByText(/open them once in (adobe|procreate)/i)).toBeInTheDocument();
    const labels = ["ase", "procreate", "css variables", "tailwind v4", "tailwind config", "json"];
    for (const l of labels) expect(screen.getByRole("button", { name: new RegExp(`export.*${l}`, "i") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /export.*ase/i }));
    expect(download).toHaveBeenCalledTimes(1);
    const [name, bytes, mime] = download.mock.calls[0];
    expect(String(name)).toMatch(/\.ase$/);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from((bytes as Uint8Array).slice(0, 4))).toEqual([0x41, 0x53, 0x45, 0x46]);
    expect(mime).toBe("application/octet-stream");
  });

  it("every format produces a download", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));
    const buttons = screen.getAllByRole("button", { name: /^export .+/i }).filter((b) => b.getAttribute("data-format"));
    expect(buttons).toHaveLength(6);
    for (const b of buttons) fireEvent.click(b);
    expect(download).toHaveBeenCalledTimes(6);
    const names = download.mock.calls.map((c) => String(c[0]));
    expect(names.some((n) => n.endsWith(".swatches"))).toBe(true);
    expect(names.some((n) => n.endsWith(".json"))).toBe(true);
  });

  it("is disabled when there is nothing to export", () => {
    mount([], false);
    expect(screen.getByRole("button", { name: /^export$/i })).toBeDisabled();
  });
});
