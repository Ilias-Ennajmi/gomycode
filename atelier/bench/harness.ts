/*
 * Performance harness: open-time and frame-time measurements for a board in a real browser. Used by e2e/perf.spec.ts and
 * meant to be reused by later phases (for example the 1,000-image gate in Phase 2).
 *
 * Numbers are only comparable on the same machine and browser. A sandbox with software rendering and no GPU gives far
 * worse frame times than a laptop; treat thresholds in CI as smoke checks and real hardware as the benchmark.
 */
import type { Page } from "@playwright/test";

/** Write a base64 Yjs update where the app's persistence keeps board `boardId` (IndexedDB `atelier-board-{id}`). */
export async function seedBoard(page: Page, boardId: string, updateBase64: string): Promise<void> {
  // Any same-origin page will do; the health endpoint is the lightest.
  await page.goto("/api/health");
  await page.evaluate(
    ({ id, b64 }) =>
      new Promise<void>((resolve, reject) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const open = indexedDB.open(`atelier-board-${id}`, 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("updates", { autoIncrement: true });
          open.result.createObjectStore("custom");
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("updates", "readwrite");
          tx.objectStore("updates").add(bytes);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id: boardId, b64: updateBase64 },
  );
}

export type OpenTiming = {
  /** ms from navigation start to the `atelier:board-ready` mark. */
  readyMs: number;
  /** The mark says it gave up waiting for objects. */
  timedOut: boolean;
  /** Objects in the document and objects drawn on the canvas right then. */
  objectsInDoc: number;
  objectsInDom: number;
};

/** Navigate to the board and read the `atelier:board-ready` mark. */
export async function measureOpen(page: Page, boardId: string): Promise<OpenTiming> {
  await page.addInitScript(() => localStorage.setItem("atelier:expose", "1"));
  await page.goto(`/b/${boardId}`);
  await page.waitForFunction(() => performance.getEntriesByName("atelier:board-ready").length > 0, undefined, { timeout: 30_000 });
  return page.evaluate(() => {
    const mark = performance.getEntriesByName("atelier:board-ready")[0] as PerformanceMark;
    const a = (window as unknown as { __atelier?: { doc: { all(): unknown[] } } }).__atelier;
    return {
      readyMs: mark.startTime,
      timedOut: Boolean((mark.detail as { timedOut?: boolean } | null)?.timedOut),
      objectsInDoc: a ? a.doc.all().length : -1,
      objectsInDom: document.querySelectorAll("#board-canvas [data-object-id]").length,
    };
  });
}

export type FrameStats = {
  kind: "pan" | "zoom";
  durationMs: number;
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Frames longer than 33 ms (a missed 30 fps frame). */
  over33: number;
  /** Frames longer than 20 ms (SPEC §8 target is p95 < 20 ms). */
  over20: number;
};

export const percentile = (sorted: number[], p: number): number => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);

/**
 * Drive the camera with real wheel events (the same handler a trackpad uses) once per animation frame for `ms`, and
 * record the gap between frames. "pan" sweeps in a circle; "zoom" pinches in and out around the middle of the canvas.
 */
export async function measureFrames(page: Page, kind: "pan" | "zoom", ms = 2000, warmupMs = 600): Promise<FrameStats> {
  // A warm-up pass of the same motion first: it lets the first culling pass, layout and rasteriser caches settle, so
  // the measured window is steady-state movement and not the one-off cost of arriving at this view.
  if (warmupMs > 0) await frameGaps(page, kind, warmupMs);
  const gaps = await frameGaps(page, kind, ms);
  const sorted = [...gaps].sort((a, b) => a - b);
  const total = gaps.reduce((s, g) => s + g, 0);
  return {
    kind,
    durationMs: Math.round(total),
    frames: gaps.length,
    fps: total ? Math.round((gaps.length / total) * 1000 * 10) / 10 : 0,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1] ?? 0),
    over33: gaps.filter((g) => g > 33).length,
    over20: gaps.filter((g) => g > 20).length,
  };
}

async function frameGaps(page: Page, kind: "pan" | "zoom", ms: number): Promise<number[]> {
  return page.evaluate(
    ({ kind, ms }) =>
      new Promise<number[]>((resolve) => {
        const root = document.querySelector("#board-canvas") as HTMLElement;
        const r = root.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const gaps: number[] = [];
        let n = 0;
        let last = 0;
        let start = 0;
        const tick = (t: number) => {
          if (last) gaps.push(t - last);
          else start = t;
          last = t;
          n++;
          const phase = n / 25;
          const init: WheelEventInit =
            kind === "pan"
              ? { deltaX: 14.5 * Math.cos(phase), deltaY: 11.5 * Math.sin(phase), clientX: cx, clientY: cy, bubbles: true, cancelable: true }
              : { deltaY: 3.5 * Math.sin(phase) + 0.25, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true };
          root.dispatchEvent(new WheelEvent("wheel", init));
          if (t - start < ms) requestAnimationFrame(tick);
          else resolve(gaps);
        };
        requestAnimationFrame(tick);
      }),
    { kind, ms },
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Slow the page's CPU by `rate` (4 = four times slower) to stand in for a mid-range phone. Returns a reset function. */
export async function throttleCpu(page: Page, rate: number): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  return async () => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  };
}

/** Frames the camera actually moved during `kind`: a sanity check that the input reached the canvas. */
export async function cameraMoved(page: Page, run: () => Promise<unknown>): Promise<boolean> {
  const read = () => page.evaluate(() => JSON.stringify((window as unknown as { __atelier: { canvas: { getCamera(): unknown } } }).__atelier.canvas.getCamera()));
  const before = await read();
  await run();
  return (await read()) !== before;
}

export type DragStats = {
  moved: number;
  /** Synchronous time the page spent handling each pointer move (tool + document writes), in ms. */
  handlerP50: number;
  handlerP95: number;
  handlerMax: number;
  /** Gap between animation frames while dragging (includes React rendering and painting). */
  frameP95: number;
  frameMax: number;
  frames: number;
};

/**
 * Drag the given objects with synthetic pointer events, one move per animation frame, and time what the app does with
 * each move. SPEC section 8 asks for "< 16 ms per frame of work": `handlerP95` is the part the app controls
 * synchronously, `frameP95` adds rendering and painting.
 */
export async function measureDrag(page: Page, ids: string[], frames = 90): Promise<DragStats> {
  const r = await page.evaluate(
    ({ ids, frames }) =>
      new Promise<{ handler: number[]; gaps: number[]; moved: number }>((resolve) => {
        const a = (window as unknown as {
          __atelier: { doc: { get(id: string): { x: number; y: number; w: number; h: number } | undefined }; canvas: { container(): HTMLElement; getCamera(): { x: number; y: number; z: number }; selection: { set(ids: string[]): void } } };
        }).__atelier;
        const root = a.canvas.container();
        a.canvas.selection.set(ids);
        const first = a.doc.get(ids[0])!;
        const cam = a.canvas.getCamera();
        const box = root.getBoundingClientRect();
        const x0 = box.left + (first.x + first.w / 2 - cam.x) * cam.z;
        const y0 = box.top + (first.y + first.h / 2 - cam.y) * cam.z;
        const ev = (type: string, x: number, y: number, buttons: number) =>
          new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true });
        const startX = first.x;
        root.dispatchEvent(ev("pointerdown", x0, y0, 1));
        const handler: number[] = [];
        const gaps: number[] = [];
        let n = 0;
        let last = 0;
        const tick = (t: number) => {
          if (last) gaps.push(t - last);
          last = t;
          n++;
          const x = x0 + n * 3;
          const y = y0 + Math.sin(n / 10) * 20;
          const t0 = performance.now();
          root.dispatchEvent(ev("pointermove", x, y, 1));
          handler.push(performance.now() - t0);
          if (n < frames) requestAnimationFrame(tick);
          else {
            root.dispatchEvent(ev("pointerup", x, y, 0));
            resolve({ handler, gaps, moved: Math.round(((a.doc.get(ids[0])?.x ?? startX) - startX) * cam.z) });
          }
        };
        requestAnimationFrame(tick);
      }),
    { ids, frames },
  );
  const h = [...r.handler].sort((x, y) => x - y);
  const g = [...r.gaps].sort((x, y) => x - y);
  return {
    moved: r.moved,
    handlerP50: round(percentile(h, 50)),
    handlerP95: round(percentile(h, 95)),
    handlerMax: round(h[h.length - 1] ?? 0),
    frameP95: round(percentile(g, 95)),
    frameMax: round(g[g.length - 1] ?? 0),
    frames: r.gaps.length,
  };
}
