import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The share viewer (Phase 3, Task 14) reuses these files and may not import Yjs, Tiptap, the document or any component.
 * This keeps them honest: only relative imports of pure modules are allowed.
 */
const PURE = ["slides.ts", "animator.ts", "controller.ts", "swipe.ts", "laser.ts"];
const ALLOWED = new Set(["./slides", "./controller", "../geometry/camera", "../geometry/rect", "../model/types", "../input/camera-store"]);

const importsOf = (file: string): string[] => {
  const src = readFileSync(join(process.cwd(), "lib/engine/present", file), "utf8");
  return [...src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
};

describe("the pure presentation modules", () => {
  it.each(PURE)("%s imports only pure modules", (file) => {
    for (const spec of importsOf(file)) expect(ALLOWED.has(spec), `${file} imports ${spec}`).toBe(true);
  });

  it("camera-store (the one input module they use) is itself pure", () => {
    const src = readFileSync(join(process.cwd(), "lib/engine/input/camera-store.ts"), "utf8");
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1].startsWith("../geometry/"), m[1]).toBe(true);
  });
});
