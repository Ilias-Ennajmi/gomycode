"use client";

import * as React from "react";
import {
  Bookmark,
  Folder,
  Headphones,
  Mail,
  MonitorPlay,
  MoreHorizontal,
  Newspaper,
  Rss,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/native";
import { Sheet } from "@/components/ui/sheet";
import { useReaderState, type ViewState, type ViewType } from "@/lib/hooks/useReaderState";
import { shortCount, tabKey, useSectionTabs } from "@/lib/hooks/useSectionTabs";

const ICONS: Partial<Record<ViewType, LucideIcon>> = {
  foryou: Sparkles,
  news: Newspaper,
  rss: Rss,
  youtube: MonitorPlay,
  newsletters: Mail,
  podcasts: Headphones,
  later: Bookmark,
  category: Folder,
};

/** Shorter names where the bar is narrow. */
const SHORT_LABEL: Partial<Record<string, string>> = {
  Newsletters: "Letters",
  YouTube: "Videos",
};

/** At most this many tabs in the bar; past it, the last slot opens the rest. */
const SLOTS = 5;

/**
 * The sections at the bottom of the screen on phones, where the thumb is: icons with short
 * names, a pill behind the active one, a dot where something new is waiting and Later's
 * count. More than five sections: the first four, then More for the rest. Order, hidden
 * tabs and pinned categories come from Settings → Personalise.
 */
export function BottomNav({ className }: { className?: string }) {
  const { tabs, active, select, hasNew, laterCount } = useSectionTabs();
  const { mobilePane } = useReaderState();
  const { t } = useT();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const overflow = tabs.length > SLOTS;
  const shown = overflow ? tabs.slice(0, SLOTS - 1) : tabs;
  const rest = overflow ? tabs.slice(SLOTS - 1) : [];
  const moreActive = rest.some((tab) => tabKey(tab) === active);
  const moreHasNew = rest.some((tab) => tab.type !== "category" && hasNew(tab.type));

  function go(tab: ViewState) {
    haptic();
    setMoreOpen(false);
    select(tab);
  }

  return (
    <nav
      aria-label="Sections"
      className={cn(
        "relative shrink-0 border-t bg-background/95 pb-safe backdrop-blur md:hidden",
        mobilePane === "reader" && "hidden",
        className
      )}
    >
      <ul className="flex h-[58px] items-stretch px-1">
        {shown.map((tab) => (
          <li key={tabKey(tab)} className="flex-1">
            <TabButton
              tab={tab}
              label={t(SHORT_LABEL[tab.label] ?? tab.label)}
              active={tabKey(tab) === active}
              dot={tab.type !== "category" && tabKey(tab) !== active && hasNew(tab.type)}
              count={tab.type === "later" ? laterCount : 0}
              onClick={() => go(tab)}
            />
          </li>
        ))}
        {overflow && (
          <li className="flex-1">
            <TabButton
              icon={MoreHorizontal}
              label={moreActive ? t(activeLabel(rest, active)) : t("More")}
              active={moreActive}
              dot={!moreActive && moreHasNew}
              count={0}
              onClick={() => {
                haptic();
                setMoreOpen(true);
              }}
            />
          </li>
        )}
      </ul>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={t("More")}>
        <ul className="grid grid-cols-3 gap-2 px-1 pb-2">
          {rest.map((tab) => {
            const Icon = ICONS[tab.type] ?? Folder;
            const on = tabKey(tab) === active;
            return (
              <li key={tabKey(tab)}>
                <button
                  type="button"
                  onClick={() => go(tab)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex w-full flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/60"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="max-w-full truncate">{t(tab.label)}</span>
                  {tab.type === "later" && laterCount > 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                      {shortCount(laterCount)}
                    </span>
                  )}
                  {tab.type !== "category" && !on && hasNew(tab.type) && (
                    <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </nav>
  );
}

function activeLabel(tabs: ViewState[], active: string | null) {
  return tabs.find((tab) => tabKey(tab) === active)?.label ?? "More";
}

function TabButton({
  tab,
  icon,
  label,
  active,
  dot,
  count,
  onClick,
}: {
  tab?: ViewState;
  icon?: LucideIcon;
  label: string;
  active: boolean;
  dot: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = icon ?? (tab ? (ICONS[tab.type] ?? Folder) : Folder);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={dot ? `${label}, something new` : label}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200",
          active && "bg-primary/15 text-primary"
        )}
      >
        <Icon className={cn("h-[20px] w-[20px]", active && "stroke-[2.25]")} />
        {count > 0 && (
          <span className="absolute -top-1 right-1.5 min-w-[16px] rounded-full bg-primary px-1 text-center text-[9.5px] font-semibold leading-4 text-primary-foreground">
            {shortCount(count)}
          </span>
        )}
        {dot && (
          <span
            aria-hidden
            className="absolute right-3 top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
          />
        )}
      </span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </button>
  );
}
