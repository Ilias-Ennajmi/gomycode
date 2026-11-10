import { describe, expect, it, vi } from "vitest";
import { createSessionGate, isBotAgent, isPublicPath, sessionAwareFetch, type MinimalSession } from "@/lib/supabase/session";

const S: MinimalSession = { access_token: "user-token", user: { id: "u1" } };

function fakeAuth(opts: { existing?: MinimalSession | null; fail?: boolean } = {}) {
  let current = opts.existing ?? null;
  const signIn = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 5));
    if (opts.fail) return { data: { session: null }, error: new Error("anonymous sign-ins are disabled") };
    current = S;
    return { data: { session: S }, error: null };
  });
  return {
    signIn,
    auth: { getSession: async () => ({ data: { session: current } }), signInAnonymously: signIn },
  };
}

describe("ensureSession", () => {
  it("returns an existing session without signing in", async () => {
    const f = fakeAuth({ existing: S });
    const ensure = createSessionGate(() => f.auth);
    await expect(ensure()).resolves.toBe(S);
    expect(f.signIn).not.toHaveBeenCalled();
  });

  it("signs in once for concurrent callers (StrictMode, parallel loaders)", async () => {
    const f = fakeAuth();
    const created = vi.fn();
    const ensure = createSessionGate(() => f.auth, { onCreated: created });
    const results = await Promise.all([ensure(), ensure(), ensure()]);
    expect(results).toEqual([S, S, S]);
    expect(f.signIn).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
    // Later calls find the stored session.
    await ensure();
    expect(f.signIn).toHaveBeenCalledTimes(1);
  });

  it("never creates an identity on public pages, for bots or offline", async () => {
    for (const opts of [{ isPublicPage: () => true }, { isBot: () => true }, { isOnline: () => false }]) {
      const f = fakeAuth();
      await expect(createSessionGate(() => f.auth, opts)()).resolves.toBeNull();
      expect(f.signIn).not.toHaveBeenCalled();
    }
  });

  it("backs off after a failed sign-in", async () => {
    const f = fakeAuth({ fail: true });
    let t = 1_000;
    const ensure = createSessionGate(() => f.auth, { now: () => t, retryMs: 30_000 });
    await expect(ensure()).resolves.toBeNull();
    await expect(ensure()).resolves.toBeNull();
    expect(f.signIn).toHaveBeenCalledTimes(1);
    t += 30_001;
    await ensure();
    expect(f.signIn).toHaveBeenCalledTimes(2);
  });

  it("returns null when Supabase isn't configured", async () => {
    await expect(createSessionGate(() => null)()).resolves.toBeNull();
  });
});

describe("sessionAwareFetch", () => {
  it("waits for the identity and swaps the publishable key for the user's token on data requests", async () => {
    const base = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => new Response(new Headers(init?.headers).get("Authorization")));
    const ensure = vi.fn(async () => S);
    const f = sessionAwareFetch(ensure, "anon", base as unknown as typeof fetch);
    const r = await f("https://x.supabase.co/rest/v1/saves", { headers: { Authorization: "Bearer anon" } });
    expect(await r.text()).toBe("Bearer user-token");
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("leaves auth requests and already-authorised requests alone", async () => {
    const base = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => new Response(new Headers(init?.headers).get("Authorization")));
    const ensure = vi.fn(async () => S);
    const f = sessionAwareFetch(ensure, "anon", base as unknown as typeof fetch);
    await f("https://x.supabase.co/auth/v1/signup", { headers: { Authorization: "Bearer anon" } });
    const r = await f("https://x.supabase.co/rest/v1/saves", { headers: { Authorization: "Bearer other" } });
    expect(await r.text()).toBe("Bearer other");
    expect(ensure).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("knows public paths and bots", () => {
    expect(isPublicPath("/design")).toBe(true);
    expect(isPublicPath("/c/abc")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
    expect(isPublicPath("/collections")).toBe(false);
    expect(isBotAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotAgent("WhatsApp/2.23")).toBe(true);
    expect(isBotAgent("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36")).toBe(false);
    // Playwright (scripts/e2e-smoke.mjs) is a real browser, not a crawler.
    expect(isBotAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0 Safari/537.36")).toBe(false);
    expect(isBotAgent("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isBotAgent("Slackbot-LinkExpanding 1.0")).toBe(true);
  });
});

describe("ensureSession on a device that had an identity", () => {
  const OLD: MinimalSession = { access_token: "old", user: { id: "u-old" } };

  function auth(refreshed: MinimalSession | null) {
    const f = fakeAuth();
    const refreshSession = vi.fn(async () => ({ data: { session: refreshed }, error: refreshed ? null : new Error("no refresh token") }));
    return { ...f, refreshSession, auth: { ...f.auth, refreshSession } };
  }

  it("tries a refresh first and keeps the old identity when it works", async () => {
    const a = auth(OLD);
    const replaced = vi.fn();
    const remembered: string[] = [];
    const ensure = createSessionGate(() => a.auth, {
      hadIdentity: () => true,
      rememberIdentity: (id) => remembered.push(id),
      onReplaced: replaced,
    });
    await expect(ensure()).resolves.toBe(OLD);
    expect(a.refreshSession).toHaveBeenCalledTimes(1);
    expect(a.signIn).not.toHaveBeenCalled();
    expect(replaced).not.toHaveBeenCalled();
    expect(remembered).toEqual(["u-old"]);
  });

  it("makes a new identity when the refresh fails, and says so", async () => {
    const a = auth(null);
    const replaced = vi.fn();
    const created = vi.fn();
    const ensure = createSessionGate(() => a.auth, { hadIdentity: () => true, onReplaced: replaced, onCreated: created });
    await expect(ensure()).resolves.toBe(S);
    expect(a.signIn).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
    expect(replaced).toHaveBeenCalledTimes(1);
  });

  it("a first-ever identity is not a replacement and needs no refresh", async () => {
    const a = auth(null);
    const replaced = vi.fn();
    const remembered: string[] = [];
    const ensure = createSessionGate(() => a.auth, {
      hadIdentity: () => false,
      rememberIdentity: (id) => remembered.push(id),
      onReplaced: replaced,
    });
    await expect(ensure()).resolves.toBe(S);
    expect(a.refreshSession).not.toHaveBeenCalled();
    expect(replaced).not.toHaveBeenCalled();
    expect(remembered).toEqual(["u1"]);
  });
});
