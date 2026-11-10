import { test } from "node:test";
import assert from "node:assert/strict";
import { pickAutoDownloads } from "@/lib/auto-downloads";
import type { ArticleSummary } from "@/lib/types";

const MB = 1024 * 1024;
let n = 0;
function episode(feedId: string, hoursAgo: number, extra: Partial<ArticleSummary> = {}) {
  n++;
  return {
    id: `e${n}`,
    feedId,
    title: `Episode ${n}`,
    feed: { id: feedId, title: feedId },
    audioUrl: `https://x.test/${n}.mp3`,
    isVideo: false,
    isRead: false,
    durationSeconds: 1800,
    publishedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    ...extra,
  } as unknown as ArticleSummary;
}

test("the newest unread episodes of the chosen shows, a couple each", () => {
  const list = [
    episode("a", 1),
    episode("a", 2),
    episode("a", 3),
    episode("b", 1),
    episode("c", 1),
    episode("a", 0.5, { isRead: true }),
  ];
  const picked = pickAutoDownloads({
    episodes: list,
    downloaded: {},
    shows: ["a", "b"],
    limitBytes: 5000 * MB,
  });
  // a's newest two (not the read one, not the third) and b's one: c isn't chosen.
  assert.deepEqual(picked.map((p) => p.id).sort(), [list[0].id, list[1].id, list[3].id].sort());
  assert.ok(picked.every((p) => p.feedId !== "c"));
});

test("what's already downloaded or failed is skipped, and the limit holds", () => {
  const list = [episode("a", 1), episode("a", 2), episode("a", 3)];
  const have = {
    [list[0].id]: { episode: { id: list[0].id, feedId: "a" }, bytes: 20 * MB, at: 1 },
  } as never;
  const picked = pickAutoDownloads({
    episodes: list,
    downloaded: have,
    shows: ["a"],
    limitBytes: 5000 * MB,
    failed: [list[1].id],
  });
  assert.deepEqual(picked, []);

  // 30 minutes is about 29 MB: a 40 MB limit with 20 MB used has no room.
  const tight = pickAutoDownloads({
    episodes: [episode("a", 1)],
    downloaded: have,
    shows: ["a"],
    limitBytes: 40 * MB,
  });
  assert.deepEqual(tight, []);
});
