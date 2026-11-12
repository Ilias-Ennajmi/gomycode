import { expect, type Locator, type Page } from "@playwright/test";

/** A plain snapshot of a board object, as `BoardDoc.all()` returns it. */
export type Obj = Record<string, unknown> & { id: string; type: string; x: number; y: number; w: number; h: number; parentId: string | null };

export type Pt = { x: number; y: number };

export const MOD = "ControlOrMeta";

let counter = 0;
/** A board id that is unique across tests and workers (IndexedDB is per browser context anyway). */
export const uniqueBoardId = (tag = "e2e") => `${tag}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Publish the live board on `window.__atelier` for this page (all navigations). */
export async function exposeBoard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("atelier:expose", "1");
    } catch {
      /* storage blocked */
    }
  });
}

/** Open a board (local-only mode creates an empty one for an unknown id) and wait until the canvas is interactive. */
export async function openBoard(page: Page, id: string = uniqueBoardId(), opts: { zoom?: number } = {}): Promise<string> {
  await exposeBoard(page);
  await page.goto(`/b/${id}`);
  await waitForBoard(page);
  await setView(page, opts.zoom ?? defaultZoom(page));
  return id;
}

/** Phone-sized screens see a quarter of the canvas a desktop does: zoom out so the same canvas coordinates stay on screen. */
export function defaultZoom(page: Page): number {
  return (page.viewportSize()?.width ?? 1440) < 600 ? 0.5 : 1;
}

/** Zoom to `z` with the canvas origin in the middle of the viewport. */
export function setView(page: Page, z: number): Promise<void> {
  return page.evaluate((zoom) => {
    const { canvas } = (window as unknown as { __atelier: { canvas: { viewport(): { w: number; h: number }; setCamera(c: { x: number; y: number; z: number }): void } } }).__atelier;
    const vp = canvas.viewport();
    canvas.setCamera({ x: -vp.w / 2 / zoom, y: -vp.h / 2 / zoom, z: zoom });
  }, z);
}

export async function waitForBoard(page: Page): Promise<void> {
  await expect(page.locator("#board-canvas")).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __atelier?: unknown }).__atelier);
  await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
}

export const canvas = (page: Page): Locator => page.locator("#board-canvas");

/** Every valid object of the open board, z-ordered. */
export function objects(page: Page): Promise<Obj[]> {
  return page.evaluate(() => (window as unknown as { __atelier: { doc: { all(): unknown[] } } }).__atelier.doc.all() as never);
}

export async function objectsOfType(page: Page, type: string): Promise<Obj[]> {
  return (await objects(page)).filter((o) => o.type === type);
}

export function getObject(page: Page, id: string): Promise<Obj | undefined> {
  return page.evaluate((i) => (window as unknown as { __atelier: { doc: { get(id: string): unknown } } }).__atelier.doc.get(i) as never, id);
}

/** Selected ids, in no particular order. */
export function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as unknown as { __atelier: { canvas: { selection: { ids: Iterable<string> } } } }).__atelier.canvas.selection.ids]);
}

export function selectIds(page: Page, ids: string[]): Promise<void> {
  return page.evaluate((i) => (window as unknown as { __atelier: { canvas: { selection: { set(ids: string[]): void } } } }).__atelier.canvas.selection.set(i), ids);
}

export type Camera = { x: number; y: number; z: number };
export function camera(page: Page): Promise<Camera> {
  return page.evaluate(() => (window as unknown as { __atelier: { canvas: { getCamera(): Camera } } }).__atelier.canvas.getCamera());
}

/** Page (client) coordinates of a canvas point. */
export function toClient(page: Page, p: Pt): Promise<Pt> {
  return page.evaluate(
    ({ x, y }) => {
      const a = (window as unknown as { __atelier: { canvas: { getCamera(): Camera; container(): HTMLElement } } }).__atelier;
      const c = a.canvas.getCamera();
      const r = a.canvas.container().getBoundingClientRect();
      return { x: r.left + (x - c.x) * c.z, y: r.top + (y - c.y) * c.z };
    },
    p,
  );
}

/** Client coordinates of the middle of an object's box. */
export async function centreOf(page: Page, id: string): Promise<Pt> {
  const o = await getObject(page, id);
  if (!o) throw new Error(`no object ${id}`);
  return toClient(page, { x: o.x + o.w / 2, y: o.y + o.h / 2 });
}

/** Press a key without the browser's keyboard focus mattering: keys go to the focused element, or the body. */
export async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

/** A smooth mouse drag in client coordinates. */
export async function drag(page: Page, from: Pt, to: Pt, opts: { steps?: number; shift?: boolean; alt?: boolean } = {}): Promise<void> {
  const steps = opts.steps ?? 8;
  if (opts.shift) await page.keyboard.down("Shift");
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up("Alt");
  if (opts.shift) await page.keyboard.up("Shift");
}

/** Pick a tool with its shortcut and drag out an object between two canvas points. */
export async function drawWith(page: Page, key: string, from: Pt, to: Pt): Promise<void> {
  await page.keyboard.press(key);
  await drag(page, await toClient(page, from), await toClient(page, to));
}

/** Click a creation tool's key, then click a canvas point. */
export async function placeWith(page: Page, key: string, at: Pt): Promise<void> {
  await page.keyboard.press(key);
  const c = await toClient(page, at);
  await page.mouse.click(c.x, c.y);
}

/** Wait until the board holds exactly `n` objects of `type` (or of any type) and return them. */
export async function expectCount(page: Page, n: number, type?: string): Promise<Obj[]> {
  await expect.poll(async () => (type ? (await objectsOfType(page, type)).length : (await objects(page)).length)).toBe(n);
  return type ? objectsOfType(page, type) : objects(page);
}

/** Touch drag through the DevTools protocol (Playwright has no touch-drag API). Points are client coordinates. */
export async function touchDrag(page: Page, points: Pt[]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const [first, ...rest] = points;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: first.x, y: first.y, id: 1 }] });
    for (const p of rest) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

/** The toast region's items (the editor's toasts carry `data-toast`). */
export const toasts = (page: Page): Locator => page.locator("[data-toast]");

export function syncStatus(page: Page): Locator {
  return page.locator("[data-sync-status]");
}

/** Plain text of a text-bearing object's rich content. */
export function textOf(page: Page, id: string): Promise<string> {
  return page.evaluate((i) => {
    const frag = (window as unknown as { __atelier: { doc: { content(id: string): { toString(): string } | undefined } } }).__atelier.doc.content(i);
    return frag ? frag.toString().replace(/<[^>]*>/g, "") : "";
  }, id);
}

// ---- synthetic clipboard and drop data ---------------------------------------------------------------------

/** A file to hand to the page: real bytes (`path`), or `size` zero bytes standing in for a huge file. */
export type FileSpec = { name: string; type: string; base64?: string; size?: number };

type PageData = { text?: string; html?: string; files?: FileSpec[]; at?: Pt };

/** Build a DataTransfer inside the page from plain data. Runs in the browser, so it is self-contained. */
const buildTransfer = `(data) => {
  const dt = new DataTransfer();
  if (data.text !== undefined) dt.setData("text/plain", data.text);
  if (data.html !== undefined) dt.setData("text/html", data.html);
  for (const f of data.files ?? []) {
    const bytes = f.base64 !== undefined ? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)) : new Uint8Array(f.size ?? 0);
    dt.items.add(new File([bytes], f.name, { type: f.type }));
  }
  return dt;
}`;

/** Dispatch a paste event (as a Ctrl+V from another app would) carrying `data`. */
export function pasteData(page: Page, data: Omit<PageData, "at">): Promise<void> {
  return page.evaluate(
    ({ build, data }) => {
      const dt = (0, eval)(build)(data) as DataTransfer;
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { build: buildTransfer, data },
  );
}

/** Drop `data` onto the canvas at client point `at` (default: the middle of the canvas). */
export function dropData(page: Page, data: PageData): Promise<void> {
  return page.evaluate(
    ({ build, data }) => {
      const dt = (0, eval)(build)(data) as DataTransfer;
      const el = document.querySelector("#board-canvas")!;
      const r = el.getBoundingClientRect();
      const at = data.at ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const init = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: at.x, clientY: at.y };
      el.dispatchEvent(new DragEvent("dragenter", init));
      el.dispatchEvent(new DragEvent("dragover", init));
      el.dispatchEvent(new DragEvent("drop", init));
    },
    { build: buildTransfer, data },
  );
}

// ---- service worker and local storage ------------------------------------------------------------------------

/** Resolve once the service worker controls this page (production builds register it after load). */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  });
}

/** Resolve once the service worker holds a copy of this page's HTML for offline starts. */
export async function waitForPageCached(page: Page, pathname: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (p) => {
        // The page cache is versioned (atelier-pages-vN); whichever the current worker uses.
        const name = (await caches.keys()).find((n) => n.startsWith("atelier-pages-"));
        if (!name) return false;
        return !!(await (await caches.open(name)).match(location.origin + p));
      }, pathname),
    )
    .toBe(true);
}

/** Number of update records y-indexeddb has stored for a board: grows with every edit that reached the disk. */
export function storedUpdateCount(page: Page, boardId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open(`atelier-board-${id}`);
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("updates")) {
            db.close();
            resolve(0);
            return;
          }
          const req = db.transaction("updates", "readonly").objectStore("updates").count();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => {
            db.close();
            resolve(0);
          };
        };
      }),
    boardId,
  );
}
