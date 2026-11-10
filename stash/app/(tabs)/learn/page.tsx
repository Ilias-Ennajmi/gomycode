import type { Metadata } from "next";
import { LearnView } from "./LearnView";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <LearnView />;
}
