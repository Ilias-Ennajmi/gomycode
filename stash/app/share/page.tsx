import type { Metadata } from "next";
import { Suspense } from "react";
import { SharePreview } from "./SharePreview";

export const metadata: Metadata = { title: "Save" };

/** Android share target (GET /share?title&text&url). The instant-save sheet arrives in Phase 1. */
export default function SharePage() {
  return (
    <Suspense>
      <SharePreview />
    </Suspense>
  );
}
