import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Palette, Sparkles } from "lucide-react";
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
            <Link href="/settings" className="tap flex items-center gap-3 px-4 py-3 text-body text-fg">
              <Palette size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
              <span className="flex-1">Appearance</span>
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
