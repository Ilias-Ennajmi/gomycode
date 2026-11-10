import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, Download, KeyRound, Layers, ListChecks, Palette, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { WrappedCard } from "@/components/you/WrappedCard";
import { DeviceCard } from "./DeviceCard";

export const metadata: Metadata = { title: "You" };

export default function YouPage() {
  return (
    <>
      <PageHeader title="You" />
      <WrappedCard />
      <nav aria-label="Settings" className="px-4 pt-6">
        <ul className="overflow-hidden rounded-xl bg-surface shadow-pop">
          <li>
            <Link href="/settings#setup" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><ListChecks size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Setup</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line/70">
            <Link href="/settings#recovery" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><KeyRound size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Move to a new phone · backups</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line/70">
            <Link href="/settings#appearance" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><Palette size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Appearance</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line/70">
            <Link href="/import" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><Download size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Import saves and links</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line/70">
            <Link href="/triage" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><Layers size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Sort old saves</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line/70">
            <Link href="/settings#reminders" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><Bell size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Reminders</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line/70">
            <Link href="/design" className="press tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised"><Sparkles size={22} strokeWidth={2} aria-hidden /></span>
              <span className="flex-1 text-label">Design system</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
        </ul>
      </nav>
      <div className="pt-4">
        <DeviceCard />
      </div>
    </>
  );
}
