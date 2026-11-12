import { describe, expect, it } from "vitest";
import { placeFloating } from "@/components/chrome/place";

const vp = { width: 1000, height: 800 };

describe("placeFloating", () => {
  it("goes above the anchor and centred on it when it fits", () => {
    const p = placeFloating({ left: 480, top: 700, width: 40, height: 40 }, { width: 200, height: 100 }, vp);
    expect(p.placement).toBe("top");
    expect(p.left).toBe(400);
    expect(p.top).toBe(700 - 8 - 100);
  });

  it("flips below when there is no room above", () => {
    const p = placeFloating({ left: 480, top: 20, width: 40, height: 40 }, { width: 200, height: 100 }, vp, { prefer: "top" });
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(20 + 40 + 8);
  });

  it("flips above when the preferred bottom side is too tight", () => {
    const p = placeFloating({ left: 480, top: 740, width: 40, height: 40 }, { width: 200, height: 300 }, vp, { prefer: "bottom" });
    expect(p.placement).toBe("top");
  });

  it("never leaves the viewport horizontally", () => {
    const left = placeFloating({ left: 0, top: 400, width: 30, height: 30 }, { width: 300, height: 50 }, vp);
    expect(left.left).toBe(8);
    const right = placeFloating({ left: 990, top: 400, width: 30, height: 30 }, { width: 300, height: 50 }, vp);
    expect(right.left).toBe(1000 - 300 - 8);
  });

  it("clamps a box taller than either side into the viewport", () => {
    const p = placeFloating({ left: 100, top: 400, width: 30, height: 30 }, { width: 200, height: 900 }, vp);
    expect(p.top).toBe(8);
  });

  it("aligns to the end of the anchor", () => {
    const p = placeFloating({ left: 700, top: 400, width: 100, height: 30 }, { width: 200, height: 50 }, vp, { align: "end" });
    expect(p.left).toBe(600);
  });

  it("reports where the anchor's middle is, for the transform origin", () => {
    const p = placeFloating({ left: 480, top: 700, width: 40, height: 40 }, { width: 200, height: 100 }, vp);
    expect(p.originX).toBe(100);
  });
});

describe("placeFloating with reserved edges", () => {
  it("leaves room for a rotate handle above and flips when that room is missing", () => {
    const a = { left: 400, top: 60, width: 100, height: 100 };
    const size = { width: 300, height: 40 };
    expect(placeFloating(a, size, vp, { prefer: "top", gapTop: 40, gapBottom: 12 }).placement).toBe("bottom");
    const roomy = placeFloating({ ...a, top: 300 }, size, vp, { prefer: "top", gapTop: 40, gapBottom: 12 });
    expect(roomy.placement).toBe("top");
    expect(roomy.top).toBe(300 - 40 - 40);
  });

  it("keeps clear of the top and bottom chrome", () => {
    const below = placeFloating({ left: 400, top: 100, width: 100, height: 100 }, { width: 300, height: 40 }, vp, { prefer: "top", marginTop: 64, gapTop: 8 });
    // 100 - 8 - 64 = 28 < 40: no room above, so it goes below
    expect(below.placement).toBe("bottom");
    const clamped = placeFloating({ left: 400, top: 0, width: 100, height: 900 }, { width: 300, height: 40 }, vp, { marginTop: 64, marginBottom: 72 });
    expect(clamped.top).toBeGreaterThanOrEqual(64);
    expect(clamped.top + 40).toBeLessThanOrEqual(800 - 72);
  });
});
