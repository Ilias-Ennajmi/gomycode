'use client';

import type { ElementType, ReactNode } from 'react';
import { Reveal } from './Reveal';

interface HoverHeadingProps {
  children: ReactNode;
  className?: string;
  index?: number;
  as?: ElementType;
}

/**
 * Section heading with the same hover treatment as the nav links in
 * Header.tsx: text shifts red and an underline draws in from the left on
 * hover/focus. Wraps Reveal (as="h2" by default) so scroll-reveal still
 * applies. The underline lives on a separate child span (not a second class
 * competing for `transform` on the heading itself) to avoid the Tailwind
 * same-property cascade-order bug already hit elsewhere in this codebase.
 */
export function HoverHeading({ children, className = '', index = 0, as = 'h2' }: HoverHeadingProps) {
  return (
    <Reveal
      as={as}
      index={index}
      tabIndex={0}
      className={`group relative inline-block cursor-default pb-[6px] transition-colors duration-300 hover:text-red focus-visible:text-red focus-visible:outline-none ${className}`}
    >
      {children}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-red transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />
    </Reveal>
  );
}
