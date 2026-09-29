import { parseHTML } from "linkedom";

// Class/id fragments that mark page furniture rather than article text.
const CLUTTER_PATTERN =
  /(^|[\s_-])(ad|ads|advert|advertisement|sponsor(ed)?|promo|newsletter|subscribe|signup|related|recommended|share|sharing|social|comments?|popup|modal|cookie|banner|outbrain|taboola|paywall-prompt)([\s_-]|$)/i;

const ALWAYS_REMOVE = [
  "script",
  "style",
  "noscript",
  "form",
  "button",
  "nav",
  "footer",
  "aside",
  "[aria-hidden='true']",
  "[hidden]",
];

const TRACKER_HOSTS = /(feedburner|feedsportal|doubleclick|pixel\.|stats\.|analytics|pheedo|tracking|mf\.gif|beacon)/i;
const VIDEO_EMBED = /(youtube(-nocookie)?\.com|player\.vimeo\.com|w\.soundcloud\.com|open\.spotify\.com)/i;

// Boilerplate lines feeds append to every item.
const FOOTER_PATTERNS = [
  /^the post .+ appeared first on .+\.?$/i,
  /^(continue|keep) reading/i,
  /^read (the )?(full|more|rest)/i,
  /^l[’']article .+ est apparu en premier sur .+/i,
  /^lire la suite/i,
];

function isClutter(element: Element) {
  const marker = `${element.getAttribute("class") ?? ""} ${element.getAttribute("id") ?? ""}`;
  // Never strip the whole article because its wrapper has a generic class.
  if (!CLUTTER_PATTERN.test(marker)) return false;
  return (element.textContent ?? "").length < 2000;
}

function isTrackingImage(img: Element) {
  const src = img.getAttribute("src") ?? "";
  const width = img.getAttribute("width");
  const height = img.getAttribute("height");
  const tiny = (width === "1" || width === "0") && (height === "1" || height === "0");
  return tiny || TRACKER_HOSTS.test(src);
}

/** Removes ads, share/subscribe blocks, tracking pixels and feed footers from a document in place. */
export function removeClutter(document: Document) {
  document.querySelectorAll(ALWAYS_REMOVE.join(",")).forEach((el) => el.remove());
  document.querySelectorAll("[class], [id]").forEach((el) => {
    if (isClutter(el)) el.remove();
  });
  document.querySelectorAll("img").forEach((img) => {
    if (isTrackingImage(img)) img.remove();
  });
  document.querySelectorAll("iframe").forEach((frame) => {
    if (!VIDEO_EMBED.test(frame.getAttribute("src") ?? "")) frame.remove();
  });
  document.querySelectorAll("p, div, span").forEach((el) => {
    const text = (el.textContent ?? "").trim();
    if (text.length < 200 && FOOTER_PATTERNS.some((pattern) => pattern.test(text))) el.remove();
  });
}

/** Cleans an HTML fragment (e.g. a feed item's content) and returns the cleaned HTML. */
export function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return html ?? null;
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  removeClutter(document as unknown as Document);
  const cleaned = document.body?.innerHTML.trim() ?? "";
  return cleaned || null;
}
