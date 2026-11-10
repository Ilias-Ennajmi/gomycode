import { describe, expect, it } from "vitest";
import type { SaveItem } from "@/lib/data";
import { reminderTime, mostUsed, nextSpaceColor, type Space } from "@/lib/data";
import { buildQueue, filterSaves, spaceCounts } from "@/lib/queue";
import { cleanUrl, detectPlatform, extractUrl, youtubeId } from "@/lib/links";

const base: SaveItem = {
  id: "x",
  clientId: null,
  sourceUrl: "https://www.instagram.com/reel/abc/",
  platform: "instagram",
  status: "ready",
  spaceId: null,
  thumbPath: null,
  hasVideo: true,
  duration: 30,
  creator: null,
  caption: null,
  title: null,
  error: null,
  savedAt: "2026-10-01T10:00:00Z",
  userNote: null,
  voiceNotePath: null,
  aiTitle: null,
  keyIdea: null,
  takeaways: [],
  actions: [],
  tags: [],
  suggestedSpaceId: null,
  watchedAt: null,
  kept: false,
  archivedAt: null,
  appliedAt: null,
  skipCount: 0,
};
const save = (over: Partial<SaveItem>): SaveItem => ({ ...base, ...over });

const saves = [
  save({ id: "a", spaceId: "mkt" }),
  save({ id: "b", spaceId: "mkt", watchedAt: "t", kept: true }),
  save({ id: "c", spaceId: null, platform: "tiktok" }),
  save({ id: "d", spaceId: "inbox", appliedAt: "t" }),
  save({ id: "e", spaceId: "mkt", archivedAt: "t" }),
  save({ id: "f", spaceId: "mkt", status: "processing" }),
];

describe("links", () => {
  it("finds the link inside shared text", () => {
    expect(extractUrl(null, "Look at this https://www.instagram.com/reel/C1x2/?igsh=abc.")).toBe(
      "https://www.instagram.com/reel/C1x2/?igsh=abc",
    );
    expect(extractUrl("no link here")).toBeNull();
  });

  it("drops tracking parameters", () => {
    expect(cleanUrl("https://www.instagram.com/reel/C1x2/?igsh=abc&utm_source=ig")).toBe(
      "https://www.instagram.com/reel/C1x2/",
    );
    expect(cleanUrl("https://www.youtube.com/watch?v=abc&si=xyz")).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("detects platforms", () => {
    expect(detectPlatform("https://vm.tiktok.com/ZM1/")).toBe("tiktok");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
    expect(detectPlatform("https://example.com")).toBe("web");
  });

  it("is not fooled by a host that only ends in a platform's name", () => {
    for (const url of [
      "https://evilinstagram.com/reel/C1x2/",
      "https://instagram.com.evil.example/reel/C1x2/",
      "https://nottiktok.com/@a/video/7234567890123456789",
      "https://fakeyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://evilyoutu.be/dQw4w9WgXcQ",
      "https://myinstagr.am/p/abc",
    ]) {
      expect(detectPlatform(url)).toBe("web");
    }
    expect(detectPlatform("https://www.instagram.com/reel/C1x2/")).toBe("instagram");
    expect(detectPlatform("https://instagr.am/p/abc")).toBe("instagram");
    expect(detectPlatform("https://m.tiktok.com/v/1.html")).toBe("tiktok");
    expect(detectPlatform("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectPlatform("https://YOUTUBE.com./watch?v=dQw4w9WgXcQ")).toBe("youtube");
  });

  it("reads the video id out of every kind of YouTube link", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("saves one YouTube video as one link, and articles as web", () => {
    expect(cleanUrl("https://youtu.be/dQw4w9WgXcQ?si=abc&t=42")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42");
    expect(cleanUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&index=3")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(cleanUrl("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(detectPlatform("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("youtube");
    expect(detectPlatform("https://www.theguardian.com/food/2026/some-article")).toBe("web");
    expect(cleanUrl("https://example.com/post?utm_campaign=x&fbclid=1&id=7")).toBe("https://example.com/post?id=7");
  });
});

describe("filters", () => {
  it("hides archived and filters by Space", () => {
    expect(filterSaves(saves, { space: "mkt", filter: "all", inboxId: "inbox" }).map((s) => s.id)).toEqual(["a", "b", "f"]);
  });

  it("Inbox also holds saves the AI hasn't filed yet", () => {
    expect(filterSaves(saves, { space: "inbox", filter: "all", inboxId: "inbox" }).map((s) => s.id)).toEqual(["c", "d"]);
  });

  it("filters by state and platform", () => {
    const all = { space: null, inboxId: "inbox" };
    expect(filterSaves(saves, { ...all, filter: "unwatched" }).map((s) => s.id)).toEqual(["a", "c", "d", "f"]);
    expect(filterSaves(saves, { ...all, filter: "kept" }).map((s) => s.id)).toEqual(["b"]);
    expect(filterSaves(saves, { ...all, filter: "applied" }).map((s) => s.id)).toEqual(["d"]);
    expect(filterSaves(saves, { ...all, filter: "archived" }).map((s) => s.id)).toEqual(["e"]);
    expect(filterSaves(saves, { ...all, filter: "tiktok" }).map((s) => s.id)).toEqual(["c"]);
  });

  it("counts saves per Space, unfiled ones in Inbox", () => {
    expect(spaceCounts(saves, "inbox")).toEqual({ mkt: 3, inbox: 2 });
  });
});

describe("play queue", () => {
  it("keeps search order and skips saves still processing", () => {
    expect(buildQueue(saves, { ids: "d,f,a" }, "inbox").map((s) => s.id)).toEqual(["d", "a"]);
  });

  it("starts at one save and continues with its Space's unwatched saves", () => {
    expect(buildQueue(saves, { id: "b" }, "inbox").map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("plays a Space with a filter", () => {
    expect(buildQueue(saves, { space: "mkt", filter: "all" }, "inbox").map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("today = newest unwatched, five at most", () => {
    const many = Array.from({ length: 8 }, (_, i) => save({ id: `n${i}` }));
    expect(buildQueue(many, {}, "inbox")).toHaveLength(5);
    expect(buildQueue(saves, {}, "inbox").map((s) => s.id)).toEqual(["a", "c", "d"]);
  });
});

describe("spaces and reminders", () => {
  const spaces: Space[] = [
    { id: "inbox", name: "Inbox", kind: "inbox", color: "inbox", sortOrder: -1, description: null, dueDate: null },
    { id: "mkt", name: "Marketing", kind: "topic", color: "violet", sortOrder: 0, description: null, dueDate: null },
    { id: "food", name: "Food", kind: "topic", color: "amber", sortOrder: 1, description: null, dueDate: null },
  ];

  it("orders Spaces by use and never offers Inbox", () => {
    expect(mostUsed(spaces, [{ spaceId: "food" }, { spaceId: "food" }, { spaceId: "mkt" }]).map((s) => s.id)).toEqual([
      "food",
      "mkt",
    ]);
  });

  it("gives a new Space an unused colour", () => {
    expect(nextSpaceColor(spaces)).toBe("teal");
  });

  it("tonight is 8 pm, or tomorrow 8 pm when it's later", () => {
    const morning = new Date(2026, 9, 7, 9, 0);
    expect(new Date(reminderTime("tonight", undefined, morning)!).getHours()).toBe(20);
    const late = new Date(2026, 9, 7, 21, 0);
    expect(new Date(reminderTime("tonight", undefined, late)!).getDate()).toBe(8);
  });

  it("this weekend is Saturday 10 am", () => {
    const wed = new Date(2026, 9, 7, 9, 0); // Wednesday
    const r = new Date(reminderTime("weekend", undefined, wed)!);
    expect(r.getDay()).toBe(6);
    expect(r.getHours()).toBe(10);
  });

  it("nearby has no time", () => {
    expect(reminderTime("nearby")).toBeNull();
  });
});
