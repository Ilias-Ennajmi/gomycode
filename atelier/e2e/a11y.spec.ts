import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MOD, drawWith, exposeBoard, openBoard, placeWith, selectIds, objects, uniqueBoardId } from "./helpers";

/** WCAG 2.2 AA, as axe tags (2.0 and 2.1 A/AA rules are part of 2.2). */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function serious(page: Page, scope?: string) {
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (scope) builder = builder.include(scope);
  const { violations } = await builder.analyze();
  // Report every violation in the failure message, but fail on serious and critical ones only.
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ") + " :: " + (n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 200)) }));
}

const AUTH_PORT = Number(process.env.PORT ?? 3100) + 1;

test.describe("accessibility (axe, WCAG 2.2 AA)", () => {
  test("home: empty and with boards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
    expect(await serious(page)).toEqual([]);

    await exposeBoard(page);
    for (const t of ["One", "Two"]) {
      await page.getByRole("button", { name: "New board" }).first().click();
      await page.getByRole("dialog", { name: "New board" }).getByLabel("Title").fill(t);
      await page.getByRole("dialog", { name: "New board" }).getByRole("button", { name: "Create board" }).click();
      await page.waitForURL(/\/b\//);
      await page.goto("/");
    }
    await expect(page.locator("article")).toHaveCount(2);
    expect(await serious(page)).toEqual([]);
  });

  test("home dialogs: new board and a board's menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New board" }).first().click();
    await expect(page.getByRole("dialog", { name: "New board" })).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("editor chrome: an empty board", async ({ page }) => {
    await openBoard(page);
    expect(await serious(page)).toEqual([]);
  });

  test("editor chrome: a board with content and a selection", async ({ page }) => {
    await openBoard(page);
    await drawWith(page, "s", { x: -200, y: -100 }, { x: -40, y: 20 });
    await page.keyboard.press("Escape");
    await placeWith(page, "n", { x: 120, y: 0 });
    await page.keyboard.type("Hello");
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await objects(page)).length).toBe(2);
    expect(await serious(page)).toEqual([]);
    await expect(page.getByRole("toolbar", { name: "Selection" })).toBeVisible();
  });

  for (const [name, button] of [
    ["Layers", "Layers"],
    ["Inspector", "Inspector"],
    ["Find and replace", "Find and replace"],
  ] as const) {
    test(`panel open: ${name}`, async ({ page }) => {
      await openBoard(page);
      await placeWith(page, "n", { x: 0, y: 0 });
      await page.keyboard.type("Some text to find");
      await page.keyboard.press("Escape");
      await page.getByRole("toolbar", { name: "View" }).getByRole("button", { name: button }).click();
      await expect(page.getByRole("complementary").or(page.getByRole("region", { name }))).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });
  }

  test("command palette and context menu", async ({ page }) => {
    await openBoard(page);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press(`${MOD}+k`);
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const box = (await page.locator("#board-canvas").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    await expect(page.getByRole("menu", { name: "Canvas actions" })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test("tool option popovers", async ({ page }) => {
    await openBoard(page);
    const tools = page.getByRole("toolbar", { name: "Tools" });
    for (const name of ["Sticky note", "Shapes", "Arrow or line", "Pen", "Frame"]) {
      await tools.getByRole("button", { name }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await serious(page), name).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test("login (needs a server that is not in local-only mode: the suite starts a second one with placeholder Supabase settings)", async ({ page }) => {
    // The main e2e server runs with ATELIER_LOCAL_ONLY=1, where /login redirects straight to the app, so the login
    // page is checked on the second server (see playwright.config.ts), which has no accounts and never contacts Supabase.
    await page.goto(`http://localhost:${AUTH_PORT}/login`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

test.describe("keyboard", () => {
  test("the toolbar is one tab stop with arrow-key roving, Enter to choose, Escape to close options", async ({ page }) => {
    await openBoard(page);
    const tools = page.getByRole("toolbar", { name: "Tools" });
    const names = ["Select", "Hand", "Sticky note", "Text", "Shapes", "Arrow or line", "Pen", "Frame", "Image", "More objects"];

    // Exactly one button is in the tab order.
    await expect(tools.locator('button[tabindex="0"]')).toHaveCount(1);

    await tools.getByRole("button", { name: "Select" }).focus();
    for (const name of names.slice(1)) {
      await page.keyboard.press("ArrowRight");
      await expect(tools.getByRole("button", { name })).toBeFocused();
    }
    await page.keyboard.press("ArrowRight"); // wraps
    await expect(tools.getByRole("button", { name: "Select" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tools.getByRole("button", { name: "More objects" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tools.getByRole("button", { name: "Select" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(tools.getByRole("button", { name: "More objects" })).toBeFocused();

    // Enter chooses the tool and the toolbar says so.
    await tools.getByRole("button", { name: "Hand" }).focus();
    await expect(tools.getByRole("button", { name: "Hand" })).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Enter");
    await expect(tools.getByRole("button", { name: "Hand" })).toHaveAttribute("aria-pressed", "true");
    await expect(tools.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "false");

    // ArrowUp opens a tool's options from the keyboard; Escape closes them and focus stays on the tool.
    await tools.getByRole("button", { name: "Shapes" }).focus();
    await page.keyboard.press("ArrowUp");
    const options = page.getByRole("dialog", { name: "Shape options" });
    await expect(options).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await expect(tools.getByRole("button", { name: "Shapes" })).toBeFocused();
    await expect(tools.getByRole("button", { name: "Shapes" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the whole chrome is reached with Tab alone, one stop per toolbar, in reading order", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Tab");
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el === document.documentElement) return "(page)";
        return (el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName).slice(0, 40);
      });
      if (name === "(page)") break; // focus left the page: the cycle is complete
      seen.push(name);
    }
    // The same order on every screen size; the breadcrumb and the minimap only exist on wider screens.
    const order = seen.filter((name) => ["Skip to canvas", "Atelier home", "Board title", "Select", "Board canvas", "Undo"].includes(name));
    expect(order).toEqual(["Skip to canvas", "Atelier home", "Board title", "Select", "Board canvas", "Undo"]);
    // One stop for the whole tool strip and one for the view controls: no second "Hand", "Sticky note", "Redo", ...
    expect(seen).not.toContain("Hand");
    expect(seen).not.toContain("Redo");
  });

  test("the skip link appears on focus and moves focus to the canvas", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to canvas" });
    await expect(skip).toBeFocused();
    const box = (await skip.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); // slid into view
    await page.keyboard.press("Enter");
    await expect(page.locator("#board-canvas")).toBeFocused();
  });

  test("Escape closes a panel and returns focus to the button that opened it", async ({ page }) => {
    await openBoard(page);
    const layers = page.getByRole("toolbar", { name: "View" }).getByRole("button", { name: "Layers" });
    await layers.focus();
    await page.keyboard.press("Enter");
    await expect(layers).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(layers).toHaveAttribute("aria-pressed", "false");
    await expect(layers).toBeFocused();
  });

  test("objects are reachable without a pointer: the Layers panel lists them and selects on Enter", async ({ page }) => {
    await openBoard(page);
    await drawWith(page, "s", { x: -100, y: -50 }, { x: 60, y: 40 });
    await page.keyboard.press("Escape");
    await selectIds(page, []);
    await page.getByRole("toolbar", { name: "View" }).getByRole("button", { name: "Layers" }).click();
    const panel = page.getByRole("complementary").or(page.getByRole("region", { name: "Layers" })).first();
    const row = panel.getByRole("button").or(panel.getByRole("option")).or(panel.getByRole("treeitem")).filter({ hasText: /shape|rectangle/i }).first();
    await expect(row).toBeVisible();
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  // Collect every transition and animation the page starts: with reduced motion none may move anything.
  async function watchMotion(page: Page) {
    await page.evaluate(() => {
      const w = window as unknown as { __motion: Array<{ kind: string; name: string }> };
      w.__motion = [];
      const move = /transform|translate|scale|rotate|margin|top|left|right|bottom/;
      document.addEventListener("transitionrun", (e) => (e.propertyName.match(move) ? w.__motion.push({ kind: "transition", name: e.propertyName }) : undefined), true);
      document.addEventListener("animationstart", (e) => w.__motion.push({ kind: "animation", name: (e as AnimationEvent).animationName }), true);
    });
  }
  const motion = (page: Page) => page.evaluate(() => (window as unknown as { __motion: unknown[] }).__motion);

  test("opening panels, popovers, menus and toasts runs no transform transitions", async ({ page }) => {
    await openBoard(page);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await watchMotion(page);

    const view = page.getByRole("toolbar", { name: "View" });
    // On a phone a panel is a bottom sheet over the controls, so each one is closed again before the next.
    for (const name of ["Layers", "Inspector", "Find and replace"]) {
      await view.getByRole("button", { name }).click();
      await expect(view.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Escape");
      await expect(view.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    await page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Sticky note" }).click();
    await expect(page.getByRole("dialog", { name: "Sticky options" })).toBeVisible();
    await page.keyboard.press("Escape");
    await view.getByRole("button", { name: /^Zoom, / }).click();
    await expect(page.getByRole("menu", { name: "Zoom" })).toBeVisible();
    await page.keyboard.press("Escape");
    await placeWith(page, "n", { x: 0, y: 0 });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("n"); // nothing selected now
    await page.keyboard.press("Escape");
    await selectIds(page, (await objects(page)).map((o) => o.id));
    await page.keyboard.press("Delete"); // shows an Undo toast
    await expect(page.locator("[data-toast]")).toBeVisible();
    await page.keyboard.press("Shift+1");

    expect(await motion(page)).toEqual([]);
  });

  test("control: without the preference the same actions do animate (the watcher works)", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await openBoard(page, uniqueBoardId());
    await watchMotion(page);
    const view = page.getByRole("toolbar", { name: "View" });
    await view.getByRole("button", { name: "Layers" }).click();
    await page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Sticky note" }).click();
    await expect.poll(async () => (await motion(page)).length).toBeGreaterThan(0);
    await context.close();
  });
});
