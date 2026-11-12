import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Sandboxes ship a Chromium that may not match the pinned Playwright build. When it exists
// use it; CI installs the matching browser with `npx playwright install` and skips this.
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

const PORT = Number(process.env.PORT ?? 3100);
// A second server, not in local-only mode, so the login page can be checked (in local-only mode /login redirects into
// the app). It has placeholder Supabase settings and never contacts anything: without a session it serves /login.
const AUTH_PORT = PORT + 1;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      // iPhone 13 viewport, touch and DPR, but driven by Chromium (WebKit is not installed).
      name: "phone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  // Started in order. Locally the first builds the app; in CI the workflow's "Build" step already did, so it only starts it.
  // The second server reuses that build.
  webServer: [
    {
      command: process.env.CI ? "npm start" : "npm run build && npm start",
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: { ATELIER_LOCAL_ONLY: "1", PORT: String(PORT), NEXT_TELEMETRY_DISABLED: "1" },
    },
    {
      command: `npx next start -p ${AUTH_PORT}`,
      url: `http://localhost:${AUTH_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder",
        ATELIER_OWNER_ID: "00000000-0000-0000-0000-000000000000",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
