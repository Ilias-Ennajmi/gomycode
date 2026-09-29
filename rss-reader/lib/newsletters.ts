// Newsletters come two ways: web newsletters with a feed (Substack, Beehiiv, Ghost, Buttondown)
// and ones that only arrive by email. For those, Kill the Newsletter (a free service) gives
// each one its own email address and turns what arrives there into an Atom feed, which the
// app then follows like any other. Nothing to set up, no account.

const KTN = "https://kill-the-newsletter.com";

export type NewsletterPlatform = "substack" | "beehiiv" | "ghost" | "buttondown" | "email";

/** Which newsletter platform a feed comes from, by its address or <generator>. */
export function detectPlatform(url: string, generator?: string | null): NewsletterPlatform | null {
  const gen = generator ?? "";
  if (/kill-the-newsletter\.com/i.test(url)) return "email";
  if (/substack\.com/i.test(url) || /substack/i.test(gen)) return "substack";
  if (/beehiiv\.com/i.test(url) || /beehiiv/i.test(gen)) return "beehiiv";
  if (/buttondown\.(email|com)/i.test(url) || /buttondown/i.test(gen)) return "buttondown";
  if (/^ghost\b/i.test(gen)) return "ghost";
  return null;
}

export interface EmailInbox {
  email: string;
  feedUrl: string;
}

/** Creates a new address and its feed. */
export async function createEmailInbox(title: string): Promise<EmailInbox> {
  const res = await fetch(`${KTN}/feeds`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      // Its server refuses form posts from other sites without this.
      "CSRF-Protection": "true",
    },
    body: new URLSearchParams({ title: title.slice(0, 200) }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Kill the Newsletter answered ${res.status}`);
  const data = (await res.json()) as { email?: string; feed?: string };
  if (!data.email || !data.feed || !/^https:\/\//.test(data.feed)) {
    throw new Error("Kill the Newsletter sent an unexpected answer");
  }
  return { email: data.email, feedUrl: data.feed };
}

const UNSUBSCRIBE_TEXT =
  /unsubscribe|opt[\s-]?out|manage (your )?(subscription|preferences)|se d[ée]sabonner|d[ée]sinscri|d[ée]sabonnement/i;

/** The unsubscribe link in a newsletter email, if it has one. */
export function findUnsubscribeLink(html: string | null | undefined): string | null {
  if (!html) return null;
  const anchors = html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of Array.from(anchors)) {
    const href = match[1].replace(/&amp;/g, "&");
    const text = match[2].replace(/<[^>]*>/g, " ");
    if (!/^https?:\/\//i.test(href)) continue;
    if (UNSUBSCRIBE_TEXT.test(text) || /unsubscribe|optout|opt-out/i.test(href)) return href;
  }
  return null;
}

// Phrases a feed's preview of a paid post ends with.
const PAYWALL_TEXT =
  /(keep reading with a (7|seven)-day free trial|this post is for paid subscribers|subscribe to .{1,80} to (keep|read) reading|upgrade to paid|réservé aux abonnés payants)/i;

/** Whether this is the free preview of a paid post (Substack and similar). */
export function isPaidPreview(html: string | null | undefined) {
  return Boolean(html && PAYWALL_TEXT.test(html.replace(/<[^>]*>/g, " ")));
}
