interface PlaceholderPanelProps {
  label: string;
  className?: string;
  labelClassName?: string;
}

/**
 * Striped placeholder slot standing in for video/photo assets the client has
 * not supplied yet (hero footage, press shots, case study creative, portraits).
 * Never render invented imagery here - only this labelled stripe pattern.
 */
export function PlaceholderPanel({ label, className = '', labelClassName = '' }: PlaceholderPanelProps) {
  return (
    <div className={`placeholder-stripes flex items-end ${className}`}>
      {label ? <span className={`rounded-full bg-bg font-mono text-muted ${labelClassName}`}>{label}</span> : null}
    </div>
  );
}
