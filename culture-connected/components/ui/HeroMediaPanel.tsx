import { PlaceholderPanel } from './PlaceholderPanel';

interface HeroMediaPanelProps {
  label: string;
  className?: string;
}

/**
 * Hero media placeholder with the label as a small tag docked in the
 * bottom-left corner. `className` carries the same sizing/margin classes a
 * bare PlaceholderPanel would take.
 */
export function HeroMediaPanel({ label, className = '' }: HeroMediaPanelProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 overflow-hidden">
        <PlaceholderPanel label="" className="h-full w-full" />
      </div>
      <div className="absolute bottom-5 left-5 z-10 max-w-[80%] border border-line bg-surface px-5 py-3 md:left-8">
        <span className="font-mono text-[11px] text-muted">{label}</span>
      </div>
    </div>
  );
}
