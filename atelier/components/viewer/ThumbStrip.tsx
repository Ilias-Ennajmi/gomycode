"use client";

import { useEffect, useRef } from "react";
import type { ViewerBoard } from "@/lib/viewer/viewer-types";

/** The slides as a row of small pictures. The current one is marked with aria-current and scrolled into view. */
export function ThumbStrip({ board, index, onSelect }: { board: ViewerBoard; index: number; onSelect: (i: number) => void }) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // `inline: center` on the strip only; never scroll the page itself.
    const el = current.current;
    const strip = el?.parentElement?.parentElement;
    if (!el || !strip || typeof strip.scrollTo !== "function") return;
    const target = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target) });
  }, [index]);
  if (board.slides.length < 2) return null;
  return (
    <nav className="vw-strip" aria-label="Slides">
      <ul>
        {board.slides.map((s, i) => {
          const changed = board.changed?.byFrame[s.id];
          const n = changed ? changed.added + changed.changed : 0;
          return (
            <li key={s.id}>
              <button
                ref={i === index ? current : undefined}
                type="button"
                className="vw-thumb"
                aria-current={i === index ? "true" : undefined}
                aria-label={`Slide ${i + 1}: ${s.name}${n > 0 ? `, ${n} updated since your last visit` : ""}`}
                onClick={() => onSelect(i)}
                style={{ aspectRatio: `${Math.max(s.w, 1)} / ${Math.max(s.h, 1)}` }}
              >
                {s.previewW480 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.previewW480} alt="" width={Math.round(s.w)} height={Math.round(s.h)} loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                ) : (
                  <span className="vw-thumb-num" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
                {n > 0 ? (
                  <span className="vw-dot" aria-hidden="true">
                    {n}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
