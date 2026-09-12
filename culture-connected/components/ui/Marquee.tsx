import type { ReactNode } from 'react';

interface MarqueeProps {
  row: ReactNode;
  durationClass: 'animate-marq-32' | 'animate-marq-30';
  maskClass?: string;
  className?: string;
}

/** Duplicates `row` once for a seamless `translateX(-50%)` loop. Paused via prefers-reduced-motion in globals.css. */
export function Marquee({ row, durationClass, maskClass = 'marquee-mask', className = '' }: MarqueeProps) {
  return (
    <div className={`overflow-hidden ${maskClass} ${className}`}>
      <div className={`flex w-max ${durationClass}`}>
        <div className="flex">{row}</div>
        <div className="flex" aria-hidden="true">
          {row}
        </div>
      </div>
    </div>
  );
}
