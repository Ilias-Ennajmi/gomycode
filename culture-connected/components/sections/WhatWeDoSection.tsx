'use client';

import { useState } from 'react';
import { HoverHeading } from '../ui/HoverHeading';

export interface WhatWeDoItem {
  label: string;
  bold: string;
  rest: string;
}

/**
 * Single statement of the Grow/Optimise/Increase/Push framework, given real
 * weight instead of splitting it across two near-identical grids. Hover
 * state is tracked in React (not a CSS `hover`/`group-hover` pair on the
 * same element — that combination hit a real Tailwind cascade-order bug
 * elsewhere in this codebase), so the dim/spotlight effect is deterministic.
 * `onClick` sets the same state so a tap gets the identical spotlight —
 * `hover`-only would leave touch devices with none of it. Deliberately a
 * plain set, not a toggle-off-if-already-active: a real pointer sequence
 * fires `mouseenter` immediately before `click`, so a toggle would already
 * see itself as "current" and immediately cancel back out.
 */
export function WhatWeDoSection({ heading, items }: { heading: string; items: WhatWeDoItem[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
      <HoverHeading className="mb-[clamp(28px,4vw,44px)] font-display text-[clamp(32px,4.6vw,52px)] font-extrabold leading-[1] tracking-[-.03em] text-ink">
        {heading}
      </HoverHeading>
      <div onMouseLeave={() => setHovered(null)}>
        {items.map((item, i) => {
          const dim = hovered !== null && hovered !== i;
          return (
            <div
              key={item.label}
              onMouseEnter={() => setHovered(i)}
              onClick={() => setHovered(i)}
              className="grid cursor-default grid-cols-[52px_1fr] items-baseline gap-x-4 border-t border-line py-[clamp(18px,2.6vw,30px)] transition-opacity duration-300 md:grid-cols-[80px_180px_1fr] md:gap-x-8"
              style={{ opacity: dim ? 0.4 : 1 }}
            >
              <span className="font-mono text-[12px] text-muted md:text-[13px]">0{i + 1}</span>
              <span
                className="font-display text-[26px] font-extrabold uppercase leading-none tracking-[-.02em] transition-[color,transform] duration-300 md:text-[32px]"
                style={{
                  color: hovered === i ? 'var(--red)' : 'var(--ink)',
                  transform: hovered === i ? 'translateX(6px)' : 'none',
                }}
              >
                {item.label}
              </span>
              <p className="col-span-2 m-0 mt-2 font-inter text-[15px] font-light leading-[1.5] text-ink md:col-span-1 md:mt-0 md:text-[17px]">
                <span className="font-semibold">{item.bold}</span>
                {item.rest ? ` ${item.rest}` : null}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
