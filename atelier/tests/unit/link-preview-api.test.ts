import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePg } from "./helpers/fake-pg";

let claims: Record<string, unknown> | null;
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => createFakePg().client(claims)),
}));
vi.mock("@/lib/server/safe-fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/safe-fetch")>("@/lib/server/safe-fetch");
  return { ...actual, safeFetch: vi.fn(actual.safeFetch) };
});

import { GET as getImage } from "@/app/api/link-preview/image/route";
import { POST as postPreview } from "@/app/api/link-preview/route";
import { imageLimiter, previewLimiter } from "@/lib/server/link-preview-limits";
import { SafeFetchError, safeFetch, type SafeFetchCode } from "@/lib/server/safe-fetch";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const enc = new TextEncoder();

const mocked = vi.mocked(safeFetch);
const ok = (html: string, finalUrl = "https://example.com/page") => ({ finalUrl, status: 200, contentType: "text/html; charset=utf-8", body: enc.encode(html) });

function preview(body: unknown) {
  return postPreview(new Request("http://atelier.test/api/link-preview", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }) as never);
}
function image(url?: string) {
  const q = url === undefined ? "" : `?url=${encodeURIComponent(url)}`;
  return getImage(new Request(`http://atelier.test/api/link-preview/image${q}`) as never);
}

beforeEach(async () => {
  claims = { sub: OWNER, aal: "aal2" };
  vi.stubEnv("ATELIER_OWNER_ID", OWNER);
  vi.stubEnv("ATELIER_LOCAL_ONLY", "");
  const actual = await vi.importActual<typeof import("@/lib/server/safe-fetch")>("@/lib/server/safe-fetch");
  mocked.mockReset();
  mocked.mockImplementation(actual.safeFetch);
  previewLimiter.reset();
  imageLimiter.reset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST /api/link-preview: access", () => {
  it("401 without a session, and never fetches", async () => {
    claims = null;
    expect((await preview({ url: "https://example.com" })).status).toBe(401);
    expect(mocked).not.toHaveBeenCalled();
  });
  it("403 for another user and for an anonymous identity from the same project", async () => {
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await preview({ url: "https://example.com" })).status).toBe(403);
    claims = { sub: OWNER, is_anonymous: true, aal: "aal2" };
    expect((await preview({ url: "https://example.com" })).status).toBe(403);
    expect(mocked).not.toHaveBeenCalled();
  });
  it("503 in local-only mode", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    const res = await preview({ url: "https://example.com" });
    expect(res.status).toBe(503);
    expect(mocked).not.toHaveBeenCalled();
  });
  it("unauthorised requests do not consume the rate limit", async () => {
    claims = null;
    for (let i = 0; i < 40; i++) await preview({ url: "https://example.com" });
    claims = { sub: OWNER, aal: "aal2" };
    mocked.mockResolvedValue(ok("<title>x</title>"));
    expect((await preview({ url: "https://example.com" })).status).toBe(200);
  });
});

describe("POST /api/link-preview: behaviour", () => {
  it("200 with a LinkPreview, fetching through safeFetch with the plan's limits", async () => {
    mocked.mockResolvedValue(ok(`<title>Hi</title><meta property="og:image" content="/i.png">`, "https://example.com/final"));
    const res = await preview({ url: "https://example.com/start" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      title: "Hi",
      description: "",
      siteName: "example.com",
      imageUrl: "https://example.com/i.png",
      faviconUrl: "https://example.com/favicon.ico",
      finalUrl: "https://example.com/final",
    });
    const [url, o] = mocked.mock.calls[0];
    expect(url).toBe("https://example.com/start");
    expect(o.maxBytes).toBe(512 * 1024);
    expect(o.onLimit).toBe("truncate");
    expect(o.accept.test("text/html")).toBe(true);
    expect(o.accept.test("application/xhtml+xml")).toBe(true);
    expect(o.accept.test("image/png")).toBe(false);
    expect(o.accept.test("application/json")).toBe(false);
  });

  it("returns hostile page metadata as inert text, never raw HTML", async () => {
    mocked.mockResolvedValue(
      ok(`<title><script>alert(1)</script>Hello</title><meta property="og:description" content="${"x".repeat(1_000_000)}"><meta property="og:image" content="javascript:alert(1)">`),
    );
    const j = await (await preview({ url: "https://example.com" })).json();
    expect(j.title).toBe("Hello");
    expect(j.description).toHaveLength(400);
    expect(j.imageUrl).toBeNull();
    expect(JSON.stringify(j)).not.toContain("<script");
  });

  it.each(["http://127.0.0.1", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://2130706433/", "http://0x7f.1/", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd", "javascript:alert(1)", "ftp://example.com/", "http://u:p@example.com/", "http://example.com:8080/", "not a url", "http://intranet/"])("400 blocked for %s, with the real fetcher and no network", async (url) => {
    const res = await preview({ url });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "blocked" });
  });

  it("answers identically for internal and malformed targets, so the response cannot probe the network", async () => {
    const a = await (await preview({ url: "http://10.0.0.1/" })).text();
    const b = await (await preview({ url: "http://definitely not a url" })).text();
    expect(a).toBe(b);
  });

  it.each<[SafeFetchCode, number, string]>([
    ["bad-url", 400, "blocked"],
    ["blocked-address", 400, "blocked"],
    ["timeout", 504, "timeout"],
    ["too-many-redirects", 502, "unreachable"],
    ["too-large", 502, "unreachable"],
    ["bad-content-type", 502, "unreachable"],
    ["http-status", 502, "unreachable"],
  ])("maps SafeFetchError %s to %i %s", async (code, status, error) => {
    mocked.mockRejectedValue(new SafeFetchError(code));
    const res = await preview({ url: "https://example.com" });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("maps resolver and socket failures to 502 unreachable without leaking the message", async () => {
    mocked.mockRejectedValue(new Error("getaddrinfo ENOTFOUND secret.internal.corp 10.1.2.3"));
    const res = await preview({ url: "https://example.com" });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "unreachable" }));
  });

  it("400 for a missing, non-string or oversize url, and for non-JSON bodies", async () => {
    for (const body of [{}, { url: 5 }, { url: null }, { url: ["https://example.com"] }, "not json", "", `{"url":"${"a".repeat(5000)}"}`]) {
      const res = await preview(body);
      expect(res.status).toBe(400);
    }
    expect(mocked).not.toHaveBeenCalled();
  });

  it("429 on the 31st request within a minute, with Retry-After, then recovers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    mocked.mockResolvedValue(ok("<title>x</title>"));
    for (let i = 0; i < 30; i++) expect((await preview({ url: "https://example.com" })).status).toBe(200);
    const res = await preview({ url: "https://example.com" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate-limited" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocked).toHaveBeenCalledTimes(30);
    vi.setSystemTime(new Date("2026-11-12T12:01:01Z"));
    expect((await preview({ url: "https://example.com" })).status).toBe(200);
  });

  it("counts blocked URLs against the limit too (probing is not free)", async () => {
    for (let i = 0; i < 30; i++) await preview({ url: "http://127.0.0.1" });
    expect((await preview({ url: "http://127.0.0.1" })).status).toBe(429);
  });
});

describe("GET /api/link-preview/image", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const gif = enc.encode("GIF89a....");
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

  it("401 / 403 / 503 like the other owner-only routes", async () => {
    claims = null;
    expect((await image("https://example.com/a.png")).status).toBe(401);
    claims = { sub: STRANGER, aal: "aal2" };
    expect((await image("https://example.com/a.png")).status).toBe(403);
    claims = { sub: OWNER, aal: "aal2" };
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    expect((await image("https://example.com/a.png")).status).toBe(503);
    expect(mocked).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", png],
    ["image/jpeg", jpeg],
    ["image/gif", gif],
    ["image/webp", webp],
  ])("streams %s bytes with locked-down headers", async (type, bytes) => {
    mocked.mockResolvedValue({ finalUrl: "https://example.com/a", status: 200, contentType: `${type}`, body: bytes });
    const res = await image("https://example.com/a");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    const o = mocked.mock.calls[0][1];
    expect(o.maxBytes).toBe(5 * 1024 * 1024);
    expect(o.onLimit ?? "error").toBe("error");
    expect(o.accept.test("image/jpeg")).toBe(true);
    expect(o.accept.test("image/svg+xml")).toBe(false);
    expect(o.accept.test("image/avif")).toBe(false);
    expect(o.accept.test("text/html")).toBe(false);
  });

  it("echoes only the allow-listed type, normalised, even if the server adds parameters or odd case", async () => {
    mocked.mockResolvedValue({ finalUrl: "https://example.com/a", status: 200, contentType: "Image/PNG; charset=evil", body: png });
    const res = await image("https://example.com/a");
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("400 unsupported-type when the fetcher rejects the content type (svg and friends)", async () => {
    mocked.mockRejectedValue(new SafeFetchError("bad-content-type"));
    const res = await image("https://example.com/a.svg");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported-type" });
  });

  it("400 unsupported-type when the bytes do not match the claimed image type (html labelled as png)", async () => {
    mocked.mockResolvedValue({ finalUrl: "https://example.com/a", status: 200, contentType: "image/png", body: enc.encode("<html><script>alert(1)</script>") });
    const res = await image("https://example.com/a");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported-type" });
  });

  it("really refuses svg through the real accept pattern", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/safe-fetch")>("@/lib/server/safe-fetch");
    mocked.mockImplementation((url, o) =>
      actual.safeFetch(url, {
        ...o,
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        request: async () => ({ status: 200, headers: { "content-type": "image/svg+xml" }, body: (async function* () { yield enc.encode("<svg/>"); })(), destroy() {} }),
      }),
    );
    const res = await image("https://example.com/a.svg");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported-type" });
  });

  it.each(["http://127.0.0.1/a.png", "http://localhost/a.png", "http://169.254.169.254/", "file:///etc/passwd", "javascript:alert(1)", "http://[::1]/"])("400 blocked for %s", async (url) => {
    const res = await image(url);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "blocked" });
  });

  it("400 bad-request without a url parameter, and for oversize ones", async () => {
    expect((await image()).status).toBe(400);
    expect((await image("")).status).toBe(400);
    expect((await image(`https://example.com/${"a".repeat(5000)}`)).status).toBe(400);
    expect(mocked).not.toHaveBeenCalled();
  });

  it.each<[SafeFetchCode, number, string]>([
    ["timeout", 504, "timeout"],
    ["too-large", 413, "too-large"],
    ["http-status", 502, "unreachable"],
    ["too-many-redirects", 502, "unreachable"],
  ])("maps %s to %i", async (code, status, error) => {
    mocked.mockRejectedValue(new SafeFetchError(code));
    const res = await image("https://example.com/a");
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("429 once the image limit is exceeded", async () => {
    mocked.mockResolvedValue({ finalUrl: "https://example.com/a", status: 200, contentType: "image/png", body: png });
    for (let i = 0; i < 120; i++) expect((await image("https://example.com/a")).status).toBe(200);
    const res = await image("https://example.com/a");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
  });

  it("the image limit is separate from the preview limit", async () => {
    mocked.mockResolvedValue(ok("<title>x</title>"));
    for (let i = 0; i < 31; i++) await preview({ url: "https://example.com" });
    mocked.mockResolvedValue({ finalUrl: "https://example.com/a", status: 200, contentType: "image/png", body: png });
    expect((await image("https://example.com/a")).status).toBe(200);
  });
});
