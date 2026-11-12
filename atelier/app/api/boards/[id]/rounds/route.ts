import { listRoundsHandler, publishHandler } from "@/lib/server/rounds-api";

export const dynamic = "force-dynamic";

// GET  /api/boards/:id/rounds -> { rounds: Round[] }              (owner only, newest first)
// POST /api/boards/:id/rounds { label, previewToken, frames } -> 201 Round    (snapshots the board's current server state)
export { listRoundsHandler as GET, publishHandler as POST };
