"use client";

import { Mail, MonitorPlay, Rss, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { useReaderState, type ViewState } from "@/lib/hooks/useReaderState";

type Tab = "foryou" | "newsletters" | "rss" | "youtube" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Sparkles; view?: ViewState }[] = [
  { id: "foryou", label: "For You", icon: Sparkles, view: { type: "foryou", label: "For You" } },
  {
    id: "newsletters",
    label: "Newsletters",
    icon: Mail,
    view: { type: "newsletters", label: "Newsletters" },
  },
  { id: "rss", label: "RSS", icon: Rss, view: { type: "rss", label: "RSS" } },
  {
    id: "youtube",
    label: "YouTube",
    icon: MonitorPlay,
    view: { type: "youtube", label: "YouTube" },
  },
  { id: "settings", label: "Settings", icon: Settings },
];

/** Persistent mobile navigation; the desktop layout keeps its three columns. */
export function BottomTabBar() {
  const { view, setView, mobilePane, setMobilePane } = useReaderState();
  const { feeds } = useFeeds();

  function activeTab(): Tab {
    if (mobilePane === "settings") return "settings";
    switch (view.type) {
      case "foryou":
      case "saved":
        return "foryou";
      case "newsletters":
      case "rss":
      case "youtube":
        return view.type;
      case "feed": {
        const type = feeds.find((feed) => feed.id === view.id)?.type;
        return type === "youtube" ? "youtube" : type === "newsletter" ? "newsletters" : "rss";
      }
      default:
        return "rss";
    }
  }
  const active = activeTab();

  function select(tab: (typeof TABS)[number]) {
    if (!tab.view) {
      setMobilePane("settings");
    } else if (view.type === tab.view.type) {
      setMobilePane("list");
    } else {
      setView(tab.view);
    }
  }

  return (
    <nav
      aria-label="Main"
      className="shrink-0 border-t bg-background/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const { id, label, icon: Icon } = tab;
          const isActive = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => select(tab)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-14 w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon
                  className={cn("h-5 w-5", isActive && id !== "settings" && "fill-primary/15")}
                />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
