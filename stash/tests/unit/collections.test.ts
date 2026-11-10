import { describe, expect, it } from "vitest";
import {
  arrangeCollections,
  collectionLabel,
  collectionSaves,
  findCollection,
  localCollections,
  synthesisForTag,
  toCollections,
  type AutoCollection,
} from "@/lib/collections";
import type { SaveItem } from "@/lib/data";

const save = (p: Partial<SaveItem>): SaveItem =>
  ({
    id: "x",
    status: "ready",
    spaceId: null,
    platform: "instagram",
    savedAt: "2026-11-01T00:00:00Z",
    creator: null,
    tags: [],
    takeaways: [],
    actions: [],
    archivedAt: null,
    ...p,
  }) as SaveItem;

const ROWS = [
  { kind: "tag", key: "hooks", label: "hooks", n: 4, save_ids: ["a", "b", "c", "d"], latest: "2026-11-09T00:00:00Z" },
  { kind: "creator", key: "@growthwithnora", label: "@growthwithnora", n: 3, save_ids: ["a", "b", "e"], latest: "2026-11-08T00:00:00Z" },
  { kind: "intent", key: "visit", label: "visit", n: 3, save_ids: ["f", "g", "h"], latest: "2026-11-07T00:00:00Z" },
  { kind: "places", key: "places", label: "Places", n: 2, save_ids: ["f", "g"], latest: "2026-11-07T00:00:00Z" },
  { kind: "mystery", key: "x", label: "x", n: 9, save_ids: ["a"], latest: null },
  { kind: "tag", key: "empty", label: "empty", n: 3, save_ids: [], latest: null },
  null,
];

describe("auto-collections: mapping", () => {
  it("maps the RPC rows and drops unknown kinds and empty groups", () => {
    const list = toCollections(ROWS);
    expect(list.map((c) => c.id)).toEqual(["tag:hooks", "creator:@growthwithnora", "intent:visit", "places:places"]);
    expect(list[0]).toEqual({ id: "tag:hooks", kind: "tag", key: "hooks", label: "#hooks", count: 4, saveIds: ["a", "b", "c", "d"], latest: "2026-11-09T00:00:00Z" });
    expect(toCollections(null)).toEqual([]);
    expect(toCollections({})).toEqual([]);
  });

  it("labels each kind in plain words", () => {
    expect(collectionLabel("tag", "hooks")).toBe("#hooks");
    expect(collectionLabel("creator", "chefyasmine")).toBe("@chefyasmine");
    expect(collectionLabel("creator", "@chefyasmine")).toBe("@chefyasmine");
    expect(collectionLabel("intent", "try")).toBe("To try");
    expect(collectionLabel("intent", "visit")).toBe("To visit");
    expect(collectionLabel("places", "places")).toBe("Places");
  });

  it("puts Places first, then by size, without one kind crowding the row", () => {
    const tags: AutoCollection[] = Array.from({ length: 8 }, (_, i) => ({ id: `tag:t${i}`, kind: "tag", key: `t${i}`, label: `#t${i}`, count: 20 - i, saveIds: ["a"], latest: null }));
    const arranged = arrangeCollections([...tags, ...toCollections(ROWS)], 10, 3);
    expect(arranged[0].kind).toBe("places");
    expect(arranged.slice(1, 4).map((c) => c.id)).toEqual(["tag:t0", "tag:t1", "tag:t2"]);
    // The fourth tag (count 17) waits behind the creator and the intent.
    expect(arranged.slice(4, 6).map((c) => c.kind).sort()).toEqual(["creator", "intent"]);
    expect(arranged).toHaveLength(10);
  });
});

describe("auto-collections: filtering the grid", () => {
  const saves = [save({ id: "a" }), save({ id: "b", archivedAt: "t" }), save({ id: "c" }), save({ id: "z" })];

  it("keeps the collection's order and leaves out archived and missing saves", () => {
    const c = toCollections(ROWS)[0];
    expect(collectionSaves(c, saves).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("finds a collection by its URL id", () => {
    const list = toCollections(ROWS);
    expect(findCollection(list, "intent:visit")?.label).toBe("To visit");
    expect(findCollection(list, "tag:nope")).toBeUndefined();
    expect(findCollection(list, null)).toBeUndefined();
  });
});

describe("auto-collections: on the phone, offline", () => {
  it("groups tags and creators of ready, unarchived saves", () => {
    const saves = [
      save({ id: "1", tags: ["Hooks", "ads"], creator: "@Nora", savedAt: "2026-11-03T00:00:00Z" }),
      save({ id: "2", tags: ["hooks "], creator: "@nora", savedAt: "2026-11-05T00:00:00Z" }),
      save({ id: "3", tags: ["hooks"], creator: "@nora", savedAt: "2026-11-04T00:00:00Z" }),
      save({ id: "4", tags: ["hooks"], status: "processing" }),
      save({ id: "5", tags: ["hooks"], archivedAt: "t" }),
    ];
    const list = localCollections(saves, 3);
    expect(list.map((c) => c.id).sort()).toEqual(["creator:@nora", "tag:hooks"]);
    const hooks = list.find((c) => c.id === "tag:hooks")!;
    expect(hooks.saveIds).toEqual(["2", "3", "1"]); // newest first
    expect(hooks.latest).toBe("2026-11-05T00:00:00Z");
    expect(localCollections(saves, 4)).toEqual([]);
  });
});

describe("tag syntheses", () => {
  it("matches a tag case-insensitively, with or without #", () => {
    const list = [{ id: "s1", tag: null }, { id: "s2", tag: "Hooks" }];
    expect(synthesisForTag(list, "hooks")?.id).toBe("s2");
    expect(synthesisForTag(list, "#HOOKS")?.id).toBe("s2");
    expect(synthesisForTag(list, "ads")).toBeUndefined();
  });
});
