// Links without the tracking baggage: the same article shared from two newsletters or two
// feeds then has one link, and what gets shared or opened carries nothing about the reader.

const TRACKING_PARAMS = [
  /^utm_/i,
  /^(fbclid|gclid|gclsrc|dclid|msclkid|twclid|ttclid|igshid|yclid|wbraid|gbraid)$/i,
  /^(mc_cid|mc_eid|mkt_tok|_hsenc|_hsmi|hsCtaTracking|vero_id|oly_anon_id|oly_enc_id)$/i,
  /^(ref|ref_src|ref_url|referrer|source|src|s_cid|cmpid|campaign_id|ncid|sr_share)$/i,
  /^(_ga|_gl|_bhlid|rb_clickid|guccounter|guce_referrer|guce_referrer_sig)$/i,
];

/** The link with tracking parameters removed; anything that isn't a URL comes back as is. */
export function cleanLink(link: string) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  if (!/^https?:$/.test(url.protocol)) return link;
  let changed = false;
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  // A bare "#" or "?" left behind is just noise.
  if (url.hash === "#" || url.hash === "") url.hash = "";
  if (!changed) return link;
  const cleaned = url.toString();
  return cleaned.endsWith("?") ? cleaned.slice(0, -1) : cleaned;
}
