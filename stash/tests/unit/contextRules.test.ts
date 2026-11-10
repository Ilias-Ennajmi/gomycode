import { describe, expect, it } from "vitest";
import { eveningDue, inEvening, isContextRule, learnDue, nextWeekendMorning } from "@/lib/contextRules";

// Local times (the rules run in the phone's zone). 2026-11-11 is a Wednesday.
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);

describe("context reminders", () => {
  it("weekend morning is the next Saturday or Sunday at 9", () => {
    expect(nextWeekendMorning(at(11, 15))).toEqual(at(14, 9)); // Wed → Sat
    expect(nextWeekendMorning(at(14, 8))).toEqual(at(14, 9)); // Sat before 9 → today
    expect(nextWeekendMorning(at(14, 11))).toEqual(at(15, 9)); // Sat after 9 → Sun
    expect(nextWeekendMorning(at(15, 9))).toEqual(at(21, 9)); // Sun at 9 sharp → next Sat
  });

  it("evening window is 18:00 to 23:00", () => {
    expect(inEvening(at(11, 17, 59))).toBe(false);
    expect(inEvening(at(11, 18))).toBe(true);
    expect(inEvening(at(11, 22, 59))).toBe(true);
    expect(inEvening(at(11, 23))).toBe(false);
  });

  it("an evening reminder fires on the next evening open, not the one it was set in", () => {
    expect(eveningDue(at(11, 10), at(11, 19))).toBe(true); // set in the morning, opened tonight
    expect(eveningDue(at(11, 10), at(11, 15))).toBe(false); // not evening yet
    expect(eveningDue(at(11, 20), at(11, 20, 30))).toBe(false); // same evening, minutes later
    expect(eveningDue(at(11, 19), at(11, 20, 5))).toBe(true); // same evening, an hour later
    expect(eveningDue(at(11, 21), at(12, 18, 10))).toBe(true); // next evening
  });

  it("a Learn reminder fires on any later Learn visit", () => {
    expect(learnDue(at(11, 10), at(11, 10, 1))).toBe(true);
    expect(learnDue(at(11, 10), at(11, 10))).toBe(false);
  });

  it("knows its rules", () => {
    expect(isContextRule("learn_open")).toBe(true);
    expect(isContextRule("wifi")).toBe(false);
  });
});
