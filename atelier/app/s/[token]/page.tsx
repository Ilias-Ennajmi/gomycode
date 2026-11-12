import "@/components/viewer/viewer.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { ViewerApp } from "@/components/viewer/ViewerApp";
import { loadSharePage } from "@/lib/server/share-page";

/*
 * /s/{token}: the client's review page. A server component: it decides what the first paint is (the gate, or the board with the
 * first slide's pre-rendered picture) from the same library the API uses, with no HTTP hop. A dead link of any kind, a wrong
 * password page and a normal page all answer 200 with the same shape; nothing here says WHY a link is unavailable. Never cached
 * (next.config.ts sends Cache-Control: private, no-store), never indexed, no Referer sent on.
 */

type Props = { params: Promise<{ token: string }> };

// One load per request, shared by the metadata and the page.
const load = cache(async (token: string) => {
  const h = await headers();
  // The cookie is all the page needs from the request; a Request is what the guard reads.
  const req = new Request("https://share.invalid/", { headers: { cookie: h.get("cookie") ?? "" } });
  return loadSharePage(req, token);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data.kind === "ready" ? data.title : "Shared board",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const initial = await load(token);
  return <ViewerApp token={token} initial={initial} />;
}
