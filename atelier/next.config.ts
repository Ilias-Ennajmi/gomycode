import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canvas images come straight from R2 (already resized by the upload pipeline), so the
  // built-in image optimiser is not used.
  images: { unoptimized: true },
};

export default nextConfig;
