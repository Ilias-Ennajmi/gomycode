import type { Chapter, TimedText } from "@/lib/types";

// Where the ads are. YouTube videos: SponsorBlock, the community database of sponsor reads
// (free, no key). Podcast episodes: a chapter named like an ad, or the transcript's own
// tell-tale phrases ("this episode is brought to you by…") up to where the show resumes.

export interface SponsorSegment {
  start: number;
  end: number;
  source: "sponsorblock" | "chapter" | "transcript";
}

const AD_CHAPTER =
  /\b(sponsor(s|ed)?|ad break|ads?|advert(isement)?s?|promo|publicit[ée]s?|pub|partenaire|annonce|message de nos)\b/i;
const AD_START =
  /(brought to you by|sponsored by|this (episode|show|podcast) is (supported|sponsored|presented)|support for (this|the) (show|podcast) comes from|thanks? (again )?to (our|today'?s) sponsors?|a word from our sponsors?|promo code|use (the )?code|discount code|go to [a-z0-9-]+\.(com|co|io)\/|cet [ée]pisode (est )?(soutenu|sponsoris[ée]|propos[ée]) par|notre partenaire|code promo|avec le code)/i;
const AD_RETURN =
  /(back to (the|our) (show|conversation|episode|interview)|and now,? back|let'?s get back|anyway,? back to|revenons|reprenons|retour (à|a) (l'|notre))/i;

const MAX_AD = 150; // seconds; a longer "segment" is more likely a false alarm
const DEFAULT_AD = 60;

/** A podcast episode's sponsor segments, from its chapters and its transcript. */
export function episodeSponsors(
  chapters: Chapter[],
  transcript: TimedText[],
  durationSeconds: number | null
): SponsorSegment[] {
  const segments: SponsorSegment[] = [];
  chapters.forEach((chapter, i) => {
    if (!AD_CHAPTER.test(chapter.title)) return;
    const end = chapters[i + 1]?.t ?? durationSeconds ?? chapter.t + DEFAULT_AD;
    if (end - chapter.t > 5 && end - chapter.t <= MAX_AD * 2) {
      segments.push({ start: chapter.t, end, source: "chapter" });
    }
  });

  for (let i = 0; i < transcript.length; i++) {
    const line = transcript[i];
    if (!AD_START.test(line.text)) continue;
    // The read runs until the show says it's back, the next chapter starts, or a minute.
    let end = line.t + DEFAULT_AD;
    for (let j = i + 1; j < transcript.length && transcript[j].t <= line.t + MAX_AD; j++) {
      if (AD_RETURN.test(transcript[j].text)) {
        end = transcript[j].t;
        break;
      }
    }
    const nextChapter = chapters.find((c) => c.t > line.t + 10 && c.t < end + 30);
    if (nextChapter) end = Math.min(end, nextChapter.t);
    if (durationSeconds) end = Math.min(end, durationSeconds);
    if (end - line.t >= 10) segments.push({ start: line.t, end, source: "transcript" });
    // Skip the lines this segment covers.
    while (i + 1 < transcript.length && transcript[i + 1].t < end) i++;
  }
  return merge(segments);
}

/** Overlapping or touching segments become one. */
function merge(segments: SponsorSegment[]) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const out: SponsorSegment[] = [];
  for (const segment of sorted) {
    const last = out[out.length - 1];
    if (last && segment.start <= last.end + 2) {
      last.end = Math.max(last.end, segment.end);
    } else out.push({ ...segment });
  }
  return out;
}

/** A YouTube video's sponsor and self-promotion segments, from SponsorBlock. */
export async function videoSponsors(videoId: string): Promise<SponsorSegment[]> {
  const params = new URLSearchParams({
    videoID: videoId,
    categories: JSON.stringify(["sponsor", "selfpromo", "interaction"]),
  });
  const res = await fetch(`https://sponsor.ajay.app/api/skipSegments?${params}`, {
    headers: { "User-Agent": "Reader/1.0 (personal reader)" },
    signal: AbortSignal.timeout(6000),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`SponsorBlock ${res.status}`);
  const data = (await res.json()) as { segment?: [number, number] }[];
  return merge(
    data
      .filter((d) => Array.isArray(d.segment))
      .map((d) => ({ start: d.segment![0], end: d.segment![1], source: "sponsorblock" as const }))
  );
}
