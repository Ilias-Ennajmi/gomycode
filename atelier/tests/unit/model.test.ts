import { describe, expect, it } from "vitest";
import {
  FRAME_PRESETS,
  STICKY_COLORS,
  defaultsFor,
  mmToPx,
} from "@/lib/engine/model/defaults";
import { keyBetween } from "@/lib/engine/model/index-order";
import type { CanvasObject, ObjectType } from "@/lib/engine/model/types";
import { validateObject } from "@/lib/engine/model/validate";
import { newId } from "@/lib/ids";

const TYPES: ObjectType[] = ["image", "text", "sticky", "shape", "arrow", "frame", "stroke", "group"];

function full(type: ObjectType, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...defaultsFor(type), id: "obj1", index: "a0", createdAt: 1, updatedAt: 2, ...over };
}

describe("validateObject", () => {
  it.each(TYPES)("accepts the defaults of type %s", (type) => {
    const o = validateObject(full(type));
    expect(o).not.toBeNull();
    expect(o!.type).toBe(type);
    expect(o!.id).toBe("obj1");
  });

  it("rejects an unknown type", () => {
    expect(validateObject(full("shape", { type: "hologram" }))).toBeNull();
  });

  it("rejects non-objects without throwing", () => {
    for (const raw of [null, undefined, 42, "x", [], true]) expect(validateObject(raw)).toBeNull();
  });

  it("rejects a missing x", () => {
    const raw = full("shape");
    delete raw.x;
    expect(validateObject(raw)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite coordinates (%s)", (bad) => {
    expect(validateObject(full("shape", { x: bad }))).toBeNull();
    expect(validateObject(full("shape", { y: bad }))).toBeNull();
    expect(validateObject(full("shape", { w: bad }))).toBeNull();
  });

  it("rejects w <= 0 or h <= 0", () => {
    expect(validateObject(full("shape", { w: 0 }))).toBeNull();
    expect(validateObject(full("shape", { h: -3 }))).toBeNull();
  });

  it("clamps opacity to 0..1", () => {
    expect(validateObject(full("shape", { opacity: 2 }))!.opacity).toBe(1);
    expect(validateObject(full("shape", { opacity: -1 }))!.opacity).toBe(0);
  });

  it("normalises rotation to (-PI, PI]", () => {
    const r = (v: number) => validateObject(full("shape", { rotation: v }))!.rotation;
    expect(r(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(r(-Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(r(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 9);
    expect(r(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 9);
  });

  it("rejects an arrow whose bound terminal lacks an id", () => {
    const arrow = full("arrow", { end: { kind: "bound", anchor: { x: 0.5, y: 0.5 } } });
    expect(validateObject(arrow)).toBeNull();
  });

  it("accepts an arrow with a bound terminal", () => {
    const arrow = full("arrow", { end: { kind: "bound", id: "t1", anchor: { x: 0.5, y: 1 } } });
    const o = validateObject(arrow);
    expect(o).not.toBeNull();
    if (o?.type === "arrow") expect(o.end).toEqual({ kind: "bound", id: "t1", anchor: { x: 0.5, y: 1 } });
  });

  it("strips unknown extra fields", () => {
    const o = validateObject(full("shape", { evil: "x", __proto__: { a: 1 } })) as unknown as Record<string, unknown>;
    expect(o).not.toBeNull();
    expect("evil" in o).toBe(false);
  });

  it("rejects bad type-specific fields", () => {
    expect(validateObject(full("shape", { kind: "pentagon" }))).toBeNull();
    expect(validateObject(full("sticky", { fill: "neon" }))).toBeNull();
    expect(validateObject(full("stroke", { points: [1, 2, NaN] }))).toBeNull();
  });

  it("rejects a missing or empty id / index", () => {
    expect(validateObject(full("shape", { id: "" }))).toBeNull();
    expect(validateObject(full("shape", { index: "" }))).toBeNull();
  });

  it("returns objects typed by their discriminator", () => {
    const o: CanvasObject | null = validateObject(full("frame"));
    expect(o?.type === "frame" && o.preset).toBe("slide-16-9");
  });
});

describe("keyBetween", () => {
  it("orders a successor after its predecessor", () => {
    const a = keyBetween(null, null);
    expect(a < keyBetween(a, null)).toBe(true);
  });

  it("orders keys inserted between and before", () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);
    expect(a < b && b < c).toBe(true);
    expect(keyBetween(null, a) < a).toBe(true);
  });

  it("stays sorted over 1,000 successive appends", () => {
    let last = keyBetween(null, null);
    const keys = [last];
    for (let i = 0; i < 1000; i++) {
      last = keyBetween(last, null);
      keys.push(last);
    }
    const sorted = [...keys].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(sorted).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("helpers", () => {
  it("mmToPx converts at a given dpi", () => {
    expect(mmToPx(210, 300)).toBe(2480);
  });

  it("exposes the exact frame presets", () => {
    expect(FRAME_PRESETS["slide-16-9"]).toMatchObject({ w: 1920, h: 1080 });
    expect(FRAME_PRESETS["slide-4-3"]).toMatchObject({ w: 1600, h: 1200 });
    expect(FRAME_PRESETS["ig-post-4-5"]).toMatchObject({ w: 1080, h: 1350 });
    expect(FRAME_PRESETS.square).toMatchObject({ w: 1080, h: 1080 });
    expect(FRAME_PRESETS["story-9-16"]).toMatchObject({ w: 1080, h: 1920 });
    expect(FRAME_PRESETS.a4).toMatchObject({ w: 210, h: 297, unit: "mm" });
    expect(FRAME_PRESETS.a3).toMatchObject({ w: 297, h: 420, unit: "mm" });
    expect(FRAME_PRESETS.letter).toMatchObject({ w: 8.5, h: 11, unit: "in" });
    expect(FRAME_PRESETS.custom).toBeDefined();
  });

  it("has 8 sticky colours mapped to tokens", () => {
    expect(Object.keys(STICKY_COLORS)).toEqual(["yellow", "peach", "pink", "lilac", "blue", "mint", "sand", "grey"]);
    expect(STICKY_COLORS.yellow).toBe("--sticky-yellow");
  });

  it("newId produces 12 distinct url-safe characters", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });
});
