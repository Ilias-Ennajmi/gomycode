// Finding and drawing highlights inside the article's HTML. A highlight is stored as its text
// plus a little text before and after it (like the W3C "text quote" selector), so it can be
// found again when the page changes a bit, e.g. between the feed version and the full article.

const CONTEXT = 64;
const MARK_SELECTOR = "mark[data-hl]";

export interface SelectionQuote {
  text: string;
  prefix: string;
  suffix: string;
}

export interface Highlightable {
  id: string;
  text: string;
  prefix: string;
  suffix: string;
  color: string;
  note?: string | null;
}

/** The selected passage inside `container`, with its context; null if nothing's selected there. */
export function readSelection(container: HTMLElement): SelectionQuote | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const text = range.toString();
  if (!text.trim()) return null;

  // Range.toString() joins text nodes like textContent does, so offsets line up.
  const before = document.createRange();
  before.setStart(container, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const full = container.textContent ?? "";
  return {
    text: text.trim(),
    prefix: full.slice(Math.max(0, start - CONTEXT), start),
    suffix: full.slice(start + text.length, start + text.length + CONTEXT),
  };
}

/** Collapses whitespace, remembering where each kept character was in the original. */
function normalize(value: string) {
  let out = "";
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (/\s/.test(ch)) {
      if (!space && out.length > 0) {
        out += " ";
        map.push(i);
      }
      space = true;
    } else {
      out += ch;
      map.push(i);
      space = false;
    }
  }
  return { out, map };
}

function squash(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** How many characters `a` and `b` share, counted from their ends (fromEnd) or starts. */
function overlap(a: string, b: string, fromEnd: boolean) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max) {
    const ca = fromEnd ? a[a.length - 1 - n] : a[n];
    const cb = fromEnd ? b[b.length - 1 - n] : b[n];
    if (ca !== cb) break;
    n++;
  }
  return n;
}

/** Where the highlight is in `full` (start, end), picking the occurrence whose context fits best. */
export function locate(full: string, h: Pick<Highlightable, "text" | "prefix" | "suffix">) {
  const { out, map } = normalize(full);
  const needle = squash(h.text);
  if (!needle) return null;
  const prefix = squash(h.prefix);
  const suffix = squash(h.suffix);

  let best: { start: number; score: number } | null = null;
  for (let i = out.indexOf(needle); i !== -1; i = out.indexOf(needle, i + 1)) {
    const score =
      overlap(out.slice(Math.max(0, i - prefix.length - 1), i).trimEnd(), prefix, true) +
      overlap(out.slice(i + needle.length).trimStart(), suffix, false);
    if (!best || score > best.score) best = { start: i, score };
  }
  if (!best) return null;
  return { start: map[best.start], end: map[best.start + needle.length - 1] + 1 };
}

/** Removes drawn highlights, leaving the text as it was. */
export function clearHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll(MARK_SELECTOR);
  if (marks.length === 0) return;
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  container.normalize();
}

/** Wraps the text between start and end (textContent offsets) in marks, node by node. */
function wrap(container: HTMLElement, start: number, end: number, h: Highlightable) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const pieces: { node: Text; from: number; to: number }[] = [];
  let offset = 0;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.data.length;
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + length);
    if (from < to) pieces.push({ node, from: from - offset, to: to - offset });
    offset += length;
    if (offset >= end) break;
  }

  let first = true;
  for (const { node, from, to } of pieces) {
    // Whitespace between table rows or list items can't hold a mark.
    if (!node.data.slice(from, to).trim()) continue;
    let target = node;
    if (from > 0) target = target.splitText(from);
    if (to - from < target.data.length) target.splitText(to - from);
    const mark = document.createElement("mark");
    mark.dataset.hl = h.id;
    mark.dataset.color = h.color;
    mark.className = "reader-highlight";
    if (first && h.note) mark.dataset.note = "true";
    first = false;
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
  }
}

/** Draws the highlights; returns the ids of the ones that couldn't be found in this text. */
export function drawHighlights(container: HTMLElement, highlights: Highlightable[]) {
  clearHighlights(container);
  const missing: string[] = [];
  // Offsets shift as marks are added only in node structure, not in text, so locate each
  // against the same textContent.
  const full = container.textContent ?? "";
  for (const h of highlights) {
    const found = locate(full, h);
    if (!found) {
      missing.push(h.id);
      continue;
    }
    wrap(container, found.start, found.end, h);
  }
  return missing;
}

// A highlight to scroll to once its article is open (from the Highlights list).
let pendingJump: string | null = null;

export function requestHighlightJump(id: string) {
  pendingJump = id;
}

/** Scrolls to the requested highlight if it's in `container`, and makes it blink. */
export function consumeHighlightJump(container: HTMLElement) {
  if (!pendingJump) return;
  const marks = container.querySelectorAll(`mark[data-hl="${pendingJump}"]`);
  if (marks.length === 0) return;
  pendingJump = null;
  // After layout settles (images, the reader's own scroll reset).
  setTimeout(() => {
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    marks.forEach((m) => m.classList.add("reader-highlight-flash"));
    setTimeout(() => marks.forEach((m) => m.classList.remove("reader-highlight-flash")), 1800);
  }, 350);
}
