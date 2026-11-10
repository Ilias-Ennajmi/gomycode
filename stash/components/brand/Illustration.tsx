import { cx } from "@/components/ui/cx";
import { MARK_CARDS } from "./paths";

/*
 * Spot illustrations in the brand language: chunky rounded cards, stacked and tilted,
 * in Space colours, with the lime S where Stash itself appears. Inline SVG, tokens only,
 * decorative (aria-hidden): the text next to them carries the meaning.
 */

export type IllustrationName = "share" | "empty" | "done" | "search" | "offline" | "learn" | "error" | "places";

const V = (name: string) => `var(--${name})`;

function Card({ x, y, w = 56, h = 76, r = 14, rot = 0, fill, stroke, children }: { x: number; y: number; w?: number; h?: number; r?: number; rot?: number; fill: string; stroke?: string; children?: React.ReactNode }) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={stroke ? 3 : undefined} />
      {children}
    </g>
  );
}

function Lines({ x, y, w, color, n = 2 }: { x: number; y: number; w: number; color: string; n?: number }) {
  return (
    <g fill={color}>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x} y={y + i * 9} width={i === n - 1 ? w * 0.6 : w} height={5} rx={2.5} />
      ))}
    </g>
  );
}

function StashTile({ x, y, s = 44 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s / 108})`}>
      <rect width="108" height="108" rx="28" fill={V("brand-ink")} />
      <g fill={V("brand-lime")}>
        {MARK_CARDS.map((c, i) => (
          <path key={i} d={c.d} opacity={c.opacity} />
        ))}
      </g>
    </g>
  );
}

function Sparkle({ x, y, s = 1, color }: { x: number; y: number; s?: number; color: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-9C1.2-3 3-1.2 9 0 3 1.2 1.2 3 0 9-1.2 3-3 1.2-9 0-3-1.2-1.2-3 0-9z" fill={color} />;
}

const SCENES: Record<IllustrationName, React.ReactNode> = {
  // A reel card travelling into the Stash tile.
  share: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <Card x={34} y={30} rot={-10} fill={V("space-violet")}>
        <path d="M58 60l12 8-12 8z" fill={V("on-space")} />
      </Card>
      <path d="M96 62c10-10 22-12 32-6" fill="none" stroke={V("text-primary")} strokeWidth="4" strokeLinecap="round" strokeDasharray="1 9" />
      <path d="M124 48l8 8-11 3" fill="none" stroke={V("text-primary")} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <StashTile x={120} y={64} s={52} />
      <Sparkle x={156} y={44} s={0.9} color={V("space-amber")} />
    </>
  ),
  // An empty, dashed stack waiting for its first card.
  empty: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <Card x={58} y={34} rot={-12} fill="none" stroke={V("border")} />
      <Card x={86} y={30} rot={8} fill="none" stroke={V("border")} />
      <Card x={72} y={42} fill={V("surface")} stroke={V("text-primary")}>
        <path d="M100 70v20M90 80h20" stroke={V("text-primary")} strokeWidth="4" strokeLinecap="round" />
      </Card>
      <Sparkle x={150} y={40} color={V("space-teal")} />
    </>
  ),
  // A neat stack with a check: all caught up.
  done: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <Card x={62} y={40} rot={-14} fill={V("space-teal")} />
      <Card x={82} y={36} rot={10} fill={V("space-amber")} />
      <Card x={72} y={42} fill={V("space-violet")}>
        <path d="M86 82l9 9 18-20" fill="none" stroke={V("on-space")} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </Card>
      <Sparkle x={146} y={42} color={V("space-rose")} />
      <Sparkle x={52} y={110} s={0.7} color={V("space-blue")} />
    </>
  ),
  // A card under a lens: searching what was said.
  search: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <Card x={60} y={34} rot={-6} fill={V("surface")} stroke={V("text-primary")}>
        <Lines x={70} y={52} w={34} color={V("text-tertiary")} n={4} />
      </Card>
      <circle cx="118" cy="86" r="20" fill={V("space-blue-tint")} stroke={V("text-primary")} strokeWidth="5" />
      <path d="M133 101l14 14" stroke={V("text-primary")} strokeWidth="7" strokeLinecap="round" />
    </>
  ),
  // Cards safely stacked while the cloud is away.
  offline: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <path d="M70 52a16 16 0 0 1 31-6 13 13 0 0 1 21 11 11 11 0 0 1-2 22H74a14 14 0 0 1-4-27z" fill={V("surface")} stroke={V("text-primary")} strokeWidth="4" />
      <path d="M68 40l70 52" stroke={V("text-primary")} strokeWidth="5" strokeLinecap="round" />
      <Card x={80} y={84} w={46} h={30} r={10} fill={V("space-sand")} />
      <Card x={74} y={96} w={58} h={30} r={10} fill={V("space-cyan")} />
    </>
  ),
  // A question card flipping to its answer.
  learn: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <Card x={52} y={38} rot={-10} fill={V("space-green")}>
        <text x="80" y="86" textAnchor="middle" fontFamily="var(--type-family-display)" fontWeight="800" fontSize="34" fill={V("on-space")}>?</text>
      </Card>
      <Card x={94} y={36} rot={8} fill={V("surface")} stroke={V("text-primary")}>
        <Lines x={104} y={58} w={34} color={V("text-tertiary")} n={3} />
      </Card>
      <Sparkle x={150} y={36} color={V("space-amber")} />
    </>
  ),
  // A card that tipped over: something went wrong, nothing is lost.
  error: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <Card x={60} y={44} rot={-24} fill={V("space-rose")}>
        <path d="M88 66v18" stroke={V("on-space")} strokeWidth="6" strokeLinecap="round" />
        <circle cx="88" cy="94" r="3.5" fill={V("on-space")} />
      </Card>
      <Card x={100} y={52} rot={12} w={50} h={64} fill={V("surface")} stroke={V("text-primary")} />
    </>
  ),
  // A pin on a folded map.
  places: (
    <>
      <circle cx="100" cy="74" r="58" fill={V("surface-raised")} />
      <path d="M52 50l30-10 34 10 32-10v64l-32 10-34-10-30 10z" fill={V("space-teal-tint")} stroke={V("text-primary")} strokeWidth="4" strokeLinejoin="round" />
      <path d="M82 40v64M116 50v64" stroke={V("text-primary")} strokeWidth="3" opacity="0.35" />
      <path d="M100 96c-14-16-18-24-18-32a18 18 0 0 1 36 0c0 8-4 16-18 32z" fill={V("space-teal")} />
      <circle cx="100" cy="64" r="7" fill={V("on-space")} />
    </>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <svg viewBox="22 6 156 136" aria-hidden className={cx("h-32 w-auto", className)}>
      {SCENES[name]}
    </svg>
  );
}
