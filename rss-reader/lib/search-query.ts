// Search operators, typed in the box next to the words: `from:verge`, `from:"the verge"`,
// `tag:ai`, `is:unread`, `is:saved`, `is:highlighted`, `in:youtube`. The rest is the text.

import type { FeedType } from "@prisma/client";

export interface ParsedSearch {
  /** The words to search for, operators removed. Empty when only operators were typed. */
  text: string;
  /** Part of a source's name. */
  from: string | null;
  tags: string[];
  unread: boolean;
  saved: boolean;
  highlighted: boolean;
  /** A source type, or "news" for the News tab's sources. */
  in: FeedType | "news" | null;
}

const IN_VALUES: Record<string, FeedType | "news"> = {
  rss: "rss",
  sites: "rss",
  youtube: "youtube",
  video: "youtube",
  videos: "youtube",
  newsletter: "newsletter",
  newsletters: "newsletter",
  email: "newsletter",
  podcast: "podcast",
  podcasts: "podcast",
  news: "news",
};

const OPERATOR = /(^|\s)(from|tag|is|in):("([^"]*)"|(\S+))/gi;

export function parseSearchQuery(raw: string): ParsedSearch {
  const parsed: ParsedSearch = {
    text: "",
    from: null,
    tags: [],
    unread: false,
    saved: false,
    highlighted: false,
    in: null,
  };
  const text = raw.replace(OPERATOR, (_match, space: string, key: string, _q, quoted, bare) => {
    const value = String(quoted ?? bare ?? "").trim();
    switch (key.toLowerCase()) {
      case "from":
        if (value) parsed.from = value;
        break;
      case "tag":
        if (value) parsed.tags.push(value.toLowerCase().replace(/^#/, ""));
        break;
      case "is":
        if (value === "unread") parsed.unread = true;
        if (value === "saved" || value === "later") parsed.saved = true;
        if (value === "highlighted") parsed.highlighted = true;
        break;
      case "in":
        parsed.in = IN_VALUES[value.toLowerCase()] ?? null;
        break;
    }
    return space;
  });
  parsed.text = text.replace(/\s+/g, " ").trim();
  return parsed;
}

/** True when the query carries any operator (so the box shows it as a filter). */
export function hasOperators(raw: string) {
  return OPERATOR.test(raw) && ((OPERATOR.lastIndex = 0), true);
}
