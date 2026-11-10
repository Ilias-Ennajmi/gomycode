import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARK_CARDS, WORDMARK } from "@/components/brand/paths";
import * as source from "../../scripts/brand-paths.mjs";
import { BRAND } from "@/lib/theme/brand";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("brand assets", () => {
  it("in-app paths mirror scripts/brand-paths.mjs", () => {
    expect(MARK_CARDS).toEqual(source.MARK_CARDS);
    expect(WORDMARK).toEqual(source.WORDMARK);
    expect(source.COLORS.lime).toBe(BRAND.lime);
    expect(source.COLORS.ink).toBe(BRAND.ink);
  });

  it("the three cards stay inside the adaptive-icon safe zone (21..87)", () => {
    for (const { d } of MARK_CARDS) {
      // Absolute moves and lines (M, H, V) mark the extremes; arcs and relative steps only round corners inward.
      const nums = [...d.matchAll(/[MHV]\s*([-\d.\s]+)/g)].flatMap((m) => m[1].trim().split(/\s+/).map(Number));
      for (const n of nums.filter((x) => x > 1)) {
        expect(n).toBeGreaterThanOrEqual(21);
        expect(n).toBeLessThanOrEqual(87.5);
      }
    }
  });

  it("generated icon files carry the current mark and colours", () => {
    const icon = read("public/icons/icon.svg");
    for (const c of MARK_CARDS) expect(icon).toContain(c.d);
    expect(icon).toContain(BRAND.lime);
    expect(icon).toContain(BRAND.ink);
    const fg = read("android/app/src/main/res/drawable/ic_launcher_foreground.xml");
    for (const c of MARK_CARDS) expect(fg).toContain(c.d);
    expect(read("android/app/src/main/res/values/colors.xml")).toContain(`<color name="splashBackground">${BRAND.ink.toUpperCase()}</color>`);
  });

  it("the Android shell is 1.2.0 for the new launcher icon", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain("def appVersionCode = 3");
    expect(gradle).toContain('def appVersionName = "1.2.0"');
  });
});
