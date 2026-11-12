import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { BRAND } from "@/lib/theme";

const root = process.cwd();
const publicFile = (p: string) => join(root, "public", p.replace(/^\//, ""));

describe("web app manifest", () => {
  const m = manifest();

  it("describes an installable standalone app", () => {
    expect(m).toMatchObject({
      name: "Atelier",
      short_name: "Atelier",
      start_url: "/",
      display: "standalone",
      background_color: "#F5F2EC",
      theme_color: "#141414",
    });
    expect(m.scope).toBe("/");
    expect(m.id).toBe("/");
    expect(m.description).toBeTruthy();
  });

  it("uses the brand colours from lib/theme", () => {
    expect(m.background_color).toBe(BRAND.paper);
    expect(m.theme_color).toBe(BRAND.ink);
  });

  it("offers 192, 512 and a maskable 512 icon, all present on disk", () => {
    const icons = m.icons ?? [];
    const by = (src: string) => icons.find((i) => i.src === src);
    expect(by("/brand/icon-192.png")).toMatchObject({ sizes: "192x192", type: "image/png", purpose: "any" });
    expect(by("/brand/icon-512.png")).toMatchObject({ sizes: "512x512", type: "image/png", purpose: "any" });
    expect(by("/brand/icon-maskable-512.png")).toMatchObject({ sizes: "512x512", type: "image/png", purpose: "maskable" });
    for (const i of icons) expect(existsSync(publicFile(i.src)), i.src).toBe(true);
  });

  it("never mixes 'any' and 'maskable' in one icon entry", () => {
    for (const i of m.icons ?? []) expect(String(i.purpose)).not.toMatch(/any.*maskable|maskable.*any/);
  });
});

describe("offline page", () => {
  const html = readFileSync(publicFile("offline.html"), "utf8");
  const tokens = readFileSync(join(root, "styles/tokens.css"), "utf8").toLowerCase();

  it("is self-contained: no external files, no scripts except the inline reload", () => {
    expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).toMatch(/viewport/);
    expect(html).toMatch(/Atelier/);
    expect(html).toMatch(/Try again/);
  });

  it("repeats the token colours it cannot import (paper, ink, muted; dark paper, ink, muted)", () => {
    const page = html.toLowerCase();
    for (const hex of ["#f5f2ec", "#141414", "#5e5b55", "#121212", "#f2f0eb", "#a5a29b"]) {
      expect(tokens, `${hex} in tokens.css`).toContain(hex);
      expect(page, `${hex} in offline.html`).toContain(hex);
    }
  });
});
