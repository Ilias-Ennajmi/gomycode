"use client";

/*
 * Screenshots shared to Stash (POST /share/receive, multipart). The service worker
 * (or, before it is installed, the /share/receive route's hand-off page) puts the
 * image in this Cache under /share/inbox/<id> and opens /share?shared-image=<id>.
 * Nothing is stored on the server without an identity: the save sheet takes the
 * image from here and queues it in the outbox, which uploads it once it can.
 * Keep the names in sync with public/sw.js and app/share/receive/route.ts.
 */

export const SHARE_INBOX = "stash-share-inbox";
export const inboxKey = (id: string) => `/share/inbox/${id}`;

/** Takes (reads and removes) a shared image. Null when it's gone (already saved, or storage cleared). */
export async function takeSharedImage(id: string): Promise<Blob | null> {
  if (!/^[a-z0-9-]{8,64}$/i.test(id) || typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARE_INBOX);
    const hit = await cache.match(inboxKey(id));
    if (!hit) return null;
    const blob = await hit.blob();
    await cache.delete(inboxKey(id));
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

/** Fits the long side in `max` px. Pure, for the tests. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max || long === 0) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

const LIMIT = 1_900_000; // the thumbnails bucket takes up to 2 MB

/**
 * Screenshots become a JPEG of at most 1600 px on the long side (sharp enough for
 * Claude to read the caption, small enough for a phone upload and the 2 MB bucket).
 * Falls back to the original file when the browser can't decode it but it already fits.
 */
export async function compressScreenshot(blob: Blob): Promise<Blob> {
  const attempts: Array<[number, number]> = [
    [1600, 0.85],
    [1280, 0.72],
    [1024, 0.6],
  ];
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      for (const [max, quality] of attempts) {
        const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
        const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (out && out.size <= LIMIT) return out;
      }
    } finally {
      bitmap.close();
    }
  } catch {
    // Not decodable here: use the file as it is if it fits.
  }
  if (blob.type === "image/jpeg" && blob.size <= LIMIT) return blob;
  throw new Error("This image can't be read on this phone.");
}
