'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/core/i18n/config';

/**
 * Real route-based language switch: swaps the /en or /fr path segment and
 * keeps the rest of the URL, instead of the prototype's innerHTML swap.
 */
export function LangToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname() || `/${locale}`;
  const rest = pathname.split('/').slice(2).join('/');

  const hrefFor = (target: Locale) => `/${target}${rest ? `/${rest}` : ''}`;

  return (
    <Link
      href={hrefFor(locale === 'fr' ? 'en' : 'fr')}
      className="flex items-center gap-[5px] font-mono text-[11px] text-ink no-underline"
    >
      <span style={{ opacity: locale === 'en' ? 1 : 0.35 }}>EN</span>
      <span className="opacity-30">/</span>
      <span style={{ opacity: locale === 'fr' ? 1 : 0.35 }}>FR</span>
    </Link>
  );
}
