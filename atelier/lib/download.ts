// Handing a file to the person using the browser: a safe file name, and a download through an object URL.

/** Larger payloads are refused: a Blob URL of hundreds of MB can take the tab down on a phone. */
export const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;

// Control characters (C0 and C1), bidi overrides and isolates, byte-order mark: never part of a file name.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩﻿]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A file name that is safe on every platform: no path separators or characters Windows forbids (each run becomes "-"), no
 * control characters, no leading or trailing dots, spaces or dashes, never a reserved Windows device name, capped at
 * `max` characters (code points: an emoji is never cut in half). Unicode letters are kept. `fallback` when nothing is left.
 */
export function sanitizeFileName(name: string, fallback: string, max = 80): string {
  let s = String(name ?? "")
    .replace(INVISIBLE, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
  s = Array.from(s.replace(/^[\s.-]+/, "")).slice(0, max).join("").replace(/[\s.-]+$/, "");
  if (!s) return fallback;
  const dot = s.indexOf(".");
  const base = dot < 0 ? s : s.slice(0, dot);
  if (RESERVED.test(base)) s = base + "_" + (dot < 0 ? "" : s.slice(dot));
  return s;
}

const length = (data: Uint8Array | string): number => (typeof data === "string" ? new TextEncoder().encode(data).length : data.length);

/**
 * Save `data` as `name`: wraps it in a Blob, clicks a temporary anchor on an object URL, removes the anchor and revokes the
 * URL a moment later (right away breaks the download in some browsers), even if the click throws. The name is sanitised.
 * Throws RangeError for a payload over MAX_DOWNLOAD_BYTES, before anything is created.
 */
export function downloadBlob(name: string, data: Uint8Array | string, mime: string): void {
  if (length(data) > MAX_DOWNLOAD_BYTES) throw new RangeError("That file is too large to download");
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement("a");
  try {
    a.href = url;
    a.download = sanitizeFileName(name, "download");
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Save a Blob as `name` without copying it: same anchor and object URL as `downloadBlob`, for results that already are a
 * Blob (an export from the worker). The name is sanitised. Throws RangeError for a Blob over MAX_DOWNLOAD_BYTES.
 */
export function downloadFile(name: string, blob: Blob): void {
  if (blob.size > MAX_DOWNLOAD_BYTES) throw new RangeError("That file is too large to download");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  try {
    a.href = url;
    a.download = sanitizeFileName(name, "download");
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
