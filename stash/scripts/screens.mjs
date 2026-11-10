// Screenshots of the main screens with fixture data, no backend needed.
//
//   node scripts/fixtures/mock-supabase.mjs &                       # fixture Supabase on :54399
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture npx next dev -p 3100 &
//   [ONLY=today,play] node scripts/screens.mjs <outDir> [baseUrl]
//
// Phone viewport 412×915 at 2x, light and dark. The mock's /__mode switches to an empty account
// for the first-run screens. Prints one line per screen and any page errors.
import { createRequire } from "node:module";
// require() so a global Playwright install (NODE_PATH) works too; the app does not depend on it.
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "./screens";
const BASE = (process.argv[3] || "http://127.0.0.1:3100").replace(/\/$/, "");
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:54399";
mkdirSync(OUT, { recursive: true });

const click = (re) => async (page) => {
  await page.getByRole("button", { name: re }).first().click();
  await page.waitForTimeout(900);
};

const SCREENS = [
  { name: "today", path: "/today" },
  { name: "today-quicksort", path: "/today", act: click(/quick sort/i) },
  { name: "today-length", path: "/today", act: click(/change length|length/i) },
  { name: "play", path: "/play?queue=today" },
  { name: "library", path: "/library" },
  { name: "library-map", path: "/library?lens=map" },
  { name: "library-galaxy", path: "/library?lens=galaxy" },
  { name: "library-search", path: "/library?search=1" },
  { name: "item", path: "/item/sv-01", full: true },
  { name: "space", path: "/s/sp-mkt", full: true },
  { name: "learn", path: "/learn", full: true },
  { name: "you", path: "/you", full: true },
  { name: "settings", path: "/settings", full: true },
  { name: "share", path: "/share?title=Reel&text=Look%20at%20this&url=https%3A%2F%2Fwww.instagram.com%2Freel%2FCxFixture1%2F" },
  { name: "collection", path: "/c/fixtureslug0001", full: true },
  { name: "import", path: "/import" },
  { name: "triage", path: "/triage" },
  { name: "design", path: "/design", full: true, onlyTheme: "light" },
  { name: "first-run", path: "/today", mode: "empty" },
  { name: "library-empty", path: "/library", mode: "empty" },
  { name: "learn-empty", path: "/learn", mode: "empty" },
];

const setMode = (mode) => fetch(`${MOCK}/__mode`, { method: "POST", body: JSON.stringify({ mode }) });

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const s of SCREENS) {
    if (ONLY && !ONLY.has(s.name)) continue;
    if (s.onlyTheme && s.onlyTheme !== theme) continue;
    await setMode(s.mode || "full");
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      timezoneId: "Africa/Casablanca",
      locale: "en-GB",
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("stash.appearance", JSON.stringify({ theme: t, accent: "lime", updatedAt: 1 }));
        localStorage.setItem("stash.play.hints", "9");
      } catch {}
    }, theme);
    // No real videos here: the player falls back to the platform embed, which gets a fixture frame.
    await ctx.route(/(instagram|tiktok)\.com\//, async (route) => {
      const hue = (route.request().url().length * 37) % 360;
      const svg = await (await fetch(`${MOCK}/storage/v1/object/sign/stash-thumbs/f%253Fh%253D${hue}`)).text();
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      await route.fulfill({
        contentType: "text/html",
        body: `<body style="margin:0;background:#000"><img src="${src}" style="width:100vw;height:100vh;object-fit:cover"></body>`,
      });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(BASE + s.path, { waitUntil: "load", timeout: 60_000 });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForTimeout(2200);
      if (s.act) await s.act(page);
      const file = `${OUT}/${s.name}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: Boolean(s.full) });
      console.log(`ok   ${file}${errors.length ? `  errors: ${errors.join(" | ").slice(0, 300)}` : ""}`);
    } catch (e) {
      console.log(`FAIL ${s.name}-${theme}: ${String(e.message || e).split("\n")[0]}`);
    }
    await ctx.close();
  }
}
await setMode("full");
await browser.close();
