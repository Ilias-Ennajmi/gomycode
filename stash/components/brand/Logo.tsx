import { cx } from "@/components/ui/cx";
import { MARK_CARDS, WORDMARK } from "./paths";

export type LogoProps = {
  /** tile: the app icon (mark on a deep-ink tile). mark: the bare S. lockup: tile + "stash". */
  variant?: "tile" | "mark" | "lockup";
  /** Height in px. */
  size?: number;
  /** Cards stack in one by one (onboarding, splash). Durations are motion tokens, so reduce motion stops it. */
  animate?: boolean;
  /** Accessible name; omit when the logo sits next to the word "Stash". */
  title?: string;
  className?: string;
};

const LIME = "var(--brand-lime)";
const INK = "var(--brand-ink)";

function Cards({ animate }: { animate?: boolean }) {
  return (
    <g fill={LIME}>
      {MARK_CARDS.map((c, i) => (
        // Opacity sits on the group: the entrance animation drives the path's own opacity.
        <g key={i} opacity={c.opacity}>
          <path
            d={c.d}
            className={animate ? "rise-in" : undefined}
            // Bottom card lands first, the stack builds upwards.
            style={animate ? { animationDelay: `calc(var(--dur-fast) * ${(MARK_CARDS.length - 1 - i) * 0.6})`, transformBox: "fill-box", transformOrigin: "center" } : undefined}
          />
        </g>
      ))}
    </g>
  );
}

/** The Stash mark: a rounded "S" built from three stacked cards, lime on deep ink. */
export function Logo({ variant = "tile", size = 40, animate, title, className }: LogoProps) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  if (variant === "mark") {
    return (
      <svg viewBox="25 21 58 66.5" height={size} width={(size * 58) / 66.5} className={className} {...a11y}>
        <Cards animate={animate} />
      </svg>
    );
  }
  const tile = (
    <>
      <rect width="108" height="108" rx="26" fill={INK} />
      <Cards animate={animate} />
    </>
  );
  if (variant === "tile") {
    return (
      <svg viewBox="0 0 108 108" height={size} width={size} className={className} {...a11y}>
        {tile}
      </svg>
    );
  }
  // Lockup: tile height 108 units, text 75 units tall, gap 27 (same ratios as public/brand/lockup-*.svg).
  const k = 75 / WORDMARK.height;
  const width = 108 + 27 + WORDMARK.width * k;
  return (
    <svg viewBox={`0 0 ${width.toFixed(1)} 108`} height={size} width={(size * width) / 108} className={cx("text-fg", className)} {...a11y}>
      {tile}
      <path fill="currentColor" transform={`translate(135 ${(108 - 75) / 2 + 1.5}) scale(${k.toFixed(4)})`} d={WORDMARK.d} />
    </svg>
  );
}
