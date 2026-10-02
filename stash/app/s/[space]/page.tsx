import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/shell/Placeholder";

export const metadata: Metadata = { title: "Space" };

export default function SpacePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Space" back="/library" />
      <Placeholder icon={FolderOpen} line="A topic or project: its saves, stats and what they say together." phase="Phase 1" />
    </main>
  );
}
