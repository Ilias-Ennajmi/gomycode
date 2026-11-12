import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg, type FakePg } from "./helpers/fake-pg";

let pg: FakePg;
let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => pg.client(claims)),
}));

import { GET as getAssets } from "@/app/api/assets/route";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const B = "7a1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e60";
const C = "8b1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e61";

const get = (qs: string) => getAssets(new Request(`http://atelier.test/api/assets${qs}`) as never);
const seed = (id: string, over: Record<string, unknown> = {}) =>
  pg.tables.assets.push({ id, owner_id: OWNER, kind: "image", mime: "image/jpeg", width: 4000, height: 3000, bytes: 123, variants: { w256: true, w1024: true, w2048: true, original: { bytes: 123 } }, palette: [], phash: null, title: null, analysis_version: 0, hidden: false, ...over });

beforeEach(() => {
  pg = createFakePg();
  claims = { sub: OWNER, aal: "aal2" };
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/assets?ids=", () => {
  it("answers 401 without a session and 403 for someone else", async () => {
    claims = null;
    expect((await get(`?ids=${A}`)).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await get(`?ids=${A}`)).status).toBe(403);
  });

  it("returns the size, variants and analysis of the asked-for assets, and only those", async () => {
    seed(A, { phash: "0123456789abcdef", palette: [{ hex: "#112233", weight: 1 }], title: "Harbour", analysis_version: 1 });
    seed(B, { width: 800, height: 600, variants: { w256: true, original: { bytes: 1 } } });
    seed(C);
    const res = await get(`?ids=${A},${B}`);
    expect(res.status).toBe(200);
    const { assets } = (await res.json()) as { assets: Record<string, unknown>[] };
    expect(assets.map((a) => a.id).sort()).toEqual([A, B].sort());
    const a = assets.find((x) => x.id === A)!;
    expect(a).toMatchObject({ kind: "image", width: 4000, height: 3000, variants: ["w256", "w1024", "w2048"], phash: "0123456789abcdef", title: "Harbour", analysisVersion: 1 });
    expect(a.palette).toEqual([{ hex: "#112233", weight: 1 }]);
    expect(assets.find((x) => x.id === B)!.variants).toEqual(["w256"]);
  });

  it("understands a Phase 1 row (variant keys holding object keys) and ignores unknown keys", async () => {
    seed(A, { variants: { w1024: "a/x/w1024.webp", original: "a/x/original", thumb: "nope" } });
    const { assets } = (await (await get(`?ids=${A}`)).json()) as { assets: { variants: string[] }[] };
    expect(assets[0].variants).toEqual(["w1024"]);
  });

  it("never returns someone else's asset", async () => {
    seed(A, { owner_id: STRANGER });
    const res = await get(`?ids=${A}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { assets: unknown[] }).assets).toEqual([]);
  });

  it("skips rows that cannot be drawn (no size)", async () => {
    seed(A, { width: null, height: null, kind: "file" });
    expect(((await (await get(`?ids=${A}`)).json()) as { assets: unknown[] }).assets).toEqual([]);
  });

  it("answers 400 for no ids, a bad id, or more than 200", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?ids=")).status).toBe(400);
    expect((await get(`?ids=${A},not-an-id`)).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => `6f1c2d3e-4b5a-4c6d-8e7f-${String(i).padStart(12, "0")}`).join(",");
    expect((await get(`?ids=${many}`)).status).toBe(400);
  });

  it("answers 500 without leaking database details, and never caches", async () => {
    seed(A);
    expect((await get(`?ids=${A}`)).headers.get("cache-control")).toBe("no-store");
    pg.failNext("assets", { code: "XX000", message: "relation secret_table exploded" });
    const res = await get(`?ids=${A}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_table");
  });

  it("is refused in local-only mode (nothing is stored on a server)", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    expect((await get(`?ids=${A}`)).status).toBe(503);
  });
});
