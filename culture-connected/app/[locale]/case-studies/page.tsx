import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n/config';
import { localeHref } from '@/lib/i18n/paths';
import { t } from '@/lib/i18n/localized';
import { caseStudiesPageContent, caseStudies } from '@/lib/content/caseStudies';
import { navItems } from '@/lib/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { PlaceholderPanel } from '@/components/ui/PlaceholderPanel';
import { Reveal } from '@/components/ui/Reveal';
import { StatCounter } from '@/components/ui/StatCounter';
import { ContactSection } from '@/components/layout/ContactSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[2].label, locale)}` };
}

export default function CaseStudiesPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = caseStudiesPageContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(24px,3vw,40px)] pt-[clamp(48px,7vw,92px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          {t(c.eyebrow, locale)}
        </Reveal>
        <Reveal>
          <AccentHeading
            heading={c.heading}
            locale={locale}
            className="max-w-[1000px] font-sora text-[clamp(40px,7vw,96px)] font-bold leading-[.95] tracking-[-.05em] text-ink"
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
        <section
          key={study.anchor}
          id={study.anchor}
          className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(34px,5vw,64px)]"
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[clamp(22px,3vw,44px)] border-t border-line pt-[clamp(24px,3vw,38px)]">
            <Reveal>
              <div className="mb-[14px] font-mono text-[11px] tracking-[.12em] text-red">
                {study.index} / {study.category}
              </div>
              <h2 className="m-0 mb-2 font-sora text-[clamp(30px,4vw,48px)] font-bold leading-none tracking-[-.04em] text-ink">
                {study.name}
              </h2>
              <p className="m-0 mb-6 font-sora text-[16px] font-light leading-[1.6] text-muted">
                {t(study.summary, locale)}
              </p>
              <PlaceholderPanel
                label={t(study.imageLabel, locale)}
                className="h-[clamp(160px,22vw,260px)] rounded-[20px] p-4"
                labelClassName="px-3 py-2 text-[11px]"
              />
            </Reveal>
            <Reveal className="flex flex-col gap-[22px]">
              <div>
                <div className="mb-2 font-mono text-[11px] text-muted">OBJECTIVE</div>
                <p className="m-0 font-sora text-[16px] font-light leading-[1.6] text-ink">{t(study.objective, locale)}</p>
              </div>
              <div>
                <div className="mb-2 font-mono text-[11px] text-muted">WHAT WE DID</div>
                <p className="m-0 font-sora text-[16px] font-light leading-[1.6] text-ink">{t(study.whatWeDid, locale)}</p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 border-t border-line pt-5">
                {study.stats.map((stat) => (
                  <div key={stat.label.en}>
                    <StatCounter
                      value={stat.value}
                      decimals={stat.decimals}
                      prefix={stat.prefix}
                      suffix={stat.suffix}
                      className="font-sora text-[clamp(34px,4vw,46px)] font-bold leading-[.9] tracking-[-.04em] text-red"
                    />
                    <div className="mt-2 font-sora text-[13px] font-normal leading-[1.35] text-muted">
                      {t(stat.label, locale)}
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
