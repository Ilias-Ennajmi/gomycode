import type { Metadata } from "next";
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
        phase="Phase 2"
      />
    </>
  );
}
