// Web Share Target, the part that needs no service worker.
//
// With Atelier installed, public/sw.js answers POST /share-target on the device (public/sw-share.js) and this route is
// never reached. A request that does reach the server (the worker is not active yet, the browser skipped it, someone
// opened the address) is only sent on to the Inbox: nothing is read, stored or fetched from it, and the Inbox page is
// behind the normal sign-in.

const toInbox = () => new Response(null, { status: 303, headers: { Location: "/inbox", "Cache-Control": "no-store" } });

export const dynamic = "force-dynamic";

export function GET(): Response {
  return toInbox();
}

export function POST(): Response {
  return toInbox();
}
