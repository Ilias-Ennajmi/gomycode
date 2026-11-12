import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

async function headersFor(source: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const out: Record<string, string> = {};
  for (const r of rules.filter((x) => x.source === source)) for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  return out;
}

describe("headers on the share routes (the token is in the URL)", () => {
  it.each(["/s/:path*", "/api/s/:path*"])("%s: no referrer, no indexing, no caching", async (source) => {
    const h = await headersFor(source);
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-robots-tag"]).toBe("noindex, nofollow");
    expect(h["cache-control"]).toBe("private, no-store");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  it("the owner's pages are not affected", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*")!;
    expect(all.headers.map((h) => h.key.toLowerCase())).not.toContain("cache-control");
    expect(all.headers.map((h) => h.key.toLowerCase())).not.toContain("referrer-policy");
  });
});
