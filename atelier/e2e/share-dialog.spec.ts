import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { MOD, openBoard } from "./helpers";

/*
 * The Share dialog on a real page (local-only server: links are kept in memory by the server). Set SHARE_OUT=<dir> to keep
 * screenshots for a look.
 */

const OUT = process.env.SHARE_OUT;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function serious(page: Page, scope = "dialog[open]") {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).include(scope).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)) }));
}

async function shot(page: Page, name: string) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  const project = page.viewportSize()!.width < 600 ? "phone" : "desktop";
  await page.screenshot({ path: join(OUT, `${name}-${project}.png`) });
}

const openShare = async (page: Page) => {
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this board" });
  await expect(dialog).toBeVisible();
  return dialog;
};

const addFrames = (page: Page) =>
  page.evaluate(() => {
    const api = (window as unknown as { __atelier: { doc: { create(o: object): string } } }).__atelier;
    const frame = (name: string, x: number, order: string) => ({ type: "frame", x, y: 0, w: 960, h: 540, rotation: 0, parentId: null, locked: false, opacity: 1, name, preset: "custom", background: null, clip: true, order, notes: "" });
    api.doc.create(frame("Direction A", 0, "a0"));
    api.doc.create(frame("Direction B", 1100, "a1"));
  });

type Link = { id: string; name: string; status: string; scope: string; frameIds: string[]; mode: string; permission: string; hasPassword: boolean };
const apiLinks = async (page: Page, boardId: string): Promise<Link[]> => (await (await page.request.get(`/api/boards/${boardId}/share-links`)).json()).links;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`share dialog (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test("empty, create with a one-time address and QR, list, revoke", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
      const id = await openBoard(page);
      await addFrames(page);

      const dialog = await openShare(page);
      await expect(dialog.getByText("No links yet")).toBeVisible();
      await expect(dialog.getByText(/Local mode: links only work on this server/)).toBeVisible();
      await shot(page, `${scheme}-1-empty`);
      expect(await serious(page)).toEqual([]);

      await dialog.getByRole("button", { name: "New link" }).click();
      await expect(dialog.getByRole("heading", { name: "New link" })).toBeFocused();
      await dialog.getByLabel("Link name").fill("Acme review");
      await dialog.getByLabel(/Chosen frames/).check();
      await dialog.getByLabel("Direction B").check();
      await dialog.getByLabel(/View, react and comment/).check();
      await dialog.getByLabel(/Ask for a password/).check();
      await dialog.getByLabel("Password", { exact: true }).fill("hunter22");
      await dialog.getByLabel(/Expires/).selectOption("7d");
      await dialog.getByLabel("Welcome note").fill("Thanks for looking. Pick your favourites.");
      await dialog.getByLabel(/Blind votes/).check();
      await shot(page, `${scheme}-2-form`);
      expect(await serious(page)).toEqual([]);
      await dialog.getByRole("button", { name: "Create link" }).click();

      const url = dialog.getByLabel(/Link for Acme review/);
      await expect(url).toBeVisible();
      await expect(url).toBeFocused();
      const address = await url.inputValue();
      expect(address).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
      const token = address.split("/s/")[1];
      await expect(dialog.getByText(/can't be shown again/)).toBeVisible();
      await expect(dialog.getByRole("img", { name: /QR code/ })).toBeVisible();
      await dialog.getByRole("button", { name: "Copy link" }).click();
      await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
      await shot(page, `${scheme}-3-created`);
      expect(await serious(page)).toEqual([]);

      // the server holds the choices, with the password only as a flag and the token nowhere
      const [made] = await apiLinks(page, id);
      expect(made).toMatchObject({ name: "Acme review", scope: "frames", mode: "live", permission: "comment", hasPassword: true, status: "ok" });
      expect(made.frameIds).toHaveLength(1);
      expect(JSON.stringify(await apiLinks(page, id))).not.toContain(token);

      await dialog.getByRole("button", { name: "Done" }).click();
      const row = dialog.locator("tr", { hasText: "Acme review" });
      await expect(row).toBeVisible();
      await expect(row.getByText("Active")).toBeVisible();
      await expect(row.getByText(/Expires in 7 days/)).toBeVisible();
      await expect(dialog.getByText(/can't be copied again/)).toBeVisible();
      await shot(page, `${scheme}-4-list`);
      expect(await serious(page)).toEqual([]);

      // the address is gone from the page and from every browser store
      await expect(page.locator("body")).not.toContainText(token);
      const kept = await page.evaluate(async (t) => {
        const hits: string[] = [];
        for (const store of [localStorage, sessionStorage]) for (let i = 0; i < store.length; i++) if ((store.getItem(store.key(i)!) ?? "").includes(t)) hits.push("web storage");
        const dbs = (await indexedDB.databases?.()) ?? [];
        for (const d of dbs) {
          if (!d.name) continue;
          const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(d.name!); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
          for (const name of Array.from(db.objectStoreNames)) {
            const all = await new Promise<unknown[]>((res) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
            if (JSON.stringify(all, (_k, v) => (v instanceof Uint8Array || v instanceof ArrayBuffer || v instanceof Blob ? "" : v)).includes(t)) hits.push(`indexedDB ${d.name}/${name}`);
          }
          db.close();
        }
        return hits;
      }, token);
      expect(kept).toEqual([]);

      // revoke: asks, then the row says Revoked at once
      await row.getByRole("button", { name: "Revoke link Acme review" }).click();
      await expect(dialog.getByText(/stops working right away/)).toBeVisible();
      await shot(page, `${scheme}-5-confirm`);
      await dialog.getByRole("button", { name: "Revoke link", exact: true }).click();
      await expect(row.getByText("Revoked")).toBeVisible();
      await expect.poll(async () => (await apiLinks(page, id))[0].status).toBe("revoked");
      await expect(row.getByRole("button", { name: /Revoke link Acme/ })).toHaveCount(0);

      // delete
      await row.getByRole("button", { name: "Delete link Acme review" }).click();
      await dialog.getByRole("button", { name: "Delete link", exact: true }).click();
      await expect(dialog.getByText("No links yet")).toBeVisible();
      expect(await apiLinks(page, id)).toEqual([]);
    });

    test("a failed revoke rolls back and says why", async ({ page }) => {
      await openBoard(page);
      const dialog = await openShare(page);
      await dialog.getByRole("button", { name: "New link" }).click();
      await dialog.getByRole("button", { name: "Create link" }).click();
      await dialog.getByRole("button", { name: "Done" }).click();
      const row = dialog.locator("tr", { hasText: "Client link" });
      await page.route("**/api/share-links/*/revoke", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
      await row.getByRole("button", { name: /Revoke link/ }).click();
      await dialog.getByRole("button", { name: "Revoke link", exact: true }).click();
      await expect(page.getByText(/Couldn't revoke Client link/)).toBeVisible();
      await expect(row.getByText("Active")).toBeVisible();
      await expect(row.getByRole("button", { name: /Revoke link Client link/ })).toBeVisible();
    });
  });
}

test("keyboard: the shortcut opens it, Escape closes it and focus goes back; the form submits with Enter", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "needs a keyboard");
  await openBoard(page);
  await page.keyboard.press(`${MOD}+Shift+S`);
  const dialog = page.getByRole("dialog", { name: "Share this board" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const share = page.getByRole("button", { name: "Share" });
  await share.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  // focus is trapped inside while it is open
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(share).toBeFocused();
});

test("the command palette offers Share…", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "needs a keyboard");
  await openBoard(page);
  await page.keyboard.press(`${MOD}+k`);
  await page.getByRole("combobox").fill("share");
  await page.getByRole("option", { name: /Share…/ }).click();
  await expect(page.getByRole("dialog", { name: "Share this board" })).toBeVisible();
});

test("validation stops a bad form before it is sent", async ({ page }) => {
  await openBoard(page);
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "New link" }).click();
  await dialog.getByLabel("Link name").fill("");
  await dialog.getByLabel(/Ask for a password/).check();
  await dialog.getByLabel("Password", { exact: true }).fill("ab");
  let posted = 0;
  await page.route("**/share-links", (route) => (route.request().method() === "POST" ? (posted++, route.abort()) : route.continue()));
  await dialog.getByRole("button", { name: "Create link" }).click();
  await expect(dialog.getByRole("alert").first()).toContainText("Fix 2 things");
  await expect(dialog.getByText("Use at least 4 characters")).toBeVisible();
  expect(posted).toBe(0);
  await shot(page, "validation");
});
