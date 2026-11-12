import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openBoard, objects, toasts } from "./helpers";

/*
 * Rounds on a real page, in local-only mode: the browser hands the board to the in-memory store, publishes two rounds with
 * changes between them, and the Rounds panel, Compare page and Restore all work on what the server froze. Set ROUNDS_SHOTS=<dir>
 * to keep screenshots for a look.
 */

const SHOTS = process.env.ROUNDS_SHOTS;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Api = { doc: { create(o: object): string; update(id: string, p: object): void; remove(ids: string[]): void; all(): { id: string; type: string; kind?: string; x: number; name?: string }[] } };

const frameSpec = (name: string, x: number, y: number, w: number, h: number, order: string) => ({
  type: "frame", x, y, w, h, rotation: 0, parentId: null, locked: false, opacity: 1, name, preset: "custom", background: null, clip: true, order, notes: "",
});

/** Two frames, each with a shape, and a sticky in the first one. */
async function seed(page: Page): Promise<Record<string, string>> {
  return page.evaluate(
    ({ frames }) => {
      const api = (window as unknown as { __atelier: Api }).__atelier;
      const f = Object.fromEntries(frames.map((s) => [s.name, api.doc.create(s)]));
      const shape = (extra: object) => ({ type: "shape", x: 0, y: 0, w: 120, h: 80, rotation: 0, parentId: null, locked: false, opacity: 1, kind: "rect", fill: "var(--sticky-peach)", stroke: "var(--color-ink)", strokeWidth: 2, strokeStyle: "solid", cornerRadius: 0, ...extra });
      const a = api.doc.create(shape({ x: 60, y: 80, w: 360, h: 240, parentId: f["Opening"] }));
      const b = api.doc.create(shape({ x: 1560, y: 120, w: 420, h: 300, kind: "diamond", parentId: f["Moodboard"] }));
      const s = api.doc.create({ type: "sticky", x: 120, y: 420, w: 200, h: 200, rotation: 0, parentId: f["Opening"], locked: false, opacity: 1, fill: "yellow", size: "M" });
      return { ...f, a, b, s };
    },
    { frames: [frameSpec("Opening", 0, 0, 1280, 720, "a0"), frameSpec("Moodboard", 1500, 0, 1200, 900, "a1")] },
  );
}

const menu = async (page: Page, item: string) => {
  await page.getByRole("button", { name: "Rounds and history" }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
};

async function publish(page: Page, label: string): Promise<void> {
  await menu(page, "Publish round…");
  const dialog = page.getByRole("dialog", { name: "Publish round" });
  await dialog.getByLabel(/Label/).fill(label);
  await expect(dialog.getByTestId("publish-changes")).not.toContainText("Checking");
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

async function axeClean(page: Page, include?: string) {
  let b = new AxeBuilder({ page }).withTags(WCAG);
  if (include) b = b.include(include);
  const serious = (await b.analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
}

test.describe("rounds", () => {
  test("publish two rounds, read them in the panel, compare them, restore the first and undo", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await openBoard(page);
    const ids = await seed(page);

    // Round 1: no R2 in this server, so the round is published without preview images and says so.
    await publish(page, "Direction A");
    const done = page.getByRole("dialog", { name: "Publish round" });
    await expect(done).toContainText("Round 1 · Direction A is published");
    await expect(done).toContainText("Published without preview images");
    await shot(page, "01-published-without-previews");
    await done.getByRole("button", { name: "Done" }).click();

    // changes between the rounds: one moved, one removed, one added
    await page.evaluate((i) => {
      const api = (window as unknown as { __atelier: Api }).__atelier;
      api.doc.update(i.a, { x: 400 });
      api.doc.remove([i.s]);
      api.doc.create({ type: "sticky", x: 1700, y: 500, w: 200, h: 200, rotation: 0, parentId: i.Moodboard, locked: false, opacity: 1, fill: "mint", size: "M" });
    }, ids);

    // Round 2: the confirmation says what changed since Round 1
    await menu(page, "Publish round…");
    const dialog = page.getByRole("dialog", { name: "Publish round" });
    await expect(dialog.getByTestId("publish-changes")).toContainText("Since Direction A: 1 added · 1 changed · 1 removed");
    await expect(dialog.getByTestId("publish-changes")).toContainText("Opening");
    await shot(page, "02-publish-dialog");
    await axeClean(page);
    await dialog.getByLabel(/Label/).fill("Direction B");
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(dialog).toContainText("Round 2 · Direction B is published");
    await dialog.getByRole("button", { name: "Done" }).click();

    // the Rounds panel
    await menu(page, "Rounds");
    const list = page.getByRole("list", { name: "Rounds" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").nth(0)).toContainText("Round 2 · Direction B");
    await expect(list.getByRole("listitem").nth(0)).toContainText("1 added · 1 changed · 1 removed");
    await expect(list.getByRole("listitem").nth(1)).toContainText("Round 1 · Direction A");
    await expect(list.getByRole("listitem").nth(1)).toContainText("First round · 5 objects");
    await shot(page, "03-rounds-panel");
    await axeClean(page, "aside");

    // Version history lists the same two rounds
    await page.getByRole("button", { name: "Close Rounds" }).click();
    await menu(page, "Version history");
    await expect(page.getByRole("listitem").filter({ hasText: "Round 1 · Direction A" })).toHaveCount(1);
    await shot(page, "04-history-panel");
    await page.getByRole("button", { name: "Close Version history" }).click();

    // Compare Round 1 with the board as it is now
    await menu(page, "Rounds");
    await page.getByRole("listitem").filter({ hasText: "Round 1" }).getByRole("button", { name: "Compare with current" }).click();
    await page.waitForURL(new RegExp(`/b/${id}/compare\\?a=.*&b=current`));
    const summary = page.getByTestId("compare-summary");
    await expect(summary).toContainText("1 added · 1 changed · 1 removed");
    await expect(summary).toContainText("Removed: Sticky note");
    const narrow = (page.viewportSize()?.width ?? 1440) < 768;
    // side by side on a wide screen, the swipe slider on a phone
    if (narrow) await expect(page.getByRole("slider", { name: "Compare position" })).toBeVisible();
    else {
      await expect(page.getByRole("slider")).toHaveCount(0);
      await page.getByRole("button", { name: "Swipe" }).click();
      await expect(page.getByRole("slider", { name: "Compare position" })).toBeVisible();
    }
    await page.getByRole("checkbox", { name: "Highlight changes" }).check();
    await expect(page.locator('[data-compare-side="b"] [data-compare-diff="changed"]')).not.toHaveCount(0);
    await expect(page.locator('[data-compare-side="a"] [data-compare-diff="removed"]')).not.toHaveCount(0);
    // one camera: moving A moves B
    const transform = (side: string) => page.locator(`[data-compare-side="${side}"] [data-canvas-layer]`).evaluate((el) => (el as HTMLElement).style.transform);
    expect(await transform("a")).toBe(await transform("b"));
    await page.getByRole("combobox", { name: "Frame" }).selectOption({ label: "Moodboard" });
    expect(await transform("a")).toBe(await transform("b"));
    await shot(page, "05-compare");
    await axeClean(page);
    await page.getByRole("button", { name: "Close compare" }).click();
    await page.waitForURL(new RegExp(`/b/${id}$`));
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();

    // Restore Round 1 into the board: its objects come back, then one undo returns to where we were
    const before = (await objects(page)).map((o) => `${o.id}:${o.x}`).sort();
    await menu(page, "Rounds");
    await page.getByRole("listitem").filter({ hasText: "Round 1" }).getByRole("button", { name: "Restore…" }).click();
    const restore = page.getByRole("dialog", { name: /Restore Round 1/ });
    await expect(restore).toContainText("We save the current state first and you can undo.");
    await shot(page, "06-restore-dialog");
    await restore.getByRole("button", { name: "Restore into this board" }).click();
    await expect(toasts(page).filter({ hasText: "Restored Round 1" })).toBeVisible();
    const restored = await objects(page);
    expect(restored.find((o) => o.id === ids.a)?.x).toBe(60);
    expect(restored.some((o) => o.id === ids.s)).toBe(true);
    expect(restored.some((o) => o.type === "sticky" && o.x === 1700)).toBe(false);
    // the toast's Undo is one step back
    await toasts(page).filter({ hasText: "Restored Round 1" }).getByRole("button", { name: "Undo" }).click();
    expect((await objects(page)).map((o) => `${o.id}:${o.x}`).sort()).toEqual(before);
    // and the safety snapshot is in the history
    await page.getByRole("button", { name: "Close Rounds" }).click();
    await menu(page, "Version history");
    await expect(page.getByRole("listitem").filter({ hasText: "Before restore" })).toHaveCount(1);
  });

  test("Open as copy makes a new board from a round and leaves this board alone", async ({ page }) => {
    test.setTimeout(90_000);
    const id = await openBoard(page);
    const ids = await seed(page);
    await publish(page, "Direction A");
    await page.getByRole("dialog", { name: "Publish round" }).getByRole("button", { name: "Done" }).click();
    await page.evaluate((i) => (window as unknown as { __atelier: Api }).__atelier.doc.update(i.a, { x: 900 }), ids);

    await menu(page, "Rounds");
    await page.getByRole("listitem").filter({ hasText: "Round 1" }).getByRole("button", { name: "Restore…" }).click();
    await page.getByRole("dialog", { name: /Restore Round 1/ }).getByRole("button", { name: "Open as copy" }).click();
    const toast = toasts(page).filter({ hasText: "Made a new board from Round 1" });
    await expect(toast).toBeVisible();
    // this board is untouched
    expect((await objects(page)).find((o) => o.id === ids.a)?.x).toBe(900);
    await toast.getByRole("button", { name: "Open" }).click();
    await page.waitForURL((u) => /\/b\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith(id));
    await page.waitForFunction(() => !!(window as unknown as { __atelier?: unknown }).__atelier);
    await expect.poll(async () => (await objects(page)).length).toBe(5);
    expect((await objects(page)).find((o) => o.id === ids.a)?.x).toBe(60); // the round's state, not the edit made after it
  });

  test("with R2 reachable, every frame is rendered in the browser and uploaded as image/webp, 480 and 1280 wide", async ({ page }) => {
    test.setTimeout(120_000);
    const token = "E2ePreviewToken0123456".slice(0, 22);
    const puts: { key: string; type: string | undefined; head: string; bytes: number }[] = [];
    await page.route("**/api/boards/*/rounds/prepare", async (route) => {
      const body = route.request().postDataJSON() as { frames: { frameId: string }[] };
      const uploads = Object.fromEntries(body.frames.map((f) => [f.frameId, { w480: `https://r2.invalid/p/${token}/${f.frameId}-w480.webp`, w1280: `https://r2.invalid/p/${token}/${f.frameId}-w1280.webp` }]));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ previewToken: token, uploads }) });
    });
    await page.route("https://r2.invalid/**", async (route) => {
      const buf = route.request().postDataBuffer();
      puts.push({ key: new URL(route.request().url()).pathname, type: route.request().headers()["content-type"], head: buf ? `${buf.subarray(0, 4).toString("latin1")}${buf.subarray(8, 12).toString("latin1")}` : "", bytes: buf?.length ?? 0 });
      await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: "" });
    });
    const id = await openBoard(page);
    const ids = await seed(page);
    await publish(page, "With previews");
    await expect(toasts(page).filter({ hasText: "Published Round 1" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Publish round" })).toHaveCount(0); // nothing to warn about
    expect(puts.map((p) => p.key).sort()).toEqual(
      [ids.Opening, ids.Moodboard].flatMap((f) => [`/p/${token}/${f}-w1280.webp`, `/p/${token}/${f}-w480.webp`]).sort(),
    );
    expect(puts.every((p) => p.type === "image/webp" && p.head === "RIFFWEBP" && p.bytes > 200)).toBe(true);
    // the round recorded the previews, under the keys the server built itself
    const rounds = await page.evaluate(async (b) => (await (await fetch(`/api/boards/${b}/rounds`)).json()) as { rounds: { previews: Record<string, { w480: string; w1280: string; w: number; h: number }> }[] }, id);
    expect(Object.keys(rounds.rounds[0].previews).sort()).toEqual([ids.Opening, ids.Moodboard].sort());
    expect(rounds.rounds[0].previews[ids.Opening]).toMatchObject({ w480: `p/${token}/${ids.Opening}-w480.webp`, w: 1280, h: 720 });
  });

  test("cancelling while previews upload creates no round", async ({ page }) => {
    test.setTimeout(60_000);
    const token = "E2eCancelToken01234567".slice(0, 22);
    await page.route("**/api/boards/*/rounds/prepare", async (route) => {
      const body = route.request().postDataJSON() as { frames: { frameId: string }[] };
      const uploads = Object.fromEntries(body.frames.map((f) => [f.frameId, { w480: `https://r2.invalid/p/${token}/${f.frameId}-w480.webp`, w1280: `https://r2.invalid/p/${token}/${f.frameId}-w1280.webp` }]));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ previewToken: token, uploads }) });
    });
    // uploads hang until the test lets go
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("https://r2.invalid/**", async (route) => {
      await gate;
      await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: "" }).catch(() => undefined);
    });
    const id = await openBoard(page);
    await seed(page);
    await menu(page, "Publish round…");
    const dialog = page.getByRole("dialog", { name: "Publish round" });
    await expect(dialog.getByTestId("publish-changes")).not.toContainText("Checking");
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(dialog.getByRole("progressbar")).toBeVisible();
    await expect(dialog.getByText("Uploading previews").first()).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    release();
    await expect(dialog.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    const rounds = await page.evaluate(async (b) => ((await (await fetch(`/api/boards/${b}/rounds`)).json()) as { rounds: unknown[] }).rounds.length, id);
    expect(rounds).toBe(0);
  });

  test("a round's frozen state is the server's copy: edits after publishing stay out of it", async ({ page }) => {
    const id = await openBoard(page);
    const ids = await seed(page);
    await publish(page, "Frozen");
    await page.getByRole("dialog", { name: "Publish round" }).getByRole("button", { name: "Done" }).click();
    await page.evaluate((i) => (window as unknown as { __atelier: Api }).__atelier.doc.update(i.a, { x: 999 }), ids);
    const snapshotX = await page.evaluate(async (b) => {
      const rounds = (await (await fetch(`/api/boards/${b}/rounds`)).json()) as { rounds: { snapshotId: string }[] };
      const res = await fetch(`/api/boards/${b}/snapshots/${rounds.rounds[0].snapshotId}`);
      return { status: res.status, type: res.headers.get("content-type"), bytes: (await res.arrayBuffer()).byteLength };
    }, id);
    expect(snapshotX).toMatchObject({ status: 200, type: "application/octet-stream" });
    expect(snapshotX.bytes).toBeGreaterThan(100);
    // another board's id never reaches this snapshot
    const other = await page.evaluate(async (b) => (await fetch(`/api/boards/${b}-other/snapshots/anything`)).status, id);
    expect(other).toBe(404);
  });
});
