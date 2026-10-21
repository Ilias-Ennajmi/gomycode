'use client';

import { useState, type ReactNode } from 'react';

interface ExpandableListProps {
  items: ReactNode[];
  seeAllLabel: string;
  initialCount?: number;
  gridClassName?: string;
}

/**
 * Shows the first `initialCount` items (one fewer on mobile than desktop, so
 * a grid of e.g. 4 columns doesn't half-render its last row on narrow
 * screens), with a "See all" button revealing the rest in place. Items are
 * passed already rendered (not a render-prop) since this is a client
 * component consumed from server-component pages, which can pass JSX
 * elements as children/props but not functions.
 */
export function ExpandableList({ items, seeAllLabel, initialCount = 4, gridClassName = '' }: ExpandableListProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length <= initialCount) {
    return <div className={gridClassName}>{items}</div>;
  }

  return (
    <div>
      <div className={gridClassName}>
        {items.map((item, i) => {
          if (expanded || i < initialCount - 1) return item;
          if (i === initialCount - 1) {
            return (
              <div key={i} className="hidden md:contents">
                {item}
              </div>
            );
          }
          return null;
        })}
      </div>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-6 w-full border border-line px-6 py-[14px] text-center font-mono text-[12px] uppercase tracking-[.08em] text-ink transition-colors hover:bg-chip md:w-auto"
        >
          {seeAllLabel}
        </button>
      ) : null}
    </div>
  );
}
