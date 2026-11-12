// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { COLOR_FALLBACK, SWATCHES, cssColorToHex, swatchLabel } from "@/components/chrome/swatches";

describe("swatches", () => {
  it("are token references only, with distinct names", () => {
    for (const s of SWATCHES) expect(s.value).toMatch(/^var\(--[a-z-]+\)$/);
    expect(new Set(SWATCHES.map((s) => s.label)).size).toBe(SWATCHES.length);
  });

  it("names a colour, none, or a custom one", () => {
    expect(swatchLabel("var(--sticky-mint)")).toBe("Mint");
    expect(swatchLabel(null)).toBe("None");
    expect(swatchLabel("#123456")).toBe("Custom");
  });
});

describe("cssColorToHex", () => {
  it("passes a six-digit hex through, lower-cased", () => {
    expect(cssColorToHex("#ABCDEF")).toBe("#abcdef");
  });

  it("resolves rgb() through the browser", () => {
    expect(cssColorToHex("rgb(10, 20, 30)")).toBe("#0a141e");
  });

  it("falls back for what cannot be resolved", () => {
    expect(cssColorToHex("var(--nope)")).toBe(COLOR_FALLBACK);
    expect(cssColorToHex("not a colour", "#fff")).toBe("#fff");
  });
});
