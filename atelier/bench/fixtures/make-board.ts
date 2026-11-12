// The 1,000-image board of the performance gate. Deterministic: the same seed gives the same board, so numbers compare.
import { defaultsFor } from "../../lib/engine/model/defaults";
import { keyBetween } from "../../lib/engine/model/index-order";
import type { ImageObj, NewObject } from "../../lib/engine/model/types";

/** A small, seedable generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BASE_IMAGE_COUNT = 48;
const COLUMNS = 40;
const PITCH = 480;

/**
 * `n` image objects in a jittered grid about 40 columns wide, drawn from 48 source images of varied aspect (9:16 to 16:9)
 * and size (1,600 to 4,000 px on the long side). Object `i` shows base image `i % 48`; its asset id is
 * `bench:{baseIndex}:{i}`, unique per object, so a page can give every object its own URL (nothing shares a decoded
 * bitmap). Objects are 180 to 420 canvas px on their long side.
 */
export function makeImageBoard(n = 1000, seed = 1): { objects: NewObject<ImageObj>[]; baseImages: { id: string; w: number; h: number }[] } {
  const rand = rng(seed);
  const baseImages = Array.from({ length: BASE_IMAGE_COUNT }, (_, i) => {
    const longest = Math.round(1600 + rand() * 2400);
    const aspect = 9 / 16 + rand() * (16 / 9 - 9 / 16); // width / height
    const landscape = aspect >= 1;
    const w = landscape ? longest : Math.round(longest * aspect);
    const h = landscape ? Math.round(longest / aspect) : longest;
    return { id: `base-${i}`, w, h };
  });

  const objects: NewObject<ImageObj>[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const base = baseImages[i % BASE_IMAGE_COUNT];
    const long = 180 + Math.round(rand() * 240);
    const landscape = base.w >= base.h;
    const w = landscape ? long : Math.max(1, Math.round((long * base.w) / base.h));
    const h = landscape ? Math.max(1, Math.round((long * base.h) / base.w)) : long;
    const x = (i % COLUMNS) * PITCH + Math.round((rand() - 0.5) * 60);
    const y = Math.floor(i / COLUMNS) * PITCH + Math.round((rand() - 0.5) * 60);
    const index = keyBetween(prev, null);
    prev = index;
    objects.push({ ...(defaultsFor("image") as ImageObj), id: `bench-${i}`, index, x, y, w, h, assetId: `bench:${i % BASE_IMAGE_COUNT}:${i}` } as NewObject<ImageObj>);
  }
  return { objects, baseImages };
}
