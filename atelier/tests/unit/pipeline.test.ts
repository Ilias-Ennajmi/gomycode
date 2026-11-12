import { describe, expect, it, vi } from "vitest";
import { createLimiter } from "@/lib/assets/limiter";
import {
  detectAnimated,
  downscaleSteps,
  fitWithin,
  ImageError,
  runPipeline,
  VARIANT_SIZES,
  variantPlan,
  type PipelineEnv,
} from "@/lib/assets/pipeline-core";
import { processImage } from "@/lib/assets/pipeline";

function fakeEnv(width: number, height: number) {
  const decode = vi.fn(async () => ({ width, height, close: vi.fn() }));
  const encode = vi.fn(async (_b: unknown, w: number, h: number) => new Blob([`webp ${w}x${h}`], { type: "image/webp" }));
  const env: PipelineEnv = { createImageBitmap: decode, encodeWebp: encode };
  return { env, decode, encode };
}
const file = (bytes: number[] | number = 100, type = "image/jpeg", name = "photo.jpg") =>
  new File([typeof bytes === "number" ? new Uint8Array(bytes) : new Uint8Array(bytes)], name, { type });

describe("variantPlan", () => {
  it("lists every size strictly smaller than the longest side, ascending", () => {
    expect(variantPlan(4000, 3000)).toEqual(["w256", "w1024", "w2048"]);
    expect(variantPlan(3000, 4000)).toEqual(["w256", "w1024", "w2048"]);
    expect(variantPlan(1500, 1000)).toEqual(["w256", "w1024"]);
    expect(variantPlan(2048, 100)).toEqual(["w256", "w1024"]); // 2048 is not strictly smaller
    expect(variantPlan(1024, 500)).toEqual(["w256"]); // 1024 is not strictly smaller
    expect(variantPlan(257, 10)).toEqual(["w256"]);
  });
  it("gives nothing for tiny or unusable sizes", () => {
    expect(variantPlan(200, 200)).toEqual([]);
    expect(variantPlan(256, 256)).toEqual([]);
    expect(variantPlan(1, 1)).toEqual([]);
    expect(variantPlan(0, 0)).toEqual([]);
    expect(variantPlan(Number.NaN, 100)).toEqual([]);
    expect(variantPlan(-5, -5)).toEqual([]);
  });
  it("uses the longest side, so a 20000 x 200 panorama gets all three", () => {
    expect(variantPlan(20000, 200)).toEqual(["w256", "w1024", "w2048"]);
  });
  it("VARIANT_SIZES", () => {
    expect(VARIANT_SIZES).toEqual({ w256: 256, w1024: 1024, w2048: 2048 });
  });
});

describe("downscaleSteps", () => {
  it("halves until within 2x of the target, then goes to the target", () => {
    expect(downscaleSteps(4000, 3000, 1024, 768)).toEqual([
      { w: 2000, h: 1500 },
      { w: 1024, h: 768 },
    ]);
    expect(downscaleSteps(8000, 6000, 256, 192)).toEqual([
      { w: 4000, h: 3000 },
      { w: 2000, h: 1500 },
      { w: 1000, h: 750 },
      { w: 500, h: 375 },
      { w: 256, h: 192 },
    ]);
  });
  it("is a single step when the source is already within 2x, and empty when nothing changes", () => {
    expect(downscaleSteps(1500, 1000, 1024, 683)).toEqual([{ w: 1024, h: 683 }]);
    expect(downscaleSteps(100, 100, 100, 100)).toEqual([]);
  });
  it("never produces a zero or non-finite size", () => {
    for (const s of downscaleSteps(20000, 200, 256, 3)) {
      expect(s.w).toBeGreaterThanOrEqual(1);
      expect(s.h).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.w + s.h)).toBe(true);
    }
  });
});

describe("runPipeline", () => {
  it("decodes with EXIF orientation and makes w256, w1024 and w2048 WebP at q 0.82, keeping the original", async () => {
    const { env, decode, encode } = fakeEnv(4000, 3000);
    const f = file();
    const out = await runPipeline(f, env);
    expect(decode).toHaveBeenCalledWith(f, { imageOrientation: "from-image" });
    expect(encode.mock.calls.map((c) => c.slice(1))).toEqual([
      [256, 192, 0.82],
      [1024, 768, 0.82],
      [2048, 1536, 0.82],
    ]);
    expect(out).toMatchObject({ width: 4000, height: 3000, mime: "image/jpeg", animated: false });
    expect(out.original).toBe(f);
    expect(Object.keys(out.variants)).toEqual(["w256", "w1024", "w2048"]);
    expect(out.variants.w1024!.type).toBe("image/webp");
  });

  it("never upscales: 1500 px wide has no w2048, 1024 px wide has only w256", async () => {
    let r = fakeEnv(1500, 1000);
    expect(Object.keys((await runPipeline(file(), r.env)).variants)).toEqual(["w256", "w1024"]);
    r = fakeEnv(1024, 500);
    expect(Object.keys((await runPipeline(file(), r.env)).variants)).toEqual(["w256"]);
    r = fakeEnv(200, 200);
    const small = await runPipeline(file(), r.env);
    expect(small.variants).toEqual({});
    expect(r.encode).not.toHaveBeenCalled();
  });

  it("a 1x1 image: sizes 1x1, no variants, nothing NaN", async () => {
    const { env, encode } = fakeEnv(1, 1);
    const out = await runPipeline(file(), env);
    expect(out).toMatchObject({ width: 1, height: 1, variants: {} });
    expect(encode).not.toHaveBeenCalled();
  });

  it("a 20000 x 200 panorama: all three variants, every size finite and at least 1 px", async () => {
    const { env, encode } = fakeEnv(20000, 200);
    const out = await runPipeline(file(), env);
    expect(Object.keys(out.variants)).toEqual(["w256", "w1024", "w2048"]);
    for (const c of encode.mock.calls) {
      expect(c[1]).toBeGreaterThanOrEqual(1);
      expect(c[2]).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(c[1] + c[2])).toBe(true);
    }
    expect(encode.mock.calls[0].slice(1, 3)).toEqual([256, 3]);
  });

  it("an EXIF-rotated phone photo reports the oriented (swapped) size", async () => {
    // The browser applies the orientation when decoding: a 4000 x 3000 file shot in portrait decodes as 3000 x 4000.
    const { env, encode } = fakeEnv(3000, 4000);
    const out = await runPipeline(file(), env);
    expect([out.width, out.height]).toEqual([3000, 4000]);
    expect(encode.mock.calls[1].slice(1, 3)).toEqual([768, 1024]);
  });

  it("rejects a 0-byte file before decoding", async () => {
    const { env, decode } = fakeEnv(10, 10);
    const err = await runPipeline(new File([], "e.png", { type: "image/png" }), env).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe("empty");
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects a 60 MB file naming both sizes, before decoding", async () => {
    const { env, decode } = fakeEnv(10, 10);
    const big = file();
    Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
    const err = await runPipeline(big, env).catch((e) => e);
    expect(err.reason).toBe("too-large");
    expect(err.message).toMatch(/60 MB/);
    expect(err.message).toMatch(/50 MB/);
    expect(decode).not.toHaveBeenCalled();
  });

  it("an undecodable file (CMYK the browser refuses, a truncated JPEG, HEIC on Chrome) is an unsupported ImageError, never a raw throw", async () => {
    const { env, decode } = fakeEnv(1, 1);
    decode.mockRejectedValueOnce(new DOMException("The source image cannot be decoded", "InvalidStateError"));
    const err = await runPipeline(file(10, "image/heic", "IMG.heic"), env).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err.reason).toBe("unsupported");
    expect(err.message).toMatch(/image\/heic/);
  });

  it("refuses a decode that reports zero, NaN or absurd dimensions, and closes the bitmap", async () => {
    for (const [w, h] of [[0, 10], [10, 0], [Number.NaN, 10], [40000, 10]]) {
      const { env, decode, encode } = fakeEnv(w, h);
      await expect(runPipeline(file(), env)).rejects.toMatchObject({ reason: "unsupported" });
      expect(encode).not.toHaveBeenCalled();
      expect(decode).toHaveBeenCalled();
    }
  });

  it("closes the bitmap even when encoding fails", async () => {
    const close = vi.fn();
    const env: PipelineEnv = {
      createImageBitmap: async () => ({ width: 3000, height: 2000, close }),
      encodeWebp: async () => {
        throw new Error("no 2d context");
      },
    };
    await expect(runPipeline(file(), env)).rejects.toThrow();
    expect(close).toHaveBeenCalled();
  });
});

describe("animated detection", () => {
  // GIF89a, 1x1, no colour table, `frames` frames each with a graphic control extension.
  const gif = (frames: number) => {
    const head = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0];
    const frame = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00];
    const body: number[] = [];
    for (let i = 0; i < frames; i++) body.push(...frame);
    return new Blob([new Uint8Array([...head, ...body, 0x3b])], { type: "image/gif" });
  };
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("a GIF with two frames is animated, with one it is not", async () => {
    expect(await detectAnimated(gif(2))).toBe(true);
    expect(await detectAnimated(gif(1))).toBe(false);
  });
  it("a truncated or garbage GIF is not animated and never throws", async () => {
    expect(await detectAnimated(new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38])], { type: "image/gif" }))).toBe(false);
    expect(await detectAnimated(new Blob([new Uint8Array(500).fill(0x2c)], { type: "image/gif" }))).toBe(false);
  });
  it("an animated WebP has the animation flag in its VP8X chunk", async () => {
    const webp = (flags: number) =>
      new Blob([new Uint8Array([...ascii("RIFF"), 22, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8X"), 10, 0, 0, 0, flags, 0, 0, 0, 0, 0, 0, 0, 0, 0])], { type: "image/webp" });
    expect(await detectAnimated(webp(0x02))).toBe(true);
    expect(await detectAnimated(webp(0x10))).toBe(false);
    expect(await detectAnimated(new Blob([new Uint8Array([...ascii("RIFF"), 4, 0, 0, 0, ...ascii("WEBP")])], { type: "image/webp" }))).toBe(false);
  });
  it("an APNG has an acTL chunk before the image data", async () => {
    const png = (chunk: string) =>
      new Blob([new Uint8Array([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...new Array(17).fill(0), 0, 0, 0, 8, ...ascii(chunk), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...ascii("IDAT")])], { type: "image/png" });
    expect(await detectAnimated(png("acTL"))).toBe(true);
    expect(await detectAnimated(png("gAMA"))).toBe(false);
  });
  it("ordinary JPEGs and empty files are not animated", async () => {
    expect(await detectAnimated(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])], { type: "image/jpeg" }))).toBe(false);
    expect(await detectAnimated(new Blob([], { type: "image/gif" }))).toBe(false);
  });
  it("runPipeline reports animated and still makes variants from the first frame", async () => {
    const { env, encode } = fakeEnv(1600, 900);
    const out = await runPipeline(new File([gif(3)], "loop.gif", { type: "image/gif" }), env);
    expect(out.animated).toBe(true);
    expect(Object.keys(out.variants)).toEqual(["w256", "w1024"]);
    expect(encode).toHaveBeenCalledTimes(2);
  });
});

describe("processing concurrency", () => {
  it("processImage never decodes more than 3 images at once, however many are queued", async () => {
    let active = 0;
    let peak = 0;
    const env: PipelineEnv = {
      createImageBitmap: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        return { width: 100, height: 100, close: () => void active-- };
      },
      encodeWebp: async () => new Blob(["x"], { type: "image/webp" }),
    };
    const all = await Promise.all(Array.from({ length: 40 }, () => processImage(file(), { env })));
    expect(all).toHaveLength(40);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("a failing image does not hold a slot", async () => {
    const env: PipelineEnv = {
      createImageBitmap: async () => {
        throw new Error("nope");
      },
      encodeWebp: async () => new Blob(),
    };
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => processImage(file(), { env })));
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    const ok: PipelineEnv = { createImageBitmap: async () => ({ width: 5, height: 5 }), encodeWebp: async () => new Blob() };
    await expect(processImage(file(), { env: ok })).resolves.toMatchObject({ width: 5 });
  });
});

describe("createLimiter", () => {
  it("runs at most n at once and in arrival order", async () => {
    const run = createLimiter(2);
    const order: number[] = [];
    let active = 0;
    let peak = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        run(async () => {
          active++;
          peak = Math.max(peak, active);
          order.push(n);
          await new Promise((r) => setTimeout(r, 1));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });
  it("fitWithin is unchanged", () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ w: 1024, h: 768 });
  });
});
