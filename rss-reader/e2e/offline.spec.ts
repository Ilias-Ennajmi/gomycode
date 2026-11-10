import { expect, test, type Page } from "@playwright/test";
import { openApp, reset } from "./helpers";

// The offline worker (public/sw.js), through the real thing. It only registers itself in
// production builds, so the tests register it by hand. Playwright sees the worker's own
// requests with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS (set in playwright.config.ts).

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

async function withWorker(page: Page) {
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  // Twice: once to be under the worker, once for the worker to keep the page and the lists.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.reload();
  await expect(page.locator("[data-article-id]").first()).toBeVisible({ timeout: 30_000 });
}

test("a connection that never answers still opens the saved copy", async ({ page, context }) => {
  await withWorker(page);
  // From here the page and its lists hang: no answer, no error.
  const stall = () => new Promise<void>(() => {});
  await context.route(/\/reader(\?.*)?$/, stall);
  await context.route(/\/api\/articles(\?.*)?$/, stall);
  const started = Date.now();
  await page.reload({ waitUntil: "commit" });
  await expect(page.locator("[data-article-id]").first()).toBeVisible({ timeout: 25_000 });
  // Without the worker's patience this would wait on the network for good.
  expect(Date.now() - started).toBeLessThan(25_000);
});

test("with no connection at all, the app and the lists still open", async ({ page, context }) => {
  await withWorker(page);
  await context.route(/\/reader(\?.*)?$/, (route) => route.abort("internetdisconnected"));
  await context.route(/\/api\//, (route) => route.abort("internetdisconnected"));
  await page.reload({ waitUntil: "commit" });
  await expect(page.locator("[data-article-id]").first()).toBeVisible({ timeout: 25_000 });
});
