"use client";

import useSWR from "swr";
import type { HighlightSummary } from "@/lib/types";

export type ReviewItem = HighlightSummary & {
  next: { again: number; good: number; easy: number };
};

export interface ReviewData {
  highlights: ReviewItem[];
  reviewedToday: number;
  dailyCount: number;
  moreDue: number;
  total: number;
  streak: number;
}

/** Today's daily review: what's due, and the streak. Light enough for the sidebar. */
export function useReviewStatus() {
  return useSWR<ReviewData>("/api/review", { revalidateOnFocus: false });
}
