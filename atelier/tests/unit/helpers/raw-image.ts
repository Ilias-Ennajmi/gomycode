// Synthetic RGBA images for the colour-analysis tests.
import type { RawImage } from "@/lib/engine/color/extract";

export type Rgba = [number, number, number, number?];

export function makeImage(width: number, height: number, pixel: (x: number, y: number) => Rgba): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

export const solid = (w: number, h: number, c: Rgba): RawImage => makeImage(w, h, () => c);

/** Vertical bands of the given colours; `shares` are fractions of the width (summing to 1). */
export function bands(w: number, h: number, colours: Rgba[], shares: number[]): RawImage {
  const edges: number[] = [];
  let acc = 0;
  for (const s of shares) edges.push((acc += s) * w);
  return makeImage(w, h, (x) => {
    for (let i = 0; i < colours.length; i++) if (x < edges[i] - 1e-9) return colours[i];
    return colours[colours.length - 1];
  });
}

export const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Deterministic noise in [-amp, amp] (JPEG-like block noise stand-in). */
export function noisy(img: RawImage, amp: number, seed = 1): RawImage {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    const n = Math.round(rnd() * amp);
    out[i] += n;
    out[i + 1] += n;
    out[i + 2] += n;
  }
  return { data: out, width: img.width, height: img.height };
}

/** Nearest-neighbour resize. */
export function resizeNearest(img: RawImage, w: number, h: number): RawImage {
  return makeImage(w, h, (x, y) => {
    const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / h));
    const i = (sy * img.width + sx) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  });
}

/** Bilinear-ish box resize (area average), standing in for the browser's smooth scaling. */
export function resizeBox(img: RawImage, w: number, h: number): RawImage {
  const sx = img.width / w;
  const sy = img.height / h;
  return makeImage(w, h, (x, y) => {
    const x0 = Math.floor(x * sx);
    const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let yy = y0; yy < Math.min(y1, img.height); yy++) {
      for (let xx = x0; xx < Math.min(x1, img.width); xx++) {
        const i = (yy * img.width + xx) * 4;
        r += img.data[i];
        g += img.data[i + 1];
        b += img.data[i + 2];
        n++;
      }
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}
