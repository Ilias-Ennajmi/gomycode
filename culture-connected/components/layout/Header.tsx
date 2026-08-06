'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems, wordmark, contactNavLabel, blogNavLabel } from '@/core/content/nav';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LangToggle } from '../ui/LangToggle';

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Header({ locale }: { locale: Locale }) {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="flex items-center justify-between gap-3 px-[clamp(18px,4vw,52px)] py-[14px]">
        <Link
          href={localeHref(locale, '/')}
          className="font-sora text-[15px] font-bold leading-none tracking-[-.02em] no-underline"
        >
          {wordmark}
        </Link>

        <nav className="hidden flex-wrap gap-1 rounded-full bg-chip p-[5px] font-sora text-[13px] font-medium md:flex">
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

        <div className="hidden items-center gap-[10px] md:flex">
          <LangToggle locale={locale} />
          <ThemeToggle />
          <Link
            href={localeHref(locale, '/blog')}
            className="rounded-full border border-line bg-transparent px-[18px] py-3 font-sora text-[13px] font-medium text-ink no-underline"
          >
            {t(blogNavLabel, locale)}
          </Link>
          <Link
            href="#contact"
            className="rounded-full bg-inv px-[18px] py-3 font-sora text-[13px] font-semibold text-onInv no-underline"
          >
            {t(contactNavLabel, locale)}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border border-line text-ink md:hidden"
        >
          <MenuIcon open={open} />
        </button>
      </div>

      {open ? (
        <div className="border-t border-line px-[clamp(18px,4vw,52px)] py-4 md:hidden">
          <nav className="flex flex-col gap-1 font-sora text-[15px] font-medium">
            {navItems.map((item) => {
              const href = localeHref(locale, item.href);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-[14px] py-[11px] no-underline ${active ? 'bg-chip text-ink' : 'text-muted'}`}
                >
                  {t(item.label, locale)}
                </Link>
              );
            })}
            <Link
              href={localeHref(locale, '/blog')}
              onClick={() => setOpen(false)}
              className="rounded-xl px-[14px] py-[11px] no-underline text-muted"
            >
              {t(blogNavLabel, locale)}
            </Link>
          </nav>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <LangToggle locale={locale} />
            <div className="flex items-center gap-[10px]">
              <ThemeToggle />
              <Link
                href="#contact"
                onClick={() => setOpen(false)}
                className="rounded-full bg-inv px-[18px] py-3 font-sora text-[13px] font-semibold text-onInv no-underline"
              >
                {t(contactNavLabel, locale)}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
