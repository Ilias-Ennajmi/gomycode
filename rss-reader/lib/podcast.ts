import { parseHTML } from "linkedom";
import { parseClock, type Chapter } from "@/lib/youtube-video";
import type { DiscoverResult } from "@/lib/discover/providers";

// Podcasts are RSS feeds whose items carry an audio file (see lib/rss.ts). This file has
// what's specific to them: chapters and time links from show notes, and Apple's free
// podcast directory (search, top charts, and turning an Apple Podcasts link into its feed).

const TIMESTAMP = "(?:\\d{1,2}:)?\\d{1,2}:\\d{2}";
// "(00:02:33) Title", "[12:34] Title", "12:34 - Title", "1:02:03 Title".
const CHAPTER_LINE = new RegExp(`^\\s*[\\(\\[]?(${TIMESTAMP})[\\)\\]]?\\s*[-–—:|]?\\s*(.{2,140})$`);

/** Show notes as text, one line per paragraph or line break. */
function notesText(notes: string) {
  if (!/<[a-z][\s\S]*>/i.test(notes)) return notes;
  const { document } = parseHTML(`<!doctype html><html><body>${notes}</body></html>`);
  document.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  document.querySelectorAll("p, li, div, h1, h2, h3, h4").forEach((el) => el.append("\n"));
  return document.body?.textContent ?? "";
}

/**
 * The episode's chapters, when the show notes list times ("(00:02:33) Topic"): at least
 * three, in order, starting near the beginning.
 */
export function chaptersFromNotes(notes: string | null | undefined): Chapter[] {
  if (!notes) return [];
  const chapters: Chapter[] = [];
  for (const line of notesText(notes).split(/\n/)) {
    const match = line.trim().match(CHAPTER_LINE);
    if (!match) continue;
    const t = parseClock(match[1]);
    const title = match[2].trim();
    if (t === null || !title) continue;
    if (chapters.length && t <= chapters[chapters.length - 1].t) continue;
    chapters.push({ t, title });
  }
  return chapters.length >= 3 && chapters[0].t <= 120 ? chapters : [];
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TIME_IN_TEXT = new RegExp(`(^|[\\s(\\[])(${TIMESTAMP})(?=$|[\\s)\\]:.,-])`, "g");
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g;

/**
 * Show notes ready for the reader: plain-text notes become paragraphs with links, and times
 * ("12:34") become buttons that jump the player there (data-t, handled by the reader).
 */
export function showNotesHtml(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const html = /<[a-z][\s\S]*>/i.test(notes)
    ? notes
    : notes
        .trim()
        .split(/\n{2,}/)
        .map(
          (paragraph) =>
            `<p>${escapeHtml(paragraph.trim())
              .replace(URL_IN_TEXT, (url) => `<a href="${url.replace(/"/g, "%22")}">${url}</a>`)
              .replace(/\n/g, "<br>")}</p>`
        )
        .join("");

  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const text of texts) {
    // Not inside an existing link.
    if ((text.parentElement as Element | null)?.closest("a")) continue;
    const value = text.textContent ?? "";
    TIME_IN_TEXT.lastIndex = 0;
    if (!TIME_IN_TEXT.test(value)) continue;
    const replaced = escapeHtml(value).replace(
      TIME_IN_TEXT,
      (whole, before: string, time: string) => {
        const t = parseClock(time);
        return t === null ? whole : `${before}<a href="#t=${t}" data-t="${t}">${time}</a>`;
      }
    );
    const holder = document.createElement("span");
    holder.innerHTML = replaced;
    text.replaceWith(...Array.from(holder.childNodes));
  }
  return document.body?.innerHTML.trim() || null;
}

// Apple's podcast directory: free, no key, and it knows every podcast's RSS feed.

const APPLE_TIMEOUT_MS = 6000;

interface AppleShow {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  trackCount?: number;
  collectionViewUrl?: string;
}

async function appleJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Apple Podcasts answered ${res.status}`);
  return res.json() as Promise<T>;
}

function showResult(show: AppleShow): DiscoverResult | null {
  if (!show.feedUrl || !show.collectionName) return null;
  const parts = [show.artistName, show.primaryGenreName].filter(Boolean);
  return {
    url: show.feedUrl,
    name: show.collectionName,
    kind: "podcast",
    description: parts.join(" · ") || undefined,
    imageUrl: show.artworkUrl600 || show.artworkUrl100,
    siteUrl: show.collectionViewUrl?.replace(/\?uo=\d+$/, ""),
    followersLabel: show.trackCount ? `${show.trackCount} episodes` : undefined,
    provider: "apple",
  };
}

/** Apple's country store for a language: French shows come from the French chart. */
function storeFor(lang?: string) {
  return lang === "fr" ? "fr" : "us";
}

export async function searchApplePodcasts(term: string, lang?: string) {
  const params = new URLSearchParams({
    media: "podcast",
    entity: "podcast",
    limit: "20",
    term,
    country: storeFor(lang),
  });
  const data = await appleJson<{ results?: AppleShow[] }>(
    `https://itunes.apple.com/search?${params}`
  );
  return (data.results ?? []).map(showResult).filter((r): r is DiscoverResult => r !== null);
}

export interface AppleEpisode {
  id: string;
  title: string;
  show: string;
  showId: string | null;
  feedUrl: string | null;
  imageUrl: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
}

interface AppleEpisodeRaw {
  wrapperType?: string;
  trackId?: number;
  trackName?: string;
  collectionName?: string;
  collectionId?: number;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl160?: string;
  episodeUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  shortDescription?: string;
  description?: string;
}

/** Episodes (not shows) about a topic, across Apple's whole catalogue. */
export async function searchAppleEpisodes(term: string, lang?: string): Promise<AppleEpisode[]> {
  const params = new URLSearchParams({
    media: "podcast",
    entity: "podcastEpisode",
    limit: "25",
    term,
    country: storeFor(lang),
  });
  const data = await appleJson<{ results?: AppleEpisodeRaw[] }>(
    `https://itunes.apple.com/search?${params}`
  );
  return (data.results ?? [])
    .filter((r) => r.wrapperType === "podcastEpisode" && r.episodeUrl && r.trackName)
    .map((r) => ({
      id: String(r.trackId),
      title: r.trackName!,
      show: r.collectionName ?? "",
      showId: r.collectionId ? String(r.collectionId) : null,
      feedUrl: r.feedUrl ?? null,
      imageUrl: r.artworkUrl600 ?? r.artworkUrl160 ?? null,
      audioUrl: r.episodeUrl!,
      durationSeconds: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
      publishedAt: r.releaseDate ?? null,
      description:
        (r.shortDescription || r.description || "").replace(/<[^>]+>/g, "").slice(0, 300) || null,
    }));
}

async function lookupShows(ids: string[], lang?: string) {
  if (ids.length === 0) return [];
  const data = await appleJson<{ results?: AppleShow[] }>(
    `https://itunes.apple.com/lookup?id=${ids.join(",")}&entity=podcast&country=${storeFor(lang)}`
  );
  return (data.results ?? []).filter((show) => show.feedUrl);
}

/** The most popular shows right now, from Apple's charts. */
export async function topApplePodcasts(lang?: string, limit = 25) {
  const country = storeFor(lang);
  const chart = await appleJson<{ feed?: { results?: { id?: string }[] } }>(
    `https://rss.applemarketingtools.com/api/v2/${country}/podcasts/top/${limit}/podcasts.json`
  );
  const ids = (chart.feed?.results ?? []).map((r) => r.id).filter((id): id is string => !!id);
  const shows = await lookupShows(ids, lang);
  // Keep the chart's order.
  const byId = new Map(shows.map((show) => [String(show.collectionId), show]));
  return ids
    .map((id) => byId.get(id))
    .map((show) => (show ? showResult(show) : null))
    .filter((r): r is DiscoverResult => r !== null)
    .map((r) => ({ ...r, lang: country === "fr" ? "fr" : "en" }));
}

/** podcasts.apple.com/…/id1545953110 → its id. */
export function applePodcastId(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)podcasts\.apple\.com$|(^|\.)itunes\.apple\.com$/i.test(parsed.hostname)) {
      return null;
    }
    return parsed.pathname.match(/\/id(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The RSS feed and artwork behind an Apple Podcasts link. */
export async function resolveApplePodcast(url: string) {
  const id = applePodcastId(url);
  if (!id) return null;
  const [show] = await lookupShows([id]);
  if (!show?.feedUrl) throw new Error("No RSS feed for this podcast");
  return { feedUrl: show.feedUrl, artworkUrl: show.artworkUrl600 || show.artworkUrl100 };
}
