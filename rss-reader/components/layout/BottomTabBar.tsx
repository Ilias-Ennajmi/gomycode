"use client";

import { Bookmark, Rss, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderState } from "@/lib/hooks/useReaderState";

type Tab = "foryou" | "feeds" | "saved" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: "foryou", label: "For You", icon: Sparkles },
  { id: "feeds", label: "Feeds", icon: Rss },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "settings", label: "Settings", icon: Settings },
];

/** Persistent mobile navigation; the desktop layout keeps its three columns. */
export function BottomTabBar() {
  const { view, setView, mobilePane, setMobilePane } = useReaderState();

  const active: Tab =
    mobilePane === "settings"
      ? "settings"
      : mobilePane === "sidebar"
        ? "feeds"
        : view.type === "foryou"
          ? "foryou"
          : view.type === "saved"
            ? "saved"
            : "feeds";

  function select(tab: Tab) {
    if (tab === "foryou") {
      if (view.type === "foryou") setMobilePane("list");
      else setView({ type: "foryou", label: "For You" });
    } else if (tab === "saved") {
      if (view.type === "saved") setMobilePane("list");
      else setView({ type: "saved", label: "Saved" });
    } else if (tab === "feeds") {
      setMobilePane("sidebar");
    } else {
      setMobilePane("settings");
    }
  }

  return (
    <nav
      aria-label="Main"
      className="shrink-0 border-t bg-background/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => select(id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && id !== "settings" && "fill-primary/15")} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
