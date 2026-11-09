import { expect, test } from "@playwright/test";
import { goToTab, isPhone, openApp, phoneTitle, reset } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

test("For You opens with the greeting, 5 min and the list", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("button", { name: "Got 5 minutes?" })).toBeVisible();
  await expect(page.getByText(/unread/).first()).toBeVisible();
  // Rows have their picture on the left: the thumbnail comes before the headline.
  const card = page.locator("[data-card-body]").first();
  const thumb = await card.locator("[data-card-thumb]").boundingBox();
  const title = await card.locator("h2").boundingBox();
  if (thumb && title) expect(thumb.x).toBeLessThan(title.x);
});

test("every main tab opens", async ({ page }, info) => {
  await openApp(page);
  for (const tab of ["News", "RSS", "Podcasts", "Later"]) {
    await goToTab(page, tab);
    if (isPhone(info)) await expect(phoneTitle(page)).toHaveText(new RegExp(tab, "i"));
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
  }
});

test("an article opens in the reader", async ({ page }) => {
  await openApp(page);
  await goToTab(page, "RSS");
  const card = page.locator("[data-article-id] h2 button").first();
  const title = (await card.innerText()).trim();
  await card.click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

test("the API answers and refuses without a session", async ({ page, playwright }) => {
  const res = await page.request.get("/api/articles?page=1&limit=5");
  expect(res.ok()).toBe(true);
  expect((await res.json()).articles.length).toBeGreaterThan(0);
  const anonymous = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: { cookies: [], origins: [] },
  });
  expect((await anonymous.get("/api/articles")).status()).toBe(401);
  await anonymous.dispose();
});

test("the health check is public and says what's wrong", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const res = await anonymous.get("/api/health");
  const body = await res.json();
  expect(body.database).toBe(true);
  // The seeded world has never run the hourly refresh: not healthy yet, and it says so.
  expect(body.refreshing).toBe(false);
  expect(res.status()).toBe(503);
  expect(Object.keys(body).sort()).toEqual(
    ["database", "lastRefreshMinutesAgo", "ok", "refreshing"].sort()
  );
  await anonymous.dispose();
});
