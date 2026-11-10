import { describe, expect, it } from "vitest";
import type { SaveItem } from "@/lib/data";
import { ageLabel, remainingToday, triageCandidates } from "@/lib/triage";

const NOW = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function save(id: string, over: Partial<SaveItem> = {}): SaveItem {
  return {
    id,
    clientId: null,
    sourceUrl: `https://www.instagram.com/reel/${id}/`,
    platform: "instagram",
    status: "ready",
    spaceId: null,
    thumbPath: null,
    hasVideo: false,
    duration: null,
    creator: null,
    caption: null,
    title: null,
    error: null,
    savedAt: daysAgo(60),
    userNote: null,
    voiceNotePath: null,
    aiTitle: null,
    keyIdea: null,
    takeaways: [],
    actions: [],
    tags: [],
    watchedAt: null,
    kept: false,
    archivedAt: null,
    appliedAt: null,
    ...over,
  };
}

describe("triageCandidates", () => {
  it("keeps only old, unwatched, untouched saves, oldest first", () => {
    const saves = [
      save("new", { savedAt: daysAgo(5) }),
      save("old", { savedAt: daysAgo(40) }),
      save("older", { savedAt: daysAgo(400) }),
      save("watched", { watchedAt: daysAgo(1) }),
      save("archived", { archivedAt: daysAgo(1) }),
      save("kept", { kept: true }),
      save("applied", { appliedAt: daysAgo(2) }),
      save("processing", { status: "processing" }),
      save("failed", { status: "failed" }),
    ];
    // "failed" (60 days, default) still deserves a decision; it's older than "old" (40 days).
    expect(triageCandidates(saves, NOW).map((s) => s.id)).toEqual(["older", "failed", "old"]);
  });

  it("skips saves seen in triage within the last 30 days", () => {
    const saves = [save("a"), save("b")];
    expect(triageCandidates(saves, NOW, { a: daysAgo(3), b: daysAgo(45) }).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("remainingToday", () => {
  it("subtracts cards already sorted today from the daily limit", () => {
    const today = new Date(NOW);
    today.setHours(0, 30, 0, 0);
    expect(remainingToday(20, {}, NOW)).toBe(20);
    expect(remainingToday(20, { a: today.toISOString(), b: NOW.toISOString(), c: daysAgo(2) }, NOW)).toBe(18);
    expect(remainingToday(1, { a: NOW.toISOString(), b: NOW.toISOString() }, NOW)).toBe(0);
  });
});

describe("ageLabel", () => {
  it("reads naturally", () => {
    expect(ageLabel(daysAgo(31), NOW)).toBe("31 days ago");
    expect(ageLabel(daysAgo(240), NOW)).toBe("8 months ago");
    expect(ageLabel(daysAgo(400), NOW)).toBe("a year ago");
    expect(ageLabel(daysAgo(800), NOW)).toBe("2 years ago");
  });
});
