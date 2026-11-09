import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchQuery, hasOperators } from "@/lib/search-query";
import { cleanLink } from "@/lib/links";
import { salvageJson } from "@/lib/json-salvage";
import { sourceKey } from "@/lib/source-key";
import { retentionDays, NEWS_RETENTION_DAYS, RETENTION_DAYS } from "@/lib/retention";
import { episodeSponsors } from "@/lib/sponsors";

test("search operators come out of the text", () => {
  const parsed = parseSearchQuery('sleep from:"the verge" tag:#AI is:unread in:videos');
  assert.equal(parsed.text, "sleep");
  assert.equal(parsed.from, "the verge");
  assert.deepEqual(parsed.tags, ["ai"]);
  assert.equal(parsed.unread, true);
  assert.equal(parsed.in, "youtube");
  assert.equal(hasOperators("is:saved"), true);
  assert.equal(hasOperators("plain words"), false);
  // Called twice in a row: the global regex must not keep state between calls.
  assert.equal(hasOperators("is:saved"), true);
});

test("links lose tracking parameters only", () => {
  assert.equal(
    cleanLink("https://example.com/a?utm_source=x&id=3&fbclid=y"),
    "https://example.com/a?id=3"
  );
  assert.equal(cleanLink("https://example.com/a?id=3"), "https://example.com/a?id=3");
  assert.equal(cleanLink("not a url"), "not a url");
  assert.equal(cleanLink("https://example.com/a?utm_medium=email"), "https://example.com/a");
});

test("cut-off AI JSON keeps the complete items", () => {
  assert.deepEqual(salvageJson('{"bullets":[{"t":"one"},{"t":"two"},{"t":"thr'), {
    bullets: [{ t: "one" }, { t: "two" }],
  });
  assert.deepEqual(salvageJson('Sure! {"a":1}'), { a: 1 });
  assert.throws(() => salvageJson("no json here"));
});

test("source keys ignore scheme, www and trailing slashes", () => {
  assert.equal(sourceKey("https://www.Example.com/feed/"), sourceKey("http://example.com/feed"));
});

test("news is kept for less time than the rest", () => {
  assert.equal(retentionDays("world"), NEWS_RETENTION_DAYS);
  assert.equal(retentionDays(null), RETENTION_DAYS);
});

test("episode sponsors come from ad chapters and sponsor reads", () => {
  const fromChapters = episodeSponsors(
    [
      { t: 0, title: "Intro" },
      { t: 65, title: "Sponsor: Example" },
      { t: 100, title: "Second topic" },
    ],
    [],
    240
  );
  assert.deepEqual(
    fromChapters.map((s) => [s.start, s.end]),
    [[65, 100]]
  );
  const fromTranscript = episodeSponsors(
    [],
    [
      { t: 10, text: "This episode is brought to you by Acme." },
      { t: 30, text: "Use the code READER for 20% off." },
      { t: 55, text: "And now, back to the show." },
      { t: 60, text: "So, about sleep." },
    ],
    300
  );
  assert.equal(fromTranscript.length, 1);
  assert.equal(fromTranscript[0].start, 10);
  assert.equal(fromTranscript[0].end, 55);
});

test("a body that isn't JSON is a bad request, not a server error", async () => {
  const { readJson, BadRequest } = await import("@/lib/http");
  await assert.rejects(
    readJson(new Request("http://x/", { method: "POST", body: "" })),
    (error) => error instanceof BadRequest
  );
  assert.deepEqual(await readJson(new Request("http://x/", { method: "POST", body: '{"a":1}' })), {
    a: 1,
  });
});
