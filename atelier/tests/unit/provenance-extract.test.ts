import { describe, expect, it } from "vitest";
import { extractProvenance } from "@/lib/engine/provenance/extract";
import { sanitizeSourceUrl, validateProvenance, creditLine, emptyProvenance } from "@/lib/engine/provenance/validate";

const NOW = new Date("2026-11-12T10:30:00Z");

describe("sanitizeSourceUrl", () => {
  it("accepts http and https", () => {
    expect(sanitizeSourceUrl("https://images.example.com/a.jpg?x=1#y")).toBe("https://images.example.com/a.jpg?x=1#y");
    expect(sanitizeSourceUrl("http://example.com")).toBe("http://example.com/");
  });
  it("rejects other schemes, credentials, oversize, whitespace and non-strings", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "blob:https://x.com/1",
      "file:///etc/passwd",
      "ftp://x.com/a",
      "https://user:pw@example.com/a",
      "https://user@example.com/a",
      "https://exa mple.com/a",
      "https://example.com/\nfoo",
      "//example.com/a",
      "/relative",
      "",
      "   ",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect(sanitizeSourceUrl(bad), bad).toBeNull();
    }
    expect(sanitizeSourceUrl(42)).toBeNull();
    expect(sanitizeSourceUrl(null)).toBeNull();
  });
  it("accepts exactly 2048 characters and trims the ends", () => {
    const base = "https://example.com/";
    const ok = base + "a".repeat(2048 - base.length);
    expect(sanitizeSourceUrl(ok)).toBe(ok);
    expect(sanitizeSourceUrl(`  ${ok}  `)).toBe(ok);
    expect(sanitizeSourceUrl(ok + "a")).toBeNull();
  });
});

describe("validateProvenance", () => {
  it("accepts a complete record and a date or ISO date-time", () => {
    const p = { sourceUrl: "https://example.com/a", credit: "Jane", licence: "CC BY 4.0", capturedAt: "2026-11-12" };
    expect(validateProvenance(p)).toEqual(p);
    expect(validateProvenance({ ...p, capturedAt: "2026-11-12T10:30:00.000Z" })?.capturedAt).toBe("2026-11-12T10:30:00.000Z");
    expect(validateProvenance({ ...p, sourceUrl: null, capturedAt: null })).toEqual({ ...p, sourceUrl: null, capturedAt: null });
  });
  it("rejects hostile or oversized fields", () => {
    const ok = { sourceUrl: null, credit: "", licence: "", capturedAt: null };
    expect(validateProvenance({ ...ok, sourceUrl: "javascript:alert(1)" })).toBeNull();
    expect(validateProvenance({ ...ok, credit: "x".repeat(201) })).toBeNull();
    expect(validateProvenance({ ...ok, credit: "x".repeat(200) })).not.toBeNull();
    expect(validateProvenance({ ...ok, licence: "x".repeat(101) })).toBeNull();
    expect(validateProvenance({ ...ok, capturedAt: "yesterday" })).toBeNull();
    expect(validateProvenance({ ...ok, capturedAt: "2026-13-45" })).toBeNull();
    expect(validateProvenance("nope")).toBeNull();
    expect(validateProvenance(null)).toBeNull();
    expect(validateProvenance({ credit: 4 })).toBeNull();
  });
  it("drops control characters from text fields and trims", () => {
    const r = validateProvenance({ sourceUrl: null, credit: "  Jane\u0000 Doe\n", licence: "", capturedAt: null });
    expect(r?.credit).toBe("Jane Doe");
  });
  it("emptyProvenance is all empty", () => {
    expect(emptyProvenance()).toEqual({ sourceUrl: null, credit: "", licence: "", capturedAt: null });
  });
});

describe("creditLine", () => {
  const p = (o: Partial<ReturnType<typeof emptyProvenance>>) => ({ ...emptyProvenance(), ...o });
  it("joins credit and licence", () => {
    expect(creditLine(p({ credit: "Jane Doe", licence: "CC BY 4.0", sourceUrl: "https://x.com/a" }))).toBe("Jane Doe · CC BY 4.0");
    expect(creditLine(p({ credit: "Jane Doe" }))).toBe("Jane Doe");
    expect(creditLine(p({ licence: "CC0" }))).toBe("CC0");
  });
  it("falls back to the source hostname, then to nothing", () => {
    expect(creditLine(p({ sourceUrl: "https://www.example.com/path?q=1" }))).toBe("example.com");
    expect(creditLine(p({}))).toBe("");
    expect(creditLine(null)).toBe("");
  });
  it("never returns markup-interpreted text (it is plain text; the caller escapes)", () => {
    expect(creditLine(p({ credit: "<b>x</b>" }))).toBe("<b>x</b>");
  });
});

describe("extractProvenance", () => {
  it("returns an empty object when there is nothing to find", () => {
    expect(extractProvenance({})).toEqual({});
    expect(extractProvenance({ fileName: "IMG_0001.jpg" })).toEqual({});
    expect(extractProvenance({ text: "just some words" })).toEqual({});
  });
  it("uses the first absolute http(s) <img src> in the html, and stamps the capture date", () => {
    const r = extractProvenance({ html: '<meta charset="utf-8"><img src="https://images.example.com/a.jpg" alt="x">', now: NOW });
    expect(r).toEqual({ sourceUrl: "https://images.example.com/a.jpg", capturedAt: "2026-11-12" });
  });
  it("prefers the page url over the image url, then the SourceURL header, then text, then img", () => {
    const html = 'Version:0.9\r\nSourceURL:https://header.example.com/p\r\n<html><img src="https://img.example.com/a.jpg"></html>';
    expect(extractProvenance({ html, url: "https://page.example.com/post" }).sourceUrl).toBe("https://page.example.com/post");
    expect(extractProvenance({ html }).sourceUrl).toBe("https://header.example.com/p");
    expect(extractProvenance({ html: '<img src="https://img.example.com/a.jpg">', text: "https://text.example.com/x" }).sourceUrl).toBe(
      "https://text.example.com/x",
    );
    expect(extractProvenance({ html: '<img src="https://img.example.com/a.jpg">' }).sourceUrl).toBe("https://img.example.com/a.jpg");
  });
  it("takes the first http(s) line of a uri-list and ignores comments and other schemes", () => {
    expect(extractProvenance({ text: "# comment\r\nfile:///x.png\r\nhttps://a.example.com/1.png\r\nhttps://b.example.com/2.png" }).sourceUrl).toBe(
      "https://a.example.com/1.png",
    );
  });
  it("does not pick a url out of running text", () => {
    expect(extractProvenance({ text: "see https://example.com/a for more" })).toEqual({});
  });
  it("ignores data: and blob: image sources", () => {
    expect(extractProvenance({ html: '<img src="data:image/png;base64,AAAA">' })).toEqual({});
    expect(extractProvenance({ html: '<img src="blob:https://example.com/123">' })).toEqual({});
    expect(
      extractProvenance({ html: '<img src="data:image/png;base64,AAAA"><img src="https://ok.example.com/z.png">', now: NOW }).sourceUrl,
    ).toBe("https://ok.example.com/z.png");
  });
  it("resolves relative and protocol-relative image sources against the page url, and only then", () => {
    expect(extractProvenance({ html: '<img src="/img/a.jpg">', url: "https://example.com/post/1" }).sourceUrl).toBe("https://example.com/post/1");
    expect(extractProvenance({ html: '<img src="/img/a.jpg">' })).toEqual({});
    expect(extractProvenance({ html: '<img src="//cdn.example.com/a.jpg">' })).toEqual({});
  });
  it("handles single-quoted, unquoted and entity-encoded src values", () => {
    expect(extractProvenance({ html: "<img src='https://a.example.com/1.jpg'>" }).sourceUrl).toBe("https://a.example.com/1.jpg");
    expect(extractProvenance({ html: "<img alt=x src=https://a.example.com/2.jpg>" }).sourceUrl).toBe("https://a.example.com/2.jpg");
    expect(extractProvenance({ html: '<img src="https://a.example.com/3.jpg?a=1&amp;b=2">' }).sourceUrl).toBe("https://a.example.com/3.jpg?a=1&b=2");
  });
  it("rejects javascript: and credential-carrying urls from every source", () => {
    expect(extractProvenance({ html: '<img src="javascript:alert(1)">' })).toEqual({});
    expect(extractProvenance({ html: '<img src="java&#115;cript:alert(1)">' })).toEqual({});
    expect(extractProvenance({ url: "javascript:alert(1)" })).toEqual({});
    expect(extractProvenance({ url: "https://u:p@example.com/a" })).toEqual({});
    expect(extractProvenance({ text: "https://u:p@example.com/a" })).toEqual({});
  });
  it("is inert on hostile html: scripts, comments, nested quotes, giant input, binary junk", () => {
    expect(extractProvenance({ html: '<script>var s="<img src=\'https://evil.example.com/x.png\'>"</script>' })).toEqual({});
    expect(extractProvenance({ html: '<!-- <img src="https://evil.example.com/c.png"> -->' })).toEqual({});
    expect(extractProvenance({ html: '<style>img{background:url("https://evil.example.com/s.png")}</style>' })).toEqual({});
    expect(extractProvenance({ html: '<img src="https://a.example.com/x.png"onerror="alert(1)">' }).sourceUrl).toBe("https://a.example.com/x.png");
    expect(extractProvenance({ html: "<img src=\"https://a.example.com/x\" onerror='fetch(`//evil`)'>" }).sourceUrl).toBe("https://a.example.com/x");
    const t0 = Date.now();
    expect(extractProvenance({ html: "<img " + "a=\"".repeat(200_000) })).toEqual({});
    expect(extractProvenance({ html: "<".repeat(500_000) })).toEqual({});
    expect(extractProvenance({ html: "<img src=" + "x".repeat(2_000_000) })).toEqual({});
    expect(extractProvenance({ html: "\u0000\u0001<img\u0000src=\"https://a.example.com/\u0000x\">" })).toEqual({});
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("never guesses a credit or licence and never returns markup", () => {
    const r = extractProvenance({ html: '<figure><img src="https://a.example.com/x.jpg" alt="Photo by <b>Jane</b>"><figcaption>(c) Jane</figcaption></figure>', now: NOW });
    expect(r.credit).toBeUndefined();
    expect(r.licence).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("<");
  });
  it("does not stamp a date when the clock is unusable", () => {
    const r = extractProvenance({ url: "https://example.com/a", now: new Date(NaN) });
    expect(r.sourceUrl).toBe("https://example.com/a");
    expect(r.capturedAt).toBeNull();
  });
});
