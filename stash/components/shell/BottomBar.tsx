"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CircleUser, GraduationCap, LayoutGrid, Play, type LucideIcon } from "lucide-react";

type Tab = { href: string; label: string; icon: LucideIcon };

const LEFT: Tab[] = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/library", label: "Library", icon: LayoutGrid },
];
const RIGHT: Tab[] = [
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/you", label: "You", icon: CircleUser },
];

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`tap flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-[var(--dur-fast)] ${
        active ? "text-fg" : "text-fg-subtle"
      }`}
    >
      <Icon size={24} strokeWidth={2} aria-hidden />
      <span className="text-tab">{tab.label}</span>
    </Link>
  );
}

/**
 * Today · Library · Play · Learn · You. Play is a 56px accent circle raised
 * 18px above the bar; a soft accent ring shows when something is due today.
 * `playHref` carries the queue of wherever the user is (Phase 1+).
 */
export function BottomBar({ hasDue = false, playHref = "/play?queue=today" }: { hasDue?: boolean; playHref?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-safe"
    >
      <div className="mx-auto flex h-[var(--bar-height)] max-w-xl items-stretch px-2">
        {LEFT.map((t) => (
          <TabLink key={t.href} tab={t} active={isActive(t.href)} />
        ))}
        <div className="flex flex-1 items-start justify-center">
          <Link
            href={playHref}
            aria-label={hasDue ? "Play, items due today" : "Play"}
            className={`-mt-[var(--play-raise)] flex h-[var(--play-size)] w-[var(--play-size)] items-center justify-center rounded-full bg-accent text-on-accent shadow-raised transition-transform duration-[var(--dur-fast)] active:scale-95 ${
              hasDue ? "ring-4 ring-accent/30" : ""
            }`}
          >
            <Play size={24} strokeWidth={2} fill="currentColor" aria-hidden />
          </Link>
        </div>
        {RIGHT.map((t) => (
          <TabLink key={t.href} tab={t} active={isActive(t.href)} />
        ))}
      </div>
    </nav>
  );
}
