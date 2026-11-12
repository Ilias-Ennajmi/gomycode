import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_VIDEO_BYTES as SERVER_LIMIT } from "@/lib/assets/asset-schema";
import { ImageError, type ProcessedImage } from "@/lib/assets/pipeline-core";
import {
  MAX_VIDEO_BYTES,
  assertVideoAcceptable,
  ensurePosterVariants,
  isVideoFile,
  posterTimeFor,
  processVideo,
  type VideoEnv,
  type VideoLike,
} from "@/lib/assets/video";

afterEach(() => vi.useRealTimers());

class FakeVideo extends EventTarget implements VideoLike {
  muted = false;
  playsInline = false;
  preload = "";
  src = "";
  videoWidth: number;
  videoHeight: number;
  duration: number;
  seeks: number[] = [];
  removed = false;
  private t = 0;
  constructor(o: { w?: number; h?: number; duration?: number; fail?: "never" | "error"; seekNever?: boolean } = {}) {
    super();
    this.videoWidth = o.w ?? 640;
    this.videoHeight = o.h ?? 360;
    this.duration = o.duration ?? 30;
    this.fail = o.fail;
    this.seekNever = o.seekNever ?? false;
  }
  fail?: "never" | "error";
  seekNever: boolean;
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    this.t = v;
    this.seeks.push(v);
    if (!this.seekNever) queueMicrotask(() => this.dispatchEvent(new Event("seeked")));
  }
  load() {
    if (this.fail === "never") return;
    queueMicrotask(() => this.dispatchEvent(new Event(this.fail === "error" ? "error" : "loadedmetadata")));
  }
  removeAttribute() {
    this.removed = true;
    this.src = "";
  }
}

const frame = (type = "image/webp") => new Blob([new Uint8Array(10)], { type });
const processed = (over: Partial<ProcessedImage> = {}): ProcessedImage => ({
  width: 640,
  height: 360,
  mime: "image/webp",
  original: frame(),
  variants: {},
  animated: false,
  ...over,
});

function env(video: FakeVideo) {
  const revoked: string[] = [];
  const e: VideoEnv = {
    createVideo: () => video,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: (u) => void revoked.push(u),
    frameToBlob: vi.fn(async () => frame()),
  };
  return { e, revoked };
}
const mp4 = () => new File([new Uint8Array(1000)], "clip.mp4", { type: "video/mp4" });

describe("limits and types", () => {
  it("allows 200 MB, the same as the server", () => {
    expect(MAX_VIDEO_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_VIDEO_BYTES).toBe(SERVER_LIMIT);
  });

  it("recognises mp4 and webm by type, or by extension when the browser gives no type", () => {
    expect(isVideoFile(new File([""], "a.mp4", { type: "video/mp4" }))).toBe(true);
    expect(isVideoFile(new File([""], "a.webm", { type: "video/webm" }))).toBe(true);
    expect(isVideoFile(new File([""], "a.MP4", { type: "" }))).toBe(true);
    expect(isVideoFile(new File([""], "a.png", { type: "image/png" }))).toBe(false);
    expect(isVideoFile(new File([""], "a.mov", { type: "video/quicktime" }))).toBe(false);
    expect(isVideoFile(new File([""], "a.gif", { type: "image/gif" }))).toBe(false);
  });

  it("refuses an empty file and one above 200 MB, naming the limit", () => {
    expect(() => assertVideoAcceptable(new File([], "e.mp4", { type: "video/mp4" }))).toThrow(ImageError);
    const big = mp4();
    Object.defineProperty(big, "size", { value: 250 * 1024 * 1024 });
    try {
      assertVideoAcceptable(big);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImageError);
      expect((e as ImageError).reason).toBe("too-large");
      expect((e as ImageError).message).toContain("250 MB");
      expect((e as ImageError).message).toContain("200 MB");
    }
    const ok = mp4();
    Object.defineProperty(ok, "size", { value: MAX_VIDEO_BYTES });
    expect(() => assertVideoAcceptable(ok)).not.toThrow();
  });
});

describe("posterTimeFor", () => {
  it("is min(1, 10% of the duration)", () => {
    expect(posterTimeFor(30)).toBe(1);
    expect(posterTimeFor(5)).toBe(0.5);
    expect(posterTimeFor(0.2)).toBeCloseTo(0.02);
  });
  it("is 0 when the duration is unknown, infinite or negative", () => {
    for (const d of [NaN, Infinity, -4, 0]) expect(posterTimeFor(d)).toBe(0);
  });
});

describe("processVideo", () => {
  it("seeks to min(1, duration*0.1), captures that frame and runs it through the image pipeline", async () => {
    const v = new FakeVideo({ duration: 30 });
    const { e, revoked } = env(v);
    const process = vi.fn(async () => processed({ variants: { w256: frame() } }));
    const out = await processVideo(mp4(), { env: e, process });
    expect(v.seeks).toEqual([1]);
    expect(out.width).toBe(640);
    expect(out.height).toBe(360);
    expect(out.duration).toBe(30);
    expect(out.original).toBeInstanceOf(Blob);
    expect(out.original.size).toBe(1000);
    expect(process).toHaveBeenCalledTimes(1);
    expect(e.frameToBlob).toHaveBeenCalledWith(v, 640, 360);
    // The video element is let go of and its object URL revoked.
    expect(v.removed).toBe(true);
    expect(revoked).toEqual(["blob:fake"]);
    expect(v.muted).toBe(true);
    expect(v.playsInline).toBe(true);
    expect(v.preload).toBe("metadata");
  });

  it("honours posterAt and clamps it into the clip", async () => {
    const a = new FakeVideo({ duration: 10 });
    await processVideo(mp4(), { env: env(a).e, process: async () => processed(), posterAt: 4 });
    expect(a.seeks).toEqual([4]);
    const b = new FakeVideo({ duration: 10 });
    await processVideo(mp4(), { env: env(b).e, process: async () => processed(), posterAt: 99 });
    expect(b.seeks[0]).toBeLessThan(10);
  });

  it("makes sure the poster has w256 and w1024 files even for a small frame (the video is the original, not an image)", async () => {
    const small = processed({ width: 160, height: 90, variants: {} });
    const out = await processVideo(mp4(), { env: env(new FakeVideo({ w: 160, h: 90 })).e, process: async () => small });
    expect(Object.keys(out.poster.variants).sort()).toEqual(["w1024", "w256"]);
  });

  it("rejects with 'Couldn't read video' when metadata never loads within 10 s", async () => {
    vi.useFakeTimers();
    const p = processVideo(mp4(), { env: env(new FakeVideo({ fail: "never" })).e, process: async () => processed() });
    const assertion = expect(p).rejects.toThrow("Couldn't read video");
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  it("rejects the same way when the browser reports an error, or the clip has no picture, or seeking never finishes", async () => {
    await expect(processVideo(mp4(), { env: env(new FakeVideo({ fail: "error" })).e, process: async () => processed() })).rejects.toThrow("Couldn't read video");
    await expect(processVideo(mp4(), { env: env(new FakeVideo({ w: 0, h: 0 })).e, process: async () => processed() })).rejects.toThrow("Couldn't read video");
    vi.useFakeTimers();
    const p = processVideo(mp4(), { env: env(new FakeVideo({ seekNever: true })).e, process: async () => processed() });
    const assertion = expect(p).rejects.toThrow("Couldn't read video");
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  it("copes with a clip whose duration is unknown (webm from a recorder): the poster is the first frame", async () => {
    const v = new FakeVideo({ duration: Infinity });
    const out = await processVideo(mp4(), { env: env(v).e, process: async () => processed() });
    expect(v.seeks).toHaveLength(1);
    expect(v.seeks[0]).toBeLessThan(0.1); // a tiny seek: it is what makes the browser load a frame
    expect(out.duration).toBe(0);
  });

  it("revokes the object URL and releases the element when it fails", async () => {
    const v = new FakeVideo({ fail: "error" });
    const { e, revoked } = env(v);
    await expect(processVideo(mp4(), { env: e, process: async () => processed() })).rejects.toThrow();
    expect(revoked).toEqual(["blob:fake"]);
    expect(v.removed).toBe(true);
  });
});

describe("ensurePosterVariants", () => {
  it("adds the frame itself as w256 and w1024 where the pipeline made none (never upscaling)", () => {
    const f = frame();
    const v = ensurePosterVariants({}, f);
    expect(v.w256).toBe(f);
    expect(v.w1024).toBe(f);
  });
  it("keeps variants the pipeline made", () => {
    const a = frame();
    const b = frame();
    const f = frame();
    const v = ensurePosterVariants({ w256: a, w1024: b }, f);
    expect(v.w256).toBe(a);
    expect(v.w1024).toBe(b);
  });
  it("adds nothing when the frame is not a WebP it can stand in for", () => {
    expect(ensurePosterVariants({}, frame("image/png"))).toEqual({});
  });
});
