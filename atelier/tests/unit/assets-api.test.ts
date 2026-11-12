import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { POST as createAsset } from "@/app/api/assets/route";
import { POST as completeAsset } from "@/app/api/assets/[id]/complete/route";
import { PATCH as patchAsset } from "@/app/api/assets/[id]/route";

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
      // A request that lists no variants is a Phase 1 client: it uploaded a 1024 px variant.
      variants: { w1024: true, original: { bytes: 2 * MB } },
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


// ---- Phase 2 ------------------------------------------------------------------------------------------------------

const KEY = (id: string, f: string) => `/atelier-assets/a/${id}/${f}`;

describe("POST /api/assets, variants, kinds and limits", () => {
  it("returns upload URLs only for the variants asked for", async () => {
    const body = await (await createAsset(post({ ...valid, variants: ["w256", "w1024"] }) as never)).json();
    expect(Object.keys(body.uploads).sort()).toEqual(["original", "w1024", "w256"]);
    expect(new URL(body.uploads.w256).pathname).toBe(KEY(body.assetId, "w256.webp"));
    expect(new URL(body.uploads.w1024).pathname).toBe(KEY(body.assetId, "w1024.webp"));
    expect(new URL(body.uploads.w256).searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(body.duplicateOf).toBeNull();
  });

  it("an empty list means the original only; all three are possible for a large image", async () => {
    const none = await (await createAsset(post({ ...valid, width: 100, height: 80, variants: [] }) as never)).json();
    expect(Object.keys(none.uploads)).toEqual(["original"]);
    const all = await (await createAsset(post({ ...valid, variants: ["w2048", "w256", "w1024", "w256"] }) as never)).json();
    expect(Object.keys(all.uploads).sort()).toEqual(["original", "w1024", "w2048", "w256"]);
  });

  it("refuses variants the image is too small for (never upscaled) and unknown names", async () => {
    expect((await createAsset(post({ ...valid, width: 1500, height: 1000, variants: ["w2048"] }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, width: 200, height: 200, variants: ["w256"] }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, variants: ["w512"] }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, variants: "w256" }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, variants: ["original"] }) as never)).status).toBe(400);
  });

  it("accepts the Phase 2 types and refuses SVG, HEIC, octet-stream and anything else with 415", async () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]) {
      expect((await createAsset(post({ ...valid, mime }) as never)).status, mime).toBe(200);
    }
    for (const mime of ["video/mp4", "video/webm"]) {
      expect((await createAsset(post({ ...valid, mime, kind: "video" }) as never)).status, mime).toBe(200);
    }
    for (const mime of ["image/svg+xml", "image/svg+xml; charset=utf-8", "image/heic", "application/octet-stream", "video/quicktime", "text/html", "application/pdf"]) {
      expect((await createAsset(post({ ...valid, mime }) as never)).status, mime).toBe(415);
    }
  });

  it("kind must match the type: video files are kind video, images are image or gif", async () => {
    expect((await createAsset(post({ ...valid, mime: "video/mp4", kind: "image" }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, mime: "image/png", kind: "video" }) as never)).status).toBe(400);
    expect((await createAsset(post({ ...valid, mime: "image/gif", kind: "gif" }) as never)).status).toBe(200);
    expect((await createAsset(post({ ...valid, kind: "file" }) as never)).status).toBe(400);
    // Omitted: derived from the type.
    expect((await createAsset(post({ ...valid, mime: "video/webm" }) as never)).status).toBe(200);
  });

  it("limits: 50 MB for images, 200 MB for video; 413 beats the type check", async () => {
    expect((await createAsset(post({ ...valid, bytes: 51 * MB }) as never)).status).toBe(413);
    expect((await createAsset(post({ ...valid, mime: "video/mp4", kind: "video", bytes: 150 * MB }) as never)).status).toBe(200);
    expect((await createAsset(post({ ...valid, mime: "video/mp4", kind: "video", bytes: 200 * MB }) as never)).status).toBe(200);
    expect((await createAsset(post({ ...valid, mime: "video/mp4", kind: "video", bytes: 201 * MB }) as never)).status).toBe(413);
    expect((await createAsset(post({ ...valid, mime: "image/svg+xml", bytes: 60 * MB }) as never)).status).toBe(413);
  });

  it("rejects a malformed hash", async () => {
    for (const phash of ["abc", "zzzzzzzzzzzzzzzz", "0123456789abcdef0", 5]) {
      expect((await createAsset(post({ ...valid, phash }) as never)).status, String(phash)).toBe(400);
    }
    expect((await createAsset(post({ ...valid, phash: "0123456789ABCDEF" }) as never)).status).toBe(200);
  });
});

describe("POST /api/assets, duplicates", () => {
  const HASH = "0123456789abcdef";
  const EXISTING = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const row = (over: Record<string, unknown> = {}) => ({ id: EXISTING, owner_id: OWNER, kind: "image", mime: "image/jpeg", bytes: 2 * MB, phash: HASH, hidden: false, ...over });

  it("an asset of the same owner with the same hash and size is reported and no upload URLs are given", async () => {
    pg.tables.assets.push(row());
    const res = await createAsset(post({ ...valid, phash: HASH, variants: ["w256"] }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicateOf).toBe(EXISTING);
    expect(body.uploads).toEqual({});
    expect(JSON.stringify(body)).not.toContain("X-Amz");
  });

  it("is not a duplicate when the size differs, the hash differs, the owner differs, it is hidden, or it is the same asset again", async () => {
    const ask = async (extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => {
      pg.tables.assets.length = 0;
      pg.tables.assets.push(row(over));
      return (await (await createAsset(post({ ...valid, phash: HASH, ...extra }) as never)).json()).duplicateOf;
    };
    expect(await ask({}, { bytes: 3 * MB })).toBeNull();
    expect(await ask({}, { phash: "ffffffffffffffff" })).toBeNull();
    expect(await ask({}, { owner_id: STRANGER })).toBeNull();
    expect(await ask({}, { hidden: true })).toBeNull();
    expect(await ask({ assetId: EXISTING })).toBeNull(); // a retried upload of the same asset
    expect(await ask({})).toBe(EXISTING);
  });

  it("without a hash there is no duplicate check at all", async () => {
    pg.tables.assets.push(row());
    const body = await (await createAsset(post(valid) as never)).json();
    expect(body.duplicateOf).toBeNull();
    expect(pg.stats["assets.select"] ?? 0).toBe(0);
  });

  it("a failing lookup never blocks the upload", async () => {
    pg.failNext("assets", { code: "XX000", message: "boom" });
    const res = await createAsset(post({ ...valid, phash: HASH }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).uploads.original).toBeTruthy();
  });

  it("videos are never deduplicated", async () => {
    pg.tables.assets.push(row({ kind: "video", mime: "video/mp4" }));
    const body = await (await createAsset(post({ ...valid, mime: "video/mp4", kind: "video", phash: HASH }) as never)).json();
    expect(body.duplicateOf).toBeNull();
  });
});

describe("POST /api/assets/:id/complete, Phase 2 fields", () => {
  it("stores the variant list, the kind and the hash", async () => {
    const res = await complete(ASSET, { ...valid, kind: "gif", mime: "image/gif", variants: ["w256", "w1024"], phash: "0123456789ABCDEF" });
    expect(res.status).toBe(200);
    expect(pg.tables.assets[0]).toMatchObject({
      id: ASSET,
      owner_id: OWNER,
      kind: "gif",
      phash: "0123456789abcdef",
      variants: { w256: true, w1024: true, original: { bytes: 2 * MB } },
    });
  });

  it("an image with no variants stores just the original", async () => {
    await complete(ASSET, { ...valid, width: 100, height: 80, variants: [] });
    expect(pg.tables.assets[0].variants).toEqual({ original: { bytes: 2 * MB } });
  });

  it("refuses variants the image is too small for, kinds that do not match the type, SVG and a bad hash", async () => {
    expect((await complete(ASSET, { ...valid, width: 1500, height: 1000, variants: ["w2048"] })).status).toBe(400);
    expect((await complete(ASSET, { ...valid, kind: "video" })).status).toBe(400);
    expect((await complete(ASSET, { ...valid, mime: "image/svg+xml" })).status).toBe(415);
    expect((await complete(ASSET, { ...valid, phash: "nope" })).status).toBe(400);
    expect(pg.tables.assets).toHaveLength(0);
  });

  it("completing again keeps the hash it already had when the retry does not send one", async () => {
    await complete(ASSET, { ...valid, phash: "0123456789abcdef" });
    await complete(ASSET, valid);
    expect(pg.tables.assets[0].phash).toBe("0123456789abcdef");
  });
});

describe("PATCH /api/assets/:id (variants)", () => {
  function patch(id: string, body: unknown) {
    return patchAsset(post(body) as never, { params: Promise.resolve({ id }) });
  }
  const seed = (over: Record<string, unknown> = {}) =>
    pg.tables.assets.push({ id: ASSET, owner_id: OWNER, kind: "image", mime: "image/jpeg", width: 4000, height: 3000, bytes: 2 * MB, variants: { w1024: "a/x/w1024.webp", original: "a/x/original" }, ...over });

  it("merges new variants into what the row already has", async () => {
    seed();
    const res = await patch(ASSET, { variants: { w256: true, w2048: true } });
    expect(res.status).toBe(200);
    expect(pg.tables.assets[0].variants).toEqual({ w1024: "a/x/w1024.webp", original: "a/x/original", w256: true, w2048: true });
  });

  it("is idempotent", async () => {
    seed({ variants: { w1024: true, original: { bytes: 5 } } });
    await patch(ASSET, { variants: { w256: true } });
    await patch(ASSET, { variants: { w256: true } });
    expect(pg.tables.assets[0].variants).toEqual({ w1024: true, original: { bytes: 5 }, w256: true });
  });

  it("401 / 403 like the other routes; 404 for a missing asset and for someone else's", async () => {
    seed();
    claims = null;
    expect((await patch(ASSET, { variants: { w256: true } })).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await patch(ASSET, { variants: { w256: true } })).status).toBe(403);
    claims = ownerClaims;
    expect((await patch("6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e00", { variants: { w256: true } })).status).toBe(404);
    pg.tables.assets[0].owner_id = STRANGER;
    expect((await patch(ASSET, { variants: { w256: true } })).status).toBe(404);
    expect(pg.tables.assets[0].variants).toEqual({ w1024: "a/x/w1024.webp", original: "a/x/original" });
  });

  it("rejects unknown keys, non-true values, unknown names, variants too big for the image, bad ids and bodies", async () => {
    seed({ width: 1500, height: 1000 });
    expect((await patch(ASSET, { variants: { w256: true }, owner_id: STRANGER })).status).toBe(400);
    expect((await patch(ASSET, { variants: { w256: false } })).status).toBe(400);
    expect((await patch(ASSET, { variants: { w512: true } })).status).toBe(400);
    expect((await patch(ASSET, { variants: { w2048: true } })).status).toBe(400);
    expect((await patch(ASSET, {})).status).toBe(400);
    expect((await patch(ASSET, "not json")).status).toBe(400);
    expect((await patch("not-an-id", { variants: { w256: true } })).status).toBe(400);
    expect(pg.tables.assets[0].variants).toEqual({ w1024: "a/x/w1024.webp", original: "a/x/original" });
  });

  it("answers 500 without leaking database details", async () => {
    seed();
    pg.failNext("assets", { code: "XX000", message: "relation secret_table exploded" });
    const res = await patch(ASSET, { variants: { w256: true } });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_table");
  });
});
