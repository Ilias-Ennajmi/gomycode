import { describe, expect, it } from "vitest";
import { attemptKey, createAttemptTracker, lockSeconds } from "@/lib/share/backoff";

describe("lockSeconds", () => {
  it("is 0 for up to 3 failures, then doubles from 2 s", () => {
    expect([0, 1, 2, 3].map(lockSeconds)).toEqual([0, 0, 0, 0]);
    expect([4, 5, 6, 7, 8].map(lockSeconds)).toEqual([2, 4, 8, 16, 32]);
  });

  it("caps at 900 s (15 min)", () => {
    expect(lockSeconds(12)).toBe(512);
    expect(lockSeconds(13)).toBe(900);
    expect(lockSeconds(20)).toBe(900);
    expect(lockSeconds(1_000_000)).toBe(900);
    expect(lockSeconds(Number.POSITIVE_INFINITY)).toBe(900);
  });

  it("treats garbage as no lock", () => {
    expect(lockSeconds(-5)).toBe(0);
    expect(lockSeconds(Number.NaN)).toBe(0);
    expect(lockSeconds(3.5)).toBe(lockSeconds(3)); // fractional counts floor
  });
});

describe("attemptKey", () => {
  it("combines link and IP into one opaque key that does not contain the IP", () => {
    const k = attemptKey("link-1", "203.0.113.7");
    expect(k).not.toContain("203.0.113.7");
    expect(k).not.toContain("link-1");
    expect(attemptKey("link-1", "203.0.113.7")).toBe(k);
    expect(attemptKey("link-2", "203.0.113.7")).not.toBe(k);
    expect(attemptKey("link-1", "203.0.113.8")).not.toBe(k);
  });
});

describe("createAttemptTracker (per IP + link, injectable clock)", () => {
  function setup(extra: { burstLimit?: number; maxKeys?: number } = {}) {
    let now = 1_000_000;
    const tracker = createAttemptTracker({ now: () => now, ...extra });
    return { tracker, advance: (ms: number) => (now += ms), at: () => now };
  }

  it("allows the first 3 wrong passwords freely, then locks with an exponential delay", () => {
    const { tracker, advance } = setup();
    const k = "k";
    for (let i = 1; i <= 3; i++) {
      expect(tracker.check(k)).toEqual({ allowed: true, retryAfterSec: 0 });
      expect(tracker.fail(k).retryAfterSec).toBe(0);
    }
    expect(tracker.check(k).allowed).toBe(true);
    expect(tracker.fail(k).retryAfterSec).toBe(2); // 4th failure
    expect(tracker.check(k)).toEqual({ allowed: false, retryAfterSec: 2 });
    advance(1000);
    expect(tracker.check(k)).toEqual({ allowed: false, retryAfterSec: 1 });
    advance(1000);
    expect(tracker.check(k).allowed).toBe(true);
    expect(tracker.fail(k).retryAfterSec).toBe(4); // 5th
    advance(4000);
    expect(tracker.fail(k).retryAfterSec).toBe(8); // 6th
  });

  it("100 wrong passwords from one IP end in the 15-minute lock", () => {
    const { tracker, advance } = setup();
    let last = 0;
    for (let i = 0; i < 100; i++) {
      const c = tracker.check("ip");
      if (!c.allowed) advance(c.retryAfterSec * 1000);
      last = tracker.fail("ip").retryAfterSec;
    }
    expect(last).toBe(900);
    expect(tracker.check("ip")).toEqual({ allowed: false, retryAfterSec: 900 });
  });

  it("a success clears the counter", () => {
    const { tracker } = setup();
    for (let i = 0; i < 6; i++) tracker.fail("k");
    tracker.success("k");
    expect(tracker.check("k")).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(tracker.fail("k").retryAfterSec).toBe(0);
  });

  it("forgets failures after an hour of quiet", () => {
    const { tracker, advance } = setup();
    for (let i = 0; i < 5; i++) tracker.fail("k");
    advance(60 * 60 * 1000 + 5000);
    expect(tracker.check("k").allowed).toBe(true);
    expect(tracker.fail("k").retryAfterSec).toBe(0); // counting from 1 again
  });

  it("keeps keys independent (another IP or another link is not locked)", () => {
    const { tracker } = setup();
    for (let i = 0; i < 8; i++) tracker.fail("a");
    expect(tracker.check("a").allowed).toBe(false);
    expect(tracker.check("b").allowed).toBe(true);
  });

  it("a locked key that keeps hammering does not extend its own lock", () => {
    const { tracker, advance } = setup();
    for (let i = 0; i < 4; i++) tracker.fail("k"); // locked 2 s
    for (let i = 0; i < 5; i++) expect(tracker.check("k").allowed).toBe(false);
    advance(2000);
    expect(tracker.check("k").allowed).toBe(true);
  });

  it("caps the request rate per key even for attempts that are never failures (burst limiter)", () => {
    const { tracker, advance } = setup({ burstLimit: 5 });
    for (let i = 0; i < 5; i++) expect(tracker.check("k").allowed).toBe(true);
    const denied = tracker.check("k");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
    advance(61_000);
    expect(tracker.check("k").allowed).toBe(true);
  });

  it("bounds its memory", () => {
    const { tracker } = setup({ maxKeys: 50 });
    for (let i = 0; i < 500; i++) tracker.fail(`k${i}`);
    expect(tracker.size()).toBeLessThanOrEqual(50);
  });

  it("reset() forgets everything", () => {
    const { tracker } = setup();
    for (let i = 0; i < 6; i++) tracker.fail("k");
    tracker.reset();
    expect(tracker.check("k").allowed).toBe(true);
    expect(tracker.size()).toBe(0);
  });
});
