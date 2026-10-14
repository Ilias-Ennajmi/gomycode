"use client";

import { motion } from "framer-motion";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { cx } from "./cx";
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
  reveal,
  src,
  label,
  onClick,
  className,
}: ThumbnailProps) {
  const motionOK = useMotionOK();
  const words = keyIdea?.split(/\s+/) ?? [];
  const animate = reveal && motionOK;

  const body = (
    <>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs; next/image adds nothing here
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        loading && <span aria-hidden className="shimmer absolute inset-0" />
      )}
      {/* 3px Space top edge (spec: "thumbnail top edge"); a hairline, not a spacing step. */}
      {spaceColor && <span aria-hidden className={cx("absolute inset-x-0 top-0 z-10 h-0.75", SPACE_BG[spaceColor])} />}
      {unwatched && (
        <span className="absolute left-2 top-3 z-10 h-3 w-3 rounded-full" style={{ background: "var(--ink-light)" }}>
          <span className="sr-only">Unwatched</span>
        </span>
      )}
      {duration !== undefined && (
        <span className="absolute right-2 top-2 z-10 rounded-sm bg-scrim px-2 text-caption" style={INK_LIGHT}>
          {formatDuration(duration)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 z-10 flex min-h-1/2 flex-col justify-end p-3" style={BOTTOM_SCRIM}>
        {loading ? (
          <span aria-hidden className="flex flex-col gap-2">
            <span className="shimmer h-3 w-full rounded-sm opacity-60" />
            <span className="shimmer h-3 w-2/3 rounded-sm opacity-60" />
          </span>
        ) : (
          keyIdea && (
            <span className="line-clamp-4 text-left text-caption" style={INK_LIGHT}>
              {animate
                ? words.map((w, i) => (
                    <motion.span
                      key={`${i}-${w}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.06, duration: 0.25 }}
                    >
                      {w}{" "}
                    </motion.span>
                  ))
                : keyIdea}
            </span>
          )
        )}
      </span>
      {loading && <span className="sr-only">Processing</span>}
    </>
  );

  const base = cx("relative block aspect-9/16 w-full overflow-hidden rounded-card bg-raised", className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={cx(base, "active:scale-95 transition-transform duration-[var(--dur-fast)]")}>
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
