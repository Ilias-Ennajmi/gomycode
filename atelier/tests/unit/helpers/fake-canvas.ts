// A recording 2D context and canvas for the export writers: every method call and property write is logged in order.
export type Call = [string, ...unknown[]];

export function recordingContext(opts: { opaque?: boolean } = {}): { ctx: CanvasRenderingContext2D; log: Call[] } {
  const log: Call[] = [];
  const props: Record<string, unknown> = { filter: "none", globalAlpha: 1, fillStyle: "#000000", strokeStyle: "#000000", font: "10px sans-serif" };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, name: string) {
      if (name in props) return props[name];
      if (name === "measureText") return (text: string) => ({ width: String(text).length * 6 });
      if (name === "getImageData") {
        return (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          if (opts.opaque) data.fill(255);
          return { data, width: w, height: h };
        };
      }
      return (...args: unknown[]) => {
        log.push([name, ...args]);
        return undefined;
      };
    },
    set(_t, name: string, value) {
      props[name] = value;
      log.push([`set:${name}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

export function fakeCanvasFactory(ctx: CanvasRenderingContext2D, record?: { sizes: [number, number][]; blobs: { type?: string; quality?: number }[] }, bytes: Uint8Array = new Uint8Array([1, 2, 3])) {
  return (w: number, h: number) => {
    record?.sizes.push([w, h]);
    return {
      width: w,
      height: h,
      getContext: () => ctx,
      convertToBlob: async (o?: { type?: string; quality?: number }) => {
        record?.blobs.push(o ?? {});
        return new Blob([bytes as BlobPart], { type: o?.type ?? "image/png" });
      },
    } as unknown as OffscreenCanvas;
  };
}

export const fakeBitmap = (w = 100, h = 100): ImageBitmap => ({ width: w, height: h, close() {} }) as unknown as ImageBitmap;
