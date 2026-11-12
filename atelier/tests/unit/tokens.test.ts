import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Bodies of every rule whose selector list contains `selector` exactly, joined. */
function block(selector: string): string {
  const bodies: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(m[2]);
  }
  if (bodies.length === 0) throw new Error(`no block for ${selector}`);
  return bodies.join("\n");
}

function vars(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const light = vars(block(":root"));
const dark = vars(block('[data-theme="dark"]'));

describe("design tokens", () => {
  const colours = [
    "bg",
    "surface",
    "ink",
    "muted",
    "border",
    "accent",
    "danger",
    "selection",
  ].map((n) => `--color-${n}`);

  it.each(colours)("defines %s in light", (name) => {
    expect(light.has(name)).toBe(true);
  });

  it("redefines every --color-* in the dark theme", () => {
    const lightColours = [...light.keys()].filter((k) => k.startsWith("--color-"));
    expect(lightColours.length).toBeGreaterThanOrEqual(colours.length);
    for (const name of lightColours) expect(dark.has(name), `${name} missing in dark`).toBe(true);
  });

  it("uses the ink-blue accent in light and the lighter blue in dark", () => {
    expect(light.get("--color-accent")?.toUpperCase()).toBe("#2F4A6D");
    expect(dark.get("--color-accent")?.toUpperCase()).toBe("#8FA8CC");
  });

  it("never uses pure white or black as the canvas", () => {
    for (const v of [light.get("--color-bg"), dark.get("--color-bg")]) {
      expect(v?.toUpperCase()).not.toBe("#FFFFFF");
      expect(v?.toUpperCase()).not.toBe("#000000");
    }
    expect(light.get("--color-bg")?.toUpperCase()).toBe("#F5F2EC");
    expect(dark.get("--color-bg")?.toUpperCase()).toBe("#121212");
    expect(light.get("--color-surface")?.toUpperCase()).toBe("#FFFFFF");
  });

  it.each(["sm", "md", "lg"])("defines --radius-%s", (n) => {
    expect(light.has(`--radius-${n}`)).toBe(true);
  });

  it("defines --space-1..8 on a 4px grid", () => {
    for (let i = 1; i <= 8; i++) {
      const v = light.get(`--space-${i}`);
      expect(v, `--space-${i}`).toBeDefined();
      const px = Number.parseFloat(v!);
      expect(v!.endsWith("px")).toBe(true);
      expect(px % 4).toBe(0);
    }
  });

  it.each([1, 2, 3])("defines --elev-%i", (n) => {
    expect(light.has(`--elev-${n}`)).toBe(true);
  });

  it.each(["canvas", "overlay", "toolbar", "panel", "menu", "modal", "toast"])("defines --z-%s", (n) => {
    expect(light.has(`--z-${n}`)).toBe(true);
  });

  it("z-index scale is strictly increasing", () => {
    const order = ["canvas", "overlay", "toolbar", "panel", "menu", "modal", "toast"].map((n) =>
      Number(light.get(`--z-${n}`)),
    );
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it("defines the motion tokens", () => {
    expect(light.get("--ease-out")).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(light.get("--dur-fast")).toBe("150ms");
    expect(light.get("--dur-base")).toBe("200ms");
  });
});
