import type { CSSProperties } from 'react';
import { StatCounter } from './StatCounter';

interface StatTicketProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  sublabel: string;
  notchColor?: string;
  className?: string;
}

/**
 * The "headline" stat in a Proof section: a solid-red, slightly rotated
 * ticket-stub block with one notch bite, sized bigger than the plain stats
 * sitting beside it. `notchColor` should match whatever background this
 * ticket sits directly on (the page bg, or a dark panel's bg) so the notch
 * reads as a literal cutout rather than a stray circle.
 */
export function StatTicket({
  value,
  decimals,
  prefix,
  suffix,
  label,
  sublabel,
  notchColor = 'var(--bg)',
  className = '',
}: StatTicketProps) {
  return (
    <div
      className={`ticket-notch -rotate-2 rounded-[18px] bg-red px-[clamp(22px,3vw,32px)] py-[clamp(20px,2.6vw,28px)] text-white ${className}`}
      style={{ '--notch-color': notchColor } as CSSProperties}
    >
      <StatCounter
        value={value}
        decimals={decimals}
        prefix={prefix}
        suffix={suffix}
        className="font-sora text-[clamp(52px,7vw,88px)] font-bold leading-[.85] tracking-[-.05em]"
      />
      <div className="mt-[10px] font-sora text-[15px] font-medium leading-[1.35]">{label}</div>
      <div className="mt-2 font-mono text-[11px] opacity-70">{sublabel}</div>
    </div>
  );
}
