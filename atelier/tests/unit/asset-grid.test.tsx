import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetGrid } from "@/components/library/AssetGrid";
import { DuplicateGroups, unusedCopies } from "@/components/library/DuplicateGroups";
import type { LibraryAsset } from "@/lib/assets/library-types";

const id = (n: number) => `6f1c2d3e-4b5a-4c6d-8e7f-${String(n).padStart(12, "0")}`;

function asset(n: number, over: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id: id(n), kind: "image", width: 4000, height: 3000, bytes: 2_500_000, variants: ["w256", "w1024"], palette: null, phash: null,
    title: `Picture ${n}`, provenance: null, analysisVersion: 1, usedIn: 0, boards: [], createdAt: "2026-01-01T00:00:00.000Z", similarTo: [], ...over,
  };
}
const boards = (...titles: string[]) => titles.map((t, i) => ({ id: `b${i}`, title: t }));

function setup(assets: LibraryAsset[], over: Partial<Parameters<typeof AssetGrid>[0]> = {}) {
  const props = {
    assets,
    thumbUrl: () => "blob:thumb",
    selected: new Set<string>(),
    onToggleSelect: vi.fn(),
    onDelete: vi.fn(),
    onAddToBoard: vi.fn(),
    onShowDuplicates: vi.fn(),
    boardHref: (b: string) => `/b/${b}`,
    ...over,
  };
  render(<AssetGrid {...props} />);
  return props;
}

describe("AssetGrid", () => {
  it("gives every card an accessible name with what it is", () => {
    setup([asset(1, { title: "Harbour" }), asset(2, { title: "", kind: "gif" })]);
    expect(screen.getByRole("article", { name: /Harbour/ })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    // an untitled asset still has a name
    expect(screen.getByRole("article", { name: /Untitled gif/ })).toBeInTheDocument();
  });

  it("shows the thumbnail as a decorative image next to the card's text name", () => {
    setup([asset(1)]);
    const img = document.querySelector("img")!;
    expect(img).toHaveAttribute("src", "blob:thumb");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("writes how many boards use the asset as text", () => {
    setup([asset(1, { usedIn: 3, boards: boards("A", "B", "C") }), asset(2, { usedIn: 1, boards: boards("Only") }), asset(3)]);
    expect(screen.getByText("Used in 3 boards")).toBeInTheDocument();
    expect(screen.getByText("Used in 1 board")).toBeInTheDocument();
    expect(screen.getByText("Not used in any board")).toBeInTheDocument();
  });

  it("lists the boards, as links, when asked", async () => {
    setup([asset(1, { usedIn: 3, boards: boards("Harbour", "Pier", "Dawn") })]);
    const toggle = screen.getByRole("button", { name: /Used in 3 boards/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Harbour", "Pier", "Dawn"]);
    expect(links[0]).toHaveAttribute("href", "/b/b0");
  });

  it("says when more boards use it than are listed", async () => {
    setup([asset(1, { usedIn: 7, boards: boards("1", "2", "3", "4", "5") })]);
    await userEvent.click(screen.getByRole("button", { name: /Used in 7 boards/ }));
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
  });

  it("disables Delete with an explanation while the asset is in use", async () => {
    const p = setup([asset(1, { usedIn: 3, boards: boards("A", "B", "C") })]);
    const del = screen.getByRole("button", { name: /Delete/ });
    expect(del).toHaveAttribute("aria-disabled", "true");
    const why = document.getElementById(del.getAttribute("aria-describedby")!)!;
    expect(why).toHaveTextContent(/used in 3 boards/i);
    await userEvent.click(del);
    expect(p.onDelete).not.toHaveBeenCalled();
  });

  it("enables Delete for an unused asset", async () => {
    const a = asset(1);
    const p = setup([a]);
    const del = screen.getByRole("button", { name: /Delete/ });
    expect(del).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(del);
    expect(p.onDelete).toHaveBeenCalledWith(a);
  });

  it("badges possible duplicates and offers their group", async () => {
    const a = asset(1, { similarTo: [id(2)] });
    const p = setup([a, asset(2, { similarTo: [id(1)] }), asset(3)]);
    expect(screen.getAllByText("Possible duplicate")).toHaveLength(2);
    await userEvent.click(within(screen.getAllByRole("article")[0]).getByRole("button", { name: /Possible duplicate/ }));
    expect(p.onShowDuplicates).toHaveBeenCalledWith(a);
  });

  it("selects with a checkbox named after the asset", async () => {
    const p = setup([asset(1, { title: "Harbour" })]);
    const box = screen.getByRole("checkbox", { name: "Select Harbour" });
    await userEvent.click(box);
    expect(p.onToggleSelect).toHaveBeenCalledWith(id(1));
  });

  it("reflects the selection", () => {
    setup([asset(1, { title: "Harbour" })], { selected: new Set([id(1)]) });
    expect(screen.getByRole("checkbox", { name: "Select Harbour" })).toBeChecked();
  });

  it("offers Add to board", async () => {
    const a = asset(1);
    const p = setup([a]);
    await userEvent.click(screen.getByRole("button", { name: /Add to board/ }));
    expect(p.onAddToBoard).toHaveBeenCalledWith(a);
  });

  it("renders a title as plain text, never as markup", () => {
    setup([asset(1, { title: "<b>bold</b><img src=x onerror=alert(1)>" })]);
    expect(screen.getAllByText("<b>bold</b><img src=x onerror=alert(1)>").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("b")).toHaveLength(0);
    expect(document.querySelectorAll("img[onerror]")).toHaveLength(0);
  });

  it("shows a paper tile, not a broken image, when no thumbnail is known", () => {
    setup([asset(1)], { thumbUrl: () => null });
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("unusedCopies", () => {
  it("never selects a member that a board uses", () => {
    const a = asset(1, { usedIn: 2 });
    const b = asset(2);
    const c = asset(3, { usedIn: 1 });
    expect(unusedCopies([a, b, c]).map((x) => x.id)).toEqual([b.id]);
  });

  it("keeps the best copy when none is in use (the biggest picture, then the oldest)", () => {
    const small = asset(1, { width: 800, height: 600 });
    const big = asset(2, { width: 4000, height: 3000, createdAt: "2026-02-01T00:00:00.000Z" });
    const bigOlder = asset(3, { width: 4000, height: 3000, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(unusedCopies([small, big, bigOlder]).map((x) => x.id).sort()).toEqual([small.id, big.id].sort());
  });

  it("selects nothing when every member is in use or the group is a single asset", () => {
    expect(unusedCopies([asset(1, { usedIn: 1 }), asset(2, { usedIn: 1 })])).toEqual([]);
    expect(unusedCopies([asset(1)])).toEqual([]);
  });
});

describe("DuplicateGroups", () => {
  const group = (ids: number[], dist = 0) => ({ assetIds: ids.map(id), dist });

  it("shows each group side by side with sizes and where members are used", () => {
    const assets = [asset(1, { usedIn: 2, boards: boards("A", "B"), bytes: 3_000_000 }), asset(2, { bytes: 1_000_000 })];
    render(<DuplicateGroups groups={[group([1, 2], 3)]} assets={assets} thumbUrl={() => "blob:t"} onDeleteUnused={vi.fn()} />);
    const g = screen.getByRole("group", { name: /Duplicate group 1/ });
    expect(within(g).getAllByRole("listitem")).toHaveLength(2);
    expect(within(g).getByText("Used in 2 boards")).toBeInTheDocument();
    expect(within(g).getByText("Not used in any board")).toBeInTheDocument();
    expect(within(g).getByText(/2\.9 MB|3\.0 MB|2\.86 MB/)).toBeInTheDocument();
  });

  it("deletes only the unused copies, and says how many", async () => {
    const onDeleteUnused = vi.fn();
    const assets = [asset(1, { usedIn: 1, boards: boards("A") }), asset(2), asset(3)];
    render(<DuplicateGroups groups={[group([1, 2, 3])]} assets={assets} thumbUrl={() => null} onDeleteUnused={onDeleteUnused} />);
    const button = screen.getByRole("button", { name: "Delete 2 unused copies" });
    await userEvent.click(button);
    expect(onDeleteUnused).toHaveBeenCalledTimes(1);
    expect(onDeleteUnused.mock.calls[0][0].map((a: LibraryAsset) => a.id).sort()).toEqual([id(2), id(3)]);
  });

  it("offers nothing to delete when every copy is in use", () => {
    const assets = [asset(1, { usedIn: 1, boards: boards("A") }), asset(2, { usedIn: 1, boards: boards("B") })];
    render(<DuplicateGroups groups={[group([1, 2])]} assets={assets} thumbUrl={() => null} onDeleteUnused={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(screen.getByText(/Every copy is on a board/)).toBeInTheDocument();
  });

  it("says so when there are no duplicates", () => {
    render(<DuplicateGroups groups={[]} assets={[]} thumbUrl={() => null} onDeleteUnused={vi.fn()} />);
    expect(screen.getByText(/No duplicates found/)).toBeInTheDocument();
  });
});
