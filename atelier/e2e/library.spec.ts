import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openBoard, uniqueBoardId } from "./helpers";

// Local-only mode: the library reads this device's own storage. Pictures are drawn in the page so the test needs no fixtures:
// 0 and 1 are the same picture (resized and recompressed), 2 is different.
async function addPictures(page: Page, boardId: string) {
  await openBoard(page, boardId);
  await page.evaluate(async () => {
    async function pic(seed: number, w: number, h: number, q: number) {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${seed * 70} 60% 40%)`);
      grad.addColorStop(1, `hsl(${seed * 70 + 120} 70% 70%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = `hsl(${seed * 70 + 200} 60% 30%)`;
      g.beginPath();
      g.arc(w * (0.3 + 0.1 * seed), h * 0.5, Math.min(w, h) * 0.25, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `hsl(${seed * 70 + 40} 80% 60%)`;
      g.fillRect(w * 0.6, h * (0.1 * seed), w * 0.3, h * 0.25);
      if (seed === 4) {
        // stripes: a hash nothing like the gradient pictures'
        for (let i = 0; i < 9; i++) {
          g.fillStyle = i % 2 ? "#111" : "#eee";
          g.fillRect((i * w) / 9, 0, w / 9, h);
        }
      }
      return new File([await c.convertToBlob({ type: "image/jpeg", quality: q })], `pic-${seed}-${w}.jpg`, { type: "image/jpeg" });
    }
    const w = window as unknown as { __atelier: { uploader: { add(f: File, at: { x: number; y: number }): Promise<string>; addAssetOnly(f: File, o: { name: string }): Promise<string> } } };
    const a = await pic(1, 1200, 800, 0.9);
    const b = await pic(1, 600, 400, 0.6);
    const c = await pic(4, 900, 900, 0.9);
    await w.__atelier.uploader.add(a, { x: 0, y: 0 }); // on the board
    await w.__atelier.uploader.addAssetOnly(b, { name: b.name });
    await w.__atelier.uploader.addAssetOnly(c, { name: c.name });
  });
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);

test.describe("asset library (local-only)", () => {
  test("lists the pictures on this device, counts the boards that use them, and groups near-duplicates", async ({ page }) => {
    await addPictures(page, uniqueBoardId("lib"));
    await page.goto("/library");
    await expect(page.getByRole("note")).toContainText("Local mode: nothing is synced");
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(page.getByRole("article", { name: /pic-1-1200/ })).toContainText("Used in 1 board");
    await expect(page.getByRole("article", { name: /pic-1-600/ })).toContainText("Not used in any board");
    // used pictures cannot be deleted
    const used = page.getByRole("article", { name: /pic-1-1200/ }).getByRole("button", { name: /Delete/ });
    await expect(used).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Possible duplicate", { exact: true })).toHaveCount(2);

    await page.getByRole("button", { name: "Unused" }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.getByRole("button", { name: "All", exact: true }).click();

    await page.getByRole("button", { name: "Possible duplicates" }).click();
    const group = page.getByRole("group", { name: /Duplicate group 1/ });
    await expect(group.getByRole("listitem")).toHaveCount(2);
    await expect(group.getByText("Used in 1 board")).toBeVisible();
    expect(await serious(page)).toEqual([]);

    // the one copy no board uses can go; the used one stays
    await group.getByRole("button", { name: "Delete 1 unused copy" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No duplicates found")).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("Add to board places the picture in the middle of the view, and it is then counted", async ({ page }) => {
    const board = uniqueBoardId("lib");
    await addPictures(page, board);
    const other = uniqueBoardId("lib-other");
    await openBoard(page, other);
    await page.goto("/library");
    await page.getByRole("article", { name: /pic-4-900/ }).getByRole("button", { name: "Add to board" }).click();
    await page.getByRole("dialog").getByRole("button").filter({ hasText: "Untitled" }).first().click();
    await page.waitForURL(/\/b\//);
    await expect(page.getByText("Added to this board.")).toBeVisible();
    expect(page.url()).not.toContain("add=");
    await page.goto("/library");
    await expect(page.getByRole("article", { name: /pic-4-900/ })).toContainText("Used in 1 board");
  });
});
