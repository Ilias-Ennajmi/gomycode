import type { Metadata } from "next";
import { TriageView } from "./TriageView";

export const metadata: Metadata = { title: "Sort old saves" };

export default function TriagePage() {
  return <TriageView />;
}
