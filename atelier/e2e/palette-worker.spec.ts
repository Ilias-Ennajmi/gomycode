import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { dropData, openBoard, type FileSpec } from "./helpers";

/*
 * The real asset pipeline in a real browser: three generated images are dropped on a board, the Worker decodes them and
 * runs runPipeline + browserEnv (OffscreenCanvas read-back, k-means in OKLab, dHash), and the colours land in the asset
 * metadata cache (IndexedDB "atelier-assets"). Checks the parts the unit tests cannot: that the worker bundle contains the
 * analysis, that getImageData works on an OffscreenCanvas and that the numbers match what was drawn.
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
/** An RGBA PNG whose pixels come from `pixel(x, y)`. */
function png(w: number, h: number, pixel: (x: number, y: number) => [number, number, number, number]): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    for (let x = 0; x < w; x++) raw.set(pixel(x, y), row + 1 + x * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

const RED: [number, number, number] = [220, 30, 40];
const BLUE: [number, number, number] = [30, 60, 200];
const BANDS: [number, number, number][] = [[250, 220, 40], [20, 170, 160], [200, 40, 160]];
const GREEN: [number, number, number] = [30, 160, 70];

const files: FileSpec[] = [
  { name: "split.png", type: "image/png", base64: png(300, 200, (x) => [...(x < 180 ? RED : BLUE), 255]) },
  { name: "bands.png", type: "image/png", base64: png(600, 400, (x) => [...BANDS[Math.min(2, Math.floor(x / 200))], 255]) },
  { name: "cutout.png", type: "image/png", base64: png(120, 120, (x) => (x < 60 ? [...GREEN, 255] : [255, 0, 0, 0])) },
];

const hex = ([r, g, b]: number[]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

type Row = { width: number; height: number; palette: { hex: string; weight: number }[] | null; phash: string | null; analysisVersion: number };

test("the worker pipeline fills palette and phash for dropped images", async ({ page }) => {
  await openBoard(page);
  await dropData(page, { files });

  const read = () =>
    page.evaluate(
      () =>
        new Promise<Row[]>((resolve) => {
          const open = indexedDB.open("atelier-assets");
          open.onerror = () => resolve([]);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("assets")) return resolve([]);
            const req = db.transaction("assets", "readonly").objectStore("assets").getAll();
            req.onsuccess = () => resolve(req.result as Row[]);
            req.onerror = () => resolve([]);
          };
        }),
    );

  await expect.poll(async () => (await read()).filter((r) => r.analysisVersion === 1).length, { timeout: 30_000 }).toBe(3);
  const rows = await read();
  const bySize = (w: number, h: number) => rows.find((r) => r.width === w && r.height === h)!;

  const split = bySize(300, 200);
  expect(split.phash).toMatch(/^[0-9a-f]{16}$/);
  // The browser's smooth downscale blends the hard red/blue edge into a sliver of purple: allowed, but only a sliver.
  expect(split.palette!.slice(0, 2).map((c) => c.hex)).toEqual([hex(RED), hex(BLUE)]);
  for (const c of split.palette!.slice(2)) expect(c.weight).toBeLessThan(0.05);
  expect(split.palette![0].weight).toBeGreaterThan(0.55);
  expect(split.palette![0].weight).toBeLessThan(0.65);

  const bands = bySize(600, 400);
  expect(bands.phash).toMatch(/^[0-9a-f]{16}$/);
  expect(bands.palette!.slice(0, 3).map((c) => c.hex).sort()).toEqual(BANDS.map(hex).sort());
  for (const c of bands.palette!.slice(0, 3)) expect(Math.abs(c.weight - 1 / 3)).toBeLessThan(0.05);

  const cutout = bySize(120, 120);
  expect(cutout.phash).toMatch(/^[0-9a-f]{16}$/);
  expect(cutout.palette).toEqual([{ hex: hex(GREEN), weight: 1 }]); // the transparent half is ignored

  for (const r of rows) expect(r.palette!.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3);
});
