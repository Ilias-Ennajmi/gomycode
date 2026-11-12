"use client";

import { useEffect, useRef, useState } from "react";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { fitRect, type Camera } from "@/lib/engine/geometry/camera";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";
import { processImage, type ProcessedImage } from "@/lib/assets/pipeline";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { VariantName } from "@/lib/assets/variants";
import { makeImageBoard } from "@/bench/fixtures/make-board";

/** What the runner (bench/run.ts) drives. */
export interface BenchApi {
  /** Resolves once the 48 base images are processed, the board is mounted and the first fit is on screen. */
  ready: Promise<void>;
  setCamera(c: Camera): void;
  fitAll(): void;
  /** Decoded bytes of the bitmaps the image layer currently holds. */
  residentBytes(): number;
  stats(): { mounted: number; residentBytes: number; variantCounts: Record<string, number> };
  objectCount(): number;
  /** Ids of up to `n` images that are on screen now. */
  visibleIds(n: number): string[];
}

declare global {
  interface Window {
    __bench?: BenchApi;
    __atelier?: unknown;
  }
}

/** A cheap but detailed stand-in photograph: gradient, grid and rings (so every variant has something to resolve). */
async function drawBase(w: number, h: number, i: number): Promise<Blob> {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d")!;
  const hue = (i * 47) % 360;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue} 70% 55%)`);
  grad.addColorStop(1, `hsl(${(hue + 90) % 360} 60% 35%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = Math.max(1, w / 1500);
  for (let x = 0; x < w; x += w / 40) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = Math.max(1, w / 800);
  for (let r = Math.min(w, h) / 12; r < Math.min(w, h) / 2; r += Math.min(w, h) / 12) {
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  return c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
}

/**
 * The resolver of the bench board: every object has its own asset id (`bench:{base}:{i}`) and gets its own blob URL for
 * each variant, so the browser cannot share one decoded bitmap between objects.
 */
class BenchResolver implements AssetResolver {
  private readonly urls = new Map<string, string>();
  constructor(private readonly bases: ProcessedImage[]) {}

  private base(assetId: string): ProcessedImage | null {
    const m = /^bench:(\d+):/.exec(assetId);
    return m ? (this.bases[Number(m[1])] ?? null) : null;
  }

  url(assetId: string, variant: VariantName | "original"): string | null {
    const b = this.base(assetId);
    if (!b) return null;
    const chain: Array<VariantName | "original"> = variant === "original" ? ["original"] : variant === "w1024" ? ["w1024", "original"] : [variant, "w1024", "original"];
    for (const v of chain) {
      const blob = v === "original" ? b.original : b.variants[v];
      if (!blob) continue;
      const key = `${assetId}/${v}`;
      let url = this.urls.get(key);
      if (!url) {
        url = URL.createObjectURL(blob);
        this.urls.set(key, url);
      }
      return url;
    }
    return null;
  }

  available(assetId: string) {
    const b = this.base(assetId);
    return b ? { variants: (Object.keys(b.variants) as VariantName[]).sort((x, y) => Number(x.slice(1)) - Number(y.slice(1))), width: b.width, height: b.height } : null;
  }
}

type Built = { doc: BoardDoc; index: SpatialIndex; resolver: BenchResolver };

export function BenchClient() {
  const [status, setStatus] = useState("Preparing the benchmark board...");
  const [built, setBuilt] = useState<Built | null>(null);
  const handle = useRef<CanvasHandle | null>(null);
  const resolveReady = useRef<() => void>(() => {});

  // The runner awaits `__bench.ready`; it is published before the (slow) preparation starts.
  useEffect(() => {
    const ready = new Promise<void>((resolve) => {
      resolveReady.current = resolve;
    });
    const api: BenchApi = {
      ready,
      setCamera: (c) => handle.current?.setCamera(c),
      fitAll: () => {
        const canvas = handle.current;
        if (!canvas) return;
        const box = unionRects(canvas.doc.all().map(boundsOf));
        if (box) canvas.setCamera(fitRect(box, canvas.viewport(), 64, 1));
      },
      residentBytes: () => handle.current?.images.stats().residentBytes ?? 0,
      stats: () => handle.current?.images.stats() ?? { mounted: 0, residentBytes: 0, variantCounts: {} },
      objectCount: () => handle.current?.doc.all().length ?? 0,
      visibleIds: (n) => {
        const canvas = handle.current;
        if (!canvas) return [];
        const vp = canvas.viewport();
        const c = canvas.getCamera();
        return canvas.index
          .visible(c, vp, 0)
          .filter((id) => canvas.doc.get(id)?.type === "image")
          .slice(0, n);
      },
    };
    window.__bench = api;
    return () => {
      delete window.__bench;
      delete window.__atelier;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { objects, baseImages } = makeImageBoard(1000, 1);
      const bases: ProcessedImage[] = [];
      for (let i = 0; i < baseImages.length; i++) {
        if (cancelled) return;
        setStatus(`Making source image ${i + 1} of ${baseImages.length}...`);
        const b = baseImages[i];
        bases.push(await processImage(new File([await drawBase(b.w, b.h, i)], `base-${i}.jpg`, { type: "image/jpeg" })));
      }
      const doc = new BoardDoc();
      doc.meta.title = "Bench 1000 images";
      doc.createMany(objects);
      if (cancelled) return;
      setBuilt({ doc, index: new SpatialIndex(doc), resolver: new BenchResolver(bases) });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the canvas exists: hand the runner the same hooks the e2e harness uses, fit everything, and say "ready".
  useEffect(() => {
    if (!built) return;
    let raf = 0;
    let tries = 0;
    const wait = () => {
      const canvas = handle.current;
      if (!canvas) {
        raf = requestAnimationFrame(wait);
        return;
      }
      canvas.container().id ||= "board-canvas";
      window.__atelier = { doc: built.doc, index: built.index, canvas };
      window.__bench?.fitAll();
      // Give the image layer a few frames to mount and settle on the first view before the clock starts.
      const settle = () => {
        if (++tries < 30) raf = requestAnimationFrame(settle);
        else resolveReady.current();
      };
      settle();
    };
    wait();
    return () => cancelAnimationFrame(raf);
  }, [built]);

  if (!built) return <p style={{ position: "fixed", inset: 0, margin: 0, padding: 24, color: "var(--color-ink)", background: "var(--color-bg)" }}>{status}</p>;
  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--color-bg)" }}>
      <CanvasView ref={handle} doc={built.doc} index={built.index} assets={built.resolver} cameraShortcuts={false} />
    </main>
  );
}
