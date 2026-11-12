import { describe, expect, it } from "vitest";
import { classifyUrl } from "@/lib/engine/links/classify";
import { EMBED_ORIGINS, isAllowedEmbedUrl, toEmbed } from "@/lib/engine/links/embed";
import { defaultsFor } from "@/lib/engine/model/defaults";
import { validateObject } from "@/lib/engine/model/validate";

const YT = "dQw4w9WgXcQ";
const yt = (extra = "") => `https://www.youtube-nocookie.com/embed/${YT}${extra}`;
const figma = (u: string) => `https://www.figma.com/embed?embed_host=atelier&url=${encodeURIComponent(u)}`;

describe("EMBED_ORIGINS", () => {
  it("is exactly the three provider origins", () => {
    expect([...EMBED_ORIGINS]).toEqual(["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.figma.com"]);
  });
});

describe("toEmbed: accepted URLs build the embed URL from IDs", () => {
  const cases: [string, string, string, number][] = [
    ["watch", `https://www.youtube.com/watch?v=${YT}`, yt(), 16 / 9],
    ["bare domain", `https://youtube.com/watch?v=${YT}`, yt(), 16 / 9],
    ["mobile", `https://m.youtube.com/watch?v=${YT}`, yt(), 16 / 9],
    ["uppercase host", `https://WWW.YouTube.COM/watch?v=${YT}`, yt(), 16 / 9],
    ["http scheme", `http://www.youtube.com/watch?v=${YT}`, yt(), 16 / 9],
    ["explicit default port", `https://www.youtube.com:443/watch?v=${YT}`, yt(), 16 / 9],
    ["extra params + playlist", `https://www.youtube.com/watch?feature=share&v=${YT}&list=PLabc123`, yt(), 16 / 9],
    ["youtu.be", `https://youtu.be/${YT}`, yt(), 16 / 9],
    ["youtu.be timestamp", `https://youtu.be/${YT}?t=42`, yt("?start=42"), 16 / 9],
    ["youtu.be timestamp with s", `https://youtu.be/${YT}?t=42s`, yt("?start=42"), 16 / 9],
    ["youtu.be timestamp 1m30s", `https://youtu.be/${YT}?t=1m30s`, yt("?start=90"), 16 / 9],
    ["watch start=", `https://www.youtube.com/watch?v=${YT}&start=7`, yt("?start=7"), 16 / 9],
    ["shorts", `https://youtube.com/shorts/${YT}`, yt(), 9 / 16],
    ["embed path", `https://www.youtube.com/embed/${YT}`, yt(), 16 / 9],
    ["id with dash and underscore", "https://youtu.be/a-b_c-d_e-f", "https://www.youtube-nocookie.com/embed/a-b_c-d_e-f", 16 / 9],
    ["vimeo", "https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871", 16 / 9],
    ["vimeo www", "https://www.vimeo.com/76979871", "https://player.vimeo.com/video/76979871", 16 / 9],
    ["vimeo private hash", "https://vimeo.com/76979871/abcdef123456", "https://player.vimeo.com/video/76979871?h=abcdef123456", 16 / 9],
    ["vimeo channel", "https://vimeo.com/channels/staffpicks/76979871", "https://player.vimeo.com/video/76979871", 16 / 9],
    ["vimeo group", "https://vimeo.com/groups/shorts/videos/76979871", "https://player.vimeo.com/video/76979871", 16 / 9],
    ["vimeo player", "https://player.vimeo.com/video/76979871", "https://player.vimeo.com/video/76979871", 16 / 9],
    ["vimeo player with h", "https://player.vimeo.com/video/76979871?h=abcdef123456", "https://player.vimeo.com/video/76979871?h=abcdef123456", 16 / 9],
  ];
  it.each(cases)("%s", (_n, raw, embedUrl, aspect) => {
    const e = toEmbed(raw);
    expect(e).not.toBeNull();
    expect(e!.embedUrl).toBe(embedUrl);
    expect(e!.aspect).toBeCloseTo(aspect, 5);
  });

  it("names the provider", () => {
    expect(toEmbed(`https://youtu.be/${YT}`)!.provider).toBe("youtube");
    expect(toEmbed("https://vimeo.com/76979871")!.provider).toBe("vimeo");
    expect(toEmbed("https://www.figma.com/design/AbC123/Name?node-id=1-2")!.provider).toBe("figma");
  });

  const figmaCases: [string, string][] = [
    ["design", "https://www.figma.com/design/AbC123/Name?node-id=1-2"],
    ["file", "https://www.figma.com/file/AbC123xyz/Some-File"],
    ["proto", "https://www.figma.com/proto/AbC123xyz/Some-Prototype?page-id=0%3A1"],
    ["board", "https://www.figma.com/board/AbC123xyz/Brainstorm"],
    ["slides", "https://www.figma.com/slides/AbC123xyz/Deck"],
    ["make", "https://www.figma.com/make/AbC123xyz/Thing"],
    ["no www", "https://figma.com/design/AbC123xyz/Name"],
  ];
  it.each(figmaCases)("figma %s wraps the original https URL", (_n, raw) => {
    const e = toEmbed(raw);
    expect(e).not.toBeNull();
    const norm = new URL(raw);
    const original = `https://www.figma.com${norm.pathname}${norm.search}`;
    expect(e!.embedUrl).toBe(figma(original));
  });
});

describe("toEmbed: everything else is null", () => {
  const negatives = [
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ",
    "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://notyoutu.be/dQw4w9WgXcQ",
    "https://evil.com/?u=youtu.be/dQw4w9WgXcQ",
    "https://evil.com/watch?v=dQw4w9WgXcQ&u=https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://user@youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:evil@evil.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com./watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQextra",
    "https://www.youtube.com/watch?v=dQw4w9WgX<>",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/playlist?list=PLabc123",
    "https://www.youtube.com/@channel",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/",
    "https://vimeo.com/abc",
    "https://vimeo.com/channels/staffpicks",
    "https://vimeo.com/76979871/zz",
    "https://vimeo.com.evil.com/76979871",
    "https://evilvimeo.com/76979871",
    "https://player.vimeo.com/video/abc",
    "https://www.figma.com/community/plugin/1",
    "https://www.figma.com/design/",
    "https://www.figma.com.evil.com/design/AbC123xyz/Name",
    "https://evil.com/figma.com/design/AbC123xyz/Name",
    "https://example.com/video",
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///etc/passwd",
    "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
    "//www.youtube.com/watch?v=dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "",
    "   ",
    "not a url",
  ];
  it.each(negatives)("%s", (raw) => {
    expect(toEmbed(raw)).toBeNull();
  });

  it("rejects a 2,000+ character URL even on an allowed host", () => {
    expect(toEmbed(`https://www.youtube.com/watch?v=${YT}&x=${"a".repeat(2100)}`)).toBeNull();
  });

  it("ignores a hostile start value", () => {
    expect(toEmbed(`https://youtu.be/${YT}?t=%22onload=alert(1)`)!.embedUrl).toBe(yt());
    expect(toEmbed(`https://youtu.be/${YT}?t=99999999999`)!.embedUrl).toBe(yt());
  });
});

describe("isAllowedEmbedUrl", () => {
  it("accepts only https URLs on the allow-listed origins", () => {
    expect(isAllowedEmbedUrl(yt())).toBe(true);
    expect(isAllowedEmbedUrl("https://player.vimeo.com/video/1?h=abcdef")).toBe(true);
    expect(isAllowedEmbedUrl(figma("https://www.figma.com/design/AbC123/Name"))).toBe(true);
  });
  it.each([
    "https://evil.com/embed/x",
    "http://www.youtube-nocookie.com/embed/x",
    "https://www.youtube-nocookie.com.evil.com/embed/x",
    "https://user@www.youtube-nocookie.com/embed/x",
    "https://www.youtube-nocookie.com:444/embed/x",
    "https://www.youtube.com/embed/x",
    "https://www.youtube-nocookie.com/watch?v=x",
    "https://player.vimeo.com/other",
    "https://www.figma.com/design/AbC123/Name",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "",
    "nope",
  ])("rejects %s", (u) => {
    expect(isAllowedEmbedUrl(u)).toBe(false);
  });
});

describe("classifyUrl", () => {
  it("returns an embed for provider URLs", () => {
    expect(classifyUrl(`https://youtu.be/${YT}`)).toEqual({ kind: "embed", provider: "youtube", embedUrl: yt(), aspect: 16 / 9 });
  });
  it("returns a link for any other http(s) URL", () => {
    expect(classifyUrl("https://example.com/a")).toEqual({ kind: "link", url: "https://example.com/a" });
    expect(classifyUrl("http://example.com:8080/a?b=1#c")).toEqual({ kind: "link", url: "http://example.com:8080/a?b=1#c" });
    expect(classifyUrl("  https://example.com/a \n")).toEqual({ kind: "link", url: "https://example.com/a" });
  });
  it("treats lookalike hosts as plain links", () => {
    expect(classifyUrl("https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ").kind).toBe("link");
    expect(classifyUrl("https://evilyoutube.com/watch?v=dQw4w9WgXcQ").kind).toBe("link");
    expect(classifyUrl("https://www.youtube.com./watch?v=dQw4w9WgXcQ").kind).toBe("link");
  });
  it("returns none for non-web schemes, credentials, empties and oversize URLs", () => {
    for (const u of ["ftp://x", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "mailto:a@b.c", "", "plain text", "https://user:pw@example.com/", "https://user@example.com/", `https://example.com/${"a".repeat(2100)}`]) {
      expect(classifyUrl(u).kind, u).toBe("none");
    }
  });
  it("returns the normalised URL for link cards", () => {
    expect(classifyUrl("HTTPS://Example.COM/Path")).toEqual({ kind: "link", url: "https://example.com/Path" });
  });
});

describe("validateObject: embed origin allow-list", () => {
  const embed = (embedUrl: string) => validateObject({ ...defaultsFor("embed"), id: "e1", index: "a0", createdAt: 1, updatedAt: 1, embedUrl });
  it("keeps an allow-listed embed", () => {
    expect(embed(yt())).not.toBeNull();
    expect(embed(figma("https://www.figma.com/design/AbC123/Name"))).not.toBeNull();
  });
  it("rejects other origins, http and credentials", () => {
    expect(embed("https://evil.com/embed/x")).toBeNull();
    expect(embed("http://www.youtube-nocookie.com/embed/x")).toBeNull();
    expect(embed("https://user@www.youtube-nocookie.com/embed/x")).toBeNull();
    expect(embed("javascript:alert(1)")).toBeNull();
  });
  it("still accepts the model defaults", () => {
    expect(validateObject({ ...defaultsFor("embed"), id: "e1", index: "a0", createdAt: 1, updatedAt: 1 })).not.toBeNull();
  });
});
