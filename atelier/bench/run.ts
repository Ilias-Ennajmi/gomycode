/*
 * The 1,000-image performance gate (SPEC section 8): `npm run bench`.
 *
 * Start the app first, built and in local-only mode with the bench page enabled:
 *   npm run build && ATELIER_LOCAL_ONLY=1 ATELIER_BENCH=1 PORT=3300 npm start
 *   BENCH_URL=http://localhost:3300 npm run bench
 *
 * Opens /bench in Chromium (1440x900, device pixel ratio 2 unless --dpr says otherwise), then runs four scenarios, each
 * recorded with a CDP trace and reduced with bench/stats.ts:
 *   pan-fit    two-finger pan with every image in view
 *   zoom-sweep ctrl+wheel zoom from fit-all to 400 % and back, three times
 *   pan-100    diagonal pan at 100 %
 *   drag-50    drag a selection of 50 images (work per pointer move, and frame gaps)
 * Results go to bench/results/latest.json (and a timestamped copy). Exit code 1 when the gate fails: any scenario with a
 * p95 frame interval of 20 ms or more, or decoded image bytes above the memory budget by more than 10 %.
 *
 * Flags: --layer=dom|webgl  --dpr=N  --viewport=WxH  --only=name  --ci (thresholds x BENCH_CI_FACTOR, default 2)  --seconds=N
 * Env: BENCH_URL, PLAYWRIGHT_CHROMIUM_PATH (or PW_CHROMIUM_PATH)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, type CDPSession, type Page } from "@playwright/test";
import { frameIntervalsMs, longTasks, summarise, type TraceEvent } from "./stats.ts";

const args = new Map(process.argv.slice(2).map((a) => (a.startsWith("--") ? (a.slice(2).split("=") as [string, string?]) : [a, undefined]) as [string, string | undefined]));
const BASE = process.env.BENCH_URL ?? "http://localhost:3300";
const DPR = Number(args.get("dpr") ?? 2);
const [VW, VH] = (args.get("viewport") ?? "1440x900").split("x").map(Number);
const SECONDS = Number(args.get("seconds") ?? 6);
const CI = args.has("ci");
const THRESHOLD_MS = 20 * (CI ? Number(process.env.BENCH_CI_FACTOR ?? 2) : 1);
const ONLY = args.get("only");
const LAYER = args.get("layer") === "webgl" ? "webgl" : "dom";
const BUDGET_BYTES = 256 * 1024 * 1024; // defaultBudgetBytes() on a desktop

type Scenario = { name: string; prepare(page: Page): Promise<void>; drive(page: Page, ms: number): Promise<unknown> };

/** In-page rAF loop: one wheel event per frame for `ms`; `next` says what each frame sends. Runs in the browser. */
const wheelLoop = (page: Page, ms: number, mode: "pan-sweep" | "pan-diagonal" | "zoom") =>
  page.evaluate(
    ({ ms, mode }) =>
      new Promise<{ frames: number; minZ: number; maxZ: number }>((resolve) => {
        const root = document.querySelector("#board-canvas") as HTMLElement;
        const r = root.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const cam = () => (window as unknown as { __atelier: { canvas: { getCamera(): { z: number } } } }).__atelier.canvas.getCamera();
        const z0 = cam().z;
        let dir = 1; // zoom: +1 in, -1 out
        let n = 0;
        let start = 0;
        let minZ = z0;
        let maxZ = z0;
        const tick = (t: number) => {
          if (!start) start = t;
          n++;
          let init: WheelEventInit;
          if (mode === "pan-sweep") {
            // two-finger scroll: +-40 px sweeps, about 1.5 s per sweep
            const dx = 40 * Math.cos(n / 14) / 4;
            const dy = 40 * Math.sin(n / 14) / 4;
            init = { deltaX: dx, deltaY: dy + 0.1, clientX: cx, clientY: cy, bubbles: true, cancelable: true };
          } else if (mode === "pan-diagonal") {
            init = { deltaX: -9.5, deltaY: -6.5, clientX: cx, clientY: cy, bubbles: true, cancelable: true };
          } else {
            const z = cam().z;
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            if (z >= 4) dir = -1;
            else if (z <= z0 * 1.02) dir = 1;
            // a pinch-sized deltaY gains 5x in the app: exp(6.6 * 5 * 0.002) is about 1.068 per frame
            init = { deltaY: -dir * 6.6, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true };
          }
          root.dispatchEvent(new WheelEvent("wheel", init));
          if (t - start < ms) requestAnimationFrame(tick);
          else resolve({ frames: n, minZ, maxZ });
        };
        requestAnimationFrame(tick);
      }),
    { ms, mode },
  );

const setZoomCentre = (page: Page, z: number) =>
  page.evaluate((zoom) => {
    const a = (window as unknown as { __atelier: { canvas: { viewport(): { w: number; h: number }; setCamera(c: object): void } } }).__atelier;
    const vp = a.canvas.viewport();
    // The middle of the 40 x 25 grid of 480 px cells.
    a.canvas.setCamera({ x: 9600 - vp.w / 2 / zoom, y: 6000 - vp.h / 2 / zoom, z: zoom });
  }, z);

const SCENARIOS: Scenario[] = [
  { name: "pan-fit", prepare: (p) => p.evaluate(() => window.__bench!.fitAll()), drive: (p, ms) => wheelLoop(p, ms, "pan-sweep") },
  { name: "zoom-sweep", prepare: (p) => p.evaluate(() => window.__bench!.fitAll()), drive: (p, ms) => wheelLoop(p, ms, "zoom") },
  { name: "pan-100", prepare: (p) => setZoomCentre(p, 1), drive: (p, ms) => wheelLoop(p, ms, "pan-diagonal") },
  {
    name: "drag-50",
    prepare: (p) => setZoomCentre(p, 0.5),
    drive: (p, ms) =>
      p.evaluate(
        ({ ms }) =>
          new Promise<{ moved: number; handlerP95: number; handlerMax: number; frames: number }>((resolve) => {
            const b = window.__bench!;
            const ids = b.visibleIds(50);
            const a = (window as unknown as { __atelier: { doc: { get(id: string): { x: number; y: number; w: number; h: number } | undefined }; canvas: { container(): HTMLElement; getCamera(): { x: number; y: number; z: number }; selection: { set(ids: string[]): void } } } }).__atelier;
            const root = a.canvas.container();
            a.canvas.selection.set(ids);
            const first = a.doc.get(ids[0])!;
            const cam = a.canvas.getCamera();
            const box = root.getBoundingClientRect();
            const x0 = box.left + (first.x + first.w / 2 - cam.x) * cam.z;
            const y0 = box.top + (first.y + first.h / 2 - cam.y) * cam.z;
            const ev = (type: string, x: number, y: number, buttons: number) => new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true });
            const startX = first.x;
            root.dispatchEvent(ev("pointerdown", x0, y0, 1));
            const handler: number[] = [];
            let n = 0;
            let start = 0;
            const tick = (t: number) => {
              if (!start) start = t;
              n++;
              const t0 = performance.now();
              root.dispatchEvent(ev("pointermove", x0 + Math.sin(n / 20) * 160, y0 + Math.cos(n / 25) * 90, 1));
              handler.push(performance.now() - t0);
              if (t - start < ms) requestAnimationFrame(tick);
              else {
                root.dispatchEvent(ev("pointerup", x0, y0, 0));
                const sorted = [...handler].sort((p, q) => p - q);
                resolve({ moved: Math.round(Math.abs((a.doc.get(ids[0])?.x ?? startX) - startX) * cam.z), handlerP95: sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0, handlerMax: sorted[sorted.length - 1] ?? 0, frames: n });
              }
            };
            requestAnimationFrame(tick);
          }),
        { ms: Math.min(ms, 2000) },
      ),
  },
];

async function trace<T>(cdp: CDPSession, body: () => Promise<T>): Promise<{ result: T; events: TraceEvent[] }> {
  const events: TraceEvent[] = [];
  const collect = (e: { value: object[] }) => void events.push(...(e.value as unknown as TraceEvent[]));
  cdp.on("Tracing.dataCollected", collect);
  const done = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
  await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel", transferMode: "ReportEvents" });
  const result = await body();
  await cdp.send("Tracing.end");
  await done;
  cdp.off("Tracing.dataCollected", collect);
  return { result, events };
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath, args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("[page error]", e.message));
await page.goto(`${BASE}/bench${LAYER === "webgl" ? "?layer=webgl" : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__bench, undefined, { timeout: 30_000 }).catch(() => {
  throw new Error(`${BASE}/bench is not serving the benchmark page: start the app with ATELIER_LOCAL_ONLY=1 ATELIER_BENCH=1`);
});
const t0 = Date.now();
await page.evaluate(() => window.__bench!.ready);
console.log(`bench board ready in ${((Date.now() - t0) / 1000).toFixed(1)} s (1,000 images, ${LAYER} image layer, ${VW}x${VH} @${DPR}x)`);

const cdp = await context.newCDPSession(page);
const version = browser.version();
const cpus = (await import("node:os")).cpus().length;
const results: Record<string, unknown>[] = [];
let failed = false;
let peakBytes = 0;

for (const s of SCENARIOS) {
  if (ONLY && ONLY !== s.name) continue;
  await s.prepare(page);
  // Warm-up with the same motion, so the first culling pass and rasteriser caches are not what is measured.
  await s.drive(page, 1200);
  await s.prepare(page); // back to the start view: the measured run starts where a person would
  await page.waitForTimeout(500);
  const { result, events } = await trace(cdp, () => s.drive(page, SECONDS * 1000));
  const sum = summarise(frameIntervalsMs(events));
  const heap = await page.evaluate(() => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576);
  const resident = await page.evaluate(() => window.__bench!.residentBytes());
  peakBytes = Math.max(peakBytes, resident);
  const row = { scenario: s.name, ...sum, longTasks: longTasks(events), jsHeapMB: Math.round(heap), residentBytes: Math.round(resident), driver: result };
  results.push(row);
  const ok = Number.isFinite(sum.p95) && sum.p95 < THRESHOLD_MS;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"} ${s.name.padEnd(11)} fps ${sum.fps.toFixed(1).padStart(5)}  p50 ${sum.p50.toFixed(1)}  p95 ${sum.p95.toFixed(1)}  p99 ${sum.p99.toFixed(1)} ms  frames ${sum.frames}  long tasks ${row.longTasks}  heap ${row.jsHeapMB} MB  bitmaps ${(resident / 1048576).toFixed(0)} MiB`);
}
if (peakBytes > BUDGET_BYTES * 1.1) {
  failed = true;
  console.log(`FAIL memory: ${(peakBytes / 1048576).toFixed(0)} MiB of decoded bitmaps is over the ${(BUDGET_BYTES / 1048576).toFixed(0)} MiB budget by more than 10 %`);
}

mkdirSync("bench/results", { recursive: true });
const out = { at: new Date().toISOString(), layer: LAYER, chromium: version, cpus, viewport: `${VW}x${VH}`, dpr: DPR, seconds: SECONDS, thresholdMs: THRESHOLD_MS, ci: CI, gate: failed ? "fail" : "pass", scenarios: results };
writeFileSync("bench/results/latest.json", JSON.stringify(out, null, 2));
writeFileSync(`bench/results/${out.at.replace(/[:.]/g, "-")}-${LAYER}.json`, JSON.stringify(out, null, 2));
await browser.close();
process.exit(failed ? 1 : 0);
