import Link from 'next/link';
import { navItems, wordmark } from '@/core/content/nav';
import { footerCopy } from '@/core/content/footer';
import { footerContent } from '@/core/content/contact';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" />
    </svg>
  );
}

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
            <a
              href={footerContent.instagramUrl}
              aria-label="Instagram"
              className="flex h-11 w-11 items-center justify-center border border-line text-ink no-underline transition-colors duration-150 hover:border-ink active:scale-90"
            >
              <InstagramIcon />
            </a>
          </div>
        </div>

        <div className="mt-[clamp(36px,5vw,56px)] overflow-hidden">
          <div className="font-display text-[clamp(28px,7.4vw,130px)] font-extrabold uppercase leading-[.9] tracking-[-.03em] text-ink/[.08]">
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
