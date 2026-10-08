import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayView } from "./PlayView";

export const metadata: Metadata = { title: "Play" };

/** Full-screen vertical player: no tab bar. ?queue=today | ?space=&filter= | ?ids= | ?id= */
export default function PlayPage() {
  return (
    <Suspense>
      <PlayView />
    </Suspense>
  );
}
