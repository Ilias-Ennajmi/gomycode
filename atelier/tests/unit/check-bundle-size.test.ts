import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGET_BYTES, chunksForRoute, evaluateBundle, formatReport } from "../../scripts/check-share-bundle.mjs";

// Random bytes do not compress, so a chunk of N raw bytes is N (plus ~20) gzipped bytes: sizes in the fixture are exact enough.
const fixture = (kbs: number[]) => {
  const files = new Map<string, Uint8Array>();
  kbs.forEach((k, i) => files.set(`.next/static/chunks/c${i}.js`, randomBytes(Math.round(k * 1024))));
  return { chunks: [...files.keys()], read: (p: string) => files.get(p)! };
};

describe("evaluateBundle", () => {
  it("199 KB passes", () => {
    const r = evaluateBundle(fixture([120, 79]));
    expect(r.total).toBeLessThan(BUDGET_BYTES);
    expect(r.ok).toBe(true);
  });

  it("201 KB fails with a readable table", () => {
    const r = evaluateBundle(fixture([120, 81]));
    expect(r.ok).toBe(false);
    const text = formatReport(r);
    expect(text).toContain("First-load JavaScript of /s/[token]");
    expect(text).toMatch(/c0\.js\s+\d+\.\d KB/);
    expect(text).toMatch(/total\s+\d+\.\d KB\s+\(budget 200\.0 KB\)/);
    expect(text).toMatch(/FAIL: \d+\.\d KB over budget/);
  });

  it("counts a shared chunk once and ignores files that are not scripts", () => {
    const f = fixture([100]);
    const r = evaluateBundle({ chunks: [...f.chunks, ...f.chunks, ".next/static/media/x.woff2"], read: (p) => (p.endsWith(".js") ? f.read(p) : new Uint8Array(1e6)) });
    expect(r.rows).toHaveLength(1);
  });
});

describe("chunksForRoute", () => {
  it("reads Turbopack's route-bundle-stats.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-"));
    mkdirSync(join(dir, "diagnostics"));
    writeFileSync(join(dir, "diagnostics", "route-bundle-stats.json"), JSON.stringify([{ route: "/s/[token]", firstLoadChunkPaths: [".next/static/chunks/a.js"] }, { route: "/", firstLoadChunkPaths: [] }]));
    expect(chunksForRoute(dir)).toEqual([".next/static/chunks/a.js"]);
    expect(chunksForRoute(dir, "/nope")).toBeNull();
  });
  it("falls back to the webpack app-build-manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-"));
    writeFileSync(join(dir, "app-build-manifest.json"), JSON.stringify({ pages: { "/s/[token]/page": ["static/chunks/b.js"] } }));
    expect(chunksForRoute(dir)).toEqual([".next/static/chunks/b.js"]);
  });
});
