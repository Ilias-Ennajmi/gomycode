import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { dropData, objects, openBoard, type FileSpec } from "./helpers";

/*
 * Provenance in a real browser: a picture dropped from a web page keeps its source link, the Inspector's Source section edits
 * the rest, and the credits switch puts "Credit · Licence" under the pictures (as text, never markup).
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
function png(w: number, h: number, rgb: [number, number, number]): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([...rgb, 255], y * (w * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
const file: FileSpec = { name: "harbour.png", type: "image/png", base64: png(300, 200, [40, 80, 200]) };

test("source link from a drop, Source fields, and the credits overlay", async ({ page }) => {
  await openBoard(page);
  await dropData(page, { files: [file], html: '<meta charset="utf-8"><img src="https://images.example.com/harbour.jpg">' });
  await expect.poll(async () => (await objects(page)).filter((o) => o.type === "image").length).toBe(1);

  // The drop filled in the source link and the capture date; the credit is left for the owner.
  const prov = async () => ((await objects(page)).find((o) => o.type === "image")!.provenance as { sourceUrl: string | null; credit: string; licence: string; capturedAt: string | null } | null);
  expect((await prov())?.sourceUrl).toBe("https://images.example.com/harbour.jpg");
  expect((await prov())?.credit).toBe("");
  expect((await prov())?.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Select it (the drop selects what it adds), open the Inspector, fill in credit and licence.
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  const section = page.getByRole("region", { name: "Source" });
  await expect(section).toBeVisible();
  await expect(section.getByLabel("Source URL")).toHaveValue("https://images.example.com/harbour.jpg");
  await section.getByLabel("Credit").fill("<b>Jane</b> Doe");
  await section.getByLabel("Licence").fill("CC BY 4.0");
  await section.getByLabel("Licence").press("Enter");
  await expect.poll(async () => (await prov())?.credit).toBe("<b>Jane</b> Doe");
  expect((await prov())?.licence).toBe("CC BY 4.0");

  // A link that is not http(s) is refused with a message and not saved.
  await section.getByLabel("Source URL").fill("javascript:alert(1)");
  await section.getByLabel("Source URL").press("Enter");
  await expect(section.getByRole("alert")).toBeVisible();
  expect((await prov())?.sourceUrl).toBe("https://images.example.com/harbour.jpg");
  await section.getByLabel("Source URL").press("Escape");
  await expect(section.getByRole("alert")).toHaveCount(0);

  // Credits off: no caption. On: the line, as plain text.
  await expect(page.locator("[data-image-layer] span")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __atelier: { canvas: { selection: { clear(): void } } } }).__atelier.canvas.selection.clear());
  await page.getByRole("switch", { name: "Show credits" }).click();
  const caption = page.locator("[data-image-layer] span");
  await expect(caption).toHaveText("<b>Jane</b> Doe · CC BY 4.0");
  await expect(page.locator("[data-image-layer] b")).toHaveCount(0);
  await page.getByRole("switch", { name: "Show credits" }).click();
  await expect(caption).toHaveCount(0);
});
