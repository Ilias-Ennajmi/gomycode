import { describe, expect, it } from "vitest";
import { DAILY_CAP, MIN_EASE, VERDICT_GRADE, dueToday, remainingToday, sm2, verdictFromGrade } from "@/lib/sm2";
import { daysThisWeek, streak } from "@/lib/streak";
import { inQuietHours, parseQuiet } from "@/lib/quietHours";

const NOW = new Date("2026-11-10T09:00:00Z");
const fresh = { ease: 2.5, intervalDays: 0, repetitions: 0 };

describe("sm2", () => {
  it("maps the three buttons to grades", () => {
    expect(VERDICT_GRADE).toEqual({ got: 5, partly: 3, missed: 1 });
    expect([5, 4, 3, 2, 0].map(verdictFromGrade)).toEqual(["got", "got", "partly", "missed", "missed"]);
  });

  it("schedules 1 day, 6 days, then interval × ease", () => {
    const one = sm2(fresh, 5, NOW);
    expect(one.intervalDays).toBe(1);
    expect(one.repetitions).toBe(1);
    const two = sm2(one, 5, NOW);
    expect(two.intervalDays).toBe(6);
    const three = sm2(two, 5, NOW);
    expect(three.intervalDays).toBe(Math.round(6 * two.ease));
    expect(Date.parse(three.dueAt) - NOW.getTime()).toBe(three.intervalDays * 86_400_000);
  });

  it("raises ease on a perfect answer and lowers it on a partial one", () => {
    expect(sm2(fresh, 5, NOW).ease).toBeCloseTo(2.6);
    expect(sm2(fresh, 3, NOW).ease).toBeCloseTo(2.36);
  });

  it("resets a missed card to tomorrow", () => {
    const learned = { ease: 2.5, intervalDays: 15, repetitions: 4 };
    const missed = sm2(learned, 1, NOW);
    expect(missed.repetitions).toBe(0);
    expect(missed.intervalDays).toBe(1);
  });

  it("never lets ease fall below 1.3", () => {
    let card = { ease: 1.35, intervalDays: 1, repetitions: 0 };
    for (let i = 0; i < 5; i++) card = sm2(card, 0, NOW);
    expect(card.ease).toBe(MIN_EASE);
  });

  it("caps due cards at 10 a day", () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({ id: i, dueAt: new Date(NOW.getTime() - i * 1000).toISOString() }));
    expect(dueToday(cards, 0, NOW)).toHaveLength(DAILY_CAP);
    expect(dueToday(cards, 7, NOW)).toHaveLength(3);
    expect(dueToday(cards, 12, NOW)).toHaveLength(0);
    expect(dueToday(cards, 0, NOW)[0].id).toBe(14); // most overdue first
    expect(remainingToday(3)).toBe(7);
  });

  it("leaves cards that aren't due yet", () => {
    expect(dueToday([{ dueAt: "2026-11-12T00:00:00Z" }], 0, NOW)).toHaveLength(0);
  });
});

describe("streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(streak(["2026-11-08", "2026-11-09", "2026-11-10"], "2026-11-10")).toBe(3);
    expect(streak(["2026-11-08", "2026-11-09"], "2026-11-10")).toBe(2);
    expect(streak(["2026-11-07"], "2026-11-10")).toBe(0);
  });
  it("counts days this week from Monday", () => {
    // 2026-11-10 is a Tuesday.
    expect(daysThisWeek(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-10"], "2026-11-10")).toBe(2);
  });
});

describe("quiet hours", () => {
  const q = parseQuiet({ start: "22:00", end: "08:00" });
  it("parses and rejects bad values", () => {
    expect(q).toEqual({ start: "22:00", end: "08:00" });
    expect(parseQuiet({ start: "25:00", end: "08:00" })).toBeNull();
    expect(parseQuiet(null)).toBeNull();
  });
  it("handles windows over midnight in the owner's time zone", () => {
    expect(inQuietHours(new Date("2026-11-10T23:00:00Z"), q, "UTC")).toBe(true);
    expect(inQuietHours(new Date("2026-11-10T07:59:00Z"), q, "UTC")).toBe(true);
    expect(inQuietHours(new Date("2026-11-10T08:00:00Z"), q, "UTC")).toBe(false);
    expect(inQuietHours(new Date("2026-11-10T12:00:00Z"), q, "UTC")).toBe(false);
    // 21:30 UTC is 06:30 in Tokyo: quiet there.
    expect(inQuietHours(new Date("2026-11-10T21:30:00Z"), q, "Asia/Tokyo")).toBe(true);
  });
  it("treats a same-day window and an empty window", () => {
    expect(inQuietHours(new Date("2026-11-10T13:00:00Z"), { start: "12:00", end: "14:00" }, "UTC")).toBe(true);
    expect(inQuietHours(new Date("2026-11-10T13:00:00Z"), { start: "12:00", end: "12:00" }, "UTC")).toBe(false);
    expect(inQuietHours(new Date("2026-11-10T13:00:00Z"), null, "UTC")).toBe(false);
  });
});
