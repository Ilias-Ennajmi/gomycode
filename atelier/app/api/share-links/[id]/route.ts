import { deleteLink, patchLink } from "@/lib/server/share-links";

// PATCH  /api/share-links/:id Partial<ShareLinkOptions> & { votesRevealed? } -> ShareLinkSummary
//        password: a string sets it, null clears it, absent keeps it; setting or clearing bumps cookieEpoch
// DELETE /api/share-links/:id -> 204
export { patchLink as PATCH, deleteLink as DELETE };
