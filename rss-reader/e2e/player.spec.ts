import { expect, test } from "@playwright/test";
import { goToTab, isPhone, openApp, reset } from "./helpers";
import { IDS } from "./seed";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

async function openEpisode(page: import("@playwright/test").Page, id: string, phone: boolean) {
  await openApp(page);
  await goToTab(page, "Podcasts");
  const tile = page.locator(`[data-article-id="${id}"]`).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.locator("button").first().click();
  if (!phone) await page.getByRole("button", { name: "Open the full-screen player" }).click();
  const sheet = page
    .getByRole("dialog")
    .filter({ has: page.locator('[data-card="read-along"], [data-card]') })
    .last();
  await sheet
    .getByRole("button", { name: /^(Play|Resume at)/ })
    .first()
    .click();
  await expect.poll(() => page.evaluate(() => !document.querySelector("audio")?.paused)).toBe(true);
  return sheet;
}

test("Podcasts opens on Continue listening", async ({ page }) => {
  await openApp(page);
  await goToTab(page, "Podcasts");
  const shelf = page.getByRole("region", { name: "Continue listening" });
  await expect(shelf.getByRole("button", { name: /The Science of Sleep/ })).toBeVisible();
  await expect(shelf.getByText(/min left/).first()).toBeVisible();
});

test("read along follows the voice phrase by phrase", async ({ page }, info) => {
  const sheet = await openEpisode(page, IDS.sleep, isPhone(info));
  await page.evaluate(() => {
    const audio = document.querySelector("audio")!;
    audio.currentTime = 24;
  });
  const card = sheet.locator('[data-card="read-along"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator("[data-phrase]")).not.toHaveCount(0);
  await expect(card.locator('[aria-current="true"]')).toContainText(/caffeine|Deep sleep/);
  // The box is small: a few phrases, not the whole transcript.
  const box = await card
    .locator("[data-phrase]")
    .first()
    .evaluate((el) => el.closest("div.overflow-y-auto")!.getBoundingClientRect().height);
  expect(box).toBeLessThan(260);
  await page.evaluate(() => document.querySelector("audio")?.pause());
});

test("a sponsor chapter is skipped, with Undo", async ({ page }, info) => {
  await openEpisode(page, IDS.sponsor, isPhone(info));
  await page.evaluate(() => {
    document.querySelector("audio")!.currentTime = 62;
  });
  await expect(page.getByText(/Skipped a sponsor/)).toBeVisible({ timeout: 20_000 });
  const position = await page.evaluate(() => document.querySelector("audio")!.currentTime);
  expect(position).toBeGreaterThanOrEqual(99);
  await page.evaluate(() => document.querySelector("audio")?.pause());
});
