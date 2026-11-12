import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, parseAssetMeta } from "@/lib/assets/asset-schema";

const MB = 1024 * 1024;
const video = { mime: "video/mp4", bytes: 12 * MB, width: 640, height: 360, kind: "video" };

describe("parseAssetMeta for videos and GIFs", () => {
  it("accepts mp4 and webm up to 200 MB, refuses 250 MB with 413", () => {
    expect(parseAssetMeta({ ...video, bytes: MAX_VIDEO_BYTES }).ok).toBe(true);
    expect(parseAssetMeta({ ...video, mime: "video/webm" }).ok).toBe(true);
    const big = parseAssetMeta({ ...video, bytes: 250 * MB });
    expect(big).toMatchObject({ ok: false, status: 413 });
    expect(parseAssetMeta({ ...video, mime: "video/quicktime" })).toMatchObject({ ok: false, status: 415 });
  });

  it("a video's poster variants may include w256 and w1024 even when the clip is smaller than that", () => {
    const r = parseAssetMeta({ ...video, width: 640, height: 360, variants: ["w256", "w1024"] });
    expect(r.ok && r.meta.variants).toEqual(["w256", "w1024"]);
    const tiny = parseAssetMeta({ ...video, width: 160, height: 90, variants: ["w256", "w1024"] });
    expect(tiny.ok).toBe(true);
  });

  it("but never a w2048 poster of a clip that is not that large (nothing is upscaled)", () => {
    expect(parseAssetMeta({ ...video, width: 640, height: 360, variants: ["w256", "w1024", "w2048"] })).toMatchObject({ ok: false, status: 400 });
    const hd = parseAssetMeta({ ...video, width: 3840, height: 2160, variants: ["w256", "w1024", "w2048"] });
    expect(hd.ok).toBe(true);
  });

  it("the same rule holds for GIFs", () => {
    const gif = { mime: "image/gif", bytes: 3 * MB, width: 200, height: 150, kind: "gif" };
    expect(parseAssetMeta({ ...gif, variants: ["w256", "w1024"] }).ok).toBe(true);
    expect(parseAssetMeta({ ...gif, variants: ["w2048"] })).toMatchObject({ ok: false, status: 400 });
  });

  it("still holds plain images to their size", () => {
    const img = { mime: "image/jpeg", bytes: 3 * MB, width: 200, height: 150 };
    expect(parseAssetMeta({ ...img, variants: ["w256"] })).toMatchObject({ ok: false, status: 400 });
    expect(parseAssetMeta({ ...img, variants: ["w1024"] })).toMatchObject({ ok: false, status: 400 });
  });

  it("a video must be sent as kind video, and an image not as one", () => {
    expect(parseAssetMeta({ ...video, kind: "image" })).toMatchObject({ ok: false, status: 400 });
    expect(parseAssetMeta({ mime: "image/png", bytes: MB, width: 10, height: 10, kind: "video" })).toMatchObject({ ok: false, status: 400 });
  });
});
