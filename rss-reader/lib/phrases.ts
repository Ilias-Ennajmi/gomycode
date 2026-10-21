import type { TimedText } from "@/lib/types";

// Read along, the way lyrics apps do it: a transcript's lines (often whole paragraphs,
// with one start time each) cut into short phrases a reader can follow, each with its own
// start and end. Inside a line, time is shared out by length, which tracks speech closely
// enough; the line's own start keeps every phrase anchored to the audio.

export interface Phrase {
  t: number;
  end: number;
  text: string;
  /** The transcript line it came from. */
  line: number;
}

const MAX_WORDS = 9;
// A sentence ends at . ! ? … (or a closing quote) followed by a capital or a digit.
const SENTENCE = new RegExp('(?<=[.!?…»"”])\\s+(?=[A-ZÀ-ÖØ-Þ0-9«"“¿¡-])', "u");
const CLAUSE = new RegExp("(?<=[,;:–—])\\s+", "u");
const SECONDS_PER_WORD = 0.4;

/** A line's text in phrases: sentences, then clauses, then runs of a few words. */
export function splitPhrases(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(SENTENCE).filter(Boolean);
  const out: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(" ");
    if (words.length <= MAX_WORDS) {
      out.push(sentence);
      continue;
    }
    // Clauses: after a comma, semicolon, colon or dash, when both sides are long enough.
    const clauses = sentence.split(CLAUSE);
    let current: string[] = [];
    const flush = () => {
      if (current.length) out.push(...chunk(current.join(" ")));
      current = [];
    };
    for (const clause of clauses) {
      const size = clause.split(" ").length;
      const have = current.length ? current.join(" ").split(" ").length : 0;
      // A short lead-in ("Well," "Aujourd'hui,") stays with what follows it.
      if (have >= 3 && have + size > MAX_WORDS) flush();
      current.push(clause);
    }
    flush();
  }
  return out;
}

/** Runs of about MAX_WORDS words, balanced so the last isn't a stub. */
function chunk(text: string): string[] {
  const words = text.split(" ");
  if (words.length <= MAX_WORDS + 2) return [text];
  const parts = Math.ceil(words.length / MAX_WORDS);
  const size = Math.ceil(words.length / parts);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out;
}

/** The whole transcript as timed phrases. */
export function toPhrases(transcript: TimedText[], duration?: number | null): Phrase[] {
  const phrases: Phrase[] = [];
  transcript.forEach((line, index) => {
    const parts = splitPhrases(line.text);
    if (parts.length === 0) return;
    const words = line.text.split(/\s+/).length;
    const natural = line.t + words * SECONDS_PER_WORD;
    const nextStart = transcript[index + 1]?.t;
    // The line lasts until the next one starts, unless that's a long silence away.
    let end = nextStart ?? (duration && duration > line.t ? duration : natural);
    if (end - line.t > (natural - line.t) * 1.8 + 3) end = natural;
    if (end <= line.t) end = line.t + Math.max(1, words * SECONDS_PER_WORD);
    const total = parts.reduce((sum, p) => sum + p.length + 4, 0);
    let t = line.t;
    for (const part of parts) {
      const length = ((part.length + 4) / total) * (end - line.t);
      phrases.push({ t, end: t + length, text: part, line: index });
      t += length;
    }
  });
  return phrases;
}

/** The phrase being said at `seconds` (the last one started), or -1 before the first. */
export function phraseAt(phrases: Phrase[], seconds: number) {
  let lo = 0;
  let hi = phrases.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (phrases[mid].t <= seconds + 0.15) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
