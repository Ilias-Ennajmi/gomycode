import { describe, expect, it } from "vitest";
import { bucketPolicy, cacheKey, forget, pickFresh, prune, remember, type SignedCache } from "@/lib/signedCache";

const H = 3600_000;
const NOW = 1_800_000_000_000;

describe("signed URL cache", () => {
  it("signs videos for 6 hours and thumbnails for 7 days", () => {
    expect(bucketPolicy("stash-video").ttlS).toBe(6 * 3600);
    expect(bucketPolicy("stash-thumbs").ttlS).toBe(7 * 24 * 3600);
    expect(bucketPolicy("stash-voice").ttlS).toBe(7 * 24 * 3600);
  });

  it("reuses a video link until 20 minutes before it ends", () => {
    let cache: SignedCache = remember({}, "stash-video", { "u/a.mp4": "https://x/a?token=1" }, NOW);
    expect(cache[cacheKey("stash-video", "u/a.mp4")].exp).toBe(NOW + 6 * H);
    expect(pickFresh(cache, "stash-video", ["u/a.mp4"], NOW + 5 * H)).toEqual({ fresh: { "u/a.mp4": "https://x/a?token=1" }, missing: [] });
    expect(pickFresh(cache, "stash-video", ["u/a.mp4"], NOW + 5 * H + 39 * 60_000).missing).toEqual([]);
    // Inside the last 20 minutes: sign again rather than risk it ending mid-play.
    expect(pickFresh(cache, "stash-video", ["u/a.mp4"], NOW + 5 * H + 41 * 60_000)).toEqual({ fresh: {}, missing: ["u/a.mp4"] });
    cache = remember(cache, "stash-video", { "u/a.mp4": "https://x/a?token=2" }, NOW + 6 * H);
    expect(pickFresh(cache, "stash-video", ["u/a.mp4"], NOW + 6 * H + 1).fresh["u/a.mp4"]).toBe("https://x/a?token=2");
  });

  it("keeps thumbnails' links stable for days (the service worker caches by URL)", () => {
    const cache = remember({}, "stash-thumbs", { "u/a.jpg": "https://x/a.jpg?token=1" }, NOW);
    expect(pickFresh(cache, "stash-thumbs", ["u/a.jpg"], NOW + 6 * 24 * H).fresh["u/a.jpg"]).toBeDefined();
    expect(pickFresh(cache, "stash-thumbs", ["u/a.jpg"], NOW + 6 * 24 * H + 13 * H).missing).toEqual(["u/a.jpg"]);
  });

  it("asks only for what is missing, once, and ignores empty paths", () => {
    const cache = remember({}, "stash-video", { "u/a.mp4": "A" }, NOW);
    const { fresh, missing } = pickFresh(cache, "stash-video", ["u/a.mp4", "u/b.mp4", "u/b.mp4", null, undefined, ""], NOW + 1);
    expect(fresh).toEqual({ "u/a.mp4": "A" });
    expect(missing).toEqual(["u/b.mp4"]);
  });

  it("never mixes buckets", () => {
    const cache = remember({}, "stash-thumbs", { "u/a": "T" }, NOW);
    expect(pickFresh(cache, "stash-video", ["u/a"], NOW + 1).missing).toEqual(["u/a"]);
  });

  it("prunes expired links and caps the size, keeping the longest-lived", () => {
    let cache: SignedCache = {};
    cache = remember(cache, "stash-video", { old: "O" }, NOW - 7 * H);
    cache = remember(cache, "stash-video", { a: "A" }, NOW);
    cache = remember(cache, "stash-thumbs", { b: "B", c: "C" }, NOW);
    const pruned = prune(cache, NOW + 1);
    expect(Object.keys(pruned).sort()).toEqual(["stash-thumbs/b", "stash-thumbs/c", "stash-video/a"]);
    expect(Object.keys(prune(cache, NOW + 1, 2)).sort()).toEqual(["stash-thumbs/b", "stash-thumbs/c"]);
    expect(prune({ bad: null as never }, NOW)).toEqual({});
  });

  it("forgets a link that stopped working", () => {
    const cache = remember({}, "stash-video", { a: "A", b: "B" }, NOW);
    const next = forget(cache, "stash-video", "a");
    expect(pickFresh(next, "stash-video", ["a", "b"], NOW + 1)).toEqual({ fresh: { b: "B" }, missing: ["a"] });
    expect(cache[cacheKey("stash-video", "a")]).toBeDefined(); // not mutated
  });
});
