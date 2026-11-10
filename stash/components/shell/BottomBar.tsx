"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, CircleUser, GraduationCap, LayoutGrid, Play, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { useDueFlag } from "@/lib/dueFlag";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { spring } from "@/lib/motionTokens";

type Tab = { href: string; label: string; icon: LucideIcon };

const LEFT: Tab[] = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/library", label: "Library", icon: LayoutGrid },
];
const RIGHT: Tab[] = [
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/you", label: "You", icon: CircleUser },
];

function TabLink({ tab, active, motionOK }: { tab: Tab; active: boolean; motionOK: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "press tap flex flex-1 flex-col items-center justify-center gap-1",
        active ? "text-fg" : "text-fg-subtle",
      )}
    >
      <span className="relative flex h-8 w-14 items-center justify-center">
        {/* The active pill springs from tab to tab (text colour, never the accent). */}
        {active && (
          <motion.span
            layoutId="tab-pill"
            aria-hidden
            className="absolute inset-0 rounded-full bg-fg"
            transition={spring("pop", motionOK)}
          />
        )}
        <Icon size={24} strokeWidth={active ? 2.25 : 2} aria-hidden className={cx("relative", active && "text-background")} />
      </span>
      <span className="text-tab">{tab.label}</span>
    </Link>
  );
}

/**
 * Today · Library · Play · Learn · You. Play is a 56px accent circle raised
 * 18px above the bar; a soft accent ring shows when something is due today.
 * `playHref` carries the queue of wherever the user is (Phase 1+).
 */
export function BottomBar({ hasDue: hasDueProp, playHref = "/play?queue=today" }: { hasDue?: boolean; playHref?: string }) {
  const pathname = usePathname();
  // Today and Learn record whether anything is due (today's queue or recall cards).
  const dueFlag = useDueFlag();
  const hasDue = hasDueProp ?? dueFlag;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const motionOK = useMotionOK();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur-md"
    >
      <div className="mx-auto flex h-[var(--bar-height)] max-w-xl items-stretch px-2">
        {LEFT.map((t) => (
          <TabLink key={t.href} tab={t} active={isActive(t.href)} motionOK={motionOK} />
        ))}
        <div className="flex flex-1 items-start justify-center">
          <Link
            href={playHref}
            aria-label={hasDue ? "Play, items due today" : "Play"}
            className={cx(
              "press -mt-[var(--play-raise)] flex h-[var(--play-size)] w-[var(--play-size)] items-center justify-center rounded-full bg-accent text-on-accent shadow-raised",
              // Ring in the background colour lifts the button off the bar; a due day adds an accent halo.
              "ring-4 ring-background",
              hasDue && "outline-2 outline-offset-4 outline-accent-line",
            )}
          >
            <Play size={26} strokeWidth={2} fill="currentColor" aria-hidden className="translate-x-px" />
          </Link>
        </div>
        {RIGHT.map((t) => (
          <TabLink key={t.href} tab={t} active={isActive(t.href)} motionOK={motionOK} />
        ))}
      </div>
    </nav>
  );
}
