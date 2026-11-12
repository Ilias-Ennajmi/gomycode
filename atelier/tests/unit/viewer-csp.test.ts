import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { EMBED_ORIGINS } from "@/lib/engine/links/embed";
import { r2HostFromEnv, shareCsp } from "@/lib/share/csp";

describe("shareCsp", () => {
  const csp = shareCsp({ r2Host: "assets.example.com" });
  const dir = (name: string) => new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp)?.[1].split(" ") ?? [];

  it("allows pictures and video from this site and the R2 host only, plus data and blob", () => {
    expect(dir("img-src")).toEqual(["'self'", "https://assets.example.com", "data:", "blob:"]);
    expect(dir("media-src")).toEqual(["'self'", "https://assets.example.com", "blob:"]);
    expect(dir("connect-src")).toEqual(["'self'", "https://assets.example.com"]);
  });
  it("has no wildcard and no plain http source", () => {
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toMatch(/http:/);
  });
  it("frames: exactly the embed players; the page itself can never be framed", () => {
    expect(dir("frame-src").sort()).toEqual([...EMBED_ORIGINS].sort());
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });
  it("eval is allowed in development only", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(shareCsp({ r2Host: null, dev: true })).toContain("'unsafe-eval'");
  });
  it("without an R2 host there is simply no host (never a blank or wildcard entry)", () => {
    expect(shareCsp({ r2Host: null })).toContain("img-src 'self' data: blob:");
  });
  it("reads the host from either variable, with or without a scheme, and refuses junk", () => {
    expect(r2HostFromEnv({ NEXT_PUBLIC_R2_PUBLIC_HOST: "https://a.example.com/" })).toBe("a.example.com");
    expect(r2HostFromEnv({ R2_PUBLIC_HOST: "b.example.com:8443" })).toBe("b.example.com:8443");
    expect(r2HostFromEnv({ R2_PUBLIC_HOST: "evil.com; script-src *" })).toBeNull();
    expect(r2HostFromEnv({})).toBeNull();
  });
});

describe("next.config headers for /s/*", () => {
  it("sends the share CSP on the share page and not on the API", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const page = rules.find((r) => r.source === "/s/:path*")!;
    expect(page.headers.find((h) => h.key.toLowerCase() === "content-security-policy")?.value).toContain("frame-ancestors 'none'");
    const api = rules.find((r) => r.source === "/api/s/:path*")!;
    expect(api.headers.some((h) => h.key.toLowerCase() === "content-security-policy")).toBe(false);
  });
});
