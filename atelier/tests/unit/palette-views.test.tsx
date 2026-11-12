import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteView } from "@/components/canvas/objects/PaletteView";
import { SwatchView } from "@/components/canvas/objects/SwatchView";
import { OBJECT_VIEWS } from "@/components/canvas/ObjectLayer";
import { toastStore } from "@/components/chrome/Toast";
import { HighlightStore } from "@/lib/engine/color/highlight";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { PaletteObj, SwatchObj } from "@/lib/engine/model/types";

const palette = (over: Partial<PaletteObj> = {}): PaletteObj =>
  ({
    ...defaultsFor("palette"),
    id: "p1",
    index: "a0",
    createdAt: 1,
    updatedAt: 1,
    swatches: [
      { hex: "#dc1e28", weight: 0.62, name: "", locked: false },
      { hex: "#1e50dc", weight: 0.3, name: "Harbour", locked: true },
      { hex: "#f5f2ec", weight: 0.08, name: "", locked: false },
    ],
    ...over,
  }) as PaletteObj;
const swatch = (over: Partial<SwatchObj> = {}): SwatchObj =>
  ({ ...defaultsFor("swatch"), id: "s1", index: "a0", createdAt: 1, updatedAt: 1, hex: "#2f4a6d", name: "Ink", ...over }) as SwatchObj;

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  for (const t of [...toastStore.items]) toastStore.dismiss(t.id);
});

describe("PaletteView", () => {
  it("is registered for the palette and swatch types (no placeholder)", () => {
    const PaletteEntry = OBJECT_VIEWS.palette;
    const SwatchEntry = OBJECT_VIEWS.swatch;
    const { container } = render(<PaletteEntry obj={palette()} doc={{} as never} assets={{} as never} lod={1} />);
    expect(container.querySelector("[data-placeholder]")).toBeNull();
    const sw = render(<SwatchEntry obj={swatch()} doc={{} as never} assets={{} as never} lod={1} />);
    expect(sw.container.querySelector("[data-placeholder]")).toBeNull();
  });

  it("shows each colour with its hex and percentage as text, in a list", () => {
    render(<PaletteView obj={palette()} store={new HighlightStore()} />);
    const list = screen.getByRole("list", { name: /palette/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("#dc1e28")).toBeInTheDocument();
    expect(within(items[0]).getByText("62%")).toBeInTheDocument();
    expect(within(items[1]).getByText("Harbour")).toBeInTheDocument();
    expect(within(items[2]).getByText("8%")).toBeInTheDocument();
  });

  it("a locked chip's accessible name says so", () => {
    render(<PaletteView obj={palette()} store={new HighlightStore()} />);
    expect(screen.getByRole("button", { name: /Harbour.*locked/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#dc1e28/ }).getAttribute("aria-label")).not.toMatch(/locked/i);
  });

  it("clicking a chip toggles the highlight and aria-pressed", () => {
    const store = new HighlightStore();
    render(<PaletteView obj={palette()} store={store} />);
    const chip = screen.getByRole("button", { name: /#dc1e28/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(store.hex).toBe("#dc1e28");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveAttribute("data-highlight-chip");
    fireEvent.click(chip);
    expect(store.hex).toBeNull();
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("Escape (through the store being cleared) un-presses the chip", () => {
    const store = new HighlightStore();
    render(<PaletteView obj={palette()} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: /#dc1e28/ }));
    act(() => store.set(null));
    expect(screen.getByRole("button", { name: /#dc1e28/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("hides percentages when showWeights is off but keeps the hex", () => {
    render(<PaletteView obj={palette({ showWeights: false })} store={new HighlightStore()} />);
    expect(screen.queryByText("62%")).toBeNull();
    expect(screen.getByText("#dc1e28")).toBeInTheDocument();
  });

  it("says so when there are no colours", () => {
    render(<PaletteView obj={palette({ swatches: [], live: true })} store={new HighlightStore()} />);
    expect(screen.getByText(/no colours yet/i)).toBeInTheDocument();
  });

  it("renders hostile names as text", () => {
    render(<PaletteView obj={palette({ swatches: [{ hex: "#dc1e28", weight: 1, name: "<img src=x onerror=alert(1)>", locked: true }] })} store={new HighlightStore()} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("SwatchView", () => {
  it("shows the name and the value in the chosen format", () => {
    const { rerender } = render(<SwatchView obj={swatch()} />);
    expect(screen.getByText("Ink")).toBeInTheDocument();
    expect(screen.getByText("#2f4a6d")).toBeInTheDocument();
    rerender(<SwatchView obj={swatch({ format: "rgb" })} />);
    expect(screen.getByText("rgb(47 74 109)")).toBeInTheDocument();
    rerender(<SwatchView obj={swatch({ format: "hsl" })} />);
    expect(screen.getByText("hsl(214 40% 31%)")).toBeInTheDocument();
    rerender(<SwatchView obj={swatch({ format: "oklch" })} />);
    expect(screen.getByText("oklch(0.40 0.07 255)")).toBeInTheDocument();
  });

  it("clicking the colour copies the value and says so in a toast", async () => {
    render(<SwatchView obj={swatch({ format: "rgb" })} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("rgb(47 74 109)");
    expect(toastStore.items.map((t) => t.message)).toContain("Copied rgb(47 74 109)");
  });

  it("tells the owner when the clipboard is unavailable", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<SwatchView obj={swatch()} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    await act(async () => {});
    expect(toastStore.items.map((t) => t.message).join("|")).toMatch(/couldn't copy/i);
  });

  it("an unnamed swatch shows only its value", () => {
    render(<SwatchView obj={swatch({ name: "" })} />);
    expect(screen.getByText("#2f4a6d")).toBeInTheDocument();
  });
});
