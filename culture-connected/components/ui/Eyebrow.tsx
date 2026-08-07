import type { ReactNode } from 'react';
import { DiagonalStripe } from './DiagonalStripe';

/**
 * Wraps an eyebrow label with a diagonal-stripe accent mark and bracket
 * styling. Deliberately has no font/color/size of its own — it inherits
 * whatever font-mono/text-red/tracking classes the caller already applies
 * to the wrapping element, so every existing eyebrow spacing/animation stays
 * untouched and this is a pure presentation swap.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[10px]">
      <DiagonalStripe className="h-[8px] w-[15px] flex-none" />
      <span>[{children}]</span>
    </span>
  );
}
