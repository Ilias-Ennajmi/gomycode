import { expect, test } from "@playwright/test";
import { goToTab, isPhone, openApp, reset } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

test("5 min: pick, swap, shuffle, read through, leave and come back", async ({ page }, info) => {
  await openApp(page);
  await page.getByRole("button", { name: "Got 5 minutes?" }).click();
  const picker = page.getByRole("dialog", { name: /How much time/ });
  const titles = picker.locator("button span.line-clamp-3");
  await expect(titles.first()).toBeVisible();
  const first = await titles.first().innerText();
  await picker
    .getByRole("button", { name: /^Swap out/ })
    .first()
    .click();
  await expect(titles.first()).not.toHaveText(first);
  await picker.getByRole("radio", { name: "10 min" }).click();
  await picker.getByRole("button", { name: "Shuffle" }).click();
  const pile = await titles.allInnerTexts();
  expect(pile.length).toBeGreaterThan(1);

  await picker.getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByText("Your 10 minutes").first()).toBeVisible();
  await expect(page.getByText(`1 of ${pile.length}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: pile[0] })).toBeVisible();

  const next = page.getByRole("navigation", { name: "Next in this session" });
  await next.scrollIntoViewIfNeeded();
  await next.getByRole("button").first().click();
  await expect(page.getByText(`2 of ${pile.length}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: pile[1] })).toBeVisible();

  // Leave the reader: the pill brings the piece back.
  if (isPhone(info)) await page.goBack();
  else await page.locator("[data-article-id]").last().click();
  const pill = page.getByRole("button", { name: /Your 10 minutes ·/ });
  if (isPhone(info)) {
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.getByRole("heading", { level: 1, name: pile[1] })).toBeVisible();
  }
  await page.getByRole("button", { name: "End this session" }).first().click();
  await expect(page.getByRole("button", { name: /Your 10 minutes ·/ })).toHaveCount(0);
});

test("5 min from Later: only what's saved, and you can widen it", async ({ page }) => {
  await openApp(page);
  await goToTab(page, "Later");
  await page.getByRole("button", { name: "Got 5 minutes?" }).click();
  const picker = page.getByRole("dialog", { name: /How much time/ });
  await expect(picker.getByRole("radio", { name: "Later only" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await picker.getByRole("radio", { name: "30 min" }).click();
  const sources = picker.locator("button span.truncate");
  await expect(sources.first()).toBeVisible();
  for (const text of await sources.allInnerTexts()) expect(text).toContain("· Later");

  await picker.getByRole("radio", { name: "Later and For You" }).click();
  await expect(picker.getByRole("radio", { name: "Later and For You" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect(sources.first()).toBeVisible();
});
