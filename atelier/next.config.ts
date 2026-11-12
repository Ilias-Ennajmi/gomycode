import type { NextConfig } from "next";
import { EMBED_ORIGINS } from "./lib/engine/links/embed";

const SHARE_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  // Canvas images come straight from R2 (already resized by the upload pipeline), so the
  // built-in image optimiser is not used.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The only frames a page may contain are the embed providers' players (see lib/engine/links/embed.ts).
          { key: "Content-Security-Policy", value: `frame-src ${EMBED_ORIGINS.join(" ")}` },
        ],
      },
      // Share links carry the token in the URL: never send it on as a Referer, never index the page, never cache an answer.
      ...["/s/:path*", "/api/s/:path*"].map((source) => ({ source, headers: SHARE_HEADERS })),
    ];
  },
};

export default nextConfig;
