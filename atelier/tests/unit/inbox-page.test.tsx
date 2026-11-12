import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxApp, type InboxServices } from "@/components/inbox/InboxApp";
import { InboxApiError, InboxClient, type InboxApi } from "@/lib/inbox/inbox-client";
import type { InboxItem, NewInboxItem } from "@/lib/inbox/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const push = vi.fn();

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const row = (id: string, over: Partial<InboxItem>): InboxItem => ({ id, kind: "text", assetId: null, url: null, text: null, title: null, sourceUrl: null, credit: null, createdAt: "2026-11-12T09:00:00.000Z", placedAt: null, ...over });

function services(rows: InboxItem[]): InboxServices & { api: InboxApi; rows: InboxItem[]; added: NewInboxItem[] } {
  const added: NewInboxItem[] = [];
  const api: InboxApi = {
    create: vi.fn(async (item) => {
      added.push(item);
      rows.push(row(`new-${rows.length}`, { ...item }));
      return { id: `new-${rows.length}` };
    }),
    list: vi.fn(async (q) => {
      const items = rows.filter((r) => (q.placed === undefined ? true : q.placed ? !!r.placedAt : !r.placedAt));
      return { items, unplaced: rows.filter((r) => !r.placedAt).length };
    }),
    setPlaced: vi.fn(async (id, placed) => {
      const r = rows.find((x) => x.id === id);
      if (!r) throw new InboxApiError(404, "nf", "nf");
      r.placedAt = placed ? "2026-11-12T10:00:00.000Z" : null;
    }),
    remove: vi.fn(async (id) => {
      rows.splice(rows.findIndex((r) => r.id === id), 1);
    }),
  };
  const client = new InboxClient({ api, idb: new IDBFactory(), delay: () => new Promise(() => {}) });
  return { client, uploader: { addAssetOnly: vi.fn(async () => A) }, api, rows, added };
}

/** Puts a share where public/sw-share.js would have left it. */
async function leaveShare(payload: Record<string, unknown>) {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("atelier-share-inbox", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("shares", { autoIncrement: true });
    open.onsuccess = () => {
      const tx = open.result.transaction("shares", "readwrite");
      tx.objectStore("shares").add(payload);
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
const shareCount = () =>
  new Promise<number>((resolve) => {
    const open = indexedDB.open("atelier-share-inbox", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("shares", { autoIncrement: true });
    open.onsuccess = () => {
      const c = open.result.transaction("shares", "readonly").objectStore("shares").count();
      c.onsuccess = () => {
        open.result.close();
        resolve(c.result);
      };
    };
  });

beforeEach(async () => {
  push.mockReset();
  window.history.replaceState(null, "", "/inbox");
  await new Promise<void>((r) => {
    const del = indexedDB.deleteDatabase("atelier-share-inbox");
    del.onsuccess = del.onerror = del.onblocked = () => r();
  });
});

describe("the Inbox page", () => {
  it("lists the waiting items as cards, escaped", async () => {
    const s = services([
      row("1", { kind: "url", url: "https://example.com/p", title: "A fine page", sourceUrl: "https://example.com/p" }),
      row("2", { kind: "text", text: "<img src=x onerror=alert(1)>" }),
    ]);
    render(<InboxApp localOnly={false} services={s} />);
    expect(await screen.findByRole("article", { name: /A fine page, link/ })).toBeInTheDocument();
    expect(screen.getAllByText("<img src=x onerror=alert(1)>").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("img[onerror]")).toHaveLength(0);
    expect(screen.getByText("2 waiting")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open A fine page/ });
    expect(link).toHaveAttribute("href", "https://example.com/p");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("never links a stored address that is not http(s)", async () => {
    const s = services([row("1", { kind: "url", url: "javascript:alert(1)", title: "Sneaky" })]);
    render(<InboxApp localOnly={false} services={s} />);
    await screen.findByRole("article", { name: /Sneaky/ });
    expect(screen.queryByRole("link", { name: /Open/ })).toBeNull();
  });

  it("brings in what the share sheet left, in order, and clears it", async () => {
    await leaveShare({ id: "a", receivedAt: "2026-11-12T08:00:00.000Z", title: "First page", text: "", url: "https://example.com/1", files: [], skipped: 0 });
    await leaveShare({ id: "b", receivedAt: "2026-11-12T08:01:00.000Z", title: "", text: "A thought", url: "", files: [], skipped: 0 });
    window.history.replaceState(null, "", "/inbox?shared=1");
    const s = services([]);
    render(<InboxApp localOnly={false} services={s} />);
    await waitFor(() => expect(s.added).toHaveLength(2));
    expect(s.added.map((a) => a.kind)).toEqual(["url", "text"]);
    expect(await screen.findByText("Added 2 items you shared.")).toBeInTheDocument();
    expect(await shareCount()).toBe(0);
    expect(window.location.search).toBe("");
  });

  it("stores shared pictures as assets and adds Inbox items for them", async () => {
    const file = new File([new Uint8Array(8)], "shared.jpg", { type: "image/jpeg" });
    await leaveShare({ id: "a", receivedAt: "2026-11-12T08:00:00.000Z", title: "", text: "", url: "", files: [{ name: "shared.jpg", type: "image/jpeg", blob: file }], skipped: 0 });
    const s = services([]);
    render(<InboxApp localOnly={false} services={s} />);
    await waitFor(() => expect(s.added).toHaveLength(1));
    expect(s.uploader.addAssetOnly).toHaveBeenCalled();
    expect(s.added[0]).toMatchObject({ kind: "image", assetId: A, title: "shared.jpg" });
  });

  it("says when files in a share were left out", async () => {
    await leaveShare({ id: "a", receivedAt: "2026-11-12T08:00:00.000Z", title: "x", text: "", url: "https://example.com/1", files: [], skipped: 3 });
    const s = services([]);
    render(<InboxApp localOnly={false} services={s} />);
    expect(await screen.findByText(/3 files were left out/)).toBeInTheDocument();
  });

  it("explains a failed share (?shared=error)", async () => {
    window.history.replaceState(null, "", "/inbox?shared=error");
    render(<InboxApp localOnly={false} services={services([])} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong receiving what you shared/);
  });

  it("says that iOS has no share target, and how to capture there", async () => {
    render(<InboxApp localOnly={false} services={services([])} />);
    await userEvent.click(await screen.findByText("How to send things to your Inbox"));
    expect(screen.getByText(/iPhone and iPad: Safari can't share into web apps/)).toBeVisible();
    expect(screen.getByText(/Android: install Atelier/)).toBeVisible();
  });

  it("adds a typed link through the capture box", async () => {
    const s = services([]);
    render(<InboxApp localOnly={false} services={s} />);
    await userEvent.type(await screen.findByLabelText("Link or note"), "https://example.com/new{Enter}");
    await waitFor(() => expect(s.added).toHaveLength(1));
    expect(s.added[0]).toMatchObject({ kind: "url", url: "https://example.com/new" });
  });

  it("deletes selected items after a confirmation", async () => {
    const s = services([row("1", { text: "one" }), row("2", { text: "two" })]);
    render(<InboxApp localOnly={false} services={s} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select one" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Selection" })).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(s.api.remove).toHaveBeenCalledWith("1"));
    expect(s.rows.map((r) => r.id)).toEqual(["2"]);
  });

  it("'Open in board…' picks a board and opens it with the Inbox panel", async () => {
    const s = services([row("1", { text: "one" })]);
    const f = vi.fn(async () => Response.json({ boards: [{ id: "board-9", title: "Spring", updatedAt: "2026-01-01T00:00:00.000Z" }] }));
    vi.stubGlobal("fetch", f);
    render(<InboxApp localOnly={false} services={s} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select one" }));
    await userEvent.click(screen.getByRole("button", { name: "Open in board…" }));
    await userEvent.click(await screen.findByRole("button", { name: "Spring" }));
    expect(push).toHaveBeenCalledWith("/b/board-9?inbox=1");
    vi.unstubAllGlobals();
  });

  it("shows the placed items on their own tab, and can clear them", async () => {
    const s = services([row("1", { text: "waiting" }), row("2", { text: "done", placedAt: "2026-11-12T10:00:00.000Z" })]);
    render(<InboxApp localOnly={false} services={s} />);
    await screen.findByRole("article", { name: /waiting/ });
    await userEvent.click(screen.getByRole("button", { name: "Placed" }));
    expect(await screen.findByRole("article", { name: /done/ })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /waiting/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear placed items" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(s.rows.map((r) => r.id)).toEqual(["1"]));
  });

  it("says it is local when there is no account", async () => {
    render(<InboxApp localOnly services={services([])} />);
    expect(await screen.findByRole("note")).toHaveTextContent("Local mode: nothing is synced");
  });

  it("tells a signed-out person that items are waiting on the device", async () => {
    const s = services([]);
    s.api.create = vi.fn(async () => {
      throw new InboxApiError(401, "unauthorized", "x");
    });
    render(<InboxApp localOnly={false} services={s} />);
    await userEvent.type(await screen.findByLabelText("Link or note"), "a thought{Enter}");
    const alert = await screen.findByText(/You're signed out/);
    expect(alert.closest("p")).toHaveTextContent(/waiting on this device/);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Finbox");
  });
});
