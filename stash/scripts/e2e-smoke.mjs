// End-to-end smoke test against a running Stash (production by default).
// Shares a link, checks it reaches the server, opens it from the Library and deletes it.
//
//   node scripts/e2e-smoke.mjs [baseUrl]
//
// Needs Playwright (`npm i -D playwright` or a global install) and anonymous
// sign-ins switched on in Supabase. Prints one line per step and exits 1 on a failure.
import { chromium } from "playwright";

const BASE = (process.argv[2] || "https://stash-drab-kappa.vercel.app").replace(/\/$/, "");
const TITLE = `Stash e2e ${new Date().toISOString().slice(0, 19)}`;
const LINK = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

const browser = await chromium
  .launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" })
  .catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

let failed = false;
async function step(name, fn) {
  try {
    const note = await fn();
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""}`);
    return true;
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${name} — ${String(e.message || e).split("\n")[0]}`);
    return false;
  }
}

const outboxSize = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("stash", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("outbox", { keyPath: "clientId" });
        req.onsuccess = () => {
          const r = req.result.transaction("outbox", "readonly").objectStore("outbox").count();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(-1);
        };
        req.onerror = () => resolve(-1);
      }),
  );

let itemId = null;

await step("device identity (anonymous session)", async () => {
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  const cookies = await ctx.cookies();
  const auth = cookies.find((c) => /^sb-.*-auth-token/.test(c.name));
  if (!auth) throw new Error("no Supabase session cookie: are anonymous sign-ins on?");
  return auth.name;
});

const saved = await step("share sheet shows Saved", async () => {
  await page.goto(`${BASE}/share?url=${encodeURIComponent(LINK)}&title=${encodeURIComponent(TITLE)}`);
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 10_000 });
});

if (saved) {
  await step("outbox flushed to the server", async () => {
    for (let i = 0; i < 30; i++) {
      if ((await outboxSize()) === 0) return "outbox empty";
      await page.waitForTimeout(500);
    }
    throw new Error(`outbox still holds ${await outboxSize()} item(s)`);
  });

  await step("Library lists the save", async () => {
    await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
    await page.getByText(TITLE).first().waitFor({ timeout: 15_000 });
  });

  await step("item page opens", async () => {
    await page.getByText(TITLE).first().click();
    await page.waitForURL(/\/item\//, { timeout: 10_000 });
    itemId = page.url().split("/item/")[1];
    return page.url().replace(BASE, "");
  });

  await step("delete removes it", async () => {
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByText("Deleted", { exact: true }).waitFor({ timeout: 5_000 });
    await page.waitForTimeout(6_000); // undo window is 4 s
    await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1_500);
    if (await page.getByText(TITLE).count()) throw new Error("still listed after delete");
  });
}

console.log(`INFO  title="${TITLE}" item=${itemId ?? "-"}`);
if (errors.length) console.log(`INFO  page errors: ${JSON.stringify(errors)}`);
await browser.close();
process.exit(failed ? 1 : 0);
