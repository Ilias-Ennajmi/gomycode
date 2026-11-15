import { expect, test } from "@playwright/test";
import { goToTab, openApp, reset } from "./helpers";
// The screens the other specs don't open: Settings, Discover, News, making a highlight, and
// changes made while the connection is down.

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

test("Settings: theme, language and a changed switch stick", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await expect(page.getByText("Personalise").first()).toBeVisible();

  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  const compact = page.getByRole("switch", { name: /Compact density/ });
  const before = await compact.getAttribute("aria-checked");
  await compact.click();
  await expect(compact).not.toHaveAttribute("aria-checked", before!);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await expect(page.getByRole("switch", { name: /Compact density/ })).not.toHaveAttribute(
    "aria-checked",
    before!
  );
  await page.getByRole("switch", { name: /Compact density/ }).click();

  // French is loaded when chosen (its own chunk), and English stays the default after.
  await page.getByRole("radio", { name: "Français", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText("Vos données").first()).toBeVisible();
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("Discover: a pasted feed address is found and followed", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /Browse, search, or follow a topic/ }).click();
  const dialog = page.getByRole("dialog").first();
  const search = dialog.getByRole("searchbox").or(dialog.getByLabel("Search sources")).first();
  await search.fill(`${process.env.FIXTURES_URL}/feed/coverage-notes.xml`);
  await search.press("Enter");
  await expect(dialog.getByText(/coverage notes/i).first()).toBeVisible({ timeout: 30_000 });
  await dialog
    .getByRole("button", { name: /^Follow/ })
    .first()
    .click();
  await expect
    .poll(async () => {
      const { feeds } = await (await page.request.get("/api/feeds")).json();
      return feeds.some((f: { url: string }) => f.url.includes("coverage-notes"));
    })
    .toBe(true);
});

test("News: the front page opens, and its source picker too", async ({ page }) => {
  await openApp(page);
  await goToTab(page, "News");
  await expect(
    page.getByText(/Top stories|Your front page|The News|Choose my sources/).first()
  ).toBeVisible();
  // No error boundary, no broken screen.
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

test("a highlight made by selecting text shows up in Highlights", async ({ page }) => {
  await openApp(page);
  // An RSS article: the first card in For You is a News excerpt, which has no body to select.
  await page.locator("[data-article-id]").filter({ hasText: "onboarding flow" }).first().click();
  const paragraph = page.locator(".reader-content p").first();
  await expect(paragraph).toBeVisible({ timeout: 30_000 });
  await paragraph.selectText();
  const toolbar = page.getByRole("toolbar", { name: "Highlight the selection" });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: /Highlight in yellow/ }).click();
  await expect
    .poll(async () => {
      const body = await (await page.request.get("/api/highlights")).json();
      return JSON.stringify(body).length;
    })
    .toBeGreaterThan(200);
  const { highlights } = await (await page.request.get("/api/highlights")).json();
  const mine = highlights.find(
    (h: { text: string }) => h.text.length > 10 && !h.text.includes("focus")
  );
  expect(mine).toBeTruthy();
  // Take it away again.
  expect((await page.request.delete(`/api/highlights/${mine.id}`)).ok()).toBe(true);
});

test("a change made offline waits, then goes through when the connection is back", async ({
  page,
  context,
}) => {
  await openApp(page);
  const card = page.locator("[data-article-id]").first();
  const id = (await card.getAttribute("data-article-id"))!;
  await context.setOffline(true);
  await expect(page.getByText("Offline: showing saved copies")).toBeVisible();
  await card.getByRole("button", { name: "Read later" }).first().click();
  await expect(page.getByText(/1 change waiting|change waiting/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/change made offline sent|changes made offline sent/)).toBeVisible({
    timeout: 30_000,
  });
  const article = await (await page.request.get(`/api/articles/${id}`)).json();
  expect(JSON.stringify(article)).toContain('"isSaved":true');
});
