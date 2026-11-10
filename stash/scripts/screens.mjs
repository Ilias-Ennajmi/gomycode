// Screenshots of the main screens with fixture data, no backend needed.
//
//   FIXTURE_VIDEO=/path/to/small.webm node scripts/fixtures/mock-supabase.mjs &      # fixture Supabase on :54399
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture npx next dev -p 3100 &
//   [ONLY=today,play] [THEMES=light] node scripts/screens.mjs <outDir> [baseUrl]
//
// (`next build && next start -p 3100` with the same two variables works too, and is faster.)
// Phone viewport 412×915 at 2x, light and dark. The mock's /__mode switches the dataset (an empty
// account, no AI key yet, the daily question limit, a recovery code already made). Prints one line
// per screen and any page errors. FIXTURE_VIDEO is optional: any short WebM (Playwright's Chromium
// has no H.264), e.g. `ffmpeg -f lavfi -i gradients=s=360x640:d=4 -c:v libvpx-vp9 small.webm`.
import { createRequire } from "node:module";
// require() so a global Playwright install (NODE_PATH) works too; the app does not depend on it.
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "./screens";
const BASE = (process.argv[3] || "http://127.0.0.1:3100").replace(/\/$/, "");
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const THEMES = (process.env.THEMES || "light,dark").split(",");
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:54399";
mkdirSync(OUT, { recursive: true });

const wait = (ms) => (page) => page.waitForTimeout(ms);
const click = (re, role = "button") => async (page) => {
  await page.getByRole(role, { name: re }).first().click();
  await page.waitForTimeout(900);
};
const steps = (...fns) => async (page, ctx) => {
  for (const fn of fns) await fn(page, ctx);
};
const fill = (label, text) => async (page) => {
  await (label.startsWith("#") ? page.locator(label) : page.getByLabel(label, { exact: true }).first()).fill(text);
  await page.waitForTimeout(200);
};
const press = (key) => async (page) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(400);
};
const scrollTo = (re, role = "heading") => async (page) => {
  await page.getByRole(role, { name: re }).first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(400);
};

// Three "screenshots" put in the share inbox, as the service worker does when several are shared at once.
const shareThree = async (page) => {
  await page.goto(`${BASE}/offline.html`);
  await page.evaluate(async () => {
    const cache = await caches.open("stash-share-inbox");
    for (const [i, id] of ["fixture-shot-1", "fixture-shot-2", "fixture-shot-3"].entries()) {
      const c = document.createElement("canvas");
      c.width = 540;
      c.height = 1170;
      const g = c.getContext("2d");
      g.fillStyle = `hsl(${40 + i * 110} 60% 55%)`;
      g.fillRect(0, 0, 540, 1170);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(40, 780, 460, 220);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      await cache.put(`/share/inbox/${id}`, new Response(blob, { headers: { "Content-Type": "image/png", "X-Stash-Shared-At": String(Date.now()) } }));
    }
  });
};

// "Share my month as a picture": headless Chromium can't share files, so the PNG is downloaded; keep it.
const wrappedPoster = async (page, { theme }) => {
  const download = page.waitForEvent("download", { timeout: 15_000 });
  await page.getByRole("button", { name: /share my month/i }).click();
  await (await download).saveAs(`${OUT}/wrapped-poster-${theme}.png`);
  await page.waitForTimeout(500);
};

const CODE = "4F7QK-2M9XA-0TB3R-H8ZNC";

const SCREENS = [
  { name: "today", path: "/today", full: true },
  { name: "today-quicksort", path: "/today", act: click(/quick sort/i) },
  { name: "today-length", path: "/today", act: click(/change length|length/i) },
  { name: "today-ask", path: "/today", act: click(/ask your saves/i) },
  // Play: one screen per playback mode (contract 0007 §7).
  { name: "play", path: "/play?queue=today" }, // first up: a save whose stored copy was evicted → embed + one quiet line
  { name: "play-file", path: "/play?id=sv-01" },
  { name: "play-embed-tiktok", path: "/play?id=sv-22" },
  { name: "play-embed-youtube", path: "/play?id=sv-19" },
  { name: "play-link", path: "/play?id=sv-23" },
  { name: "play-article", path: "/play?id=sv-20" },
  { name: "library", path: "/library" },
  { name: "library-collection", path: "/library?c=tag%3Ahooks", full: true },
  { name: "library-collection-places", path: "/library?c=places%3Aplaces" },
  { name: "library-map", path: "/library?lens=map" },
  { name: "library-galaxy", path: "/library?lens=galaxy" },
  { name: "library-galaxy-space", path: "/library?lens=galaxy&space=sp-mkt", full: true },
  { name: "library-search", path: "/library?search=1" },
  { name: "library-search-results", path: "/library", act: steps(fill("Search what was said", "what did I save about hooks"), press("Enter"), wait(1200)) },
  { name: "library-ask-thinking", path: "/library?ask=1", act: steps(fill("Your question", "What makes a good hook?"), press("Enter"), wait(700)) },
  { name: "library-ask-answer", path: "/library?ask=1", act: steps(fill("Your question", "What makes a good hook?"), press("Enter"), wait(7000)) },
  { name: "library-ask-earlier", path: "/library?ask=1", act: click(/where should i eat in lisbon/i) },
  { name: "ask-no-key", path: "/library?ask=1", mode: "nokey", act: steps(fill("Your question", "What makes a good hook?"), press("Enter"), wait(7000)) },
  { name: "ask-limit", path: "/library?ask=1", mode: "limit", act: steps(fill("Your question", "What makes a good hook?"), press("Enter"), wait(1500)) },
  { name: "item", path: "/item/sv-01", full: true },
  { name: "item-highlight", path: "/item/sv-01", act: steps(click(/^Highlight: Then show the messy middle/i), scrollTo(/^Highlights$/)) },
  { name: "item-evicted", path: "/item/sv-06" },
  { name: "item-youtube", path: "/item/sv-19", full: true },
  { name: "item-article", path: "/item/sv-20", full: true },
  { name: "item-processing", path: "/item/sv-16" },
  { name: "item-queued", path: "/item/sv-21" },
  { name: "item-no-key", path: "/item/sv-22" },
  { name: "item-link", path: "/item/sv-23" },
  { name: "space", path: "/s/sp-mkt", full: true },
  { name: "learn", path: "/learn", full: true },
  { name: "you", path: "/you", full: true },
  { name: "you-wrapped-share", path: "/you", act: wrappedPoster },
  { name: "settings", path: "/settings", full: true },
  { name: "settings-setup-no-key", path: "/settings#setup", mode: "nokey" },
  { name: "settings-setup-not-owner", path: "/settings#setup", mode: "empty" },
  { name: "settings-recovery", path: "/settings#recovery", mode: "recovery", act: scrollTo(/move to a new phone/i) },
  { name: "settings-recovery-code", path: "/settings#recovery", act: steps(click(/create a recovery code/i), wait(900)), sheetFull: true },
  { name: "settings-recovery-rotate", path: "/settings#recovery", mode: "recovery", act: click(/make a new code/i) },
  { name: "settings-restore", path: "/settings#recovery", act: steps(click(/i have a recovery code/i), fill("#recovery-code", "4f7qk2m9xa0tb")) },
  { name: "settings-restore-not-found", path: "/settings#recovery", act: steps(click(/i have a recovery code/i), fill("#recovery-code", "00000-2M9XA-0TB3R-H8ZNC"), click(/restore my stash/i), wait(800)) },
  { name: "settings-restore-rate-limited", path: "/settings#recovery", act: steps(click(/i have a recovery code/i), fill("#recovery-code", "99999-2M9XA-0TB3R-H8ZNC"), click(/restore my stash/i), wait(800)) },
  { name: "settings-backups", path: "/settings#backups", act: scrollTo(/^Backups$/) },
  { name: "restore-link", path: `/restore#${CODE}` },
  { name: "share", path: "/share?title=Reel&text=Look%20at%20this&url=https%3A%2F%2Fwww.instagram.com%2Freel%2FCxFixture1%2F" },
  // The old Android shell (1.0.0) shares plain text only, with the link inside `text`.
  { name: "share-legacy-text", path: "/share?text=Watch%20this%20https%3A%2F%2Fvm.tiktok.com%2FZMfixture%2F%20%23fyp" },
  { name: "share-youtube", path: "/share?title=How%20to%20price%20a%20product&url=https%3A%2F%2Fyoutu.be%2FFx7pRiceTalk%3Fsi%3Dabc" },
  { name: "share-article", path: "/share?title=A%20brand%20is%20a%20promise&text=https%3A%2F%2Fwww.fieldnotes.example%2Fessays%2Fa-brand-is-a-promise%3Futm_source%3Dnewsletter" },
  { name: "share-screenshots", path: "/share?shared-image=fixture-shot-1,fixture-shot-2,fixture-shot-3", before: shareThree },
  { name: "collection", path: "/c/fixtureslug0001", full: true },
  { name: "import", path: "/import" },
  {
    name: "import-links",
    path: "/import",
    full: true,
    act: steps(
      click(/a list of links/i, "radio"),
      fill("Links", "https://youtu.be/Fx7pRiceTalk\nhttps://www.youtube.com/shorts/aBcDeFgHiJk\nhttps://www.example.com/blog/a-new-article\nhttps://www.instagram.com/reel/CxNew12345/"),
      click(/find the links/i),
    ),
  },
  { name: "triage", path: "/triage" },
  { name: "design", path: "/design", full: true, onlyTheme: "light" },
  { name: "first-run", path: "/today", mode: "empty", full: true },
  { name: "first-run-restore", path: "/today", mode: "empty", act: click(/i have a recovery code/i) },
  { name: "library-empty", path: "/library", mode: "empty" },
  { name: "learn-empty", path: "/learn", mode: "empty" },
];

const setMode = (mode) => fetch(`${MOCK}/__mode`, { method: "POST", body: JSON.stringify({ mode }) });

const browser = await chromium.launch();
for (const theme of THEMES) {
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
      acceptDownloads: true,
      // A production build registers the service worker; screenshots should always see the network.
      serviceWorkers: "block",
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("stash.appearance", JSON.stringify({ theme: t, accent: "lime", updatedAt: 1 }));
        localStorage.setItem("stash.play.hints", "9");
        localStorage.setItem("stash.play.sessions", "9");
      } catch {}
    }, theme);
    // The platforms' players can't load here: each embed gets a fixture frame that says what it stands for.
    await ctx.route(/^https:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube-nocookie\.com)\//, async (route) => {
      const url = route.request().url();
      const hue = (url.length * 37) % 360;
      const svg = await (await fetch(`${MOCK}/storage/v1/object/sign/stash-thumbs/f%253Fh%253D${hue}`)).text();
      const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      const who = url.includes("tiktok") ? "TikTok player" : url.includes("instagram") ? "Instagram embed" : "YouTube player";
      await route.fulfill({
        contentType: "text/html",
        body: `<body style="margin:0;background:#000;font:600 14px system-ui"><img src="${src}" style="width:100vw;height:100vh;object-fit:cover"><span style="position:fixed;left:8px;top:8px;padding:4px 10px;border-radius:99px;background:rgba(0,0,0,.6);color:#fff">${who} (fixture)</span></body>`,
      });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|Hydration|Minified React/i.test(m.text())) errors.push(m.text().slice(0, 160));
    });
    try {
      if (s.before) await s.before(page, { theme });
      await page.goto(BASE + s.path, { waitUntil: "load", timeout: 60_000 });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForTimeout(2200);
      if (s.act) await s.act(page, { theme });
      const file = `${OUT}/${s.name}-${theme}.png`;
      if (s.sheetFull) {
        // A sheet taller than the screen: let it grow so the whole of it is in the picture.
        await page.setViewportSize({ width: 412, height: 1500 });
        await page.waitForTimeout(500);
      }
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
