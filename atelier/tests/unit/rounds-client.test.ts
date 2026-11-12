import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createRoundsClient, pushLocalState, RoundsRequestError } from "@/lib/engine/rounds/client";
import { PublishError } from "@/lib/engine/export/preview";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("rounds client", () => {
  it("prepare and create POST JSON to the board's routes", async () => {
    const f = vi.fn(async (url: string) => (String(url).endsWith("/prepare") ? json(200, { previewToken: "t", uploads: {} }) : json(201, { id: "r" })));
    const c = createRoundsClient(f as never);
    await c.prepare("b 1", [{ frameId: "f", bytes1280: 1, bytes480: 1 }]);
    await c.create("b 1", { label: "L", previewToken: null, frames: [] });
    expect(f.mock.calls[0][0]).toBe("/api/boards/b%201/rounds/prepare");
    expect(f.mock.calls[1][0]).toBe("/api/boards/b%201/rounds");
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
  });

  it.each([
    [429, "rate-limited"],
    [413, "too-large"],
    [503, "needs-server"],
    [401, "server"],
    [409, "server"],
    [500, "server"],
  ])("create maps status %s to PublishError %s", async (status, code) => {
    const c = createRoundsClient((async () => json(status, { error: "x" })) as never);
    await expect(c.create("b", { label: "", previewToken: null, frames: [] })).rejects.toMatchObject({ code });
    await expect(c.create("b", { label: "", previewToken: null, frames: [] })).rejects.toBeInstanceOf(PublishError);
  });

  it("a network failure is a PublishError too", async () => {
    const c = createRoundsClient((async () => { throw new TypeError("Failed to fetch"); }) as never);
    await expect(c.create("b", { label: "", previewToken: null, frames: [] })).rejects.toMatchObject({ code: "server" });
  });

  it("lists rounds and history, and downloads a snapshot as bytes", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith("/rounds")) return json(200, { rounds: [{ id: "r" }] });
      if (url.endsWith("/history")) return json(200, { versions: [{ id: "v" }] });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/octet-stream" } });
    });
    const c = createRoundsClient(f as never);
    expect(await c.listRounds("b")).toEqual([{ id: "r" }]);
    expect(await c.listHistory("b")).toEqual([{ id: "v" }]);
    expect(Array.from(await c.fetchSnapshot("b", "s"))).toEqual([1, 2, 3]);
    expect(f.mock.calls[2][0]).toBe("/api/boards/b/snapshots/s");
  });

  it("reads failures as RoundsRequestError with the status and the server's code", async () => {
    const c = createRoundsClient((async () => json(503, { error: "local-only" })) as never);
    const err = await c.listRounds("b").catch((e) => e);
    expect(err).toBeInstanceOf(RoundsRequestError);
    expect(err).toMatchObject({ status: 503, code: "local-only" });
  });

  it("creates a safety snapshot", async () => {
    const f = vi.fn(async () => json(201, { id: "snap" }));
    expect(await createRoundsClient(f as never).createSnapshot("b", "Before restore")).toBe("snap");
    expect(JSON.parse(((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))).toEqual({ label: "Before restore" });
  });
});

describe("pushLocalState", () => {
  it("PUTs the whole current state with the title (local-only mode has no sync)", async () => {
    const ydoc = new Y.Doc();
    ydoc.getMap("objects").set("a", 1);
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    await pushLocalState("board1", ydoc, "My board", f as never);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/boards/board1/local-state");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["x-atelier-title"]).toBe("My%20board");
  });
  it("never throws", async () => {
    await expect(pushLocalState("b", new Y.Doc(), "t", (async () => { throw new Error("x"); }) as never)).resolves.toBeUndefined();
  });
});
