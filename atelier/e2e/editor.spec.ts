import { expect, test } from "@playwright/test";
import {
  MOD,
  centreOf,
  camera,
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
  touchDrag,
} from "./helpers";

test.describe("editor", () => {
  test("a sticky note: N then click places it, typing fills it, Escape leaves it, undo and redo step through", async ({ page }) => {
    await openBoard(page);
    await placeWith(page, "n", { x: 0, y: 0 });
    const [sticky] = await expectCount(page, 1, "sticky");
    expect(sticky.w).toBeGreaterThan(100);

    const editor = page.locator(`[data-object-id="${sticky.id}"] [contenteditable="true"]`);
    await expect(editor).toBeFocused();
    await page.keyboard.type("Hello atelier");
    await expect(editor).toContainText("Hello atelier");
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(page.locator(`[data-object-id="${sticky.id}"]`)).toContainText("Hello atelier");
    await expect.poll(() => textOf(page, sticky.id)).toBe("Hello atelier");

    // Undo walks back: the typing first, then the note itself.
    await page.keyboard.press(`${MOD}+z`);
    await expect.poll(() => textOf(page, sticky.id)).not.toBe("Hello atelier");
    await page.keyboard.press(`${MOD}+z`);
    await expectCount(page, 0);

    // Redo brings it all back.
    await page.keyboard.press(`${MOD}+Shift+z`);
    await expectCount(page, 1, "sticky");
    await page.keyboard.press(`${MOD}+Shift+z`);
    await expect.poll(() => textOf(page, sticky.id)).toBe("Hello atelier");
  });

  test("a rectangle can be drawn and resized, and Shift while resizing keeps its ratio", async ({ page }) => {
    await openBoard(page);
    await drawWith(page, "s", { x: -200, y: -100 }, { x: 100, y: 50 });
    const [rect] = await expectCount(page, 1, "shape");
    expect(rect.kind).toBe("rect");
    expect(rect.w).toBeCloseTo(300, 0);
    expect(rect.h).toBeCloseTo(150, 0);

    // Select tool is active again after one use, and the new shape is selected: grab its bottom-right handle.
    await expect.poll(() => selectedIds(page)).toEqual([rect.id]);
    const handle = page.locator('[data-handle="se"]');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await drag(page, from, { x: from.x + 120, y: from.y + 10 }, { shift: true });
    await expect
      .poll(async () => {
        const o = (await getObject(page, rect.id))!;
        return o.w > 350;
      })
      .toBe(true);
    const kept = (await getObject(page, rect.id))!;
    expect(kept.w / kept.h).toBeCloseTo(2, 2);

    // Without Shift the sides move independently.
    const handle2 = (await page.locator('[data-handle="se"]').boundingBox())!;
    const from2 = { x: handle2.x + handle2.width / 2, y: handle2.y + handle2.height / 2 };
    await drag(page, from2, { x: from2.x + 40, y: from2.y + 100 });
    await expect.poll(async () => ((await getObject(page, rect.id))!.h as number) > kept.h + 50).toBe(true);
    const free = (await getObject(page, rect.id))!;
    expect(Math.abs(free.w / free.h - 2)).toBeGreaterThan(0.1);
  });

  test("an arrow bound between two shapes follows when a shape moves", async ({ page }) => {
    await openBoard(page);
    await drawWith(page, "s", { x: -300, y: -60 }, { x: -160, y: 60 });
    await drawWith(page, "s", { x: 160, y: -60 }, { x: 300, y: 60 });
    const [a, b] = await expectCount(page, 2, "shape");

    await page.keyboard.press("l");
    await drag(page, await centreOf(page, a.id), await centreOf(page, b.id));
    const [arrow] = await expectCount(page, 1, "arrow");
    expect(arrow.start).toMatchObject({ kind: "bound", id: a.id });
    expect(arrow.end).toMatchObject({ kind: "bound", id: b.id });

    // Move the second shape down 200 px with the select tool: the arrow's end must travel with it.
    const before = (await getObject(page, arrow.id))!;
    await selectIds(page, []);
    const grab = await centreOf(page, b.id);
    await drag(page, { x: grab.x, y: grab.y + 20 }, { x: grab.x, y: grab.y + 220 });
    await expect.poll(async () => ((await getObject(page, b.id))!.y as number) > b.y + 100).toBe(true);

    const moved = (await getObject(page, b.id))!;
    const after = (await getObject(page, arrow.id))!;
    expect(after.end).toMatchObject({ kind: "bound", id: b.id }); // still bound, not turned into a free point
    expect(after.h).toBeGreaterThan((before.h as number) + 50); // the box now spans the vertical offset
    // The arrow's box reaches the middle of the moved shape.
    expect(after.y + after.h).toBeGreaterThan(moved.y);
    expect(after.y + after.h).toBeLessThan(moved.y + moved.h + 1);
  });

  test("a frame carries its children when it moves", async ({ page }) => {
    await openBoard(page);
    await drawWith(page, "f", { x: -300, y: -200 }, { x: 300, y: 200 });
    const [frame] = await expectCount(page, 1, "frame");
    await placeWith(page, "n", { x: 0, y: 0 });
    await page.keyboard.press("Escape"); // leave the note's editor
    await page.keyboard.press("Escape");
    const [note] = await expectCount(page, 1, "sticky");
    expect(note.parentId).toBe(frame.id);

    // Click the frame's name to select it, then grab its empty body (away from the note) and move it.
    const label = await toClient(page, { x: frame.x + 20 / (await camera(page)).z, y: frame.y - 10 / (await camera(page)).z });
    await page.mouse.click(label.x, label.y);
    await expect.poll(() => selectedIds(page)).toEqual([frame.id]);
    const grip = await toClient(page, { x: frame.x + 60, y: frame.y + 60 });
    await drag(page, grip, { x: grip.x + 75, y: grip.y + 40 });
    await expect.poll(async () => (await getObject(page, frame.id))!.x).toBeGreaterThan(frame.x + 50);
    const movedFrame = (await getObject(page, frame.id))!;
    const movedNote = (await getObject(page, note.id))!;
    expect(movedNote.x - note.x).toBeCloseTo(movedFrame.x - frame.x, 1);
    expect(movedNote.y - note.y).toBeCloseTo(movedFrame.y - frame.y, 1);
    expect(movedNote.parentId).toBe(frame.id);
  });

  test("the pen draws a stroke with the mouse", async ({ page }) => {
    await openBoard(page);
    await page.keyboard.press("p");
    const a = await toClient(page, { x: -100, y: -50 });
    await drag(page, a, { x: a.x + 200, y: a.y + 80 }, { steps: 12 });
    const [stroke] = await expectCount(page, 1, "stroke");
    expect(stroke.tool).toBe("pen");
    expect((stroke.points as number[]).length).toBeGreaterThan(9);
    await expect(page.locator(`[data-object-id="${stroke.id}"]`)).toBeAttached();
  });

  test("the pen draws a stroke with a finger (touch)", async ({ page }) => {
    await openBoard(page);
    await page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Pen" }).click();
    await page.keyboard.press("Escape"); // close the pen's options if they opened
    const start = await toClient(page, { x: -80, y: -40 });
    const pts = Array.from({ length: 14 }, (_, i) => ({ x: start.x + i * 12, y: start.y + Math.sin(i / 2) * 30 }));
    await touchDrag(page, pts);
    const [stroke] = await expectCount(page, 1, "stroke");
    expect(stroke.tool).toBe("pen");
    expect((stroke.points as number[]).length).toBeGreaterThanOrEqual(9);
  });

  test("deleting shows an Undo toast, and Undo brings the object back", async ({ page }) => {
    await openBoard(page);
    await placeWith(page, "n", { x: 0, y: 0 });
    await page.keyboard.press("Escape");
    const [note] = await expectCount(page, 1, "sticky");
    await selectIds(page, [note.id]);
    await page.keyboard.press("Delete");
    await expectCount(page, 0);

    const toast = toasts(page).filter({ hasText: "Deleted 1 object" });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Undo" }).click();
    const [back] = await expectCount(page, 1, "sticky");
    expect(back.id).toBe(note.id);
    await expect(toast).toHaveCount(0);
  });

  test("grouping two objects makes one selectable unit, and ungrouping releases them", async ({ page }) => {
    await openBoard(page);
    await drawWith(page, "s", { x: -300, y: -50 }, { x: -150, y: 50 });
    await drawWith(page, "s", { x: 100, y: -50 }, { x: 250, y: 50 });
    const [a, b] = await expectCount(page, 2, "shape");

    await page.locator("#board-canvas").focus();
    await page.keyboard.press(`${MOD}+a`);
    await expect.poll(() => selectedIds(page).then((s) => s.length)).toBe(2);
    await page.keyboard.press(`${MOD}+g`);
    const [group] = await expectCount(page, 1, "group");
    expect((await getObject(page, a.id))!.parentId).toBe(group.id);
    expect((await getObject(page, b.id))!.parentId).toBe(group.id);
    await expect.poll(() => selectedIds(page)).toEqual([group.id]);

    await page.keyboard.press(`${MOD}+Shift+g`);
    await expectCount(page, 0, "group");
    expect((await getObject(page, a.id))!.parentId).toBeNull();
    expect((await getObject(page, b.id))!.parentId).toBeNull();
    await expect.poll(() => selectedIds(page).then((s) => s.sort())).toEqual([a.id, b.id].sort());

    // And a group is one undo step.
    await page.keyboard.press(`${MOD}+z`);
    await expectCount(page, 1, "group");
  });

  test("Shift+1 zooms to fit everything", async ({ page }) => {
    await openBoard(page);
    // Two objects far apart, so that none of them can be in view at once at 100%.
    const ids = await page.evaluate(() => {
      const { doc } = (window as unknown as { __atelier: { doc: { createMany(o: unknown[]): string[] } } }).__atelier;
      const base = { type: "shape", kind: "rect", rotation: 0, parentId: null, locked: false, opacity: 1, fill: null, stroke: "#000", strokeWidth: 2, strokeStyle: "solid", cornerRadius: 0 };
      return doc.createMany([
        { ...base, x: -3000, y: -2000, w: 400, h: 300 },
        { ...base, x: 3000, y: 2000, w: 400, h: 300 },
      ]);
    });
    expect(ids).toHaveLength(2);
    await page.locator("#board-canvas").focus();
    await page.keyboard.press("Shift+1");

    await expect.poll(async () => (await camera(page)).z).toBeLessThan(0.3);
    await expect(page.getByRole("button", { name: /^Zoom, \d+%$/ })).not.toHaveText("100%");
    const all = await objects(page);
    const vp = await page.locator("#board-canvas").boundingBox();
    for (const o of all) {
      const tl = await toClient(page, { x: o.x, y: o.y });
      const br = await toClient(page, { x: o.x + o.w, y: o.y + o.h });
      expect(tl.x).toBeGreaterThanOrEqual(vp!.x - 1);
      expect(tl.y).toBeGreaterThanOrEqual(vp!.y - 1);
      expect(br.x).toBeLessThanOrEqual(vp!.x + vp!.width + 1);
      expect(br.y).toBeLessThanOrEqual(vp!.y + vp!.height + 1);
    }
    expect(await objectsOfType(page, "shape")).toHaveLength(2);
  });
});
