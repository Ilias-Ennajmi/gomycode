// Fingerprints of the rich text on a board, so a text edit shows up in a round diff (the text lives in a Yjs fragment, not in
// the validated object).
import { fragmentToBlocks } from "@/lib/engine/export/text-layout";
import type * as Y from "yjs";

/** cyrb53: a fast 53-bit string hash, plenty to tell two versions of one text apart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** id -> fingerprint of the object's rich text (formatting included), for every object that has a content fragment. */
export function textFingerprints(doc: { all(): { id: string }[]; content(id: string): Y.XmlFragment | undefined }): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of doc.all()) {
    const frag = doc.content(o.id);
    if (frag) out.set(o.id, hash(JSON.stringify(fragmentToBlocks(frag))));
  }
  return out;
}
