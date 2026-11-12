import { describe, expect, it } from "vitest";
import { buildAssetTable, createImageSource, svgImages, tierChain, toDataUrl, type AssetTable } from "@/lib/engine/export/images";

const ID = "11111111-1111-4111-8111-111111111111";
const table = (over: Partial<AssetTable[string]> = {}): AssetTable => ({
  [ID]: { width: 4000, height: 3000, variants: ["w256", "w1024", "w2048"], urls: { w256: "https://cdn/a/w256", w1024: "https://cdn/a/w1024", w2048: "https://cdn/a/w2048", original: "https://cdn/a/original" }, ...over },
});
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
function setup(t: AssetTable, failing: string[] = [], throwing: string[] = []) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    if (throwing.includes(url)) throw new TypeError("Failed to fetch");
    if (failing.includes(url)) return new Response("no", { status: 404 });
    return new Response(png);
  }) as unknown as typeof fetch;
  const decoded: ImageBitmap[] = [];
  const decode = async () => {
    const b = { width: 100, height: 75, closed: false, close() { this.closed = true; } };
    decoded.push(b as unknown as ImageBitmap);
    return b as unknown as ImageBitmap;
  };
  return { calls, decoded, src: createImageSource(t, { fetchFn, decode }) };
}

describe("export image source", () => {
  it("loads the smallest variant that covers the output size", async () => {
    const s = setup(table());
    await s.src.load(ID, 500);
    expect(s.calls).toEqual(["https://cdn/a/w1024"]);
    const s2 = setup(table());
    await s2.src.load(ID, 3000);
    expect(s2.calls).toEqual(["https://cdn/a/original"]);
  });

  it("falls back to the next variant, then the original, when a fetch fails", async () => {
    const s = setup(table(), ["https://cdn/a/w1024"]);
    const bmp = await s.src.load(ID, 500);
    expect(bmp).not.toBeNull();
    expect(s.calls).toEqual(["https://cdn/a/w1024", "https://cdn/a/w2048"]);
    const s3 = setup(table(), ["https://cdn/a/w256", "https://cdn/a/w1024", "https://cdn/a/w2048", "https://cdn/a/original"]);
    expect(await s3.src.load(ID, 500)).toBeNull();
  });

  it("never loads a video's original as a picture", async () => {
    const s = setup(table({ variants: [] }));
    expect(await s.src.load(ID, 500, { noOriginal: true })).toBeNull();
    expect(s.calls).toEqual([]);
  });

  it("decodes a picture used twice once, and shares an in-flight load", async () => {
    const s = setup(table());
    const [a, b] = await Promise.all([s.src.load(ID, 500), s.src.load(ID, 500)]);
    expect(a).toBe(b);
    await s.src.load(ID, 400);
    expect(s.calls).toHaveLength(1);
  });

  it("reloads a larger variant when a later node needs more, and frees the smaller bitmap", async () => {
    const s = setup(table());
    await s.src.load(ID, 200);
    await s.src.load(ID, 1800);
    expect(s.calls).toEqual(["https://cdn/a/w256", "https://cdn/a/w2048"]);
    expect((s.decoded[0] as unknown as { closed: boolean }).closed).toBe(true);
  });

  it("evicts least recently used bitmaps over the pixel budget", async () => {
    const ids = [0, 1, 2, 3].map((i) => `0000000${i}-1111-4111-8111-111111111111`);
    const t: AssetTable = {};
    for (const id of ids) t[id] = { width: 100, height: 75, variants: [], urls: { original: `https://cdn/${id}` } };
    const decoded: { closed: boolean }[] = [];
    const src = createImageSource(t, {
      fetchFn: (async () => new Response(png)) as unknown as typeof fetch,
      decode: async () => {
        const b = { width: 100, height: 100, closed: false, close() { this.closed = true; } };
        decoded.push(b);
        return b as unknown as ImageBitmap;
      },
      budgetPx: 25_000, // two 100x100 bitmaps
    });
    for (const id of ids) await src.load(id, 100);
    expect(decoded.map((d) => d.closed)).toEqual([true, true, false, false]);
  });

  it("suspects CORS when remote fetches throw a network error and none succeed", async () => {
    const s = setup(table(), [], ["https://cdn/a/w1024", "https://cdn/a/w2048", "https://cdn/a/original", "https://cdn/a/w256"]);
    expect(await s.src.load(ID, 500)).toBeNull();
    expect(s.src.corsSuspected()).toBe(true);
    const ok = setup(table());
    await ok.src.load(ID, 500);
    expect(ok.src.corsSuspected()).toBe(false);
  });

  it("returns sniffed bytes under a size cap for SVG embedding", async () => {
    const s = setup(table());
    const got = await s.src.bytes(ID, 500);
    expect(got?.mime).toBe("image/png");
    expect(await s.src.bytes(ID, 500, { maxBytes: 3 })).toBeNull();
    const html = createImageSource(table(), { fetchFn: (async () => new Response("<html>")) as unknown as typeof fetch });
    expect(await html.bytes(ID, 500)).toBeNull(); // not an image, whatever the header says
  });
});

describe("svgImages and helpers", () => {
  it("embeds under the per-picture and total caps and links only https", async () => {
    const s = setup(table());
    const imgs = svgImages(s.src, table(), { perImageBytes: 1000, totalBytes: png.length + 1 });
    const first = await imgs.dataUrl(ID, 500);
    expect(first?.startsWith("data:image/png;base64,")).toBe(true);
    expect(await imgs.dataUrl(ID, 500)).toBeNull(); // total cap reached
    expect(imgs.overCap()).toBe(1);
    expect(imgs.url(ID)).toBe("https://cdn/a/original");
    expect(imgs.url(ID, { noOriginal: true })).toBe("https://cdn/a/w2048");
    expect(svgImages(s.src, { [ID]: { width: 1, height: 1, variants: [], urls: { original: "blob:http://x/1" } } }).url(ID)).toBeNull();
  });

  it("builds an asset table, leaving unknown assets out", () => {
    const t = buildAssetTable([ID, "unknown"], {
      urlsFor: (id) => (id === ID ? { original: "https://cdn/o" } : {}),
      available: (id) => (id === ID ? { variants: ["w256"], width: 10, height: 20 } : null),
    });
    expect(Object.keys(t)).toEqual([ID]);
    expect(t[ID]).toMatchObject({ width: 10, height: 20, variants: ["w256"] });
  });

  it("orders tiers wanted, larger, then smaller", () => {
    expect(tierChain("w1024", ["w256", "w1024", "w2048", "original"])).toEqual(["w1024", "w2048", "original", "w256"]);
  });

  it("writes big pictures as base64 without overflowing the stack", () => {
    const big = new Uint8Array(300_000).fill(7);
    expect(toDataUrl(big, "image/png").length).toBeGreaterThan(400_000);
  });
});
