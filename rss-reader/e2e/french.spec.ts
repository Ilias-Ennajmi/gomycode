import { expect, test } from "@playwright/test";
import { goToTab, reset } from "./helpers";

// The interface in French: the main screens show French, and no screen is left half in
// English. The check for stray English is a list of everyday words that must not appear.

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

const ENGLISH = [
  "Unread",
  "Saved",
  "Settings",
  "Mark all as read",
  "Refresh",
  "Search",
  "Sign out",
  "Notifications are",
  "Your data",
  "Appearance",
  "Read later",
  "Top stories",
  "Could not",
];

async function visibleText(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.body.innerText);
}

test("the main screens are in French", async ({ page }) => {
  await page.goto("/reader");
  await page.evaluate(() => localStorage.setItem("locale", JSON.stringify("fr")));
  await page.reload();
  await expect(page.locator("[data-article-id]").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText("non lus").first()).toBeVisible();

  const screens: string[] = [await visibleText(page)];
  for (const tab of ["Actus", "À lire"]) {
    await goToTab(page, tab);
    screens.push(await visibleText(page));
  }
  await page.getByRole("button", { name: "Réglages", exact: true }).first().click();
  await expect(page.getByText("Personnaliser").first()).toBeVisible();
  screens.push(await visibleText(page));

  const text = screens.join("\n");
  for (const word of ENGLISH) {
    expect(text, `"${word}" is still in English`).not.toContain(word);
  }
});
