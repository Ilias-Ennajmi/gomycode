import { expect, test } from "@playwright/test";

/*
 * The second e2e server runs with accounts configured (placeholder settings, no network) and without local-only mode:
 * nothing is reachable without an owner session. This is the closed-by-default half of "owner login"; the sign-in itself
 * (password, two-step code) needs a real Supabase project and is part of the deploy smoke checklist.
 */
const AUTH = `http://localhost:${Number(process.env.PORT ?? 3100) + 1}`;

test.describe("owner-only gate (server without local-only mode)", () => {
  test("pages send a signed-out visitor to the login screen and remember where they were going", async ({ page }) => {
    await page.goto(`${AUTH}/b/some-board`);
    await expect(page).toHaveURL(`${AUTH}/login?next=%2Fb%2Fsome-board`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("API calls without a session get 401 JSON, never data", async ({ request }) => {
    for (const path of ["/api/boards", "/api/folders", "/api/assets"]) {
      const res = await request.get(`${AUTH}${path}`, { maxRedirects: 0 });
      expect(res.status(), path).toBe(401);
      expect(res.headers()["content-type"]).toContain("application/json");
    }
  });

  test("the health check and the app shell files stay open", async ({ request }) => {
    expect((await request.get(`${AUTH}/api/health`)).status()).toBe(200);
    expect((await request.get(`${AUTH}/manifest.webmanifest`)).status()).toBe(200);
    expect((await request.get(`${AUTH}/offline.html`)).status()).toBe(200);
  });

  test("local-only mode (the main e2e server) needs no sign-in and /login goes straight to the app", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  });
});
