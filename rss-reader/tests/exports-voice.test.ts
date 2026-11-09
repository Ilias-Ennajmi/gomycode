import { test } from "node:test";
import assert from "node:assert/strict";
import { notionBlocks, notionDatabaseId, readwisePayload } from "@/lib/exports";
import { wavFromPcm } from "@/lib/ai";
import { narrationParts } from "@/lib/speech";

test("Notion database links and IDs give the bare ID", () => {
  const id = "0123456789abcdef0123456789abcdef";
  assert.equal(notionDatabaseId(`https://www.notion.so/me/Reading-${id}?v=9`), id);
  assert.equal(notionDatabaseId("01234567-89ab-cdef-0123-456789abcdef"), id);
  assert.equal(notionDatabaseId("not a link"), null);
});

test("Notion gets a quote per highlight, its note under it", () => {
  const blocks = notionBlocks([
    { text: "First", note: "Mine" },
    { text: "Second", note: null },
  ]);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["quote", "paragraph", "quote"]
  );
});

test("Readwise gets title, author (or the source) and the link", () => {
  const payload = readwisePayload([
    {
      text: "A line",
      note: null,
      createdAt: new Date("2026-11-01T10:00:00Z"),
      article: { title: "T", link: "https://x.test/a", author: null, feed: { title: "Feed" } },
    } as never,
  ]);
  assert.equal(payload.highlights[0].author, "Feed");
  assert.equal(payload.highlights[0].source_url, "https://x.test/a");
  assert.equal(payload.highlights[0].note, undefined);
});

test("a WAV header says what the samples are", () => {
  const wav = wavFromPcm(new Uint8Array(48_000), 24_000);
  const view = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 24_000);
  assert.equal(view.getUint32(40, true), 48_000);
  assert.equal(wav.length, 48_044);
});

test("natural-voice passages stay under the size the server takes", () => {
  const text = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} says a little.`).join(
    " "
  );
  const parts = narrationParts(text);
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(part.length <= 900);
  assert.equal(parts.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  const long = narrationParts("word ".repeat(400));
  for (const part of long) assert.ok(part.length <= 900);
});
