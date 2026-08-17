import Link from 'next/link';
import { navItems, wordmark } from '@/core/content/nav';
import { footerCopy } from '@/core/content/footer';
import { footerContent } from '@/core/content/contact';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';

export function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] py-[clamp(40px,6vw,64px)]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[clamp(28px,4vw,48px)]">
          <div className="max-w-[360px]">
            <Link
              href={localeHref(locale, '/')}
              className="font-inter text-[15px] font-bold leading-none tracking-[-.02em] text-ink no-underline"
            >
              {wordmark}
            </Link>
            <p className="m-0 mt-4 font-inter text-[14px] font-light leading-[1.55] text-muted">
              {t(footerCopy.tagline, locale)}
            </p>
          </div>

          <div>
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[.1em] text-muted">
              {t(footerCopy.pagesHeading, locale)}
            </div>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0 font-inter text-[14px]">
              <li>
                <Link href={localeHref(locale, '/')} className="text-ink no-underline">
                  {t(footerCopy.homeLabel, locale)}
                </Link>
              </li>
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={localeHref(locale, item.href)} className="text-ink no-underline">
                    {t(item.label, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[.1em] text-muted">
              {t(footerCopy.contactHeading, locale)}
            </div>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0 font-inter text-[14px]">
              <li>
                <a href="#contact" className="text-ink no-underline">
                  {t(footerCopy.contactLabel, locale)}
                </a>
              </li>
              <li>
                <a href={`mailto:${footerContent.email}`} className="text-ink no-underline">
                  {footerContent.email}
                </a>
              </li>
              <li>
                <a href={`tel:${footerContent.phone.replace(/\s+/g, '')}`} className="text-ink no-underline">
                  {footerContent.phone}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[.1em] text-muted">
              {t(footerCopy.followHeading, locale)}
            </div>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0 font-inter text-[14px]">
              <li>
                <a href={footerContent.instagramUrl} className="text-ink no-underline">
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-[clamp(36px,5vw,56px)] overflow-hidden">
          <div className="whitespace-nowrap font-display text-[clamp(52px,11vw,180px)] font-extrabold uppercase leading-[.85] tracking-[-.03em] text-ink/[.08]">
            {wordmark}
          </div>
        </div>

        <div className="mt-[clamp(20px,3vw,32px)] flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 font-mono text-[11px] text-muted">
          <span>{footerContent.domain}</span>
          <span>{footerContent.city}</span>
          <a href={footerContent.instagramUrl} className="no-underline">
            {footerContent.instagramHandle}
          </a>
        </div>
      </div>
    </footer>
  );
}
