import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requireOwner() builds a server client from the request cookies; stand in for it.
const auth = {
  getClaims: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
};
const fakeClient = { auth };
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => fakeClient),
}));

import { isLocalOnly, isOwnerId, requireOwner } from "@/lib/server/owner";
import { createServerClient } from "@/lib/supabase/server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("isOwnerId", () => {
  const env = { ATELIER_OWNER_ID: OWNER };

  it("is true only for the configured owner id", () => {
    expect(isOwnerId(OWNER, env)).toBe(true);
    expect(isOwnerId(STRANGER, env)).toBe(false);
  });

  it("is false for undefined, empty and whitespace ids", () => {
    expect(isOwnerId(undefined, env)).toBe(false);
    expect(isOwnerId("", env)).toBe(false);
    expect(isOwnerId("   ", env)).toBe(false);
  });

  it("ignores case and surrounding whitespace in the configured id", () => {
    expect(isOwnerId(OWNER.toUpperCase(), { ATELIER_OWNER_ID: `  ${OWNER}  ` })).toBe(true);
  });

  it("is false for everybody when no owner is configured, including undefined === undefined", () => {
    expect(isOwnerId(OWNER, {})).toBe(false);
    expect(isOwnerId(undefined, {})).toBe(false);
    expect(isOwnerId("", { ATELIER_OWNER_ID: "" })).toBe(false);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("ATELIER_OWNER_ID", OWNER);
    expect(isOwnerId(OWNER)).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("isLocalOnly", () => {
  it("is false without the flag", () => {
    expect(isLocalOnly({})).toBe(false);
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "" })).toBe(false);
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "0" })).toBe(false);
  });

  it("is true with the flag in development, preview and when VERCEL_ENV is unset", () => {
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "1" })).toBe(true);
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "1", VERCEL_ENV: "development" })).toBe(true);
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "1", VERCEL_ENV: "preview" })).toBe(true);
  });

  it("only accepts the exact value 1", () => {
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "true" })).toBe(false);
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "yes" })).toBe(false);
  });

  it("throws when requested in production", () => {
    expect(() => isLocalOnly({ ATELIER_LOCAL_ONLY: "1", VERCEL_ENV: "production" })).toThrow(
      "Local-only mode is not allowed in production",
    );
  });

  it("does not throw in production when the flag is off", () => {
    expect(isLocalOnly({ VERCEL_ENV: "production" })).toBe(false);
    expect(isLocalOnly({ ATELIER_LOCAL_ONLY: "0", VERCEL_ENV: "production" })).toBe(false);
  });
});

describe("requireOwner", () => {
  beforeEach(() => {
    vi.stubEnv("ATELIER_OWNER_ID", OWNER);
    vi.stubEnv("ATELIER_LOCAL_ONLY", "");
    vi.stubEnv("VERCEL_ENV", "");
    auth.getClaims.mockReset();
    auth.mfa.getAuthenticatorAssuranceLevel.mockReset();
    // By default no second step is pending.
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(fakeClient as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  async function rejection(): Promise<Response> {
    try {
      await requireOwner();
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      return e as Response;
    }
    throw new Error("requireOwner did not throw");
  }

  it("returns the user id and a Supabase client for the owner", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal1" } }, error: null });
    const result = await requireOwner();
    expect(result.userId).toBe(OWNER);
    expect(result.supabase).toBe(fakeClient);
  });

  it("throws a 401 Response when there is no session", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    const res = await rejection();
    expect(res.status).toBe(401);
  });

  it("throws a 401 Response when the token cannot be verified", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { message: "bad jwt" } });
    expect((await rejection()).status).toBe(401);
  });

  it("throws a 403 Response for another Supabase identity (e.g. a Stash anonymous user)", async () => {
    auth.getClaims.mockResolvedValue({
      data: { claims: { sub: STRANGER, is_anonymous: true, aal: "aal1" } },
      error: null,
    });
    const res = await rejection();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("throws a 403 Response for a signed-in non-owner", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: STRANGER, aal: "aal1" } }, error: null });
    expect((await rejection()).status).toBe(403);
  });

  it("refuses an anonymous identity even if its id equals the owner id", async () => {
    auth.getClaims.mockResolvedValue({
      data: { claims: { sub: OWNER, is_anonymous: true, aal: "aal1" } },
      error: null,
    });
    expect((await rejection()).status).toBe(403);
  });

  it("refuses everybody when no owner id is configured", async () => {
    vi.stubEnv("ATELIER_OWNER_ID", "");
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal1" } }, error: null });
    expect((await rejection()).status).toBe(403);
  });

  it("asks for the second step when the owner has two-step verification but only aal1", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal1" } }, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const res = await rejection();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "mfa-required" });
  });

  it("lets the owner through once the second step is done", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal2" } }, error: null });
    await expect(requireOwner()).resolves.toMatchObject({ userId: OWNER });
    expect(auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it("fails closed when the assurance level cannot be read", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, aal: "aal1" } }, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: "x" } });
    expect((await rejection()).status).toBe(401);
  });

  it("throws 503 in local-only mode (there is no account to check)", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    const res = await rejection();
    expect(res.status).toBe(503);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("refuses local-only mode in production instead of opening the door", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(requireOwner()).rejects.toThrow("Local-only mode is not allowed in production");
  });

  it("throws 503 when Supabase is not configured", async () => {
    vi.mocked(createServerClient).mockResolvedValue(null);
    expect((await rejection()).status).toBe(503);
  });
});
