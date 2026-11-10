/*
 * POST /share/receive — the Android/web share target (multipart: title, text, url, media).
 *
 * Normally the service worker answers this request (public/sw.js): it keeps the image
 * in the "stash-share-inbox" Cache and redirects to /share. This route is the fallback
 * for a share that arrives before the service worker is installed. It stores nothing
 * on the server (the device may have no identity yet): text shares are redirected to
 * /share?title&text&url, and an image comes back inside a tiny page that puts it in the
 * same Cache and opens /share?shared-image=<id>.
 *
 * A route can't live next to app/share/page.tsx (Next.js: no route.js beside page.js
 * in one segment), hence /share/receive.
 */

const MAX_IMAGE = 8 * 1024 * 1024;
const FIELDS = ["title", "text", "url"] as const;

function shareParams(form: FormData): URLSearchParams {
  const q = new URLSearchParams();
  for (const k of FIELDS) {
    const v = form.get(k);
    if (typeof v === "string" && v.trim()) q.set(k, v.slice(0, 2000));
  }
  return q;
}

function redirect(request: Request, q: URLSearchParams): Response {
  const target = new URL(`/share${q.size ? `?${q}` : ""}`, request.url);
  return new Response(null, { status: 303, headers: { Location: target.pathname + target.search, "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(request, new URLSearchParams());
  }
  const q = shareParams(form);
  const file = form.getAll("media").find((f): f is File => typeof f !== "string" && f.type.startsWith("image/"));
  if (!file) return redirect(request, q);
  if (file.size > MAX_IMAGE) {
    q.set("shared-image", "too-big");
    return redirect(request, q);
  }

  const id = crypto.randomUUID();
  q.set("shared-image", id);
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const type = /^image\/[a-z0-9.+-]+$/i.test(file.type) ? file.type : "image/jpeg";
  // JSON.stringify escapes the values for a script context; "<" is escaped so nothing can close the tag.
  const payload = JSON.stringify({ id, type, data, next: `/share?${q}` }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saving…</title></head><body><script>
(async () => {
  const p = ${payload};
  try {
    const bin = atob(p.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const cache = await caches.open("stash-share-inbox");
    await cache.put("/share/inbox/" + p.id, new Response(new Blob([bytes], { type: p.type }), { headers: { "Content-Type": p.type, "X-Stash-Shared-At": String(Date.now()) } }));
  } catch (e) {}
  location.replace(p.next);
})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

/** Opened directly (or the share was re-sent as GET): the save sheet handles it. */
export function GET(request: Request): Response {
  return redirect(request, new URL(request.url).searchParams);
}
