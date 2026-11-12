import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";

describe("createRateLimiter (in-memory sliding window)", () => {
  it("allows `limit` hits per window and refuses the next with a retry hint", () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect(rl.hit("a").ok).toBe(true);
    now += 1000;
    expect(rl.hit("a").ok).toBe(true);
    now += 1000;
    expect(rl.hit("a").ok).toBe(true);
    now += 1000;
    const denied = rl.hit("a");
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSec).toBe(57); // the oldest hit leaves the window 57 s from now
  });

  it("slides: capacity returns as old hits age out, and refused hits do not count", () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    rl.hit("k");
    now = 500;
    rl.hit("k");
    for (let i = 0; i < 10; i++) expect(rl.hit("k").ok).toBe(false);
    now = 1001; // first hit expired
    expect(rl.hit("k").ok).toBe(true);
    expect(rl.hit("k").ok).toBe(false);
    now = 1600; // second expired
    expect(rl.hit("k").ok).toBe(true);
  });

  it("keeps keys independent", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(rl.hit("a").ok).toBe(true);
    expect(rl.hit("b").ok).toBe(true);
    expect(rl.hit("a").ok).toBe(false);
  });

  it("forgets idle keys so memory stays bounded", () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 100, now: () => now });
    for (let i = 0; i < 500; i++) rl.hit(`k${i}`);
    now = 5000;
    rl.hit("fresh");
    expect(rl.size()).toBeLessThanOrEqual(100);
  });

  it("reset clears everything", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    rl.hit("a");
    rl.reset();
    expect(rl.hit("a").ok).toBe(true);
  });
});
