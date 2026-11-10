import { describe, expect, it } from "vitest";
import { barPercent, monthKey, monthLabel, parseWrapped, shiftMonth, wrappedShareText } from "@/lib/wrapped";

const RAW = {
  month: "2026-11-01",
  saved: 42,
  watched: 18,
  applied: 5,
  kept: 9,
  recalled: 12,
  top_spaces: [
    { id: "s1", name: "Marketing", color: "teal", count: 20 },
    { id: "s2", name: "Food", color: "not-a-colour", count: 7 },
    { name: "broken" },
  ],
  top_creators: [{ handle: "@chef", count: 6 }, { handle: "", count: 1 }],
};

describe("Saved Wrapped", () => {
  it("parses the RPC answer defensively", () => {
    const w = parseWrapped(RAW, "2026-11-01");
    expect(w.saved).toBe(42);
    expect(w.topSpaces).toEqual([
      { id: "s1", name: "Marketing", color: "teal", count: 20 },
      { id: "s2", name: "Food", color: "inbox", count: 7 },
    ]);
    expect(w.topCreators).toEqual([{ handle: "@chef", count: 6 }]);
    const empty = parseWrapped(null, "2026-10-01");
    expect(empty).toMatchObject({ month: "2026-10-01", saved: 0, topSpaces: [], topCreators: [] });
  });

  it("walks months across years", () => {
    expect(monthKey(new Date(2026, 0, 31))).toBe("2026-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2025-12-01", 1)).toBe("2026-01-01");
    expect(monthLabel("2026-11-01")).toBe("November 2026");
  });

  it("scales bars to the largest value", () => {
    expect(barPercent(42, 42)).toBe(100);
    expect(barPercent(0, 42)).toBe(0);
    expect(barPercent(1, 1000)).toBe(4);
    expect(barPercent(5, 0)).toBe(0);
  });

  it("writes the share text", () => {
    const w = parseWrapped(RAW, "2026-11-01");
    expect(wrappedShareText(w, true)).toBe(
      "My November so far in Stash: 42 saved · 18 watched · 5 applied. Top Space: Marketing. Most saved creator: @chef.",
    );
    expect(wrappedShareText(parseWrapped({ saved: 3 }, "2026-10-01"), false)).toBe(
      "My October 2026 in Stash: 3 saved · 0 watched · 0 applied.",
    );
  });
});
