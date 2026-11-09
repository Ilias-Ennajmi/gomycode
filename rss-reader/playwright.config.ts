import { defineConfig } from "@playwright/test";

// End-to-end tests against a seeded local database (e2e/seed.ts) and a fake outside world
// (e2e/fixture-server.mjs). CI builds and starts the app; locally a dev server runs on its
// own port and build folder, next to any dev server already running.
//   npm run test:e2e        (needs E2E_DATABASE_URL, a local Postgres)

const CI = Boolean(process.env.CI);
const PORT = Number(process.env.E2E_PORT ?? 3200);
const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 3101);
export const BASE_URL = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://rss:rss@localhost:5432/rss_e2e";

// The app and the seed both use these.
process.env.DATABASE_URL = DATABASE_URL;
process.env.DIRECT_URL = DATABASE_URL;
process.env.FIXTURES_URL = `http://localhost:${FIXTURE_PORT}`;
process.env.E2E_PASSWORD ??= "e2e-password";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One database: tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 860 } } },
  ],
  webServer: [
    {
      command: `node e2e/fixture-server.mjs ${FIXTURE_PORT}`,
      url: `http://localhost:${FIXTURE_PORT}/health`,
      reuseExistingServer: true,
    },
    {
      command: CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
      url: `${BASE_URL}/login`,
      reuseExistingServer: !CI,
      timeout: 240_000,
      env: {
        DATABASE_URL,
        DIRECT_URL: DATABASE_URL,
        APP_PASSWORD: process.env.E2E_PASSWORD,
        AUTH_SECRET: "e2e-secret",
        NEXT_DIST_DIR: CI ? ".next" : ".next-e2e",
        // No outside AI or push in tests.
        GEMINI_API_KEY: "",
        VAPID_PRIVATE_KEY: "",
        // Highlight exports go to the fixtures' stand-ins (e2e/fixture-server.mjs).
        READWISE_API_URL: `${process.env.FIXTURES_URL}/readwise`,
        NOTION_API_URL: `${process.env.FIXTURES_URL}/notion`,
      },
    },
  ],
});
