import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  getClaims: vi.fn(),
  signOut: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
};
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth })),
}));

import { proxy } from "@/proxy";

const OWNER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "A".repeat(43);

const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(path, "http://localhost:3000"), init);
const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1" && !res.headers.get("location");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  vi.stubEnv("VERCEL_ENV", "");
  auth.getClaims.mockReset().mockResolvedValue({ data: null, error: null }); // nobody is signed in
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.mfa.getAuthenticatorAssuranceLevel.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy: share routes are public", () => {
  it.each([
    `/s/${TOKEN}`,
    `/s/${TOKEN}/`,
    `/s/${TOKEN}?x=1`,
    `/api/s/${TOKEN}/meta`,
    `/api/s/${TOKEN}/session`,
    `/api/s/${TOKEN}/unlock`,
    `/api/s/${TOKEN}/join`,
    `/api/s/${TOKEN}/board`,
    `/api/s/${TOKEN}/reactions`,
  ])("%s goes through with no session and without asking Supabase who is there", async (path) => {
    const res = await proxy(req(path, { method: path.includes("/api/") ? "POST" : "GET" }));
    expect(passesThrough(res), path).toBe(true);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("stays public when someone IS signed in as the owner (no owner state is attached or required)", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal2" } }, error: null });
    expect(passesThrough(await proxy(req(`/s/${TOKEN}`)))).toBe(true);
  });
});

describe("proxy: nothing else became public", () => {
  it.each(["/s", "/sx/abc", "/api/s", "/api/sx/abc", "/api/share-links/abc", "/api/share-links/abc/revoke", `/api/boards/b1/share-links`, "/b/abc", "/b/abc/s/x", "/shared/abc", "/api/inbox"])(
    "%s still needs the owner",
    async (path) => {
      const res = await proxy(req(path));
      expect(passesThrough(res), path).toBe(false);
      if (path.startsWith("/api/")) expect(res.status).toBe(401);
      else expect(res.headers.get("location")).toMatch(/\/login/);
    },
  );

  it("dot segments cannot smuggle an owner page under /s/ (the URL is normalised before the check)", async () => {
    for (const path of ["/s/../b/abc", "/s/%2e%2e/b/abc", "/s/%2E%2E/api/boards", "/api/s/../boards", "/api/s/%2e%2e/boards"]) {
      const res = await proxy(req(path));
      expect(passesThrough(res), path).toBe(false);
    }
  });

  it("an owner API call with a stranger's session is still refused", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "22222222-2222-4222-8222-222222222222" } }, error: null });
    const res = await proxy(req("/api/share-links/abc", { method: "PATCH" }));
    expect(res.status).toBe(403);
  });

  it("the owner still gets through to their own routes", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal2" } }, error: null });
    expect(passesThrough(await proxy(req("/api/share-links/abc", { method: "PATCH" })))).toBe(true);
  });
});
