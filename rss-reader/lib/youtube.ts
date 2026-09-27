const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const CHANNEL_ID = /(UC[\w-]{22})/;

// YouTube serves an EU cookie-consent interstitial instead of the page unless
// consent cookies are present, and our functions run in the EU.
const PAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; RSSReaderBot/1.0)",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "SOCS=CAI; CONSENT=YES+1",
};

export function isYouTubeUrl(url: string): boolean {
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isYouTubeFeedUrl(url: string): boolean {
  return isYouTubeUrl(url) && url.includes("/feeds/videos.xml");
}

export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export function youTubeVideoId(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = link.match(/(?:[?&]v=|\/shorts\/|youtu\.be\/|\/embed\/)([\w-]{11})/);
  return match && isYouTubeUrl(link) ? match[1] : null;
}

export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function channelIdFromHtml(html: string): string | null {
  const patterns = [
    /feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/,
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/,
    /"externalId":"(UC[\w-]{22})"/,
    /"channelId":"(UC[\w-]{22})"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface ResolvedChannel {
  feedUrl: string;
  avatarUrl?: string;
}

/**
 * Turns any YouTube URL (channel, @handle, /c/ or /user/ page, a video, or the
 * feed itself) into the channel's public Atom feed URL.
 */
export async function resolveYouTubeChannel(inputUrl: string): Promise<ResolvedChannel> {
  if (isYouTubeFeedUrl(inputUrl)) return { feedUrl: inputUrl };

  const direct = new URL(inputUrl).pathname.match(new RegExp(`^/channel/${CHANNEL_ID.source}`));

  let html = "";
  try {
    const res = await fetch(inputUrl, {
      headers: PAGE_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) html = await res.text();
  } catch {
    // A direct /channel/ URL still resolves without the page; otherwise we fail below.
  }

  const channelId = direct?.[1] ?? channelIdFromHtml(html);
  if (!channelId) throw new Error("Could not find a YouTube channel at this URL");

  const avatarUrl = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  return { feedUrl: channelFeedUrl(channelId), avatarUrl };
}

export function channelIdFromFeedUrl(url: string): string | null {
  if (!isYouTubeFeedUrl(url)) return null;
  return new URL(url).searchParams.get("channel_id")?.match(CHANNEL_ID)?.[1] ?? null;
}

const UNIT_MS: [RegExp, number][] = [
  [/^(s|sec|second)/, 1000],
  [/^mo/, 30 * 86_400_000],
  [/^(m|min|minute)/, 60_000],
  [/^(h|hr|hour)/, 3_600_000],
  [/^(d|day)/, 86_400_000],
  [/^(w|wk|week)/, 7 * 86_400_000],
  [/^(y|yr|year)/, 365 * 86_400_000],
];

/** "2d ago", "3 weeks ago" → an approximate date; YouTube pages only give ages. */
export function dateFromAge(text: string | undefined, now = Date.now()): Date | null {
  const match = text?.toLowerCase().match(/(\d+)\s*([a-z]+)\s+ago/);
  if (!match) return null;
  const unit = UNIT_MS.find(([pattern]) => pattern.test(match[2]));
  return unit ? new Date(now - Number(match[1]) * unit[1]) : null;
}

interface Lockup {
  contentId?: string;
  contentType?: string;
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string };
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: { metadataParts?: { text?: { content?: string } }[] }[];
        };
      };
    };
  };
}

export interface ChannelVideos {
  title: string;
  description?: string;
  avatarUrl?: string;
  videos: { videoId: string; title: string; publishedAt: Date }[];
}

/**
 * Reads a channel's latest uploads from its /videos page. Used when YouTube's
 * RSS endpoint is down (it regularly returns 404 for hours at a time).
 */
export async function fetchChannelVideos(channelId: string): Promise<ChannelVideos> {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/videos`, {
    headers: {
      ...PAGE_HEADERS,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Could not load the YouTube channel (status ${res.status})`);
  const json = (await res.text()).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  if (!json) throw new Error("YouTube returned an unexpected page");
  const data = JSON.parse(json);

  const lockups: Lockup[] = [];
  (function collect(node: unknown) {
    if (!node || typeof node !== "object") return;
    if ("lockupViewModel" in node) {
      lockups.push((node as { lockupViewModel: Lockup }).lockupViewModel);
      return;
    }
    for (const value of Object.values(node)) collect(value);
  })(data);

  // Videos are listed newest first; spacing them a minute apart keeps that
  // order even when several share the same "1 day ago".
  const now = Date.now();
  const videos = lockups
    .filter((l) => l.contentId && l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO")
    .slice(0, 15)
    .map((l, index) => {
      const meta = l.metadata?.lockupMetadataViewModel;
      const parts = meta?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap(
        (row) => row.metadataParts?.map((p) => p.text?.content ?? "") ?? []
      );
      const age = parts?.map((p) => dateFromAge(p, now)).find(Boolean);
      return {
        videoId: l.contentId!,
        title: meta?.title?.content ?? "Untitled",
        publishedAt: new Date((age ?? new Date(now)).getTime() - index * 60_000),
      };
    });

  const channel = data.metadata?.channelMetadataRenderer ?? {};
  return {
    title: channel.title ?? "YouTube channel",
    description: channel.description || undefined,
    avatarUrl: channel.avatar?.thumbnails?.at(-1)?.url,
    videos,
  };
}
