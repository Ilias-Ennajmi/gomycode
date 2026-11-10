import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { RestoreFromLink } from "./RestoreFromLink";

export const metadata: Metadata = { title: "Restore", robots: { index: false } };

/**
 * Where the recovery QR points: /restore#<code>. The code sits after the #, so it is never
 * sent to the server. This page never creates an identity (it is about to get one).
 */
export default function RestorePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Restore" back="/today" />
      <div className="px-4 pb-8">
        <RestoreFromLink />
      </div>
    </main>
  );
}
