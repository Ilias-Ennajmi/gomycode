import type { NextConfig } from "next";
import { EMBED_ORIGINS } from "./lib/engine/links/embed";

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
    ];
  },
};

export default nextConfig;
