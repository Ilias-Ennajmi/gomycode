import { describe, expect, it } from "vitest";
import { buildDailyQueue, estimateMinutes, localDay, maxItems, normalizeMinutes, shouldStoreQueue, type QueueCandidate } from "@/lib/dailyQueue";

describe("shouldStoreQueue", () => {
  it("stores a non-empty queue, and an empty one only when nothing is processing", () => {
    expect(shouldStoreQueue(["a"], ["processing"])).toBe(true);
    expect(shouldStoreQueue([], ["ready", "failed"])).toBe(true);
    expect(shouldStoreQueue([], ["ready", "processing"])).toBe(false);
    expect(shouldStoreQueue([], ["queued"])).toBe(false);
  });
});

const DAY = "2026-11-10";

function c(id: string, over: Partial<QueueCandidate> = {}): QueueCandidate {
  return {
    id,
    status: "ready",
    savedAt: "2026-11-09T10:00:00Z",
    duration: 30,
    spaceId: "s",
    spaceKind: "topic",
    spaceDueDate: null,
    watchedAt: null,
    archivedAt: null,
    kept: false,
    skipCount: 0,
    hasDueCard: false,
    ...over,
  };
}

const daysAgo = (n: number) => new Date(Date.parse(`${DAY}T10:00:00Z`) - n * 86_400_000).toISOString();

describe("buildDailyQueue", () => {
  it("is empty for an empty library", () => {
    expect(buildDailyQueue([], { day: DAY })).toEqual([]);
  });

  it("never picks archived or still-processing saves", () => {
    const q = buildDailyQueue(
      [c("a", { archivedAt: daysAgo(1) }), c("b", { status: "processing" }), c("d", { status: "queued" }), c("ok")],
      { day: DAY, minutes: 30 },
    );
    expect(q).toEqual(["ok"]);
  });

  it("fits the chosen length", () => {
    const many = Array.from({ length: 40 }, (_, i) => c(`n${i}`, { savedAt: daysAgo(i % 10), duration: 60 }));
    expect(buildDailyQueue(many, { day: DAY, minutes: 2 }).length).toBe(2); // 2 × 60 s
    expect(buildDailyQueue(many, { day: DAY, minutes: 6 }).length).toBe(5); // capped at 5
    expect(buildDailyQueue(many, { day: DAY, minutes: 10 }).length).toBe(8);
    expect(buildDailyQueue(many, { day: DAY, minutes: 30 }).length).toBe(20);
  });

  it("always offers at least one item, even a long one", () => {
    expect(buildDailyQueue([c("long", { duration: 900 })], { day: DAY, minutes: 2 })).toEqual(["long"]);
  });

  it("uses the default length when none is set", () => {
    const many = Array.from({ length: 20 }, (_, i) => c(`n${i}`, { duration: 20 }));
    expect(buildDailyQueue(many, { day: DAY }).length).toBe(5);
  });

  it("puts a project Space due soon first, then a due recall, then the newest", () => {
    const q = buildDailyQueue(
      [
        c("newest", { savedAt: daysAgo(0) }),
        c("older", { savedAt: daysAgo(3) }),
        c("recall", { kept: true, hasDueCard: true, watchedAt: daysAgo(5), savedAt: daysAgo(6) }),
        c("project", { spaceKind: "project", spaceDueDate: "2026-11-14", savedAt: daysAgo(4) }),
        c("far-project", { spaceKind: "project", spaceDueDate: "2027-03-01", savedAt: daysAgo(5) }),
      ],
      { day: DAY, minutes: 6 },
    );
    expect(q.slice(0, 3)).toEqual(["project", "recall", "newest"]);
  });

  it("mixes in an old unwatched save worth another look", () => {
    const fresh = Array.from({ length: 10 }, (_, i) => c(`f${i}`, { savedAt: daysAgo(i % 3) }));
    const q = buildDailyQueue([...fresh, c("old", { savedAt: daysAgo(60) })], { day: DAY, minutes: 6 });
    expect(q).toContain("old");
  });

  it("lets skipped saves sink", () => {
    const q = buildDailyQueue(
      [c("skipped", { savedAt: daysAgo(0), skipCount: 3 }), c("fresh", { savedAt: daysAgo(2) })],
      { day: DAY, minutes: 2 },
    );
    expect(q[0]).toBe("fresh");
  });

  it("is stable for a day and changes between days", () => {
    const pool = Array.from({ length: 30 }, (_, i) => c(`o${i}`, { savedAt: daysAgo(30 + i) }));
    const a = buildDailyQueue(pool, { day: DAY, minutes: 6 });
    expect(buildDailyQueue([...pool].reverse(), { day: DAY, minutes: 6 })).toEqual(a);
    const other = ["2026-11-11", "2026-11-12", "2026-11-13"].map((d) => buildDailyQueue(pool, { day: d, minutes: 6 }).join());
    expect(other.some((o) => o !== a.join())).toBe(true);
  });

  it("never repeats a save", () => {
    const pool = [
      c("x", { kept: true, hasDueCard: true, spaceKind: "project", spaceDueDate: "2026-11-12", savedAt: daysAgo(40) }),
      c("y"),
    ];
    const q = buildDailyQueue(pool, { day: DAY, minutes: 30 });
    expect(new Set(q).size).toBe(q.length);
  });
});

describe("helpers", () => {
  it("normalizes minutes", () => {
    expect(normalizeMinutes(null)).toBe(6);
    expect(normalizeMinutes(-1)).toBe(6);
    expect(normalizeMinutes(10)).toBe(10);
  });
  it("caps items per length", () => {
    expect([2, 6, 10, 30].map(maxItems)).toEqual([3, 5, 8, 20]);
  });
  it("estimates minutes", () => {
    expect(estimateMinutes([60, 60, null])).toBe(3);
    expect(estimateMinutes([])).toBe(1);
  });
  it("reads the local day in a time zone", () => {
    const late = new Date("2026-11-10T23:30:00Z");
    expect(localDay(late, "UTC")).toBe("2026-11-10");
    expect(localDay(late, "Asia/Tokyo")).toBe("2026-11-11");
  });
});
