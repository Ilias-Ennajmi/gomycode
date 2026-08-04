import type { ReactNode } from 'react';

export type ServiceIconName =
  | 'video'
  | 'social'
  | 'website'
  | 'artwork'
  | 'epk'
  | 'audience'
  | 'streams'
  | 'release'
  | 'touring'
  | 'retarget'
  | 'lookalike';

const icons: Record<ServiceIconName, ReactNode> = {
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
    </>
  ),
  social: (
    <>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="17" cy="6" r="2.2" />
      <circle cx="17" cy="18" r="2.2" />
      <path d="M8 11l7-4M8 13l7 4" />
    </>
  ),
  website: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18" />
      <circle cx="6.3" cy="7.2" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="8.3" cy="7.2" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  artwork: (
    <>
      <circle cx="9" cy="12" r="6" />
      <rect x="9" y="6" width="10" height="10" rx="2" />
    </>
  ),
  epk: (
    <>
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 15h6M9 9h3" />
    </>
  ),
  audience: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M4 20c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M14.5 20c.3-2.6 1.8-4.3 3.5-4.3" />
    </>
  ),
  streams: <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />,
  release: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" />
    </>
  ),
  touring: (
    <>
      <path d="M12 21s7-7.2 7-12a7 7 0 10-14 0c0 4.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </>
  ),
  retarget: (
    <>
      <path d="M4 12a8 8 0 0113.66-5.66M20 12a8 8 0 01-13.66 5.66" />
      <path d="M17 3v4h-4M7 21v-4h4" />
    </>
  ),
  lookalike: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <circle cx="12" cy="15" r="3" />
    </>
  ),
};

/**
 * Hand-rolled line-icon set (no icon library), matching the stroke
 * convention already established by ArrowIcon in CaseStudiesPreview.tsx.
 */
export function ServiceIcon({ name, className = 'h-6 w-6' }: { name: ServiceIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}
