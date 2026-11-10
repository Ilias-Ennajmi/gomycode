import type { Metadata } from "next";
import Link from "next/link";
import { Share2 } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/shell/Placeholder";
import { TodayDate } from "./TodayDate";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" eyebrow={<TodayDate />} />
      <Placeholder
        icon={Share2}
        line="Share a reel to Stash to start. Your 5 for today will build from what you save."
        action={{ label: "Bring the saves you already have", href: "/import" }}
        phase="Phase 2"
      />
      <p className="px-6 text-center">
        <Link href="/triage" className="tap inline-flex items-center justify-center px-4 text-label text-fg underline">
          Sort old saves · 30 s
        </Link>
      </p>
    </>
  );
}
