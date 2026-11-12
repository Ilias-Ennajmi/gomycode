import { historyHandler } from "@/lib/server/history-api";

export const dynamic = "force-dynamic";

// GET /api/boards/:id/versions: the same answer as /history (the plan calls it history, the task brief versions).
export { historyHandler as GET };
