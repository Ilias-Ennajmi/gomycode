import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import { setShareStore } from "@/lib/server/share-store";
import { hashToken } from "@/lib/share/token";

// Local-only mode (development and end-to-end tests): no account, no database. The owner's share-link API is served from the
// in-memory ShareStore so links made in the dialog work on this server; the board's state is handed over by the dialog.

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => null) }));

import { GET, POST } from "@/app/api/boards/[id]/share-links/route";
import { PUT } from "@/app/api/boards/[id]/local-state/route";
import { POST as REVOKE } from "@/app/api/share-links/[id]/revoke/route";

const BOARD = "e2e-board-1";
const ORIGIN = "http://localhost:3271";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body?: unknown) =>
  new Request(`${ORIGIN}/api/x`, { method, headers: { "content-type": "application/json", origin: ORIGIN }, body: body === undefined ? undefined : JSON.stringify(body) });

function frameState(ids: string[]): Uint8Array {
  const doc = new Y.Doc();
  const objects = doc.getMap<Y.Map<unknown>>("objects");
  for (const id of ids) {
    const m = new Y.Map<unknown>();
    m.set("type", "frame");
    objects.set(id, m);
  }
  return Y.encodeStateAsUpdate(doc);
}
const put = (id: string, bytes: Uint8Array, headers: Record<string, string> = {}) =>
  PUT(new Request(`${ORIGIN}/api/boards/${id}/local-state`, { method: "PUT", headers: { "content-type": "application/octet-stream", origin: ORIGIN, ...headers }, body: bytes as BodyInit }), ctx(id));

let store: MemoryShareStore;
beforeEach(() => {
  vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  store = new MemoryShareStore();
  setShareStore(store);
});
afterEach(() => {
  setShareStore(null);
  vi.unstubAllEnvs();
});

describe("share links in local-only mode", () => {
  it("creates and lists a link without an account, for a board the server has never seen", async () => {
    const res = await POST(json("POST", { name: "Local", mode: "live" }), ctx(BOARD));
    expect(res.status).toBe(201);
    const body = await res.json();
    const token = body.url.split("/s/")[1];
    expect(body.url.startsWith(`${ORIGIN}/s/`)).toBe(true);
    const list = await (await GET(json("GET"), ctx(BOARD))).json();
    expect(list.links).toHaveLength(1);
    expect(list.links[0].name).toBe("Local");
    expect(JSON.stringify(list)).not.toContain(token);
    expect((await store.getLinkByHash(hashToken(token)))?.boardId).toBe(BOARD);
  });

  it("revokes", async () => {
    const created = await (await POST(json("POST", { mode: "live" }), ctx(BOARD))).json();
    const res = await REVOKE(json("POST"), ctx(created.link.id));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("revoked");
  });

  it("round mode says to publish a round first when there are none", async () => {
    const res = await POST(json("POST", { mode: "round" }), ctx(BOARD));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.roundId).toBe("Publish a round first");
  });

  it("frame scope validates against the state the dialog handed over", async () => {
    expect((await POST(json("POST", { mode: "live", scope: "frames", frameIds: ["f1"] }), ctx(BOARD))).status).toBe(400);
    expect((await put(BOARD, frameState(["f1", "f2"]), { "x-atelier-title": encodeURIComponent("Spring") })).status).toBe(204);
    expect((await POST(json("POST", { mode: "live", scope: "frames", frameIds: ["f1"] }), ctx(BOARD))).status).toBe(201);
    expect((await POST(json("POST", { mode: "live", scope: "frames", frameIds: ["zzz"] }), ctx(BOARD))).status).toBe(400);
    expect(await store.getBoardTitle(BOARD)).toBe("Spring");
    expect(await store.getLiveState(BOARD)).not.toBeNull();
  });

  it("a second hand-over replaces the first instead of piling up", async () => {
    await put(BOARD, frameState(["a"]));
    await put(BOARD, frameState(["b"]));
    const doc = new Y.Doc();
    Y.applyUpdate(doc, (await store.getLiveState(BOARD))!);
    expect([...doc.getMap("objects").keys()]).toEqual(["b"]);
  });

  it("refuses a hostile board id, a foreign origin and an oversized body", async () => {
    expect((await POST(json("POST", { mode: "live" }), ctx("../../etc"))).status).toBe(404);
    expect((await put("a b", frameState(["a"]))).status).toBe(404);
    const foreign = await PUT(new Request(`${ORIGIN}/x`, { method: "PUT", headers: { "content-type": "application/octet-stream", origin: "https://evil.example" }, body: new Uint8Array(4) }), ctx(BOARD));
    expect(foreign.status).toBe(403);
    const big = await PUT(new Request(`${ORIGIN}/x`, { method: "PUT", headers: { "content-type": "application/octet-stream", origin: ORIGIN, "content-length": String(64 * 1024 * 1024) }, body: new Uint8Array(4) }), ctx(BOARD));
    expect(big.status).toBe(413);
  });

  it("the hand-over route does not exist outside local-only mode", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "");
    expect((await put(BOARD, frameState(["a"]))).status).toBe(404);
  });
});
