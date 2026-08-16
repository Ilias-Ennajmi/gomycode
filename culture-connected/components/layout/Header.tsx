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
      <div className="flex items-center justify-between gap-3 px-[clamp(18px,4vw,52px)] py-[16px]">
        <Link
          href={localeHref(locale, '/')}
          className="font-display text-[16px] font-extrabold uppercase leading-none tracking-[-.01em] no-underline"
        >
          {wordmark}
        </Link>

        <nav className="hidden items-center gap-[26px] font-inter text-[13px] font-medium uppercase tracking-[.04em] md:flex">
          {navItems.map((item) => {
            const href = localeHref(locale, item.href);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={item.href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`no-underline ${active ? 'text-ink' : 'text-muted'}`}
              >
                {t(item.label, locale)}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-[18px] md:flex">
          <LangToggle locale={locale} />
          <ThemeToggle />
          <Link
            href={localeHref(locale, '/blog')}
            className="border border-line bg-transparent px-[18px] py-3 font-inter text-[13px] font-medium text-ink no-underline"
          >
            {t(blogNavLabel, locale)}
          </Link>
          <Link
            href="#contact"
            className="bg-red px-[18px] py-3 font-inter text-[13px] font-semibold text-white no-underline"
          >
            {t(contactNavLabel, locale)}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center border border-line text-ink transition-transform duration-150 active:scale-90 md:hidden"
        >
          <MenuIcon open={open} />
        </button>
      </div>

      {open ? (
        <div className="border-t border-line px-[clamp(18px,4vw,52px)] py-4 md:hidden">
          <nav className="flex flex-col gap-1 font-inter text-[15px] font-medium">
            {navItems.map((item) => {
              const href = localeHref(locale, item.href);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-[14px] py-[11px] no-underline transition-transform duration-150 active:scale-[0.97] ${active ? 'bg-chip text-ink' : 'text-muted'}`}
                >
                  {t(item.label, locale)}
                </Link>
              );
            })}
            <Link
              href={localeHref(locale, '/blog')}
              onClick={() => setOpen(false)}
              className="px-[14px] py-[11px] no-underline text-muted"
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
                className="bg-red px-[18px] py-3 font-inter text-[13px] font-semibold text-white no-underline"
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
