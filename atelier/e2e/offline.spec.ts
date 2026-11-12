import { expect, test } from "@playwright/test";
import {
  expectCount,
  exposeBoard,
  objectsOfType,
  placeWith,
  selectIds,
  storedUpdateCount,
  syncStatus,
  textOf,
  uniqueBoardId,
  waitForBoard,
  waitForPageCached,
  waitForServiceWorker,
} from "./helpers";

test.describe("offline", () => {
  test("edits made offline survive a reload, the status says so, and the board list still opens", async ({ page, context }) => {
    const id = uniqueBoardId("offline");
    await exposeBoard(page);

    // Online first: the start page registers the worker; a full load of the board lets it keep a copy of the board's page.
    await page.goto("/");
    await waitForServiceWorker(page);
    await page.goto(`/b/${id}`);
    await waitForBoard(page);
    await waitForPageCached(page, `/b/${id}`);
    await placeWith(page, "n", { x: -150, y: -100 });
    await page.keyboard.type("made online");
    await page.keyboard.press("Escape"); // leave the editor
    await page.keyboard.press("Escape"); // and clear the selection, so that N is the tool key again, not text for the note
    await expect.poll(async () => (await objectsOfType(page, "sticky")).length).toBe(1);

    // Lose the network.
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(syncStatus(page)).toContainText("Saved on this device");

    await placeWith(page, "n", { x: 150, y: 100 });
    await page.keyboard.type("made offline");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const stickies = await expectCount(page, 2, "sticky");
    const before = await storedUpdateCount(page, id);
    expect(before).toBeGreaterThan(0);
    await expect(syncStatus(page)).toContainText("Saved on this device");

    // Reload with no network: the page comes from the worker, the board from IndexedDB.
    await page.reload();
    await waitForBoard(page);
    const after = await expectCount(page, 2, "sticky");
    expect(after.map((s) => s.id).sort()).toEqual(stickies.map((s) => s.id).sort());
    const texts = await Promise.all(after.map((s) => textOf(page, s.id)));
    expect(texts.sort()).toEqual(["made offline", "made online"]);
    await expect(syncStatus(page)).toContainText("Saved on this device");

    // Offline, an edit after the reload still lands.
    await selectIds(page, [after[0].id]);
    await page.keyboard.press("Delete");
    await expectCount(page, 1, "sticky");

    // The board list works with no network too, and shows this board.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Untitled`) }).first()).toBeVisible();

    // Back online, nothing was lost.
    await context.setOffline(false);
    await page.goto(`/b/${id}`);
    await waitForBoard(page);
    await expectCount(page, 1, "sticky");
  });

  test("a board that was never opened online shows the offline page instead of crashing", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.goto(`/b/never-seen-${Date.now()}`);
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await expect(page.locator("#board-canvas")).toHaveCount(0);
  });
});
