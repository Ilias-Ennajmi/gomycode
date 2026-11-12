import { createRateLimiter } from "./rate-limit";

// Per owner, in memory (see rate-limit.ts: serverless instances do not share these counters).
/** POST /api/link-preview: 30 requests per minute. */
export const previewLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
/** GET /api/link-preview/image: a board of link cards loads many thumbnails at once, so it gets a larger budget. */
export const imageLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
