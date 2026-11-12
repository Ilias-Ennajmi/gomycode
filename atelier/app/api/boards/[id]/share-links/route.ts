import { createForBoard, listForBoard } from "@/lib/server/share-links";

// GET  /api/boards/:id/share-links -> { links: ShareLinkSummary[] }                 (owner only; never token or password hashes)
// POST /api/boards/:id/share-links ShareLinkOptions -> 201 { link, url }            (the ONLY response that carries the token)
export { listForBoard as GET, createForBoard as POST };
