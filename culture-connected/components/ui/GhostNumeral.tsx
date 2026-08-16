/**
 * Large low-opacity numeral used as a background watermark behind numbered
 * content (case-study index, process step, etc). Purely decorative.
 * `className` must include its own text color (e.g. text-ink or text-onInv)
 * so light/dark host panels both render it correctly.
 */
export function GhostNumeral({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 select-none font-display font-bold leading-none opacity-[.07] ${className}`}
    >
      {value}
    </span>
  );
}
