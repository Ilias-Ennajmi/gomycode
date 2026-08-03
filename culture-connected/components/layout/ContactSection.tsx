import Link from 'next/link';
import { contactShared, footerContent } from '@/core/content/contact';
import { localeHref } from '@/core/i18n/paths';
import { t, type Localized } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import { Reveal } from '../ui/Reveal';
import { ContactForm } from '../ui/ContactForm';

interface ContactSectionProps {
  locale: Locale;
  heading: Localized;
}

export function ContactSection({ locale, heading }: ContactSectionProps) {
  return (
    <section
      id="contact"
      className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(34px,4vw,60px)] pt-[clamp(52px,7vw,84px)]"
    >
      <div className="grid items-center gap-[clamp(26px,4vw,52px)] rounded-[clamp(20px,3vw,30px)] bg-red p-[clamp(28px,4vw,52px)] text-white [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        <div>
          <Reveal>
            <h2 className="m-0 font-sora text-[clamp(32px,4.6vw,52px)] font-bold leading-[.98] tracking-[-.04em]">
              {t(heading, locale)}
            </h2>
          </Reveal>
          <p className="m-0 mt-[18px] font-sora text-[16px] font-light leading-[1.5] text-white/[.82]">
            {t(contactShared.note, locale)}
          </p>
        </div>
        <ContactForm locale={locale} />
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-muted">
        <Link href={localeHref(locale, '/')} className="no-underline">
          {footerContent.domain}
        </Link>
        <span>{footerContent.city}</span>
        <a href={footerContent.instagramUrl} className="no-underline">
          {footerContent.instagramHandle}
        </a>
      </div>
    </section>
  );
}
