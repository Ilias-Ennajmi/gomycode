/** Small angled accent mark (three parallel diagonal lines), used next to eyebrow labels. */
export function DiagonalStripe({ className = 'h-[9px] w-4 text-red' }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 14" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 13L10 1M12 13L17 1M19 13L24 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
