import { createSnapshotHandler } from "@/lib/server/history-api";

export const dynamic = "force-dynamic";

// POST /api/boards/:id/snapshots { label } -> 201 { id }   (a snapshot of the current server state; never deletes updates)
export { createSnapshotHandler as POST };
