import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { POST as createAsset } from "@/app/api/assets/route";
import { POST as completeAsset } from "@/app/api/assets/[id]/complete/route";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const ASSET = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const MB = 1024 * 1024;

const ownerClaims = { sub: OWNER, aal: "aal2" };

function post(body: unknown) {
  return new Request("http://atelier.test/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function complete(id: string, body: unknown) {
  return completeAsset(post(body) as never, { params: Promise.resolve({ id }) });
}
const valid = { mime: "image/jpeg", bytes: 2 * MB, width: 4000, height: 3000 };

beforeEach(() => {
  pg = createFakePg();
  claims = ownerClaims;
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  vi.stubEnv("R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("R2_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "super-secret-value");
  vi.stubEnv("R2_BUCKET", "atelier-assets");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/assets", () => {
  it("answers 401 without a session", async () => {
    claims = null;
    const res = await createAsset(post(valid) as never);
    expect(res.status).toBe(401);
  });

  it("answers 403 for another user, including an anonymous one from the same Supabase project", async () => {
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await createAsset(post(valid) as never)).status).toBe(403);
    claims = { sub: OWNER, is_anonymous: true, aal: "aal2" };
    expect((await createAsset(post(valid) as never)).status).toBe(403);
  });

  it("answers 413 for a 60 MB image before doing anything else", async () => {
    const res = await createAsset(post({ ...valid, bytes: 60 * MB }) as never);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("too-large");
  });

  it("accepts exactly 50 MB", async () => {
    expect((await createAsset(post({ ...valid, bytes: 50 * MB }) as never)).status).toBe(200);
  });

  it("returns an asset id and two presigned PUT URLs, one per variant", async () => {
    const res = await createAsset(post(valid) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.assetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const original = new URL(body.uploads.original);
    const variant = new URL(body.uploads.w1024);
    expect(original.pathname).toBe(`/atelier-assets/a/${body.assetId}/original`);
    expect(variant.pathname).toBe(`/atelier-assets/a/${body.assetId}/w1024.webp`);
    expect(original.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(JSON.stringify(body)).not.toContain("super-secret-value");
  });

  it("uses the id the client chose, so an offline-placed image keeps its id", async () => {
    const body = await (await createAsset(post({ ...valid, assetId: ASSET }) as never)).json();
    expect(body.assetId).toBe(ASSET);
    expect(body.uploads.original).toContain(`/a/${ASSET}/original`);
  });

  it("rejects a client id that is not a 128-bit asset id (it becomes part of an object key)", async () => {
    for (const assetId of ["../../x", "abc", "6F1C2D3E-4B5A-4C6D-8E7F-0A1B2C3D4E5F".slice(0, 30)]) {
      expect((await createAsset(post({ ...valid, assetId }) as never)).status).toBe(400);
    }
  });

  it("rejects bad bodies and types that are not web images", async () => {
    expect((await createAsset(post("not json") as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, bytes: -1 }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, width: 0 }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, mime: "text/html" }) as never)).status).toBe(415);
    expect((await createAsset(post({ ...valid, mime: "image/svg+xml" }) as never)).status).toBe(415);
  });

  it("answers 503 when R2 is not configured", async () => {
    vi.stubEnv("R2_BUCKET", "");
    expect((await createAsset(post(valid) as never)).status).toBe(503);
  });

  it("is refused in local-only mode (there is no storage and no account)", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    expect((await createAsset(post(valid) as never)).status).toBe(503);
  });
});

describe("POST /api/assets/:id/complete", () => {
  it("stores the assets row owned by the caller", async () => {
    const res = await complete(ASSET, valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetId: ASSET });
    expect(pg.tables.assets).toHaveLength(1);
    expect(pg.tables.assets[0]).toMatchObject({
      id: ASSET,
      owner_id: OWNER,
      kind: "image",
      mime: "image/jpeg",
      width: 4000,
      height: 3000,
      bytes: 2 * MB,
      variants: { original: `a/${ASSET}/original`, w1024: `a/${ASSET}/w1024.webp` },
    });
  });

  it("is idempotent: completing twice keeps one row", async () => {
    await complete(ASSET, valid);
    expect((await complete(ASSET, valid)).status).toBe(200);
    expect(pg.tables.assets).toHaveLength(1);
  });

  it("answers 401 / 403 like the other route", async () => {
    claims = null;
    expect((await complete(ASSET, valid)).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await complete(ASSET, valid)).status).toBe(403);
    expect(pg.tables.assets).toHaveLength(0);
  });

  it("cannot take over an asset id that belongs to someone else", async () => {
    pg.tables.assets.push({ id: ASSET, owner_id: STRANGER, kind: "image", mime: "image/png" });
    const res = await complete(ASSET, valid);
    expect(res.status).toBe(409);
    expect(pg.tables.assets[0].owner_id).toBe(STRANGER);
  });

  it("rejects a malformed id or body, and a 60 MB claim", async () => {
    expect((await complete("not-an-id", valid)).status).toBe(400);
    expect((await complete(ASSET, { mime: "image/jpeg" })).status).toBe(400);
    expect((await complete(ASSET, { ...valid, bytes: 60 * MB })).status).toBe(413);
    expect((await complete(ASSET, { ...valid, mime: "application/zip" })).status).toBe(415);
    expect(pg.tables.assets).toHaveLength(0);
  });

  it("answers 500 without leaking database details when the insert fails", async () => {
    pg.failNext("assets", { code: "XX000", message: "relation secret_table exploded" });
    const res = await complete(ASSET, valid);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_table");
  });
});
