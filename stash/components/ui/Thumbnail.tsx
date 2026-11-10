"use client";

import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";
import { WordReveal } from "./WordReveal";
import { SPACE_BG, type SpaceColor } from "./space";

export type ThumbnailProps = {
  spaceColor?: SpaceColor;
  /** Seconds. */
  duration?: number;
  unwatched?: boolean;
  /** The AI key idea, shown over the bottom on a scrim gradient. */
  keyIdea?: string;
  /** Processing: shimmer instead of the key idea. */
  loading?: boolean;
  /** Processing, live: the step's name and how far along it is (1-based of `total`; 0 = waiting). */
  progress?: { label: string; step: number; total: number };
  /** Fade the key idea in word by word (use when processing just finished). */
  reveal?: boolean;
  /** Image source when one exists; otherwise a raised placeholder. */
  src?: string;
  /** Accessible name when interactive. */
  label?: string;
  onClick?: () => void;
  className?: string;
};

// Overlays sit on a dark scrim in every theme, so their text uses the light ink token.
const INK_LIGHT = { color: "var(--ink-light)" } as const;
const BOTTOM_SCRIM = {
  background: "linear-gradient(to top, color-mix(in srgb, var(--scrim-base) 85%, transparent), transparent)",
} as const;

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function Thumbnail({
  spaceColor,
  duration,
  unwatched,
  keyIdea,
  loading,
  progress,
  reveal,
  src,
  label,
  onClick,
  className,
}: ThumbnailProps) {
  const motionOK = useMotionOK();
  const animate = reveal && motionOK;

  const body = (
    <>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs; next/image adds nothing here
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        loading && <span aria-hidden className="shimmer absolute inset-0" />
      )}
      {/* Space top edge (spec: "thumbnail top edge"), token --edge. */}
      {spaceColor && <span aria-hidden className={cx("absolute inset-x-0 top-0 z-10 h-[var(--edge)]", SPACE_BG[spaceColor])} />}
      {unwatched && (
        <span className="absolute left-3 top-3.5 z-10 h-3 w-3 rounded-full ring-2 ring-[var(--scrim-base)]/40" style={{ background: "var(--ink-light)" }}>
          <span className="sr-only">Unwatched</span>
        </span>
      )}
      {duration !== undefined && (
        <span className="absolute right-2 top-2.5 z-10 rounded-full bg-scrim px-2 text-caption tabular-nums" style={INK_LIGHT}>
          {formatDuration(duration)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 z-10 flex min-h-1/2 flex-col justify-end p-3" style={BOTTOM_SCRIM}>
        {loading && progress ? (
          <span className="flex flex-col gap-2 text-left" style={INK_LIGHT}>
            {/* The title arrives with the first update, long before the summary. */}
            {keyIdea && <span className="line-clamp-2 text-label">{keyIdea}</span>}
            <span className="flex items-center gap-2 text-caption">
              <span aria-hidden className="flex flex-1 gap-1">
                {Array.from({ length: progress.total }, (_, i) => (
                  <span
                    key={i}
                    className={cx("h-1.5 flex-1 rounded-full", i + 1 === progress.step && "shimmer")}
                    style={{ background: i < progress.step ? "var(--ink-light)" : "color-mix(in srgb, var(--ink-light) 30%, transparent)" }}
                  />
                ))}
              </span>
              <span className="shrink-0">{progress.label}</span>
            </span>
          </span>
        ) : loading ? (
          <span aria-hidden className="flex flex-col gap-2">
            <span className="shimmer h-3 w-full rounded-sm opacity-60" />
            <span className="shimmer h-3 w-2/3 rounded-sm opacity-60" />
          </span>
        ) : (
          keyIdea && (
            <span className="line-clamp-4 text-left text-label" style={INK_LIGHT}>
              <WordReveal text={keyIdea} animate={Boolean(animate)} />
            </span>
          )
        )}
      </span>
      {loading && !progress && <span className="sr-only">Processing</span>}
    </>
  );

  const base = cx("relative block aspect-9/16 w-full overflow-hidden rounded-lg bg-raised", className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={cx(base, "press")}>
        {body}
      </button>
    );
  }
  return (
    <div className={base} aria-label={label} role={label ? "img" : undefined}>
      {body}
    </div>
  );
}
