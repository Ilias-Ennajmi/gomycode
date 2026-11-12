import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { expect, test } from "@playwright/test";
import { dropData, objects, openBoard, type FileSpec } from "./helpers";

/*
 * Colour as an object, in a real browser: six generated pictures with distinct dominant colours are dropped on a board, the
 * worker analyses them, a live palette is added from the More menu, clicking a swatch dims the pictures without it, and every
 * export format downloads a file with the right bytes.
 */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    for (let x = 0; x < w; x++) raw.set([...pixel(x, y), 255], row + 1 + x * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

const DOMINANT: [string, [number, number, number]][] = [
  ["red", [200, 40, 40]],
  ["blue", [40, 80, 200]],
  ["green", [40, 160, 80]],
  ["yellow", [230, 200, 40]],
  ["purple", [140, 60, 180]],
  ["orange", [230, 120, 30]],
];
const files: FileSpec[] = DOMINANT.map(([name, rgb]) => ({ name: `${name}.png`, type: "image/png", base64: png(240, 160, (x) => (x < 200 ? rgb : [235, 235, 235])) }));

const analysed = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("atelier-assets");
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("assets")) return resolve(0);
          const req = db.transaction("assets", "readonly").objectStore("assets").getAll();
          req.onsuccess = () => resolve((req.result as { analysisVersion: number }[]).filter((r) => r.analysisVersion === 1).length);
          req.onerror = () => resolve(0);
        };
      }),
  );

test("live palette, swatch highlight and palette exports", async ({ page }) => {
  await openBoard(page);
  await dropData(page, { files });
  await expect.poll(() => analysed(page), { timeout: 30_000 }).toBe(6);

  // A live palette from the More menu.
  await page.locator('[data-tool="more"]').click();
  await page.getByRole("menuitem", { name: "Palette", exact: true }).click();
  await expect.poll(async () => ((await objects(page)).find((o) => o.type === "palette")?.swatches as unknown[] | undefined)?.length ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(6);

  // Move it under the pictures so it covers none of them.
  await page.evaluate(() => {
    const { doc } = (window as unknown as { __atelier: { doc: { all(): { id: string; type: string; x: number; y: number; w: number; h: number }[]; update(id: string, p: object): void } } }).__atelier;
    const imgs = doc.all().filter((o) => o.type === "image");
    const bottom = Math.max(...imgs.map((o) => o.y + o.h));
    const left = Math.min(...imgs.map((o) => o.x));
    const p = doc.all().find((o) => o.type === "palette")!;
    doc.update(p.id, { x: left, y: bottom + 40 });
  });

  await page.keyboard.press("Shift+1"); // zoom to fit: pictures and palette on screen
  await page.waitForTimeout(400);

  // Clicking a swatch dims the pictures that do not contain it; Escape restores them.
  const red = page.locator('[data-highlight-chip][aria-label*="#c82828"]'); // the red picture's colour (the light grey is in all six)
  await expect(red).toBeVisible();
  await red.click();
  await expect(red).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator('img[data-dimmed="true"]').count()).toBe(5);
  await expect(page.locator('img[data-dimmed="false"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator('img[data-dimmed="true"]')).toHaveCount(0);

  // The Palette panel lists the colours with their shares and exports every format.
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Palette" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("listitem").first()).toContainText("%");
  await panel.getByRole("button", { name: "Export", exact: true }).click();
  await expect(panel.getByText(/open them once in adobe apps or procreate/i)).toBeVisible();

  const got: Record<string, { name: string; bytes: Buffer }> = {};
  for (const format of ["ase", "procreate", "css", "tailwind", "tailwind-config", "json"]) {
    const [download] = await Promise.all([page.waitForEvent("download"), panel.locator(`[data-format="${format}"]`).click()]);
    got[format] = { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
  }
  expect(got.ase.name).toMatch(/\.ase$/);
  expect(got.ase.bytes.subarray(0, 8).toString("hex")).toBe("4153454600010000");
  expect(got.ase.bytes.readUInt32BE(8)).toBeGreaterThanOrEqual(6); // blocks: one per colour (plus the group)

  expect(got.procreate.name).toMatch(/\.swatches$/);
  const files2 = unzipSync(new Uint8Array(got.procreate.bytes));
  const doc = JSON.parse(strFromU8(files2["Swatches.json"])) as { swatches: (unknown | null)[] }[];
  expect(doc[0].swatches).toHaveLength(30);
  expect(doc[0].swatches.filter(Boolean).length).toBeGreaterThanOrEqual(6);

  expect(got.css.bytes.toString("utf8")).toMatch(/--color-[a-z0-9-]+: #[0-9a-f]{6};/);
  expect(got.tailwind.bytes.toString("utf8")).toMatch(/^@theme \{/);
  expect(got["tailwind-config"].bytes.toString("utf8")).toMatch(/colors/);
  const json = JSON.parse(got.json.bytes.toString("utf8")) as { version: number; colors: { hex: string }[] };
  expect(json.version).toBe(1);
  expect(json.colors.length).toBeGreaterThanOrEqual(6);
});
