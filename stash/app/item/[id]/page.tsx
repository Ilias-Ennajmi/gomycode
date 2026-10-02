import type { Metadata } from "next";
import { Film } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/shell/Placeholder";

export const metadata: Metadata = { title: "Item" };

export default function ItemPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Saved item" back="/library" />
      <Placeholder icon={Film} line="The player, key idea, takeaways and transcript for one save." phase="Phase 1" />
    </main>
  );
}
