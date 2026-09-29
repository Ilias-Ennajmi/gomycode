// What YouTube's pages tell us about videos, read the way a browser does. From servers,
// YouTube's player API asks to "sign in to confirm you're not a bot", but the pages still
// load: a channel's /videos, /shorts and /streams tabs give lengths, which videos are
// Shorts, and live or upcoming status; a video's page gives the full description and the
// creator's chapters. Transcripts and summaries come from Gemini (lib/video-ai.ts).

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  // The EU cookie-consent page otherwise replaces the content (functions run in the EU).
  Cookie: "SOCS=CAI; CONSENT=YES+1",
};

async function initialData(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  const json = (await res.text()).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  if (!json) throw new Error("YouTube returned an unexpected page");
  return JSON.parse(json);
}

/** Every value under `key`, anywhere in YouTube's page data. */
function findAll<T = unknown>(node: unknown, key: string, out: T[] = []): T[] {
  if (!node || typeof node !== "object") return out;
  const record = node as Record<string, unknown>;
  if (key in record) out.push(record[key] as T);
  for (const value of Object.values(record)) findAll(value, key, out);
  return out;
}

/** "8:31" → 511, "1:02:03" → 3723. */
export function parseClock(text: string): number | null {
  const match = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** 511 → "8:31", 3723 → "1:02:03". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export interface ChannelVideoInfo {
  durationSeconds: number | null;
  isShort: boolean;
  liveStatus: "live" | "upcoming" | null;
}

/**
 * Lengths, Shorts and live status for a channel's recent videos (about 30 per tab), by
 * video id.
 */
export async function scanChannel(channelId: string): Promise<Map<string, ChannelVideoInfo>> {
  const found = new Map<string, ChannelVideoInfo>();
  const tabs = ["videos", "streams", "shorts"] as const;
  const pages = await Promise.all(
    tabs.map((tab) =>
      initialData(`https://www.youtube.com/channel/${channelId}/${tab}?hl=en`).catch(() => null)
    )
  );
  if (pages.every((page) => page === null)) throw new Error("Could not read the channel");

  pages.forEach((data, index) => {
    if (!data) return;
    if (tabs[index] === "shorts") {
      for (const lockup of findAll(data, "shortsLockupViewModel")) {
        const videoId = findAll<string>(lockup, "videoId")[0];
        if (videoId) found.set(videoId, { durationSeconds: null, isShort: true, liveStatus: null });
      }
      return;
    }
    for (const lockup of findAll<{ contentId?: string }>(data, "lockupViewModel")) {
      if (!lockup.contentId) continue;
      const badges = findAll<{ text?: string }>(lockup, "thumbnailBadgeViewModel")
        .map((badge) => badge.text?.trim() ?? "")
        .filter(Boolean);
      let durationSeconds: number | null = null;
      let liveStatus: ChannelVideoInfo["liveStatus"] = null;
      for (const text of badges) {
        const clock = parseClock(text);
        if (clock !== null) durationSeconds = clock;
        else if (/^live$/i.test(text)) liveStatus = "live";
        else if (/upcoming|premiere|scheduled/i.test(text)) liveStatus = "upcoming";
      }
      found.set(lockup.contentId, { durationSeconds, isShort: false, liveStatus });
    }
  });
  return found;
}

export interface Chapter {
  t: number;
  title: string;
}

export interface VideoPage {
  description: string | null;
  chapters: Chapter[];
}

/** The full description and the creator's chapters, from the video's page. */
export async function fetchVideoPage(videoId: string): Promise<VideoPage> {
  const data = await initialData(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
  const description =
    findAll<{ content?: string }>(data, "attributedDescription")[0]?.content ??
    findAll<{ content?: string }>(data, "attributedDescriptionBodyText")[0]?.content ??
    null;

  const chapters: Chapter[] = [];
  const seen = new Set<number>();
  for (const chapter of findAll<{
    timeRangeStartMillis?: number;
    title?: { simpleText?: string };
  }>(data, "chapterRenderer")) {
    const t = Math.round((chapter.timeRangeStartMillis ?? -1000) / 1000);
    const title = chapter.title?.simpleText?.trim();
    if (t < 0 || !title || seen.has(t)) continue;
    seen.add(t);
    chapters.push({ t, title });
  }
  chapters.sort((a, b) => a.t - b.t);
  return { description, chapters };
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TIMESTAMP = /(^|[\s(\[])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s)\]:.,-])/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g;

/**
 * A video description as HTML: links become links, and times ("12:34") become buttons that
 * jump the player there (data-t, handled by the reader).
 */
export function descriptionHtml(videoId: string, text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = escapeHtml(paragraph.trim())
        .replace(URL_PATTERN, (url) => {
          const safe = url.replace(/"/g, "%22");
          return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        })
        .replace(TIMESTAMP, (whole, before: string, clock: string) => {
          const t = parseClock(clock);
          if (t === null) return whole;
          return `${before}<a href="https://www.youtube.com/watch?v=${videoId}&amp;t=${t}s" data-t="${t}">${clock}</a>`;
        })
        .replace(/\n/g, "<br>");
      return html ? `<p>${html}</p>` : "";
    })
    .join("");
}
