/**
 * Resolves a favicon URL for a site:
 * 1. <link rel="icon"> (or "shortcut icon") in the site HTML
 * 2. /favicon.ico
 * 3. Google's s2 favicon service as a last resort
 */
export async function discoverFaviconUrl(siteUrl: string): Promise<string> {
  const origin = new URL(siteUrl).origin;

  try {
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSSReaderBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const tag = html.match(/<link\s+[^>]*rel=["'](?:shortcut icon|icon)["'][^>]*>/gi)?.[0];
      const href = tag?.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) return new URL(href, origin).toString();
    }
  } catch {
    // fall through
  }

  try {
    const faviconIco = `${origin}/favicon.ico`;
    const res = await fetch(faviconIco, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (res.ok) return faviconIco;
  } catch {
    // fall through
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
}
