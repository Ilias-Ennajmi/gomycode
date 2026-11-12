import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "@/components/chrome/ContextBar";
import type { PaletteObj, SwatchObj } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

const bar = () => screen.getByRole("toolbar", { name: "Selection" });
const inBar = (name: string | RegExp) => within(bar()).getByRole("button", { name });

afterEach(() => vi.restoreAllMocks());

describe("selection bar for colour objects", () => {
  it("a swatch offers copy and a format button that cycles", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const t = makeEditor([obj("swatch", "s", { hex: "#2f4a6d", x: 100, y: 200 })]);
    t.render(<ContextBar />);
    act(() => t.selection.set(["s"]));
    expect(inBar(/colour format HEX/i)).toBeInTheDocument();
    fireEvent.click(inBar(/colour format HEX/i));
    expect((t.doc.get("s") as SwatchObj).format).toBe("rgb");
    expect(inBar(/colour format RGB/i)).toBeInTheDocument();
    fireEvent.click(inBar("Copy colour value"));
    expect(writeText).toHaveBeenCalledWith("rgb(47 74 109)");
  });

  it("a palette offers Live (pressed when live) and the Palette panel", () => {
    const t = makeEditor([obj("palette", "p", { live: true, x: 100, y: 200 })]);
    t.render(<ContextBar />);
    act(() => t.selection.set(["p"]));
    expect(inBar("Live palette")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(inBar("Live palette"));
    expect((t.doc.get("p") as PaletteObj).live).toBe(false);
    expect(inBar("Palette panel")).toBeInTheDocument();
  });
});
