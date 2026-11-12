import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/server/same-origin";

const APP = "https://atelier.example";

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request(`${APP}/api/s/x/comments`, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : "{}" });
}

function thrown(fn: () => void): Response | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return null;
}

describe("assertSameOrigin", () => {
  it("lets a POST with the matching Origin through", () => {
    expect(thrown(() => assertSameOrigin(req("POST", { origin: APP }), APP))).toBeNull();
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      expect(thrown(() => assertSameOrigin(req(m, { origin: APP }), APP))).toBeNull();
    }
  });

  it("throws a 403 for a foreign Origin, whatever Sec-Fetch-Site says", () => {
    const r = thrown(() => assertSameOrigin(req("POST", { origin: "https://evil.example", "sec-fetch-site": "same-origin" }), APP));
    expect(r?.status).toBe(403);
    expect(thrown(() => assertSameOrigin(req("POST", { origin: "https://atelier.example.evil.com" }), APP))?.status).toBe(403);
    expect(thrown(() => assertSameOrigin(req("POST", { origin: "http://atelier.example" }), APP))?.status).toBe(403); // scheme
    expect(thrown(() => assertSameOrigin(req("POST", { origin: "https://atelier.example:8443" }), APP))?.status).toBe(403); // port
    expect(thrown(() => assertSameOrigin(req("POST", { origin: "null" }), APP))?.status).toBe(403); // sandboxed iframes
  });

  it("without an Origin, needs Sec-Fetch-Site same-origin or none", () => {
    expect(thrown(() => assertSameOrigin(req("POST", { "sec-fetch-site": "same-origin" }), APP))).toBeNull();
    expect(thrown(() => assertSameOrigin(req("POST", { "sec-fetch-site": "none" }), APP))).toBeNull();
    expect(thrown(() => assertSameOrigin(req("POST", { "sec-fetch-site": "cross-site" }), APP))?.status).toBe(403);
    expect(thrown(() => assertSameOrigin(req("POST", { "sec-fetch-site": "same-site" }), APP))?.status).toBe(403);
    expect(thrown(() => assertSameOrigin(req("POST"), APP))?.status).toBe(403); // neither header
  });

  it("lets GET and HEAD through always", () => {
    expect(thrown(() => assertSameOrigin(req("GET"), APP))).toBeNull();
    expect(thrown(() => assertSameOrigin(req("GET", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }), APP))).toBeNull();
    expect(thrown(() => assertSameOrigin(req("HEAD"), APP))).toBeNull();
  });

  it("treats OPTIONS as unsafe (only GET and HEAD are safe)", () => {
    expect(thrown(() => assertSameOrigin(req("OPTIONS", { origin: "https://evil.example" }), APP))?.status).toBe(403);
  });

  it("accepts the app origin with a path or trailing slash configured", () => {
    expect(thrown(() => assertSameOrigin(req("POST", { origin: APP }), `${APP}/`))).toBeNull();
    expect(thrown(() => assertSameOrigin(req("POST", { origin: APP }), `${APP}/some/path`))).toBeNull();
  });

  it("fails closed when the app origin is empty or unusable", () => {
    expect(thrown(() => assertSameOrigin(req("POST", { origin: APP }), ""))?.status).toBe(403);
    expect(thrown(() => assertSameOrigin(req("POST", { origin: "" }), ""))?.status).toBe(403);
    expect(thrown(() => assertSameOrigin(req("POST", { "sec-fetch-site": "same-origin" }), ""))?.status).toBe(403);
  });

  it("the 403 body is JSON, not cacheable, and says nothing about why", async () => {
    const r = thrown(() => assertSameOrigin(req("POST", { origin: "https://evil.example" }), APP))!;
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ error: "forbidden" });
  });
});
