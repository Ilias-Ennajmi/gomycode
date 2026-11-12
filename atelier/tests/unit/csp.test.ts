import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { EMBED_ORIGINS } from "@/lib/engine/links/embed";

async function cspFor(source: string): Promise<string> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === source);
  const h = rule?.headers.find((x) => x.key.toLowerCase() === "content-security-policy");
  return h?.value ?? "";
}

describe("Content-Security-Policy frame-src", () => {
  it("is set on every page and lists exactly the three embed origins", async () => {
    const csp = await cspFor("/:path*");
    const m = /(?:^|;)\s*frame-src ([^;]*)/.exec(csp);
    expect(m, csp).not.toBeNull();
    expect(m![1].trim().split(/\s+/).sort()).toEqual([...EMBED_ORIGINS].sort());
  });

  it("has no wildcard and no http: source", async () => {
    const csp = await cspFor("/:path*");
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toMatch(/http:/);
    expect(csp).not.toMatch(/'unsafe/);
  });
});
