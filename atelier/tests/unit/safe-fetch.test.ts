import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SafeFetchError,
  isBlockedAddress,
  nodeRequest,
  parseSafeUrl,
  safeFetch,
  type PinnedLookup,
  type RawResponse,
  type RequestFn,
  type SafeFetchCode,
  type SafeFetchOptions,
} from "@/lib/server/safe-fetch";

const PUBLIC = "93.184.216.34";
const enc = new TextEncoder();
const HTML = /^(text\/html|application\/xhtml\+xml)/;

describe("isBlockedAddress", () => {
  const blocked: [string, string][] = [
    // IPv4: every range named in the plan, both ends
    ["0.0.0.0", "0/8 this network"],
    ["0.255.255.255", "0/8 end"],
    ["10.0.0.0", "10/8"],
    ["10.1.2.3", "10/8"],
    ["10.255.255.255", "10/8 end"],
    ["100.64.0.1", "CGNAT"],
    ["100.127.255.255", "CGNAT end"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback end"],
    ["169.254.0.1", "link-local"],
    ["169.254.169.254", "cloud metadata"],
    ["172.16.0.1", "172.16/12"],
    ["172.31.255.255", "172.16/12 end"],
    ["192.0.0.1", "192.0.0/24"],
    ["192.0.2.1", "TEST-NET-1"],
    ["192.88.99.1", "6to4 relay"],
    ["192.168.1.1", "192.168/16"],
    ["192.168.255.255", "192.168/16 end"],
    ["198.18.0.1", "benchmark"],
    ["198.19.255.255", "benchmark end"],
    ["198.51.100.7", "TEST-NET-2"],
    ["203.0.113.9", "TEST-NET-3"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.255", "multicast end"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.254", "reserved end"],
    ["255.255.255.255", "broadcast"],
    // IPv6
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["0:0:0:0:0:0:0:1", "loopback expanded"],
    ["fe80::1", "link-local"],
    ["febf::1", "link-local end of fe80::/10"],
    ["fe80::1%eth0", "link-local with zone id"],
    ["fc00::1", "unique local"],
    ["fd00::1", "unique local"],
    ["fdff:ffff::1", "unique local end"],
    ["fec0::1", "site-local (deprecated)"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["2002:7f00:1::", "6to4"],
    ["2001::1", "Teredo / IETF protocol block"],
    ["100::1", "discard-only"],
    // IPv4 embedded in IPv6
    ["::ffff:127.0.0.1", "v4-mapped loopback"],
    ["::FFFF:127.0.0.1", "v4-mapped loopback, upper case"],
    ["::ffff:7f00:1", "v4-mapped loopback, hex form"],
    ["::ffff:a00:1", "v4-mapped 10.0.0.1"],
    ["::ffff:169.254.169.254", "v4-mapped metadata"],
    ["::ffff:c0a8:101", "v4-mapped 192.168.1.1"],
    ["0:0:0:0:0:ffff:7f00:1", "v4-mapped, expanded"],
    ["64:ff9b::7f00:1", "NAT64 of 127.0.0.1"],
    ["64:ff9b::a9fe:a9fe", "NAT64 of metadata"],
    ["::7f00:1", "v4-compatible loopback"],
    ["::ffff:0:127.0.0.1", "v4-translated loopback"],
    // unparseable and non-canonical literals fail closed
    ["garbage", "garbage"],
    ["", "empty"],
    ["[::1]", "brackets"],
    ["1.2.3", "three-part v4"],
    ["1.2.3.4.5", "five-part v4"],
    ["256.1.1.1", "out of range octet"],
    ["2130706433", "decimal literal"],
    ["0x7f.1", "hex literal"],
    ["017700000001", "octal literal"],
    ["127.1", "short literal"],
    ["010.0.0.1", "leading zero octet"],
    ["1:2:3:4:5:6:7:8:9", "too many groups"],
    ["1::2::3", "two double colons"],
    ["12345::1", "group too long"],
    ["::g", "non-hex"],
  ];
  it.each(blocked)("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  const allowed: [string, string][] = [
    ["8.8.8.8", "public"],
    ["93.184.216.34", "public"],
    ["172.15.255.255", "just below 172.16/12"],
    ["172.32.0.1", "just above 172.16/12"],
    ["100.63.255.255", "just below CGNAT"],
    ["100.128.0.1", "just above CGNAT"],
    ["198.17.255.255", "just below benchmark"],
    ["198.20.0.1", "just above benchmark"],
    ["169.253.1.1", "just below link-local"],
    ["223.255.255.254", "just below multicast"],
    ["1.1.1.1", "public"],
    ["2606:4700:4700::1111", "public v6"],
    ["2606:4700:4700:0:0:0:0:1111", "public v6, expanded"],
    ["2A00:1450:4001:81B::200E", "public v6, upper case"],
    ["::ffff:8.8.8.8", "v4-mapped public"],
    ["64:ff9b::808:808", "NAT64 of public v4"],
  ];
  it.each(allowed)("allows %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("parseSafeUrl", () => {
  function codeOf(raw: string): SafeFetchCode | "ok" {
    try {
      parseSafeUrl(raw);
      return "ok";
    } catch (e) {
      expect(e).toBeInstanceOf(SafeFetchError);
      return (e as SafeFetchError).code;
    }
  }

  const rejected = [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/x",
    "gopher://example.com/",
    "ws://example.com/",
    "",
    "   ",
    "not a url",
    "//example.com/path",
    "example.com",
    "http://user:pw@example.com",
    "http://user@example.com",
    "https://:pw@example.com",
    "http://example.com@127.0.0.1/",
    "http://example.com:8080",
    "http://example.com:22/",
    "https://example.com:8443/",
    "https://example.com:444/",
    "http://localhost",
    "http://LOCALHOST/",
    "http://localhost./",
    "http://localhost:80/",
    "http://foo.localhost",
    "http://a.b.localhost./",
    "http://printer.local/",
    "http://metadata.google.internal/",
    "http://svc.internal./",
    "http://intranet",
    "http://router/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://0x7f000001/",
    "http://017700000001/",
    "http://127.1/",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://0/",
    "http://10.0.0.1/",
    "http://172.16.5.5/",
    "http://192.168.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[64:ff9b::7f00:1]/",
    `http://example.com/${"a".repeat(3000)}`,
  ];
  it.each(rejected.map((r) => [r.length > 80 ? `${r.slice(0, 40)}... (${r.length} chars)` : r, r]))("rejects %s", (_label, raw) => {
    expect(codeOf(raw)).not.toBe("ok");
  });

  it("uses bad-url for malformed input and blocked-address for blocked IP literals", () => {
    expect(codeOf("file:///etc/passwd")).toBe("bad-url");
    expect(codeOf("http://user:pw@example.com")).toBe("bad-url");
    expect(codeOf("http://localhost")).toBe("bad-url");
    expect(codeOf("http://2130706433/")).toBe("blocked-address");
    expect(codeOf("http://[::1]/")).toBe("blocked-address");
  });

  it("accepts ordinary public URLs and returns the WHATWG-parsed URL", () => {
    expect(parseSafeUrl("https://example.com/path?q=1#frag").href).toBe("https://example.com/path?q=1#frag");
    expect(parseSafeUrl("http://example.com:80/").hostname).toBe("example.com");
    expect(parseSafeUrl("https://example.com:443/").hostname).toBe("example.com");
    expect(parseSafeUrl("  https://example.com/  ").hostname).toBe("example.com");
    expect(parseSafeUrl("https://8.8.8.8/").hostname).toBe("8.8.8.8");
    expect(parseSafeUrl("https://[2606:4700:4700::1111]/").hostname).toBe("[2606:4700:4700::1111]");
    expect(parseSafeUrl(`https://example.com/${"a".repeat(2000)}`).hostname).toBe("example.com");
  });

  it("punycodes internationalised hostnames", () => {
    expect(parseSafeUrl("https://例え.jp/path").hostname).toBe("xn--r8jz45g.jp");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// safeFetch with injected resolver and transport (no real network)

type Addr = { address: string; family: 4 | 6 };
const a4 = (address: string): Addr => ({ address, family: 4 });

function body(...chunks: (string | Uint8Array)[]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const c of chunks) yield typeof c === "string" ? enc.encode(c) : c;
  })();
}

function reply(status: number, headers: Record<string, string | undefined>, b: AsyncIterable<Uint8Array> = body(""), destroy = vi.fn()): RawResponse {
  return { status, headers, body: b, destroy };
}

const html = (text = "<title>x</title>", extra: Record<string, string> = {}) => reply(200, { "content-type": "text/html; charset=utf-8", ...extra }, body(text));

type Harness = { request: ReturnType<typeof vi.fn<RequestFn>>; lookup: ReturnType<typeof vi.fn<(h: string) => Promise<Addr[]>>>; opts: SafeFetchOptions };

function harness(responses: RawResponse[] | ((url: URL, n: number) => RawResponse | Promise<RawResponse>), dns: Record<string, Addr[]> = {}, o: Partial<SafeFetchOptions> = {}): Harness {
  let n = 0;
  const request = vi.fn<RequestFn>(async ({ url }) => {
    const i = n++;
    if (typeof responses === "function") return responses(url, i);
    const r = responses[Math.min(i, responses.length - 1)];
    if (!r) throw new Error("no more responses");
    return r;
  });
  const lookup = vi.fn(async (host: string) => dns[host] ?? [a4(PUBLIC)]);
  return { request, lookup, opts: { maxBytes: 512 * 1024, accept: HTML, lookup, request, ...o } };
}

describe("safeFetch", () => {
  afterEach(() => vi.useRealTimers());

  it("fetches a page, resolving DNS once and returning the final URL, status, content type and bytes", async () => {
    const h = harness([html("<title>hello</title>")]);
    const res = await safeFetch("https://example.com/a", h.opts);
    expect(res.finalUrl).toBe("https://example.com/a");
    expect(res.status).toBe(200);
    expect(res.contentType).toBe("text/html; charset=utf-8");
    expect(new TextDecoder().decode(res.body)).toBe("<title>hello</title>");
    expect(h.lookup).toHaveBeenCalledTimes(1);
    expect(h.lookup).toHaveBeenCalledWith("example.com");
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("sends a fixed User-Agent, identity encoding and no cookie, authorization or referer headers, even when the caller supplies them", async () => {
    const h = harness([html()], {}, { headers: { Cookie: "a=b", Authorization: "Bearer x", "Proxy-Authorization": "y", Referer: "https://atelier.test/", "X-Custom": "ok", "user-agent": "Evil/1" } });
    await safeFetch("https://example.com/", h.opts);
    const sent = h.request.mock.calls[0][0].headers;
    const names = Object.keys(sent).map((k) => k.toLowerCase());
    expect(names).not.toContain("cookie");
    expect(names).not.toContain("authorization");
    expect(names).not.toContain("proxy-authorization");
    expect(names).not.toContain("referer");
    const lower = Object.fromEntries(Object.entries(sent).map(([k, v]) => [k.toLowerCase(), v]));
    expect(lower["user-agent"]).toBe("AtelierLinkPreview/1.0");
    expect(lower["accept-encoding"]).toBe("identity");
    expect(lower["x-custom"]).toBe("ok");
  });

  describe("blocked destinations", () => {
    it.each([
      ["a hostname resolving to a mix of public and private addresses", { "mix.example": [a4(PUBLIC), a4("10.0.0.1")] }],
      ["a hostname resolving only to loopback", { "mix.example": [a4("127.0.0.1")] }],
      ["a hostname resolving to the cloud metadata address", { "mix.example": [a4("169.254.169.254")] }],
      ["a hostname resolving to an IPv4-mapped loopback", { "mix.example": [{ address: "::ffff:127.0.0.1", family: 6 as const }] }],
      ["a hostname resolving to a unique-local IPv6 address", { "mix.example": [a4(PUBLIC), { address: "fd00::5", family: 6 as const }] }],
      ["a hostname whose private address comes first", { "mix.example": [a4("192.168.0.9"), a4(PUBLIC)] }],
    ])("rejects %s and never calls the transport", async (_n, dns) => {
      const h = harness([html()], dns);
      await expect(safeFetch("https://mix.example/", h.opts)).rejects.toMatchObject({ code: "blocked-address" });
      expect(h.request).not.toHaveBeenCalled();
    });

    it("rejects a hostname that resolves to nothing without connecting", async () => {
      const h = harness([html()], { "empty.example": [] });
      await expect(safeFetch("https://empty.example/", h.opts)).rejects.toBeInstanceOf(Error);
      expect(h.request).not.toHaveBeenCalled();
    });

    it("lets a resolver failure through as a plain error, never as a SafeFetchError code", async () => {
      const h = harness([html()]);
      h.lookup.mockRejectedValueOnce(Object.assign(new Error("getaddrinfo ENOTFOUND nope.example"), { code: "ENOTFOUND" }));
      const err = await safeFetch("https://nope.example/", h.opts).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(SafeFetchError);
      expect(h.request).not.toHaveBeenCalled();
    });

    it.each(["http://127.0.0.1/", "http://localhost/", "http://[::1]/", "http://2130706433/", "http://169.254.169.254/", "file:///etc/passwd", "http://u:p@example.com/", "http://example.com:8080/"])("rejects %s before any DNS or transport", async (url) => {
      const h = harness([html()]);
      await expect(safeFetch(url, h.opts)).rejects.toBeInstanceOf(SafeFetchError);
      expect(h.lookup).not.toHaveBeenCalled();
      expect(h.request).not.toHaveBeenCalled();
    });

    it("does not resolve DNS for a public IP literal and connects to exactly that address", async () => {
      const h = harness([html()]);
      await safeFetch("https://8.8.8.8/", h.opts);
      expect(h.lookup).not.toHaveBeenCalled();
      expect(h.request).toHaveBeenCalledTimes(1);
    });
  });

  describe("DNS rebinding", () => {
    it("pins the connection to the address that was validated: the lookup handed to the transport answers with it and never re-resolves", async () => {
      // A resolver that would answer differently the second time (the rebinding attack).
      let calls = 0;
      const lookup = vi.fn(async () => (calls++ === 0 ? [a4(PUBLIC)] : [a4("10.0.0.1")]));
      const answers: unknown[] = [];
      const request = vi.fn<RequestFn>(async ({ lookup: pinned }) => {
        // what node's socket layer does: ask for the host again, both with and without `all`
        pinned("example.com", {}, (err, address, family) => answers.push([err, address, family]));
        pinned("example.com", { all: true }, (err, address) => answers.push([err, address]));
        return html();
      });
      await safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup, request });
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(answers).toEqual([
        [null, PUBLIC, 4],
        [null, [{ address: PUBLIC, family: 4 }]],
      ]);
    });

    it("refuses to answer for any hostname other than the one validated", async () => {
      let result: unknown;
      const request = vi.fn<RequestFn>(async ({ lookup: pinned }) => {
        pinned("evil.example", {}, (err) => (result = err));
        return html();
      });
      await safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: async () => [a4(PUBLIC)], request });
      expect(result).toBeInstanceOf(Error);
    });

    it("hands the transport every validated address (all are public) so happy-eyeballs still works", async () => {
      const seen: unknown[] = [];
      const request = vi.fn<RequestFn>(async ({ lookup: pinned }) => {
        pinned("example.com", { all: true }, (_e, address) => seen.push(address));
        return html();
      });
      const dns = [a4(PUBLIC), { address: "2606:4700:4700::1111", family: 6 as const }];
      await safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: async () => dns, request });
      expect(seen).toEqual([dns]);
    });

    it("passes the URL with the original hostname (Host header and SNI are derived from it) rather than rewriting it to the IP", async () => {
      const h = harness([html()]);
      await safeFetch("https://example.com/p?q=1", h.opts);
      const { url } = h.request.mock.calls[0][0];
      expect(url.hostname).toBe("example.com");
      expect(url.href).toBe("https://example.com/p?q=1");
    });
  });

  describe("redirects", () => {
    it("follows a relative redirect, re-validating the new hop, and reports the final URL", async () => {
      const h = harness([reply(301, { location: "/moved" }), html()]);
      const res = await safeFetch("https://example.com/old", h.opts);
      expect(res.finalUrl).toBe("https://example.com/moved");
      expect(h.request).toHaveBeenCalledTimes(2);
      expect(h.lookup).toHaveBeenCalledTimes(2);
    });

    it.each([301, 302, 303, 307, 308])("follows a %i", async (status) => {
      const h = harness([reply(status, { location: "https://other.example/" }), html()]);
      const res = await safeFetch("https://example.com/", h.opts);
      expect(res.finalUrl).toBe("https://other.example/");
    });

    it("rejects a redirect to the metadata IP and only the first hop reaches the transport", async () => {
      const h = harness([reply(302, { location: "http://169.254.169.254/latest/meta-data/" }), html()]);
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "blocked-address" });
      expect(h.request).toHaveBeenCalledTimes(1);
    });

    it.each(["http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://2130706433/", "http://intranet/", "http://example.com:8080/", "http://user:pw@example.com/", "file:///etc/passwd", "ftp://example.com/", "javascript:alert(1)"])("rejects a redirect to %s", async (loc) => {
      const h = harness([reply(302, { location: loc }), html()]);
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toBeInstanceOf(SafeFetchError);
      expect(h.request).toHaveBeenCalledTimes(1);
    });

    it("rejects a redirect to a hostname that resolves to a private address, without a second request", async () => {
      const h = harness([reply(302, { location: "https://rebind.example/" }), html()], { "rebind.example": [a4(PUBLIC), a4("10.0.0.1")] });
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "blocked-address" });
      expect(h.request).toHaveBeenCalledTimes(1);
    });

    it("allows exactly 3 redirects and rejects the 4th with too-many-redirects", async () => {
      const ok = harness((_u, n) => (n < 3 ? reply(302, { location: `/hop${n + 1}` }) : html()));
      await expect(safeFetch("https://example.com/", ok.opts)).resolves.toMatchObject({ finalUrl: "https://example.com/hop3" });
      expect(ok.request).toHaveBeenCalledTimes(4);

      const bad = harness((_u, n) => (n < 4 ? reply(302, { location: `/hop${n + 1}` }) : html()));
      await expect(safeFetch("https://example.com/", bad.opts)).rejects.toMatchObject({ code: "too-many-redirects" });
      expect(bad.request).toHaveBeenCalledTimes(4);
    });

    it("stops a redirect loop with too-many-redirects", async () => {
      const h = harness((url) => reply(302, { location: url.pathname === "/a" ? "/b" : "/a" }));
      await expect(safeFetch("https://example.com/a", h.opts)).rejects.toMatchObject({ code: "too-many-redirects" });
      expect(h.request.mock.calls.length).toBeLessThanOrEqual(4);
    });

    it("honours a custom maxRedirects", async () => {
      const h = harness((_u, n) => (n < 1 ? reply(302, { location: "/x" }) : html()), {}, { maxRedirects: 0 });
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "too-many-redirects" });
    });

    it("treats a redirect without a usable Location as an http-status failure", async () => {
      const none = harness([reply(302, {})]);
      await expect(safeFetch("https://example.com/", none.opts)).rejects.toMatchObject({ code: "http-status" });
      const garbage = harness([reply(302, { location: "http://" })]);
      await expect(safeFetch("https://example.com/", garbage.opts)).rejects.toBeInstanceOf(SafeFetchError);
    });

    it("does not follow 300, 304 or 305 and reports them as http-status", async () => {
      for (const status of [300, 304, 305]) {
        const h = harness([reply(status, { location: "https://example.com/next" })]);
        await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "http-status" });
        expect(h.request).toHaveBeenCalledTimes(1);
      }
    });

    it("destroys the redirect response instead of reading its body", async () => {
      const destroy = vi.fn();
      const h = harness([reply(302, { location: "/b" }, body("x".repeat(1000)), destroy), html()]);
      await safeFetch("https://example.com/a", h.opts);
      expect(destroy).toHaveBeenCalled();
    });

    it("sends the same restricted headers on every hop and never forwards anything between them", async () => {
      const h = harness([reply(302, { location: "https://other.example/", "set-cookie": "s=1" }), html()]);
      await safeFetch("https://example.com/", h.opts);
      for (const [{ headers }] of h.request.mock.calls) {
        const names = Object.keys(headers).map((k) => k.toLowerCase());
        expect(names).not.toContain("cookie");
        expect(names).not.toContain("authorization");
        expect(names).not.toContain("referer");
      }
    });
  });

  describe("limits", () => {
    it("aborts a body over maxBytes with too-large (onLimit: error) and stops reading", async () => {
      let produced = 0;
      const big = (async function* () {
        while (produced < 100_000) {
          produced += 1;
          yield new Uint8Array(10 * 1024);
        }
      })();
      const destroy = vi.fn();
      const h = harness([reply(200, { "content-type": "text/html" }, big, destroy)], {}, { maxBytes: 512 * 1024 });
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "too-large" });
      expect(produced).toBeLessThan(60); // ~52 chunks of 10 KiB, nowhere near the 1 GB the server offered
      expect(destroy).toHaveBeenCalled();
    });

    it("a 600 KB body with maxBytes 512 KB fails with too-large by default and returns exactly 512 KB with onLimit truncate", async () => {
      const make = () => reply(200, { "content-type": "text/html" }, body(new Uint8Array(300 * 1024).fill(65), new Uint8Array(300 * 1024).fill(66)));
      const err = harness([make()], {}, { maxBytes: 512 * 1024 });
      await expect(safeFetch("https://example.com/", err.opts)).rejects.toMatchObject({ code: "too-large" });
      const destroy = vi.fn();
      const cut = harness([{ ...make(), destroy }], {}, { maxBytes: 512 * 1024, onLimit: "truncate" });
      const res = await safeFetch("https://example.com/", cut.opts);
      expect(res.body.byteLength).toBe(512 * 1024);
      expect(res.body[0]).toBe(65);
      expect(res.body[512 * 1024 - 1]).toBe(66);
      expect(destroy).toHaveBeenCalled();
    });

    it("accepts a body of exactly maxBytes", async () => {
      const h = harness([reply(200, { "content-type": "text/html" }, body(new Uint8Array(1000)))], {}, { maxBytes: 1000 });
      expect((await safeFetch("https://example.com/", h.opts)).body.byteLength).toBe(1000);
    });

    it("rejects up front on an oversize Content-Length (error mode) without reading the body", async () => {
      const iter = vi.fn();
      const b: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next: async () => (iter(), { done: true as const, value: undefined }) }) };
      const destroy = vi.fn();
      const h = harness([reply(200, { "content-type": "text/html", "content-length": String(100 * 1024 * 1024) }, b, destroy)]);
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "too-large" });
      expect(iter).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalled();
    });

    it("does not trust a lying Content-Length: the streamed byte count decides", async () => {
      const h = harness([reply(200, { "content-type": "text/html", "content-length": "10" }, body(new Uint8Array(2000)))], {}, { maxBytes: 1000 });
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "too-large" });
    });

    it("ignores a huge Content-Length in truncate mode and returns the first maxBytes", async () => {
      const h = harness([reply(200, { "content-type": "text/html", "content-length": "99999999" }, body(new Uint8Array(5000).fill(7)))], {}, { maxBytes: 1000, onLimit: "truncate" });
      expect((await safeFetch("https://example.com/", h.opts)).body.byteLength).toBe(1000);
    });
  });

  describe("response checks", () => {
    it("rejects a content type outside the accept pattern before reading the body, and destroys the socket", async () => {
      const iter = vi.fn();
      const b: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next: async () => (iter(), { done: true as const, value: undefined }) }) };
      const destroy = vi.fn();
      const h = harness([reply(200, { "content-type": "text/plain" }, b, destroy)]);
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "bad-content-type" });
      expect(iter).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalled();
    });

    it("rejects a missing content type, and svg and other image types for an html-only fetch", async () => {
      for (const headers of [{}, { "content-type": "image/svg+xml" }, { "content-type": "application/pdf" }, { "content-type": "application/octet-stream" }, { "content-type": "TEXT/HTMLX-evil-but-prefix" }]) {
        const h = harness([reply(200, headers)], {}, { accept: /^text\/html$/ });
        await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "bad-content-type" });
      }
    });

    it("matches the accept pattern against the media type without parameters, case-insensitively", async () => {
      const h = harness([reply(200, { "content-type": "Image/PNG; foo=bar" })], {}, { accept: /^image\/(jpeg|png|webp|gif)$/ });
      await expect(safeFetch("https://example.com/", h.opts)).resolves.toMatchObject({ contentType: "Image/PNG; foo=bar" });
    });

    it("rejects an encoded body, since Accept-Encoding: identity was requested and we never decompress", async () => {
      const h = harness([reply(200, { "content-type": "text/html", "content-encoding": "gzip" })]);
      await expect(safeFetch("https://example.com/", h.opts)).rejects.toMatchObject({ code: "bad-content-type" });
      const ok = harness([reply(200, { "content-type": "text/html", "content-encoding": "identity" })]);
      await expect(safeFetch("https://example.com/", ok.opts)).resolves.toMatchObject({ status: 200 });
    });

    it.each([401, 403, 404, 410, 429, 500, 503])("reports a %i as http-status", async (status) => {
      const destroy = vi.fn();
      const h = harness([reply(status, { "content-type": "text/html" }, body("nope"), destroy)]);
      const err = await safeFetch("https://example.com/", h.opts).catch((e) => e);
      expect(err).toBeInstanceOf(SafeFetchError);
      expect(err.code).toBe("http-status");
      expect(err.status).toBe(status);
      expect(destroy).toHaveBeenCalled();
    });

    it("treats 204 and 1xx-style empty successes under the same rules", async () => {
      const h = harness([reply(204, { "content-type": "text/html" })]);
      await expect(safeFetch("https://example.com/", h.opts)).resolves.toMatchObject({ status: 204 });
    });

    it("reports bad-url for syntactically bad input", async () => {
      const h = harness([html()]);
      await expect(safeFetch("nonsense", h.opts)).rejects.toMatchObject({ code: "bad-url" });
    });
  });

  describe("timeouts", () => {
    beforeEach(() => vi.useFakeTimers());

    it("aborts a body that never ends at timeoutMs and destroys the socket (abort signal and response)", async () => {
      let signal: AbortSignal | undefined;
      const destroy = vi.fn();
      const slow = (async function* () {
        yield enc.encode("<html>");
        await new Promise<never>(() => {}); // the server just stops talking
      })();
      const request = vi.fn<RequestFn>(async (init) => {
        signal = init.signal;
        return reply(200, { "content-type": "text/html" }, slow, destroy);
      });
      const p = safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: async () => [a4(PUBLIC)], request, timeoutMs: 5000 }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(4999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      const err = await p;
      expect(err).toBeInstanceOf(SafeFetchError);
      expect(err.code).toBe("timeout");
      expect(signal?.aborted).toBe(true);
    });

    it("defaults to a 5 second total timeout", async () => {
      const request = vi.fn<RequestFn>(() => new Promise<RawResponse>(() => {})); // headers never arrive
      const p = safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: async () => [a4(PUBLIC)], request }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(4999);
      let settled = false;
      void p.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect((await p).code).toBe("timeout");
    });

    it("the 5 s budget is for the whole fetch, not per hop (slow redirects add up)", async () => {
      const request = vi.fn<RequestFn>(async ({ url }) => {
        await new Promise((r) => setTimeout(r, 2000));
        return url.pathname === "/3" ? html() : reply(302, { location: `/${Number(url.pathname.slice(1) || 0) + 1}` });
      });
      const p = safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: async () => [a4(PUBLIC)], request }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(5001);
      expect((await p).code).toBe("timeout");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(request.mock.calls.length).toBeLessThanOrEqual(3); // no request is started after the deadline
    });

    it("times out a stalled DNS lookup and never starts the request", async () => {
      const request = vi.fn<RequestFn>(async () => html());
      const p = safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: () => new Promise(() => {}), request, timeoutMs: 1000 }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(1001);
      expect((await p).code).toBe("timeout");
      expect(request).not.toHaveBeenCalled();
    });

    it("a request that resolves after the deadline does not produce an unhandled rejection or a late result", async () => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const request = vi.fn<RequestFn>(() => new Promise<RawResponse>((_r, rej) => setTimeout(() => rej(new Error("late")), 3000)));
      const p = safeFetch("https://example.com/", { maxBytes: 1000, accept: HTML, lookup: async () => [a4(PUBLIC)], request, timeoutMs: 1000 }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await p).code).toBe("timeout");
      expect(unhandled).not.toHaveBeenCalled();
      process.off("unhandledRejection", unhandled);
    });

    it("clears its timer when the fetch succeeds", async () => {
      const h = harness([html()]);
      await safeFetch("https://example.com/", h.opts);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The real transport against a throwaway local server. safeFetch itself would refuse 127.0.0.1, so this exercises nodeRequest
// directly: it must dial the address the injected lookup returns while keeping the original Host header.

describe("nodeRequest (default transport)", () => {
  let server: http.Server;
  let port: number;
  let seen: http.IncomingHttpHeaders | undefined;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      seen = req.headers;
      if (req.url === "/stream") {
        res.writeHead(200, { "content-type": "text/html" });
        res.write("<html>");
        return; // never ends
      }
      res.writeHead(200, { "content-type": "text/html", "x-test": "1" });
      res.end("<title>local</title>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  const pinTo = (address: string): PinnedLookup => (_host, options, cb) => {
    if (options?.all) cb(null, [{ address, family: 4 }]);
    else cb(null, address, 4);
  };

  it("connects to the pinned address (not whatever DNS says for the name) and keeps the Host header", async () => {
    const res = await nodeRequest({ url: new URL(`http://pinned.invalid:${port}/page`), headers: { "user-agent": "t", "accept-encoding": "identity" }, lookup: pinTo("127.0.0.1"), signal: new AbortController().signal });
    expect(res.status).toBe(200);
    expect(res.headers["x-test"]).toBe("1");
    const chunks: Uint8Array[] = [];
    for await (const c of res.body) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe("<title>local</title>");
    expect(seen?.host).toBe(`pinned.invalid:${port}`);
    expect(seen?.["user-agent"]).toBe("t");
    expect(seen?.cookie).toBeUndefined();
  });

  it("rejects when the abort signal fires mid-stream and the stream ends", async () => {
    const ac = new AbortController();
    const res = await nodeRequest({ url: new URL(`http://pinned.invalid:${port}/stream`), headers: {}, lookup: pinTo("127.0.0.1"), signal: ac.signal });
    const it = res.body[Symbol.asyncIterator]();
    expect((await it.next()).done).toBe(false);
    const pending = it.next().catch((e: unknown) => e);
    ac.abort();
    const out = await pending;
    expect(out === undefined || out instanceof Error || (out as IteratorResult<Uint8Array>).done === true).toBe(true);
  });

  it("rejects before connecting when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(nodeRequest({ url: new URL(`http://pinned.invalid:${port}/`), headers: {}, lookup: pinTo("127.0.0.1"), signal: ac.signal })).rejects.toBeInstanceOf(Error);
  });
});
