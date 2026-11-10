import { describe, expect, it } from "vitest";
import { EMBED_DIMS, localSearch, mergeHits, vectorLiteral, type Hit } from "@/lib/search";
import { formatBytes, parsePipelineStatus, setupDone, setupSteps, usedPercent } from "@/lib/pipeline";
import { cardFromHighlight, highlightText, paragraphs, sameLine } from "@/lib/highlightText";
import { dedupeKey, newLinks, parseLinkList } from "@/lib/importers";
import { posterFileName, posterModel } from "@/lib/wrappedImage";
import { filterSaves } from "@/lib/queue";
import type { SaveItem } from "@/lib/data";

const hit = (saveId: string, snippet: string | null = null, start: number | null = null): Hit => ({ saveId, snippet, start });

describe("search: words first, meaning merged in", () => {
  it("builds a pgvector literal only from 384 finite numbers", () => {
    const v = Array.from({ length: EMBED_DIMS }, (_, i) => i / 1000);
    expect(vectorLiteral(v)).toBe(`[${v.join(",")}]`);
    expect(vectorLiteral(v.slice(1))).toBeNull();
    expect(vectorLiteral([...v.slice(1), Number.NaN])).toBeNull();
    expect(vectorLiteral("[1,2]")).toBeNull();
    expect(vectorLiteral(undefined)).toBeNull();
  });

  it("keeps word matches first and appends meaning-only matches", () => {
    const merged = mergeHits([hit("a", "said it", 3), hit("b")], [hit("c"), hit("b", "close in meaning", 9), hit("a", "other", 1)]);
    expect(merged.map((h) => h.saveId)).toEqual(["a", "b", "c"]);
    expect(merged[0]).toEqual(hit("a", "said it", 3)); // the word match keeps its own snippet
    expect(merged[1]).toEqual(hit("b", "close in meaning", 9)); // a missing snippet is filled in
  });

  it("falls back to the saves on the phone", () => {
    const s = (p: Partial<SaveItem>) => ({ id: "x", spaceId: null, tags: [], takeaways: [], keyIdea: null, aiTitle: null, caption: null, title: null, creator: null, ...p }) as SaveItem;
    const saves = [s({ id: "1", keyIdea: "Crisp chickpeas in a hot pan" }), s({ id: "2", tags: ["dinner"], spaceId: "food" }), s({ id: "3", caption: "Hot takes on pans" })];
    expect(localSearch(saves, "hot pan").map((h) => h.saveId)).toEqual(["1", "3"]);
    expect(localSearch(saves, "DINNER", "food").map((h) => h.saveId)).toEqual(["2"]);
    expect(localSearch(saves, "  ")).toEqual([]);
  });
});

describe("Setup checklist", () => {
  it("parses pipeline_status() defensively", () => {
    expect(parsePipelineStatus({ worker: true, ai: false, is_owner: true, owners_set: true, video_bytes: 1048576, video_cap_bytes: "838860800" })).toEqual({
      worker: true,
      ai: false,
      isOwner: true,
      ownersSet: true,
      videoBytes: 1048576,
      videoCapBytes: 838860800,
    });
    expect(parsePipelineStatus(null)).toBeNull();
    expect(parsePipelineStatus([])).toBeNull();
    expect(parsePipelineStatus({})).toMatchObject({ worker: false, ai: false, videoBytes: 0 });
  });

  it("names the one owner step when only the AI key is missing", () => {
    const steps = setupSteps({ worker: true, ai: false, isOwner: true, ownersSet: true, videoBytes: 0, videoCapBytes: 1 }, true);
    expect(steps.map((s) => [s.id, s.done])).toEqual([["phone", true], ["worker", true], ["owner", true], ["ai", false]]);
    const ai = steps[3];
    expect(ai.who).toBe("owner");
    expect(ai.title).toBe("Add an AI key");
    expect(ai.detail).toMatch(/one step left for the owner/);
    expect(setupDone(steps)).toEqual({ done: 3, total: 4 });
  });

  it("explains a phone that is not an owner, and a worker that is not deployed", () => {
    const steps = setupSteps({ worker: false, ai: true, isOwner: false, ownersSet: false, videoBytes: 0, videoCapBytes: 1 }, true);
    expect(steps[1].title).toMatch(/isn't switched on/);
    expect(steps[2].title).toBe("No owner phone is set yet");
    expect(setupSteps({ worker: true, ai: true, isOwner: false, ownersSet: true, videoBytes: 0, videoCapBytes: 1 }, true)[2].title).toBe("This phone isn't on the owner list");
    expect(setupSteps(null, false)).toHaveLength(1);
    expect(setupSteps(null, false)[0].done).toBe(false);
  });

  it("formats sizes and the space bar", () => {
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(310 * 1024 * 1024)).toBe("310 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
    expect(usedPercent(0, 100)).toBe(0);
    expect(usedPercent(1, 1000)).toBe(2);
    expect(usedPercent(500, 1000)).toBe(50);
    expect(usedPercent(5000, 1000)).toBe(100);
  });
});

describe("highlights", () => {
  it("tidies text to the table's limit", () => {
    expect(highlightText("  Show the\n result   first. ")).toBe("Show the result first.");
    expect(highlightText("x".repeat(3000))).toHaveLength(2000);
  });

  it("knows when a line is already highlighted", () => {
    const h = { text: "Show the result first.", start: 3.2 };
    expect(sameLine(h, { text: " Show the result  first. ", start: 3.2 })).toBe(true);
    expect(sameLine(h, { text: "Show the result first.", start: 7.8 })).toBe(false);
    expect(sameLine({ text: "A paragraph.", start: null }, { text: "A paragraph." })).toBe(true);
  });

  it("makes a recall card: the start of the line asks, the whole line answers", () => {
    const line = "Show the result first, the finished thing, right in the first frame.";
    const card = cardFromHighlight(line, "3-second hooks");
    expect(card.answer).toBe(line);
    expect(card.prompt).toBe("Finish the line you highlighted from “3-second hooks”: “Show the result first, the finished …”");
    expect(cardFromHighlight("Go before 10 am.").prompt).toBe("What was the line you highlighted?");
  });

  it("splits an article into paragraphs to read and highlight", () => {
    expect(paragraphs("First.\n\nSecond one.\n\n\n  \n\nThird.")).toEqual(["First.", "Second one.", "Third."]);
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const parts = paragraphs(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length < 600)).toBe(true);
    expect(paragraphs("")).toEqual([]);
  });
});

describe("sources: YouTube and articles", () => {
  it("imports a pasted list: YouTube, Shorts, articles, reels, de-duplicated", () => {
    const links = parseLinkList(
      [
        "Watch later:",
        "https://youtu.be/dQw4w9WgXcQ?si=abc",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1",
        "- https://www.youtube.com/shorts/aBcDeFgHiJk",
        "an article https://www.example.com/blog/post-1?utm_source=x, and a reel https://www.instagram.com/reels/Cx1AbCdEf/?igsh=1",
        "not a link",
      ].join("\n"),
    );
    expect(links.map((l) => l.url)).toEqual([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/aBcDeFgHiJk",
      "https://www.example.com/blog/post-1",
      "https://www.instagram.com/reel/Cx1AbCdEf/",
    ]);
    expect(links[0].key).toBe("yt:dQw4w9WgXcQ");
  });

  it("reads a YouTube Takeout playlist (bare ids with dates) and bookmarks HTML", () => {
    const csv = "Video ID,Playlist Video Creation Timestamp\ndQw4w9WgXcQ,2024-01-05T10:00:00+00:00\naBcDeFgHiJk,\n";
    const fromCsv = parseLinkList(csv);
    expect(fromCsv.map((l) => l.url)).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=aBcDeFgHiJk"]);
    expect(fromCsv[0].savedAt).toBe("2024-01-05T10:00:00.000Z");
    const html = '<DT><A HREF="https://example.com/a?x=1&amp;y=2" ADD_DATE="1">A</A>';
    expect(parseLinkList(html)[0].url).toBe("https://example.com/a?x=1&y=2");
  });

  it("recognises a YouTube video already saved under another form of its link", () => {
    expect(dedupeKey("https://youtu.be/dQw4w9WgXcQ")).toBe(dedupeKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5"));
    const links = parseLinkList("https://youtu.be/dQw4w9WgXcQ\nhttps://example.com/new");
    expect(newLinks(links, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]).map((l) => l.url)).toEqual(["https://example.com/new"]);
  });

  it("filters the Library by YouTube and by articles", () => {
    const s = (id: string, platform: SaveItem["platform"]) => ({ id, platform, spaceId: null, archivedAt: null }) as SaveItem;
    const saves = [s("1", "youtube"), s("2", "web"), s("3", "tiktok")];
    expect(filterSaves(saves, { space: null, filter: "youtube", inboxId: null }).map((x) => x.id)).toEqual(["1"]);
    expect(filterSaves(saves, { space: null, filter: "web", inboxId: null }).map((x) => x.id)).toEqual(["2"]);
  });
});

describe("Wrapped as a picture", () => {
  const w = {
    month: "2026-10-01",
    saved: 42,
    watched: 21,
    applied: 6,
    kept: 14,
    recalled: 1,
    topSpaces: [
      { id: "a", name: "Marketing", color: "violet" as const, count: 14 },
      { id: "b", name: "Recipes", color: "amber" as const, count: 7 },
      { id: "c", name: "Trip", color: "teal" as const, count: 1 },
      { id: "d", name: "Fourth", color: "green" as const, count: 1 },
    ],
    topCreators: [{ handle: "@nora", count: 6 }, { handle: "@chef", count: 1 }],
  };

  it("works out what the poster says", () => {
    const m = posterModel(w, false);
    expect(m.title).toBe("October 2026");
    expect(posterModel(w, true).title).toBe("October 2026 so far");
    expect(m.stats).toEqual([
      { label: "saved", value: "42", accent: false },
      { label: "watched", value: "21", accent: false },
      { label: "applied", value: "6", accent: true },
    ]);
    expect(m.note).toBe("14 kept · 1 recall answer · 50% watched");
    expect(m.spaces.map((s) => [s.name, s.percent])).toEqual([["Marketing", 100], ["Recipes", 50], ["Trip", 7]]);
    expect(m.creators).toEqual([{ rank: "1", handle: "@nora", count: "6 saves" }, { rank: "2", handle: "@chef", count: "1 save" }]);
    expect(posterModel({ ...w, kept: 0, recalled: 0 }, false).note).toBeNull();
  });

  it("names the file after the month", () => {
    expect(posterFileName("2026-10-01")).toBe("stash-wrapped-2026-10.png");
  });
});
