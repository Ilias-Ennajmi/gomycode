import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { buildImageBoard, buildMixedBoard, encodeBase64 } from "../bench/fixtures";
import { cameraMoved, measureDrag, measureFrames, measureOpen, seedBoard, throttleCpu, type FrameStats, type OpenTiming } from "../bench/harness";
import { uniqueBoardId } from "./helpers";

/*
 * Performance smoke tests. The hard budgets here are deliberately loose (this suite also runs on shared CI machines
 * with software rendering); the real numbers are logged and written to test-results/bench/*.json so they can be read
 * and compared. SPEC §8's targets (500 objects < 500 ms, p95 < 20 ms) are the benchmark; these asserts guard against
 * regressions of an order of magnitude.
 */
const BUDGET_OPEN_MS = Number(process.env.BENCH_OPEN_MS ?? 1500); // target 500
// Frames arrive in whole 16.7 ms vsync steps, so "p95 under 33 ms" means at most two steps (33.3) plus timer jitter.
const BUDGET_P95_MS = Number(process.env.BENCH_P95_MS ?? 34); // target 20 on a laptop
// Zooming re-rasterises the whole viewport; without a GPU that is slow at desktop sizes whatever the app does, so
// zoom only has a "does not stall" bound here. Phase 2's 1,000-image gate on real hardware owns the tight budget.
const BUDGET_ZOOM_P95_MS = Number(process.env.BENCH_ZOOM_P95_MS ?? 250);

/** Log a measurement and keep it as test-results/bench/<project>-<name>.json (one file each: tests run in parallel workers). */
function record(project: string, name: string, value: unknown) {
  console.log(`[bench ${project}] ${name}: ${JSON.stringify(value)}`);
  mkdirSync("test-results/bench", { recursive: true });
  writeFileSync(`test-results/bench/${project}-${name}.json`, JSON.stringify({ project, name, at: new Date().toISOString(), ...(value as object) }, null, 2));
}

test.describe("performance", () => {
  test("a 500-object board opens from the local cache and is ready fast", async ({ page }, info) => {
    const board = buildMixedBoard({ count: 500 });
    expect(board.all()).toHaveLength(500);
    const id = uniqueBoardId("perf500");
    await seedBoard(page, id, encodeBase64(board));

    // Cold: the first open in this browser context. Warm: the same board again (JS and HTTP caches primed).
    const timings: OpenTiming[] = [];
    for (let i = 0; i < 3; i++) timings.push(await measureOpen(page, id));
    const [cold, ...warm] = timings;
    const warmBest = Math.min(...warm.map((t) => t.readyMs));
    record(info.project.name, "open500", { coldMs: Math.round(cold.readyMs), warmMs: warm.map((t) => Math.round(t.readyMs)), objectsInDoc: cold.objectsInDoc, objectsInDom: cold.objectsInDom });

    for (const t of timings) {
      expect(t.timedOut).toBe(false);
      expect(t.objectsInDoc).toBe(500);
      expect(t.objectsInDom).toBeGreaterThan(0);
    }
    // The budget applies to a returning visit (warm caches), which is what "open from local cache" means.
    expect(warmBest).toBeLessThan(BUDGET_OPEN_MS);
  });

  test("panning and zooming the 500-object board", async ({ page }, info) => {
    const id = uniqueBoardId("perf500pan");
    await seedBoard(page, id, encodeBase64(buildMixedBoard({ count: 500 })));
    await measureOpen(page, id);
    // Start at a working zoom rather than the fit-all overview.
    await page.evaluate(() => {
      const { canvas } = (window as unknown as { __atelier: { canvas: { viewport(): { w: number; h: number }; setCamera(c: object): void } } }).__atelier;
      const vp = canvas.viewport();
      canvas.setCamera({ x: 1500 - vp.w / 2 / 0.6, y: 1000 - vp.h / 2 / 0.6, z: 0.6 });
    });
    await expect.poll(() => page.locator("#board-canvas [data-object-id]").count()).toBeGreaterThan(0);

    let pan!: FrameStats;
    expect(await cameraMoved(page, async () => void (pan = await measureFrames(page, "pan", 2000)))).toBe(true);
    let zoom!: FrameStats;
    expect(await cameraMoved(page, async () => void (zoom = await measureFrames(page, "zoom", 2000)))).toBe(true);
    record(info.project.name, "pan500", pan);
    record(info.project.name, "zoom500", zoom);
    expect(pan.frames).toBeGreaterThan(20);
    expect(pan.p95).toBeLessThan(BUDGET_P95_MS);
    expect(zoom.frames).toBeGreaterThan(10);
    expect(zoom.p95).toBeLessThan(BUDGET_ZOOM_P95_MS);
  });

  test("dragging one object and a selection of up to 40 on the 500-object board costs little work per move", async ({ page }, info) => {
    const id = uniqueBoardId("perf500drag");
    await seedBoard(page, id, encodeBase64(buildMixedBoard({ count: 500 })));
    await measureOpen(page, id);
    // A working zoom with a patch of stickies in view, then pick the stickies that are on screen.
    await page.evaluate(() => {
      const { canvas } = (window as unknown as { __atelier: { canvas: { viewport(): { w: number; h: number }; setCamera(c: object): void } } }).__atelier;
      const vp = canvas.viewport();
      const z = vp.w < 600 ? 0.25 : 0.4;
      canvas.setCamera({ x: 1500 - vp.w / 2 / z, y: 1000 - vp.h / 2 / z, z });
    });
    const visible = await page.evaluate(() => {
      const { doc, canvas } = (window as unknown as { __atelier: { doc: { all(): Array<{ id: string; type: string; x: number; y: number; w: number; h: number; parentId: string | null }> }; canvas: { viewport(): { w: number; h: number }; getCamera(): { x: number; y: number; z: number } } } }).__atelier;
      const vp = canvas.viewport();
      const c = canvas.getCamera();
      return doc
        .all()
        .filter((o) => o.type === "sticky" && o.parentId === null && o.x > c.x + 40 && o.x + o.w < c.x + vp.w / c.z - 40 && o.y > c.y + 40 && o.y + o.h < c.y + vp.h / c.z - 40)
        .map((o) => o.id);
    });
    expect(visible.length).toBeGreaterThan(5); // a patch of stickies is on screen
    const one = await measureDrag(page, visible.slice(0, 1));
    const many = await measureDrag(page, visible.slice(0, 40));
    record(info.project.name, "drag1of500", one);
    record(info.project.name, `drag${Math.min(40, visible.length)}of500`, many);
    for (const d of [one, many]) {
      expect(d.moved).toBeGreaterThan(50); // the object really travelled
      expect(d.handlerP95).toBeLessThan(16); // SPEC section 8: under 16 ms of work per frame
    }
  });

  test("panning and zooming a 1,000-image placeholder board", async ({ page }, info) => {
    const id = uniqueBoardId("perf1000img");
    await seedBoard(page, id, encodeBase64(buildImageBoard(1000)));
    const open = await measureOpen(page, id);
    expect(open.objectsInDoc).toBe(1000);
    record(info.project.name, "open1000images", { readyMs: Math.round(open.readyMs), objectsInDom: open.objectsInDom });

    await page.evaluate(() => {
      const { canvas } = (window as unknown as { __atelier: { canvas: { viewport(): { w: number; h: number }; setCamera(c: object): void } } }).__atelier;
      const vp = canvas.viewport();
      canvas.setCamera({ x: 3000 - vp.w / 2 / 0.4, y: 2500 - vp.h / 2 / 0.4, z: 0.4 });
    });
    const pan = await measureFrames(page, "pan", 2000);
    const zoom = await measureFrames(page, "zoom", 2000);
    record(info.project.name, "pan1000images", pan);
    record(info.project.name, "zoom1000images", zoom);
    expect(pan.frames).toBeGreaterThan(20);
    expect(pan.p95).toBeLessThan(BUDGET_P95_MS);
    expect(zoom.frames).toBeGreaterThan(10);
    expect(zoom.p95).toBeLessThan(BUDGET_ZOOM_P95_MS);
  });

  test("with the CPU slowed 4x (a mid-range phone stand-in) the 500-object board still pans (logged, loose bound)", async ({ page }, info) => {
    const id = uniqueBoardId("perf500slow");
    await seedBoard(page, id, encodeBase64(buildMixedBoard({ count: 500 })));
    await measureOpen(page, id);
    const reset = await throttleCpu(page, 4);
    const open = await measureOpen(page, id);
    const pan = await measureFrames(page, "pan", 2000);
    await reset();
    record(info.project.name, "open500Throttle4x", { readyMs: Math.round(open.readyMs) });
    record(info.project.name, "pan500Throttle4x", pan);
    expect(open.timedOut).toBe(false);
    expect(pan.frames).toBeGreaterThan(10); // it keeps producing frames; there is no 4x budget, only the log
  });
});
