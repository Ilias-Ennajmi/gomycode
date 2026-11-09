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
  // Playing and its length known: before that, the resume point would undo a test's seek.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const audio = document.querySelector("audio");
        return Boolean(audio && !audio.paused && audio.readyState >= 1);
      })
    )
    .toBe(true);
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

test("car mode: big controls, and back out", async ({ page }, info) => {
  const sheet = await openEpisode(page, IDS.sleep, isPhone(info));
  await sheet.getByRole("button", { name: "Car mode" }).click();
  const car = page.getByRole("dialog", { name: "Car mode" });
  await expect(car.getByText("The Science of Sleep")).toBeVisible();
  await car.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(true);
  await car.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")?.paused)).toBe(false);
  await car.getByRole("button", { name: "Leave car mode" }).click();
  await expect(car).toHaveCount(0);
  await page.evaluate(() => document.querySelector("audio")?.pause());
});

test("download an episode, then it plays from the device, seeking included", async ({
  page,
}, info) => {
  // The service worker only registers itself in production builds: here it's done by hand.
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  const sheet = await openEpisode(page, IDS.sleep, isPhone(info));
  await page.evaluate(() => document.querySelector("audio")?.pause());
  await sheet.getByRole("button", { name: "Download for offline" }).click();
  await expect(sheet.getByRole("button", { name: /^Downloaded/ })).toBeVisible();

  // Podcasts → ⋯ → Downloads lists it; playing it uses the saved copy.
  await page.goto("/reader");
  await goToTab(page, "Podcasts");
  await page.getByRole("button", { name: "List options" }).first().click();
  await page.getByRole("menuitem", { name: "Downloads" }).click();
  const downloads = page.getByRole("dialog", { name: "Downloads" });
  await downloads.getByRole("button", { name: /^The Science of Sleep/ }).click();
  await expect
    .poll(() => page.evaluate(() => document.querySelector("audio")?.getAttribute("src")))
    .toMatch(/^\/offline-audio\//);
  await expect.poll(() => page.evaluate(() => !document.querySelector("audio")?.paused)).toBe(true);
  await page.evaluate(() => {
    document.querySelector("audio")!.currentTime = 40;
  });
  await expect
    .poll(() => page.evaluate(() => document.querySelector("audio")!.currentTime))
    .toBeGreaterThan(40);
  await page.evaluate(() => document.querySelector("audio")?.pause());
});
