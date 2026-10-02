import type { Metadata } from "next";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/shell/Placeholder";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" />
      <Placeholder icon={LayoutGrid} line="Everything you save lands here, sorted into Spaces." phase="Phase 1" />
    </>
  );
}
