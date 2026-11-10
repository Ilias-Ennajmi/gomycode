import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { openApp, reset } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reset(page);
  await page.close();
});

async function openSettings(page: Page) {
  await openApp(page);
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /Add a passkey/ })).toBeVisible();
}

test("a passkey unlocks the reader without the password", async ({ page, context }) => {
  // A fingerprint reader that always says yes.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await openSettings(page);
  await page.getByRole("button", { name: /Add a passkey/ }).click();
  await expect(page.getByText(/Passkey added/)).toBeVisible();
  const saved = page.getByRole("list", { name: "Passkeys" }).getByRole("listitem");
  await expect(saved).toHaveCount(1);

  // Signed out: the password page offers the passkey, and it lets you in.
  await context.clearCookies();
  await page.goto("/reader");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Unlock with a passkey" }).click();
  await expect(page).toHaveURL(/\/reader/);
  await expect(page.locator("[data-article-id]").first()).toBeVisible({ timeout: 30_000 });

  // Removed, it no longer opens anything.
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("button", { name: /^Remove passkey/ }).click();
  await expect(saved).toHaveCount(0);
  const again = await (await page.request.get("/api/auth/passkey/login")).json();
  expect(again.available).toBe(false);
});

test("a forged passkey answer is refused", async ({ page }) => {
  const res = await page.request.post("/api/auth/passkey/login", {
    data: { response: { id: "nope", rawId: "nope", type: "public-key", response: {} } },
  });
  expect([400, 401]).toContain(res.status());
});

test("a backup restores what's missing, and only that", async ({ page }) => {
  await openSettings(page);
  const backup = await (await page.request.get("/api/backup")).body();
  // Lose a source and a highlight.
  const { feeds } = await (await page.request.get("/api/feeds")).json();
  const lost = feeds.find((f: { title: string }) => f.title === "Marketing Weekly");
  expect((await page.request.delete(`/api/feeds/${lost.id}`)).ok()).toBe(true);
  const prisma = new PrismaClient();
  try {
    await prisma.highlight.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }

  const input = page.locator('input[aria-label="Backup file"]');
  const file = { name: "reader-backup.json", mimeType: "application/json", buffer: backup };
  await input.setInputFiles(file);
  await expect(page.getByText(/Restored: 1 sources, 1 highlights/)).toBeVisible();
  await input.setInputFiles(file);
  await expect(page.getByText("Everything was already here")).toBeVisible();

  await input.setInputFiles({ ...file, buffer: Buffer.from('{"app":"other"}') });
  await expect(page.getByText("This isn't a Reader backup file.")).toBeVisible();
});

test("a screen that never comes up offers a way out", async ({ page }) => {
  // The app's scripts don't arrive: nothing would ever show.
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.goto("/login");
  const stuck = page.getByRole("alertdialog", { name: "Reader is taking too long" });
  await expect(stuck).toBeVisible({ timeout: 20_000 });
  await expect(
    stuck.getByRole("button", { name: "Reset the saved copy and reload" })
  ).toBeVisible();
  await stuck.getByRole("button", { name: "Keep waiting" }).click();
  await expect(stuck).toHaveCount(0);
});

test("a normal start never shows the way out", async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(13_000);
  await expect(page.locator("#reader-stuck")).toHaveCount(0);
});
