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
    const res = await fetch(inputUrl, { headers: PAGE_HEADERS, signal: AbortSignal.timeout(10000) });
    if (res.ok) html = await res.text();
  } catch {
    // A direct /channel/ URL still resolves without the page; otherwise we fail below.
  }

  const channelId = direct?.[1] ?? channelIdFromHtml(html);
  if (!channelId) throw new Error("Could not find a YouTube channel at this URL");

  const avatarUrl = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  return { feedUrl: channelFeedUrl(channelId), avatarUrl };
}
