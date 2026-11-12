import { downloadSnapshotHandler } from "@/lib/server/history-api";

export const dynamic = "force-dynamic";

// GET /api/boards/:id/snapshots/:sid -> the snapshot's Yjs state (application/octet-stream); 404 unless it is this board's
export { downloadSnapshotHandler as GET };
