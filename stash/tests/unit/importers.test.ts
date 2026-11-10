import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  dedupeKey,
  isWantedEntry,
  newLinks,
  normalizeTikTok,
  parseExportFile,
  parseInstagramHtml,
  parseInstagramJson,
  parseTikTokJson,
  parseTikTokText,
  toIso,
} from "@/lib/importers";
import { readZipEntries } from "@/lib/zip";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");

describe("Instagram saved_posts", () => {
  it("reads the classic string_map_data shape, dedupes reel/p and skips profiles", () => {
    const links = parseInstagramJson(JSON.parse(fixture("instagram_saved_posts_old.json")));
    expect(links.map((l) => l.url)).toEqual([
      "https://www.instagram.com/reel/C1aBcDeFgHi/",
      "https://www.instagram.com/p/C2xYz123AbC/",
    ]);
    expect(links[0].savedAt).toBe(new Date(1700000000 * 1000).toISOString());
    expect(links[1].savedAt).toBe("2023-07-22T04:26:40.000Z");
  });

  it("reads newer label_values, string_list_data and nested collection shapes", () => {
    const links = parseInstagramJson(JSON.parse(fixture("instagram_saved_posts_new.json")));
    expect(links.map((l) => l.url).sort()).toEqual([
      "https://www.instagram.com/p/DXyZ98765ab/",
      "https://www.instagram.com/reel/DAbCdEf1234/",
      "https://www.instagram.com/tv/CTvAbCdE123/",
    ]);
    expect(links.find((l) => l.url.includes("DAbCdEf1234"))?.savedAt).toBe(new Date(1720000000 * 1000).toISOString());
  });

  it("reads the HTML export", () => {
    const links = parseInstagramHtml(fixture("instagram_saved_posts.html"));
    expect(links.map((l) => l.key)).toEqual(["ig:C1aBcDeFgHi", "ig:C2xYz123AbC"]);
  });

  it("ignores garbage", () => {
    expect(parseInstagramJson(null)).toEqual([]);
    expect(parseInstagramJson({ a: [1, true, "nope"] })).toEqual([]);
    expect(parseExportFile("saved_posts.json", "{not json", "instagram")).toEqual([]);
  });
});

describe("TikTok favourites", () => {
  it("reads Activity → Favorite Videos → FavoriteVideoList only (not likes or history)", () => {
    const links = parseTikTokJson(JSON.parse(fixture("tiktok_user_data.json")));
    expect(links.map((l) => l.url)).toEqual([
      "https://www.tiktok.com/@/video/7189012345678901234",
      "https://www.tiktok.com/@/video/7190000000000000001",
    ]);
    expect(links[0].savedAt).toBe("2023-01-15T10:22:33.000Z");
  });

  it("handles lower-case keys, the newer top level and short links", () => {
    const links = parseTikTokJson(JSON.parse(fixture("tiktok_user_data_new.json")));
    expect(links.map((l) => l.url)).toEqual([
      "https://www.tiktok.com/@/video/7375000000000000002",
      "https://vm.tiktok.com/ZMabc123/",
    ]);
  });

  it("reads the TXT export", () => {
    const links = parseTikTokText(fixture("tiktok_favorite_videos.txt"));
    expect(links.map((l) => [l.key, l.savedAt])).toEqual([
      ["tt:7168000000000000003", "2022-11-20T21:14:02.000Z"],
      ["tt:7168000000000000004", "2022-11-21T07:00:00.000Z"],
    ]);
  });

  it("normalises links", () => {
    expect(normalizeTikTok("https://www.tiktokv.com/share/video/7189012345678901234/")).toBe(
      "https://www.tiktok.com/@/video/7189012345678901234",
    );
    expect(normalizeTikTok("https://www.tiktok.com/music/abc")).toBeNull();
  });
});

describe("dedupe and helpers", () => {
  it("matches a shared reel with its exported link", () => {
    expect(dedupeKey("https://www.instagram.com/reel/C1aBcDeFgHi/?igsh=xyz")).toBe(dedupeKey("https://www.instagram.com/p/C1aBcDeFgHi/"));
    expect(dedupeKey("https://www.tiktok.com/@maya/video/7189012345678901234?is_from_webapp=1")).toBe("tt:7189012345678901234");
    const links = parseInstagramJson(JSON.parse(fixture("instagram_saved_posts_old.json")));
    expect(newLinks(links, ["https://www.instagram.com/reel/C2xYz123AbC/?utm_source=x"]).map((l) => l.key)).toEqual(["ig:C1aBcDeFgHi"]);
  });

  it("parses dates", () => {
    expect(toIso(1700000000)).toBe(toIso(1700000000000));
    expect(toIso("2023-01-15 10:22:33")).toBe("2023-01-15T10:22:33.000Z");
    expect(toIso("soon")).toBeNull();
    expect(toIso(-1)).toBeNull();
  });

  it("picks the right files from an export ZIP", () => {
    expect(isWantedEntry("your_instagram_activity/saved/saved_posts.json", "instagram")).toBe(true);
    expect(isWantedEntry("saved/saved_collections.json", "instagram")).toBe(false);
    expect(isWantedEntry("__MACOSX/saved/saved_posts.json", "instagram")).toBe(false);
    expect(isWantedEntry("user_data_tiktok.json", "tiktok")).toBe(true);
    expect(isWantedEntry("TikTok_Data/Activity/Favorite Videos.txt", "tiktok")).toBe(true);
  });
});

describe("readZipEntries", () => {
  it("streams a ZIP and inflates only the wanted entries", async () => {
    const zip = zipSync({
      "your_instagram_activity/saved/saved_posts.json": strToU8(fixture("instagram_saved_posts_old.json")),
      "media/posts/big.jpg": new Uint8Array(200_000).fill(7),
      "your_instagram_activity/likes/liked_posts.json": strToU8('{"likes_media_likes":[]}'),
    });
    const seen: number[] = [];
    const files = await readZipEntries(new Blob([zip]), (n) => isWantedEntry(n, "instagram"), (f) => seen.push(f));
    expect(Object.keys(files)).toEqual(["your_instagram_activity/saved/saved_posts.json"]);
    const links = parseExportFile("saved_posts.json", files["your_instagram_activity/saved/saved_posts.json"], "instagram");
    expect(links).toHaveLength(2);
    expect(seen.at(-1)).toBe(1);
  });
});
