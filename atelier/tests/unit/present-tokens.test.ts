import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function vars(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(",").map((x) => x.trim()).includes(selector)) continue;
    for (const v of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(v[1], v[2].trim());
  }
  return out;
}

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("presentation tokens", () => {
  for (const [theme, selector] of [["light", ":root"], ["dark", '[data-theme="dark"]']] as const) {
    const t = vars(selector);
    it(`${theme}: the laser is at least 3:1 on the canvas, on a white slide and on the letterbox`, () => {
      const laser = t.get("--color-laser")!;
      expect(laser).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(laser, t.get("--color-bg")!)).toBeGreaterThanOrEqual(3);
      expect(contrast(laser, "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(contrast(laser, t.get("--color-present-bg")!)).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: the letterbox is neither pure black nor pure white`, () => {
      const bg = t.get("--color-present-bg")!.toLowerCase();
      expect(bg).not.toBe("#000000");
      expect(bg).not.toBe("#ffffff");
    });
  }

  it("stacks the presentation above the toasts", () => {
    const root = vars(":root");
    expect(Number(root.get("--z-present"))).toBeGreaterThan(Number(root.get("--z-toast")));
  });
});
