import { prepareHandler } from "@/lib/server/rounds-api";

export const dynamic = "force-dynamic";

// POST /api/boards/:id/rounds/prepare { frames: { frameId, bytes1280, bytes480 }[] } -> { previewToken, uploads }
export { prepareHandler as POST };
