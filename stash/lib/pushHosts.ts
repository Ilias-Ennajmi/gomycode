/*
 * Web Push endpoints Stash accepts: only the browsers' own push services, over
 * https. The cron routes POST to every stored endpoint, so an arbitrary URL
 * would let any device make the server call it. Kept in step with the check
 * constraint `push_subscriptions_endpoint_host` (migration 0004).
 */

/** Exact hosts. */
export const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"] as const;

/** Any subdomain of these (e.g. wns2-par02p.notify.windows.com, api.push.apple.com). */
export const PUSH_HOST_SUFFIXES = [".notify.windows.com", ".push.apple.com"] as const;

export const MAX_ENDPOINT_LENGTH = 1000;

export function isAllowedPushHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    (PUSH_HOSTS as readonly string[]).includes(h) ||
    PUSH_HOST_SUFFIXES.some((s) => h.endsWith(s) && h.length > s.length && /^[a-z0-9.-]+$/.test(h) && !h.startsWith("."))
  );
}

/** True for an https URL on a known push service (default port, no credentials, no whitespace). */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  if (/\s/.test(endpoint)) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port !== "" && url.port !== "443") return false;
  // The raw string must start with the host as written (the database compares the text itself).
  if (!endpoint.startsWith(`https://${url.hostname}/`) && !endpoint.startsWith(`https://${url.hostname}:443/`)) return false;
  return isAllowedPushHost(url.hostname);
}
