import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShareStore, setShareStore } from "@/lib/server/share-store";
import { MemoryShareStore } from "@/lib/server/share-store-memory";

beforeEach(() => {
  setShareStore(null);
  delete (globalThis as { __atelierMemoryShare?: unknown }).__atelierMemoryShare;
});
afterEach(() => {
  setShareStore(null);
  vi.unstubAllEnvs();
});

describe("getShareStore", () => {
  it("is the in-memory store in local-only mode, and always the same one", () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    vi.stubEnv("VERCEL_ENV", "");
    const a = getShareStore();
    expect(a).toBeInstanceOf(MemoryShareStore);
    expect(getShareStore()).toBe(a);
  });

  it("refuses local-only mode in production instead of serving from memory", () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getShareStore()).toThrow(/not allowed in production/);
  });

  it("answers 503 not-configured when there is no database", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    try {
      getShareStore();
      throw new Error("did not throw");
    } catch (e) {
      expect((e as Response).status).toBe(503);
      expect(await (e as Response).json()).toEqual({ error: "not-configured" });
    }
  });

  it("uses the Supabase store when the service key is set", () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const s = getShareStore();
    expect(s).not.toBeInstanceOf(MemoryShareStore);
    expect(getShareStore()).toBe(s);
  });

  it("setShareStore overrides it for tests", () => {
    const mine = new MemoryShareStore();
    setShareStore(mine);
    expect(getShareStore()).toBe(mine);
  });
});
