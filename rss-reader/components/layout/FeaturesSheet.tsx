"use client";

import * as React from "react";
import { ArrowRight, Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { requestAppEvent } from "@/lib/app-events";
import { useReaderState } from "@/lib/hooks/useReaderState";

// Settings → Help → "Everything Reader can do": every feature in one searchable list, each
// with where it lives, and a button that goes there when there's somewhere to go. Much of
// the app sits behind ⋯ menus and long-presses; this is where to find out it exists.
// Titles and places are translated where they're drawn (keys in lib/i18n.tsx).

type Go =
  | { view: "ask" | "review" | "stats" | "recap" | "later" | "podcasts"; label: string }
  | { event: Parameters<typeof requestAppEvent>[0]; detail?: string };

interface Feature {
  title: string;
  where: string;
  /** Extra words the search should find it by. */
  words?: string;
  go?: Go;
}

export const FEATURES: Feature[] = [
  {
    title: "Ask your reader",
    where: "More → Ask",
    words: "question answer ai chat",
    go: { view: "ask", label: "Ask" },
  },
  {
    title: "Catch me up",
    where: "Any list → ⋯ → Catch me up",
    words: "summary unread ai bullets",
  },
  {
    title: "Got 5 minutes?",
    where: "The 5 min pill next to the greeting, and in Later",
    words: "time session pile short",
    go: { event: "time-pile" },
  },
  {
    title: "Triage unread",
    where: "Any list → ⋯ → Triage unread",
    words: "cards swipe keep skip",
  },
  {
    title: "Search by meaning",
    where: "Search, then the By meaning chip",
    words: "semantic find ai",
  },
  {
    title: "Search operators",
    where: "In the search box: from: tag: is: in:",
    words: "filter source unread saved",
  },
  {
    title: "Highlights and notes",
    where: "Select text in any article",
    words: "quote annotate colour",
  },
  {
    title: "Daily review",
    where: "More → Review",
    words: "spaced repetition remember highlights",
    go: { view: "review", label: "Daily review" },
  },
  {
    title: "Send highlights to Readwise or Notion",
    where: "Later → Highlights → Send to…",
    words: "export sync",
  },
  {
    title: "Collections and public pages",
    where: "Long-press an article → Add to collection",
    words: "folder share list publish",
  },
  {
    title: "Snooze an article",
    where: "The clock on any card",
    words: "later remind tomorrow",
  },
  {
    title: "Quick look",
    where: "Long-press a card (right-click on a computer)",
    words: "preview peek menu",
  },
  {
    title: "Stories",
    where: "The round pictures above the lists",
    words: "bubbles sources new",
  },
  {
    title: "Swipe between tabs",
    where: "Swipe a list sideways",
    words: "navigation gesture",
  },
  {
    title: "Read along",
    where: "The player → Read along card",
    words: "transcript lyrics follow podcast video",
  },
  {
    title: "Snips",
    where: "The scissors in the player, or press previous twice on earbuds",
    words: "clip moment podcast note",
  },
  {
    title: "Download episodes",
    where: "The arrow in the player; the list is in Podcasts → ⋯ → Downloads",
    words: "offline podcast plane",
    go: { event: "downloads" },
  },
  {
    title: "Car mode",
    where: "The car in the player",
    words: "driving big buttons",
  },
  {
    title: "Voice boost and shorter silences",
    where: "The player → ⋯ → Sound",
    words: "audio trim silence volume",
  },
  {
    title: "Skip sponsors",
    where: "Settings → Personalise",
    words: "ads sponsorblock podcast youtube",
  },
  {
    title: "Find episodes",
    where: "Podcasts → ⋯ → Find episodes",
    words: "search podcast topic guest",
    go: { event: "find-episodes" },
  },
  {
    title: "Natural voice",
    where: "In an article: Listen, then AI",
    words: "read aloud tts speech",
  },
  {
    title: "Listen to Later",
    where: "Later → ⋯ → Listen to Later",
    words: "read aloud playlist",
  },
  {
    title: "Translate an article",
    where: "In an article: the translate button",
    words: "language french english arabic",
  },
  {
    title: "Explain, define or translate a passage",
    where: "Select text in an article",
    words: "ai selection word",
  },
  {
    title: "Pages like a book, bionic reading, focus mode",
    where: "In an article: ⋯ and Aa",
    words: "font size paginated comfort",
  },
  {
    title: "Story timeline",
    where: "Under an article that was covered over several days",
    words: "history developments",
  },
  {
    title: "Weekly recap and month in review",
    where: "More → Weekly recap",
    words: "summary stats stories",
    go: { view: "recap", label: "Weekly recap" },
  },
  {
    title: "Reading stats and daily goal",
    where: "More → Stats",
    words: "streak minutes numbers ring",
    go: { view: "stats", label: "Your reading" },
  },
  {
    title: "Alerts, boosts and auto-save rules",
    where: "Settings → Content filters",
    words: "keyword notify hide mute",
    go: { event: "content-filters" },
  },
  {
    title: "Email-only newsletters",
    where: "+ → Add a newsletter → Only sent by email?",
    words: "address subscribe inbox",
    go: { event: "email-newsletter" },
  },
  {
    title: "Tidy up sources you never read",
    where: "Settings → Your sources → Never read",
    words: "unfollow clean",
    go: { event: "sources-unused" },
  },
  {
    title: "Plain YouTube titles",
    where: "Settings → Personalise",
    words: "clickbait dearrow",
  },
  {
    title: "Morning digest, at your time",
    where: "Settings → Notifications",
    words: "briefing push hour",
  },
  {
    title: "Unlock with a passkey",
    where: "Settings → App → Add a passkey",
    words: "fingerprint face login password",
  },
  {
    title: "Backup and restore",
    where: "Settings → Your data",
    words: "export import file",
  },
  {
    title: "Keyboard shortcuts",
    where: "On a computer: press ? or ⌘K",
    words: "command palette keys",
  },
];

/** Features matching what was typed, in the language shown or in English. For tests too. */
export function matchFeatures(query: string, translate: (text: string) => string = (x) => x) {
  const q = query.trim().toLowerCase();
  if (!q) return FEATURES;
  return FEATURES.filter((f) =>
    [f.title, f.where, f.words ?? "", translate(f.title), translate(f.where)]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

export function FeaturesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const { setView, setMobilePane } = useReaderState();
  const [query, setQuery] = React.useState("");
  const found = matchFeatures(query, t);

  function go(target: Go) {
    onOpenChange(false);
    if ("view" in target) {
      setView({ type: target.view, label: target.label });
      setMobilePane("list");
    } else {
      if (target.event !== "content-filters" && target.event !== "sources-unused") {
        setMobilePane("list");
      }
      // After the sheet has closed, so two dialogs don't fight over focus.
      setTimeout(() => requestAppEvent(target.event, target.detail), 150);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("Everything Reader can do")}>
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search features…")}
            aria-label={t("Search features")}
            className="h-10 w-full rounded-full border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      {found.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t("Nothing by that name.")}
        </p>
      ) : (
        <ul className="divide-y px-2 pb-2" aria-label={t("Features")}>
          {found.map((feature) => (
            <li key={feature.title} className="flex items-center gap-3 px-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t(feature.title)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(feature.where)}</p>
              </div>
              {feature.go && (
                <button
                  type="button"
                  onClick={() => go(feature.go!)}
                  aria-label={`${t("Open")}: ${t(feature.title)}`}
                  className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"
                >
                  {t("Open")} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
