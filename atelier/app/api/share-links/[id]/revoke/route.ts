import { revokeLink } from "@/lib/server/share-links";

// POST /api/share-links/:id/revoke -> ShareLinkSummary (status "revoked"); takes effect on the visitor's very next request
export { revokeLink as POST };
