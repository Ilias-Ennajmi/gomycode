import { describe, expect, it } from "vitest";
import { makeImageBoard } from "../../bench/fixtures/make-board";
import { validateObject } from "@/lib/engine/model/validate";

describe("makeImageBoard", () => {
  const a = makeImageBoard(1000, 1);

  it("is deterministic", () => {
    expect(makeImageBoard(1000, 1)).toEqual(a);
    expect(makeImageBoard(1000, 2)).not.toEqual(a);
  });

  it("makes 1,000 objects from 48 varied source images", () => {
    expect(a.objects).toHaveLength(1000);
    expect(a.baseImages).toHaveLength(48);
    for (const b of a.baseImages) {
      expect(Math.max(b.w, b.h)).toBeGreaterThanOrEqual(1600);
      expect(Math.max(b.w, b.h)).toBeLessThanOrEqual(4000);
      expect(b.w / b.h).toBeGreaterThanOrEqual(9 / 16 - 0.01);
      expect(b.w / b.h).toBeLessThanOrEqual(16 / 9 + 0.01);
    }
    expect(new Set(a.baseImages.map((b) => Math.round((b.w / b.h) * 10))).size).toBeGreaterThan(10);
  });

  it("passes the object validator, with unique ids and asset ids", () => {
    for (const o of a.objects) expect(validateObject({ ...o, createdAt: 0, updatedAt: 0 }), o.id).not.toBeNull();
    expect(new Set(a.objects.map((o) => o.id)).size).toBe(1000);
    expect(new Set(a.objects.map((o) => o.assetId)).size).toBe(1000);
  });

  it("has strictly ascending indexes and no two identical rects", () => {
    for (let i = 1; i < a.objects.length; i++) expect(a.objects[i].index! > a.objects[i - 1].index!).toBe(true);
    expect(new Set(a.objects.map((o) => `${o.x},${o.y},${o.w},${o.h}`)).size).toBe(1000);
  });

  it("keeps each object's aspect ratio within 9:16 to 16:9 and its size within 180 to 420 px", () => {
    for (const o of a.objects) {
      expect(o.w / o.h).toBeGreaterThanOrEqual(9 / 16 - 0.03);
      expect(o.w / o.h).toBeLessThanOrEqual(16 / 9 + 0.03);
      expect(Math.max(o.w, o.h)).toBeGreaterThanOrEqual(180);
      expect(Math.max(o.w, o.h)).toBeLessThanOrEqual(420);
    }
  });

  it("lays out about 40 columns", () => {
    const xs = new Set(a.objects.map((o) => Math.round(o.x / 480)));
    expect(xs.size).toBe(40);
  });

  it("copes with n = 0 and 1", () => {
    expect(makeImageBoard(0).objects).toEqual([]);
    expect(makeImageBoard(1).objects).toHaveLength(1);
  });
});
