import { describe, expect, it, vi } from "vitest";
import { ImageError, runAnalysis, runPipeline, type PipelineEnv } from "@/lib/assets/pipeline-core";
import type { RawImage } from "@/lib/engine/color/extract";
import { bands, solid } from "./helpers/raw-image";

const file = (bytes = 100, type = "image/png") => new File([new Uint8Array(bytes)], "x.png", { type });

function env(over: Partial<PipelineEnv> & { width?: number; height?: number } = {}) {
  const close = vi.fn();
  const e: PipelineEnv = {
    createImageBitmap: vi.fn(async () => ({ width: over.width ?? 800, height: over.height ?? 600, close })),
    encodeWebp: vi.fn(async (_b, w, h) => new Blob([`webp ${w}x${h}`], { type: "image/webp" })),
    readPixels: over.readPixels,
  };
  return { e, close };
}

describe("runPipeline colour analysis", () => {
  it("fills palette and phash from a 64 px readback", async () => {
    const readPixels = vi.fn<(bitmap: unknown, maxSide: number) => Promise<RawImage>>(async () => bands(64, 48, [[220, 30, 40], [30, 60, 200]], [0.5, 0.5]));
    const { e, close } = env({ readPixels });
    const out = await runPipeline(file(), e);
    expect(readPixels).toHaveBeenCalledTimes(1);
    expect(readPixels.mock.calls[0][1]).toBe(64);
    expect(out.palette?.map((c) => c.hex).sort()).toEqual(["#1e3cc8", "#dc1e28"]);
    expect(out.palette?.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 6);
    expect(out.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(Object.keys(out.variants)).toEqual(["w256"]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("a fully transparent image has an empty palette (analysed, nothing to find)", async () => {
    const { e } = env({ readPixels: async () => solid(8, 8, [0, 0, 0, 0]) });
    const out = await runPipeline(file(), e);
    expect(out.palette).toEqual([]);
    expect(out.phash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("leaves palette and phash unset when the environment cannot read pixels", async () => {
    const out = await runPipeline(file(), env().e);
    expect(out.palette).toBeUndefined();
    expect(out.phash).toBeUndefined();
  });

  it("an analysis failure never fails the image", async () => {
    const { e } = env({
      readPixels: async () => {
        throw new Error("getImageData blocked");
      },
    });
    const out = await runPipeline(file(), e);
    expect(out.width).toBe(800);
    expect(out.palette).toBeUndefined();
    expect(out.phash).toBeUndefined();
  });
});

describe("runAnalysis", () => {
  it("decodes and analyses without making variants", async () => {
    const { e, close } = env({ readPixels: async () => solid(4, 4, [10, 200, 30]) });
    const out = await runAnalysis(file(), e);
    expect(out.palette).toEqual([{ hex: "#0ac81e", weight: 1 }]);
    expect(out.phash).toBe("0000000000000000");
    expect(e.encodeWebp).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("throws ImageError for an unreadable file or an environment that cannot read pixels", async () => {
    const bad: PipelineEnv = { createImageBitmap: async () => Promise.reject(new Error("no")), encodeWebp: async () => new Blob() };
    await expect(runAnalysis(file(), bad)).rejects.toBeInstanceOf(ImageError);
    await expect(runAnalysis(file(0), env().e)).rejects.toMatchObject({ reason: "empty" });
    await expect(runAnalysis(file(), env().e)).rejects.toBeInstanceOf(ImageError); // no readPixels
  });
});
