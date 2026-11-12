import type { Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

/*
 * Generated pictures for the share-page tests: the page loads them from https://assets.example.test (the R2 stand-in the build is
 * given in CI and by the playwright config), and `paintAssets` answers those requests with PNG data made here. No fixtures, no
 * network. Sizes follow the file name (w256 / w1024 / w2048 / original, preview w480 / w1280), so the tests can see which one
 * was asked for.
 */

export const ASSET_HOST = "https://assets.example.test";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** A gradient with a circle and a bar, coloured by `seed`: distinguishable at a glance, smooth enough to compress well. */
export function pictureHash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function png(w: number, h: number, seed: number, kind: "photo" | "slide" = "photo"): Buffer {
  const hue = seed % 360;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      let [r, g, b] = kind === "slide" ? hsl((hue + 40 * u) % 360, 0.25, 0.9 - 0.1 * v) : hsl((hue + 70 * u) % 360, 0.65, 0.62 - 0.3 * v);
      const dx = u - 0.35;
      const dy = (v - 0.55) * (h / w);
      if (dx * dx + dy * dy < 0.045) [r, g, b] = hsl((hue + 180) % 360, 0.6, 0.35);
      else if (kind === "photo" && v > 0.78 && u > 0.55) [r, g, b] = hsl((hue + 40) % 360, 0.8, 0.8);
      if (kind === "slide") {
        // a few tiles standing in for the slide's pictures
        const tile = (u > 0.05 && u < 0.45 && v > 0.1 && v < 0.55) || (u > 0.5 && u < 0.95 && v > 0.1 && v < 0.55) || (u > 0.05 && u < 0.3 && v > 0.62 && v < 0.92);
        if (tile) [r, g, b] = hsl((hue + 25 * Math.floor(u * 4) + 160 * (v > 0.6 ? 1 : 0)) % 360, 0.55, 0.55);
      }
      const o = 1 + x * 3;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

const cache = new Map<string, Buffer>();
const WIDTH: Record<string, number> = { w256: 256, w1024: 1024, w2048: 2048, original: 2400 };

/** Answers every request to the asset host with a generated picture, and records which files were asked for. */
export async function paintAssets(page: Page, log: string[] = [], aspects: Record<string, number> = {}): Promise<string[]> {
  await page.route(`${ASSET_HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    log.push(url.pathname);
    let body: Buffer;
    const m = /^\/a\/([^/]+)\/(w256|w1024|w2048|original)(?:\.webp)?$/.exec(url.pathname);
    const p = /^\/p\/[^/]+\/([^/]+)-w(480|1280)\.webp$/.exec(url.pathname);
    if (m) {
      const w = WIDTH[m[2]];
      const key = `a:${m[1]}:${w}`;
      body = cache.get(key) ?? (cache.set(key, png(w, Math.round((w * 2) / 3), pictureHash(m[1]))), cache.get(key)!);
    } else if (p) {
      const w = Number(p[2]);
      const key = `p:${p[1]}:${w}:${aspects[p[1]] ?? 0}`;
      body = cache.get(key) ?? (cache.set(key, png(w, Math.round(w / (aspects[p[1]] ?? 16 / 9)), pictureHash(p[1]), "slide")), cache.get(key)!);
    } else return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*", "cache-control": "no-store" }, body });
  });
  return log;
}

export interface Seeded {
  token: string;
  linkId: string;
  boardId: string;
  frames: Record<string, string>;
  images: Record<string, { objectId: string; assetId: string }[]>;
}

type Spec = Record<string, unknown> & { frames: { name: string; w?: number; h?: number; images?: number; sticky?: string; note?: string; notes?: string }[] };

/** Makes a board and a share link in the server's in-memory store (local-only mode) and returns the link's token. */
export async function seed(page: Page, spec: Spec): Promise<Seeded> {
  const res = await page.request.post("/api/test/seed-share", { data: { op: "create", spec } });
  if (res.status() !== 201) throw new Error(`seed failed: ${res.status()}`);
  return (await res.json()) as Seeded;
}

/** Preview aspect ratios (width / height) by frame id for `paintAssets`, from the spec and the ids `seed` returned. */
export function aspectsOf(spec: Spec, made: Seeded): Record<string, number> {
  return Object.fromEntries(spec.frames.map((f) => [made.frames[f.name], (f.w ?? 1600) / (f.h ?? 900)]));
}

export async function seedOp(page: Page, op: "revoke" | "reveal" | "password", linkId: string): Promise<void> {
  const res = await page.request.post("/api/test/seed-share", { data: { op, linkId } });
  if (res.status() !== 204) throw new Error(`seed op ${op} failed: ${res.status()}`);
}
