import { test } from "node:test";
import assert from "node:assert/strict";
import { digestBody } from "@/lib/push";
import { monthStories } from "@/lib/recap";
import { rankByMeaning } from "@/lib/search";

test("the morning digest lists three headlines, then what's waiting", () => {
  const body = digestBody(["One", "Two", "Three", "Four"], { later: 12, episodes: 1 });
  assert.equal(body, "• One\n• Two\n• Three\n12 in Later · 1 new episode");
  assert.equal(digestBody(["Only"], { later: 0, episodes: 0 }), "• Only");
});

test("the month keeps its most-covered leads, newest first", () => {
  const story = (date: string, sources: number) => ({
    articleId: date,
    headline: date,
    why: "",
    imageUrl: null,
    date,
    sources: Array.from({ length: sources }, (_, i) => `s${i}`),
  });
  const days = Array.from({ length: 30 }, (_, i) =>
    story(`2026-10-${String(i + 1).padStart(2, "0")}`, i % 5)
  );
  const picked = monthStories(days);
  assert.equal(picked.length, 8);
  assert.ok(picked.every((s) => s.sources.length >= 3));
  assert.deepEqual(
    picked.map((s) => s.date),
    [...picked.map((s) => s.date)].sort().reverse()
  );
});

test("by meaning: closest first, unrelated left out", () => {
  const ids = rankByMeaning(
    [1, 0, 0],
    [
      { id: "far", embedding: [0, 1, 0] },
      { id: "close", embedding: [0.9, 0.1, 0] },
      { id: "closest", embedding: [1, 0.01, 0] },
    ]
  );
  assert.deepEqual(ids, ["closest", "close"]);
});
