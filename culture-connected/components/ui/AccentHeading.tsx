import type { ElementType } from 'react';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';
import type { AccentHeading as AccentHeadingData } from '@/core/content/types';

interface AccentHeadingProps {
  heading: AccentHeadingData;
  locale: Locale;
  as?: ElementType;
  className?: string;
}

export function AccentHeading({ heading, locale, as: Tag = 'h1', className = '' }: AccentHeadingProps) {
  return (
    <Tag className={`m-0 font-display [text-wrap:balance] ${className}`}>
      {t(heading.prefix, locale)}
      <span className="text-red">{t(heading.accent, locale)}</span>
      {heading.suffix ? t(heading.suffix, locale) : null}
      {heading.mutedSuffix ? <span className="text-muted"> {t(heading.mutedSuffix, locale)}</span> : null}
    </Tag>
  );
}
