import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastInk, LIGHT_TOKENS, resolveColor } from "@/lib/engine/export/colors";

const css = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const lightBlock = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].split(",").map((s) => s.trim()).includes(":root") && /--color-ink/.test(m[2]))![2];
const light = new Map([...lightBlock.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));

describe("resolveColor", () => {
  it("keeps the light token table in step with styles/tokens.css", () => {
    for (const [name, hex] of Object.entries(LIGHT_TOKENS)) expect(light.get(name), name).toBe(hex);
  });
  it("resolves tokens, hex, rgb, hsl and keywords to #rrggbb", () => {
    expect(resolveColor("var(--color-ink)")).toBe("#141414");
    expect(resolveColor("var(--sticky-mint)")).toBe("#bfe6cf");
    expect(resolveColor("#ABC")).toBe("#aabbcc");
    expect(resolveColor("#112233cc")).toBe("#112233");
    expect(resolveColor("rgb(255 0 128)")).toBe("#ff0080");
    expect(resolveColor("rgba(0, 0, 255, 0.5)")).toBe("#0000ff");
    expect(resolveColor("hsl(0 100% 50%)")).toBe("#ff0000");
    expect(resolveColor("black")).toBe("#000000");
    expect(resolveColor("transparent")).toBeNull();
    expect(resolveColor(null, "#123456")).toBe("#123456");
  });
  it("never lets an unknown value through", () => {
    expect(resolveColor("url(https://evil/x)", "#111111")).toBe("#111111");
    expect(resolveColor("var(--nope)", "#222222")).toBe("#222222");
    expect(resolveColor("expression(alert(1))", "#333333")).toBe("#333333");
  });
});

describe("contrastInk", () => {
  it("picks dark ink on light colours and white on dark ones", () => {
    expect(contrastInk("#f6e58d")).toBe("#141414");
    expect(contrastInk("#2f4a6d")).toBe("#ffffff");
  });
});
