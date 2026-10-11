"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/calendar", label: "Calendrier" },
  { href: "/ideation", label: "Idéation" },
  { href: "/production", label: "Production" },
  { href: "/campaigns", label: "Campagnes" },
  { href: "/library", label: "Bibliothèque" },
  { href: "/stats", label: "Stats" },
  { href: "/influence", label: "Influence" },
];

export function NavTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get("brand");
  const qs = brand ? `?brand=${encodeURIComponent(brand)}` : "";

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${qs}`}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
