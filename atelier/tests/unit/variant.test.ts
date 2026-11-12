import { describe, expect, it } from "vitest";
import { pickVariant, type ChosenVariant } from "@/lib/engine/render/variant";
import type { VariantName } from "@/lib/assets/variants";

const ALL: VariantName[] = ["w256", "w1024", "w2048"];
const base = { dpr: 1, cropFraction: 1, available: ALL, originalLongest: 4000, loaded: null as ChosenVariant | null, gesture: false };
const pick = (over: Partial<Parameters<typeof pickVariant>[0]> & { onScreenPx: number }) => pickVariant({ ...base, ...over });

describe("pickVariant", () => {
  it("picks the smallest variant that covers the pixels needed", () => {
    expect(pick({ onScreenPx: 200 })).toBe("w256");
    expect(pick({ onScreenPx: 256 })).toBe("w256");
    expect(pick({ onScreenPx: 300 })).toBe("w1024");
    expect(pick({ onScreenPx: 1500 })).toBe("w2048");
  });

  it("uses the original only above 2048 pixels", () => {
    expect(pick({ onScreenPx: 2048 })).toBe("w2048");
    expect(pick({ onScreenPx: 2300 })).toBe("original");
  });

  it("uses the original when the image has no variants", () => {
    expect(pick({ onScreenPx: 100, available: [] })).toBe("original");
    expect(pick({ onScreenPx: 3000, available: [] })).toBe("original");
  });

  it("doubles the need at dpr 2 and quadruples it for a 25 % crop", () => {
    expect(pick({ onScreenPx: 200, dpr: 2 })).toBe("w1024");
    expect(pick({ onScreenPx: 600, dpr: 2 })).toBe("w2048");
    expect(pick({ onScreenPx: 300, cropFraction: 0.25 })).toBe("w2048");
    expect(pick({ onScreenPx: 300, cropFraction: 1 })).toBe("w1024");
  });

  it("falls back to the largest variant, or to the original when that is the next size up", () => {
    // no w2048 (a 1500 px source): w1024 is the biggest variant; the 1500 px original is the next tier up
    expect(pick({ onScreenPx: 1200, available: ["w256", "w1024"], originalLongest: 1500 })).toBe("original");
    // a big source whose w2048 is missing: stay on the largest variant until the need passes 2048
    expect(pick({ onScreenPx: 1200, available: ["w256", "w1024"], originalLongest: 4000 })).toBe("w1024");
    expect(pick({ onScreenPx: 2500, available: ["w256", "w1024"], originalLongest: 4000 })).toBe("original");
  });

  it("never returns a variant the image does not have", () => {
    for (const px of [10, 200, 300, 900, 1500, 2100, 9000]) {
      const v = pick({ onScreenPx: px, available: ["w1024"], originalLongest: 3000 });
      expect(["w1024", "original"]).toContain(v);
    }
  });

  it("survives nonsense input", () => {
    expect(pick({ onScreenPx: NaN })).toBe("w256");
    expect(pick({ onScreenPx: -5, dpr: 0, cropFraction: 0 })).toBe("w256");
    expect(pick({ onScreenPx: Infinity })).toBe("original");
  });

  it("during a gesture never goes below the loaded tier", () => {
    expect(pick({ onScreenPx: 100, loaded: "w1024", gesture: true })).toBe("w1024");
    expect(pick({ onScreenPx: 100, loaded: "original", gesture: true })).toBe("original");
    expect(pick({ onScreenPx: 100, loaded: "w256", gesture: true })).toBe("w256");
  });

  it("settled, downgrades only when the need is under half the loaded tier", () => {
    // loaded original (4000 px): 60 % of it keeps the original, 40 % goes to the smaller tier that covers it
    expect(pick({ onScreenPx: 2400, loaded: "original", originalLongest: 4000 })).toBe("original");
    expect(pick({ onScreenPx: 2000, loaded: "original", originalLongest: 4000 })).toBe("original"); // exactly half: keep
    expect(pick({ onScreenPx: 1600, loaded: "original", originalLongest: 4000 })).toBe("w2048");
    expect(pick({ onScreenPx: 200, loaded: "w1024" })).toBe("w256");
    expect(pick({ onScreenPx: 520, loaded: "w2048" })).toBe("w1024");
  });

  it("upgrades straight away, even with a tier loaded", () => {
    expect(pick({ onScreenPx: 1500, loaded: "w256" })).toBe("w2048");
    expect(pick({ onScreenPx: 3000, loaded: "w1024" })).toBe("original");
  });

  it("ignores a loaded tier the image does not have", () => {
    expect(pick({ onScreenPx: 200, loaded: "w2048", available: ["w256"] })).toBe("w256");
  });
});
