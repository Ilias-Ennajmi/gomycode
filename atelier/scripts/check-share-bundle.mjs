#!/usr/bin/env node
// Checks the JavaScript a visitor's phone downloads for the share page (/s/[token]): the first-load chunks of that route,
// gzipped, must total less than 200 KB (docs/SPEC.md section 8, Phase 3 Global Constraints). Run after `next build`:
//   npm run check:share-bundle        builds, then checks
//   npm run size                      checks an existing build
// Next 16 with Turbopack writes .next/diagnostics/route-bundle-stats.json ({ route, firstLoadChunkPaths }[]). Older or webpack
// builds have .next/app-build-manifest.json ({ pages: { "/s/[token]/page": [chunks] } }); both are understood.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const ROUTE = "/s/[token]";
export const BUDGET_BYTES = 200 * 1024;

/**
 * @param {{ chunks: string[], read: (path: string) => Uint8Array, budget?: number }} input
 * @returns {{ rows: { path: string; raw: number; gzip: number }[]; total: number; budget: number; ok: boolean }}
 */
export function evaluateBundle({ chunks, read, budget = BUDGET_BYTES }) {
  const rows = [...new Set(chunks)]
    .filter((p) => p.endsWith(".js"))
    .map((path) => {
      const bytes = read(path);
      return { path, raw: bytes.byteLength, gzip: gzipSync(bytes, { level: 9 }).byteLength };
    })
    .sort((a, b) => b.gzip - a.gzip);
  const total = rows.reduce((sum, r) => sum + r.gzip, 0);
  return { rows, total, budget, ok: total <= budget };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/** A readable table of the chunks and the verdict. */
export function formatReport(result, route = ROUTE) {
  const width = Math.max(10, ...result.rows.map((r) => r.path.length));
  const lines = [`First-load JavaScript of ${route} (gzip level 9):`, "", `${"chunk".padEnd(width)}  ${"gzip".padStart(10)}  ${"raw".padStart(10)}`];
  for (const r of result.rows) lines.push(`${r.path.padEnd(width)}  ${kb(r.gzip).padStart(10)}  ${kb(r.raw).padStart(10)}`);
  lines.push("-".repeat(width + 24), `${"total".padEnd(width)}  ${kb(result.total).padStart(10)}  (budget ${kb(result.budget)})`, "", result.ok ? "OK: within budget." : `FAIL: ${kb(result.total - result.budget)} over budget.`);
  return lines.join("\n");
}

/** The route's first-load chunk list from whichever manifest this build has; null when the route is not in it. */
export function chunksForRoute(dotNext, route = ROUTE) {
  const stats = join(dotNext, "diagnostics", "route-bundle-stats.json");
  if (existsSync(stats)) {
    const list = JSON.parse(readFileSync(stats, "utf8"));
    const hit = list.find((r) => r.route === route);
    if (hit) return hit.firstLoadChunkPaths;
  }
  const manifest = join(dotNext, "app-build-manifest.json");
  if (existsSync(manifest)) {
    const pages = JSON.parse(readFileSync(manifest, "utf8")).pages ?? {};
    const hit = pages[`${route}/page`];
    if (hit) return hit.map((p) => `.next/${p}`);
  }
  return null;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const chunks = chunksForRoute(join(root, ".next"));
  if (!chunks) {
    console.error(`No build output for ${ROUTE}. Run \`npm run build\` first.`);
    process.exit(2);
  }
  const result = evaluateBundle({ chunks, read: (p) => readFileSync(join(root, p)) });
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
