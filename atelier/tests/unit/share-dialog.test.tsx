import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ShareDialog } from "@/components/share/ShareDialog";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import type { ShareLinkSummary } from "@/lib/share/link";
import type { ShareClient } from "@/lib/share/share-client";

const TOKEN = "T0kenT0kenT0kenT0kenT0kenT0kenT0kenT0kenT0k";
const URL_ONCE = `http://localhost:3271/s/${TOKEN}`;
const NOW = new Date("2026-11-12T10:00:00.000Z");

const link = (id: string, patch: Partial<ShareLinkSummary> = {}): ShareLinkSummary => ({
  id, boardId: "b1", ownerId: "o", name: `Link ${id}`, mode: "live", roundId: null, scope: "board", frameIds: [], permission: "react", expiresAt: null,
  welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false, votesRevealed: false, cookieEpoch: 0,
  createdAt: "2026-11-11T08:00:00.000Z", revokedAt: null, hasPassword: false, status: "ok", ...patch,
});

type Fake = { [K in keyof ShareClient]: Mock };
function client(over: Partial<Record<keyof ShareClient, unknown>> = {}): Fake {
  const base = {
    list: vi.fn(async () => ({ ok: true as const, value: [] as ShareLinkSummary[] })),
    create: vi.fn(async (_b: string, o: { name: string }) => ({ ok: true as const, value: { link: link("new", { name: o.name }), url: URL_ONCE } })),
    revoke: vi.fn(async (id: string) => ({ ok: true as const, value: link(id, { status: "revoked", revokedAt: NOW.toISOString() }) })),
    remove: vi.fn(async () => ({ ok: true as const, value: undefined })),
    rounds: vi.fn(async () => ({ available: false, rounds: [] })),
    handOverLocalState: vi.fn(async () => undefined),
  };
  return { ...base, ...over } as unknown as Fake;
}

function board() {
  const doc = new BoardDoc();
  doc.meta.title = "Spring";
  doc.create({ ...defaultsFor("frame"), name: "Direction A", order: "a0", x: 0, y: 0 } as unknown as NewObject);
  doc.create({ ...defaultsFor("frame"), name: "Direction B", order: "a1", x: 2000, y: 0 } as unknown as NewObject);
  return doc;
}

const toast = vi.fn();
let onClose: ReturnType<typeof vi.fn>;
const mount = (c: Fake, extra: Partial<Parameters<typeof ShareDialog>[0]> = {}) =>
  render(<ShareDialog boardId="b1" doc={board()} toast={toast} client={c as unknown as ShareClient} now={() => NOW} onClose={onClose as never} {...extra} />);

beforeEach(() => {
  toast.mockClear();
  onClose = vi.fn();
  document.execCommand = vi.fn(() => true);
});
afterEach(() => vi.restoreAllMocks());

const openForm = async (user = userEvent.setup()) => {
  await user.click(await screen.findByRole("button", { name: /new link/i }));
  return user;
};

describe("empty and filled lists", () => {
  it("says there are no links yet and offers New link", async () => {
    mount(client());
    expect(await screen.findByText("No links yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new link/i })).toBeEnabled();
  });

  it("loads with the real clock too (a new `now` function on every render must not reset the list)", async () => {
    render(<ShareDialog boardId="b1" doc={board()} toast={toast} client={client({ list: vi.fn(async () => ({ ok: true as const, value: [link("a", { name: "Acme" })] })) }) as unknown as ShareClient} onClose={onClose as never} />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
  });

  it("shows each link with its state, version, permission and expiry in words", async () => {
    const c = client({
      list: vi.fn(async () => ({
        ok: true as const,
        value: [
          link("a", { name: "Acme review", permission: "comment", expiresAt: "2026-11-19T10:00:00.000Z" }),
          link("b", { name: "Old one", status: "revoked", revokedAt: "2026-11-10T10:00:00.000Z" }),
          link("c", { name: "Lapsed", status: "expired", expiresAt: "2026-11-09T10:00:00.000Z" }),
        ],
      })),
    });
    mount(c);
    const rowA = (await screen.findByText("Acme review")).closest("tr")!;
    expect(within(rowA).getByText("Active")).toBeInTheDocument();
    expect(within(rowA).getByText("Live board")).toBeInTheDocument();
    expect(within(rowA).getByText("View, react and comment")).toBeInTheDocument();
    expect(within(rowA).getByText("Expires in 7 days")).toBeInTheDocument();
    expect(within(screen.getByText("Old one").closest("tr")!).getByText("Revoked")).toBeInTheDocument();
    expect(within(screen.getByText("Lapsed").closest("tr")!).getByText("Expired")).toBeInTheDocument();
    // a revoked link has no Revoke button, only Delete
    expect(screen.queryByRole("button", { name: "Revoke link Old one" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete link Old one" })).toBeInTheDocument();
  });

  it("explains that a link cannot be copied after it was made", async () => {
    mount(client({ list: vi.fn(async () => ({ ok: true as const, value: [link("a")] })) }));
    expect(await screen.findByText(/can't be copied again after you create it/)).toBeInTheDocument();
  });

  it("a failed load says why and offers Try again", async () => {
    const list = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, message: "Sharing isn't set up on this server yet." }).mockResolvedValue({ ok: true, value: [] });
    mount(client({ list } as never));
    expect(await screen.findByText("Sharing isn't set up on this server yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No links yet")).toBeInTheDocument();
  });

  it("local mode shows its note; a normal server does not, and local mode hands the board's state over", async () => {
    const c = client();
    const { unmount } = mount(c, { localOnly: true });
    expect(await screen.findByText(/Local mode: links only work on this server/)).toBeInTheDocument();
    await waitFor(() => expect(c.handOverLocalState).toHaveBeenCalledWith("b1", expect.any(Uint8Array), "Spring"));
    unmount();
    const c2 = client();
    mount(c2);
    await screen.findByText("No links yet");
    expect(screen.queryByText(/Local mode/)).toBeNull();
    expect(c2.handOverLocalState).not.toHaveBeenCalled();
  });
});

describe("the new link form", () => {
  it("offers every option", async () => {
    mount(client());
    await openForm();
    for (const name of [
      /Link name/, /Whole board/, /Chosen frames/, /Published round/, /Live board/, /View only/, /View and react/, /View, react and comment/,
      /Ask for a password/, /Expires/, /Welcome note/, /Allow download/, /Watermark/, /Show credits/, /Blind votes/,
    ]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("starts as view and react, whole board, no expiry", async () => {
    mount(client());
    await openForm();
    expect(screen.getByLabelText(/View and react/)).toBeChecked();
    expect(screen.getByLabelText(/Whole board/)).toBeChecked();
    expect(screen.getByLabelText(/Expires/)).toHaveValue("none");
    expect(screen.getByLabelText(/Allow download/)).not.toBeChecked();
  });

  it("without a rounds API the round choice is off and says to publish one first; the link starts live", async () => {
    mount(client());
    await openForm();
    expect(screen.getByLabelText(/Published round/)).toBeDisabled();
    expect(screen.getByLabelText(/Live board/)).toBeChecked();
    expect(screen.getByText(/Publish a round first/)).toBeInTheDocument();
  });

  it("with rounds, the latest is chosen and the list can be changed", async () => {
    const rounds = [
      { id: "r2", number: 2, label: "Colour pass", publishedAt: "2026-11-10T00:00:00Z" },
      { id: "r1", number: 1, label: "", publishedAt: "2026-11-01T00:00:00Z" },
    ];
    const c = client({ rounds: vi.fn(async () => ({ available: true, rounds })) });
    mount(c);
    await openForm();
    expect(screen.getByLabelText(/Published round/)).toBeChecked();
    const select = screen.getByLabelText("Round");
    expect(select).toHaveValue("r2");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Round 2 · Colour pass", "Round 1"]);
    await userEvent.selectOptions(select, "r1");
    await userEvent.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(c.create).toHaveBeenCalled());
    expect(c.create.mock.calls[0][1]).toMatchObject({ mode: "round", roundId: "r1" });
  });

  it("lists the board's frames when 'Chosen frames' is picked, and needs at least one", async () => {
    const c = client();
    mount(c);
    const user = await openForm();
    await user.click(screen.getByLabelText(/Chosen frames/));
    const frames = screen.getByRole("list", { name: "Frames to share" });
    expect(within(frames).getAllByRole("checkbox").map((b) => b.closest("label")!.textContent)).toEqual(["Direction A", "Direction B"]);
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText("Choose at least one frame")).toBeInTheDocument();
    expect(c.create).not.toHaveBeenCalled();
    await user.click(within(frames).getByLabelText("Direction B"));
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(c.create).toHaveBeenCalled());
    const sent = c.create.mock.calls[0][1];
    expect(sent.scope).toBe("frames");
    expect(sent.frameIds).toHaveLength(1);
  });

  it("a board without frames cannot share chosen frames", async () => {
    mount(client(), { doc: new BoardDoc() });
    await openForm();
    expect(screen.getByLabelText(/Chosen frames/)).toBeDisabled();
  });

  it("validates before anything is sent: empty name, short password, long note; errors are tied to their fields", async () => {
    const c = client();
    mount(c);
    const user = await openForm();
    await user.clear(screen.getByLabelText("Link name"));
    await user.click(screen.getByLabelText(/Ask for a password/));
    await user.type(screen.getByLabelText("Password"), "abc");
    const note = screen.getByLabelText("Welcome note");
    fireEvent.change(note, { target: { value: "x".repeat(501) } });
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(c.create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Fix 3 things to continue.");
    const name = screen.getByLabelText("Link name");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(name.getAttribute("aria-describedby")!.split(" ")[0])).toHaveTextContent("Enter a name");
    expect(screen.getByText("Use at least 4 characters")).toBeInTheDocument();
    expect(screen.getByText("Use at most 500 characters")).toBeInTheDocument();
    // focus goes to the first problem
    await waitFor(() => expect(name).toHaveFocus());
  });

  it("counts the welcome note as it is typed", async () => {
    mount(client());
    const user = await openForm();
    await user.type(screen.getByLabelText("Welcome note"), "Hello");
    expect(screen.getByText("5/500")).toBeInTheDocument();
  });

  it("the password can be shown and hidden", async () => {
    mount(client());
    const user = await openForm();
    await user.click(screen.getByLabelText(/Ask for a password/));
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a custom expiry asks for a date and checks it is in the future", async () => {
    const c = client();
    mount(c);
    const user = await openForm();
    await user.selectOptions(screen.getByLabelText(/Expires/), "custom");
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText("Choose a date")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Last day the link works"), { target: { value: "2026-11-01" } });
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText("Choose a date in the future")).toBeInTheDocument();
    expect(c.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Last day the link works"), { target: { value: "2026-12-24" } });
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(c.create).toHaveBeenCalled());
    expect(c.create.mock.calls[0][1].expiresAt).toBe(new Date(2026, 11, 24, 23, 59, 0).toISOString());
  });

  it("sends every option the owner chose", async () => {
    const c = client();
    mount(c);
    const user = await openForm();
    await user.clear(screen.getByLabelText("Link name"));
    await user.type(screen.getByLabelText("Link name"), "Acme");
    await user.click(screen.getByLabelText(/View, react and comment/));
    await user.click(screen.getByLabelText(/Ask for a password/));
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.selectOptions(screen.getByLabelText(/Expires/), "7d");
    await user.type(screen.getByLabelText("Welcome note"), "Welcome");
    await user.click(screen.getByLabelText(/Allow download/));
    await user.click(screen.getByLabelText(/Watermark/));
    await user.click(screen.getByLabelText(/Show credits/));
    await user.click(screen.getByLabelText(/Blind votes/));
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(c.create).toHaveBeenCalled());
    expect(c.create.mock.calls[0]).toEqual([
      "b1",
      { name: "Acme", mode: "live", roundId: null, scope: "board", frameIds: [], permission: "comment", password: "hunter22", expiresAt: "2026-11-19T10:00:00.000Z", welcomeNote: "Welcome", allowDownload: true, watermark: true, showCredits: true, blindVotes: true },
    ]);
  });

  it("a server error is shown in words and keeps the form", async () => {
    const c = client({ create: vi.fn(async () => ({ ok: false as const, status: 409, message: "This board already has 200 links. Delete some you no longer use." })) as never });
    mount(c);
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText(/already has 200 links/)).toBeInTheDocument();
    expect(screen.getByLabelText("Link name")).toHaveValue("Client link");
  });

  it("server field errors land on their fields", async () => {
    const c = client({ create: vi.fn(async () => ({ ok: false as const, status: 400, message: "Check the options and try again.", fieldErrors: { name: "Use at most 80 characters" } })) as never });
    mount(c);
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText("Use at most 80 characters")).toBeInTheDocument();
  });

  it("Cancel goes back to the list", async () => {
    mount(client());
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("No links yet")).toBeInTheDocument();
  });
});

describe("after creating", () => {
  async function create() {
    const c = client();
    mount(c);
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByText("Link created", { selector: "h3" });
    return { c, user };
  }

  it("shows the address once with a warning, selected and focused, and a QR code", async () => {
    await create();
    const field = screen.getByLabelText(/Link for/) as HTMLInputElement;
    expect(field.value).toBe(URL_ONCE);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveFocus();
    expect(screen.getByText(/can't be shown again/)).toBeInTheDocument();
    const qr = await screen.findByRole("img", { name: /QR code for the link/ });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("Copy uses the clipboard and says so", async () => {
    const { user } = await create();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(URL_ONCE);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "Link copied" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("when copying is refused the text stays selected and the owner is told to press Ctrl+C", async () => {
    const { user } = await create();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    document.execCommand = vi.fn(() => false);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/press Ctrl\+C/)).toBeInTheDocument();
  });

  it("Done returns to the list with the new link in it and the address gone from the page", async () => {
    const { user } = await create();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("Client link", { selector: "span" })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("Create another opens a fresh form and drops the address", async () => {
    const { user } = await create();
    await user.click(screen.getByRole("button", { name: "Create another" }));
    expect(await screen.findByRole("heading", { name: "New link" })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });
});

describe("revoke and delete", () => {
  const one = () => client({ list: vi.fn(async () => ({ ok: true as const, value: [link("a", { name: "Acme" })] })) });

  it("asks first; Keep it cancels and returns focus to the Revoke button", async () => {
    const c = one();
    mount(c);
    const user = userEvent.setup();
    const revoke = await screen.findByRole("button", { name: "Revoke link Acme" });
    await user.click(revoke);
    expect(screen.getByText(/stops working right away/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke link" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(c.revoke).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revoke link Acme" })).toHaveFocus());
  });

  it("confirming revokes at once on screen, then keeps it revoked when the server agrees", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const c = client({
      list: vi.fn(async () => ({ ok: true as const, value: [link("a", { name: "Acme" })] })),
      revoke: vi.fn(async (id: string) => { await gate; return { ok: true as const, value: link(id, { name: "Acme", status: "revoked", revokedAt: NOW.toISOString() }) }; }),
    });
    mount(c);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Revoke link Acme" }));
    await user.click(screen.getByRole("button", { name: "Revoke link" }));
    // before the server answered
    expect(within(screen.getByText("Acme").closest("tr")!).getByText("Revoked")).toBeInTheDocument();
    release();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Revoked Acme") })));
    expect(within(screen.getByText("Acme").closest("tr")!).getByText("Revoked")).toBeInTheDocument();
  });

  it("a failed revoke rolls back to Active and says why in a toast", async () => {
    const c = client({
      list: vi.fn(async () => ({ ok: true as const, value: [link("a", { name: "Acme" })] })),
      revoke: vi.fn(async () => ({ ok: false as const, status: 500, message: "Something went wrong on the server. Try again." })),
    });
    mount(c);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Revoke link Acme" }));
    await user.click(screen.getByRole("button", { name: "Revoke link" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Couldn't revoke Acme") })));
    expect(toast.mock.calls.at(-1)![0].message).toContain("Something went wrong on the server");
    expect(within(screen.getByText("Acme").closest("tr")!).getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke link Acme" })).toBeInTheDocument();
  });

  it("delete asks first and removes the row; a failure puts it back", async () => {
    const ok = one();
    const { unmount } = mount(ok);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete link Acme" }));
    await user.click(screen.getByRole("button", { name: "Delete link" }));
    await waitFor(() => expect(screen.queryByText("Acme")).toBeNull());
    expect(ok.remove).toHaveBeenCalledWith("a");
    unmount();

    const bad = client({ list: vi.fn(async () => ({ ok: true as const, value: [link("a", { name: "Acme" })] })), remove: vi.fn(async () => ({ ok: false as const, status: 500, message: "nope" })) });
    mount(bad);
    await user.click(await screen.findByRole("button", { name: "Delete link Acme" }));
    await user.click(screen.getByRole("button", { name: "Delete link" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Couldn't delete Acme") })));
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});

describe("keyboard and focus", () => {
  it("opens with focus inside the dialog, on its title", async () => {
    mount(client());
    await screen.findByText("No links yet");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Share this board");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Share this board" }));
  });

  it("Escape closes", async () => {
    mount(client());
    await screen.findByText("No links yet");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the whole flow works from the keyboard", async () => {
    const c = client();
    mount(c);
    const user = userEvent.setup();
    await screen.findByText("No links yet");
    await user.tab(); // Close
    await user.tab(); // New link
    expect(screen.getByRole("button", { name: /new link/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "New link" })).toHaveFocus();
    const field = screen.getByLabelText("Link name");
    field.focus();
    await user.keyboard("{Enter}"); // submits the form
    await waitFor(() => expect(c.create).toHaveBeenCalled());
    expect(await screen.findByLabelText(/Link for/)).toHaveFocus();
  });
});

describe("the address is never kept", () => {
  it("is not written to localStorage, sessionStorage, IndexedDB or the console, and is gone from the page and the model afterwards", async () => {
    const seen: string[] = [];
    const spy = (obj: object, fn: string): Mock => (vi.spyOn(obj as never, fn as never) as unknown as Mock).mockImplementation(((...a: unknown[]) => { seen.push(JSON.stringify(a)); }) as never);
    const ls = spy(Storage.prototype, "setItem");
    const idb = vi.spyOn(indexedDB, "open");
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((k) => spy(console, k));
    const c = client();
    const { unmount } = mount(c);
    const user = await openForm();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByLabelText(/Link for/);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await screen.findByRole("img", { name: /QR code/ });
    await user.click(screen.getByRole("button", { name: "Done" }));
    // the list model (what the table reads) never saw the address
    expect(document.body.innerHTML).not.toContain(TOKEN);
    unmount();
    expect(document.body.innerHTML).not.toContain(TOKEN);

    expect(ls).not.toHaveBeenCalled();
    expect(idb).not.toHaveBeenCalled();
    for (const l of logs) expect(l).not.toHaveBeenCalled();
    expect(seen.join("")).not.toContain(TOKEN);
    for (const k of [localStorage, sessionStorage]) for (let i = 0; i < k.length; i++) expect(k.getItem(k.key(i)!)).not.toContain(TOKEN);
    // only the clipboard (the owner's own request) ever received it
    expect(writeText).toHaveBeenCalledWith(URL_ONCE);
  });

  it("closing the dialog while the address is showing drops it with the component", async () => {
    const c = client();
    const { unmount } = mount(c);
    const user = await openForm();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await screen.findByLabelText(/Link for/);
    unmount();
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });
});
