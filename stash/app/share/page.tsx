import type { Metadata } from "next";
import { Suspense } from "react";
import { SaveSheet } from "./SaveSheet";

export const metadata: Metadata = { title: "Save" };

/** Android share target (GET /share?title&text&url): saves instantly, then offers optional extras. */
export default function SharePage() {
  return (
    <Suspense>
      <SaveSheet />
    </Suspense>
  );
}
