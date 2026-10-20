"use client";

// Reading aloud with the browser's own voice: the text of an article as short sentences,
// in the language it seems to be in. Shared by the reader's Listen button, Listen to
// Today and Listen to Later.

const FRENCH = /\b(le|la|les|des|une|est|dans|pour|avec|qui|sur|pas|du|au)\b/gi;
const ENGLISH = /\b(the|and|is|in|for|with|that|on|not|of|to|was)\b/gi;

export function guessLang(text: string) {
  const sample = text.slice(0, 2000);
  const fr = sample.match(FRENCH)?.length ?? 0;
  const en = sample.match(ENGLISH)?.length ?? 0;
  return fr > en ? "fr-FR" : "en-US";
}

/** Sentences grouped into short utterances (some engines stop after ~15 seconds). */
export function chunks(text: string) {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 220 && current) {
      out.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, style, figure, figcaption, pre, code, table")
    .forEach((n) => n.remove());
  return doc.body.textContent ?? "";
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function voiceFor(lang: string) {
  return window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
}
