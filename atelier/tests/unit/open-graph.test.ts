import { describe, expect, it } from "vitest";
import { decodeHtmlBody, parseOpenGraph } from "@/lib/server/open-graph";

const BASE = "https://example.com/articles/one";
const page = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("parseOpenGraph", () => {
  it("reads a normal page", () => {
    const p = parseOpenGraph(
      page(`<title>Plain title</title>
        <meta property="og:title" content="OG title">
        <meta property="og:description" content="OG description">
        <meta property="og:site_name" content="Example Mag">
        <meta property="og:image" content="https://cdn.example.com/cover.jpg">
        <link rel="icon" href="/static/fav.png">`),
      BASE,
    );
    expect(p).toEqual({
      title: "OG title",
      description: "OG description",
      siteName: "Example Mag",
      imageUrl: "https://cdn.example.com/cover.jpg",
      faviconUrl: "https://example.com/static/fav.png",
      finalUrl: BASE,
    });
  });

  it("falls back: og:title > twitter:title > <title> > hostname", () => {
    expect(parseOpenGraph(page(`<meta name="twitter:title" content="TW"><title>T</title>`), BASE).title).toBe("TW");
    expect(parseOpenGraph(page(`<title>T</title>`), BASE).title).toBe("T");
    expect(parseOpenGraph(page(``), BASE).title).toBe("example.com");
    expect(parseOpenGraph(page(`<title>   </title>`), BASE).title).toBe("example.com");
    expect(parseOpenGraph(page(`<meta property="og:title" content="  "><title>T</title>`), BASE).title).toBe("T");
  });

  it("falls back: og:description > meta description; og:site_name > hostname; og:image > twitter:image", () => {
    const p = parseOpenGraph(page(`<meta name="description" content="plain desc"><meta name="twitter:image" content="/tw.png">`), BASE);
    expect(p.description).toBe("plain desc");
    expect(p.siteName).toBe("example.com");
    expect(p.imageUrl).toBe("https://example.com/tw.png");
    const q = parseOpenGraph(page(`<meta name="description" content="plain"><meta property="og:description" content="og">`), BASE);
    expect(q.description).toBe("og");
  });

  it("accepts name= or property= for og tags, any attribute order and case, quoted any way", () => {
    const p = parseOpenGraph(page(`<META CONTENT='Single' NAME="og:title"><meta content=unquoted property=og:site_name>`), BASE);
    expect(p.title).toBe("Single");
    expect(p.siteName).toBe("unquoted");
  });

  it("returns a missing-everything page as hostname title and empty strings", () => {
    expect(parseOpenGraph("", "https://news.example.org/x")).toEqual({
      title: "news.example.org",
      description: "",
      siteName: "news.example.org",
      imageUrl: null,
      faviconUrl: "https://news.example.org/favicon.ico",
      finalUrl: "https://news.example.org/x",
    });
  });

  it("resolves a relative og:image against the final URL", () => {
    expect(parseOpenGraph(page(`<meta property="og:image" content="/img.png">`), BASE).imageUrl).toBe("https://example.com/img.png");
    expect(parseOpenGraph(page(`<meta property="og:image" content="cover.png">`), BASE).imageUrl).toBe("https://example.com/articles/cover.png");
    expect(parseOpenGraph(page(`<meta property="og:image" content="//cdn.example.net/a.png">`), BASE).imageUrl).toBe("https://cdn.example.net/a.png");
    expect(parseOpenGraph(page(`<meta property="og:image" content="/img.png">`), "http://example.com/x").imageUrl).toBe("http://example.com/img.png");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "data:text/html,x",
    "file:///etc/passwd",
    "ftp://example.com/a.png",
    "blob:https://example.com/x",
    "https://user:pw@example.com/a.png",
    "https://",
    "",
  ])("drops og:image %j", (v) => {
    const html = page(`<meta property="og:image" content="${v.replace(/"/g, "&quot;")}">`);
    expect(parseOpenGraph(html, BASE).imageUrl).toBeNull();
  });

  it("falls through to twitter:image when og:image is unusable", () => {
    const p = parseOpenGraph(page(`<meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="/ok.png">`), BASE);
    expect(p.imageUrl).toBe("https://example.com/ok.png");
  });

  it("rejects absurdly long image URLs", () => {
    const p = parseOpenGraph(page(`<meta property="og:image" content="https://example.com/${"a".repeat(5000)}">`), BASE);
    expect(p.imageUrl).toBeNull();
  });

  it("finds the favicon: rel tokens, shortcut icon, relative resolution, javascript: rejected, fallback to /favicon.ico", () => {
    expect(parseOpenGraph(page(`<link rel="shortcut icon" href="f.ico">`), BASE).faviconUrl).toBe("https://example.com/articles/f.ico");
    expect(parseOpenGraph(page(`<link rel="ICON" href="//cdn.example.net/f.png">`), BASE).faviconUrl).toBe("https://cdn.example.net/f.png");
    expect(parseOpenGraph(page(`<link href="/f.png" rel="icon" type="image/png">`), BASE).faviconUrl).toBe("https://example.com/f.png");
    expect(parseOpenGraph(page(`<link rel="stylesheet" href="/a.css">`), BASE).faviconUrl).toBe("https://example.com/favicon.ico");
    expect(parseOpenGraph(page(`<link rel="icon" href="javascript:alert(1)">`), BASE).faviconUrl).toBe("https://example.com/favicon.ico");
    expect(parseOpenGraph(page(`<link rel="icon" href="data:image/png;base64,AAAA">`), BASE).faviconUrl).toBe("https://example.com/favicon.ico");
  });

  it("returns plain text: tags stripped, entities decoded once, control characters removed, whitespace collapsed", () => {
    const p = parseOpenGraph(
      page(`<meta property="og:title" content="  Tom &amp; Jerry&#39;s &quot;Show&quot; &#x1F600;\n\t  second   line &nbsp;ok  ">
            <meta property="og:description" content="a\u0000b\u0007c‮d​e f&#0;g&#xD800;h&#x110000;i">`),
      BASE,
    );
    expect(p.title).toBe(`Tom & Jerry's "Show" \u{1F600} second line ok`);
    expect(p.description).toBe("abcde fghi");
  });

  it("does not double-decode entities", () => {
    const p = parseOpenGraph(page(`<meta property="og:title" content="&amp;lt;b&amp;gt; &amp;amp; &amp;#39;">`), BASE);
    expect(p.title).toBe("&lt;b&gt; &amp; &#39;");
  });

  it("leaves unknown or malformed entities as written", () => {
    const p = parseOpenGraph(page(`<meta property="og:title" content="a &bogus; b &amp c &#; d">`), BASE);
    expect(p.title).toBe("a &bogus; b &amp c &#; d");
  });

  it("neutralises markup in the title: <title><script>alert(1)</script>x</title> becomes plain text with no tags", () => {
    const p = parseOpenGraph(page(`<title><script>alert(1)</script>x</title>`), BASE);
    expect(p.title).toBe("x");
    expect(p.title).not.toMatch(/[<>]/);
    expect(parseOpenGraph(page(`<title>a <b>bold</b> <img src=x onerror=alert(1)> z</title>`), BASE).title).toBe("a bold z");
  });

  it("an og:title attribute full of tags is stripped to text", () => {
    const p = parseOpenGraph(page(`<meta property="og:title" content="<script>alert(1)</script>Hi <b>there</b>">`), BASE);
    expect(p.title).toBe("Hi there");
  });

  it("escaped markup stays literal text (the client renders it as text, never as HTML)", () => {
    const p = parseOpenGraph(page(`<meta property="og:title" content="&lt;script&gt;alert(1)&lt;/script&gt;">`), BASE);
    expect(p.title).toBe("<script>alert(1)</script>");
  });

  it("clamps lengths: title 200, description 400, site name 100", () => {
    const p = parseOpenGraph(
      page(`<title>${"t".repeat(5000)}</title><meta property="og:site_name" content="${"s".repeat(500)}"><meta property="og:description" content="${"d".repeat(1_000_000)}">`),
      BASE,
    );
    expect(p.title).toHaveLength(200);
    expect(p.description).toHaveLength(400);
    expect(p.siteName).toHaveLength(100);
  });

  it("never splits a surrogate pair when clamping", () => {
    const p = parseOpenGraph(page(`<title>${"\u{1F600}".repeat(300)}</title>`), BASE);
    expect(p.title.length).toBeLessThanOrEqual(200);
    expect(p.title).toMatch(/^(\u{1F600})+$/u);
  });

  it("ignores meta tags inside scripts, styles and comments", () => {
    const p = parseOpenGraph(
      page(`<!-- <meta property="og:title" content="comment"> -->
        <script>var s = '<meta property="og:title" content="script">'; </script>
        <style>/* <meta property="og:title" content="style"> */</style>
        <meta property="og:title" content="real">`),
      BASE,
    );
    expect(p.title).toBe("real");
  });

  it("takes the first occurrence of a property", () => {
    expect(parseOpenGraph(page(`<meta property="og:title" content="one"><meta property="og:title" content="two">`), BASE).title).toBe("one");
  });

  it("survives malformed HTML: unterminated tags, quotes, comments and scripts, stray angle brackets, binary junk", () => {
    const junk = [
      `<meta property="og:title" content="never closed`,
      `<meta property="og:title" content='x"`,
      `<<<<>>>> <meta <meta <meta`,
      `<!-- unterminated comment <meta property="og:title" content="hidden">`,
      `<script> unterminated <meta property="og:title" content="hidden">`,
      `<title>unterminated title`,
      `<meta property=og:title content=>`,
      `<meta property content>`,
      `<link rel=icon>`,
      `\u0000\u0001\u0002<meta property="og:title" content="\u0000">`,
      `<meta ${"a=".repeat(20000)}`,
    ];
    for (const j of junk) {
      const p = parseOpenGraph(j, BASE);
      expect(typeof p.title).toBe("string");
      expect(p.title).not.toMatch(/[<>]/);
    }
    expect(parseOpenGraph(`<title>unterminated title`, BASE).title).toBe("unterminated title");
  });

  it("stays fast on hostile input (no quadratic scanning)", () => {
    const evil = `<meta '`.repeat(30_000);
    const t = Date.now();
    parseOpenGraph(evil, BASE);
    parseOpenGraph(`<a `.repeat(60_000), BASE);
    parseOpenGraph(`<!--`.repeat(60_000), BASE);
    parseOpenGraph(`<script>`.repeat(30_000), BASE);
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it("only scans the first 200 KB", () => {
    const html = `<title>early</title>${" ".repeat(200 * 1024)}<meta property="og:title" content="late">`;
    expect(parseOpenGraph(html, BASE).title).toBe("early");
    const late = `${" ".repeat(200 * 1024)}<meta property="og:title" content="late">`;
    expect(parseOpenGraph(late, BASE).title).toBe("example.com");
  });

  it("does not follow <base href> and does not execute or fetch anything", () => {
    const p = parseOpenGraph(page(`<base href="http://127.0.0.1/"><meta property="og:image" content="/i.png">`), BASE);
    expect(p.imageUrl).toBe("https://example.com/i.png");
  });

  it("tolerates a bad base URL", () => {
    const p = parseOpenGraph(page(`<title>T</title><meta property="og:image" content="/i.png">`), "not a url");
    expect(p.title).toBe("T");
    expect(p.imageUrl).toBeNull();
    expect(p.faviconUrl).toBeNull();
  });
});

describe("decodeHtmlBody", () => {
  const bytes = (s: string, enc = "utf-8") => (enc === "utf-8" ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, enc as BufferEncoding)));

  it("decodes utf-8 by default and honours the Content-Type charset", () => {
    expect(decodeHtmlBody(bytes("café"), "text/html")).toBe("café");
    expect(decodeHtmlBody(bytes("café", "latin1"), "text/html; charset=ISO-8859-1")).toBe("café");
  });

  it("falls back to a <meta charset> sniff when the header has none", () => {
    expect(decodeHtmlBody(bytes(`<meta charset="iso-8859-1"><title>café</title>`, "latin1"), "text/html")).toContain("café");
    expect(decodeHtmlBody(bytes(`<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><title>€</title>`, "latin1").map((b) => b), "text/html")).toContain("<title>");
  });

  it("ignores unknown charsets without throwing", () => {
    expect(decodeHtmlBody(bytes("ok"), "text/html; charset=bogus-9000")).toBe("ok");
    expect(decodeHtmlBody(new Uint8Array([0xff, 0xfe, 0x00]), "text/html")).toEqual(expect.any(String));
  });
});
