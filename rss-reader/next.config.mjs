// Security headers for every response. The content security policy is deliberately plain:
// Next.js needs inline scripts and styles, article pictures and podcast audio come from
// anywhere, and the YouTube player is an iframe. Development adds 'unsafe-eval' for the
// React refresh runtime.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://www.youtube.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const headers = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers },
      // The service worker fetches articles' pictures from any host on the page's behalf; a
      // CSP delivered with a worker script governs the worker's own fetch() calls, so the
      // page's tight connect-src would block every image once the worker is in charge.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'self'; connect-src *" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
