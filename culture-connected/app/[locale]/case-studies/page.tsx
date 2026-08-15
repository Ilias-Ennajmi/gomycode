import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { caseStudiesPageContent, caseStudies } from '@/core/content/caseStudies';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Reveal } from '@/components/ui/Reveal';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { ContactSection } from '@/components/layout/ContactSection';
import { CaseStudyCard } from '@/components/sections/CaseStudyCard';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[3].label, locale)}` };
}

export default function CaseStudiesPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = caseStudiesPageContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(24px,3vw,40px)] pt-[clamp(48px,7vw,92px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
        </Reveal>
        <Reveal>
          <AccentHeading
            heading={c.heading}
            locale={locale}
            className="max-w-[1000px] text-[clamp(40px,7vw,96px)] font-bold leading-[.95] tracking-[-.05em] text-ink"
          />
        </Reveal>
        <Reveal as="p" className="m-0 mt-[clamp(20px,3vw,34px)] max-w-[560px] font-sora text-[17px] font-light leading-[1.6] text-muted">
          {t(c.intro, locale)}
        </Reveal>
        <Reveal className="mt-[clamp(22px,3vw,34px)] flex flex-wrap gap-2 font-sora text-[13px]">
          {caseStudies.map((study) => (
            <a
              key={study.anchor}
              href={`#${study.anchor}`}
              className="rounded-full bg-chip px-[15px] py-[10px] no-underline"
            >
              {study.name}
            </a>
          ))}
        </Reveal>
      </section>

      {caseStudies.map((study) => (
        <CaseStudyCard key={study.anchor} study={study} locale={locale} />
      ))}

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
