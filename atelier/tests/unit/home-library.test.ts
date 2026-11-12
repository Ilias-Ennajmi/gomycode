import { describe, expect, it } from "vitest";
import type { BoardList, BoardSummary, Folder } from "@/lib/sync/board-list-cache";
import {
  buildFolderTree,
  daysLeftInTrash,
  filterBoards,
  folderPath,
  relativeTime,
  sortRecent,
  viewBoards,
} from "@/components/home/library";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const DAY = 86_400_000;
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();

const b = (id: string, title: string, over: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  title,
  folderId: null,
  starred: false,
  updatedAt: iso(3),
  lastOpenedAt: null,
  deletedAt: null,
  preview: [],
  ...over,
});

describe("filterBoards", () => {
  const boards = [b("1", "Brand Refresh"), b("2", "Spring campaign"), b("3", "ÉTÉ moodboard"), b("4", "100% (draft) [v2]")];

  it("is a case-insensitive substring match on the title", () => {
    expect(filterBoards(boards, "brand").map((x) => x.id)).toEqual(["1"]);
    expect(filterBoards(boards, "CAMPAIGN").map((x) => x.id)).toEqual(["2"]);
    expect(filterBoards(boards, "ref").map((x) => x.id)).toEqual(["1"]);
    expect(filterBoards(boards, "été").map((x) => x.id)).toEqual(["3"]);
  });

  it("treats the query as text, never as a pattern", () => {
    expect(filterBoards(boards, "(draft) [v2]").map((x) => x.id)).toEqual(["4"]);
    expect(filterBoards(boards, ".*")).toEqual([]);
  });

  it("returns everything for an empty or blank query", () => {
    expect(filterBoards(boards, "")).toHaveLength(4);
    expect(filterBoards(boards, "   ")).toHaveLength(4);
  });

  it("ignores surrounding spaces in the query", () => {
    expect(filterBoards(boards, "  spring ").map((x) => x.id)).toEqual(["2"]);
  });
});

describe("sortRecent", () => {
  it("orders by last opened, falling back to last edited, newest first, without mutating", () => {
    const list = [
      b("old", "a", { updatedAt: iso(30) }),
      b("opened", "b", { lastOpenedAt: iso(1), updatedAt: iso(50) }),
      b("edited", "c", { updatedAt: iso(2) }),
    ];
    const copy = [...list];
    expect(sortRecent(list).map((x) => x.id)).toEqual(["opened", "edited", "old"]);
    expect(list).toEqual(copy);
  });
});

describe("viewBoards", () => {
  const folders: Folder[] = [
    { id: "f1", name: "Clients", parentId: null, sort: 0 },
    { id: "f2", name: "Acme", parentId: "f1", sort: 0 },
  ];
  const list: BoardList = {
    boards: [
      b("r", "Recent one", { lastOpenedAt: iso(0.1) }),
      b("s", "Starred one", { starred: true, updatedAt: iso(10) }),
      b("c", "In clients", { folderId: "f1", updatedAt: iso(11) }),
      b("a", "In acme", { folderId: "f2", updatedAt: iso(12) }),
    ],
    trash: [b("t", "Trashed", { deletedAt: iso(1) })],
    folders,
  };

  it("recent shows every live board, newest first", () => {
    expect(viewBoards(list, { kind: "recent" }, "").map((x) => x.id)).toEqual(["r", "s", "c", "a"]);
  });
  it("starred shows starred boards only", () => {
    expect(viewBoards(list, { kind: "starred" }, "").map((x) => x.id)).toEqual(["s"]);
  });
  it("a folder shows its own boards, not its sub-folders'", () => {
    expect(viewBoards(list, { kind: "folder", id: "f1" }, "").map((x) => x.id)).toEqual(["c"]);
    expect(viewBoards(list, { kind: "folder", id: "f2" }, "").map((x) => x.id)).toEqual(["a"]);
  });
  it("trash shows trashed boards", () => {
    expect(viewBoards(list, { kind: "trash" }, "").map((x) => x.id)).toEqual(["t"]);
  });
  it("a search looks through every live board, whatever the view, but not the trash", () => {
    expect(viewBoards(list, { kind: "starred" }, "in ").map((x) => x.id)).toEqual(["c", "a"]);
    expect(viewBoards(list, { kind: "recent" }, "trashed")).toEqual([]);
  });
  it("a search inside the trash searches the trash", () => {
    expect(viewBoards(list, { kind: "trash" }, "trash").map((x) => x.id)).toEqual(["t"]);
    expect(viewBoards(list, { kind: "trash" }, "recent")).toEqual([]);
  });
});

describe("folders", () => {
  const folders: Folder[] = [
    { id: "b", name: "Beta", parentId: null, sort: 1 },
    { id: "a", name: "Alpha", parentId: null, sort: 1 },
    { id: "c", name: "Child", parentId: "a", sort: 0 },
    { id: "g", name: "Grandchild", parentId: "c", sort: 0 },
    { id: "orphan", name: "Orphan", parentId: "missing", sort: 0 },
  ];

  it("buildFolderTree nests, sorts by sort then name, and treats missing parents as top level", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.folder.name)).toEqual(["Orphan", "Alpha", "Beta"]);
    const alpha = tree.find((n) => n.folder.id === "a")!;
    expect(alpha.children.map((n) => n.folder.name)).toEqual(["Child"]);
    expect(alpha.children[0].children[0].folder.name).toBe("Grandchild");
    expect(alpha.children[0].children[0].depth).toBe(2);
  });

  it("survives a cycle in bad data", () => {
    const cyc: Folder[] = [
      { id: "x", name: "X", parentId: "y", sort: 0 },
      { id: "y", name: "Y", parentId: "x", sort: 0 },
    ];
    expect(() => buildFolderTree(cyc)).not.toThrow();
  });

  it("folderPath joins names from the top", () => {
    expect(folderPath(folders, "g")).toBe("Alpha / Child / Grandchild");
    expect(folderPath(folders, "nope")).toBe("");
  });
});

describe("trash and time labels", () => {
  it("daysLeftInTrash counts whole days remaining, never below zero", () => {
    expect(daysLeftInTrash(iso(0), NOW)).toBe(30);
    expect(daysLeftInTrash(iso(5.5), NOW)).toBe(25);
    expect(daysLeftInTrash(iso(29.5), NOW)).toBe(1);
    expect(daysLeftInTrash(iso(40), NOW)).toBe(0);
  });

  it("relativeTime reads like speech", () => {
    expect(relativeTime(iso(0), NOW)).toBe("just now");
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5 minutes ago");
    expect(relativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3 hours ago");
    expect(relativeTime(iso(1), NOW)).toBe("yesterday");
    expect(relativeTime(iso(4), NOW)).toBe("4 days ago");
    expect(relativeTime(iso(60), NOW)).toMatch(/2 months ago|last month/);
    expect(relativeTime("garbage", NOW)).toBe("");
  });
});
