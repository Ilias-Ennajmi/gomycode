import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { LibraryApp } from "@/components/library/LibraryApp";
import { LibraryLoadError, type LibraryApi } from "@/lib/assets/library-client";
import type { DuplicateGroup, LibraryAsset } from "@/lib/assets/library-types";
import { createLocalInboxApi } from "@/lib/inbox/inbox-client";

const id = (n: number) => `6f1c2d3e-4b5a-4c6d-8e7f-${String(n).padStart(12, "0")}`;
const asset = (n: number, over: Partial<LibraryAsset> = {}): LibraryAsset => ({
  id: id(n), kind: "image", width: 4000, height: 3000, bytes: 2_000_000, variants: ["w256"], palette: null, phash: null, title: `Picture ${n}`, provenance: null,
  analysisVersion: 1, usedIn: 0, boards: [], createdAt: "2026-01-01T00:00:00.000Z", similarTo: [], ...over,
});

function fakeApi(assets: LibraryAsset[], groups: DuplicateGroup[] = []) {
  const api = {
    list: vi.fn(async () => assets.map((a) => ({ ...a }))),
    duplicates: vi.fn(async () => groups),
    remove: vi.fn(async (assetId: string) => {
      const i = assets.findIndex((a) => a.id === assetId);
      if (i >= 0) assets.splice(i, 1);
      return { ok: true as const };
    }),
  } satisfies LibraryApi;
  return api;
}

beforeEach(() => {
  push.mockReset();
  indexedDB.deleteDatabase("atelier-inbox-local");
});

describe("LibraryApp", () => {
  it("lists the assets with their usage and asks the API for the chosen filter and sort", async () => {
    const api = fakeApi([asset(1, { usedIn: 2, boards: [{ id: "b1", title: "Harbour" }, { id: "b2", title: "Pier" }] }), asset(2)]);
    render(<LibraryApp localOnly={false} api={api} />);
    expect(await screen.findByText("Used in 2 boards")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "used");
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ query: "", kind: null, sort: "used", unused: false }));
    await userEvent.click(screen.getByRole("button", { name: "Unused" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ unused: true })));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "gif");
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "gif" })));
  });

  it("searches after a short pause", async () => {
    const api = fakeApi([asset(1)]);
    render(<LibraryApp localOnly={false} api={api} />);
    await screen.findByRole("article");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search the library" }), "harbour");
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ query: "harbour" })));
  });

  it("deletes one unused picture after a confirmation, and not while it is in use", async () => {
    const api = fakeApi([asset(1, { usedIn: 1, boards: [{ id: "b", title: "B" }] }), asset(2, { title: "Spare" })]);
    render(<LibraryApp localOnly={false} api={api} />);
    await screen.findByRole("article", { name: /Spare/ });
    await userEvent.click(within(screen.getByRole("article", { name: /Picture 1/ })).getByRole("button", { name: /Delete/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await userEvent.click(within(screen.getByRole("article", { name: /Spare/ })).getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete “Spare”?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(id(2)));
    await waitFor(() => expect(screen.queryByRole("article", { name: /Spare/ })).toBeNull());
    expect(screen.getByRole("article", { name: /Picture 1/ })).toBeInTheDocument();
  });

  it("multi-delete keeps the pictures that boards use, and says so", async () => {
    const api = fakeApi([asset(1, { usedIn: 1, boards: [{ id: "b", title: "B" }] }), asset(2), asset(3)]);
    render(<LibraryApp localOnly={false} api={api} />);
    await screen.findAllByRole("article");
    for (const n of [1, 2, 3]) await userEvent.click(screen.getByRole("checkbox", { name: `Select Picture ${n}` }));
    await userEvent.click(within(screen.getByRole("region", { name: "Selection" })).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete 2 pictures?");
    expect(dialog).toHaveTextContent("1 picture is on boards and will be kept");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(2));
    expect(api.remove).not.toHaveBeenCalledWith(id(1));
  });

  it("shows the error and a retry when the server cannot be reached", async () => {
    const api = fakeApi([]);
    api.list.mockRejectedValueOnce(new LibraryLoadError("offline"));
    render(<LibraryApp localOnly={false} api={api} />);
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
  });

  it("shows duplicate groups and deletes only the unused copies", async () => {
    const assets = [asset(1, { usedIn: 1, boards: [{ id: "b", title: "B" }], similarTo: [id(2)] }), asset(2, { similarTo: [id(1)] })];
    const api = fakeApi(assets, [{ assetIds: [id(1), id(2)], dist: 0 }]);
    render(<LibraryApp localOnly={false} api={api} />);
    await screen.findAllByRole("article");
    await userEvent.click(screen.getByRole("button", { name: "Possible duplicates" }));
    const group = await screen.findByRole("group", { name: /Duplicate group 1/ });
    await userEvent.click(within(group).getByRole("button", { name: "Delete 1 unused copy" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(id(2)));
    expect(api.remove).not.toHaveBeenCalledWith(id(1));
  });

  it("Add to board opens the board picker and goes to the board with the asset in the address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ boards: [{ id: "board-7", title: "Spring", updatedAt: "2026-01-01T00:00:00.000Z" }] })));
    const api = fakeApi([asset(1)]);
    render(<LibraryApp localOnly={false} api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Add to board" }));
    await userEvent.click(await screen.findByRole("button", { name: "Spring" }));
    expect(push).toHaveBeenCalledWith(`/b/board-7?add=${id(1)}&ak=image&aw=4000&ah=3000`);
    vi.unstubAllGlobals();
  });

  it("Send to Inbox puts the picture in the Inbox (here: this device's, in local-only mode)", async () => {
    const api = fakeApi([asset(1, { title: "Harbour", provenance: { sourceUrl: "https://example.com/h", credit: "Jane", licence: "", capturedAt: null } })]);
    render(<LibraryApp localOnly api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Send to Inbox" }));
    expect(await screen.findByText("Sent “Harbour” to your Inbox.")).toBeInTheDocument();
    await waitFor(async () => {
      const { items } = await createLocalInboxApi().list({});
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: "image", assetId: id(1), title: "Harbour", sourceUrl: "https://example.com/h", credit: "Jane" });
    });
  });

  it("says it is local when there is no account", async () => {
    render(<LibraryApp localOnly api={fakeApi([])} />);
    expect(await screen.findByRole("note")).toHaveTextContent("Local mode: nothing is synced");
  });
});
