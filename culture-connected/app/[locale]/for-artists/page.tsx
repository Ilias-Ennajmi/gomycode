import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { forArtistsContent } from '@/core/content/forArtists';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { HeroMediaPanel } from '@/components/ui/HeroMediaPanel';
import { Reveal } from '@/components/ui/Reveal';
import { StatCounter } from '@/components/ui/StatCounter';
import { ServiceIcon } from '@/components/ui/ServiceIcon';
import { Marquee } from '@/components/ui/Marquee';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { StatTicket } from '@/components/ui/StatTicket';
import { MobileCarousel } from '@/components/ui/MobileCarousel';
import { ContactSection } from '@/components/layout/ContactSection';
import { PurposeSection } from '@/components/sections/PurposeSection';
import { homeContent } from '@/core/content/home';
import type { Localized } from '@/core/i18n/localized';
import type { ServiceIconName } from '@/components/ui/ServiceIcon';

interface HandleItem {
  number: string;
  icon: ServiceIconName;
  heading: Localized;
  body: Localized;
}

function HandleCard({
  item,
  locale,
  className = '',
}: {
  item: HandleItem;
  locale: Locale;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] text-ink ${className}`}>
      <div className="mb-4 flex items-center gap-3">
        <ServiceIcon name={item.icon} className="h-6 w-6 text-red" />
        <span className="font-mono text-[11px] text-red">{item.number}</span>
      </div>
      <h3 className="m-0 mb-[10px] font-sora text-[22px] font-semibold leading-[1.15] tracking-[-.02em]">
        {t(item.heading, locale)}
      </h3>
      <p className="m-0 font-sora text-[15px] font-light leading-[1.6] opacity-70">{t(item.body, locale)}</p>
    </div>
  );
}

function ArtistRow() {
  return (
    <div className="flex items-center gap-8 pr-8">
      {homeContent.roster.artists.chips.map((name, i) => (
        <span key={i} className="flex items-center gap-3">
          <span className="placeholder-stripes h-10 w-10 flex-none rounded-full" />
          <span className="whitespace-nowrap font-sora text-[14px] font-medium text-ink">{name}</span>
        </span>
      ))}
    </div>
  );
}

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
        <div>
          <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
            <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
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
        </div>
      </section>

      <HeroMediaPanel
        label={t(c.mediaLabel, locale)}
        className="mx-[clamp(18px,4vw,52px)] h-[clamp(140px,34vw,400px)] rounded-[clamp(18px,3vw,28px)]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-sora text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.handleHeading, locale)}
        </Reveal>
        <div className="flex flex-col gap-4">
          <Reveal index={0} className="rounded-3xl bg-inv p-[clamp(24px,3vw,32px)] text-onInv">
            <div className="mb-4 flex items-center gap-3">
              <ServiceIcon name={c.handleItems[0].icon} className="h-6 w-6 text-red" />
              <span className="font-mono text-[11px] text-red">{c.handleItems[0].number}</span>
            </div>
            <h3 className="m-0 mb-[10px] font-sora text-[22px] font-semibold leading-[1.15] tracking-[-.02em]">
              {t(c.handleItems[0].heading, locale)}
            </h3>
            <p className="m-0 max-w-[520px] font-sora text-[15px] font-light leading-[1.6] opacity-70">
              {t(c.handleItems[0].body, locale)}
            </p>
          </Reveal>
          <div className="hidden md:grid md:grid-cols-[repeat(auto-fit,minmax(360px,1fr))] md:gap-4">
            {c.handleItems.slice(1).map((item, i) => (
              <Reveal key={item.number} index={i + 1}>
                <HandleCard item={item} locale={locale} />
              </Reveal>
            ))}
          </div>
          <MobileCarousel count={c.handleItems.length - 1}>
            {c.handleItems.slice(1).map((item, i) => (
              <Reveal key={item.number} index={i + 1} className="w-[86vw] max-w-[340px] flex-none snap-start">
                <HandleCard item={item} locale={locale} />
              </Reveal>
            ))}
          </MobileCarousel>
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
        <div className="flex flex-wrap items-start gap-4">
          <Reveal
            key={c.proofStats[0].sublabel}
            index={0}
            as="a"
            href={`${localeHref(locale, '/case-studies')}#${c.proofStats[0].anchor}`}
            className="block flex-none no-underline transition-transform duration-150 active:scale-[0.97]"
          >
            <StatTicket
              value={c.proofStats[0].value}
              decimals={c.proofStats[0].decimals}
              suffix={c.proofStats[0].suffix}
              label={t(c.proofStats[0].label, locale)}
              sublabel={c.proofStats[0].sublabel}
            />
          </Reveal>
          {c.proofStats.slice(1).map((stat, i) => (
            <Reveal
              key={stat.sublabel}
              index={i + 1}
              as="a"
              href={`${localeHref(locale, '/case-studies')}#${stat.anchor}`}
              className="block min-w-[220px] flex-1 self-center rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] no-underline transition-transform duration-150 active:scale-[0.97]"
            >
              <StatCounter
                value={stat.value}
                decimals={stat.decimals}
                suffix={stat.suffix}
                className="font-sora text-[clamp(38px,4.4vw,52px)] font-bold leading-[.9] tracking-[-.05em] text-red"
              />
              <div className="mt-[14px] font-sora text-[16px] font-medium leading-[1.3] text-ink">{t(stat.label, locale)}</div>
              <div className="mt-[10px] font-mono text-[11px] text-muted">{stat.sublabel}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <Marquee
        row={<ArtistRow />}
        durationClass="animate-marq-32"
        className="mt-[clamp(52px,7vw,84px)] bg-surface py-[22px]"
      />

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
