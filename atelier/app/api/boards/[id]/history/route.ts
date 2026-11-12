import { historyHandler } from "@/lib/server/history-api";

export const dynamic = "force-dynamic";

// GET /api/boards/:id/history -> { versions: HistoryVersion[] }   (owner only: compaction versions of the last 30 days + every round)
export { historyHandler as GET };
