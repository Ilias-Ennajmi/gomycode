import type { NextConfig } from "next";

// The Supabase project host: thumbnails, voice notes and stored videos are served from its Storage.
function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

const storage = supabaseOrigin();

/*
 * Content Security Policy (contract 0007 §6). It limits where frames, media and images may
 * come from:
 * - frames: only the three official players a save's embed_url can point to;
 * - video / audio: this site and the Supabase project (signed Storage links), plus blob: for a
 *   voice note just recorded;
 * - images: this site, Supabase Storage, data: / blob: (previews made on the phone) and the
 *   OpenStreetMap tiles of the Map lens.
 * Scripts and styles are left to Next.js (it inlines its own bootstrap), so they are not listed.
 */
const csp = [
  "frame-src https://www.tiktok.com https://www.instagram.com https://www.youtube-nocookie.com",
  `media-src 'self' blob: ${storage}`.trim(),
  `img-src 'self' data: blob: ${storage} https://tile.openstreetmap.org`.replace(/\s+/g, " ").trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
