import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  MOD,
  camera,
  centreOf,
  drag,
  drawWith,
  expectCount,
  getObject,
  objects,
  objectsOfType,
  openBoard,
  placeWith,
  selectIds,
  selectedIds,
  textOf,
  toClient,
  toasts,
} from "./helpers";

/** Create objects straight in the document (the test is about what the editor does with them, not about drawing them). */
async function seed(page: Page, specs: Array<Record<string, unknown>>): Promise<string[]> {
  return page.evaluate((list) => {
    const { doc } = (window as unknown as { __atelier: { doc: { createMany(o: unknown[]): string[] } } }).__atelier;
    const base = { rotation: 0, parentId: null, locked: false, opacity: 1 };
    const shape = { type: "shape", kind: "rect", fill: null, stroke: "#222", strokeWidth: 2, strokeStyle: "solid", cornerRadius: 0, w: 120, h: 80 };
    return doc.createMany(list.map((s) => ({ ...base, ...shape, ...s })));
  }, specs);
}

const view = (page: Page) => page.getByRole("toolbar", { name: "View" });
const tools = (page: Page) => page.getByRole("toolbar", { name: "Tools" });

test.describe("tools", () => {
  test("every shape kind in the Shapes options draws that shape", async ({ page }) => {
    await openBoard(page);
    const kinds = ["Rectangle", "Rounded rectangle", "Ellipse", "Triangle", "Diamond", "Star"];
    const expected = ["rect", "roundRect", "ellipse", "triangle", "diamond", "star"];
    for (const [i, name] of kinds.entries()) {
      await tools(page).getByRole("button", { name: "Shapes" }).click();
      await page.getByRole("dialog", { name: "Shape options" }).getByRole("radio", { name, exact: true }).check({ force: true });
      await page.keyboard.press("Escape");
      await drawWith(page, "s", { x: -240 + i * 80, y: -40 }, { x: -190 + i * 80, y: 10 });
      await page.keyboard.press("Escape");
    }
    const made = await expectCount(page, 6, "shape");
    expect(made.map((s) => s.kind).sort()).toEqual([...expected].sort());
  });

  test("the highlighter draws a wide translucent stroke and the eraser removes a stroke it crosses", async ({ page }) => {
    await openBoard(page);
    await tools(page).getByRole("button", { name: "Pen" }).click();
    await page.getByRole("dialog", { name: "Pen options" }).getByRole("radio", { name: "Highlighter" }).check({ force: true });
    await page.keyboard.press("Escape");
    const a = await toClient(page, { x: -150, y: 0 });
    await drag(page, a, { x: a.x + 150, y: a.y }, { steps: 10 });
    const [mark] = await expectCount(page, 1, "stroke");
    expect(mark.tool).toBe("highlighter");
    expect(mark.size).toBeGreaterThan(8);

    // Pen stroke, then the eraser across it.
    await page.keyboard.press("p");
    const b = await toClient(page, { x: -100, y: 80 });
    await drag(page, b, { x: b.x + 100, y: b.y }, { steps: 10 });
    await expectCount(page, 2, "stroke");
    await page.keyboard.press("e");
    const e0 = await toClient(page, { x: -50, y: 40 });
    await drag(page, e0, { x: e0.x, y: e0.y + 90 }, { steps: 12 });
    await expect.poll(async () => (await objectsOfType(page, "stroke")).length).toBe(1);
  });

  test("a frame made from the A4 preset has A4's real size", async ({ page }) => {
    await openBoard(page, undefined, { zoom: 0.25 });
    await tools(page).getByRole("button", { name: "Frame" }).click();
    const options = page.getByRole("dialog", { name: "Frame options" });
    await options.getByText("A4", { exact: false }).first().click();
    await page.keyboard.press("Escape");
    await placeFrame(page);
    const [frame] = await expectCount(page, 1, "frame");
    expect(frame.preset).toBe("a4");
    // 210 x 297 mm at 96 dpi.
    expect(frame.w).toBeCloseTo(794, 0);
    expect(frame.h).toBeCloseTo(1123, 0);
  });

  test("text typed in a sticky can be made bold with the keyboard", async ({ page }) => {
    await openBoard(page);
    await placeWith(page, "n", { x: 0, y: 0 });
    await page.keyboard.type("plain ");
    await page.keyboard.press(`${MOD}+b`);
    await page.keyboard.type("strong");
    await page.keyboard.press("Escape");
    const [note] = await expectCount(page, 1, "sticky");
    await expect(page.locator(`[data-object-id="${note.id}"] strong`)).toHaveText("strong");
    expect(await textOf(page, note.id)).toBe("plain strong");
  });
});

async function placeFrame(page: Page) {
  await page.keyboard.press("f");
  const c = await toClient(page, { x: 0, y: 0 });
  await page.mouse.click(c.x, c.y);
}

test.describe("selecting and arranging", () => {
  test("marquee select, duplicate, nudge, lock and z-order", async ({ page }) => {
    await openBoard(page);
    const [a, b] = await seed(page, [
      { x: -200, y: -100 },
      { x: 60, y: -100 },
    ]);
    await page.locator("#board-canvas").focus();

    // Marquee: drag around both from empty canvas.
    const from = await toClient(page, { x: -260, y: -160 });
    const to = await toClient(page, { x: 220, y: 20 });
    await drag(page, from, to);
    await expect.poll(async () => (await selectedIds(page)).sort()).toEqual([a, b].sort());

    // Duplicate: Mod+D copies both and selects the copies.
    await page.keyboard.press(`${MOD}+d`);
    await expectCount(page, 4, "shape");
    const copies = (await selectedIds(page)).filter((id) => id !== a && id !== b);
    expect(copies).toHaveLength(2);

    // Nudge: an arrow key moves 1 px, Shift+arrow 10 px.
    const before = (await getObject(page, copies[0]))!;
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await getObject(page, copies[0]))!.x).toBeCloseTo(before.x + 1, 5);
    await page.keyboard.press("Shift+ArrowDown");
    await expect.poll(async () => (await getObject(page, copies[0]))!.y).toBeCloseTo(before.y + 10, 5);

    // Lock: a locked object cannot be deleted or nudged.
    await selectIds(page, [a]);
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect.poll(async () => (await getObject(page, a))!.locked).toBe(true);
    await page.keyboard.press("Delete");
    await expect(toasts(page).filter({ hasText: "Locked objects can't be deleted" })).toBeVisible();
    expect(await getObject(page, a)).toBeDefined();
    await page.keyboard.press(`${MOD}+Shift+l`);
    await expect.poll(async () => (await getObject(page, a))!.locked).toBe(false);

    // Z-order: Bring to front puts it above everything.
    await page.keyboard.press(`${MOD}+Alt+]`);
    await expect
      .poll(async () => {
        const all = await objects(page);
        return all[all.length - 1].id;
      })
      .toBe(a);
    await page.keyboard.press(`${MOD}+Alt+[`);
    await expect.poll(async () => (await objects(page))[0].id).toBe(a);
  });

  test("align and distribute from the command palette", async ({ page }) => {
    await openBoard(page);
    const [a, b, c] = await seed(page, [
      { x: -300, y: -150, w: 100, h: 60 },
      { x: -60, y: 20, w: 100, h: 60 },
      { x: 240, y: -40, w: 100, h: 60 },
    ]);
    await selectIds(page, [a, b, c]);
    await page.locator("#board-canvas").focus();
    await runPalette(page, "Align left");
    await expect.poll(async () => [(await getObject(page, a))!.x, (await getObject(page, b))!.x, (await getObject(page, c))!.x]).toEqual([-300, -300, -300]);

    await selectIds(page, [a, b, c]);
    await seedMove(page, c, { x: 100 });
    await runPalette(page, "Distribute horizontally");
    await expect
      .poll(async () => {
        const xs = [a, b, c].map(async (id) => (await getObject(page, id))!.x);
        const [xa, xb, xc] = await Promise.all(xs);
        return Math.abs(xb - xa - (xc - xb)) < 1e-6 && xb !== xa;
      })
      .toBe(true);
  });

  test("rotate by handle and flip", async ({ page }) => {
    await openBoard(page);
    const [id] = await seed(page, [{ x: -80, y: -40 }]);
    await selectIds(page, [id]);
    const handle = (await page.locator('[data-handle="rotate"]').boundingBox())!;
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    const c = await centreOf(page, id);
    // Swing the handle a quarter turn clockwise: from straight above the centre to the right of it.
    await drag(page, from, { x: c.x + 120, y: c.y }, { steps: 10 });
    await expect.poll(async () => Math.abs(Number((await getObject(page, id))!.rotation))).toBeGreaterThan(1);
    await selectIds(page, [id]);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press("Shift+h");
    await expect(page.locator(`[data-object-id="${id}"]`)).toBeAttached();
  });
});

async function seedMove(page: Page, id: string, p: { x?: number; y?: number }) {
  await page.evaluate(({ id, p }) => (window as unknown as { __atelier: { doc: { update(id: string, p: object): void } } }).__atelier.doc.update(id, p), { id, p });
}

async function runPalette(page: Page, query: string) {
  await page.keyboard.press(`${MOD}+k`);
  const box = page.getByRole("combobox", { name: "Search commands, boards and objects" });
  await expect(box).toBeFocused();
  await box.fill(query);
  await page.getByRole("option", { name: new RegExp(`^${query}`, "i") }).first().click();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
}

test.describe("view and panels", () => {
  test("zoom presets, zoom to selection and the minimap", async ({ page }) => {
    await openBoard(page, undefined, { zoom: 1 });
    await seed(page, [{ x: 3000, y: 2000, w: 400, h: 300 }]);
    await view(page).getByRole("button", { name: /^Zoom, / }).click();
    await page.getByRole("menuitemradio", { name: "200%" }).click();
    await expect(view(page).getByRole("button", { name: "Zoom, 200%" })).toBeVisible();
    await expect.poll(async () => (await camera(page)).z).toBeCloseTo(2, 4); // the camera eases there over ~350 ms
    await view(page).getByRole("button", { name: /^Zoom, / }).click();
    await page.getByRole("menuitemradio", { name: "50%" }).click();
    await expect.poll(async () => (await camera(page)).z).toBeCloseTo(0.5, 4);

    // Zoom to selection (Shift+2) frames the far-away object.
    const [far] = await objects(page);
    await selectIds(page, [far.id]);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press("Shift+2");
    await expect.poll(async () => (await camera(page)).x).toBeGreaterThan(2000);

    // The minimap (wide screens only) is a place you can click to move the view.
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      const minimap = page.locator("[data-minimap]");
      await expect(minimap).toBeVisible();
      const before = await camera(page);
      const box = (await minimap.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.1);
      await expect.poll(async () => (await camera(page)).x).not.toBe(before.x);
    }
  });

  test("find and replace changes matching text on the board, and one undo reverts it", async ({ page }) => {
    await openBoard(page);
    await placeWith(page, "n", { x: -200, y: -50 });
    await page.keyboard.type("alpha beta alpha");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await placeWith(page, "t", { x: 150, y: 0 });
    await page.keyboard.type("an alpha text");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const [note] = await expectCount(page, 1, "sticky");
    const [text] = await expectCount(page, 1, "text");

    await page.keyboard.press(`${MOD}+f`);
    const panel = page.getByRole("complementary", { name: "Find and replace" });
    await panel.getByRole("searchbox", { name: "Find" }).fill("alpha");
    await expect(panel.getByRole("status")).toContainText("3");
    await panel.getByLabel("Replace with").fill("gamma");
    await panel.getByRole("button", { name: "Replace all" }).click();
    await expect.poll(() => textOf(page, note.id)).toBe("gamma beta gamma");
    await expect.poll(() => textOf(page, text.id)).toBe("an gamma text");

    await toasts(page).filter({ hasText: "Replaced 3 matches" }).getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => textOf(page, note.id)).toBe("alpha beta alpha");
    await expect.poll(() => textOf(page, text.id)).toBe("an alpha text");
  });

  test("the command palette runs a command and finds objects by their text", async ({ page }) => {
    await openBoard(page);
    await placeWith(page, "n", { x: 0, y: 0 });
    await page.keyboard.type("moodboard intro");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press(`${MOD}+k`);
    const box = page.getByRole("combobox", { name: "Search commands, boards and objects" });
    await box.fill("moodboard");
    await expect(page.getByRole("option", { name: /moodboard intro/i })).toBeVisible();
    await box.fill("Zoom to fit");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
  });

  test("the context menu opens on right-click, and on a long press with a finger", async ({ page }) => {
    await openBoard(page);
    const [id] = await seed(page, [{ x: -60, y: -40 }]);
    const c = await centreOf(page, id);
    await page.mouse.click(c.x, c.y, { button: "right" });
    const menu = page.getByRole("menu", { name: "Canvas actions" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Duplicate/ })).toBeVisible();
    expect(await selectedIds(page)).toEqual([id]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // A finger held still for half a second.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
    await expect(menu).toBeVisible({ timeout: 3000 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  });

  test("the layers panel lists objects, selecting from it selects on the canvas; the inspector edits a size", async ({ page }) => {
    await openBoard(page);
    const [a] = await seed(page, [{ x: -80, y: -40 }]);
    await view(page).getByRole("button", { name: "Layers" }).click();
    const layers = page.getByRole("complementary", { name: "Layers" });
    const row = layers.getByRole("treeitem").first();
    await expect(row).toBeVisible();
    await row.click();
    await expect.poll(() => selectedIds(page)).toEqual([a]);
    await page.keyboard.press("Escape"); // close the panel

    await view(page).getByRole("button", { name: "Inspector" }).click();
    const inspector = page.getByRole("complementary", { name: "Inspector" });
    const w = inspector.getByLabel("W", { exact: true });
    await w.fill("260");
    await w.press("Enter");
    await expect.poll(async () => (await getObject(page, a))!.w).toBe(260);
  });
});

test.describe("theme and installability", () => {
  test("dark theme from Settings applies, persists across reloads, and the chrome still passes axe", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Dark" }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    for (const url of ["/", "/settings"]) {
      await page.goto(url);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id), url).toEqual([]);
    }
    await openBoard(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await seed(page, [{ x: -60, y: -40 }]);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

    // And back to light, and to following the system.
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Light" }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("System follows the device's colour scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");
    await page.getByRole("radio", { name: "System" }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("the web app manifest is valid and the browser finds no installability problems", async ({ page, request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.display).toMatch(/standalone|fullscreen|minimal-ui/);
    expect(m.start_url).toBeTruthy();
    const sizes = (m.icons as Array<{ sizes: string }>).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of m.icons as Array<{ src: string }>) expect((await request.get(icon.src)).status(), icon.src).toBe(200);

    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready) && !!navigator.serviceWorker.controller);
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: Array<{ errorId: string }> };
    // Playwright contexts are private (incognito) windows, where installing is never offered: that is the only reason allowed.
    expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== "in-incognito")).toEqual([]);
  });
});
