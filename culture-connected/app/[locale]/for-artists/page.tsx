import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { forArtistsContent } from '@/core/content/forArtists';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { PlaceholderPanel } from '@/components/ui/PlaceholderPanel';
import { Reveal } from '@/components/ui/Reveal';
import { StatCounter } from '@/components/ui/StatCounter';
import { ContactSection } from '@/components/layout/ContactSection';
import { PurposeSection } from '@/components/sections/PurposeSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[0].label, locale)}` };
}

export default function ForArtistsPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = forArtistsContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(28px,4vw,48px)] pt-[clamp(48px,7vw,92px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          {t(c.eyebrow, locale)}
        </Reveal>
        <Reveal>
          <AccentHeading
            heading={c.heading}
            locale={locale}
            className="max-w-[1100px] font-sora text-[clamp(40px,7vw,96px)] font-bold leading-[.95] tracking-[-.05em] text-ink"
          />
        </Reveal>
        <div className="mt-[clamp(24px,3vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-end gap-[clamp(20px,3vw,40px)]">
          <Reveal as="p" className="m-0 max-w-[520px] font-sora text-[17px] font-light leading-[1.6] text-muted">
            {t(c.intro, locale)}
          </Reveal>
          <Reveal className="flex flex-wrap gap-[10px]">
            <Button href="#contact" variant="solid" className="px-6 py-4 text-[14px]">
              {t(c.ctaPrimary, locale)}
            </Button>
            <Button href={localeHref(locale, '/case-studies')} variant="outline" className="px-6 py-[15px] text-[14px]">
              {t(c.ctaSecondary, locale)}
            </Button>
          </Reveal>
        </div>
      </section>

      <PlaceholderPanel
        label={t(c.mediaLabel, locale)}
        className="mx-[clamp(18px,4vw,52px)] h-[clamp(200px,34vw,400px)] rounded-[clamp(18px,3vw,28px)] p-[clamp(14px,2vw,24px)]"
        labelClassName="px-[14px] py-[9px] text-[11px]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-sora text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.handleHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
          {c.handleItems.map((item, i) => (
            <Reveal key={item.number} index={i} className="rounded-3xl bg-surface p-[clamp(24px,3vw,32px)]">
              <div className="mb-4 font-mono text-[11px] text-red">{item.number}</div>
              <h3 className="m-0 mb-[10px] font-sora text-[22px] font-semibold leading-[1.15] tracking-[-.02em] text-ink">
                {t(item.heading, locale)}
              </h3>
              <p className="m-0 font-sora text-[15px] font-light leading-[1.6] text-muted">{t(item.body, locale)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <PurposeSection locale={locale} />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <div className="mb-[clamp(20px,3vw,32px)] flex flex-wrap items-baseline justify-between gap-[14px]">
          <Reveal as="h2" className="font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
            {t(c.proofHeading, locale)}
          </Reveal>
          <span className="font-mono text-[11px] text-muted">{t(c.proofNote, locale)}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {c.proofStats.map((stat, i) => (
            <Reveal
              key={stat.sublabel}
              index={i}
              as="a"
              href={`${localeHref(locale, '/case-studies')}#${stat.anchor}`}
              className="block rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] no-underline"
            >
              <StatCounter
                value={stat.value}
                decimals={stat.decimals}
                suffix={stat.suffix}
                className="font-sora text-[clamp(44px,5.4vw,62px)] font-bold leading-[.9] tracking-[-.05em] text-red"
              />
              <div className="mt-[14px] font-sora text-[16px] font-medium leading-[1.3] text-ink">{t(stat.label, locale)}</div>
              <div className="mt-[10px] font-mono text-[11px] text-muted">{stat.sublabel}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
