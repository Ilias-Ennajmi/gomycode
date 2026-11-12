// Numeric stacking for objects, so images (drawn by an ImageLayer) and the other objects (drawn by React) share one
// stacking context in the right order. Pure: no DOM.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Room between two neighbouring bases for images that share one (images in one frame, equal keys). */
export const Z_STEP = 64;

/**
 * Order-preserving number for the first four characters of a fractional index (base 62). Keys that differ only after
 * the fourth character share a value; DOM order then decides among objects, and the image layer ranks its own.
 */
export function zBase(index: string): number {
  let v = 0;
  for (let i = 0; i < 4; i++) {
    const d = i < index.length ? DIGITS.indexOf(index[i]) : 0;
    v = v * 62 + (d < 0 ? 0 : d);
  }
  return v;
}

/** CSS z-index of an object whose z-order key is `index`. At most 62^4 * 64, under the 32-bit limit. */
export function nodeZ(index: string): number {
  return zBase(index) * Z_STEP;
}
