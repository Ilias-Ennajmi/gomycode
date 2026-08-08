import { PlaceholderPanel } from './PlaceholderPanel';

interface HeroMediaPanelProps {
  label: string;
  className?: string;
}

/**
 * Hero media placeholder with the label repositioned as a floating,
 * slightly rotated ticket tag overlapping the panel's bottom-left corner,
 * instead of PlaceholderPanel's default inset pill. `className` carries the
 * same sizing/margin/rounding classes a bare PlaceholderPanel would take.
 */
export function HeroMediaPanel({ label, className = '' }: HeroMediaPanelProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <PlaceholderPanel label="" className="h-full w-full" />
      </div>
      <div className="ticket-notch absolute -bottom-5 left-6 z-10 max-w-[80%] -rotate-3 rounded-[10px] border border-dashed border-line bg-surface px-5 py-3 shadow-lg md:left-10">
        <span className="font-mono text-[11px] text-muted">{label}</span>
      </div>
    </div>
  );
}
