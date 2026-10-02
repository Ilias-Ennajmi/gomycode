import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Play } from "lucide-react";
import { Placeholder } from "@/components/shell/Placeholder";

export const metadata: Metadata = { title: "Play" };

/** Full-screen player: no tab bar. The real pager arrives in Phase 1. */
export default function PlayPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background pt-safe pb-safe">
      <div className="flex items-center px-2 pt-2">
        <Link href="/today" aria-label="Close player" className="tap flex items-center justify-center rounded-full text-fg">
          <ChevronDown size={24} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <Placeholder icon={Play} line="Nothing to play yet. Share a reel to Stash and it plays here, full screen." phase="Phase 1" />
    </main>
  );
}
