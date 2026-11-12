import { describe, expect, it } from "vitest";
import { aggregatePalette, imageContainsColor } from "@/lib/engine/color/aggregate";
import { deltaE, hexToOklab } from "@/lib/engine/model/color";
import type { PaletteSwatch } from "@/lib/engine/model/types";

const RED = "#dc1e28";
const BLUE = "#1e50dc";
const sum = (s: PaletteSwatch[]) => s.reduce((a, b) => a + b.weight, 0);
const opts = (over: Partial<Parameters<typeof aggregatePalette>[1]> = {}) => ({ maxColors: 8, locked: [], ...over });

describe("aggregatePalette", () => {
  it("two equal-area images with different colours give two swatches at 0.5", () => {
    const r = aggregatePalette(
      [
        { palette: [{ hex: RED, weight: 1 }], area: 100 },
        { palette: [{ hex: BLUE, weight: 1 }], area: 100 },
      ],
      opts(),
    );
    expect(r).toHaveLength(2);
    expect(r.map((s) => s.hex).sort()).toEqual([BLUE, RED].sort());
    for (const s of r) expect(s.weight).toBeCloseTo(0.5, 6);
    expect(sum(r)).toBeCloseTo(1, 6);
    expect(r.every((s) => s.name === "" && s.locked === false)).toBe(true);
  });

  it("a four times larger image dominates: 0.8 / 0.2", () => {
    const r = aggregatePalette(
      [
        { palette: [{ hex: RED, weight: 1 }], area: 400 },
        { palette: [{ hex: BLUE, weight: 1 }], area: 100 },
      ],
      opts(),
    );
    expect(r[0]).toMatchObject({ hex: RED });
    expect(r[0].weight).toBeCloseTo(0.8, 6);
    expect(r[1].weight).toBeCloseTo(0.2, 6);
  });

  it("weights an image's colours by their share of that image", () => {
    const r = aggregatePalette([{ palette: [{ hex: RED, weight: 0.75 }, { hex: BLUE, weight: 0.25 }], area: 10 }], opts());
    expect(r.map((s) => [s.hex, +s.weight.toFixed(2)])).toEqual([[RED, 0.75], [BLUE, 0.25]]);
  });

  it("maxColors 3 over six distinct colours returns exactly three, and the weights still sum to 1", () => {
    const hexes = ["#dc1e28", "#1e50dc", "#1edc50", "#dcc81e", "#dc1ec8", "#1edcd2"];
    const r = aggregatePalette(
      hexes.map((hex, i) => ({ palette: [{ hex, weight: 1 }], area: 100 + i })),
      opts({ maxColors: 3 }),
    );
    expect(r).toHaveLength(3);
    expect(sum(r)).toBeCloseTo(1, 6);
  });

  it("merges colours closer than the merge distance and keeps distinct ones apart", () => {
    const near = "#dc1e29";
    expect(deltaE(hexToOklab(RED), hexToOklab(near))).toBeLessThan(0.02);
    const r = aggregatePalette(
      [
        { palette: [{ hex: RED, weight: 1 }], area: 100 },
        { palette: [{ hex: near, weight: 1 }], area: 100 },
        { palette: [{ hex: BLUE, weight: 1 }], area: 100 },
      ],
      opts(),
    );
    expect(r).toHaveLength(2);
    expect(r[0].weight).toBeCloseTo(2 / 3, 5);
  });

  it("a locked swatch absorbs a near colour, keeping its hex, name and lock", () => {
    const near = aggregatePalette(
      [{ palette: [{ hex: "#fb0505", weight: 1 }], area: 100 }],
      opts({ locked: [{ hex: "#ff0000", weight: 0, name: "Signal", locked: true }] }),
    );
    expect(near).toEqual([{ hex: "#ff0000", weight: 1, name: "Signal", locked: true }]);
  });

  it("a locked swatch stays, with weight 0, when no image contains it", () => {
    const r = aggregatePalette([{ palette: [{ hex: BLUE, weight: 1 }], area: 100 }], opts({ locked: [{ hex: "#ff0000", weight: 0.4, name: "Signal", locked: true }] }));
    const signal = r.find((s) => s.name === "Signal")!;
    expect(signal).toMatchObject({ hex: "#ff0000", weight: 0, locked: true });
    expect(r.find((s) => s.hex === BLUE)!.weight).toBeCloseTo(1, 6);
    expect(r[r.length - 1]).toBe(signal); // weight order: the zero-weight one is last
  });

  it("locked swatches count against maxColors but are never dropped", () => {
    const locked = ["#ff0000", "#00ff00", "#0000ff"].map((hex, i) => ({ hex, weight: 0, name: `L${i}`, locked: true }));
    const r = aggregatePalette([{ palette: [{ hex: "#ffff00", weight: 1 }], area: 1 }], opts({ maxColors: 3, locked }));
    expect(r).toHaveLength(3);
    expect(r.every((s) => s.locked)).toBe(true);
  });

  it("no inputs, or no area, gives only the locked swatches", () => {
    const locked = [{ hex: "#ff0000", weight: 0.3, name: "Signal", locked: true }];
    expect(aggregatePalette([], opts({ locked }))).toEqual([{ hex: "#ff0000", weight: 0, name: "Signal", locked: true }]);
    expect(aggregatePalette([{ palette: [{ hex: RED, weight: 1 }], area: 0 }], opts({ locked })).map((s) => s.hex)).toEqual(["#ff0000"]);
    expect(aggregatePalette([], opts())).toEqual([]);
  });

  it("an all-white image gives one swatch with weight 1", () => {
    expect(aggregatePalette([{ palette: [{ hex: "#ffffff", weight: 1 }], area: 50 }], opts())).toEqual([{ hex: "#ffffff", weight: 1, name: "", locked: false }]);
  });

  it("images with an empty palette (fully transparent) contribute nothing and never produce NaN", () => {
    const r = aggregatePalette(
      [
        { palette: [], area: 100 },
        { palette: [{ hex: RED, weight: 1 }], area: 100 },
        { palette: [{ hex: "nope", weight: 1 }], area: 100 },
        { palette: [{ hex: BLUE, weight: Number.NaN }], area: 100 },
        { palette: [{ hex: BLUE, weight: 1 }], area: Number.NaN },
      ],
      opts(),
    );
    expect(r.map((s) => s.hex)).toEqual([RED]);
    expect(r[0].weight).toBeCloseTo(1, 6);
  });

  it("is deterministic and sorted by weight", () => {
    const inputs = Array.from({ length: 40 }, (_, i) => ({
      palette: [{ hex: `#${((i * 37) % 256).toString(16).padStart(2, "0")}${((i * 91) % 256).toString(16).padStart(2, "0")}${((i * 53) % 256).toString(16).padStart(2, "0")}`, weight: 1 }],
      area: 100 + i,
    }));
    const a = aggregatePalette(inputs, opts());
    expect(aggregatePalette(inputs, opts())).toEqual(a);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].weight).toBeGreaterThanOrEqual(a[i].weight);
    expect(a.length).toBeLessThanOrEqual(8);
    expect(sum(a)).toBeCloseTo(1, 6);
  });

  it("handles 2,000 images of eight colours quickly", () => {
    const inputs = Array.from({ length: 2000 }, (_, i) => ({
      palette: Array.from({ length: 8 }, (_, k) => ({ hex: `#${((i * 7 + k * 31) % 256).toString(16).padStart(2, "0")}${((i * 13 + k * 17) % 256).toString(16).padStart(2, "0")}${((i * 29 + k * 5) % 256).toString(16).padStart(2, "0")}`, weight: 1 / 8 })),
      area: 10_000,
    }));
    const t = Date.now();
    const r = aggregatePalette(inputs, opts());
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.length).toBeLessThanOrEqual(8);
    expect(sum(r)).toBeCloseTo(1, 6);
  });
});

describe("imageContainsColor", () => {
  const palette = [
    { hex: RED, weight: 0.4 },
    { hex: "#3cdc1e", weight: 0.02 },
    { hex: BLUE, weight: 0.58 },
  ];
  it("true for a 40 % colour, false for a 2 % colour and for a colour 0.3 away", () => {
    expect(imageContainsColor(palette, RED)).toBe(true);
    expect(imageContainsColor(palette, "#3cdc1e")).toBe(false);
    expect(imageContainsColor(palette, "#808080")).toBe(false);
  });
  it("accepts a colour within the tolerance and honours the options", () => {
    expect(imageContainsColor(palette, "#dc2030")).toBe(true);
    expect(imageContainsColor(palette, "#3cdc1e", { minWeight: 0.01 })).toBe(true);
    expect(imageContainsColor(palette, "#dc2030", { tolerance: 0.0001 })).toBe(false);
  });
  it("an invalid hex or empty palette matches nothing", () => {
    expect(imageContainsColor([], RED)).toBe(false);
    expect(imageContainsColor(palette, "not a colour")).toBe(false);
  });
});
