import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';
import { blogContent } from '@/core/content/blog';
import { blogNavLabel } from '@/core/content/nav';
import { footerContent } from '@/core/content/contact';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Reveal } from '@/components/ui/Reveal';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { ContactSection } from '@/components/layout/ContactSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(blogNavLabel, locale)}` };
}

export default function BlogPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = blogContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(28px,4vw,48px)] pt-[clamp(56px,7.6vw,100px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
        </Reveal>
        <Reveal>
          <AccentHeading
            heading={c.heading}
            locale={locale}
            className="max-w-[1000px] text-[clamp(42px,7.2vw,100px)] font-extrabold leading-[.94] tracking-[-.03em] text-ink"
          />
        </Reveal>
        <Reveal as="p" className="m-0 mt-[clamp(20px,3vw,34px)] max-w-[600px] font-inter text-[17px] font-light leading-[1.6] text-muted">
          {t(c.intro, locale)}
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
          {t(c.postsHeading, locale)}
        </Reveal>
        <Reveal className="border border-line bg-surface p-[clamp(28px,5vw,52px)] text-center">
          <h3 className="m-0 font-inter text-[clamp(20px,2.6vw,26px)] font-semibold leading-[1.3] text-ink">
            {t(c.comingSoonHeading, locale)}
          </h3>
          <p className="mx-auto m-0 mt-3 max-w-[480px] font-inter text-[15px] font-light leading-[1.6] text-muted">
            {t(c.comingSoonBody, locale)}
          </p>
          <a
            href={footerContent.instagramUrl}
            className="mt-5 inline-block font-mono text-[12px] text-red no-underline"
          >
            {footerContent.instagramHandle} →
          </a>
        </Reveal>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
