// Relative on purpose: next.config.ts imports this file before the "@/" alias exists.
import { EMBED_ORIGINS } from "../engine/links/embed";

/*
 * The Content-Security-Policy of the share page (/s/*). Strict about where anything may come from: pictures and video only from
 * this site and the studio's R2 host, frames only from the three embed players, no plugins, never framed by another site,
 * forms only to this site. `script-src` keeps 'unsafe-inline' because Next's own bootstrap and the theme script are inline and
 * a nonce would make every page dynamic; the page has no HTML sink (every visitor-supplied string is a React text node), and
 * the tests in tests/unit/viewer-app.test.tsx and tests/security keep it that way.
 */

/** `assets.example.com` from NEXT_PUBLIC_R2_PUBLIC_HOST / R2_PUBLIC_HOST (a bare host, with or without a scheme); null when unusable. */
export function r2HostFromEnv(env: Record<string, string | undefined> = process.env): string | null {
  const host = (env.NEXT_PUBLIC_R2_PUBLIC_HOST || env.R2_PUBLIC_HOST || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host) ? host : null;
}

export function shareCsp(opts: { r2Host: string | null; dev?: boolean }): string {
  const r2 = opts.r2Host ? [`https://${opts.r2Host}`] : [];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", ...r2, "data:", "blob:"]],
    ["media-src", ["'self'", ...r2, "blob:"]],
    ["connect-src", ["'self'", ...r2]],
    ["font-src", ["'self'", "data:"]],
    ["frame-src", [...EMBED_ORIGINS]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}
