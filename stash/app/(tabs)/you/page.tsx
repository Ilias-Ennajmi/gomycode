import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, Download, Layers, Palette, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/shell/Placeholder";
import { DeviceCard } from "./DeviceCard";

export const metadata: Metadata = { title: "You" };

export default function YouPage() {
  return (
    <>
      <PageHeader title="You" />
      <nav aria-label="Settings" className="px-4">
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          <li>
            <Link href="/settings#appearance" className="tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <Palette size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
              <span className="flex-1">Appearance</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line">
            <Link href="/import" className="tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <Download size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
              <span className="flex-1">Import from Instagram or TikTok</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line">
            <Link href="/triage" className="tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <Layers size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
              <span className="flex-1">Sort old saves</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line">
            <Link href="/settings#reminders" className="tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <Bell size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
              <span className="flex-1">Reminders</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
          <li className="border-t border-line">
            <Link href="/design" className="tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <Sparkles size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
              <span className="flex-1">Design system</span>
              <ChevronRight size={24} strokeWidth={2} aria-hidden className="text-fg-subtle" />
            </Link>
          </li>
        </ul>
      </nav>
      <div className="pt-4">
        <DeviceCard />
      </div>
      <Placeholder icon={Sparkles} line="Your month in saves — watched, learned, applied — appears here." phase="Phase 4" />
    </>
  );
}
