import { describe, expect, it } from "vitest";
import { SWIPE_MIN_PX, swipeDirection, tapZone } from "@/lib/engine/present/swipe";

describe("swipeDirection", () => {
  it("a left swipe is next and a right swipe is prev", () => {
    expect(swipeDirection(-80, 5, 200)).toBe("next");
    expect(swipeDirection(80, 5, 200)).toBe("prev");
  });

  it("needs 40 px, or a fast flick of at least 24 px", () => {
    expect(SWIPE_MIN_PX).toBe(40);
    expect(swipeDirection(-40, 0, 400)).toBe("next");
    expect(swipeDirection(-39, 0, 400)).toBeNull();
    expect(swipeDirection(-30, 0, 100)).toBeNull(); // 0.3 px/ms is not a flick...
  });

  it("...a flick is 0.5 px/ms or more", () => {
    expect(swipeDirection(-25, 0, 40)).toBe("next");
    expect(swipeDirection(-20, 0, 20)).toBeNull(); // too short even when fast
  });

  it("is not a swipe when it is mostly vertical", () => {
    expect(swipeDirection(-80, 70, 200)).toBeNull();
    expect(swipeDirection(-59, 40, 200)).toBeNull(); // 59 < 1.5 * 40
    expect(swipeDirection(-60, 40, 200)).toBe("next"); // exactly 1.5 times is enough
  });

  it("is not a swipe when it is slow (a drag, a hesitation) or has no time", () => {
    expect(swipeDirection(-80, 0, 900)).toBeNull();
    expect(swipeDirection(-80, 0, 800)).toBe("next");
    expect(swipeDirection(-80, 0, -5)).toBeNull();
  });

  it("ignores garbage", () => {
    expect(swipeDirection(NaN, 0, 100)).toBeNull();
    expect(swipeDirection(-80, Infinity, 100)).toBeNull();
  });
});

describe("tapZone", () => {
  it("the left 30 % goes back, the rest goes forward", () => {
    expect(tapZone(10, 1000)).toBe("prev");
    expect(tapZone(299, 1000)).toBe("prev");
    expect(tapZone(300, 1000)).toBe("next");
    expect(tapZone(900, 1000)).toBe("next");
  });

  it("a zero-width surface advances", () => {
    expect(tapZone(0, 0)).toBe("next");
  });
});
