import { describe, expect, it } from "vitest";
import { ImageResidency, decodedBytes, defaultBudgetBytes, type ResidencyEntry } from "@/lib/engine/render/residency";

const MiB = 1024 * 1024;
const entry = (id: string, wanted: ResidencyEntry["wanted"], w: number, h: number, visible: boolean, lastSeen: number): ResidencyEntry => ({ id, wanted, w, h, visible, lastSeen });

describe("decodedBytes", () => {
  it("is width x height x 4, and 0 for nonsense", () => {
    expect(decodedBytes(1024, 768)).toBe(1024 * 768 * 4);
    expect(decodedBytes(NaN, 5)).toBe(0);
    expect(decodedBytes(-3, 5)).toBe(0);
  });
});

describe("defaultBudgetBytes", () => {
  it("is 256 MiB, 128 MiB on a small-memory device, 96 MiB with a coarse pointer", () => {
    expect(defaultBudgetBytes({ coarsePointer: false })).toBe(256 * MiB);
    expect(defaultBudgetBytes({ deviceMemory: 8, coarsePointer: false })).toBe(256 * MiB);
    expect(defaultBudgetBytes({ deviceMemory: 4, coarsePointer: false })).toBe(128 * MiB);
    expect(defaultBudgetBytes({ deviceMemory: 2, coarsePointer: false })).toBe(128 * MiB);
    expect(defaultBudgetBytes({ coarsePointer: true })).toBe(96 * MiB);
    expect(defaultBudgetBytes({ deviceMemory: 2, coarsePointer: true })).toBe(96 * MiB);
  });
});

describe("ImageResidency.plan", () => {
  it("returns wanted unchanged when under budget", () => {
    const r = new ImageResidency({ budgetBytes: 100 * MiB });
    const plan = r.plan([entry("a", "w1024", 1024, 768, true, 1), entry("b", "original", 4000, 3000, false, 0)]);
    expect(plan.get("a")).toBe("w1024");
    expect(plan.get("b")).toBe("original");
    expect(r.usedBytes()).toBe(decodedBytes(1024, 768) + decodedBytes(4000, 3000));
  });

  it("demotes off-screen, least recently seen entries first", () => {
    const one = decodedBytes(1024, 1024);
    const r = new ImageResidency({ budgetBytes: one * 2 + decodedBytes(256, 256) });
    const plan = r.plan([
      entry("seen-now", "w1024", 1024, 1024, true, 100),
      entry("old", "w1024", 1024, 1024, false, 1),
      entry("recent", "w1024", 1024, 1024, false, 50),
    ]);
    expect(plan.get("old")).toBe("w256");
    expect(plan.get("recent")).toBe("w1024");
    expect(plan.get("seen-now")).toBe("w1024");
    expect(r.usedBytes()).toBeLessThanOrEqual(one * 2 + decodedBytes(256, 256));
  });

  it("goes one tier at a time", () => {
    const r = new ImageResidency({ budgetBytes: decodedBytes(2048, 1536) });
    // original 4096x3072 (12.6 M px) -> w2048 is exactly the budget, so it stops there and does not drop to w1024
    const plan = r.plan([entry("a", "original", 4096, 3072, false, 1)]);
    expect(plan.get("a")).toBe("w2048");
  });

  it("then demotes visible entries, largest first, never below w256", () => {
    const r = new ImageResidency({ budgetBytes: 1 });
    const plan = r.plan([entry("big", "original", 4000, 3000, true, 1), entry("mid", "w1024", 1024, 768, true, 2), entry("tiny", "w256", 256, 192, true, 3)]);
    expect(plan.get("big")).toBe("w256");
    expect(plan.get("mid")).toBe("w256");
    expect(plan.get("tiny")).toBe("w256");
    expect(r.usedBytes()).toBeGreaterThan(1); // all at the floor and still over: nothing more to give
  });

  it("takes the largest visible entry down before a smaller one", () => {
    const small = decodedBytes(1024, 768);
    const r = new ImageResidency({ budgetBytes: small + decodedBytes(2048, 1536) / 2 });
    const plan = r.plan([entry("small", "w1024", 1024, 768, true, 1), entry("large", "w2048", 2048, 1536, true, 2)]);
    expect(plan.get("large")).toBe("w1024");
    expect(plan.get("small")).toBe("w1024");
  });

  it("respects the tiers an image really has", () => {
    const r = new ImageResidency({ budgetBytes: 1 });
    const plan = r.plan([{ ...entry("legacy", "original", 3000, 2000, false, 1), tiers: ["w1024", "original"] }]);
    expect(plan.get("legacy")).toBe("w1024");
  });

  it("ends within budget whenever the floor allows it", () => {
    const r = new ImageResidency({ budgetBytes: 256 * MiB });
    const entries: ResidencyEntry[] = Array.from({ length: 200 }, (_, i) => entry(`i${i}`, "w2048", 2048, 1365, i < 40, i));
    const plan = r.plan(entries);
    expect(r.usedBytes()).toBeLessThanOrEqual(256 * MiB);
    // the on-screen ones keep more than the off-screen ones
    const rank = { w256: 0, w1024: 1, w2048: 2, original: 3 } as const;
    const visibleMin = Math.min(...entries.slice(0, 40).map((e) => rank[plan.get(e.id)!]));
    const hiddenMax = Math.max(...entries.slice(40).map((e) => rank[plan.get(e.id)!]));
    expect(visibleMin).toBeGreaterThanOrEqual(hiddenMax);
  });

  it("plans 1,000 entries wanting w1024 under a 256 MiB budget in under 50 ms", () => {
    const r = new ImageResidency({ budgetBytes: 256 * MiB });
    const entries = Array.from({ length: 1000 }, (_, i) => entry(`i${i}`, "w1024", 1024, 683, i % 3 === 0, i));
    const t0 = performance.now();
    const plan = r.plan(entries);
    const ms = performance.now() - t0;
    expect(plan.size).toBe(1000);
    expect(r.usedBytes()).toBeLessThanOrEqual(256 * MiB);
    expect(ms).toBeLessThan(50);
  });

  it("copes with nonsense entries", () => {
    const r = new ImageResidency({ budgetBytes: 10 * MiB });
    const plan = r.plan([entry("bad", "w1024", NaN, 0, true, NaN)]);
    expect(plan.get("bad")).toBe("w1024");
    expect(r.usedBytes()).toBe(0);
  });
});
