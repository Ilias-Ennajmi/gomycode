import { describe, expect, it } from "vitest";
import {
  aiNote,
  embedAspect,
  embedSrc,
  fallbackMode,
  openInLabel,
  playbackMode,
  processIndex,
  processLabel,
  safeEmbedUrl,
  videoNote,
  type PlaybackInput,
} from "@/lib/playback";
import { applySaveRow, toSaveItem, type SaveItem } from "@/lib/data";

const TT = "https://www.tiktok.com/player/v1/7312345678901234567";
const IG = "https://www.instagram.com/reel/Cx1AbCdEf/embed";
const YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

const s = (p: Partial<PlaybackInput>): PlaybackInput => ({ platform: "tiktok", playback: "link", videoState: "none", videoPath: null, embedUrl: null, ...p });

describe("playback decision (contract 0007 §7)", () => {
  it("plays the stored file when there is one", () => {
    expect(playbackMode(s({ playback: "video", videoState: "stored", videoPath: "u/s.mp4", embedUrl: TT })).mode).toBe("file");
  });

  it("uses the official embed when the copy is blocked, too big, evicted or never made", () => {
    for (const videoState of ["blocked", "too_big", "evicted", "none"] as const) {
      expect(playbackMode(s({ playback: "embed", videoState, embedUrl: TT }))).toEqual({ mode: "embed", embedUrl: TT });
    }
  });

  it("falls to a link card without an embed", () => {
    expect(playbackMode(s({ playback: "link", videoState: "blocked" })).mode).toBe("link");
    expect(playbackMode(s({ playback: "embed", embedUrl: null })).mode).toBe("link");
  });

  it("never trusts playback=video without a stored path", () => {
    expect(playbackMode(s({ playback: "video", videoState: "evicted", videoPath: null, embedUrl: TT })).mode).toBe("embed");
    expect(playbackMode(s({ playback: "video", videoState: "stored", videoPath: null })).mode).toBe("link");
  });

  it("shows articles and screenshots as what they are", () => {
    expect(playbackMode(s({ platform: "web", playback: "link" })).mode).toBe("article");
    expect(playbackMode(s({ platform: "screenshot", playback: "none" })).mode).toBe("image");
    expect(playbackMode(s({ platform: "web", playback: "none", embedUrl: YT })).mode).toBe("article");
  });

  it("keeps working for a copy cached before the new columns existed", () => {
    expect(playbackMode({ platform: "instagram", videoPath: "u/s.mp4" }).mode).toBe("file");
    expect(playbackMode({ platform: "instagram" }).mode).toBe("link");
  });

  it("a file that fails falls back to the embed, else the link", () => {
    expect(fallbackMode(s({ embedUrl: IG }))).toBe("embed");
    expect(fallbackMode(s({}))).toBe("link");
    expect(fallbackMode(s({ platform: "web" }))).toBe("article");
  });
});

describe("embed URLs", () => {
  it("accepts only the three official players", () => {
    expect(safeEmbedUrl(TT)).toBe(TT);
    expect(safeEmbedUrl(IG)).toBe(IG);
    expect(safeEmbedUrl("https://www.instagram.com/p/Cx1AbCdEf/embed")).not.toBeNull();
    expect(safeEmbedUrl(YT)).toBe(YT);
    for (const bad of [
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://evil.example/player/v1/123456",
      "https://www.tiktok.com/player/v1/123456?x=<script>",
      "http://www.tiktok.com/player/v1/123456",
      "https://www.tiktok.com.evil.example/player/v1/123456",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeEmbedUrl(bad)).toBeNull();
    }
    expect(playbackMode(s({ playback: "embed", embedUrl: "https://evil.example/embed/x" })).mode).toBe("link");
  });

  it("adds each player's options and autoplays only when asked", () => {
    expect(embedSrc(TT, { autoplay: true })).toBe(`${TT}?autoplay=1&loop=1&rel=0&music_info=0&description=0`);
    expect(embedSrc(YT)).toBe(`${YT}?playsinline=1&rel=0&autoplay=0`);
    expect(embedSrc(IG, { autoplay: true })).toBe(IG);
  });

  it("sizes the frame for what is inside", () => {
    expect(embedAspect(TT)).toBe("portrait");
    expect(embedAspect(IG)).toBe("portrait");
    expect(embedAspect("https://www.instagram.com/p/Cx1AbCdEf/embed")).toBe("card");
    expect(embedAspect(YT, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("landscape");
    expect(embedAspect(YT, "https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("portrait");
  });
});

describe("plain words", () => {
  it("explains a missing copy in one quiet line", () => {
    expect(videoNote("evicted", "tiktok")).toMatch(/cleared to make room.*TikTok/);
    expect(videoNote("blocked", "instagram")).toMatch(/Instagram didn't allow/);
    expect(videoNote("too_big", "youtube")).toMatch(/Too long/);
    expect(videoNote("stored", "tiktok")).toBeNull();
    expect(videoNote("none", "tiktok")).toBeNull();
  });

  it("names the way out", () => {
    expect(openInLabel("tiktok")).toBe("Open in TikTok");
    expect(openInLabel("youtube")).toBe("Open in YouTube");
    expect(openInLabel("web")).toBe("Open the article");
  });

  it("labels the steps", () => {
    expect(["queued", "fetching", "watching", "reading", "filing", "ready"].map((x) => processIndex(x as never))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(processLabel("fetching")).toBe("Fetching");
    expect(processLabel("watching", "tiktok")).toBe("Watching");
    expect(processLabel("watching", "web")).toBe("Reading");
    expect(processLabel("filing")).toBe("Filing");
    expect(processLabel(undefined)).toBe("Waiting");
  });

  it("is calm about a missing AI key", () => {
    expect(aiNote("no_key")).toEqual({ text: "Summaries turn on once an AI key is added.", link: { href: "/settings#setup", label: "See Setup" } });
    expect(aiNote("failed")?.retry).toBe(true);
    expect(aiNote("over_budget")?.text).toMatch(/budget/);
    expect(aiNote("done")).toBeNull();
    expect(aiNote("pending")).toBeNull();
  });
});

describe("live progress on a save", () => {
  const row = {
    id: "s1",
    client_id: null,
    source_url: "https://www.tiktok.com/@a/video/7312345678901234567",
    platform: "tiktok" as const,
    status: "queued" as const,
    space_id: null,
    thumb_path: null,
    video_path: null,
    duration_s: null,
    creator_handle: null,
    caption: null,
    title: null,
    error: null,
    saved_at: "2026-11-10T10:00:00Z",
    user_note: null,
    voice_note_path: null,
    insights: null,
    states: null,
  };

  it("reads the new columns, with safe defaults for an older database", () => {
    const old: SaveItem = toSaveItem(row);
    expect(old).toMatchObject({ processStep: "queued", videoState: "none", playback: "link", embedUrl: null, aiState: "pending" });
    const fresh = toSaveItem({ ...row, status: "ready", process_step: "ready", video_state: "stored", playback: "video", video_path: "u/s1.mp4", ai_state: "no_key" });
    expect(fresh).toMatchObject({ processStep: "ready", videoState: "stored", playback: "video", videoPath: "u/s1.mp4", hasVideo: true, aiState: "no_key" });
  });

  it("folds a Realtime update in: title and picture first, then the player", () => {
    let item = toSaveItem(row);
    item = applySaveRow(item, { status: "processing", process_step: "fetching", title: "Three-second hooks", thumb_path: "u/s1.jpg", embed_url: TT, playback: "embed" });
    expect(item).toMatchObject({ status: "processing", processStep: "fetching", title: "Three-second hooks", thumbPath: "u/s1.jpg", playback: "embed" });
    expect(playbackMode(item).mode).toBe("embed");
    item = applySaveRow(item, { process_step: "watching", video_path: "u/s1.mp4", video_state: "stored", playback: "video" });
    expect(playbackMode(item).mode).toBe("file");
    // Retention later clears the copy.
    item = applySaveRow(item, { video_path: null, video_state: "evicted", playback: "embed" });
    expect(item.hasVideo).toBe(false);
    expect(playbackMode(item)).toEqual({ mode: "embed", embedUrl: TT });
  });
});
