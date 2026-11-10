import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { goToTab, isPhone, openApp, reset } from "./helpers";
import { IDS } from "./seed";

// Accessibility of the newer screens, checked with axe: nothing serious or critical
// (missing names, broken roles, unreadable contrast) on what a screen reader or a
// keyboard would meet.

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

async function check(page: Page, what: string, scope?: string) {
  // Sheets fade and slide in: axe reads colours mid-animation as washed out.
  await page.waitForTimeout(600);
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  if (scope) builder = builder.include(scope);
  const { violations } = await builder.analyze();
  const bad = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, what).toEqual([]);
}

test("sign-in page", async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await check(page, "sign-in");
  await context.close();
});

test("5 min sheet, features page, send highlights", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Got 5 minutes?" }).click();
  await expect(page.getByRole("dialog", { name: /How much time/ })).toBeVisible();
  await check(page, "5 min sheet", '[role="dialog"]');
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("button", { name: /Everything Reader can do/ }).click();
  const features = page.getByRole("dialog", { name: "Everything Reader can do" });
  await expect(features.getByRole("list", { name: "Features" })).toBeVisible();
  await check(page, "features page", '[role="dialog"]');
  await features.getByLabel("Search features").fill("offline");
  await expect(features.getByText("Download episodes")).toBeVisible();
  await features.getByRole("button", { name: "Open: Download episodes" }).click();
  await expect(page.getByRole("dialog", { name: "Downloads" })).toBeVisible();
  await check(page, "downloads sheet", '[role="dialog"]');
});

test("send highlights sheet", async ({ page }) => {
  await openApp(page);
  await goToTab(page, "Later");
  await page.locator("button[aria-pressed]", { hasText: /^Highlights$/ }).click();
  await page.getByRole("button", { name: "Send to…" }).click();
  await expect(page.getByRole("dialog", { name: "Send highlights" })).toBeVisible();
  await check(page, "send highlights", '[role="dialog"]');
});

test("car mode", async ({ page }, info) => {
  await openApp(page);
  await goToTab(page, "Podcasts");
  const tile = page.locator(`[data-article-id="${IDS.sleep}"]`).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.locator("button").first().click();
  if (!isPhone(info)) {
    await page.getByRole("button", { name: "Open the full-screen player" }).click();
  }
  const sheet = page
    .getByRole("dialog")
    .filter({ has: page.locator("[data-card]") })
    .last();
  await sheet
    .getByRole("button", { name: /^(Play|Resume at)/ })
    .first()
    .click();
  await sheet.getByRole("button", { name: "Car mode" }).first().click();
  await expect(page.getByRole("dialog", { name: "Car mode" })).toBeVisible();
  await check(page, "car mode", '[aria-label="Car mode"]');
  await page.evaluate(() => document.querySelector("audio")?.pause());
});
