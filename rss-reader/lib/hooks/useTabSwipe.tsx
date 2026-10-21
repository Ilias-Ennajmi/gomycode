"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/native";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { tabKey, useSectionTabs } from "@/lib/hooks/useSectionTabs";
import { useT } from "@/lib/i18n";

// Phones: a sideways swipe on a list or a front page moves to the next or previous tab, in
// the bottom bar's order, the way native apps page between sections. A swipe that starts
// on something that scrolls or slides sideways (stories, chips, the news slider, a scrubber)
// is that thing's, and so is a card's swipe when cards are set to swipe for Later / read.

const TRIGGER = 72;
const RESIST = 0.45;

type Start = { x: number; y: number; horizontal: boolean | null; blocked: boolean };

function blocks(target: EventTarget | null, root: HTMLElement, cardActions: boolean) {
  for (let el = target as HTMLElement | null; el && el !== root; el = el.parentElement) {
    if (el.matches('input, textarea, [role="slider"], [data-no-tab-swipe]')) return true;
    if (cardActions && el.hasAttribute("data-article-id")) return true;
    if (el.scrollWidth > el.clientWidth + 2) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  // Text being selected stays a selection.
  return Boolean(window.getSelection()?.toString());
}

export function useTabSwipe(enabled: boolean) {
  const { tabs, active, select } = useSectionTabs();
  const { personal } = usePersonal();
  const { t } = useT();
  const start = React.useRef<Start | null>(null);
  const [dx, setDx] = React.useState(0);
  const [entered, setEntered] = React.useState<"left" | "right" | null>(null);

  const index = tabs.findIndex((tab) => tabKey(tab) === active);
  const previous = index > 0 ? tabs[index - 1] : null;
  const next = index >= 0 && index < tabs.length - 1 ? tabs[index + 1] : null;
  const on = enabled && index >= 0;

  React.useEffect(() => {
    if (!entered) return;
    const timer = setTimeout(() => setEntered(null), 260);
    return () => clearTimeout(timer);
  }, [entered]);

  const handlers = {
    onTouchStart(event: React.TouchEvent<HTMLElement>) {
      if (!on || event.touches.length > 1) return;
      const touch = event.touches[0];
      start.current = {
        x: touch.clientX,
        y: touch.clientY,
        horizontal: null,
        blocked: blocks(event.target, event.currentTarget, personal.listSwipe === "actions"),
      };
    },
    onTouchMove(event: React.TouchEvent<HTMLElement>) {
      const s = start.current;
      if (!s || s.blocked) return;
      const touch = event.touches[0];
      const mx = touch.clientX - s.x;
      const my = touch.clientY - s.y;
      if (s.horizontal === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
        s.horizontal = Math.abs(mx) > Math.abs(my) * 1.5;
      }
      if (!s.horizontal) return;
      // No tab that way: it gives a little and springs back.
      const towards = mx < 0 ? next : previous;
      const moved = mx * (towards ? RESIST : 0.12);
      if (Math.abs(dx) >= TRIGGER * RESIST !== Math.abs(moved) >= TRIGGER * RESIST && towards) {
        haptic();
      }
      setDx(moved);
    },
    onTouchEnd() {
      const s = start.current;
      start.current = null;
      if (!s?.horizontal) return setDx(0);
      const target = dx < 0 ? next : previous;
      setDx(0);
      if (target && Math.abs(dx) >= TRIGGER * RESIST) {
        haptic("medium");
        setEntered(dx < 0 ? "right" : "left");
        select(target);
      }
    },
  };

  // Keyboards: [ and ] do the same.
  const step = (delta: -1 | 1) => {
    const target = delta < 0 ? previous : next;
    if (!target) return;
    setEntered(delta > 0 ? "right" : "left");
    select(target);
  };

  const towards = dx < 0 ? next : dx > 0 ? previous : null;
  const progress = Math.min(1, Math.abs(dx) / (TRIGGER * RESIST));

  return {
    step,
    handlers: on ? handlers : {},
    style: dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined,
    className: cn(
      "transition-transform duration-200 ease-out",
      entered === "right" && "animate-tab-in-right motion-reduce:animate-none",
      entered === "left" && "animate-tab-in-left motion-reduce:animate-none"
    ),
    hint: towards ? (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed top-1/2 z-40 flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-lg",
          dx < 0 ? "right-3" : "left-3"
        )}
        style={{
          opacity: 0.3 + progress * 0.7,
          transform: `translateY(-50%) scale(${0.9 + progress * 0.1})`,
        }}
      >
        {dx > 0 && <ChevronLeft className="h-3.5 w-3.5" />}
        {t(towards.label)}
        {dx < 0 && <ChevronRight className="h-3.5 w-3.5" />}
      </div>
    ) : null,
  };
}
