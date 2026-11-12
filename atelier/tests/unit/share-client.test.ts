import { describe, expect, it, vi } from "vitest";
import {
  LinksModel,
  createShareClient,
  describeShareFailure,
  type ShareClient,
} from "@/lib/share/share-client";
import type { ShareLinkSummary } from "@/lib/share/link";

const link = (id: string, patch: Partial<ShareLinkSummary> = {}): ShareLinkSummary => ({
  id, boardId: "b1", ownerId: "o", name: `Link ${id}`, mode: "live", roundId: null, scope: "board", frameIds: [], permission: "react", expiresAt: null,
  welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false, votesRevealed: false, cookieEpoch: 0,
  createdAt: "2026-11-11T08:00:00.000Z", revokedAt: null, hasPassword: false, status: "ok", ...patch,
});

const res = (status: number, body?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status, headers: { "content-type": "application/json" } });

describe("describeShareFailure", () => {
  it.each([
    [401, { error: "unauthorized" }, /signed out/i],
    [401, { error: "mfa-required" }, /second step/i],
    [403, { error: "forbidden" }, /refused|reload/i],
    [404, { error: "not-found" }, /no longer exists/i],
    [409, { error: "too-many-links" }, /200 links/],
    [413, { error: "too-large" }, /too long/i],
    [429, { error: "rate-limited" }, /too many/i],
    [503, { error: "not-configured" }, /isn.t set up/i],
    [503, { error: "local-only" }, /local/i],
    [500, {}, /something went wrong/i],
  ])("%s %j -> readable", (status, body, re) => {
    const m = describeShareFailure(status, body);
    expect(m).toMatch(re);
    expect(m).not.toMatch(/undefined|\[object|stack|\bnull\b/i);
  });
  it("a network failure says so", () => {
    expect(describeShareFailure(0, null)).toMatch(/connect/i);
  });
  it("invalid-options carries the field messages", () => {
    expect(describeShareFailure(400, { error: "invalid-options", errors: { name: "Enter a name" } })).toMatch(/check the options/i);
  });
});

describe("ShareClient", () => {
  it("lists links for the board", async () => {
    const fetchFn = vi.fn(async () => res(200, { links: [link("a")] }));
    const c = createShareClient({ fetchFn: fetchFn as never });
    const r = await c.list("b1");
    expect(r).toMatchObject({ ok: true, value: [{ id: "a" }] });
    expect(fetchFn).toHaveBeenCalledWith("/api/boards/b1/share-links", expect.objectContaining({ method: "GET" }));
  });

  it("creates a link with a JSON body and returns the one-time URL; the field errors of a 400 come back keyed", async () => {
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => (JSON.parse(String(init?.body)).name === "" ? res(400, { error: "invalid-options", errors: { name: "Enter a name" } }) : res(201, { link: link("n"), url: "https://x.test/s/tok" })));
    const c = createShareClient({ fetchFn: fetchFn as never });
    const ok = await c.create("b1", { name: "A" } as never);
    expect(ok).toMatchObject({ ok: true, value: { url: "https://x.test/s/tok", link: { id: "n" } } });
    const bad = await c.create("b1", { name: "" } as never);
    expect(bad).toMatchObject({ ok: false, status: 400, fieldErrors: { name: "Enter a name" } });
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("revoke and delete; a thrown fetch is a connection message with status 0", async () => {
    const fetchFn = vi.fn(async (u: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return res(204);
      if (u.endsWith("/revoke")) return res(200, link("a", { status: "revoked", revokedAt: "2026-11-12T10:00:00.000Z" }));
      throw new TypeError("Failed to fetch");
    });
    const c = createShareClient({ fetchFn: fetchFn as never });
    expect(await c.revoke("a")).toMatchObject({ ok: true, value: { status: "revoked" } });
    expect(await c.remove("a")).toMatchObject({ ok: true });
    expect(await c.list("b1")).toMatchObject({ ok: false, status: 0, message: expect.stringMatching(/connect/i) });
  });

  it("feature-detects the rounds API: a 404 means it does not exist (yet); a list comes back newest first with only what the dialog needs", async () => {
    const missing = createShareClient({ fetchFn: (async () => res(404, { error: "not-found" })) as never });
    expect(await missing.rounds("b1")).toEqual({ available: false, rounds: [] });
    const down = createShareClient({ fetchFn: (async () => res(503, { error: "local-only" })) as never });
    expect(await down.rounds("b1")).toEqual({ available: false, rounds: [] });
    const thrown = createShareClient({ fetchFn: (async () => { throw new TypeError("x"); }) as never });
    expect(await thrown.rounds("b1")).toEqual({ available: false, rounds: [] });

    const rows = [
      { id: "r1", number: 1, label: "First", publishedAt: "2026-11-01T00:00:00Z", snapshotId: "s", previews: {}, diff: {} },
      { id: "r2", number: 2, label: "Second", publishedAt: "2026-11-02T00:00:00Z", snapshotId: "s2", previews: {}, diff: {} },
    ];
    for (const body of [{ rounds: rows }, rows]) {
      const c = createShareClient({ fetchFn: (async () => res(200, body)) as never });
      expect(await c.rounds("b1")).toEqual({
        available: true,
        rounds: [
          { id: "r2", number: 2, label: "Second", publishedAt: "2026-11-02T00:00:00Z" },
          { id: "r1", number: 1, label: "First", publishedAt: "2026-11-01T00:00:00Z" },
        ],
      });
    }
    const empty = createShareClient({ fetchFn: (async () => res(200, { rounds: [] })) as never });
    expect(await empty.rounds("b1")).toEqual({ available: true, rounds: [] });
    const junk = createShareClient({ fetchFn: (async () => res(200, { rounds: [{ nope: 1 }, null, 5] })) as never });
    expect(await junk.rounds("b1")).toEqual({ available: true, rounds: [] });
  });

  it("hands local state over with the title in a header, and never throws", async () => {
    const fetchFn = vi.fn(async () => res(204));
    const c = createShareClient({ fetchFn: fetchFn as never });
    await c.handOverLocalState("b1", new Uint8Array([1, 2]), "Spring é");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/boards/b1/local-state");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["x-atelier-title"]).toBe(encodeURIComponent("Spring é"));
    const broken = createShareClient({ fetchFn: (async () => { throw new Error("x"); }) as never });
    await expect(broken.handOverLocalState("b1", new Uint8Array([1]), "t")).resolves.toBeUndefined();
  });
});

function fakeClient(over: Partial<ShareClient> = {}): ShareClient {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: [link("a"), link("b")] })),
    create: vi.fn(),
    revoke: vi.fn(async (id: string) => ({ ok: true as const, value: link(id, { status: "revoked", revokedAt: "2026-11-12T10:00:00.000Z" }) })),
    remove: vi.fn(async () => ({ ok: true as const, value: undefined })),
    rounds: vi.fn(async () => ({ available: false, rounds: [] })),
    handOverLocalState: vi.fn(),
    ...over,
  } as ShareClient;
}

describe("LinksModel", () => {
  const NOW = () => new Date("2026-11-12T10:00:00.000Z");

  it("loads, then reports loaded", async () => {
    const m = new LinksModel(fakeClient(), "b1", NOW);
    expect(m.snapshot().status).toBe("idle");
    await m.load();
    expect(m.snapshot()).toMatchObject({ status: "ready", links: [{ id: "a" }, { id: "b" }] });
  });

  it("a failed load says why and keeps nothing", async () => {
    const m = new LinksModel(fakeClient({ list: vi.fn(async () => ({ ok: false as const, status: 503, message: "Sharing isn't set up on this server." })) }), "b1", NOW);
    await m.load();
    expect(m.snapshot()).toMatchObject({ status: "error", error: "Sharing isn't set up on this server.", links: [] });
  });

  it("revoke is optimistic: the row shows revoked before the server answers, and the server's row replaces it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const client = fakeClient({
      revoke: vi.fn(async (id: string) => {
        await gate;
        return { ok: true as const, value: link(id, { status: "revoked", revokedAt: "2026-11-12T10:00:01.000Z", cookieEpoch: 1 }) };
      }),
    });
    const m = new LinksModel(client, "b1", NOW);
    await m.load();
    const pending = m.revoke("a");
    expect(m.snapshot().links.find((l) => l.id === "a")).toMatchObject({ status: "revoked", revokedAt: "2026-11-12T10:00:00.000Z" });
    expect(m.snapshot().busy).toContain("a");
    release();
    expect(await pending).toEqual({ ok: true });
    expect(m.snapshot().links.find((l) => l.id === "a")).toMatchObject({ status: "revoked", cookieEpoch: 1 });
    expect(m.snapshot().busy).not.toContain("a");
  });

  it("a failed revoke rolls the row back and returns a readable message", async () => {
    const client = fakeClient({ revoke: vi.fn(async () => ({ ok: false as const, status: 500, message: "Something went wrong on the server. Try again." })) });
    const m = new LinksModel(client, "b1", NOW);
    await m.load();
    const states: string[] = [];
    m.subscribe(() => states.push(m.snapshot().links.find((l) => l.id === "a")!.status));
    const r = await m.revoke("a");
    expect(r).toEqual({ ok: false, message: "Something went wrong on the server. Try again." });
    expect(m.snapshot().links.find((l) => l.id === "a")).toMatchObject({ status: "ok", revokedAt: null });
    expect(states).toContain("revoked"); // it did flip first
    expect(states.at(-1)).toBe("ok"); // and came back
    expect(m.snapshot().busy).toEqual([]);
  });

  it("a revoke that finds the link gone (404) removes it instead of restoring a ghost", async () => {
    const client = fakeClient({ revoke: vi.fn(async () => ({ ok: false as const, status: 404, message: "That link or board no longer exists." })) });
    const m = new LinksModel(client, "b1", NOW);
    await m.load();
    expect((await m.revoke("a")).ok).toBe(false);
    expect(m.snapshot().links.map((l) => l.id)).toEqual(["b"]);
  });

  it("delete is optimistic too, and rolls back to the same place in the list", async () => {
    const client = fakeClient({ remove: vi.fn(async () => ({ ok: false as const, status: 500, message: "nope" })) });
    const m = new LinksModel(client, "b1", NOW);
    await m.load();
    const pending = m.remove("a");
    expect(m.snapshot().links.map((l) => l.id)).toEqual(["b"]);
    expect(await pending).toEqual({ ok: false, message: "nope" });
    expect(m.snapshot().links.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("a second action on a row that is already busy is ignored", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const client = fakeClient({ revoke: vi.fn(async (id: string) => { await gate; return { ok: true as const, value: link(id, { status: "revoked" }) }; }) });
    const m = new LinksModel(client, "b1", NOW);
    await m.load();
    const first = m.revoke("a");
    expect(await m.revoke("a")).toEqual({ ok: false, message: "Already in progress" });
    release();
    await first;
    expect(client.revoke).toHaveBeenCalledTimes(1);
  });

  it("add puts a new link first; it never holds a URL", async () => {
    const m = new LinksModel(fakeClient(), "b1", NOW);
    await m.load();
    m.add(link("new"));
    expect(m.snapshot().links[0].id).toBe("new");
    expect(JSON.stringify(m.snapshot())).not.toMatch(/https?:\/\//);
  });
});
