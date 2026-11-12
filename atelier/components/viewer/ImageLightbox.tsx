"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { downloadName, downloadUrl } from "@/lib/viewer/download";
import type { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import type { ViewerObject } from "@/lib/viewer/viewer-types";
import { ModalShell } from "./ModalShell";
import { ImageNode, NodeCtx, type NodeContext } from "./nodes";
import { ZoomPane } from "./ZoomPane";

type Img = Extract<ViewerObject, { type: "image" }>;

/**
 * One picture, as large as the screen allows: pinch, wheel or + to zoom into the full-resolution file (the original above
 * 2,048 device pixels), left/right for the other pictures of the same frame. `footer` is where the review controls sit.
 */
export function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
  resolver,
  credits,
  allowDownload,
  footer,
  title,
}: {
  images: Img[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  resolver: ViewerResolver;
  credits: boolean;
  allowDownload: boolean;
  footer?: (img: Img) => ReactNode;
  title: string;
}) {
  const img = images[index];
  const n = images.length;
  const [status, setStatus] = useState("");
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const byId = useMemo(() => new Map<string, ViewerObject>(), []);
  const ctx = useMemo<NodeContext>(() => ({ resolver, byId, underlay: false, credits, dpr, tracker: null }), [resolver, byId, credits, dpr]);

  const go = (d: 1 | -1) => onIndex(Math.min(n - 1, Math.max(0, index + d)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("textarea, input")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, n]);

  if (!img) return null;
  const original = resolver.url(img.assetId, "original");

  return (
    <ModalShell label={`${title}: image ${index + 1} of ${n}`} onClose={onClose} variant="full" className="vw-lightbox">
      <header className="vw-lb-top">
        <button type="button" className="vw-btn" onClick={onClose} data-autofocus="">
          <X aria-hidden="true" size={18} strokeWidth={1.75} />
          Close
        </button>
        <p className="vw-lb-count" aria-live="polite">
          {n > 1 ? `${index + 1} of ${n}` : "Image"}
        </p>
        {allowDownload && original ? (
          <button
            type="button"
            className="vw-btn"
            onClick={async () => {
              const r = await downloadUrl(original, downloadName(img.title || "image", original));
              setStatus(r === "saved" ? "Saved to your device." : "Opened in a new tab.");
            }}
          >
            <Download aria-hidden="true" size={18} strokeWidth={1.75} />
            Download original
          </button>
        ) : (
          <span />
        )}
      </header>
      <div className="vw-lb-stage">
        <ZoomPane key={img.id} className="vw-lb-zoom" contentW={Math.max(img.w, 1)} contentH={Math.max(img.h, 1)} label={img.title || `Image ${index + 1}`} onSwipe={(d) => go(d === "next" ? 1 : -1)}>
          {({ z, boxPx, moving }) => (
            <NodeCtx.Provider value={ctx}>
              <ImageNode obj={{ ...img, x: 0, y: 0, rotation: 0 }} scale={(boxPx / Math.max(img.w, 1)) * z} gesture={moving} />
            </NodeCtx.Provider>
          )}
        </ZoomPane>
        {n > 1 ? (
          <>
            {index > 0 ? (
              <button type="button" className="vw-icon-btn vw-lb-prev" aria-label="Previous image" onClick={() => go(-1)}>
                <ChevronLeft aria-hidden="true" size={22} strokeWidth={1.75} />
              </button>
            ) : null}
            {index < n - 1 ? (
              <button type="button" className="vw-icon-btn vw-lb-next" aria-label="Next image" onClick={() => go(1)}>
                <ChevronRight aria-hidden="true" size={22} strokeWidth={1.75} />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <footer className="vw-lb-foot">
        {footer?.(img)}
        <p role="status" className="vw-sr">
          {status}
        </p>
      </footer>
    </ModalShell>
  );
}
