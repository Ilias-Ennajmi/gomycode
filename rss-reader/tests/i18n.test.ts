import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FR } from "@/lib/i18n";

// Every string the code passes to t("…") or tr("…") has a French version, so switching to
// French never leaves a stray English label on a translated screen.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("every translated string has a French version", () => {
  const missing = new Set<string>();
  for (const file of ["app", "components", "lib"].flatMap(sourceFiles)) {
    const text = readFileSync(file, "utf8");
    // Prettier breaks long calls over lines: t(\n "…"\n).
    for (const match of text.matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) {
      const key = JSON.parse(`"${match[1]}"`) as string;
      if (!(key in FR)) missing.add(key);
    }
  }
  assert.deepEqual([...missing].sort(), []);
});
