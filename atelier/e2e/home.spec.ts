import { expect, test, type Page } from "@playwright/test";
import { exposeBoard, objects, waitForBoard } from "./helpers";

type Template = { id: string; name: string; minObjects: number; minArrows: number };

// What each starter should contain at least. Counted from the template builders in lib/engine/model/templates.ts.
const TEMPLATES: Template[] = [
  { id: "blank", name: "Blank", minObjects: 0, minArrows: 0 },
  { id: "moodboard", name: "Moodboard", minObjects: 5, minArrows: 0 },
  { id: "deck", name: "Presentation deck", minObjects: 5, minArrows: 0 },
  { id: "brainstorm", name: "Brainstorm", minObjects: 5, minArrows: 0 },
  { id: "flowchart", name: "Flowchart", minObjects: 5, minArrows: 3 },
  { id: "kanban", name: "Kanban", minObjects: 5, minArrows: 0 },
];

async function newBoard(page: Page, opts: { title?: string; template?: string } = {}): Promise<string> {
  await page.getByRole("button", { name: "New board" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New board" });
  await expect(dialog).toBeVisible();
  if (opts.title) await dialog.getByLabel("Title").fill(opts.title);
  if (opts.template) await dialog.getByRole("radio", { name: new RegExp(opts.template, "i") }).check({ force: true });
  await dialog.getByRole("button", { name: "Create board" }).click();
  await page.waitForURL(/\/b\/[^/]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** On a phone the folder list folds into one button; open it. On a desktop it is always open and there is no such button. */
async function openNav(page: Page) {
  const toggle = page.locator('button[aria-controls="home-nav-list"]');
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}
async function gotoView(page: Page, name: string) {
  await openNav(page);
  await page.locator("#home-nav-list").getByRole("button", { name, exact: true }).click();
}

const card = (page: Page, title: string) => page.locator("article", { has: page.getByText(title, { exact: true }) });
const cardMenu = (page: Page, title: string) => page.getByRole("button", { name: `Actions for ${title}` });
async function pickFromCardMenu(page: Page, title: string, item: string) {
  await cardMenu(page, title).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}
const status = (page: Page) => page.getByRole("status").filter({ hasText: /Deleted|Duplicated|Couldn/ });

test.describe("home", () => {
  test.beforeEach(async ({ page }) => {
    await exposeBoard(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  });

  for (const t of TEMPLATES) {
    test(`a board from the ${t.name} template opens with its objects and bound arrows`, async ({ page }) => {
      await newBoard(page, { title: `${t.name} test`, template: t.name });
      await waitForBoard(page);
      await expect(page.getByRole("textbox", { name: "Board title" })).toHaveValue(`${t.name} test`);

      const all = await objects(page);
      expect(all.length).toBeGreaterThanOrEqual(t.minObjects);
      if (t.minObjects === 0) {
        expect(all).toHaveLength(0);
        return;
      }
      // They are on the canvas, not just in the document.
      await expect.poll(() => page.locator("#board-canvas [data-object-id]").count()).toBeGreaterThan(0);

      const byId = new Map(all.map((o) => [o.id, o]));
      const arrows = all.filter((o) => o.type === "arrow");
      expect(arrows.length).toBeGreaterThanOrEqual(t.minArrows);
      for (const a of arrows) {
        for (const end of [a.start, a.end] as Array<{ kind: string; id?: string }>) {
          if (end.kind === "bound") expect(byId.has(end.id!)).toBe(true);
        }
      }
      if (t.minArrows > 0) {
        // Every arrow in a flowchart joins two objects: both ends are glued, none dangles.
        for (const a of arrows) {
          expect(a.start).toMatchObject({ kind: "bound" });
          expect(a.end).toMatchObject({ kind: "bound" });
        }
      }
    });
  }

  test("rename: the card shows the new title and the board opens with it", async ({ page }) => {
    await newBoard(page, { title: "Before" });
    await page.goto("/");
    await pickFromCardMenu(page, "Before", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename board" });
    await dialog.getByLabel("Title").fill("After");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(card(page, "After")).toBeVisible();
    await expect(card(page, "Before")).toHaveCount(0);
    await card(page, "After").getByRole("link").click();
    await expect(page.getByRole("textbox", { name: "Board title" })).toHaveValue("After");
  });

  test("star: a starred board is marked and listed under Starred", async ({ page }) => {
    await newBoard(page, { title: "Favourite" });
    await page.goto("/");
    await pickFromCardMenu(page, "Favourite", "Star");
    await expect(card(page, "Favourite").getByText("Starred")).toBeAttached();
    await gotoView(page, "Starred");
    await expect(page.getByRole("heading", { name: "Starred" })).toBeVisible();
    await expect(card(page, "Favourite")).toBeVisible();
    // And it can be unstarred again, which empties the view.
    await pickFromCardMenu(page, "Favourite", "Unstar");
    await expect(page.getByText("No starred boards")).toBeVisible();
  });

  test("search finds a board by title and says when nothing matches", async ({ page }) => {
    await newBoard(page, { title: "Zebra campaign" });
    await page.goto("/");
    await newBoard(page, { title: "Autumn lookbook" });
    await page.goto("/");
    await expect(card(page, "Zebra campaign")).toBeVisible();
    await expect(card(page, "Autumn lookbook")).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Search boards" });
    await search.fill("zebra");
    await expect(page.getByRole("heading", { name: "Results for “zebra”" })).toBeVisible();
    await expect(card(page, "Zebra campaign")).toBeVisible();
    await expect(card(page, "Autumn lookbook")).toHaveCount(0);

    await search.fill("no such board");
    await expect(page.getByText("No boards match “no such board”")).toBeVisible();
    await search.fill("");
    await expect(card(page, "Autumn lookbook")).toBeVisible();
  });

  test("move to folder: create a folder, move a board into it, find it there", async ({ page }) => {
    await newBoard(page, { title: "Client work" });
    await page.goto("/");
    await openNav(page);
    await page.getByRole("button", { name: "New folder" }).click();
    const nameDialog = page.getByRole("dialog", { name: "New folder" });
    await nameDialog.getByLabel("Name").fill("Clients");
    await nameDialog.getByRole("button", { name: "Create folder" }).click();
    await openNav(page);
    await expect(page.locator("#home-nav-list").getByRole("button", { name: "Clients", exact: true })).toBeAttached();

    await pickFromCardMenu(page, "Client work", "Move to…");
    const move = page.getByRole("dialog", { name: "Move to…" });
    await move.getByRole("radio", { name: "Clients" }).check({ force: true });
    await move.getByRole("button", { name: "Move" }).click();

    await gotoView(page, "Clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await expect(card(page, "Client work")).toBeVisible();
    // The board is no longer at the top level of Recent? Recent lists every board, so check the folder is where it lives now.
    await gotoView(page, "Recent");
    await expect(card(page, "Client work")).toBeVisible();
  });

  test("delete shows an Undo toast; Undo restores; deleting again puts the board in the trash, from where it can be restored", async ({ page }) => {
    await newBoard(page, { title: "Disposable" });
    await page.goto("/");

    await pickFromCardMenu(page, "Disposable", "Delete");
    await expect(card(page, "Disposable")).toHaveCount(0);
    const toast = status(page).filter({ hasText: "Deleted “Disposable”" });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(card(page, "Disposable")).toBeVisible();

    await pickFromCardMenu(page, "Disposable", "Delete");
    await expect(card(page, "Disposable")).toHaveCount(0);
    await gotoView(page, "Trash");
    await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible();
    await expect(card(page, "Disposable")).toBeVisible();
    await expect(card(page, "Disposable")).toContainText("30 days left");
    await page.getByRole("button", { name: "Restore Disposable" }).click();
    await expect(page.getByText("Trash is empty")).toBeVisible();
    await gotoView(page, "Recent");
    await expect(card(page, "Disposable")).toBeVisible();
  });

  test("a new board opens straight into the editor and appears on the home list afterwards", async ({ page }) => {
    const id = await newBoard(page, { title: "Roundtrip" });
    await waitForBoard(page);
    await page.getByRole("link", { name: "Atelier home" }).click();
    await expect(card(page, "Roundtrip").getByRole("link")).toHaveAttribute("href", `/b/${id}`);
  });
});
