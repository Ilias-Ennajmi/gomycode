import { describe, expect, it } from "vitest";
import { pickPosterVariant } from "@/lib/engine/media/poster";

describe("pickPosterVariant", () => {
  it("takes the smallest still that covers the size, else the largest there is", () => {
    expect(pickPosterVariant(["w256", "w1024", "w2048"], 200)).toBe("w256");
    expect(pickPosterVariant(["w256", "w1024", "w2048"], 600)).toBe("w1024");
    expect(pickPosterVariant(["w256", "w1024", "w2048"], 5000)).toBe("w2048");
    expect(pickPosterVariant(["w256"], 900)).toBe("w256");
  });
  it("is null when the asset has no stills (never the original: for a video that is the video file)", () => {
    expect(pickPosterVariant([], 300)).toBeNull();
  });
  it("copes with unusable sizes", () => {
    expect(pickPosterVariant(["w256", "w1024"], NaN)).toBe("w256");
    expect(pickPosterVariant(["w256", "w1024"], -5)).toBe("w256");
    expect(pickPosterVariant(["w256", "w1024"], Infinity)).toBe("w1024");
  });
});
