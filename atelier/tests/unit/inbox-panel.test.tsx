import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorProvider } from "@/components/editor/EditorContext";
import { INBOX_DRAG_TYPE } from "@/components/editor/useInbox";
import { DEFAULT_PANELS } from "@/components/panels/PanelHost";
import { InboxPanel } from "@/components/panels/InboxPanel";
import { InboxApiError, InboxClient, type InboxApi } from "@/lib/inbox/inbox-client";
import type { InboxItem } from "@/lib/inbox/types";
import { makeEditor } from "./helpers/editor";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const row = (id: string, over: Partial<InboxItem>): InboxItem => ({ id, kind: "text", assetId: null, url: null, text: null, title: null, sourceUrl: null, credit: null, createdAt: "2026-11-12T09:00:00.000Z", placedAt: null, ...over });

function mount(rows: InboxItem[]) {
  const t = makeEditor([]);
  const api: InboxApi = {
    create: vi.fn(async () => ({ id: "x" })),
    list: vi.fn(async () => ({ items: rows.filter((r) => !r.placedAt), unplaced: rows.filter((r) => !r.placedAt).length })),
    setPlaced: vi.fn(async (id, placed) => {
      const r = rows.find((x) => x.id === id);
      if (!r) throw new InboxApiError(404, "nf", "nf");
      r.placedAt = placed ? "2026-11-12T10:00:00.000Z" : null;
    }),
    remove: vi.fn(async () => {}),
  };
  const client = new InboxClient({ api, idb: new IDBFactory(), delay: () => new Promise(() => {}) });
  const toast = vi.fn();
  render(
    <EditorProvider handle={t.handle} toast={toast} inbox={client}>
      <InboxPanel />
    </EditorProvider>,
  );
  return { ...t, client, api, rows, toast };
}

beforeEach(() => void 0);

describe("InboxPanel", () => {
  it("is registered as the 'inbox' panel", () => {
    expect(DEFAULT_PANELS.map((d) => d.id)).toContain("inbox");
  });

  it("lists what is waiting: a link by its title, a note by its words, a picture by its name", async () => {
    mount([
      row("1", { kind: "url", url: "https://example.com/p", title: "A fine page" }),
      row("2", { kind: "text", text: "Warm light, low sun" }),
      row("3", { kind: "image", assetId: A, title: "harbour.jpg" }),
    ]);
    expect(await screen.findByText("A fine page")).toBeInTheDocument();
    expect(screen.getByText("Warm light, low sun")).toBeInTheDocument();
    expect(screen.getByText("harbour.jpg")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows user text as plain text, never as markup", async () => {
    mount([row("1", { kind: "text", text: "<img src=x onerror=alert(1)> <b>bold</b>", title: "<script>alert(1)</script>" })]);
    expect(await screen.findByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelectorAll("b, script, img[onerror]")).toHaveLength(0);
  });

  it("'Add to board' places the item at the middle of the view and takes it off the list", async () => {
    const t = mount([row("1", { kind: "text", text: "Remember this" })]);
    await userEvent.click(await screen.findByRole("button", { name: /Add Remember this to board/ }));
    expect(t.doc.all()).toHaveLength(1);
    expect(t.doc.all()[0].type).toBe("text");
    await waitFor(() => expect(t.rows[0].placedAt).not.toBeNull());
    await waitFor(() => expect(screen.queryByText("Remember this")).toBeNull());
  });

  it("each item can be dragged onto the canvas, carrying its id", async () => {
    mount([row("1", { kind: "text", text: "Drag me" })]);
    const item = (await screen.findByText("Drag me")).closest("li")!;
    expect(item).toHaveAttribute("draggable", "true");
    const data: Record<string, string> = {};
    fireEvent.dragStart(item, { dataTransfer: { setData: (t: string, v: string) => (data[t] = v), effectAllowed: "" } });
    expect(data[INBOX_DRAG_TYPE]).toBe("1");
  });

  it("says what to do when the Inbox is empty", async () => {
    mount([]);
    expect(await screen.findByText(/Nothing is waiting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick capture" })).toBeInTheDocument();
  });

  it("links to the Inbox page", async () => {
    mount([]);
    expect(await screen.findByRole("link", { name: /Open the Inbox page/ })).toHaveAttribute("href", "/inbox");
  });

  it("says when items are queued on this device, and when the person has to sign in", async () => {
    const t = mount([]);
    t.api.create = vi.fn(async () => {
      throw new InboxApiError(401, "unauthorized", "x");
    });
    await t.client.add({ kind: "text", assetId: null, url: null, text: "queued", title: null, sourceUrl: null, credit: null });
    expect(await screen.findByText(/Sign in again/)).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("queued")).toBeInTheDocument();
    expect(screen.getByText("Not sent yet")).toBeInTheDocument();
  });
});
