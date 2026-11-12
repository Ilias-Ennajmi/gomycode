import { expect, test } from "@playwright/test";
import { buildFaultyBoard } from "../bench/fixtures";
import { seedBoard } from "../bench/harness";
import { expectCount, exposeBoard, objects, placeWith, uniqueBoardId, waitForBoard } from "./helpers";

/*
 * Review Focus #4: a board that holds invalid or unknown objects (an older or newer schema, missing fields, NaN or
 * infinite coordinates, a value that is not even an object) must open, skip what it cannot read with a console.warn, and
 * keep working. Nothing may throw, and the good objects must be exactly the ones that were good.
 */
test.describe("seeded faults", () => {
  test("a board with invalid, unknown and NaN objects opens, skips them quietly and stays editable", async ({ page }) => {
    const { update, validIds, badIds } = buildFaultyBoard();
    const id = uniqueBoardId("faulty");
    await seedBoard(page, id, update); // (this visits /api/health, which has no favicon: that 404 is not the app's)
    await exposeBoard(page);
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
      if (m.type() === "warning") warnings.push(m.text());
    });
    await page.goto(`/b/${id}`);
    await waitForBoard(page);

    // Only the good objects are in the document view, and they are drawn.
    const seen = (await objects(page)).map((o) => o.id).sort();
    expect(seen).toEqual([...validIds].sort());
    for (const good of validIds) await expect(page.locator(`#board-canvas [data-object-id="${good}"]`)).toBeAttached();
    for (const bad of badIds) await expect(page.locator(`[data-object-id="${bad}"]`)).toHaveCount(0);

    // The page did not fall over: every skipped object was reported with console.warn, never as an error.
    expect(errors).toEqual([]);
    expect(warnings.some((w) => /skipping invalid object/.test(w))).toBe(true);
    for (const o of await objects(page)) {
      for (const k of ["x", "y", "w", "h"] as const) expect(Number.isFinite(o[k])).toBe(true);
    }

    // And it still works: add something, reload, everything good is still there and the bad ones are still skipped.
    await placeWith(page, "n", { x: 0, y: 400 });
    await page.keyboard.press("Escape");
    await expectCount(page, validIds.length + 1);
    await page.reload();
    await waitForBoard(page);
    await expectCount(page, validIds.length + 1);
    expect(errors).toEqual([]);
  });

  test("the home list and the board's thumbnail path cope with the same board", async ({ page }) => {
    const { update } = buildFaultyBoard();
    const id = uniqueBoardId("faulty-home");
    await seedBoard(page, id, update);
    await exposeBoard(page);
    await page.goto(`/b/${id}`);
    await waitForBoard(page);
    await page.getByRole("link", { name: "Atelier home" }).click();
    await expect(page.locator("article").first()).toBeVisible();
  });
});
