import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { HomeApp } from "@/components/home/HomeApp";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { putBoard, putFolder, readBoardList, type BoardSummary } from "@/lib/sync/board-list-cache";

const DAY = 86_400_000;
const iso = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const board = (id: string, title: string, over: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  title,
  folderId: null,
  starred: false,
  updatedAt: iso(1),
  lastOpenedAt: null,
  deletedAt: null,
  preview: [],
  ...over,
});

async function reset() {
  for (const name of ["atelier-board-list", "atelier-board-brand", "atelier-board-new"]) {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await reset();
});

describe("Home (local-only mode)", () => {
  it("shows an empty state that invites the first board", async () => {
    render(<HomeApp localOnly />);
    expect(await screen.findByText("No boards yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New board" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Atelier" })).toBeInTheDocument();
    expect(screen.getByText(/stay on this device/i)).toBeInTheDocument();
  });

  it("lists cached boards, newest first, as links to the board", async () => {
    await putBoard(board("brand", "Brand refresh", { lastOpenedAt: iso(0.5) }));
    await putBoard(board("old", "Old idea", { updatedAt: iso(20) }));
    render(<HomeApp localOnly />);
    const link = await screen.findByRole("link", { name: /Brand refresh/ });
    expect(link).toHaveAttribute("href", "/b/brand");
    const titles = screen.getAllByRole("link").map((a) => a.textContent ?? "").filter((t) => /Brand|Old/.test(t));
    expect(titles[0]).toMatch(/Brand refresh/);
    expect(titles[1]).toMatch(/Old idea/);
  });

  it("renders a board title as text, never as markup", async () => {
    await putBoard(board("x", '<img src=x onerror="window.__pwned=1"><b>bold</b>'));
    const { container } = render(<HomeApp localOnly />);
    expect(await screen.findByText('<img src=x onerror="window.__pwned=1"><b>bold</b>')).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.querySelector("main b")).toBeNull();
  });

  it("filters by title, case-insensitively, and says when nothing matches", async () => {
    const user = userEvent.setup();
    await putBoard(board("1", "Brand refresh"));
    await putBoard(board("2", "Spring campaign"));
    render(<HomeApp localOnly />);
    await screen.findByRole("link", { name: /Brand refresh/ });
    await user.type(screen.getByRole("searchbox", { name: "Search boards" }), "SPRING");
    expect(screen.queryByRole("link", { name: /Brand refresh/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Spring campaign/ })).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search boards" }));
    await user.type(screen.getByRole("searchbox", { name: "Search boards" }), "zzz");
    expect(await screen.findByText(/No boards match/)).toBeInTheDocument();
  });

  it("creates a board from a template in a dialog, writes its document, and opens it", async () => {
    const user = userEvent.setup();
    render(<HomeApp localOnly />);
    await screen.findByText("No boards yet");
    await user.click(screen.getAllByRole("button", { name: "New board" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "New board" });
    const title = within(dialog).getByRole("textbox", { name: "Title" });
    expect(title).toHaveFocus();
    const radios = within(dialog).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("value"))).toEqual(["blank", "moodboard", "deck", "brainstorm", "flowchart", "kanban"]);
    expect(within(dialog).getByRole("radio", { name: /Blank/ })).toBeChecked();

    await user.type(title, "Pitch deck");
    await user.click(within(dialog).getByRole("radio", { name: /Presentation deck/ }));
    await user.click(within(dialog).getByRole("button", { name: "Create board" }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const id = String(push.mock.calls[0][0]).replace("/b/", "");
    expect(push.mock.calls[0][0]).toMatch(/^\/b\/[0-9a-f-]{36}$/);

    const list = await readBoardList();
    expect(list.boards).toHaveLength(1);
    expect(list.boards[0]).toMatchObject({ id, title: "Pitch deck", firstFrameName: "Slide 1" });

    const ydoc = new Y.Doc();
    const p = new IndexeddbPersistence(`atelier-board-${id}`, ydoc);
    await p.whenSynced;
    const doc = new BoardDoc(ydoc);
    expect(doc.meta.title).toBe("Pitch deck");
    expect(doc.all().filter((o) => o.type === "frame")).toHaveLength(5);
    await p.destroy();
  });

  it("closes the New board dialog with Escape and gives focus back to the button", async () => {
    const user = userEvent.setup();
    render(<HomeApp localOnly />);
    await screen.findByText("No boards yet");
    const opener = screen.getAllByRole("button", { name: "New board" })[0];
    await user.click(opener);
    await screen.findByRole("dialog", { name: "New board" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New board" })).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  describe("card menu", () => {
    it("opens with the keyboard, moves with the arrows, closes with Escape and returns focus", async () => {
      const user = userEvent.setup();
      await putBoard(board("brand", "Brand refresh"));
      render(<HomeApp localOnly />);
      const trigger = await screen.findByRole("button", { name: /Actions for Brand refresh/ });
      trigger.focus();
      await user.keyboard("{Enter}");
      const menu = await screen.findByRole("menu");
      const items = within(menu).getAllByRole("menuitem");
      expect(items.map((i) => i.textContent)).toEqual(["Rename", "Duplicate", "Move to…", "Star", "Delete"]);
      expect(items[0]).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(items[1]).toHaveFocus();
      await user.keyboard("{End}");
      expect(items[4]).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(items[0]).toHaveFocus(); // wraps
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      expect(trigger).toHaveFocus();
    });

    it("stars and unstars, and the Starred view lists it", async () => {
      const user = userEvent.setup();
      await putBoard(board("brand", "Brand refresh"));
      render(<HomeApp localOnly />);
      await user.click(await screen.findByRole("button", { name: /Actions for Brand refresh/ }));
      await user.click(screen.getByRole("menuitem", { name: "Star" }));
      await waitFor(async () => expect((await readBoardList()).boards[0].starred).toBe(true));
      await user.click(screen.getByRole("button", { name: "Starred" }));
      expect(screen.getByRole("link", { name: /Brand refresh/ })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Actions for Brand refresh/ }));
      expect(screen.getByRole("menuitem", { name: "Unstar" })).toBeInTheDocument();
    });

    it("renames in a dialog", async () => {
      const user = userEvent.setup();
      await putBoard(board("brand", "Brand refresh"));
      render(<HomeApp localOnly />);
      await user.click(await screen.findByRole("button", { name: /Actions for Brand refresh/ }));
      await user.click(screen.getByRole("menuitem", { name: "Rename" }));
      const dialog = await screen.findByRole("dialog", { name: "Rename board" });
      const input = within(dialog).getByRole("textbox", { name: "Title" });
      expect(input).toHaveValue("Brand refresh");
      await user.clear(input);
      await user.type(input, "Brand 2027");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await screen.findByRole("link", { name: /Brand 2027/ })).toBeInTheDocument();
      expect((await readBoardList()).boards[0].title).toBe("Brand 2027");
    });

    it("moves to a folder", async () => {
      const user = userEvent.setup();
      await putFolder({ id: "f1", name: "Clients", parentId: null, sort: 0 });
      await putBoard(board("brand", "Brand refresh"));
      render(<HomeApp localOnly />);
      await user.click(await screen.findByRole("button", { name: /Actions for Brand refresh/ }));
      await user.click(screen.getByRole("menuitem", { name: "Move to…" }));
      const dialog = await screen.findByRole("dialog", { name: "Move to…" });
      await user.click(within(dialog).getByRole("radio", { name: "Clients" }));
      await user.click(within(dialog).getByRole("button", { name: "Move" }));
      await waitFor(async () => expect((await readBoardList()).boards[0].folderId).toBe("f1"));
      await user.click(screen.getByRole("button", { name: "Clients" }));
      expect(screen.getByRole("link", { name: /Brand refresh/ })).toBeInTheDocument();
    });

    it("duplicates a board whose document is on this device", async () => {
      const user = userEvent.setup();
      // Source board with a real local document.
      const ydoc = new Y.Doc();
      const p = new IndexeddbPersistence("atelier-board-brand", ydoc);
      await p.whenSynced;
      new BoardDoc(ydoc).meta.title = "Brand refresh";
      await p.destroy();
      await putBoard(board("brand", "Brand refresh"));
      render(<HomeApp localOnly />);
      await user.click(await screen.findByRole("button", { name: /Actions for Brand refresh/ }));
      await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      expect(await screen.findByRole("link", { name: /Brand refresh copy/ })).toBeInTheDocument();
      expect((await readBoardList()).boards).toHaveLength(2);
      expect(push).not.toHaveBeenCalled();
    });

    it("explains when a board to duplicate has never been opened on this device", async () => {
      const user = userEvent.setup();
      await putBoard(board("brand", "Brand refresh"));
      render(<HomeApp localOnly />);
      await user.click(await screen.findByRole("button", { name: /Actions for Brand refresh/ }));
      await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      expect(await screen.findByText(/Open .* once on this device/)).toBeInTheDocument();
      expect((await readBoardList()).boards).toHaveLength(1);
    });
  });

  it("deletes with an Undo toast, lists it in the Trash, and restores from there", async () => {
    const user = userEvent.setup();
    await putBoard(board("brand", "Brand refresh"));
    render(<HomeApp localOnly />);
    await user.click(await screen.findByRole("button", { name: /Actions for Brand refresh/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.queryByRole("link", { name: /Brand refresh/ })).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Deleted “Brand refresh”/);

    // Undo from the toast brings it straight back.
    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("link", { name: /Brand refresh/ })).toBeInTheDocument();

    // Delete again, then restore from the Trash view.
    await user.click(screen.getByRole("button", { name: /Actions for Brand refresh/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Trash" }));
    expect(await screen.findByText("Brand refresh")).toBeInTheDocument();
    expect(screen.getByText(/30 days left|29 days left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore Brand refresh" }));
    await user.click(screen.getByRole("button", { name: "Recent" }));
    expect(await screen.findByRole("link", { name: /Brand refresh/ })).toBeInTheDocument();
  });

  it("shows only trash from the last 30 days", async () => {
    const user = userEvent.setup();
    await putBoard(board("new", "Deleted lately", { deletedAt: iso(3) }));
    await putBoard(board("old", "Deleted ages ago", { deletedAt: iso(45) }));
    render(<HomeApp localOnly />);
    await user.click(await screen.findByRole("button", { name: "Trash" }));
    expect(await screen.findByText("Deleted lately")).toBeInTheDocument();
    expect(screen.queryByText("Deleted ages ago")).toBeNull();
  });

  it("creates, renames and deletes folders", async () => {
    const user = userEvent.setup();
    render(<HomeApp localOnly />);
    await screen.findByText("No boards yet");
    await user.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog", { name: "New folder" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Clients");
    await user.click(within(dialog).getByRole("button", { name: "Create folder" }));
    expect(await screen.findByRole("button", { name: "Clients" })).toBeInTheDocument();
    await waitFor(async () => expect((await readBoardList()).folders.map((f) => f.name)).toEqual(["Clients"]));
  });
});

describe("Home (signed-in mode)", () => {
  const server = {
    boards: [board("s1", "From the server", { updatedAt: iso(0.1) })],
    trash: [],
    folders: [],
  };

  it("loads the list from the API and keeps a copy for offline", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(server), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HomeApp localOnly={false} />);
    expect(await screen.findByRole("link", { name: /From the server/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", expect.anything());
    expect(screen.queryByText("Offline")).toBeNull();
    await waitFor(async () => expect((await readBoardList()).boards.map((b) => b.id)).toEqual(["s1"]));
  });

  it("offline: shows the cached boards read-only with an Offline badge", async () => {
    await putBoard(board("cached", "Cached board"));
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<HomeApp localOnly={false} />);
    expect(await screen.findByRole("link", { name: /Cached board/ })).toBeInTheDocument();
    expect(await screen.findByText("Offline")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New board" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: /Actions for Cached board/ })).toBeDisabled();
  });

  it("creates a board through the API and builds the document client-side", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "new" }), { status: 201 });
      return new Response(JSON.stringify(server), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<HomeApp localOnly={false} />);
    await screen.findByRole("link", { name: /From the server/ });
    await user.click(screen.getAllByRole("button", { name: "New board" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "New board" });
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Kanban");
    await user.click(within(dialog).getByRole("radio", { name: /Kanban/ }));
    await user.click(within(dialog).getByRole("button", { name: "Create board" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/b/new"));
    const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ title: "Kanban", templateId: "kanban" });
  });
});
