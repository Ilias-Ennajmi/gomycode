import type { ReactNode } from 'react';

interface NumberedRowProps {
  number: string;
  heading: ReactNode;
  body?: ReactNode;
  className?: string;
}

/**
 * Flat numbered list row: number, heading, body, thin top divider. No icon,
 * no background panel, no color shape — replaces the icon-in-card and
 * colored-marker patterns site-wide.
 */
export function NumberedRow({ number, heading, body, className = '' }: NumberedRowProps) {
  return (
    <div className={`border-t border-line pt-4 md:pt-5 ${className}`}>
      <div className="mb-[10px] font-mono text-[11px] text-muted">{number}</div>
      <h3 className="m-0 mb-2 font-inter text-[18px] font-semibold leading-[1.25] tracking-[-.01em] text-ink md:text-[20px]">
        {heading}
      </h3>
      {body ? (
        <p className="m-0 font-inter text-[14px] font-light leading-[1.6] text-muted md:text-[15px]">{body}</p>
      ) : null}
    </div>
  );
}
