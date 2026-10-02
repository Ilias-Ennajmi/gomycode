import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, clampScale, normalize, resolveTheme } from "@/lib/theme/appearance";
import { BRAND } from "@/lib/theme/brand";

const tokens = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

function block(selector: string): string {
  const i = tokens.indexOf(selector);
  return tokens.slice(i, tokens.indexOf("}", i));
}

describe("appearance", () => {
  it("normalizes junk to defaults", () => {
    expect(normalize(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalize({ theme: "neon", accent: 5, density: 7 })).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to lime when custom has no valid colour", () => {
    expect(normalize({ accent: "custom", accentCustom: "red" }).accent).toBe("lime");
    expect(normalize({ accent: "custom", accentCustom: "#ABCDEF" })).toMatchObject({
      accent: "custom",
      accentCustom: "#abcdef",
    });
  });

  it("clamps text scale to 90–130%", () => {
    expect(clampScale(2)).toBe(1.3);
    expect(clampScale(0.5)).toBe(0.9);
    expect(clampScale(NaN)).toBe(1);
  });

  it("resolves system to the OS theme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("black", false)).toBe("black");
  });
});

describe("tokens", () => {
  it("brand constants match tokens.css", () => {
    expect(block('[data-theme="light"]').toLowerCase()).toContain(`--background: ${BRAND.backgroundLight}`);
    expect(block('[data-theme="dark"]').toLowerCase()).toContain(`--background: ${BRAND.backgroundDark}`);
    expect(tokens.toLowerCase()).toContain(`--accent-lime: ${BRAND.accent}`);
  });

  it("every theme defines the same colour tokens", () => {
    const names = (s: string) => [...s.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]).sort();
    const light = names(block('[data-theme="light"]'));
    expect(names(block('[data-theme="dark"]'))).toEqual(light);
    expect(names(block('[data-theme="black"]'))).toEqual(light);
  });

  it("black theme is pure black", () => {
    expect(block('[data-theme="black"]')).toContain("--background: #000000");
  });
});
