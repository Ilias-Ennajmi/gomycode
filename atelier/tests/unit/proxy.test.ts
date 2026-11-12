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
const STRANGER = "22222222-2222-4222-8222-222222222222";

function req(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}
function session(claims: Record<string, unknown>) {
  auth.getClaims.mockResolvedValue({ data: { claims }, error: null });
}
function noSession() {
  auth.getClaims.mockResolvedValue({ data: null, error: null });
}
function levels(currentLevel: string | null, nextLevel: string | null) {
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel, nextLevel },
    error: null,
  });
}
/** Where a redirect response points, as path + query. */
function location(res: Response) {
  const h = res.headers.get("location");
  expect(h).toBeTruthy();
  const u = new URL(h!);
  return u.pathname + u.search;
}
const isPassThrough = (res: Response) =>
  res.headers.get("x-middleware-next") === "1" && !res.headers.get("location");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  vi.stubEnv("VERCEL_ENV", "");
  auth.getClaims.mockReset();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.mfa.getAuthenticatorAssuranceLevel.mockReset();
  levels("aal1", "aal1");
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy: no session", () => {
  it("redirects a page request to /login with the original path in next", async () => {
    noSession();
    const res = await proxy(req("/"));
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/login?next=%2F");
  });

  it("keeps the query string in next", async () => {
    noSession();
    const res = await proxy(req("/b/abc?frame=2"));
    expect(location(res)).toBe("/login?next=%2Fb%2Fabc%3Fframe%3D2");
  });

  it("never signs anybody in anonymously", async () => {
    noSession();
    await proxy(req("/"));
    expect(auth).not.toHaveProperty("signInAnonymously");
  });

  it("treats an unverifiable token like no session", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { message: "jwt expired" } });
    const res = await proxy(req("/settings"));
    expect(location(res)).toBe("/login?next=%2Fsettings");
  });

  it("lets the login page itself render", async () => {
    noSession();
    expect(isPassThrough(await proxy(req("/login")))).toBe(true);
    expect(isPassThrough(await proxy(req("/login?error=not-owner")))).toBe(true);
  });

  it("sends /login/verify without a session back to /login", async () => {
    noSession();
    expect(location(await proxy(req("/login/verify")))).toBe("/login");
  });

  it("answers API calls with 401 JSON instead of a redirect", async () => {
    noSession();
    const res = await proxy(req("/api/boards"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

describe("proxy: someone who is not the owner", () => {
  it("signs out and redirects to /login?error=not-owner", async () => {
    session({ sub: STRANGER, aal: "aal1" });
    const res = await proxy(req("/"));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(location(res)).toBe("/login?error=not-owner");
  });

  it("treats a Stash-style anonymous identity as a non-owner", async () => {
    session({ sub: STRANGER, is_anonymous: true, aal: "aal1" });
    const res = await proxy(req("/b/abc"));
    expect(auth.signOut).toHaveBeenCalled();
    expect(location(res)).toBe("/login?error=not-owner");
  });

  it("treats an anonymous identity as a non-owner even with the owner's id", async () => {
    session({ sub: OWNER, is_anonymous: true, aal: "aal1" });
    const res = await proxy(req("/"));
    expect(location(res)).toBe("/login?error=not-owner");
  });

  it("refuses everyone when no owner id is configured", async () => {
    vi.stubEnv("ATELIER_OWNER_ID", "");
    session({ sub: OWNER, aal: "aal1" });
    expect(location(await proxy(req("/")))).toBe("/login?error=not-owner");
  });

  it("answers API calls with 403 JSON and still signs out", async () => {
    session({ sub: STRANGER, aal: "aal1" });
    const res = await proxy(req("/api/boards/1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not loop when a non-owner is already on /login", async () => {
    session({ sub: STRANGER, aal: "aal1" });
    const res = await proxy(req("/login?error=not-owner"));
    expect(auth.signOut).toHaveBeenCalled();
    expect(isPassThrough(res)).toBe(true);
  });
});

describe("proxy: the owner", () => {
  it("passes through", async () => {
    session({ sub: OWNER, aal: "aal1" });
    expect(isPassThrough(await proxy(req("/")))).toBe(true);
    expect(isPassThrough(await proxy(req("/b/abc")))).toBe(true);
    expect(isPassThrough(await proxy(req("/api/boards")))).toBe(true);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("is sent to /login/verify when two-step verification is on but not done", async () => {
    session({ sub: OWNER, aal: "aal1" });
    levels("aal1", "aal2");
    const res = await proxy(req("/b/abc?x=1"));
    expect(location(res)).toBe("/login/verify?next=%2Fb%2Fabc%3Fx%3D1");
  });

  it("passes once the second step is done, without asking Supabase again", async () => {
    session({ sub: OWNER, aal: "aal2" });
    levels("aal2", "aal2");
    expect(isPassThrough(await proxy(req("/")))).toBe(true);
    expect(auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it("guards the settings page the same way", async () => {
    session({ sub: OWNER, aal: "aal1" });
    levels("aal1", "aal2");
    expect(location(await proxy(req("/settings")))).toBe("/login/verify?next=%2Fsettings");
  });

  it("answers API calls that still need the second step with 401 mfa-required", async () => {
    session({ sub: OWNER, aal: "aal1" });
    levels("aal1", "aal2");
    const res = await proxy(req("/api/boards"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "mfa-required" });
  });

  it("fails closed with 503 when the assurance level cannot be read", async () => {
    session({ sub: OWNER, aal: "aal1" });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: "x" } });
    const res = await proxy(req("/"));
    expect(res.status).toBe(503);
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("can open /login/verify while the second step is pending", async () => {
    session({ sub: OWNER, aal: "aal1" });
    levels("aal1", "aal2");
    expect(isPassThrough(await proxy(req("/login/verify?next=%2F")))).toBe(true);
  });
});

describe("proxy: paths that never need a session", () => {
  const open = [
    "/brand/favicon.svg",
    "/brand/atelier-lockup-light.svg",
    "/sw.js",
    "/sw-share.js",
    "/share-target",
    "/manifest.webmanifest",
    "/offline.html",
    "/api/health",
    "/_next/static/chunks/main.js",
    "/favicon.ico",
  ];
  it.each(open)("passes %s through without looking at the session", async (path) => {
    noSession();
    const res = await proxy(req(path));
    expect(isPassThrough(res)).toBe(true);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("does not treat look-alike paths as open", async () => {
    noSession();
    expect((await proxy(req("/api/healthz"))).status).toBe(401);
    const res = await proxy(req("/brandx/secret"));
    expect(location(res)).toBe("/login?next=%2Fbrandx%2Fsecret");
  });
});

describe("proxy: local-only mode", () => {
  it("passes everything through with no Supabase calls", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    for (const path of ["/", "/b/abc", "/settings", "/login", "/api/boards"]) {
      expect(isPassThrough(await proxy(req(path)))).toBe(true);
    }
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("is refused in production", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(proxy(req("/"))).rejects.toThrow("Local-only mode is not allowed in production");
  });
});

describe("proxy: misconfiguration fails closed", () => {
  it("answers 503 for app pages when Supabase env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await proxy(req("/"));
    expect(res.status).toBe(503);
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("still serves the open paths", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isPassThrough(await proxy(req("/brand/favicon.svg")))).toBe(true);
  });
});
