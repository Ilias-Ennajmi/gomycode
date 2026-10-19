"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Bump the version when there's something new to say; the sheet shows once per version.
export const WHATS_NEW_VERSION = "2026.10.19c";
const SEEN_KEY = "whats-new-seen";

export const WHATS_NEW: { title: string; text: string }[] = [
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
