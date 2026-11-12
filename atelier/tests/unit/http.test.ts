import { describe, expect, it } from "vitest";
import { clientIp, ipHash, jsonResponse, readJsonLimited } from "@/lib/server/http";
import { assertAppOrigin, siteOrigin } from "@/lib/server/site-url";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

async function thrown(p: Promise<unknown>): Promise<Response> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  throw new Error("did not throw");
}

describe("readJsonLimited", () => {
  it("parses a small JSON body", async () => {
    expect(await readJsonLimited<{ a: number }>(post('{"a":1}'), 1024)).toEqual({ a: 1 });
  });

  it("413 when Content-Length is over the cap, without reading the body", async () => {
    const res = await thrown(readJsonLimited(post("{}", { "content-length": "5000" }), 1024));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too-large" });
  });

  it("413 for a body over the cap even when Content-Length lies", async () => {
    const big = JSON.stringify({ x: "a".repeat(4000) });
    const req = new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json", "content-length": "10" }, body: big });
    expect((await thrown(readJsonLimited(req, 1024))).status).toBe(413);
  });

  it("413 for a stream that never says how long it is, and stops reading early", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(512).fill(97));
        if (pulled > 1000) c.close();
      },
    });
    const req = new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect((await thrown(readJsonLimited(req, 1024))).status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });

  it("400 on invalid JSON, an empty body and a non-JSON content type is 415", async () => {
    expect((await thrown(readJsonLimited(post("{nope"), 1024))).status).toBe(400);
    expect((await thrown(readJsonLimited(post(""), 1024))).status).toBe(400);
    expect((await thrown(readJsonLimited(post("{}", { "content-type": "text/plain" }), 1024))).status).toBe(415);
    expect((await thrown(readJsonLimited(post("{}", { "content-type": "application/x-www-form-urlencoded" }), 1024))).status).toBe(415);
  });

  it("accepts a charset parameter on the content type", async () => {
    expect(await readJsonLimited(post("{}", { "content-type": "application/json; charset=utf-8" }), 1024)).toEqual({});
  });

  it("allowEmpty turns an empty body into {}", async () => {
    expect(await readJsonLimited(post(""), 1024, { allowEmpty: true })).toEqual({});
    expect(await readJsonLimited(new Request("http://localhost/x", { method: "POST" }), 1024, { allowEmpty: true })).toEqual({});
  });
});

describe("jsonResponse", () => {
  it("is never cached and carries the status", async () => {
    const res = jsonResponse(201, { a: 1 });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ a: 1 });
  });
  it("adds Set-Cookie and other headers when asked", () => {
    const res = jsonResponse(200, {}, { cookie: "a=b; HttpOnly", headers: { "retry-after": "5" } });
    expect(res.headers.get("set-cookie")).toBe("a=b; HttpOnly");
    expect(res.headers.get("retry-after")).toBe("5");
  });
  it("204 has no body", () => {
    expect(jsonResponse(204, null).body).toBeNull();
  });
});

describe("clientIp and ipHash", () => {
  const req = (h: Record<string, string>) => new Request("http://localhost/", { headers: h });
  it("prefers the platform header, then the first forwarded hop, then a placeholder", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(req({}))).toBe("0.0.0.0");
  });
  it("ignores junk in the header", () => {
    expect(clientIp(req({ "x-forwarded-for": "<script>" }))).toBe("0.0.0.0");
    expect(clientIp(req({ "x-forwarded-for": "x".repeat(500) }))).toBe("0.0.0.0");
    expect(clientIp(req({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("ipHash is a keyed hash: stable, secret-dependent, and never the IP", () => {
    const secret = "s".repeat(40);
    const h = ipHash("1.2.3.4", secret);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(ipHash("1.2.3.4", secret));
    expect(h).not.toBe(ipHash("1.2.3.5", secret));
    expect(h).not.toBe(ipHash("1.2.3.4", "t".repeat(40)));
    expect(h).not.toContain("1.2.3.4");
  });
});

describe("siteOrigin", () => {
  const r = (url: string) => new Request(url);
  it("uses NEXT_PUBLIC_SITE_URL when it is a valid origin, dropping any path", () => {
    expect(siteOrigin(r("http://evil.test/x"), { NEXT_PUBLIC_SITE_URL: "https://atelier.example.com/" })).toBe("https://atelier.example.com");
    expect(siteOrigin(r("http://evil.test/x"), { NEXT_PUBLIC_SITE_URL: "https://atelier.example.com/some/path?q=1" })).toBe("https://atelier.example.com");
  });
  it("falls back to the legacy NEXT_PUBLIC_APP_URL, then to the request's own origin", () => {
    expect(siteOrigin(r("http://localhost:3000/x"), { NEXT_PUBLIC_APP_URL: "https://app.example.com" })).toBe("https://app.example.com");
    expect(siteOrigin(r("http://localhost:3000/x"), {})).toBe("http://localhost:3000");
  });
  it("ignores a malformed or non-http value", () => {
    expect(siteOrigin(r("http://localhost:3000/x"), { NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000");
    expect(siteOrigin(r("http://localhost:3000/x"), { NEXT_PUBLIC_SITE_URL: "not a url" })).toBe("http://localhost:3000");
  });
  it("in production a plain-http site URL is not trusted", () => {
    expect(siteOrigin(r("https://real.example.com/x"), { NEXT_PUBLIC_SITE_URL: "http://real.example.com", VERCEL_ENV: "production" })).toBe("https://real.example.com");
  });
});

describe("assertAppOrigin", () => {
  const post = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });
  const env = { NEXT_PUBLIC_SITE_URL: "https://atelier.example.com" };
  it("passes for the configured address and for the request's own address", () => {
    expect(() => assertAppOrigin(post("https://atelier.example.com/x", { origin: "https://atelier.example.com" }), env)).not.toThrow();
    expect(() => assertAppOrigin(post("https://preview.vercel.app/x", { origin: "https://preview.vercel.app" }), env)).not.toThrow();
  });
  it("refuses a foreign origin and a bare cross-site request with a 403", () => {
    for (const r of [post("https://atelier.example.com/x", { origin: "https://evil.example" }), post("https://atelier.example.com/x", { "sec-fetch-site": "cross-site" }), post("https://atelier.example.com/x", {})]) {
      try {
        assertAppOrigin(r, env);
        throw new Error("did not throw");
      } catch (e) {
        expect((e as Response).status).toBe(403);
      }
    }
  });
  it("lets GET through", () => {
    expect(() => assertAppOrigin(new Request("https://atelier.example.com/x"), env)).not.toThrow();
  });
});
