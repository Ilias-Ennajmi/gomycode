/**
 * Small hand-rolled signature mark (a four-point sparkle), following the
 * codebase's no-icon-library convention (ServiceIcon.tsx, PillarMarker.tsx).
 * Used sparingly as a decorative accent next to key eyebrows/headings.
 */
export function BrandMark({ className = 'h-4 w-4 text-red' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2c.9 4.2 2.3 6.9 4.2 8.2 1.9 1.3 4.4 1.9 7.8 1.8-3.4.4-5.9 1.3-7.8 2.8-1.9 1.5-3.3 3.9-4.2 7.2-.9-3.3-2.3-5.7-4.2-7.2-1.9-1.5-4.4-2.4-7.8-2.8 3.4.1 5.9-.5 7.8-1.8C9.7 8.9 11.1 6.2 12 2z" />
    </svg>
  );
}
