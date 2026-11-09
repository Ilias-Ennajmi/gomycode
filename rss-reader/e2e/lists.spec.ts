import { expect, test } from "@playwright/test";
import { goToTab, isPhone, longPress, openApp, phoneTitle, reset, swipe } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

test("quick look and the source pop-up", async ({ page }, info) => {
  await openApp(page);
  const card = page.locator("[data-article-id]").first();
  if (isPhone(info)) await longPress(page, card);
  else {
    await card.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Quick look" }).click();
  }
  const sheet = page.getByRole("dialog").last();
  await expect(sheet.getByRole("button", { name: /^(Read|Play|Watch)$/ })).toBeVisible();
  await sheet.getByRole("button", { name: /^About / }).click();

  const source = page.getByRole("dialog").last();
  await expect(source.getByRole("button", { name: /^Mute$/ })).toBeVisible();
  await source.getByRole("button", { name: /^Mute$/ }).click();
  await expect(source.getByRole("button", { name: /^Unmute$/ })).toBeVisible();
  await source.getByRole("button", { name: /^Unmute$/ }).click();
  await expect(source.getByRole("button", { name: /^Mute$/ })).toBeVisible();
  await source.getByRole("button", { name: /^Unfollow$/ }).click();
  await expect(source.getByRole("button", { name: "Sure?" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("triage: keep, skip, undo, and opening one comes back to the next card", async ({
  page,
}, info) => {
  await openApp(page);
  await goToTab(page, "RSS");
  await page.getByRole("button", { name: "List options" }).click();
  await page.getByRole("menuitem", { name: "Triage unread" }).click();
  const triage = page.getByRole("dialog", { name: "Triage" });
  const counter = triage.locator("header span.tabular-nums");
  const cardTitle = triage.locator("h2").nth(1);
  await expect(counter).toHaveText(/^1\//);

  const kept = await cardTitle.innerText();
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText(/^2\//);
  await page.keyboard.press("ArrowLeft");
  await expect(counter).toHaveText(/^3\//);
  await triage.getByRole("button", { name: "Undo" }).click();
  await expect(counter).toHaveText(/^2\//);

  const opened = await cardTitle.innerText();
  await triage.getByRole("button", { name: "Open" }).click();
  await expect(triage).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: opened })).toBeVisible();
  if (isPhone(info)) await page.goBack();
  else await page.getByRole("button", { name: "Back to triage" }).click();
  await expect(counter).toHaveText(/^3\//);
  await triage.getByRole("button", { name: "Close" }).click();

  const later = await (await page.request.get("/api/articles?later=queue&limit=100")).json();
  expect(later.articles.some((a: { title: string }) => a.title === kept)).toBe(true);
});

test("swiping a list moves between tabs (phones)", async ({ page }, info) => {
  test.skip(!isPhone(info), "a phone gesture");
  await openApp(page);
  await expect(phoneTitle(page)).toHaveText("For You");
  await swipe(page, page.locator("[data-article-id]").nth(2), -220);
  await expect(phoneTitle(page)).toHaveText("News");
  await swipe(page, page.getByText("The News", { exact: true }), -220);
  await expect(phoneTitle(page)).toHaveText("RSS");
  await swipe(page, page.locator("[data-article-id]").nth(1), 220);
  await expect(phoneTitle(page)).toHaveText("News");
  // A short swipe does nothing.
  await swipe(page, page.getByText("The News", { exact: true }), 60);
  await expect(phoneTitle(page)).toHaveText("News");
});
