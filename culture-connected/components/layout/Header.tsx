'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems, wordmark, contactNavLabel } from '@/lib/content/nav';
import { localeHref } from '@/lib/i18n/paths';
import { t } from '@/lib/i18n/localized';
import type { Locale } from '@/lib/i18n/config';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LangToggle } from '../ui/LangToggle';

export function Header({ locale }: { locale: Locale }) {
  const pathname = usePathname() || '/';

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-[clamp(18px,4vw,52px)] py-[14px]">
      <Link
        href={localeHref(locale, '/')}
        className="font-sora text-[15px] font-bold leading-none tracking-[-.02em] no-underline"
      >
        {wordmark}
      </Link>
      <nav className="flex flex-wrap gap-1 rounded-full bg-chip p-[5px] font-sora text-[13px] font-medium">
        {navItems.map((item) => {
          const href = localeHref(locale, item.href);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.href}
              href={href}
              className={`rounded-full px-[15px] py-[9px] no-underline ${active ? 'bg-surface text-ink' : 'text-muted'}`}
            >
              {t(item.label, locale)}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-[10px]">
        <LangToggle locale={locale} />
        <ThemeToggle />
        <Link
          href="#contact"
          className="rounded-full bg-inv px-[18px] py-3 font-sora text-[13px] font-semibold text-onInv no-underline"
        >
          {t(contactNavLabel, locale)}
        </Link>
      </div>
    </header>
  );
}
