import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { goToTab, openApp, reset } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

test("highlights go to Readwise and Notion with your own tokens", async ({ page }) => {
  await openApp(page);
  await goToTab(page, "Later");
  // The chip in the Later row (the sidebar has a Highlights link too, on desktop).
  await page.locator("button[aria-pressed]", { hasText: /^Highlights$/ }).click();
  await page.getByRole("button", { name: "Send to…" }).click();
  const sheet = page.getByRole("dialog", { name: "Send highlights" });

  const readwise = sheet.getByRole("region", { name: "Readwise" });
  await readwise.getByLabel("Readwise token").fill("wrong");
  await readwise.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Readwise refused the token. Paste a new one.")).toBeVisible();
  await readwise.getByLabel("Readwise token").fill("good-readwise");
  await readwise.getByRole("button", { name: "Connect" }).click();
  await readwise.getByRole("button", { name: "Send new now" }).click();
  await expect(page.getByText("1 sent to Readwise")).toBeVisible();

  const notion = sheet.getByRole("region", { name: "Notion" });
  await notion.getByLabel("Notion token").fill("good-notion");
  await notion
    .getByLabel("Notion database")
    .fill("https://www.notion.so/me/Reading-0123456789abcdef0123456789abcdef?v=1");
  await notion.getByRole("button", { name: "Connect" }).click();
  await notion.getByRole("button", { name: "Send new now" }).click();
  await expect(page.getByText("1 sent to Notion")).toBeVisible();

  const received = await (await page.request.get(`${process.env.FIXTURES_URL}/_received`)).json();
  const sent = JSON.stringify(received);
  expect(sent).toContain("Focus is a muscle you train.");
  expect(sent).toContain('"Title":{"title"');
  expect(sent).toContain('"type":"quote"');
  // The tokens never come back to the browser.
  const status = await (await page.request.get("/api/highlights/send")).text();
  expect(status).not.toContain("good-");
  // Nor sit readable in the database.
  const prisma = new PrismaClient();
  try {
    const stored = await prisma.setting.findUnique({ where: { key: "highlight-exports" } });
    expect(stored?.value).toContain("enc:v1:");
    expect(stored?.value).not.toContain("good-");
  } finally {
    await prisma.$disconnect();
  }

  // Nothing goes twice.
  await readwise.getByRole("button", { name: "Send new now" }).click();
  await expect(page.getByText("Nothing new to send").first()).toBeVisible();
  await notion.getByRole("button", { name: "Send new now" }).click();
  await expect(page.getByText("Nothing new to send").first()).toBeVisible();
  const after = await (await page.request.get(`${process.env.FIXTURES_URL}/_received`)).json();
  expect(after.length).toBe(received.length);
});

test("the month in review", async ({ page }) => {
  await page.goto("/reader?view=recap");
  await expect(page.getByRole("heading", { name: "Your week" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("radio", { name: "Month" }).click();
  await expect(page.getByRole("heading", { name: "Your month" })).toBeVisible();
  await expect(page.locator('[aria-label="Articles read per day"] > div')).toHaveCount(30);
});

test("Listen: the natural voice falls back to the device's when it can't", async ({ page }) => {
  await openApp(page);
  await page.locator("[data-article-id]").first().click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const listen = page.locator('button[aria-label="Listen"]:visible').first();
  const supported = await page.evaluate(() => "speechSynthesis" in window);
  test.skip(!supported, "No speech engine in this browser");
  await listen.click();
  await page.getByRole("button", { name: "Natural voice" }).click();
  // No AI in tests: the server says no, and the device's voice carries on.
  await expect(page.getByText(/natural voice is busy/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
});
