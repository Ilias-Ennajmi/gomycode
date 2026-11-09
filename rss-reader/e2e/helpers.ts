import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { seed } from "./seed";

export const isPhone = (info: TestInfo) => info.project.name === "phone";

/** A fresh world for this file, with no layout or personal preferences carried over. */
export async function reset(page: Page) {
  await seed();
  await page.goto("/reader");
  await page.evaluate(() => localStorage.clear());
}

/** Opens the app and waits for the first list. */
export async function openApp(page: Page, path = "/reader") {
  await page.goto(path);
  await expect(page.locator("[data-article-id]").first()).toBeVisible({ timeout: 60_000 });
}

/** The section title on phones (top bar). */
export function phoneTitle(page: Page) {
  return page.locator("header p.text-\\[22px\\]").first();
}

/** Goes to a section by its tab (bottom bar on phones, top bar on desktop). */
export async function goToTab(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  const tab = nav.getByRole("button", { name: new RegExp(`^${name}`, "i") });
  if (await tab.count()) await tab.first().click();
  else {
    // Phones: the last slot opens the More sheet (it takes the name of a More tab once one
    // is open, so it's found by place, not by name).
    await nav.getByRole("button").last().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(name) })
      .click();
  }
  await page.waitForTimeout(800);
}

/** A sideways finger swipe that React's touch handlers see. */
export async function swipe(page: Page, target: Locator, dx: number, steps = 6) {
  const box = (await target.boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + Math.min(box.height / 2, 40);
  const at = (x: number, y: number) => [{ identifier: 1, clientX: x, clientY: y }];
  await target.dispatchEvent("touchstart", { touches: at(x0, y0) });
  for (let i = 1; i <= steps; i++) {
    await target.dispatchEvent("touchmove", { touches: at(x0 + (dx * i) / steps, y0 + i) });
  }
  await target.dispatchEvent("touchend", { touches: [] });
  await page.waitForTimeout(900);
}

/** Holds a finger on an element (the long-press menu). */
export async function longPress(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const touch = [{ identifier: 1, clientX: box.x + 40, clientY: box.y + 30 }];
  await target.dispatchEvent("touchstart", { touches: touch });
  await page.waitForTimeout(700);
  await target.dispatchEvent("touchend", { touches: [] });
}
