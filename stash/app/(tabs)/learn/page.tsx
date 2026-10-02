import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/shell/Placeholder";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return (
    <>
      <PageHeader title="Learn" />
      <Placeholder
        icon={GraduationCap}
        line="Keep a video by swiping right in Play, and its recall cards show up here."
        phase="Phase 2"
      />
    </>
  );
}
