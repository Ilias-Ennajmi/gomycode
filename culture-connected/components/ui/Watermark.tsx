import type { ReactNode } from 'react';

/**
 * Huge, low-opacity decorative text bleeding behind a hero section's
 * content. Desktop-only (hidden below md) so it never competes with the
 * tightened-up mobile hero space. The parent hero <section> needs
 * `relative overflow-hidden` for this to sit correctly behind the content.
 */
export function Watermark({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-0 hidden select-none whitespace-nowrap font-sora text-[clamp(120px,22vw,340px)] font-bold uppercase leading-none tracking-[-.03em] text-ink opacity-[.05] md:block ${className}`}
    >
      {children}
    </div>
  );
}
