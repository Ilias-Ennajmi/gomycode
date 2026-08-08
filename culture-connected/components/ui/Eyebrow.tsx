import type { ReactNode } from 'react';

/**
 * Wraps an eyebrow label as a rotated rubber-stamp tag (bordered rect, small
 * dot mark, -2deg tilt). Deliberately has no font/color/size of its own — it
 * inherits whatever font-mono/text-red/tracking classes the caller already
 * applies to the wrapping element, so every existing eyebrow spacing stays
 * untouched and this is a pure presentation swap.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex -rotate-2 items-center gap-[8px] rounded-[4px] border-[1.5px] border-current px-[11px] py-[6px]">
      <span className="h-[5px] w-[5px] flex-none rounded-full bg-current" />
      {children}
    </span>
  );
}
