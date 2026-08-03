import type { ElementType } from 'react';
import type { Locale } from '@/lib/i18n/config';
import { t } from '@/lib/i18n/localized';
import type { AccentHeading as AccentHeadingData } from '@/lib/content/types';

interface AccentHeadingProps {
  heading: AccentHeadingData;
  locale: Locale;
  as?: ElementType;
  className?: string;
}

export function AccentHeading({ heading, locale, as: Tag = 'h1', className = '' }: AccentHeadingProps) {
  return (
    <Tag className={`m-0 [text-wrap:balance] ${className}`}>
      {t(heading.prefix, locale)}
      <span className={heading.highlight ? 'hero-highlight' : 'text-red'}>{t(heading.accent, locale)}</span>
      {heading.suffix ? t(heading.suffix, locale) : null}
    </Tag>
  );
}
