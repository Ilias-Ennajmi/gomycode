import { cx } from "./cx";

export type SkeletonShape = "line" | "block" | "circle" | "thumb";

export type SkeletonProps = {
  shape?: SkeletonShape;
  className?: string;
};

const SHAPE: Record<SkeletonShape, string> = {
  line: "h-4 w-full rounded-sm",
  block: "h-24 w-full rounded-card",
  circle: "h-12 w-12 rounded-full",
  thumb: "aspect-9/16 w-full rounded-card",
};

/** Shimmer placeholder shaped like the real content. Static when reduce motion is on (CSS). */
export function Skeleton({ shape = "line", className }: SkeletonProps) {
  return <span aria-hidden className={cx("shimmer block", SHAPE[shape], className)} />;
}
