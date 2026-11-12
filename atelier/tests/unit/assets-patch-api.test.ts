import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { POST as completeAsset } from "@/app/api/assets/[id]/complete/route";
import { PATCH as patchAsset } from "@/app/api/assets/[id]/route";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const ASSET = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const OTHERS = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e00";
const ownerClaims = { sub: OWNER, aal: "aal2" };

const req = (body: unknown) =>
  new Request("http://atelier.test/api/assets/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const patch = (id: string, body: unknown) => patchAsset(req(body) as never, { params: Promise.resolve({ id }) });
const complete = (id: string, body: unknown) => completeAsset(req(body) as never, { params: Promise.resolve({ id }) });
const row = () => pg.tables.assets.find((r) => r.id === ASSET)!;
const colour = (i: number) => ({ hex: "#" + (i * 17).toString(16).padStart(2, "0").repeat(3), weight: 1 / 12 });

beforeEach(() => {
  pg = createFakePg();
  claims = ownerClaims;
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  pg.tables.assets.push({ id: ASSET, owner_id: OWNER, kind: "image", mime: "image/jpeg", width: 4000, height: 3000, bytes: 5, variants: { w1024: true, original: { bytes: 5 } }, palette: [], phash: null, analysis_version: 0, title: null });
  pg.tables.assets.push({ id: OTHERS, owner_id: STRANGER, kind: "image", mime: "image/jpeg", width: 4000, height: 3000, bytes: 5, variants: {}, palette: [], phash: null, analysis_version: 0, title: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("PATCH /api/assets/:id (analysis, title, provenance)", () => {
  it("is owner-only: 401 without a session, 403 for another user or an anonymous identity", async () => {
    claims = null;
    expect((await patch(ASSET, { title: "x" })).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await patch(ASSET, { title: "x" })).status).toBe(403);
    claims = { sub: OWNER, is_anonymous: true, aal: "aal2" };
    expect((await patch(ASSET, { title: "x" })).status).toBe(403);
    expect(row().title).toBeNull();
  });

  it("stores palette, phash and analysisVersion", async () => {
    const palette = [{ hex: "#dc1e28", weight: 0.6 }, { hex: "#1e3cc8", weight: 0.4 }];
    const res = await patch(ASSET, { palette, phash: "0123456789ABCDEF", analysisVersion: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetId: ASSET });
    expect(row()).toMatchObject({ palette, phash: "0123456789abcdef", analysis_version: 1 });
    expect(row().variants).toEqual({ w1024: true, original: { bytes: 5 } }); // untouched
  });

  it("accepts an empty palette (analysed, nothing to find) and 12 colours; rejects 13", async () => {
    expect((await patch(ASSET, { palette: [], analysisVersion: 1 })).status).toBe(200);
    expect((await patch(ASSET, { palette: Array.from({ length: 12 }, (_, i) => colour(i)) })).status).toBe(200);
    expect((await patch(ASSET, { palette: Array.from({ length: 13 }, (_, i) => colour(i)) })).status).toBe(400);
    expect(row().palette).toHaveLength(12);
  });

  it("rejects malformed palette entries, hashes and versions", async () => {
    for (const body of [
      { palette: [{ hex: "red", weight: 1 }] },
      { palette: [{ hex: "#ff0000", weight: 1.5 }] },
      { palette: [{ hex: "#ff0000", weight: -0.1 }] },
      { palette: [{ hex: "#ff0000", weight: Number.NaN }] },
      { palette: [{ hex: "#ff0000" }] },
      { palette: [{ hex: "#ff0000", weight: 1, extra: 1 }] },
      { palette: "nope" },
      { phash: "xyz" },
      { phash: "0123456789abcde" },
      { analysisVersion: 2 },
      { analysisVersion: 0 },
      { title: "x".repeat(201) },
      { title: 5 },
    ]) {
      expect((await patch(ASSET, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(row().palette).toEqual([]);
    expect(row().phash).toBeNull();
  });

  it("rejects unknown keys, an empty body and bad JSON", async () => {
    expect((await patch(ASSET, { title: "x", owner_id: STRANGER })).status).toBe(400);
    expect((await patch(ASSET, { analysis_version: 1 })).status).toBe(400);
    expect((await patch(ASSET, { bytes: 1 })).status).toBe(400);
    expect((await patch(ASSET, {})).status).toBe(400);
    expect((await patch(ASSET, "not json")).status).toBe(400);
    expect(row().owner_id).toBe(OWNER);
  });

  it("stores a trimmed title", async () => {
    expect((await patch(ASSET, { title: "  Harbour at dusk " })).status).toBe(200);
    expect(row().title).toBe("Harbour at dusk");
  });

  it("maps provenance onto source_url, credit, licence and captured_at", async () => {
    const provenance = { sourceUrl: "https://example.com/photo", credit: "A. Photographer", licence: "CC BY 4.0", capturedAt: "2026-03-04" };
    expect((await patch(ASSET, { provenance })).status).toBe(200);
    expect(row()).toMatchObject({ source_url: "https://example.com/photo", credit: "A. Photographer", licence: "CC BY 4.0", captured_at: "2026-03-04" });
    expect((await patch(ASSET, { provenance: { sourceUrl: null, credit: "", licence: "", capturedAt: null } })).status).toBe(200);
    expect(row()).toMatchObject({ source_url: null, credit: null, licence: null, captured_at: null });
  });

  it("rejects provenance that is not a web link, too long, or not a date", async () => {
    const ok = { sourceUrl: null, credit: "", licence: "", capturedAt: null };
    for (const p of [
      { ...ok, sourceUrl: "javascript:alert(1)" },
      { ...ok, sourceUrl: "file:///etc/passwd" },
      { ...ok, sourceUrl: "https://user:pw@example.com/photo" },
      { ...ok, sourceUrl: "https://user@example.com/photo" },
      { ...ok, sourceUrl: "https://example.com/" + "a".repeat(2100) },
      { ...ok, credit: "c".repeat(501) },
      { ...ok, licence: "l".repeat(201) },
      { ...ok, capturedAt: "yesterday" },
      { ...ok, extra: true },
      { sourceUrl: null },
    ]) {
      expect((await patch(ASSET, { provenance: p })).status, JSON.stringify(p)).toBe(400);
    }
    expect(row().source_url ?? null).toBeNull();
  });

  it("still records variants, alone or with the other fields", async () => {
    expect((await patch(ASSET, { variants: { w256: true }, title: "t" })).status).toBe(200);
    expect(row().variants).toMatchObject({ w1024: true, w256: true });
    expect(row().title).toBe("t");
  });

  it("only touches the caller's asset: someone else's id and a missing id are 404", async () => {
    expect((await patch(OTHERS, { title: "mine now" })).status).toBe(404);
    expect((await patch("6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4eaa", { title: "x" })).status).toBe(404);
    expect(pg.tables.assets.find((r) => r.id === OTHERS)!.title).toBeNull();
  });
});

describe("POST /api/assets/:id/complete with analysis", () => {
  const base = { mime: "image/jpeg", bytes: 2_000_000, width: 4000, height: 3000 };

  it("stores palette and phash and marks the analysis done", async () => {
    const palette = [{ hex: "#dc1e28", weight: 1 }];
    expect((await complete(ASSET, { ...base, palette, phash: "0123456789abcdef" })).status).toBe(200);
    expect(row()).toMatchObject({ palette, phash: "0123456789abcdef", analysis_version: 1 });
  });

  it("an empty palette still counts as analysed", async () => {
    expect((await complete(ASSET, { ...base, palette: [], phash: "0000000000000000" })).status).toBe(200);
    expect(row()).toMatchObject({ palette: [], analysis_version: 1 });
  });

  it("without a palette the analysis is left for the backfill and nothing is erased", async () => {
    pg.tables.assets[0].palette = [{ hex: "#000000", weight: 1 }];
    pg.tables.assets[0].analysis_version = 1;
    expect((await complete(ASSET, base)).status).toBe(200);
    expect(row()).toMatchObject({ palette: [{ hex: "#000000", weight: 1 }], analysis_version: 1 });
  });

  it("a new asset without a palette starts at analysis_version 0", async () => {
    const id = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4ebb";
    expect((await complete(id, base)).status).toBe(200);
    const created = pg.tables.assets.find((r) => r.id === id)!;
    expect(created.analysis_version ?? 0).toBe(0);
  });

  it("rejects 13 colours and malformed entries", async () => {
    expect((await complete(ASSET, { ...base, palette: Array.from({ length: 13 }, (_, i) => colour(i)) })).status).toBe(400);
    expect((await complete(ASSET, { ...base, palette: [{ hex: "nope", weight: 1 }] })).status).toBe(400);
  });
});
