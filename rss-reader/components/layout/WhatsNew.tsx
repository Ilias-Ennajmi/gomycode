"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Bump the version when there's something new to say; the sheet shows once per version.
export const WHATS_NEW_VERSION = "2026.10.21d";
const SEEN_KEY = "whats-new-seen";

export const WHATS_NEW: { title: string; text: string }[] = [
  {
    title: "Shorts, full screen",
    text: "Tap a Short on the YouTube tab and it plays portrait, full screen; swipe up for the next (arrow keys or the wheel on a desktop), save or share from the side, and each one you watch is marked seen.",
  },
  {
    title: "Listen to Later",
    text: "Later → ⋯ → Listen to Later reads your queue aloud, one article after the next, with play, pause, skip and speed, and the lock-screen controls. Articles are marked read as they finish.",
  },
  {
    title: "Collections",
    text: "Group saved articles into named sets (long-press a card or tap the folder in the reader). Later → Collections shows them as cards; publish one and anyone with the link can read it as a clean page.",
  },
  {
    title: "Discussion, pinned searches, EPUB",
    text: "The end of an article now shows the Hacker News and Reddit threads about it. Pin any search to the sidebar as a smart folder with its own unread count. Later → ⋯ → Download as EPUB turns your queue (or a collection) into a book for an e-reader.",
  },
  {
    title: "Snips",
    text: "Hear something worth keeping? Tap the scissors in the player, or press “previous” twice on your earbuds, and the last half-minute becomes a note: what was said, a title, and a play button back to the moment. Snips live in Highlights, join the daily review, and share as a picture.",
  },
  {
    title: "Episode notes and episode search",
    text: "An episode's page now gathers your snips and a search box over its transcript (tap a line to jump there). Podcasts → ⋯ → Find episodes searches episodes, not shows, across your shows and the whole catalogue; play one straight away or follow its show.",
  },
  {
    title: "Your settings follow you",
    text: "Accent, goal, layouts, tabs, language and reading preferences now sync between your phone and your desktop. Desktop has a Settings screen too (the gear in the sidebar footer).",
  },
  {
    title: "Make it yours",
    text: "Settings → Personalise: switch the stories row, goal ring and briefing card on or off, go compact, reorder or hide the top tabs, and pin a category as a tab of its own.",
  },
  {
    title: "Pick a view from the chip row",
    text: "Four little icons next to Unread and Saved: compact list, magazine, big pictures, or a grid of square tiles (the default for podcasts). The stories row now shows only that tab's sources and folds away with the chevron.",
  },
  {
    title: "Stories",
    text: "A row of your sources at the top of For You and each tab. Tap one to flip through its latest unread full screen: tap to advance, hold to pause, swipe sideways for the next source, Read to open.",
  },
  {
    title: "A magazine, not a wall",
    text: "For You and News open as a magazine: a big picture card leads each day, the rest are rows, with serif headlines. Today opens on a full-bleed cover story. Pick Magazine, Compact or Big pictures in any list's ⋯ menu.",
  },
  {
    title: "Your ring, your colour",
    text: "A daily reading goal ring with your streak, on For You and Today (set the goal in Settings). Settings → Appearance now has seven accent colours.",
  },
  {
    title: "Faster, and fine offline",
    text: "The app opens on what you saw last time before it checks for news. Reading, saving and archiving work offline and sync when you're back; long-press a card to keep it offline.",
  },
  {
    title: "En français, si vous voulez",
    text: "Settings → Language switches the interface. Settings → Under the hood shows the build, the database, the last refresh and any errors; Your data → Download a backup saves everything that's yours in one file.",
  },
  {
    title: "Today is your home",
    text: "Continue where you left off, sources to tidy up, and every block can be hidden or moved (the sliders icon). Settings → Start on picks the page the app opens to.",
  },
  {
    title: "Your reading, in numbers",
    text: "Stats in the sidebar: articles, time and highlights over 30 days, by day and by hour, your top sources and your streak.",
  },
  {
    title: "Source pages and smarter search",
    text: "Every source has a page with its settings (For You, full page, mute, alerts). Search understands from:, tag:, is:unread and in:youtube, and remembers recent searches.",
  },
  {
    title: "Ask your reader",
    text: "A new page in the sidebar: ask a question and get an answer from your own feeds, with the articles it came from.",
  },
  {
    title: "Catch me up",
    text: "In any list's ⋯ menu: a few bullets over everything unread, then one tap to mark them read.",
  },
  {
    title: "Smarter reading",
    text: "Select text for Explain, Define or Translate; translate whole articles; see why For You picked a story; AI tag ideas on highlights; and “How this story unfolded” under articles.",
  },
  {
    title: "A real podcast player",
    text: "Tap the bar at the bottom for the full player: chapters, a live transcript, your queue, per-show speed, and a link to share the exact moment.",
  },
  {
    title: "Cards morph into articles",
    text: "Opening an article glides from its card; menus slide up from the bottom on phones.",
  },
  {
    title: "Reading, refined",
    text: "A paper theme, focus mode, a table of contents for long reads, tap pictures to zoom, and “More like this” at the end.",
  },
  {
    title: "Listen to Today",
    text: "The briefing can be read aloud, and the bars hide while you scroll so the page is yours.",
  },
];

/** Once per update: what changed, in a few lines. Also reachable from Settings. */
export function WhatsNew({
  open: forced,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (forced !== undefined) return;
    try {
      // New installs don't get a sheet about things they never had before.
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === null) localStorage.setItem(SEEN_KEY, WHATS_NEW_VERSION);
      else if (seen !== WHATS_NEW_VERSION) setOpen(true);
    } catch {
      // Not remembered: no sheet.
    }
  }, [forced]);
  const isOpen = forced ?? open;
  const change = (next: boolean) => {
    if (!next) {
      try {
        localStorage.setItem(SEEN_KEY, WHATS_NEW_VERSION);
      } catch {
        // Fine.
      }
    }
    if (onOpenChange) onOpenChange(next);
    else setOpen(next);
  };
  return (
    <Sheet
      open={isOpen}
      onOpenChange={change}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> What&apos;s new
        </span>
      }
    >
      <ul className="space-y-4 px-3 pt-2">
        {WHATS_NEW.map((item) => (
          <li key={item.title}>
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{item.text}</p>
          </li>
        ))}
      </ul>
      <div className="px-3 pt-5">
        <Button className="w-full" onClick={() => change(false)}>
          Nice
        </Button>
      </div>
    </Sheet>
  );
}
